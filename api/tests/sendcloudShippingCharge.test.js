/**
 * The Sendcloud shipping is charged, verified, and recorded once per seller
 * (openspec change: sendcloud-store-shipping-accuracy, bloque 4).
 *
 * Three numbers used to disagree on the very same order of 2 units of a 20 €
 * store product with a 4,57 € shipping option:
 *
 *   Stripe charged        40,00 €   (`item.shipping` is null for Sendcloud
 *                                    items, so `computeShippingTotal` summed
 *                                    nothing and the shipping was never billed)
 *   orders.total_price    49,14 €   (the selection was merged onto every
 *                                    expanded unit row, so 4,57 counted twice)
 *   actually owed         44,57 €
 *
 * They now agree by construction: `create-intent` re-quotes and charges the
 * fresh figure, leaves it on the PaymentIntent, and `placeOrder` reads it back
 * instead of quoting a second time — so the figure recorded is literally the
 * figure charged, not a second one that has to match.
 *
 * The provider is doubled out, so nothing reaches Sendcloud. Enabling it here
 * is the point of the double: `.env.test` disables Sendcloud for both product
 * types, which would make this whole path inert.
 */

const request = require('supertest');

let mockDeliveryOptions = [];
const mockProviderCalls = [];

jest.mock('../services/shipping/shippingProviderFactory', () => ({
  isSendcloudEnabled: (type) => (type === 'others' ? 'other' : type) === 'other',
  isSendcloudEnabledForAny: () => true,
  getProvider: () => ({
    getDeliveryOptions: async ({ sellerId, parcels }) => {
      mockProviderCalls.push({ sellerId, parcels });
      return mockDeliveryOptions;
    },
  }),
}));

const mockStripeCalls = [];
let mockPaymentIntentMetadata = {};

jest.mock('../services/stripeService', () => ({
  createPaymentIntent: jest.fn(async (args) => {
    mockStripeCalls.push(args);
    return { id: 'pi_test_123', client_secret: 'cs_test', amount: args.amount, currency: args.currency };
  }),
  retrievePaymentIntent: jest.fn(async () => ({ id: 'pi_test_123', metadata: mockPaymentIntentMetadata })),
  updatePaymentIntent: jest.fn().mockResolvedValue({}),
  cancelPaymentIntent: jest.fn().mockResolvedValue({}),
  constructWebhookEvent: jest.fn(),
  findOrCreateCustomer: jest.fn().mockResolvedValue({ id: 'cus_test' }),
}));

jest.mock('../services/revolutService', () => ({
  updateRevolutOrder: jest.fn().mockResolvedValue({}),
  createRevolutOrder: jest.fn().mockResolvedValue({}),
  getRevolutOrder: jest.fn().mockResolvedValue({}),
  getRevolutOrderPayments: jest.fn().mockResolvedValue({}),
  getRevolutPayment: jest.fn().mockResolvedValue({}),
  cancelRevolutOrder: jest.fn().mockResolvedValue({}),
}));

const { app } = require('./helpers/app');
const { db } = require('../config/database');

const PREMIUM = {
  id: 'correos:premium',
  shippingOptionCode: 'correos:premium',
  name: 'Correos Premium Entrega a Domicilio',
  type: 'home_delivery',
  carrier: { name: 'Correos', code: 'correos' },
  price: 4.57,
  currency: 'EUR',
  estimatedDays: 2,
  requiresServicePoint: false,
};

let sellerId;
let productId;
let variantId;

async function insertSeller() {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Pilar Español', 1)`,
    args: [`shipcharge-${Date.now()}-${Math.random()}@example.com`],
  });
  return Number(result.lastInsertRowid);
}

