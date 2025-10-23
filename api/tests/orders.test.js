const request = require('supertest');
const bcrypt = require('bcrypt');
const { app } = require('../server');
const { db } = require('../config/database');

describe('Orders API Endpoints', () => {
  let sellerToken;
  let buyerToken;
  let productId1;
  let productId2;

  beforeAll(async () => {
    // Create seller user directly in database
    const sellerEmail = `seller${Date.now()}@test.com`;
    const passwordHash = await bcrypt.hash('password123', 10);
    await db.execute({
      sql: 'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      args: [sellerEmail, passwordHash, 'seller'],
    });

    const sellerLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: sellerEmail,
        password: 'password123',
      });

    sellerToken = sellerLogin.body.token;

    // Create buyer user directly in database
    const buyerEmail = `buyer${Date.now()}@test.com`;
    const buyerPasswordHash = await bcrypt.hash('password123', 10);
    await db.execute({
      sql: 'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      args: [buyerEmail, buyerPasswordHash, 'buyer'],
    });

    const buyerLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: buyerEmail,
        password: 'password123',
      });

    buyerToken = buyerLogin.body.token;

    // Create test products
    const product1 = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Order Test Product 1',
        description: 'Test product for orders',
        price: 200,
        type: 'Acrílico sobre papel',
        image_url: 'https://example.com/order1.jpg',
      });

    productId1 = product1.body.product.id;

    const product2 = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Order Test Product 2',
        description: 'Test product for orders',
        price: 150,
        type: 'Lámina ilustrada',
        image_url: 'https://example.com/order2.jpg',
      });

    productId2 = product2.body.product.id;
  });

  describe('POST /api/orders', () => {
    it('should create an order with single product', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          productIds: [productId1],
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.total_price).toBe(200);
      expect(res.body.order.items.length).toBe(1);
    });

    it('should create an order with multiple products', async () => {
      // Create new products for this test
      const product3 = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Multi Order Product',
          description: 'For multi product order',
          price: 100,
          type: 'Lámina ilustrada',
          image_url: 'https://example.com/multi.jpg',
        });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          productIds: [product3.body.product.id],
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should fail without authentication', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({
          productIds: [productId2],
        });

      expect(res.statusCode).toBe(401);
    });

    it('should fail with empty productIds', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          productIds: [],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail with non-existent product', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          productIds: [999999],
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/orders', () => {
    it('should get user\'s orders', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.orders)).toBe(true);
    });

    it('should fail without authentication', async () => {
      const res = await request(app).get('/api/orders');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/orders/:id', () => {
    let orderId;

    beforeAll(async () => {
      // Create a new product and order for this test
      const product = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Get Order Test',
          description: 'For get order test',
          price: 250,
          type: 'Acrílico sobre papel',
          image_url: 'https://example.com/getorder.jpg',
        });

      const order = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          productIds: [product.body.product.id],
        });

      orderId = order.body.order.id;
    });

    it('should get order details', async () => {
      const res = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.id).toBe(orderId);
      expect(res.body.order.items).toBeDefined();
    });

    it('should fail for non-existent order', async () => {
      const res = await request(app)
        .get('/api/orders/999999')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
