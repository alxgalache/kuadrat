const { db } = require('../config/database');
const { randomUUID } = require('crypto');
const logger = require('../config/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID() {
  return randomUUID();
}

async function setProductDrawFlag(productId, productType, value) {
  const table = productType === 'art' ? 'art' : 'others';
  await db.execute({
    sql: `UPDATE ${table} SET for_draw = ? WHERE id = ?`,
    args: [value, productId],
  });
}

// ---------------------------------------------------------------------------
// Draw CRUD
// ---------------------------------------------------------------------------

async function createDraw({ name, description, product_id, product_type, price, units = 1, min_participants = 30, max_participations, start_datetime, end_datetime, status = 'draft' }) {
  const id = generateUUID();
  await db.execute({
    sql: `INSERT INTO draws (id, name, description, product_id, product_type, price, units, min_participants, max_participations, start_datetime, end_datetime, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, name, description || null, product_id, product_type, price, units, min_participants, max_participations, start_datetime, end_datetime, status],
  });

  await setProductDrawFlag(product_id, product_type, 1);

  const result = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return result.rows[0];
}

async function updateDraw(id, fields) {
  const current = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return null;

  const draw = current.rows[0];
  if (!['draft', 'scheduled'].includes(draw.status)) return null;

  const allowedFields = ['name', 'description', 'product_id', 'product_type', 'price', 'units', 'min_participants', 'max_participations', 'start_datetime', 'end_datetime', 'status'];
  const setClauses = [];
  const args = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      args.push(value);
    }
  }

  if (setClauses.length === 0) return draw;

  // Handle product change: reset old product flag, set new product flag
  const newProductId = fields.product_id !== undefined ? fields.product_id : draw.product_id;
  const newProductType = fields.product_type !== undefined ? fields.product_type : draw.product_type;
  const productChanged = newProductId !== draw.product_id || newProductType !== draw.product_type;

  if (productChanged) {
    await setProductDrawFlag(draw.product_id, draw.product_type, 0);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE draws SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });

  if (productChanged) {
    await setProductDrawFlag(newProductId, newProductType, 1);
  }

  const updated = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return updated.rows[0];
}

async function deleteDraw(id) {
  const current = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return false;
  const draw = current.rows[0];
  if (!['draft', 'cancelled'].includes(draw.status)) return false;

  await setProductDrawFlag(draw.product_id, draw.product_type, 0);

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
  firstName, lastName, email, dni, ipAddress,
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

  await db.execute({
    sql: `INSERT INTO draw_buyers (
            id, draw_id, first_name, last_name, email, bid_password, dni, ip_address,
            delivery_address_1, delivery_address_2, delivery_postal_code,
            delivery_city, delivery_province, delivery_country,
            invoicing_address_1, invoicing_address_2, invoicing_postal_code,
            invoicing_city, invoicing_province, invoicing_country
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, drawId, firstName, lastName, email, '', dni, ipAddress || null,
      deliveryAddress1 || null, deliveryAddress2 || null, deliveryPostalCode || null,
      deliveryCity || null, deliveryProvince || null, deliveryCountry || null,
      invoicingAddress1 || null, invoicingAddress2 || null, invoicingPostalCode || null,
      invoicingCity || null, invoicingProvince || null, invoicingCountry || null,
    ],
  });

  const result = await db.execute({ sql: 'SELECT * FROM draw_buyers WHERE id = ?', args: [id] });
  return result.rows[0];
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

async function hasBuyerCompletedParticipation(drawId, email, dni) {
  const result = await db.execute({
    sql: `SELECT 1 FROM draw_buyers db
          INNER JOIN draw_participations dp ON dp.draw_buyer_id = db.id AND dp.draw_id = db.draw_id
          WHERE db.draw_id = ? AND (db.email = ? OR db.dni = ?)
          LIMIT 1`,
    args: [drawId, email.toLowerCase().trim(), dni.toUpperCase().trim()],
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

async function finishDraw(id) {
  const current = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return null;
  const draw = current.rows[0];
  if (draw.status !== 'active') return null;

  await db.execute({
    sql: "UPDATE draws SET status = 'finished' WHERE id = ?",
    args: [id],
  });

  const participationCount = await getParticipationCount(id);
  logger.info({ drawId: id, status: 'finished', participationCount }, 'Draw manually finished by admin');

  const updated = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return updated.rows[0];
}

async function cancelDraw(id) {
  const current = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return null;
  const draw = current.rows[0];
  if (draw.status === 'finished') return null;

  await db.execute({
    sql: "UPDATE draws SET status = 'cancelled' WHERE id = ?",
    args: [id],
  });

  await setProductDrawFlag(draw.product_id, draw.product_type, 0);

  logger.info({ drawId: id, status: 'cancelled', previousStatus: draw.status }, 'Draw cancelled');

  const updated = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [id] });
  return updated.rows[0];
}

// ---------------------------------------------------------------------------
// Admin: participations list with buyer + payment + billed status
// ---------------------------------------------------------------------------

async function getDrawParticipationsWithDetails(drawId) {
  const result = await db.execute({
    sql: `SELECT
            dp.id AS participation_id,
            dp.draw_id,
            dp.created_at AS participation_created_at,
            db2.id AS buyer_id,
            db2.first_name,
            db2.last_name,
            db2.email,
            db2.delivery_address_1,
            db2.delivery_postal_code,
            db2.delivery_city,
            db2.delivery_province,
            db2.delivery_country,
            dapd.stripe_payment_method_id,
            dapd.stripe_customer_id,
            dapd.last_four,
            dapd.name AS card_name,
            CASE WHEN EXISTS (
              SELECT 1 FROM orders o
              WHERE o.notes = 'draw_participation:' || dp.id
            ) THEN 1 ELSE 0 END AS billed
          FROM draw_participations dp
          INNER JOIN draw_buyers db2 ON dp.draw_buyer_id = db2.id
          LEFT JOIN draw_authorised_payment_data dapd ON dapd.draw_buyer_id = db2.id
          WHERE dp.draw_id = ?
          ORDER BY dp.created_at DESC`,
    args: [drawId],
  });
  return result.rows;
}

// ---------------------------------------------------------------------------
// Admin: full billing data for a single participation
// ---------------------------------------------------------------------------

async function getParticipationBillingData(participationId) {
  const result = await db.execute({
    sql: `SELECT
            dp.id AS participation_id,
            dp.draw_id,
            d.product_id,
            d.product_type,
            d.price,
            db2.id AS buyer_id,
            db2.first_name,
            db2.last_name,
            db2.email,
            db2.delivery_address_1,
            db2.delivery_address_2,
            db2.delivery_postal_code,
            db2.delivery_city,
            db2.delivery_province,
            db2.delivery_country,
            db2.delivery_lat,
            db2.delivery_long,
            db2.invoicing_address_1,
            db2.invoicing_address_2,
            db2.invoicing_postal_code,
            db2.invoicing_city,
            db2.invoicing_province,
            db2.invoicing_country,
            dapd.stripe_customer_id,
            dapd.stripe_payment_method_id,
            COALESCE(a.seller_id, o.seller_id) AS seller_id,
            COALESCE(a.name, o.name) AS product_name,
            COALESCE(a.basename, o.basename) AS basename,
            a.type AS art_type
          FROM draw_participations dp
          INNER JOIN draws d ON dp.draw_id = d.id
          INNER JOIN draw_buyers db2 ON dp.draw_buyer_id = db2.id
          LEFT JOIN draw_authorised_payment_data dapd ON dapd.draw_buyer_id = db2.id
          LEFT JOIN art a ON d.product_type = 'art' AND d.product_id = a.id
          LEFT JOIN others o ON d.product_type = 'other' AND d.product_id = o.id
          WHERE dp.id = ?`,
    args: [participationId],
  });
  return result.rows[0] || null;
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
  name, lastFour, stripeSetupIntentId, stripePaymentMethodId, stripeCustomerId, stripeFingerprint,
}) {
  const id = generateUUID();

  await db.execute({
    sql: `INSERT INTO draw_authorised_payment_data (
            id, draw_buyer_id, name, last_four,
            stripe_setup_intent_id, stripe_payment_method_id, stripe_customer_id, stripe_fingerprint
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, drawBuyerId, name || null, lastFour || null,
      stripeSetupIntentId || null, stripePaymentMethodId || null, stripeCustomerId || null,
      stripeFingerprint || null,
    ],
  });

  const result = await db.execute({
    sql: 'SELECT * FROM draw_authorised_payment_data WHERE id = ?',
    args: [id],
  });
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// DNI Validation
// ---------------------------------------------------------------------------

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function validateDNI(dni) {
  if (!dni || typeof dni !== 'string') return false;
  const normalized = dni.toUpperCase().trim();

  // NIE format: X/Y/Z + 7 digits + letter
  const nieMatch = normalized.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (nieMatch) {
    const niePrefix = { X: '0', Y: '1', Z: '2' };
    const num = parseInt(niePrefix[nieMatch[1]] + nieMatch[2], 10);
    return nieMatch[3] === DNI_LETTERS[num % 23];
  }

  // DNI format: 8 digits + letter
  const dniMatch = normalized.match(/^(\d{8})([A-Z])$/);
  if (dniMatch) {
    const num = parseInt(dniMatch[1], 10);
    return dniMatch[2] === DNI_LETTERS[num % 23];
  }

  return false;
}

async function checkDniUniqueness(drawId, dni) {
  const result = await db.execute({
    sql: 'SELECT 1 FROM draw_buyers WHERE dni = ? AND draw_id = ? LIMIT 1',
    args: [dni.toUpperCase().trim(), drawId],
  });
  return result.rows.length === 0;
}

async function checkEmailUniqueness(drawId, email) {
  const result = await db.execute({
    sql: 'SELECT 1 FROM draw_buyers WHERE email = ? AND draw_id = ? LIMIT 1',
    args: [email.toLowerCase().trim(), drawId],
  });
  return result.rows.length === 0;
}

// ---------------------------------------------------------------------------
// Email OTP Verification
// ---------------------------------------------------------------------------

function generateOTPCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createEmailVerification(email, drawId, ipAddress = null) {
  // Invalidate previous codes for same email + draw
  await db.execute({
    sql: 'DELETE FROM draw_email_verifications WHERE email = ? AND draw_id = ?',
    args: [email, drawId],
  });

  const id = generateUUID();
  const code = generateOTPCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.execute({
    sql: `INSERT INTO draw_email_verifications (id, email, draw_id, code, expires_at, ip_address)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, email, drawId, code, expiresAt, ipAddress || null],
  });

  return code;
}

