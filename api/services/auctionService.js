const { db } = require('../config/database');
const { randomUUID } = require('crypto');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID() {
  return randomUUID();
}

/**
 * Generate a 6-char alphanumeric bid password (excludes ambiguous chars: 0OI1L).
 */
function generateBidPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ---------------------------------------------------------------------------
// Auction CRUD
// ---------------------------------------------------------------------------

async function createAuction({ name, description, start_datetime, end_datetime, status = 'draft' }) {
  const id = generateUUID();
  await db.execute({
    sql: `INSERT INTO auctions (id, name, description, start_datetime, end_datetime, status)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, name, description || null, start_datetime, end_datetime, status],
  });

  const result = await db.execute({
    sql: 'SELECT * FROM auctions WHERE id = ?',
    args: [id],
  });
  return result.rows[0];
}

async function updateAuction(id, fields) {
  const current = await db.execute({
    sql: 'SELECT * FROM auctions WHERE id = ?',
    args: [id],
  });

  if (current.rows.length === 0) return null;

  const auction = current.rows[0];
  if (!['draft', 'scheduled'].includes(auction.status)) return null;

  const setClauses = [];
  const args = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      args.push(value);
    }
  }

  if (setClauses.length === 0) return auction;

  args.push(id);
  await db.execute({
    sql: `UPDATE auctions SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });

  const updated = await db.execute({
    sql: 'SELECT * FROM auctions WHERE id = ?',
    args: [id],
  });
  return updated.rows[0];
}

async function deleteAuction(id) {
  const current = await db.execute({
    sql: 'SELECT * FROM auctions WHERE id = ?',
    args: [id],
  });

  if (current.rows.length === 0) return false;
  if (!['draft', 'cancelled'].includes(current.rows[0].status)) return false;

  // Delete related data
  await db.execute({ sql: 'DELETE FROM auction_bids WHERE auction_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM auction_arts_postal_codes WHERE auction_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM auction_others_postal_codes WHERE auction_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM auction_arts WHERE auction_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM auction_others WHERE auction_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM auction_users WHERE auction_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM auction_buyers WHERE auction_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM auctions WHERE id = ?', args: [id] });

  return true;
}

async function getAuctionById(id) {
  const auctionResult = await db.execute({
    sql: 'SELECT * FROM auctions WHERE id = ?',
    args: [id],
  });

  if (auctionResult.rows.length === 0) return null;

  const auction = auctionResult.rows[0];

  // Get art products
  const artsResult = await db.execute({
    sql: `SELECT aa.*, a.name, a.basename, a.description, a.slug, a.seller_id,
                 u.full_name AS seller_name, u.slug AS seller_slug,
                 aa.shipping_observations
          FROM auction_arts aa
          JOIN art a ON aa.art_id = a.id
          LEFT JOIN users u ON a.seller_id = u.id
          WHERE aa.auction_id = ?
          ORDER BY aa.position ASC`,
    args: [id],
  });

  // Get other products
  const othersResult = await db.execute({
    sql: `SELECT ao.*, o.name, o.basename, o.description, o.slug, o.seller_id,
                 u.full_name AS seller_name, u.slug AS seller_slug,
                 ao.shipping_observations
          FROM auction_others ao
          JOIN others o ON ao.other_id = o.id
          LEFT JOIN users u ON o.seller_id = u.id
          WHERE ao.auction_id = ?
          ORDER BY ao.position ASC`,
    args: [id],
  });

  // Get postal codes for each product
  for (const art of artsResult.rows) {
    const pcResult = await db.execute({
      sql: `SELECT pc.* FROM auction_arts_postal_codes aapc
            JOIN postal_codes pc ON aapc.postal_code_id = pc.id
            WHERE aapc.auction_id = ? AND aapc.art_id = ?`,
      args: [id, art.art_id],
    });
    art.postal_codes = pcResult.rows;
    art.postal_code_ids = pcResult.rows.map(pc => pc.id);
    art.product_type = 'art';
    art.product_id = art.art_id;
  }

  for (const other of othersResult.rows) {
    const pcResult = await db.execute({
      sql: `SELECT pc.* FROM auction_others_postal_codes aopc
            JOIN postal_codes pc ON aopc.postal_code_id = pc.id
            WHERE aopc.auction_id = ? AND aopc.other_id = ?`,
      args: [id, other.other_id],
    });
    other.postal_codes = pcResult.rows;
    other.postal_code_ids = pcResult.rows.map(pc => pc.id);
    other.product_type = 'other';
    other.product_id = other.other_id;
  }

  // Get sellers
  const usersResult = await db.execute({
    sql: `SELECT u.id, u.full_name, u.slug, u.email
          FROM auction_users au
          JOIN users u ON au.user_id = u.id
          WHERE au.auction_id = ?`,
    args: [id],
  });

  auction.products = [
    ...artsResult.rows.map((r) => ({ ...r, product_type: 'art' })),
    ...othersResult.rows.map((r) => ({ ...r, product_type: 'other' })),
  ].sort((a, b) => a.position - b.position);

  auction.sellers = usersResult.rows;

  return auction;
}

