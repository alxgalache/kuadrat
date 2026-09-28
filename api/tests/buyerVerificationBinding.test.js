/**
 * Draws and auctions: the email proof travels with whoever obtained it, and
 * every Stripe SetupIntent is bound to the buyer and the draw/auction it
 * authorises (Change: enforce-verification-gates).
 *
 * Before: register-buyer accepted any email without looking at the OTP, and
 * for an email that already had a buyer it returned that buyer — in auctions
 * with their bid password. /bid only asks for the buyer id, so anyone who
 * knew a bidder's email could bid on their saved card. confirm-payment took
 * any SetupIntent id, completed or not, so a buyer could bid or enter a draw
 * with no card at all. Stripe is mocked; everything else is real.
 */

jest.mock('../services/stripeService');

const request = require('supertest');
const { randomUUID } = require('crypto');
const { app } = require('./helpers/app');
const { db } = require('../config/database');
const emailService = require('../services/emailService');
const stripeService = require('../services/stripeService');

let drawId;
let otherDrawId;
let auctionId;
let otherAuctionId;

function validDni() {
  const n = 10000000 + Math.floor(Math.random() * 89999999);
  return `${n}${'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23]}`;
}

const emailFor = (label) => `buyer-${label}-${randomUUID().slice(0, 8)}@test.com`;

async function createDraw() {
  const id = randomUUID();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO draws (id, name, product_id, product_type, price, max_participations,
                             start_datetime, end_datetime, status)
          VALUES (?, ?, 1, 'art', 100, 100, ?, ?, 'active')`,
    args: [id, `Sorteo ${id.slice(0, 8)}`, new Date(now - 3600000).toISOString(), new Date(now + 86400000).toISOString()],
  });
  return id;
}

async function createAuction() {
  const id = randomUUID();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO auctions (id, name, start_datetime, end_datetime, status)
          VALUES (?, ?, ?, ?, 'active')`,
    args: [id, `Subasta ${id.slice(0, 8)}`, new Date(now - 3600000).toISOString(), new Date(now + 86400000).toISOString()],
  });
  return id;
}

/** Last 6-digit code emailed to `to`, read from the noop transport's outbox. */
function lastCodeSentTo(to) {
  const message = emailService.__getOutbox().filter((m) => m.to === to).pop();
  const match = message?.html?.match(/>(\d{6})<\/p>/);
  return match ? match[1] : null;
}

/** send-verification + verify-email over HTTP; returns the verificationToken. */
async function verify(kind, scopeId, email, dni) {
  await request(app).post(`/api/${kind}/${scopeId}/send-verification`).send({ email, dni });
  const res = await request(app)
    .post(`/api/${kind}/${scopeId}/verify-email`)
    .send({ email, code: lastCodeSentTo(email) });
  return res.body.verificationToken;
}

function registerBuyer(kind, scopeId, { email, dni, verificationToken }) {
  return request(app)
    .post(`/api/${kind}/${scopeId}/register-buyer`)
    .send({ firstName: 'Berta', lastName: 'Compradora', email, dni, verificationToken });
}

beforeAll(async () => {
  drawId = await createDraw();
  otherDrawId = await createDraw();
  auctionId = await createAuction();
  otherAuctionId = await createAuction();
});

