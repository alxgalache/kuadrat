const request = require('supertest');
const bcrypt = require('bcrypt');
const zlib = require('zlib');
const { app } = require('../server');
const { db } = require('../config/database');

// Build a minimal valid 600x600 grayscale PNG buffer. Sufficient to pass
// MIME + image-size + 600x600 validation in the controllers.
function makePng(width = 600, height = 600) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0;
  const compressed = zlib.deflateSync(raw);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('Multi-image product upload', () => {
  let sellerToken;
  const createdArtIds = [];
  const createdOthersIds = [];

  beforeAll(async () => {
    const sellerEmail = `multiimg${Date.now()}@test.com`;
    const passwordHash = await bcrypt.hash('password123', 10);
    await db.execute({
      sql: 'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      args: [sellerEmail, passwordHash, 'seller'],
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: sellerEmail, password: 'password123' });
    sellerToken = login.body.token;
  });

  afterAll(async () => {
    for (const id of createdArtIds) {
      try {
        await db.execute({ sql: 'DELETE FROM product_images WHERE product_type = ? AND product_id = ?', args: ['art', id] });
        await db.execute({ sql: 'DELETE FROM art WHERE id = ?', args: [id] });
      } catch {}
    }
    for (const id of createdOthersIds) {
      try {
        const varRows = await db.execute({ sql: 'SELECT id FROM other_vars WHERE other_id = ?', args: [id] });
        const varIds = varRows.rows.map((r) => r.id);
        if (varIds.length > 0) {
          const placeholders = varIds.map(() => '?').join(',');
          await db.execute({ sql: `DELETE FROM product_images WHERE product_type = 'other_var' AND product_id IN (${placeholders})`, args: varIds });
        }
        await db.execute({ sql: 'DELETE FROM product_images WHERE product_type = ? AND product_id = ?', args: ['other', id] });
        await db.execute({ sql: 'DELETE FROM other_vars WHERE other_id = ?', args: [id] });
        await db.execute({ sql: 'DELETE FROM others WHERE id = ?', args: [id] });
      } catch {}
    }
  });

  const longDescription = 'Lorem ipsum '.repeat(20); // > 100 chars
  const pngBuf = makePng();

  describe('POST /api/art', () => {
    test('creates with 1, 2, and 3 images and GET returns the array', async () => {
      for (const count of [1, 2, 3]) {
        const req = request(app)
          .post('/api/art')
          .set('Authorization', `Bearer ${sellerToken}`)
          .field('name', `Multi-Image Art ${count} ${Date.now()}`)
          .field('description', longDescription)
          .field('price', '150')
          .field('type', 'Óleo sobre lienzo');
        for (let i = 0; i < count; i++) {
          req.attach('images', pngBuf, `img${i}.png`);
        }
        const res = await req;
        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.product.images)).toBe(true);
        expect(res.body.product.images).toHaveLength(count);
        createdArtIds.push(res.body.product.id);

        const getRes = await request(app).get(`/api/art/${res.body.product.id}`);
        expect(getRes.statusCode).toBe(200);
        expect(getRes.body.product.images).toHaveLength(count);
      }
    });

    test('returns 400 when no images are provided', async () => {
      const res = await request(app)
        .post('/api/art')
        .set('Authorization', `Bearer ${sellerToken}`)
        .field('name', `No Image Art ${Date.now()}`)
        .field('description', longDescription)
        .field('price', '150')
        .field('type', 'Óleo sobre lienzo');
      expect(res.statusCode).toBe(400);
    });

    test('DELETE removes product_images rows', async () => {
      const create = await request(app)
        .post('/api/art')
        .set('Authorization', `Bearer ${sellerToken}`)
        .field('name', `Delete Me Art ${Date.now()}`)
        .field('description', longDescription)
        .field('price', '150')
        .field('type', 'Óleo sobre lienzo')
        .attach('images', pngBuf, 'a.png')
        .attach('images', pngBuf, 'b.png');
      expect(create.statusCode).toBe(201);
      const artId = create.body.product.id;

      const del = await request(app)
        .delete(`/api/art/${artId}`)
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(del.statusCode).toBe(204);

      const remaining = await db.execute({
        sql: 'SELECT COUNT(*) AS c FROM product_images WHERE product_type = ? AND product_id = ?',
        args: ['art', artId],
      });
      expect(Number(remaining.rows[0].c)).toBe(0);
    });
  });

  describe('POST /api/others', () => {
    test('creates with globals + per-variation images and GET nests them', async () => {
      const variations = [
        { key: 'Verde', stock: 5 },
        { key: 'Azul', stock: 3 },
      ];
      const res = await request(app)
        .post('/api/others')
        .set('Authorization', `Bearer ${sellerToken}`)
        .field('name', `Multi Others ${Date.now()}`)
        .field('description', longDescription)
        .field('price', '50')
        .field('variations', JSON.stringify(variations))
        .field('can_copack', '1')
        .attach('images', pngBuf, 'g1.png')
        .attach('images', pngBuf, 'g2.png')
        .attach('variation_0_images', pngBuf, 'v0_a.png')
        .attach('variation_0_images', pngBuf, 'v0_b.png')
        .attach('variation_1_images', pngBuf, 'v1_a.png');

      expect(res.statusCode).toBe(201);
      createdOthersIds.push(res.body.product.id);
      expect(res.body.product.images).toHaveLength(2);
      expect(res.body.product.variations).toHaveLength(2);
      expect(res.body.product.variations[0].images).toHaveLength(2);
      expect(res.body.product.variations[1].images).toHaveLength(1);

      const getRes = await request(app).get(`/api/others/${res.body.product.id}`);
      expect(getRes.statusCode).toBe(200);
      expect(getRes.body.product.images).toHaveLength(2);
      expect(getRes.body.product.variations[0].images).toHaveLength(2);
      expect(getRes.body.product.variations[1].images).toHaveLength(1);
    });

    test('accepts variations with zero images (optional)', async () => {
      const variations = [{ key: 'Único', stock: 4 }];
      const res = await request(app)
        .post('/api/others')
        .set('Authorization', `Bearer ${sellerToken}`)
        .field('name', `No Variation Image Others ${Date.now()}`)
        .field('description', longDescription)
        .field('price', '50')
        .field('variations', JSON.stringify(variations))
        .field('can_copack', '1')
        .attach('images', pngBuf, 'main.png');
      expect(res.statusCode).toBe(201);
      createdOthersIds.push(res.body.product.id);
      expect(res.body.product.variations[0].images).toEqual([]);
    });

    test('DELETE removes global + variation product_images', async () => {
      const variations = [{ key: 'X', stock: 1 }];
      const create = await request(app)
        .post('/api/others')
        .set('Authorization', `Bearer ${sellerToken}`)
        .field('name', `Delete Others ${Date.now()}`)
        .field('description', longDescription)
        .field('price', '50')
        .field('variations', JSON.stringify(variations))
        .field('can_copack', '1')
        .attach('images', pngBuf, 'g.png')
        .attach('variation_0_images', pngBuf, 'v.png');
      expect(create.statusCode).toBe(201);
      const id = create.body.product.id;

      const del = await request(app)
        .delete(`/api/others/${id}`)
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(del.statusCode).toBe(204);

      const remaining = await db.execute({
        sql: `SELECT COUNT(*) AS c FROM product_images
              WHERE (product_type = 'other' AND product_id = ?)
                 OR (product_type = 'other_var' AND product_id IN (SELECT id FROM other_vars WHERE other_id = ?))`,
        args: [id, id],
      });
      expect(Number(remaining.rows[0].c)).toBe(0);
    });
  });
});
