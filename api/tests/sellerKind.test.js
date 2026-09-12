/**
 * Seller kind: Artista / Ponente (Change: seller-kind-artist-speaker).
 *
 * Exercised end to end through the real routers, so the admin gate, the Zod
 * enum, `requireArtistSeller` and the SQL guards are all in the path. Email
 * never leaves the process: under NODE_ENV=test the transport is `noop`.
 *
 * The three things worth breaking a build over are all here: a speaker cannot
 * reach a product endpoint no matter what their menu shows; a demotion is
 * refused rather than dragged through; and changing the kind actually ends the
 * seller's open sessions.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('./helpers/app');
const { db } = require('../config/database');

const stamp = Date.now();
const ADMIN_EMAIL = `kind-admin${stamp}@test.com`;

let adminId;
let adminToken;

const tokenFor = (id, email, role) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

/**
 * A token whose `iat` sits in the past but which is still far from expiring.
 *
 * `expiresIn` is relative to `iat`, so signing a backdated token with it would
 * produce one that is already expired and the 401 would prove nothing about
 * the cut-off.
 */
const backdatedTokenFor = (id, email, role, secondsAgo) => {
  const iat = Math.floor(Date.now() / 1000) - secondsAgo;
  return jwt.sign({ id, email, role, iat, exp: iat + secondsAgo + 3600 }, process.env.JWT_SECRET);
};

/** Insert a seller directly, bypassing the admin route. */
const makeSeller = async (label, kind = 'artist') => {
  const email = `kind-${label}${stamp}@test.com`;
  const res = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, seller_kind)
          VALUES (?, 'x', 'seller', ?, ?)`,
    args: [email, `Vendedor ${label}`, kind],
  });
  const id = Number(res.lastInsertRowid);
  return { id, email, token: tokenFor(id, email, 'seller') };
};

const kindOf = async (id) => {
  const res = await db.execute({ sql: 'SELECT seller_kind FROM users WHERE id = ?', args: [id] });
  return res.rows[0]?.seller_kind;
};

const cutoffOf = async (id) => {
  const res = await db.execute({
    sql: 'SELECT sessions_invalidated_at FROM users WHERE id = ?',
    args: [id],
  });
  return res.rows[0]?.sessions_invalidated_at;
};

/** The body PUT /api/admin/authors/:id requires beyond the field under test. */
const editPayload = (overrides = {}) => ({
  full_name: 'Vendedor',
  bio: '',
  location: '',
  email: `edit-${Math.random().toString(36).slice(2)}${stamp}@test.com`,
  email_contact: '',
  visible: true,
  dealer_commission_art: 25,
  dealer_commission_other: 10,
  tax_vat_art: 10,
  tax_vat_other: 21,
  ...overrides,
});

const putAuthor = (id, body) =>
  request(app)
    .put(`/api/admin/authors/${id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);

beforeAll(async () => {
  const admin = await db.execute({
    sql: "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, 'x', 'admin', 'Admin')",
    args: [ADMIN_EMAIL],
  });
  adminId = Number(admin.lastInsertRowid);
  adminToken = tokenFor(adminId, ADMIN_EMAIL, 'admin');
});

// ─────────────────────────────────────────────────────────────────────────
describe('users.seller_kind column', () => {
  it("defaults to 'artist', so an existing account keeps every section", async () => {
    const res = await db.execute({
      sql: "INSERT INTO users (email, password_hash, role) VALUES (?, 'x', 'seller')",
      args: [`kind-default${stamp}@test.com`],
    });
    expect(await kindOf(Number(res.lastInsertRowid))).toBe('artist');
  });

  it('starts with a NULL session cut-off, so deploying signs nobody out', async () => {
    const seller = await makeSeller('nullcutoff');
    expect(await cutoffOf(seller.id)).toBeNull();
  });
});