async function verifyEmailCode(email, drawId, code) {
  const result = await db.execute({
    sql: `SELECT * FROM draw_email_verifications
          WHERE email = ? AND draw_id = ? AND verified = 0
          ORDER BY created_at DESC LIMIT 1`,
    args: [email, drawId],
  });

  if (result.rows.length === 0) {
    return { valid: false, error: 'No se encontró una verificación pendiente' };
  }

  const verification = result.rows[0];

  if (new Date(verification.expires_at) < new Date()) {
    return { valid: false, error: 'El código ha expirado. Solicita uno nuevo' };
  }

  if (verification.attempts >= 3) {
    return { valid: false, error: 'Demasiados intentos. Solicita un nuevo código' };
  }

  if (verification.code !== code) {
    await db.execute({
      sql: 'UPDATE draw_email_verifications SET attempts = attempts + 1 WHERE id = ?',
      args: [verification.id],
    });
    return { valid: false, error: 'Código incorrecto' };
  }

  await db.execute({
    sql: 'UPDATE draw_email_verifications SET verified = 1 WHERE id = ?',
    args: [verification.id],
  });

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Stripe Fingerprint Deduplication
// ---------------------------------------------------------------------------

async function checkFingerprintUniqueness(drawId, fingerprint, excludeBuyerId) {
  if (!fingerprint) return true;

  const result = await db.execute({
    sql: `SELECT 1 FROM draw_authorised_payment_data dapd
          JOIN draw_buyers db ON dapd.draw_buyer_id = db.id
          WHERE dapd.stripe_fingerprint = ? AND db.draw_id = ? AND db.id != ?
          LIMIT 1`,
    args: [fingerprint, drawId, excludeBuyerId],
  });
  return result.rows.length === 0;
}

// ---------------------------------------------------------------------------
// Postal Code Validation
// ---------------------------------------------------------------------------

async function validatePostalCodeForDraw(drawId, postalCode, country) {
  // Resolve draw → product → seller
  const drawResult = await db.execute({ sql: 'SELECT * FROM draws WHERE id = ?', args: [drawId] });
  if (drawResult.rows.length === 0) return null;

  const draw = drawResult.rows[0];
  const productTable = draw.product_type === 'art' ? 'art' : 'others';
  const articleType = draw.product_type === 'art' ? 'art' : 'others';

  const productResult = await db.execute({
    sql: `SELECT seller_id FROM ${productTable} WHERE id = ?`,
    args: [draw.product_id],
  });
  if (productResult.rows.length === 0) return { valid: true };

  const sellerId = productResult.rows[0].seller_id;

  // Check if seller has any delivery zones for this country matching the product type
  const zonesResult = await db.execute({
    sql: `SELECT sz.id FROM shipping_zones sz
          INNER JOIN shipping_methods sm ON sz.shipping_method_id = sm.id
          WHERE sm.type = 'delivery' AND sm.is_active = 1
            AND (sm.article_type = 'all' OR sm.article_type = ?)
            AND sz.seller_id = ? AND sz.country = ?`,
    args: [articleType, sellerId, country],
  });

  if (zonesResult.rows.length === 0) {
    return { valid: true }; // No zones configured for this product type — no restrictions
  }

  // Check if postal code matches any zone (zone with no postal refs = country-wide)
  const matchResult = await db.execute({
    sql: `SELECT 1 FROM shipping_zones sz
          INNER JOIN shipping_methods sm ON sz.shipping_method_id = sm.id
          WHERE sm.type = 'delivery' AND sm.is_active = 1
            AND (sm.article_type = 'all' OR sm.article_type = ?)
            AND sz.seller_id = ? AND sz.country = ?
            AND (
              NOT EXISTS (
                SELECT 1 FROM shipping_zones_postal_codes szpc WHERE szpc.shipping_zone_id = sz.id
              )
              OR EXISTS (
                SELECT 1 FROM shipping_zones_postal_codes szpc
                JOIN postal_codes pc ON szpc.postal_code_id = pc.id
                WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'postal_code'
                  AND pc.postal_code = ? AND pc.country = ?
              )
              OR EXISTS (
                SELECT 1 FROM shipping_zones_postal_codes szpc
                WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'province'
                  AND EXISTS (
                    SELECT 1 FROM postal_codes pc
                    WHERE pc.postal_code = ? AND pc.country = ? AND pc.province = szpc.ref_value
                  )
              )
              OR EXISTS (
                SELECT 1 FROM shipping_zones_postal_codes szpc
                WHERE szpc.shipping_zone_id = sz.id AND szpc.ref_type = 'country'
                  AND EXISTS (
                    SELECT 1 FROM postal_codes pc
                    WHERE pc.postal_code = ? AND pc.country = szpc.ref_value
                  )
              )
            )
          LIMIT 1`,
    args: [articleType, sellerId, country, postalCode, country, postalCode, country, postalCode],
  });

  return { valid: matchResult.rows.length > 0 };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  generateUUID,
  createDraw,
  updateDraw,
  deleteDraw,
  getDrawById,
  listDraws,
  getDrawsByDateRange,
  createOrGetDrawBuyer,
  getDrawBuyer,
  getParticipationCount,
  hasParticipation,
  hasBuyerCompletedParticipation,
  enterDraw,
  startDraw,
  endDraw,
  finishDraw,
  cancelDraw,
  getDrawParticipationsWithDetails,
  getParticipationBillingData,
  getBuyerPaymentData,
  savePaymentData,
  validateDNI,
  checkDniUniqueness,
  checkEmailUniqueness,
  createEmailVerification,
  verifyEmailCode,
  checkFingerprintUniqueness,
  validatePostalCodeForDraw,
};
