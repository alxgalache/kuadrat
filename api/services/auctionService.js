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

  // Get postal refs for each product
  for (const art of artsResult.rows) {
    art.postal_refs = await getPostalRefsForProduct(id, art.art_id, 'art');
    art.product_type = 'art';
    art.product_id = art.art_id;
  }

  for (const other of othersResult.rows) {
    other.postal_refs = await getPostalRefsForProduct(id, other.other_id, 'other');
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
  let sql = `SELECT a.*,
    (SELECT COUNT(*) FROM auction_arts WHERE auction_id = a.id) +
    (SELECT COUNT(*) FROM auction_others WHERE auction_id = a.id) AS product_count
    FROM auctions a`;
  const args = [];
  const conditions = [];

  if (filters.status) {
    conditions.push('a.status = ?');
    args.push(filters.status);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY a.start_datetime DESC';

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

  const auctions = result.rows;

  // Fetch seller breakdown per auction (products per seller)
  if (auctions.length > 0) {
    const auctionIds = auctions.map((a) => a.id);
    const placeholders = auctionIds.map(() => '?').join(', ');

    const sellersResult = await db.execute({
      sql: `SELECT auction_id, seller_id, seller_name, SUM(cnt) AS product_count
            FROM (
              SELECT aa.auction_id, a.seller_id, u.full_name AS seller_name, COUNT(*) AS cnt
              FROM auction_arts aa
              JOIN art a ON aa.art_id = a.id
              LEFT JOIN users u ON a.seller_id = u.id
              WHERE aa.auction_id IN (${placeholders})
              GROUP BY aa.auction_id, a.seller_id
              UNION ALL
              SELECT ao.auction_id, o.seller_id, u.full_name AS seller_name, COUNT(*) AS cnt
              FROM auction_others ao
              JOIN others o ON ao.other_id = o.id
              LEFT JOIN users u ON o.seller_id = u.id
              WHERE ao.auction_id IN (${placeholders})
              GROUP BY ao.auction_id, o.seller_id
            )
            GROUP BY auction_id, seller_id
            ORDER BY product_count DESC`,
      args: [...auctionIds, ...auctionIds],
    });

    // Group sellers by auction
    const sellersByAuction = {};
    for (const row of sellersResult.rows) {
      if (!sellersByAuction[row.auction_id]) {
        sellersByAuction[row.auction_id] = [];
      }
      sellersByAuction[row.auction_id].push({
        sellerId: row.seller_id,
        sellerName: row.seller_name,
        productCount: row.product_count,
      });
    }

    for (const auction of auctions) {
      auction.sellers_summary = sellersByAuction[auction.id] || [];
    }

    // Fetch first 4 product previews per auction (for grid display)
    const previewsResult = await db.execute({
      sql: `SELECT * FROM (
              SELECT combined.*, ROW_NUMBER() OVER (PARTITION BY combined.auction_id ORDER BY combined.position ASC) AS rn
              FROM (
                SELECT aa.auction_id, a.basename, a.name, 'art' AS product_type,
                       u.full_name AS seller_name, aa.start_price, aa.current_price, aa.position
                FROM auction_arts aa
                JOIN art a ON aa.art_id = a.id
                LEFT JOIN users u ON a.seller_id = u.id
                WHERE aa.auction_id IN (${placeholders})
                UNION ALL
                SELECT ao.auction_id, o.basename, o.name, 'other' AS product_type,
                       u.full_name AS seller_name, ao.start_price, ao.current_price, ao.position
                FROM auction_others ao
                JOIN others o ON ao.other_id = o.id
                LEFT JOIN users u ON o.seller_id = u.id
                WHERE ao.auction_id IN (${placeholders})
              ) combined
            )
            WHERE rn <= 4
            ORDER BY auction_id, position ASC`,
      args: [...auctionIds, ...auctionIds],
    });

    // Group previews by auction
    const previewsByAuction = {};
    for (const row of previewsResult.rows) {
      if (!previewsByAuction[row.auction_id]) {
        previewsByAuction[row.auction_id] = [];
      }
      previewsByAuction[row.auction_id].push({
        basename: row.basename,
        name: row.name,
        product_type: row.product_type,
        seller_name: row.seller_name,
        start_price: row.start_price,
        current_price: row.current_price,
      });
    }

    for (const auction of auctions) {
      auction.product_previews = previewsByAuction[auction.id] || [];
    }
  }

  return auctions;
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

async function setProductPostalCodes(auctionId, productId, productType, postalRefs) {
  const table = productType === 'art' ? 'auction_arts_postal_codes' : 'auction_others_postal_codes';
  const fkCol = productType === 'art' ? 'art_id' : 'other_id';

  if (!['art', 'other'].includes(productType)) {
    throw new Error(`Invalid product type: '${productType}'`);
  }

  // Delete existing refs
  await db.execute({
    sql: `DELETE FROM ${table} WHERE auction_id = ? AND ${fkCol} = ?`,
    args: [auctionId, productId],
  });

  // Insert new refs
  for (const ref of postalRefs) {
    const id = generateUUID();
    await db.execute({
      sql: `INSERT INTO ${table} (id, auction_id, ${fkCol}, ref_type, postal_code_id, ref_value) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        auctionId,
        productId,
        ref.ref_type || 'postal_code',
        ref.ref_type === 'postal_code' ? (ref.postal_code_id || ref.id) : null,
        ref.ref_type !== 'postal_code' ? ref.ref_value : null,
      ],
    });
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
  firstName, lastName, email, dni,
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
            id, auction_id, first_name, last_name, email, dni, bid_password,
            delivery_address_1, delivery_address_2, delivery_postal_code,
            delivery_city, delivery_province, delivery_country,
            invoicing_address_1, invoicing_address_2, invoicing_postal_code,
            invoicing_city, invoicing_province, invoicing_country
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, auctionId, firstName, lastName, email, dni || null, bidPassword,
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

async function placeBid(auctionId, auctionBuyerId, productId, productType, amount, expectedPrice) {
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

  // Early check: if caller provided an expected price, validate it matches
  if (expectedPrice !== undefined && expectedPrice !== null) {
    if (parseFloat(expectedPrice) !== parseFloat(current_price)) {
      throw new Error('El precio ha cambiado. Por favor, inténtalo de nuevo.');
    }
  }

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

async function getPostalRefsForProduct(auctionId, productId, productType) {
  const table = productType === 'art' ? 'auction_arts_postal_codes' : 'auction_others_postal_codes';
  const fkCol = productType === 'art' ? 'art_id' : 'other_id';

  if (!['art', 'other'].includes(productType)) {
    throw new Error(`Invalid product type: '${productType}'`);
  }

  const result = await db.execute({
    sql: `SELECT t.ref_type, t.postal_code_id, t.ref_value,
                 pc.postal_code, pc.city, pc.province, pc.country
          FROM ${table} t
          LEFT JOIN postal_codes pc ON t.postal_code_id = pc.id AND t.ref_type = 'postal_code'
          WHERE t.auction_id = ? AND t.${fkCol} = ?`,
    args: [auctionId, productId],
  });

  return result.rows.map(row => {
    if (row.ref_type === 'postal_code') {
      return {
        ref_type: 'postal_code',
        id: row.postal_code_id,
        postal_code: row.postal_code,
        city: row.city,
        province: row.province,
        country: row.country,
      };
    }
    return {
      ref_type: row.ref_type,
      ref_value: row.ref_value,
    };
  });
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
 * Search postal codes, provinces, and countries (for async multi-select).
 * Returns country and province group results first, then individual postal codes.
 * @param {string} query - Search term (min 3 chars)
 * @param {number} limit - Max individual postal code results (default 50)
 * @returns {Array} Mixed results with ref_type field
 */
// Static mapping of country codes to full names for search matching.
// Allows typing "España" (3+ chars) to find country code "ES".
const COUNTRY_NAMES = {
  ES: 'España',
  PT: 'Portugal',
  FR: 'Francia',
  IT: 'Italia',
  DE: 'Alemania',
  GB: 'Reino Unido',
  AD: 'Andorra',
};

async function searchPostalCodes(query, limit = 50) {
  if (!query || query.length < 3) {
    return [];
  }

  const searchPattern = `%${query}%`;
  const queryLower = query.toLowerCase();
  const results = [];

  // 1. Search matching countries by full name (e.g. "Esp" → "España" → "ES")
  const matchedCountryCodes = Object.entries(COUNTRY_NAMES)
    .filter(([, name]) => name.toLowerCase().includes(queryLower))
    .map(([code]) => code);

  if (matchedCountryCodes.length > 0) {
    const placeholders = matchedCountryCodes.map(() => '?').join(', ');
    const countryResult = await db.execute({
      sql: `SELECT DISTINCT country FROM postal_codes
            WHERE country IN (${placeholders})
            ORDER BY country ASC
            LIMIT 5`,
      args: matchedCountryCodes,
    });
    for (const row of countryResult.rows) {
      results.push({
        ref_type: 'country',
        ref_value: row.country,
      });
    }
  }

  // 2. Search matching provinces
  const provinceResult = await db.execute({
    sql: `SELECT DISTINCT province, country FROM postal_codes
          WHERE province LIKE ?
          ORDER BY province ASC
          LIMIT 5`,
    args: [searchPattern],
  });
  for (const row of provinceResult.rows) {
    results.push({
      ref_type: 'province',
      ref_value: row.province,
      country: row.country,
    });
  }

  // 3. Search individual postal codes (by postal_code, city, or province)
  const pcResult = await db.execute({
    sql: `SELECT * FROM postal_codes
          WHERE postal_code LIKE ? OR city LIKE ? OR province LIKE ?
          ORDER BY postal_code ASC
          LIMIT ?`,
    args: [searchPattern, searchPattern, searchPattern, limit],
  });
  for (const row of pcResult.rows) {
    results.push({
      ref_type: 'postal_code',
      ...row,
    });
  }

  return results;
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

/**
 * Resolve an array of postal refs back to their display format.
 * Used to pre-populate the PostalCodeSelect with saved refs.
 * @param {Array} refs - [{ ref_type, postal_code_id?, ref_value? }, ...]
 * @returns {Array} Refs with display data
 */
async function getPostalRefsByRefs(refs) {
  if (!refs || refs.length === 0) return [];

  const results = [];

  for (const ref of refs) {
    if (ref.ref_type === 'postal_code' && ref.postal_code_id) {
      const r = await db.execute({
        sql: 'SELECT * FROM postal_codes WHERE id = ?',
        args: [ref.postal_code_id],
      });
      if (r.rows.length > 0) {
        results.push({ ref_type: 'postal_code', ...r.rows[0] });
      }
    } else if (ref.ref_type === 'province' && ref.ref_value) {
      results.push({
        ref_type: 'province',
        ref_value: ref.ref_value,
        country: ref.country || null,
      });
    } else if (ref.ref_type === 'country' && ref.ref_value) {
      results.push({
        ref_type: 'country',
        ref_value: ref.ref_value,
      });
    }
  }

  return results;
}

/**
 * Validate whether a given postal code string is allowed by a set of postal refs.
 * Used by BidModal to check delivery address validity.
 * @param {string} auctionId
 * @param {number} productId
 * @param {string} productType - 'art' or 'other'
 * @param {string} postalCode - The buyer's postal code string
 * @returns {{ valid: boolean }}
 */
async function validatePostalCodeForProduct(auctionId, productId, productType, postalCode) {
  const table = productType === 'art' ? 'auction_arts_postal_codes' : 'auction_others_postal_codes';
  const fkCol = productType === 'art' ? 'art_id' : 'other_id';

  // Check if there are any refs at all
  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM ${table} WHERE auction_id = ? AND ${fkCol} = ?`,
    args: [auctionId, productId],
  });

  if (countResult.rows[0].cnt === 0) {
    return { valid: true }; // No restrictions
  }

  // Check direct postal_code ref
  const pcMatch = await db.execute({
    sql: `SELECT 1 FROM ${table} t
          JOIN postal_codes pc ON t.postal_code_id = pc.id
          WHERE t.auction_id = ? AND t.${fkCol} = ?
            AND t.ref_type = 'postal_code'
            AND pc.postal_code = ?
          LIMIT 1`,
    args: [auctionId, productId, postalCode],
  });
  if (pcMatch.rows.length > 0) return { valid: true };

  // Check province ref
  const provMatch = await db.execute({
    sql: `SELECT 1 FROM ${table} t
          WHERE t.auction_id = ? AND t.${fkCol} = ?
            AND t.ref_type = 'province'
            AND EXISTS (
              SELECT 1 FROM postal_codes pc
              WHERE pc.postal_code = ? AND pc.province = t.ref_value
            )
          LIMIT 1`,
    args: [auctionId, productId, postalCode],
  });
  if (provMatch.rows.length > 0) return { valid: true };

  // Check country ref
  const countryMatch = await db.execute({
    sql: `SELECT 1 FROM ${table} t
          WHERE t.auction_id = ? AND t.${fkCol} = ?
            AND t.ref_type = 'country'
            AND EXISTS (
              SELECT 1 FROM postal_codes pc
              WHERE pc.postal_code = ? AND pc.country = t.ref_value
            )
          LIMIT 1`,
    args: [auctionId, productId, postalCode],
  });
  if (countryMatch.rows.length > 0) return { valid: true };

  return { valid: false };
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
// Admin: bids listing with buyer info
// ---------------------------------------------------------------------------

async function getAuctionBidsWithBuyers(auctionId) {
  const result = await db.execute({
    sql: `SELECT
            b.id AS bid_id,
            b.auction_id,
            b.product_id,
            b.product_type,
            b.amount,
            b.created_at AS bid_created_at,
            ab.id AS buyer_id,
            ab.first_name,
            ab.last_name,
            ab.email,
            ab.delivery_address_1,
            ab.delivery_postal_code,
            ab.delivery_city,
            ab.delivery_province,
            ab.delivery_country,
            COALESCE(a.name, o.name) AS product_name
          FROM auction_bids b
          INNER JOIN auction_buyers ab ON b.auction_buyer_id = ab.id
          LEFT JOIN art a ON b.product_type = 'art' AND b.product_id = a.id
          LEFT JOIN others o ON b.product_type = 'other' AND b.product_id = o.id
          WHERE b.auction_id = ?
          ORDER BY b.created_at DESC`,
    args: [auctionId],
  });
  return result.rows;
}

// ---------------------------------------------------------------------------
// Admin: get full billing data for a single bid
// ---------------------------------------------------------------------------

async function getBidBillingData(bidId) {
  const result = await db.execute({
    sql: `SELECT
            b.id AS bid_id,
            b.auction_id,
            b.product_id,
            b.product_type,
            b.amount,
            ab.id AS buyer_id,
            ab.first_name,
            ab.last_name,
            ab.email,
            ab.delivery_address_1,
            ab.delivery_address_2,
            ab.delivery_postal_code,
            ab.delivery_city,
            ab.delivery_province,
            ab.delivery_country,
            ab.delivery_lat,
            ab.delivery_long,
            ab.invoicing_address_1,
            ab.invoicing_address_2,
            ab.invoicing_postal_code,
            ab.invoicing_city,
            ab.invoicing_province,
            ab.invoicing_country,
            apd.stripe_customer_id,
            apd.stripe_payment_method_id,
            COALESCE(a.seller_id, o.seller_id) AS seller_id,
            COALESCE(a.name, o.name) AS product_name,
            COALESCE(a.basename, o.basename) AS basename,
            a.type AS art_type
          FROM auction_bids b
          INNER JOIN auction_buyers ab ON b.auction_buyer_id = ab.id
          LEFT JOIN auction_authorised_payment_data apd ON apd.auction_buyer_id = ab.id
          LEFT JOIN art a ON b.product_type = 'art' AND b.product_id = a.id
          LEFT JOIN others o ON b.product_type = 'other' AND b.product_id = o.id
          WHERE b.id = ?`,
    args: [bidId],
  });
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// DNI / Email Verification Helpers
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

async function checkEmailUniqueness(auctionId, email) {
  const result = await db.execute({
    sql: 'SELECT 1 FROM auction_buyers WHERE email = ? AND auction_id = ? LIMIT 1',
    args: [email.toLowerCase().trim(), auctionId],
  });
  return result.rows.length === 0;
}

async function checkDniUniqueness(auctionId, dni) {
  const result = await db.execute({
    sql: 'SELECT 1 FROM auction_buyers WHERE dni = ? AND auction_id = ? LIMIT 1',
    args: [dni.toUpperCase().trim(), auctionId],
  });
  return result.rows.length === 0;
}

async function hasBuyerCompletedRegistration(auctionId, email, dni) {
  const result = await db.execute({
    sql: `SELECT 1 FROM auction_buyers ab
          INNER JOIN auction_authorised_payment_data apd ON apd.auction_buyer_id = ab.id
          WHERE ab.auction_id = ? AND (ab.email = ? OR ab.dni = ?)
          LIMIT 1`,
    args: [auctionId, email.toLowerCase().trim(), dni.toUpperCase().trim()],
  });
  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Email OTP Verification
// ---------------------------------------------------------------------------

function generateOTPCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createEmailVerification(email, auctionId, ipAddress = null) {
  await db.execute({
    sql: 'DELETE FROM auction_email_verifications WHERE email = ? AND auction_id = ?',
    args: [email, auctionId],
  });

  const id = generateUUID();
  const code = generateOTPCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.execute({
    sql: `INSERT INTO auction_email_verifications (id, email, auction_id, code, expires_at, ip_address)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, email, auctionId, code, expiresAt, ipAddress || null],
  });

  return code;
}

async function verifyEmailCode(email, auctionId, code) {
  const result = await db.execute({
    sql: `SELECT * FROM auction_email_verifications
          WHERE email = ? AND auction_id = ? AND verified = 0
          ORDER BY created_at DESC LIMIT 1`,
    args: [email, auctionId],
  });

  if (result.rows.length === 0) {
    return { valid: false, error: 'No se encontró una verificación pendiente' };
  }

  const verification = result.rows[0];

  if (new Date(verification.expires_at) < new Date()) {
    return { valid: false, error: 'El código ha expirado. Solicita uno nuevo' };
  }

  if (verification.attempts >= 5) {
    return { valid: false, error: 'Demasiados intentos. Solicita un nuevo código' };
  }

  if (verification.code !== code) {
    await db.execute({
      sql: 'UPDATE auction_email_verifications SET attempts = attempts + 1 WHERE id = ?',
      args: [verification.id],
    });
    return { valid: false, error: 'Código incorrecto' };
  }

  await db.execute({
    sql: 'UPDATE auction_email_verifications SET verified = 1 WHERE id = ?',
    args: [verification.id],
  });

  return { valid: true };
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
  getPostalRefsForProduct,
  listPostalCodes,
  searchPostalCodes,
  getPostalCodesByIds,
  getPostalRefsByRefs,
  validatePostalCodeForProduct,
  getBuyerPaymentData,
  savePaymentData,
  getAuctionBidsWithBuyers,
  getBidBillingData,
  validateDNI,
  checkEmailUniqueness,
  checkDniUniqueness,
  hasBuyerCompletedRegistration,
  createEmailVerification,
  verifyEmailCode,
};
