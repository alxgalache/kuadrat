const { db } = require('../config/database');
const { randomUUID } = require('crypto');
const logger = require('../config/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID() {
  return randomUUID();
}

function generateBidPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ---------------------------------------------------------------------------
// Draw CRUD
// ---------------------------------------------------------------------------

async function createDraw({ name, description, product_id, product_type, price, units = 1, max_participations, start_datetime, end_datetime, status = 'draft' }) {
  const id = generateUUID();
  await db.execute({
    sql: `INSERT INTO draws (id, name, description, product_id, product_type, price, units, max_participations, start_datetime, end_datetime, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, name, description || null, product_id, product_type, price, units, max_participations, start_datetime, end_datetime, status],
  });

  const result = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return result.rows[0];
}

async function updateDraw(id, fields) {
  const current = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return null;

  const draw = current.rows[0];
  if (!['draft', 'scheduled'].includes(draw.status)) return null;

  const allowedFields = ['name', 'description', 'product_id', 'product_type', 'price', 'units', 'max_participations', 'start_datetime', 'end_datetime', 'status'];
  const setClauses = [];
  const args = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      args.push(value);
    }
  }

  if (setClauses.length === 0) return draw;

  args.push(id);
  await db.execute({
    sql: `UPDATE draws SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });

  const updated = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return updated.rows[0];
}

async function deleteDraw(id) {
  const current = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return false;
  if (!['draft', 'cancelled'].includes(current.rows[0].status)) return false;

  await db.execute({ sql: 'DELETE FROM draw_participations WHERE draw_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM draw_buyers WHERE draw_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM draws WHERE id = ?', args: [id] });

  return true;
}

async function getDrawById(id) {
  const drawResult = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (drawResult.rows.length === 0) return null;

  const draw = drawResult.rows[0];

  // Hydrate with product data
  if (draw.product_type === 'art') {
    const productResult = await db.execute({
      sql: `SELECT a.name AS product_name, a.basename, a.description AS product_description,
                   a.slug AS product_slug, a.seller_id,
                   u.full_name AS seller_name, u.slug AS seller_slug
            FROM art a
            LEFT JOIN users u ON a.seller_id = u.id
            WHERE a.id = ?`,
      args: [draw.product_id],
    });
    if (productResult.rows.length > 0) {
      Object.assign(draw, productResult.rows[0]);
    }
  } else if (draw.product_type === 'other') {
    const productResult = await db.execute({
      sql: `SELECT o.name AS product_name, o.basename, o.description AS product_description,
                   o.slug AS product_slug, o.seller_id,
                   u.full_name AS seller_name, u.slug AS seller_slug
            FROM others o
            LEFT JOIN users u ON o.seller_id = u.id
            WHERE o.id = ?`,
      args: [draw.product_id],
    });
    if (productResult.rows.length > 0) {
      Object.assign(draw, productResult.rows[0]);
    }
  }

  // Get current participation count
  const countResult = await db.execute({
    sql: 'SELECT COUNT(*) AS participation_count FROM draw_participations WHERE draw_id = ?',
    args: [id],
  });
  draw.participation_count = countResult.rows[0]?.participation_count || 0;

  return draw;
}

