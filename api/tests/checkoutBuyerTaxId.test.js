/**
 * Buyer tax id at checkout (Change: checkout-buyer-tax-id).
 *
 * Two things are worth asserting, and the second is the reason the check sits
 * where it does in `placeOrder`:
 *
 *  1. A missing or malformed DNI/NIE is a 400.
 *  2. That 400 leaves NOTHING behind — no `orders` row and, above all, no
 *     consumed edition copy. `editions_sold` is not idempotent and its only
 *     release path (`inventoryService.releaseOrderInventory`) needs an
 *     `orders.id` that a late rejection would never have created. Validating
 *     after the reservation would leak a copy of the edition per rejected
 *     request.
 *
 * The happy path runs through the Revolut provider with the provider call
 * doubled out: what is under test is the column, not the gateway.
 */

const request = require('supertest');

jest.mock('../services/revolutService', () => ({
  updateRevolutOrder: jest.fn().mockResolvedValue({}),
  createRevolutOrder: jest.fn().mockResolvedValue({}),
  getRevolutOrder: jest.fn().mockResolvedValue({}),
  cancelRevolutOrder: jest.fn().mockResolvedValue({}),
}));

const { app } = require('./helpers/app');
const { db } = require('../config/database');

const VALID_DNI = '12345678Z';
const VALID_NIE = 'X1234567L';

let sellerId;