beforeEach(() => {
  emailService.__clearOutbox();
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------------

describe.each([
  ['draws', () => drawId, () => otherDrawId],
  ['auctions', () => auctionId, () => otherAuctionId],
])('%s: register-buyer demands the verificationToken', (kind, scope, otherScope) => {
  it('verify-email returns a token, and register-buyer accepts it', async () => {
    const email = emailFor(`${kind}-ok`);
    const dni = validDni();
    const verificationToken = await verify(kind, scope(), email, dni);

    expect(verificationToken).toMatch(/^[0-9a-f]{64}$/);
    const res = await registerBuyer(kind, scope(), { email, dni, verificationToken });
    expect(res.statusCode).toBe(200);
    expect(res.body.buyer.id).toBeTruthy();
  });

  it('without a token → 403 VERIFICATION_REQUIRED', async () => {
    const res = await registerBuyer(kind, scope(), { email: emailFor(`${kind}-none`), dni: validDni() });
    expect(res.statusCode).toBe(403);
    expect(res.body.title).toBe('VERIFICATION_REQUIRED');
  });

  it('with a token issued for another email → 403', async () => {
    const verificationToken = await verify(kind, scope(), emailFor(`${kind}-mine`), validDni());
    const res = await registerBuyer(kind, scope(), {
      email: emailFor(`${kind}-theirs`), dni: validDni(), verificationToken,
    });
    expect(res.statusCode).toBe(403);
  });

  it(`with a token issued for another ${kind === 'draws' ? 'draw' : 'auction'} → 403`, async () => {
    const email = emailFor(`${kind}-cross`);
    const dni = validDni();
    const verificationToken = await verify(kind, otherScope(), email, dni);
    const res = await registerBuyer(kind, scope(), { email, dni, verificationToken });
    expect(res.statusCode).toBe(403);
  });

  it('with a token older than 60 minutes → 403', async () => {
    const email = emailFor(`${kind}-stale`);
    const dni = validDni();
    const verificationToken = await verify(kind, scope(), email, dni);
    const table = kind === 'draws' ? 'draw_email_verifications' : 'auction_email_verifications';
    await db.execute({
      sql: `UPDATE ${table} SET verified_at = datetime('now', '-61 minutes') WHERE email = ?`,
      args: [email],
    });

    const res = await registerBuyer(kind, scope(), { email, dni, verificationToken });
    expect(res.statusCode).toBe(403);
  });

  it('a resend inside 30 s → 400 OTP_RESEND_TOO_SOON', async () => {
    const email = emailFor(`${kind}-cooldown`);
    const dni = validDni();
    const first = await request(app).post(`/api/${kind}/${scope()}/send-verification`).send({ email, dni });
    const second = await request(app).post(`/api/${kind}/${scope()}/send-verification`).send({ email, dni });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    expect(second.body.title).toBe('OTP_RESEND_TOO_SOON');
  });
});

describe('auctions: an existing bidder cannot be impersonated', () => {
  it("typing their email without a token returns neither their id nor their bid password", async () => {
    const email = emailFor('victim');
    const dni = validDni();
    const verificationToken = await verify('auctions', auctionId, email, dni);
    const victim = await registerBuyer('auctions', auctionId, { email, dni, verificationToken });
    expect(victim.statusCode).toBe(200);

    const attacker = await registerBuyer('auctions', auctionId, { email, dni: validDni() });

    expect(attacker.statusCode).toBe(403);
    expect(JSON.stringify(attacker.body)).not.toContain(victim.body.buyer.id);
    expect(attacker.body.buyer).toBeUndefined();
  });

  it('a bidder stored with capitals before normalisation can still log in', async () => {
    const buyerId = randomUUID();
    await db.execute({
      sql: `INSERT INTO auction_buyers (id, auction_id, first_name, last_name, email, dni, bid_password)
            VALUES (?, ?, 'Lola', 'Legado', ?, ?, 'ABC234')`,
      args: [buyerId, auctionId, `Legacy-${buyerId.slice(0, 6)}@Ejemplo.com`, validDni()],
    });

    const res = await request(app)
      .post(`/api/auctions/${auctionId}/verify-buyer`)
      .send({ email: `legacy-${buyerId.slice(0, 6)}@ejemplo.com`, bidPassword: 'ABC234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.buyer.id).toBe(buyerId);
    expect(res.body.hasPaymentMethod).toBe(false);
  });
});

// ---------------------------------------------------------------------------

async function insertBuyer(kind, scopeId) {
  const id = randomUUID();
  if (kind === 'draws') {
    await db.execute({
      sql: `INSERT INTO draw_buyers (id, draw_id, first_name, last_name, email, bid_password, dni)
            VALUES (?, ?, 'Dora', 'Dueña', ?, '', ?)`,
      args: [id, scopeId, emailFor('draw-buyer'), validDni()],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO auction_buyers (id, auction_id, first_name, last_name, email, dni, bid_password)
            VALUES (?, ?, 'Aldo', 'Dueño', ?, ?, 'XYZ789')`,
      args: [id, scopeId, emailFor('auction-buyer'), validDni()],
    });
  }
  return id;
}

describe.each([
  ['draws', 'drawBuyerId', 'draw_buyer_id', 'draw_id', () => drawId, () => otherDrawId],
  ['auctions', 'auctionBuyerId', 'auction_buyer_id', 'auction_id', () => auctionId, () => otherAuctionId],
])('%s: confirm-payment binds the SetupIntent', (kind, bodyKey, buyerMetaKey, scopeMetaKey, scope, otherScope) => {
  const setupIntent = (buyerId, scopeId, overrides = {}) => ({
    id: `seti_${randomUUID().slice(0, 12)}`,
    status: 'succeeded',
    payment_method: 'pm_test',
    customer: 'cus_from_setup_intent',
    metadata: { [buyerMetaKey]: buyerId, [scopeMetaKey]: scopeId },
    ...overrides,
  });

  const confirmPayment = (scopeId, buyerId, si, extraBody = {}) => {
    stripeService.retrieveSetupIntent.mockResolvedValue(si);
    stripeService.retrievePaymentMethod.mockResolvedValue({ billing_details: { name: 'X' }, card: { last4: '4242' } });
    return request(app)
      .post(`/api/${kind}/${scopeId}/confirm-payment`)
      .send({ [bodyKey]: buyerId, setupIntentId: si.id, ...extraBody });
  };

  const paymentRows = async (buyerId) => {
    const table = kind === 'draws' ? 'draw_authorised_payment_data' : 'auction_authorised_payment_data';
    const res = await db.execute({ sql: `SELECT * FROM ${table} WHERE ${buyerMetaKey} = ?`, args: [buyerId] });
    return res.rows;
  };

  it('an incomplete SetupIntent → 400 SETUP_NOT_SUCCEEDED, nothing stored', async () => {
    const buyerId = await insertBuyer(kind, scope());
    const res = await confirmPayment(scope(), buyerId, setupIntent(buyerId, scope(), {
      status: 'requires_payment_method', payment_method: null,
    }));
    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('SETUP_NOT_SUCCEEDED');
    expect(await paymentRows(buyerId)).toHaveLength(0);
  });

  it("another buyer's SetupIntent → 400 SETUP_MISMATCH", async () => {
    const buyerId = await insertBuyer(kind, scope());
    const res = await confirmPayment(scope(), buyerId, setupIntent(randomUUID(), scope()));
    expect(res.statusCode).toBe(400);
    expect(res.body.title).toBe('SETUP_MISMATCH');
  });

  it('a buyer of another draw/auction → 404', async () => {
    const buyerId = await insertBuyer(kind, otherScope());
    const res = await confirmPayment(scope(), buyerId, setupIntent(buyerId, scope()));
    expect(res.statusCode).toBe(404);
  });

  it("stores the SetupIntent's customer, ignoring the body's customerId", async () => {
    const buyerId = await insertBuyer(kind, scope());
    const res = await confirmPayment(scope(), buyerId, setupIntent(buyerId, scope()), { customerId: 'cus_from_body' });
    expect(res.statusCode).toBe(200);
    const rows = await paymentRows(buyerId);
    expect(rows).toHaveLength(1);
    expect(rows[0].stripe_customer_id).toBe('cus_from_setup_intent');
    expect(rows[0].stripe_payment_method_id).toBe('pm_test');
  });
});

describe('an authorisation without a card unlocks nothing', () => {
  it('draws: entering with a legacy row that has no payment method → 400', async () => {
    const buyerId = await insertBuyer('draws', drawId);
    await db.execute({
      sql: 'INSERT INTO draw_authorised_payment_data (id, draw_buyer_id) VALUES (?, ?)',
      args: [randomUUID(), buyerId],
    });

    const res = await request(app).post(`/api/draws/${drawId}/enter`).send({ drawBuyerId: buyerId });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/autorización de pago/i);
  });

  it('draws: a buyer of another draw cannot be entered → 404', async () => {
    const buyerId = await insertBuyer('draws', otherDrawId);
    const res = await request(app).post(`/api/draws/${drawId}/enter`).send({ drawBuyerId: buyerId });
    expect(res.statusCode).toBe(404);
  });

  it('auctions: bidding with a legacy row that has no payment method → 400', async () => {
    const buyerId = await insertBuyer('auctions', auctionId);
    await db.execute({
      sql: 'INSERT INTO auction_authorised_payment_data (id, auction_buyer_id) VALUES (?, ?)',
      args: [randomUUID(), buyerId],
    });

    const res = await request(app)
      .post(`/api/auctions/${auctionId}/bid`)
      .send({ auctionBuyerId: buyerId, productId: 1, productType: 'art', amount: 100 });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/autorización/i);
  });
});