async function insertProduct() {
  const result = await db.execute({
    sql: `INSERT INTO others (seller_id, name, description, price, slug, status, visible, weight, dimensions, can_copack)
          VALUES (?, 'El Límite', 'desc', 20, ?, 'approved', 1, 600, '30x30x4', 1)`,
    args: [sellerId, `shipcharge-${Date.now()}-${Math.random()}`],
  });
  const id = Number(result.lastInsertRowid);

  const variant = await db.execute({
    sql: `INSERT INTO other_vars (other_id, key, value, stock) VALUES (?, NULL, NULL, 100)`,
    args: [id],
  });

  return { id, variantId: Number(variant.lastInsertRowid) };
}

function selection(overrides = {}) {
  return {
    sellerId,
    shippingOptionCode: 'correos:premium',
    servicePointId: null,
    cost: 4.57,
    type: 'home_delivery',
    name: 'Correos Premium Entrega a Domicilio',
    ...overrides,
  };
}

function intentBody(overrides = {}) {
  return {
    items: [{ type: 'other', id: productId, variantId, quantity: 2 }],
    currency: 'EUR',
    deliveryAddress: { country: 'ES', postalCode: '28001' },
    shippingSelections: [selection()],
    ...overrides,
  };
}

function orderBody(overrides = {}) {
  const item = { type: 'other', id: productId, variantId };
  return {
    items: [item, item],
    payment_provider: 'stripe',
    stripe_payment_intent_id: 'pi_test_123',
    shippingSelections: [selection()],
    delivery_address: {
      line1: 'Gran Vía 1', postalCode: '28001', city: 'Madrid', province: 'Madrid', country: 'ES',
    },
    invoicing_address: {
      line1: 'Gran Vía 1', postalCode: '28001', city: 'Madrid', province: 'Madrid', country: 'ES',
    },
    customer: { full_name: 'Ana Ruiz', email: 'ana@example.com', phone: '+34600000000', dni: '12345678Z' },
    email: 'ana@example.com',
    ...overrides,
  };
}

beforeAll(async () => {
  sellerId = await insertSeller();
  const product = await insertProduct();
  productId = product.id;
  variantId = product.variantId;
});

beforeEach(() => {
  mockDeliveryOptions = [PREMIUM];
  mockProviderCalls.length = 0;
  mockStripeCalls.length = 0;
  mockPaymentIntentMetadata = { sendcloudShipping: JSON.stringify([{ s: sellerId, c: 457 }]) };
});

// --- the amount charged ----------------------------------------------------

describe('the buyer is charged for the shipping they selected', () => {
  test('2 units of a 20 € product with 4,57 € shipping is a 4457 PaymentIntent', async () => {
    const res = await request(app).post('/api/payments/stripe/create-intent').send(intentBody());

    expect(res.status).toBe(200);
    // Before this change the amount was 4000: the shipping was quoted, shown,
    // and then dropped on the floor between the cart and the charge.
    expect(mockStripeCalls[0].amount).toBe(4457);
  });

  test('the charged price is the re-quoted one, not the one the client sent', async () => {
    // A client claiming one cent of shipping is refused, and nothing is charged.
    const res = await request(app)
      .post('/api/payments/stripe/create-intent')
      .send(intentBody({ shippingSelections: [selection({ cost: 0.01 })] }));

    expect(res.status).toBe(400);
    expect(res.body.title).toBe('SHIPPING_COST_OUTDATED');
    expect(mockStripeCalls).toHaveLength(0);
  });

  test('a seller group with no selection blocks the payment', async () => {
    const res = await request(app)
      .post('/api/payments/stripe/create-intent')
      .send(intentBody({ shippingSelections: [] }));

    expect(res.status).toBe(400);
    expect(res.body.title).toBe('SHIPPING_SELECTION_REQUIRED');
    expect(mockStripeCalls).toHaveLength(0);
  });

  test('an option that is no longer offered blocks the payment', async () => {
    mockDeliveryOptions = [{ ...PREMIUM, id: 'correos_express:epaq24', shippingOptionCode: 'correos_express:epaq24' }];

    const res = await request(app).post('/api/payments/stripe/create-intent').send(intentBody());

    expect(res.status).toBe(400);
    expect(res.body.title).toBe('SHIPPING_METHOD_UNAVAILABLE');
  });

  test('the re-quote uses the order delivery address and one parcel for 2 co-packable units', async () => {
    await request(app).post('/api/payments/stripe/create-intent').send(intentBody());

    expect(mockProviderCalls).toHaveLength(1);
    // Co-packable, so one parcel; and its weight is volumetric (2 × 720 g)
    // rather than real (2 × 600 g).
    expect(mockProviderCalls[0].parcels).toHaveLength(1);
    expect(mockProviderCalls[0].parcels[0].weight).toBe(1440);
    expect(mockProviderCalls[0].parcels[0].totalValue).toBe(40);
  });

  test('the verified amount is carried on the PaymentIntent for order creation', async () => {
    await request(app).post('/api/payments/stripe/create-intent').send(intentBody());

    expect(JSON.parse(mockStripeCalls[0].metadata.sendcloudShipping)).toEqual([{ s: sellerId, c: 457 }]);
  });
});