async function listDraws(filters = {}) {
  let sql = 'SELECT * FROM draws';
  const args = [];
  const conditions = [];

  if (filters.status) {
    conditions.push('status = ?');
    args.push(filters.status);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY start_datetime DESC';

  const result = await db.execute({ sql, args });
  return result.rows;
}

async function getDrawsByDateRange(from, to) {
  const result = await db.execute({
    sql: `SELECT d.*,
            (SELECT COUNT(*) FROM draw_participations WHERE draw_id = d.id) AS participation_count
          FROM draws d
          WHERE d.status IN ('scheduled', 'active', 'finished')
            AND d.start_datetime <= ? AND d.end_datetime >= ?
          ORDER BY d.start_datetime ASC`,
    args: [to, from],
  });

  const draws = result.rows;

  // Hydrate each draw with product preview data
  for (const draw of draws) {
    if (draw.product_type === 'art') {
      const productResult = await db.execute({
        sql: `SELECT a.basename, a.name, u.full_name AS seller_name
              FROM art a
              LEFT JOIN users u ON a.seller_id = u.id
              WHERE a.id = ?`,
        args: [draw.product_id],
      });
      if (productResult.rows.length > 0) {
        draw.product_preview = {
          basename: productResult.rows[0].basename,
          name: productResult.rows[0].name,
          product_type: 'art',
          seller_name: productResult.rows[0].seller_name,
          price: draw.price,
        };
      }
    } else if (draw.product_type === 'other') {
      const productResult = await db.execute({
        sql: `SELECT o.basename, o.name, u.full_name AS seller_name
              FROM others o
              LEFT JOIN users u ON o.seller_id = u.id
              WHERE o.id = ?`,
        args: [draw.product_id],
      });
      if (productResult.rows.length > 0) {
        draw.product_preview = {
          basename: productResult.rows[0].basename,
          name: productResult.rows[0].name,
          product_type: 'other',
          seller_name: productResult.rows[0].seller_name,
          price: draw.price,
        };
      }
    }
  }

  return draws;
}

// ---------------------------------------------------------------------------
// Draw Buyers
// ---------------------------------------------------------------------------

async function createOrGetDrawBuyer(drawId, {
  firstName, lastName, email,
  deliveryAddress1, deliveryAddress2, deliveryPostalCode,
  deliveryCity, deliveryProvince, deliveryCountry,
  invoicingAddress1, invoicingAddress2, invoicingPostalCode,
  invoicingCity, invoicingProvince, invoicingCountry,
}) {
  const existing = await db.execute({
    sql: 'SELECT * FROM draw_buyers WHERE email = ? AND draw_id = ?',
    args: [email, drawId],
  });

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const id = generateUUID();
  const bidPassword = generateBidPassword();

  await db.execute({
    sql: `INSERT INTO draw_buyers (
            id, draw_id, first_name, last_name, email, bid_password,
            delivery_address_1, delivery_address_2, delivery_postal_code,
            delivery_city, delivery_province, delivery_country,
            invoicing_address_1, invoicing_address_2, invoicing_postal_code,
            invoicing_city, invoicing_province, invoicing_country
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, drawId, firstName, lastName, email, bidPassword,
      deliveryAddress1 || null, deliveryAddress2 || null, deliveryPostalCode || null,
      deliveryCity || null, deliveryProvince || null, deliveryCountry || null,
      invoicingAddress1 || null, invoicingAddress2 || null, invoicingPostalCode || null,
      invoicingCity || null, invoicingProvince || null, invoicingCountry || null,
    ],
  });

  const result = await db.execute({ sql: 'SELECT * FROM draw_buyers WHERE id = ?', args: [id] });
  return result.rows[0];
}

async function verifyDrawBuyerPassword(email, drawId, password) {
  const result = await db.execute({
    sql: 'SELECT * FROM draw_buyers WHERE email = ? AND draw_id = ? AND bid_password = ?',
    args: [email, drawId, password],
  });
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getDrawBuyer(buyerId) {
  const result = await db.execute({
    sql: 'SELECT * FROM draw_buyers WHERE id = ?',
    args: [buyerId],
  });
  return result.rows.length > 0 ? result.rows[0] : null;
}

// ---------------------------------------------------------------------------
// Participations
// ---------------------------------------------------------------------------

async function getParticipationCount(drawId) {
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS cnt FROM draw_participations WHERE draw_id = ?',
    args: [drawId],
  });
  return result.rows[0]?.cnt || 0;
}

async function hasParticipation(drawId, drawBuyerId) {
  const result = await db.execute({
    sql: 'SELECT 1 FROM draw_participations WHERE draw_id = ? AND draw_buyer_id = ? LIMIT 1',
    args: [drawId, drawBuyerId],
  });
  return result.rows.length > 0;
}

async function enterDraw(drawId, drawBuyerId) {
  // Check draw is active
  const drawResult = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [drawId] });
  if (drawResult.rows.length === 0) {
    throw new Error('Sorteo no encontrado');
  }
  const draw = drawResult.rows[0];
  if (draw.status !== 'active') {
    throw new Error('El sorteo no está activo');
  }

  // Check buyer exists
  const buyer = await getDrawBuyer(drawBuyerId);
  if (!buyer) {
    throw new Error('Participante no encontrado');
  }

  // Check uniqueness (one entry per buyer per draw)
  const alreadyEntered = await hasParticipation(drawId, drawBuyerId);
  if (alreadyEntered) {
    throw new Error('Ya estás inscrito en este sorteo');
  }

  // Check max_participations cap
  const currentCount = await getParticipationCount(drawId);
  if (currentCount >= draw.max_participations) {
    throw new Error('El sorteo ha alcanzado el máximo de participantes');
  }

  // Check payment is authorized
  const paymentData = await getBuyerPaymentData(drawBuyerId);
  if (!paymentData) {
    throw new Error('Se requiere autorización de pago para participar');
  }

  // Insert participation
  const id = generateUUID();
  await db.execute({
    sql: 'INSERT INTO draw_participations (id, draw_id, draw_buyer_id) VALUES (?, ?, ?)',
    args: [id, drawId, drawBuyerId],
  });

  const result = await db.execute({ sql: 'SELECT * FROM draw_participations WHERE id = ?', args: [id] });
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Draw Lifecycle
// ---------------------------------------------------------------------------

async function startDraw(id) {
  const current = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return null;
  if (current.rows[0].status !== 'scheduled') return null;

  await db.execute({
    sql: "UPDATE draws SET status = 'active' WHERE id = ?",
    args: [id],
  });

  logger.info({ drawId: id, status: 'active', previousStatus: 'scheduled' }, 'Draw started');

  const updated = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return updated.rows[0];
}

async function endDraw(id) {
  const participationCount = await getParticipationCount(id);

  await db.execute({
    sql: "UPDATE draws SET status = 'finished' WHERE id = ?",
    args: [id],
  });

  logger.info({ drawId: id, status: 'finished', participationCount }, 'Draw finished');

  const updated = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return updated.rows[0];
}

async function cancelDraw(id) {
  const current = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return null;
  if (current.rows[0].status === 'finished') return null;

  await db.execute({
    sql: "UPDATE draws SET status = 'cancelled' WHERE id = ?",
    args: [id],
  });

  logger.info({ drawId: id, status: 'cancelled', previousStatus: current.rows[0].status }, 'Draw cancelled');

  const updated = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return updated.rows[0];
}

// ---------------------------------------------------------------------------
// Payment Data
// ---------------------------------------------------------------------------

async function getBuyerPaymentData(drawBuyerId) {
  const result = await db.execute({
    sql: 'SELECT * FROM draw_authorised_payment_data WHERE draw_buyer_id = ?',
    args: [drawBuyerId],
  });
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function savePaymentData(drawBuyerId, {
  name, lastFour, stripeSetupIntentId, stripePaymentMethodId, stripeCustomerId,
}) {
  const id = generateUUID();

  await db.execute({
    sql: `INSERT INTO draw_authorised_payment_data (
            id, draw_buyer_id, name, last_four,
            stripe_setup_intent_id, stripe_payment_method_id, stripe_customer_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, drawBuyerId, name || null, lastFour || null,
      stripeSetupIntentId || null, stripePaymentMethodId || null, stripeCustomerId || null,
    ],
  });

  const result = await db.execute({
    sql: 'SELECT * FROM draw_authorised_payment_data WHERE id = ?',
    args: [id],
  });
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  generateUUID,
  generateBidPassword,
  createDraw,
  updateDraw,
  deleteDraw,
  getDrawById,
  listDraws,
  getDrawsByDateRange,
  createOrGetDrawBuyer,
  verifyDrawBuyerPassword,
  getDrawBuyer,
  getParticipationCount,
  hasParticipation,
  enterDraw,
  startDraw,
  endDraw,
  cancelDraw,
  getBuyerPaymentData,
  savePaymentData,
};
