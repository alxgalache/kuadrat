/**
 * Tests for edition-aware draw billing (Change: art-limited-editions).
 *
 * billParticipation must: enforce the draws.units cap, consume one edition
 * copy atomically BEFORE charging, release it when the charge fails, and keep
 * it when the charge succeeds or is pending SCA.
 */

jest.mock('../config/database', () => ({
  db: { execute: jest.fn() },
}));
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../services/drawService', () => ({
  getParticipationBillingData: jest.fn(),
}));
jest.mock('../services/stripeService', () => ({
  chargeWinnerOffSession: jest.fn(),
}));
jest.mock('../services/emailService', () => ({
  sendPurchaseConfirmation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/marketingEmailService', () => ({
  announceDrawIfEligible: jest.fn(),
}));

const { db } = require('../config/database');
const drawService = require('../services/drawService');
const stripeService = require('../services/stripeService');
const { billParticipation } = require('../controllers/drawAdminController');

const BILLING_DATA = {
  draw_id: 'draw-1',
  product_id: 42,
  product_type: 'art',
  price: 100,
  tax_vat_art: 10,
  dealer_commission_art: 25,
  first_name: 'Ana',
  last_name: 'García',
  email: 'ana@example.com',
  stripe_customer_id: 'cus_1',
  stripe_payment_method_id: 'pm_1',
  seller_id: 7,
  product_name: 'Obra edición',
};

// Route db.execute by SQL content; overrides let each test flip one behavior.
function routeDb(overrides = {}) {
  db.execute.mockImplementation(async (arg) => {
    const sql = typeof arg === 'string' ? arg : arg.sql;
    if (sql.includes('SELECT id FROM orders WHERE notes')) {
      return overrides.idempotency || { rows: [] };
    }
    if (sql.includes('SELECT units FROM draws')) {
      return overrides.units || { rows: [{ units: 2 }] };
    }
    if (sql.includes('COUNT(*) AS billed')) {
      return overrides.billed || { rows: [{ billed: 0 }] };
    }
    if (sql.includes('editions_sold = editions_sold + 1')) {
      return overrides.consume || { rowsAffected: 1, rows: [] };
    }
    if (sql.includes('INSERT INTO orders')) {
      return { lastInsertRowid: 1234n, rows: [] };
    }
    return { rows: [], rowsAffected: 1 };
  });
}

function mockReqRes() {
  const req = { params: { id: 'draw-1', participationId: 'part-1' }, body: { shippingCost: 0 } };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
}

const consumeCalls = () =>
  db.execute.mock.calls.filter((c) => (c[0].sql || '').includes('editions_sold = editions_sold + 1'));
const releaseCalls = () =>
  db.execute.mock.calls.filter((c) => (c[0].sql || '').includes('editions_sold = MAX(editions_sold - 1, 0)'));

describe('billParticipation edition handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    drawService.getParticipationBillingData.mockResolvedValue({ ...BILLING_DATA });
    stripeService.chargeWinnerOffSession.mockResolvedValue({ success: true, paymentIntentId: 'pi_1' });
    routeDb();
  });

  it('rejects with 409 when all draw units are already billed, without consuming', async () => {
    routeDb({ billed: { rows: [{ billed: 2 }] } }); // units = 2
    const { req, res, next } = mockReqRes();

    await billParticipation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toContain('unidades del sorteo');
    expect(consumeCalls()).toHaveLength(0);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 409 when the edition is sold out, without creating an order', async () => {
    routeDb({ consume: { rowsAffected: 0, rows: [] } });
    const { req, res, next } = mockReqRes();

    await billParticipation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toContain('agotada');
    const orderInserts = db.execute.mock.calls.filter((c) => (c[0].sql || '').includes('INSERT INTO orders'));
    expect(orderInserts).toHaveLength(0);
  });

  it('consumes before charging and keeps the copy on a successful charge', async () => {
    const { req, res, next } = mockReqRes();

    await billParticipation(req, res, next);

    expect(consumeCalls()).toHaveLength(1);
    expect(releaseCalls()).toHaveLength(0);
    expect(res.status).toHaveBeenCalledWith(201);
    // Consumption must happen before the Stripe charge
    const consumeIdx = db.execute.mock.calls.findIndex((c) => (c[0].sql || '').includes('editions_sold = editions_sold + 1'));
    expect(consumeIdx).toBeGreaterThanOrEqual(0);
    expect(stripeService.chargeWinnerOffSession).toHaveBeenCalled();
  });

  it('releases the copy when the Stripe charge throws', async () => {
    stripeService.chargeWinnerOffSession.mockRejectedValue(new Error('card_declined'));
    const { req, res, next } = mockReqRes();

    await billParticipation(req, res, next);

    expect(consumeCalls()).toHaveLength(1);
    expect(releaseCalls()).toHaveLength(1);
    expect(releaseCalls()[0][0].args).toEqual([42]);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
  });

  it('keeps the copy reserved when the charge requires SCA action', async () => {
    stripeService.chargeWinnerOffSession.mockResolvedValue({ requiresAction: true, paymentIntentId: 'pi_2' });
    const { req, res, next } = mockReqRes();

    await billParticipation(req, res, next);

    expect(consumeCalls()).toHaveLength(1);
    expect(releaseCalls()).toHaveLength(0);
    expect(res.json.mock.calls[0][0].requiresAction).toBe(true);
  });

  it('does not touch art inventory for an "other" product draw', async () => {
    drawService.getParticipationBillingData.mockResolvedValue({
      ...BILLING_DATA,
      product_type: 'other',
      dealer_commission_other: 10,
    });
    const { req, res, next } = mockReqRes();

    await billParticipation(req, res, next);

    expect(consumeCalls()).toHaveLength(0);
    expect(releaseCalls()).toHaveLength(0);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