async function insertSeller() {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, full_name, visible)
          VALUES (?, 'x', 'seller', 'Artista de Prueba', 1)`,
    args: [`taxid-${Date.now()}-${Math.random()}@example.com`],
  });
  return Number(result.lastInsertRowid);
}

async function insertArt(overrides = {}) {
  const values = { price: 350, edition_size: 1, ...overrides };
  const result = await db.execute({
    sql: `INSERT INTO art (seller_id, name, description, price, slug, status, visible, edition_size)
          VALUES (?, 'Obra de prueba', 'desc', ?, ?, 'approved', 1, ?)`,
    args: [sellerId, values.price, `taxid-${Date.now()}-${Math.random()}`, values.edition_size],
  });
  return Number(result.lastInsertRowid);
}

async function readArt(artId) {
  const result = await db.execute({
    sql: 'SELECT editions_sold, is_sold FROM art WHERE id = ?',
    args: [artId],
  });
  return result.rows[0];
}

async function countOrders() {
  const result = await db.execute('SELECT COUNT(*) AS n FROM orders');
  return Number(result.rows[0].n);
}

function payload(artId, customerOverrides = {}) {
  return {
    items: [
      {
        type: 'art',
        id: artId,
        shipping: { methodId: 1, cost: 10, methodName: 'Estándar', methodType: 'delivery' },
      },
    ],
    payment_provider: 'revolut',
    revolut_order_id: `rev-${Date.now()}-${Math.random()}`,
    revolut_order_token: 'tok-test',
    delivery_address: {
      line1: 'Calle Cliente 10',
      postalCode: '08001',
      city: 'Barcelona',
      province: 'Barcelona',
      country: 'ES',
    },
    invoicing_address: {
      line1: 'Calle Cliente 10',
      postalCode: '08001',
      city: 'Barcelona',
      province: 'Barcelona',
      country: 'ES',
    },
    customer: {
      full_name: 'Ana Ruiz',
      email: 'ana@example.com',
      phone: '+34600000000',
      dni: VALID_DNI,
      ...customerOverrides,
    },
    email: 'ana@example.com',
    phone: '+34600000000',
  };
}

beforeAll(async () => {
  sellerId = await insertSeller();
});

describe('POST /api/orders/placeOrder — buyer tax id', () => {
  describe('rejection', () => {
    it('rejects a request with no dni', async () => {
      const artId = await insertArt();
      const before = await countOrders();

      const { dni, ...customerWithoutDni } = payload(artId).customer;
      const body = { ...payload(artId), customer: customerWithoutDni };

      const res = await request(app).post('/api/orders/placeOrder').send(body);

      expect(res.status).toBe(400);
      expect(await countOrders()).toBe(before);
      expect(Number((await readArt(artId)).editions_sold)).toBe(0);
    });

    it('rejects a dni whose control letter is wrong', async () => {
      const artId = await insertArt();
      const before = await countOrders();

      const res = await request(app)
        .post('/api/orders/placeOrder')
        .send(payload(artId, { dni: '12345678A' }));

      expect(res.status).toBe(400);
      expect(await countOrders()).toBe(before);
      expect(Number((await readArt(artId)).editions_sold)).toBe(0);
    });

    it('rejects a CIF, which is out of scope for a buyer', async () => {
      const artId = await insertArt();
      const before = await countOrders();

      const res = await request(app)
        .post('/api/orders/placeOrder')
        .send(payload(artId, { dni: 'B12345678' }));

      expect(res.status).toBe(400);
      expect(await countOrders()).toBe(before);
    });

    it('rejects before touching inventory even when the artwork is sold out', async () => {
      // A rejection must not depend on anything downstream of it: this order
      // would fail at the reservation too, and the 400 must still be the DNI's.
      const artId = await insertArt();
      await db.execute({
        sql: 'UPDATE art SET editions_sold = 1, is_sold = 1 WHERE id = ?',
        args: [artId],
      });
      const before = await countOrders();

      const res = await request(app)
        .post('/api/orders/placeOrder')
        .send(payload(artId, { dni: '' }));

      expect(res.status).toBe(400);
      expect(await countOrders()).toBe(before);
      expect(Number((await readArt(artId)).editions_sold)).toBe(1);
    });
  });

  describe('persistence', () => {
    it('stores a valid dni on the order', async () => {
      const artId = await insertArt();

      const res = await request(app)
        .post('/api/orders/placeOrder')
        .send(payload(artId, { dni: VALID_DNI }));

      expect(res.status).toBe(201);
      const orderId = res.body.order.id;

      const stored = await db.execute({
        sql: 'SELECT dni, full_name, email FROM orders WHERE id = ?',
        args: [orderId],
      });
      expect(stored.rows[0].dni).toBe(VALID_DNI);
      expect(stored.rows[0].full_name).toBe('Ana Ruiz');
    });

    it('normalizes lowercase and surrounding whitespace before storing', async () => {
      const artId = await insertArt();

      const res = await request(app)
        .post('/api/orders/placeOrder')
        .send(payload(artId, { dni: '  x1234567l  ' }));

      expect(res.status).toBe(201);

      const stored = await db.execute({
        sql: 'SELECT dni FROM orders WHERE id = ?',
        args: [res.body.order.id],
      });
      expect(stored.rows[0].dni).toBe(VALID_NIE);
    });

    it('accepts a NIE', async () => {
      const artId = await insertArt();

      const res = await request(app)
        .post('/api/orders/placeOrder')
        .send(payload(artId, { dni: VALID_NIE }));

      expect(res.status).toBe(201);
      const stored = await db.execute({
        sql: 'SELECT dni FROM orders WHERE id = ?',
        args: [res.body.order.id],
      });
      expect(stored.rows[0].dni).toBe(VALID_NIE);
    });
  });
});

// ---------------------------------------------------------------------------
// Source invariant
// ---------------------------------------------------------------------------
/**
 * There are now THREE paths that create an order — cart checkout, draw billing
 * and auction billing — and each one snapshots the buyer. A fourth that forgets
 * `dni` would produce orders whose invoice silently lacks the NIF, with nothing
 * failing at the time. Same role as `editionInventory.test.js` and
 * `passwordChangeInvalidation.test.js`: this fails on the new path, not on the
 * one route someone remembered to cover.
 */
describe('every INSERT INTO orders names the dni column', () => {
  const fs = require('fs');
  const path = require('path');

  const CONTROLLERS_DIR = path.join(__dirname, '..', 'controllers');

  it('holds across every controller', () => {
    const offenders = [];

    for (const file of fs.readdirSync(CONTROLLERS_DIR).filter((f) => f.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(CONTROLLERS_DIR, file), 'utf8');
      const inserts = source.match(/INSERT INTO orders\s*\(([\s\S]*?)\)/g) || [];
      for (const insert of inserts) {
        // The bootstrap row in database.js is not here; every controller insert
        // is a real buyer order.
        if (!/\bdni\b/.test(insert)) {
          offenders.push(`${file}: ${insert.slice(0, 80).replace(/\s+/g, ' ')}…`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
