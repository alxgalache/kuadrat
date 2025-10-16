const request = require('supertest');
const bcrypt = require('bcrypt');
const { app } = require('../server');
const { db } = require('../config/database');

describe('Auth API Endpoints', () => {
  describe('POST /api/auth/login', () => {
    const testEmail = `login${Date.now()}@test.com`;
    const testPassword = 'password123';

    beforeAll(async () => {
      // Create test user directly in database
      const passwordHash = await bcrypt.hash(testPassword, 10);
      await db.execute({
        sql: 'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        args: [testEmail, passwordHash, 'buyer'],
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
    });

    it('should fail with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'wrongpassword',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password123',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