// --- what gets recorded ----------------------------------------------------

describe('what is recorded equals what was charged', () => {
  async function placeOrder(body) {
    const res = await request(app).post('/api/orders/placeOrder').send(body || orderBody());
    return res;
  }

  async function readOrder(orderId) {
    const order = await db.execute({ sql: 'SELECT total_price FROM orders WHERE id = ?', args: [orderId] });
    const items = await db.execute({
      sql: 'SELECT shipping_cost, shipping_method_name, sendcloud_shipping_option_code FROM other_order_items WHERE order_id = ? ORDER BY id ASC',
      args: [orderId],
    });
    return { order: order.rows[0], items: items.rows };
  }

  test('the order total is products + shipping counted once', async () => {
    const res = await placeOrder();
    expect(res.status).toBe(201);

    const { order } = await readOrder(res.body.order.id);
    // 2 × 20,00 + 4,57. Before this change: 49,14 (shipping counted per unit).
    expect(Number(order.total_price)).toBeCloseTo(44.57, 2);
  });

  test('the cost lands on the first row of the seller group and 0 on the rest', async () => {
    const res = await placeOrder();
    const { items } = await readOrder(res.body.order.id);

    expect(items).toHaveLength(2);
    expect(Number(items[0].shipping_cost)).toBeCloseTo(4.57, 2);
    expect(Number(items[1].shipping_cost)).toBe(0);
    // Both rows still describe the shipment they belong to.
    expect(items[0].sendcloud_shipping_option_code).toBe('correos:premium');
    expect(items[1].sendcloud_shipping_option_code).toBe('correos:premium');
  });

  test('the existing per-item aggregation yields the charged total', async () => {
    const res = await placeOrder();
    const { order, items } = await readOrder(res.body.order.id);

    // The shape of the six queries in ordersController: Σ price + shipping_cost.
    const aggregated = items.reduce((sum, i) => sum + 20 + (Number(i.shipping_cost) || 0), 0);
    expect(aggregated).toBeCloseTo(Number(order.total_price), 2);
  });

  test('order creation reads the PaymentIntent instead of quoting again', async () => {
    mockProviderCalls.length = 0;
    await placeOrder();

    // Re-quoting here would be a second number that has to agree with the one
    // already charged, across the seconds spent in the card form.
    expect(mockProviderCalls).toHaveLength(0);
  });

  test('a PaymentIntent without the metadata falls back to re-verifying', async () => {
    mockPaymentIntentMetadata = {};
    mockProviderCalls.length = 0;

    const res = await placeOrder();

    expect(res.status).toBe(201);
    expect(mockProviderCalls.length).toBeGreaterThan(0);
    const { order } = await readOrder(res.body.order.id);
    expect(Number(order.total_price)).toBeCloseTo(44.57, 2);
  });
});
