const request = require('supertest');
const bcrypt = require('bcrypt');
const { app } = require('../server');
const { db } = require('../config/database');

describe('Products API Endpoints', () => {
  let sellerToken;
  let buyerToken;
  let productId;

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
  });

  describe('POST /api/products', () => {
    it('should create a product as seller', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Test Artwork',
          description: 'A beautiful test painting',
          price: 500,
          type: 'Óleo sobre lienzo',
          image_url: 'https://example.com/image.jpg',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.name).toBe('Test Artwork');
      productId = res.body.product.id;
    });

    it('should fail to create product as buyer', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          name: 'Test Artwork',
          description: 'A beautiful test painting',
          price: 500,
          type: 'Óleo sobre lienzo',
          image_url: 'https://example.com/image.jpg',
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should fail without authentication', async () => {
      const res = await request(app)
        .post('/api/products')
        .send({
          name: 'Test Artwork',
          description: 'A beautiful test painting',
          price: 500,
          type: 'Óleo sobre lienzo',
          image_url: 'https://example.com/image.jpg',
        });

      expect(res.statusCode).toBe(401);
    });

    it('should fail with invalid product type', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Test Artwork',
          description: 'A beautiful test painting',
          price: 500,
          type: 'invalid',
          image_url: 'https://example.com/image.jpg',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/products', () => {
    it('should get all products (public)', async () => {
      const res = await request(app).get('/api/products');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.products)).toBe(true);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should get a single product (public)', async () => {
      const res = await request(app).get(`/api/products/${productId}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.id).toBe(productId);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app).get('/api/products/999999');

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/products/seller/me', () => {
    it('should get seller\'s own products', async () => {
      const res = await request(app)
        .get('/api/products/seller/me')
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.products)).toBe(true);
    });

    it('should fail for buyers', async () => {
      const res = await request(app)
        .get('/api/products/seller/me')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/products/:id', () => {
    let deleteProductId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Delete Test',
          description: 'To be deleted',
          price: 100,
          type: 'Impresión digital',
          image_url: 'https://example.com/delete.jpg',
        });

      deleteProductId = res.body.product.id;
    });

    it('should delete own product as seller', async () => {
      const res = await request(app)
        .delete(`/api/products/${deleteProductId}`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.statusCode).toBe(204);
    });

    it('should fail to delete non-existent product', async () => {
      const res = await request(app)
        .delete('/api/products/999999')
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