describe('POST /api/admin/authors', () => {
  it('persists the chosen kind', async () => {
    const res = await request(app)
      .post('/api/admin/authors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `kind-new-speaker${stamp}@test.com`,
        full_name: 'Ponente Nuevo',
        slug: `kind-new-speaker${stamp}`,
        seller_kind: 'speaker',
      });

    expect(res.status).toBe(201);
    expect(res.body.author.seller_kind).toBe('speaker');
    expect(await kindOf(res.body.author.id)).toBe('speaker');
  });

  it("defaults to 'artist' when the field is omitted", async () => {
    const res = await request(app)
      .post('/api/admin/authors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `kind-new-default${stamp}@test.com`,
        full_name: 'Artista Nuevo',
        slug: `kind-new-default${stamp}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.author.seller_kind).toBe('artist');
  });

  it('rejects a value outside the enum', async () => {
    // The column carries its CHECK only in the CREATE TABLE — SQLite will not
    // apply a constraint added by ALTER TABLE — so Zod is what really enforces
    // the enum, and this is the test that says so.
    const res = await request(app)
      .post('/api/admin/authors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `kind-bad${stamp}@test.com`,
        full_name: 'Malo',
        slug: `kind-bad${stamp}`,
        seller_kind: 'streamer',
      });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('requireArtistSeller', () => {
  let speaker;
  let artist;

  beforeAll(async () => {
    speaker = await makeSeller('gate-speaker', 'speaker');
    artist = await makeSeller('gate-artist', 'artist');
  });

  const forbidden = [
    ['POST', '/api/art'],
    ['POST', '/api/others'],
    ['GET', '/api/art/seller/me'],
    ['GET', '/api/others/seller/me'],
    ['GET', '/api/seller/products'],
    ['GET', '/api/seller/orders'],
  ];

  it.each(forbidden)('refuses a speaker on %s %s', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path).set(
      'Authorization',
      `Bearer ${speaker.token}`
    );

    expect(res.status).toBe(403);
    expect(res.body.title).toBe('SELLER_KIND_FORBIDDEN');
  });

  it.each([['GET', '/api/art/seller/me'], ['GET', '/api/seller/products']])(
    'lets an artist through on %s %s',
    async (method, path) => {
      const res = await request(app)[method.toLowerCase()](path).set(
        'Authorization',
        `Bearer ${artist.token}`
      );
      expect(res.status).toBe(200);
    }
  );

  // The point of the whole change: a speaker earns through paid events, so the
  // money endpoints must stay open to them. If this ever goes red, a speaker
  // can no longer see their balance or ask to be paid.
  it.each(['/api/seller/wallet', '/api/seller/paid-events', '/api/seller/profile'])(
    'leaves %s open to a speaker',
    async (path) => {
      const res = await request(app).get(path).set('Authorization', `Bearer ${speaker.token}`);
      expect(res.status).toBe(200);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────
describe('PUT /api/admin/authors/:id — demotion blockers', () => {
  it('refuses while the seller has a live artwork', async () => {
    const seller = await makeSeller('blk-art');
    await db.execute({
      sql: `INSERT INTO art (name, description, slug, price, seller_id, removed)
            VALUES ('Obra', 'd', ?, 100, ?, 0)`,
      args: [`blk-art${stamp}`, seller.id],
    });

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    expect(res.status).toBe(409);
    expect(res.body.title).toBe('SELLER_KIND_CHANGE_BLOCKED');
    expect(res.body.blockers.map((b) => b.code)).toContain('LIVE_ART');
    expect(await kindOf(seller.id)).toBe('artist');
    // Nothing was written, not even the unrelated fields on the same payload.
    expect(await cutoffOf(seller.id)).toBeNull();
  });

  it('refuses while the seller has a live store product', async () => {
    const seller = await makeSeller('blk-other');
    await db.execute({
      sql: `INSERT INTO others (name, description, slug, price, seller_id, removed)
            VALUES ('Producto', 'd', ?, 20, ?, 0)`,
      args: [`blk-other${stamp}`, seller.id],
    });

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    expect(res.status).toBe(409);
    expect(res.body.blockers.map((b) => b.code)).toContain('LIVE_OTHERS');
  });

  it('refuses while an auction of theirs is open, even with the artwork removed', async () => {
    // The corner the auction query exists for: the product check above would
    // miss this one, because the artwork is already soft-removed.
    const seller = await makeSeller('blk-auction');
    const art = await db.execute({
      sql: `INSERT INTO art (name, description, slug, price, seller_id, removed)
            VALUES ('Obra', 'd', ?, 100, ?, 1)`,
      args: [`blk-auction${stamp}`, seller.id],
    });
    const auctionId = `auc-${stamp}`;
    await db.execute({
      sql: `INSERT INTO auctions (id, name, start_datetime, end_datetime, status)
            VALUES (?, 'Subasta', '2026-01-01', '2026-02-01', 'active')`,
      args: [auctionId],
    });
    await db.execute({
      sql: `INSERT INTO auction_arts (id, auction_id, art_id, start_price) VALUES (?, ?, ?, 10)`,
      args: [`aa-${stamp}`, auctionId, Number(art.lastInsertRowid)],
    });

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    expect(res.status).toBe(409);
    expect(res.body.blockers.map((b) => b.code)).toEqual(['OPEN_AUCTION']);
  });

  it('refuses while a draw of theirs is open, even with the artwork removed', async () => {
    const seller = await makeSeller('blk-draw');
    const art = await db.execute({
      sql: `INSERT INTO art (name, description, slug, price, seller_id, removed)
            VALUES ('Obra', 'd', ?, 100, ?, 1)`,
      args: [`blk-draw${stamp}`, seller.id],
    });
    await db.execute({
      sql: `INSERT INTO draws (id, name, product_id, product_type, price, max_participations,
                               start_datetime, end_datetime, status)
            VALUES (?, 'Sorteo', ?, 'art', 5, 100, '2026-01-01', '2026-02-01', 'active')`,
      args: [`drw-${stamp}`, Number(art.lastInsertRowid)],
    });

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    expect(res.status).toBe(409);
    expect(res.body.blockers.map((b) => b.code)).toEqual(['OPEN_DRAW']);
  });

  it('refuses while an order item of theirs is still open', async () => {
    const seller = await makeSeller('blk-order');
    const art = await db.execute({
      sql: `INSERT INTO art (name, description, slug, price, seller_id, removed)
            VALUES ('Obra', 'd', ?, 100, ?, 1)`,
      args: [`blk-order${stamp}`, seller.id],
    });
    const order = await db.execute({
      sql: `INSERT INTO orders (token, total_price, status) VALUES (?, 100, 'paid')`,
      args: [`ord-tok-${stamp}`],
    });
    await db.execute({
      sql: `INSERT INTO art_order_items (order_id, art_id, price_at_purchase, status)
            VALUES (?, ?, 100, 'sent')`,
      args: [Number(order.lastInsertRowid), Number(art.lastInsertRowid)],
    });

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    expect(res.status).toBe(409);
    expect(res.body.blockers.map((b) => b.code)).toEqual(['OPEN_ORDER_ITEM']);
  });

  it('allows the demotion when nothing is live', async () => {
    const seller = await makeSeller('blk-clean');

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    expect(res.status).toBe(200);
    expect(await kindOf(seller.id)).toBe('speaker');
  });

  it('allows the promotion without checking commercial footprint', async () => {
    const seller = await makeSeller('blk-promote', 'speaker');
    // Give them the very footprint that would block a demotion.
    await db.execute({
      sql: `INSERT INTO art (name, description, slug, price, seller_id, removed)
            VALUES ('Obra', 'd', ?, 100, ?, 0)`,
      args: [`blk-promote${stamp}`, seller.id],
    });

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'artist' }));

    expect(res.status).toBe(200);
    expect(await kindOf(seller.id)).toBe('artist');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('PUT /api/admin/authors/:id — live broadcast', () => {
  const withLiveEvent = async (label, kind) => {
    const seller = await makeSeller(label, kind);
    await db.execute({
      sql: `INSERT INTO events (id, title, slug, event_datetime, host_user_id, category, status)
            VALUES (?, 'Directo', ?, '2026-01-01', ?, 'charla', 'active')`,
      args: [`ev-${label}-${stamp}`, `ev-${label}-${stamp}`, seller.id],
    });
    return seller;
  };

  it.each([
    ['artist', 'speaker'],
    ['speaker', 'artist'],
  ])('refuses %s → %s while the seller is broadcasting', async (from, to) => {
    const seller = await withLiveEvent(`live-${from}`, from);

    const res = await putAuthor(seller.id, editPayload({ seller_kind: to }));

    expect(res.status).toBe(409);
    expect(res.body.blockers.map((b) => b.code)).toContain('LIVE_EVENT');
    expect(await kindOf(seller.id)).toBe(from);
    expect(await cutoffOf(seller.id)).toBeNull();
  });

  it('allows the change when the event is only scheduled', async () => {
    const seller = await makeSeller('sched');
    await db.execute({
      sql: `INSERT INTO events (id, title, slug, event_datetime, host_user_id, category, status)
            VALUES (?, 'Programado', ?, '2026-01-01', ?, 'charla', 'scheduled')`,
      args: [`ev-sched-${stamp}`, `ev-sched-${stamp}`, seller.id],
    });

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    expect(res.status).toBe(200);
    expect(await kindOf(seller.id)).toBe('speaker');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('session cut-off on a kind change', () => {
  it('stamps sessions_invalidated_at when the kind actually changes', async () => {
    const seller = await makeSeller('cut-change');
    expect(await cutoffOf(seller.id)).toBeNull();

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    expect(res.status).toBe(200);
    expect(await cutoffOf(seller.id)).not.toBeNull();
  });

  it('leaves it untouched when the form is saved with the same kind', async () => {
    // Otherwise the admin could not fix a typo in a bio without throwing the
    // artist out of their own panel.
    const seller = await makeSeller('cut-same');

    const res = await putAuthor(seller.id, editPayload({ seller_kind: 'artist' }));

    expect(res.status).toBe(200);
    expect(await cutoffOf(seller.id)).toBeNull();
  });

  it('leaves it untouched when the field is omitted entirely', async () => {
    const seller = await makeSeller('cut-omitted');

    const res = await putAuthor(seller.id, editPayload());

    expect(res.status).toBe(200);
    expect(await cutoffOf(seller.id)).toBeNull();
    expect(await kindOf(seller.id)).toBe('artist');
  });

  it('rejects a JWT issued before the cut-off and accepts one issued after', async () => {
    const seller = await makeSeller('cut-jwt');
    const before = backdatedTokenFor(seller.id, seller.email, 'seller', 3600);

    // Still valid while nothing has been invalidated.
    const warmUp = await request(app)
      .get('/api/seller/profile')
      .set('Authorization', `Bearer ${before}`);
    expect(warmUp.status).toBe(200);

    await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));

    const stale = await request(app)
      .get('/api/seller/profile')
      .set('Authorization', `Bearer ${before}`);
    expect(stale.status).toBe(401);

    const fresh = await request(app)
      .get('/api/seller/profile')
      .set('Authorization', `Bearer ${tokenFor(seller.id, seller.email, 'seller')}`);
    expect(fresh.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Sendcloud configuration is refused for a speaker', () => {
  it('refuses to create one', async () => {
    const speaker = await makeSeller('sc-create', 'speaker');

    const res = await request(app)
      .post(`/api/admin/authors/${speaker.id}/sendcloud-config`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sender_name: 'Remitente' });

    expect(res.status).toBe(400);
    expect(res.body.title).toBe('SELLER_KIND_FORBIDDEN');
  });

  it('keeps an existing row readable after a demotion', async () => {
    // The row is the record of shipments that really happened. A demotion is
    // not a reason to destroy history.
    const seller = await makeSeller('sc-demote');
    await db.execute({
      sql: `INSERT INTO user_sendcloud_configuration (user_id, sender_name) VALUES (?, 'Remitente')`,
      args: [seller.id],
    });

    const demote = await putAuthor(seller.id, editPayload({ seller_kind: 'speaker' }));
    expect(demote.status).toBe(200);

    const read = await request(app)
      .get(`/api/admin/authors/${seller.id}/sendcloud-config`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(read.status).toBe(200);

    const update = await request(app)
      .put(`/api/admin/authors/${seller.id}/sendcloud-config`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sender_name: 'Otro' });
    expect(update.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('marketing announcements exclude speakers', () => {
  it('does not list them in the picker and refuses a direct announce', async () => {
    const speaker = await makeSeller('mkt-speaker', 'speaker');
    await db.execute({
      sql: 'UPDATE users SET visible = 1, slug = ? WHERE id = ?',
      args: [`mkt-speaker${stamp}`, speaker.id],
    });

    const list = await request(app)
      .get('/api/admin/marketing/authors')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const listed = (list.body.data?.authors || list.body.authors || []).map((a) => a.id);
    expect(listed).not.toContain(speaker.id);

    const announce = await request(app)
      .post('/api/admin/marketing/announce-author')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ authorId: speaker.id });
    expect(announce.status).toBe(404);
  });
});