async function listAuctions(filters = {}) {
  let sql = 'SELECT * FROM auctions';
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

async function getAuctionsByDateRange(from, to) {
  const result = await db.execute({
    sql: `SELECT a.*,
            (SELECT COUNT(*) FROM auction_arts WHERE auction_id = a.id) +
            (SELECT COUNT(*) FROM auction_others WHERE auction_id = a.id) AS product_count
          FROM auctions a
          WHERE a.status IN ('scheduled', 'active', 'finished')
            AND a.start_datetime <= ? AND a.end_datetime >= ?
          ORDER BY a.start_datetime ASC`,
    args: [to, from],
  });
  return result.rows;
}

async function getAuctionsForDate(date) {
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;
  return getAuctionsByDateRange(dayStart, dayEnd);
}

// ---------------------------------------------------------------------------
// Auction Products
// ---------------------------------------------------------------------------

async function addProductToAuction(auctionId, { productId, productType, startPrice, stepNewBid, position = 0, shippingObservations = null }) {
  const id = generateUUID();

  if (productType === 'art') {
    await db.execute({
      sql: `INSERT INTO auction_arts (id, auction_id, art_id, start_price, current_price, step_new_bid, position, shipping_observations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, auctionId, productId, startPrice, startPrice, stepNewBid, position, shippingObservations],
    });
    const result = await db.execute({ sql: 'SELECT * FROM auction_arts WHERE id = ?', args: [id] });
    return result.rows[0];
  } else if (productType === 'other') {
    await db.execute({
      sql: `INSERT INTO auction_others (id, auction_id, other_id, start_price, current_price, step_new_bid, position, shipping_observations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, auctionId, productId, startPrice, startPrice, stepNewBid, position, shippingObservations],
    });
    const result = await db.execute({ sql: 'SELECT * FROM auction_others WHERE id = ?', args: [id] });
    return result.rows[0];
  } else {
    throw new Error(`Invalid product type: '${productType}'`);
  }
}

async function removeProductFromAuction(auctionId, productId, productType) {
  if (productType === 'art') {
    await db.execute({
      sql: 'DELETE FROM auction_arts_postal_codes WHERE auction_id = ? AND art_id = ?',
      args: [auctionId, productId],
    });
    await db.execute({
      sql: 'DELETE FROM auction_arts WHERE auction_id = ? AND art_id = ?',
      args: [auctionId, productId],
    });
  } else if (productType === 'other') {
    await db.execute({
      sql: 'DELETE FROM auction_others_postal_codes WHERE auction_id = ? AND other_id = ?',
      args: [auctionId, productId],
    });
    await db.execute({
      sql: 'DELETE FROM auction_others WHERE auction_id = ? AND other_id = ?',
      args: [auctionId, productId],
    });
  } else {
    throw new Error(`Invalid product type: '${productType}'`);
  }
}

async function setProductPostalCodes(auctionId, productId, productType, postalCodeIds) {
  if (productType === 'art') {
    await db.execute({
      sql: 'DELETE FROM auction_arts_postal_codes WHERE auction_id = ? AND art_id = ?',
      args: [auctionId, productId],
    });
    for (const pcId of postalCodeIds) {
      const id = generateUUID();
      await db.execute({
        sql: 'INSERT INTO auction_arts_postal_codes (id, auction_id, art_id, postal_code_id) VALUES (?, ?, ?, ?)',
        args: [id, auctionId, productId, pcId],
      });
    }
  } else if (productType === 'other') {
    await db.execute({
      sql: 'DELETE FROM auction_others_postal_codes WHERE auction_id = ? AND other_id = ?',
      args: [auctionId, productId],
    });
    for (const pcId of postalCodeIds) {
      const id = generateUUID();
      await db.execute({
        sql: 'INSERT INTO auction_others_postal_codes (id, auction_id, other_id, postal_code_id) VALUES (?, ?, ?, ?)',
        args: [id, auctionId, productId, pcId],
      });
    }
  } else {
    throw new Error(`Invalid product type: '${productType}'`);
  }
}

// ---------------------------------------------------------------------------
// Auction Users (Sellers)
// ---------------------------------------------------------------------------

async function assignSellersToAuction(auctionId, userIds) {
  await db.execute({ sql: 'DELETE FROM auction_users WHERE auction_id = ?', args: [auctionId] });

  for (const userId of userIds) {
    const id = generateUUID();
    await db.execute({
      sql: 'INSERT INTO auction_users (id, auction_id, user_id) VALUES (?, ?, ?)',
      args: [id, auctionId, userId],
    });
  }
}

// ---------------------------------------------------------------------------
// Auction Buyers
// ---------------------------------------------------------------------------

async function createOrGetAuctionBuyer(auctionId, {
  firstName, lastName, email,
  deliveryAddress1, deliveryAddress2, deliveryPostalCode,
  deliveryCity, deliveryProvince, deliveryCountry,
  invoicingAddress1, invoicingAddress2, invoicingPostalCode,
  invoicingCity, invoicingProvince, invoicingCountry,
}) {
  // Check if buyer with same email already exists for this auction
  const existing = await db.execute({
    sql: 'SELECT * FROM auction_buyers WHERE email = ? AND auction_id = ?',
    args: [email, auctionId],
  });

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const id = generateUUID();
  const bidPassword = generateBidPassword();

  await db.execute({
    sql: `INSERT INTO auction_buyers (
            id, auction_id, first_name, last_name, email, bid_password,
            delivery_address_1, delivery_address_2, delivery_postal_code,
            delivery_city, delivery_province, delivery_country,
            invoicing_address_1, invoicing_address_2, invoicing_postal_code,
            invoicing_city, invoicing_province, invoicing_country
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, auctionId, firstName, lastName, email, bidPassword,
      deliveryAddress1 || null, deliveryAddress2 || null, deliveryPostalCode || null,
      deliveryCity || null, deliveryProvince || null, deliveryCountry || null,
      invoicingAddress1 || null, invoicingAddress2 || null, invoicingPostalCode || null,
      invoicingCity || null, invoicingProvince || null, invoicingCountry || null,
    ],
  });

  const result = await db.execute({ sql: 'SELECT * FROM auction_buyers WHERE id = ?', args: [id] });
  return result.rows[0];
}

async function verifyBidPassword(email, auctionId, password) {
  const result = await db.execute({
    sql: 'SELECT * FROM auction_buyers WHERE email = ? AND auction_id = ? AND bid_password = ?',
    args: [email, auctionId, password],
  });
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getAuctionBuyer(buyerId) {
  const result = await db.execute({
    sql: 'SELECT * FROM auction_buyers WHERE id = ?',
    args: [buyerId],
  });
  return result.rows.length > 0 ? result.rows[0] : null;
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

async function placeBid(auctionId, auctionBuyerId, productId, productType, amount) {
  let tableName, productIdColumn;

  if (productType === 'art') {
    tableName = 'auction_arts';
    productIdColumn = 'art_id';
  } else if (productType === 'other') {
    tableName = 'auction_others';
    productIdColumn = 'other_id';
  } else {
    throw new Error(`Invalid product type: '${productType}'`);
  }

  // Fetch the current product entry
  const productResult = await db.execute({
    sql: `SELECT * FROM ${tableName} WHERE auction_id = ? AND ${productIdColumn} = ?`,
    args: [auctionId, productId],
  });

  if (productResult.rows.length === 0) {
    throw new Error('Product not found in this auction');
  }

  const product = productResult.rows[0];
  const { start_price, current_price, step_new_bid } = product;

  // Check if there are existing bids
  const bidCountResult = await db.execute({
    sql: `SELECT COUNT(*) AS bid_count FROM auction_bids
          WHERE auction_id = ? AND product_id = ? AND product_type = ?`,
    args: [auctionId, productId, productType],
  });

  const hasBids = (bidCountResult.rows[0]?.bid_count || 0) > 0;

  // Validate bid amount
  if (hasBids) {
    const minAmount = current_price + step_new_bid;
    if (amount < minAmount) {
      throw new Error(`La puja mínima es ${minAmount}€ (precio actual ${current_price}€ + paso ${step_new_bid}€)`);
    }
  } else {
    if (amount < start_price) {
      throw new Error(`La puja mínima es ${start_price}€ (precio de salida)`);
    }
  }

  // Optimistic concurrency: update current_price only if it hasn't changed
  const updateResult = await db.execute({
    sql: `UPDATE ${tableName} SET current_price = ? WHERE auction_id = ? AND ${productIdColumn} = ? AND current_price = ?`,
    args: [amount, auctionId, productId, current_price],
  });

  if (updateResult.rowsAffected === 0) {
    throw new Error('El precio ha cambiado. Por favor, inténtalo de nuevo.');
  }

  // Insert the bid record
  const bidId = generateUUID();
  await db.execute({
    sql: `INSERT INTO auction_bids (id, auction_id, auction_buyer_id, product_id, product_type, amount)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [bidId, auctionId, auctionBuyerId, productId, productType, amount],
  });

  const bidResult = await db.execute({ sql: 'SELECT * FROM auction_bids WHERE id = ?', args: [bidId] });

  return {
    bid: bidResult.rows[0],
    updatedPrice: amount,
  };
}

async function getProductBids(auctionId, productId, productType, limit = 20) {
  const result = await db.execute({
    sql: `SELECT ab.id, ab.amount, ab.created_at,
                 abuyer.first_name AS buyer_first_name,
                 abuyer.last_name AS buyer_last_name
          FROM auction_bids ab
          JOIN auction_buyers abuyer ON ab.auction_buyer_id = abuyer.id
          WHERE ab.auction_id = ? AND ab.product_id = ? AND ab.product_type = ?
          ORDER BY ab.created_at DESC
          LIMIT ?`,
    args: [auctionId, productId, productType, limit],
  });
  return result.rows;
}

async function getWinningBids(auctionId) {
  const artBids = await db.execute({
    sql: `SELECT ab.product_id, ab.product_type, ab.auction_buyer_id AS buyer_id,
                 ab.amount, abuyer.email AS buyer_email,
                 abuyer.first_name AS buyer_first_name
          FROM auction_bids ab
          JOIN auction_buyers abuyer ON ab.auction_buyer_id = abuyer.id
          WHERE ab.auction_id = ? AND ab.product_type = 'art'
            AND ab.amount = (
              SELECT MAX(ab2.amount) FROM auction_bids ab2
              WHERE ab2.auction_id = ab.auction_id
                AND ab2.product_id = ab.product_id
                AND ab2.product_type = ab.product_type
            )`,
    args: [auctionId],
  });

  const otherBids = await db.execute({
    sql: `SELECT ab.product_id, ab.product_type, ab.auction_buyer_id AS buyer_id,
                 ab.amount, abuyer.email AS buyer_email,
                 abuyer.first_name AS buyer_first_name
          FROM auction_bids ab
          JOIN auction_buyers abuyer ON ab.auction_buyer_id = abuyer.id
          WHERE ab.auction_id = ? AND ab.product_type = 'other'
            AND ab.amount = (
              SELECT MAX(ab2.amount) FROM auction_bids ab2
              WHERE ab2.auction_id = ab.auction_id
                AND ab2.product_id = ab.product_id
                AND ab2.product_type = ab.product_type
            )`,
    args: [auctionId],
  });

  const mapRow = (r) => ({
    productId: r.product_id,
    productType: r.product_type,
    buyerId: r.buyer_id,
    amount: r.amount,
    buyerEmail: r.buyer_email,
    buyerFirstName: r.buyer_first_name,
  });

  return [...artBids.rows.map(mapRow), ...otherBids.rows.map(mapRow)];
}

// ---------------------------------------------------------------------------
// Auction Lifecycle
// ---------------------------------------------------------------------------

async function startAuction(id) {
  const current = await db.execute({ sql: 'SELECT * FROM auctions WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return null;
  if (current.rows[0].status !== 'scheduled') return null;

  await db.execute({
    sql: "UPDATE auctions SET status = 'active', original_end_datetime = end_datetime WHERE id = ?",
    args: [id],
  });

  await db.execute({ sql: "UPDATE auction_arts SET status = 'active' WHERE auction_id = ?", args: [id] });
  await db.execute({ sql: "UPDATE auction_others SET status = 'active' WHERE auction_id = ?", args: [id] });

  const updated = await db.execute({ sql: 'SELECT * FROM auctions WHERE id = ?', args: [id] });
  return updated.rows[0];
}

async function endAuction(id) {
  await db.execute({ sql: "UPDATE auctions SET status = 'finished' WHERE id = ?", args: [id] });

  // Process art products
  const arts = await db.execute({
    sql: 'SELECT art_id, current_price FROM auction_arts WHERE auction_id = ?',
    args: [id],
  });

  for (const art of arts.rows) {
    const bidCount = await db.execute({
      sql: "SELECT COUNT(*) AS cnt FROM auction_bids WHERE auction_id = ? AND product_id = ? AND product_type = 'art'",
      args: [id, art.art_id],
    });
    const hasBids = (bidCount.rows[0]?.cnt || 0) > 0;
    await db.execute({
      sql: 'UPDATE auction_arts SET end_price = current_price, status = ? WHERE auction_id = ? AND art_id = ?',
      args: [hasBids ? 'sold' : 'unsold', id, art.art_id],
    });
  }

  // Process other products
  const others = await db.execute({
    sql: 'SELECT other_id, current_price FROM auction_others WHERE auction_id = ?',
    args: [id],
  });

  for (const other of others.rows) {
    const bidCount = await db.execute({
      sql: "SELECT COUNT(*) AS cnt FROM auction_bids WHERE auction_id = ? AND product_id = ? AND product_type = 'other'",
      args: [id, other.other_id],
    });
    const hasBids = (bidCount.rows[0]?.cnt || 0) > 0;
    await db.execute({
      sql: 'UPDATE auction_others SET end_price = current_price, status = ? WHERE auction_id = ? AND other_id = ?',
      args: [hasBids ? 'sold' : 'unsold', id, other.other_id],
    });
  }

  const updated = await db.execute({ sql: 'SELECT * FROM auctions WHERE id = ?', args: [id] });
  return updated.rows[0];
}

async function extendAuction(id, minutes) {
  const current = await db.execute({ sql: 'SELECT * FROM auctions WHERE id = ?', args: [id] });
  if (current.rows.length === 0) return null;

  const currentEnd = new Date(current.rows[0].end_datetime);
  const newEnd = new Date(currentEnd.getTime() + minutes * 60 * 1000);

  await db.execute({
    sql: 'UPDATE auctions SET end_datetime = ? WHERE id = ?',
    args: [newEnd.toISOString(), id],
  });

  const updated = await db.execute({ sql: 'SELECT * FROM auctions WHERE id = ?', args: [id] });
  return updated.rows[0];
}

// ---------------------------------------------------------------------------
// Postal Codes
// ---------------------------------------------------------------------------

async function getPostalCodesForProduct(auctionId, productId, productType) {
  let sql, args;

  if (productType === 'art') {
    sql = `SELECT pc.* FROM auction_arts_postal_codes aapc
           JOIN postal_codes pc ON aapc.postal_code_id = pc.id
           WHERE aapc.auction_id = ? AND aapc.art_id = ?`;
    args = [auctionId, productId];
  } else if (productType === 'other') {
    sql = `SELECT pc.* FROM auction_others_postal_codes aopc
           JOIN postal_codes pc ON aopc.postal_code_id = pc.id
           WHERE aopc.auction_id = ? AND aopc.other_id = ?`;
    args = [auctionId, productId];
  } else {
    throw new Error(`Invalid product type: '${productType}'`);
  }

  const result = await db.execute({ sql, args });
  return result.rows;
}

async function listPostalCodes(country) {
  let sql = 'SELECT * FROM postal_codes';
  const args = [];

  if (country) {
    sql += ' WHERE country = ?';
    args.push(country);
  }

  sql += ' ORDER BY postal_code ASC';

  const result = await db.execute({ sql, args });
  return result.rows;
}

/**
 * Search postal codes by postal_code or city (for async multi-select).
 * @param {string} query - Search term (min 3 chars)
 * @param {number} limit - Max results (default 50)
 * @returns {Array} Matching postal codes
 */
async function searchPostalCodes(query, limit = 50) {
  if (!query || query.length < 3) {
    return [];
  }

  const searchPattern = `%${query}%`;

  const result = await db.execute({
    sql: `SELECT * FROM postal_codes
          WHERE postal_code LIKE ? OR city LIKE ?
          ORDER BY postal_code ASC
          LIMIT ?`,
    args: [searchPattern, searchPattern, limit],
  });

  return result.rows;
}

/**
 * Get postal codes by IDs (for loading pre-selected values).
 * @param {Array<number>} ids - Array of postal code IDs
 * @returns {Array} Postal codes matching the IDs
 */
async function getPostalCodesByIds(ids) {
  if (!ids || ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT * FROM postal_codes WHERE id IN (${placeholders}) ORDER BY postal_code ASC`,
    args: ids,
  });

  return result.rows;
}

// ---------------------------------------------------------------------------
// Payment Data
// ---------------------------------------------------------------------------

async function getBuyerPaymentData(auctionBuyerId) {
  const result = await db.execute({
    sql: 'SELECT * FROM auction_authorised_payment_data WHERE auction_buyer_id = ?',
    args: [auctionBuyerId],
  });
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function savePaymentData(auctionBuyerId, {
  name, lastFour, stripeSetupIntentId, stripePaymentMethodId, stripeCustomerId,
}) {
  const id = generateUUID();

  await db.execute({
    sql: `INSERT INTO auction_authorised_payment_data (
            id, auction_buyer_id, name, last_four,
            stripe_setup_intent_id, stripe_payment_method_id, stripe_customer_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, auctionBuyerId, name || null, lastFour || null,
      stripeSetupIntentId || null, stripePaymentMethodId || null, stripeCustomerId || null,
    ],
  });

  const result = await db.execute({
    sql: 'SELECT * FROM auction_authorised_payment_data WHERE id = ?',
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
  createAuction,
  updateAuction,
  deleteAuction,
  getAuctionById,
  listAuctions,
  getAuctionsByDateRange,
  getAuctionsForDate,
  addProductToAuction,
  removeProductFromAuction,
  setProductPostalCodes,
  assignSellersToAuction,
  createOrGetAuctionBuyer,
  verifyBidPassword,
  getAuctionBuyer,
  placeBid,
  getProductBids,
  getWinningBids,
  startAuction,
  endAuction,
  extendAuction,
  getPostalCodesForProduct,
  listPostalCodes,
  searchPostalCodes,
  getPostalCodesByIds,
  getBuyerPaymentData,
  savePaymentData,
};
