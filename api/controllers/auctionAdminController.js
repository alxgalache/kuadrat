const auctionService = require('../services/auctionService');
const { db } = require('../config/database');

/**
 * POST /api/admin/auctions
 * Create a new auction with products, postal codes, and seller assignments
 */
const createAuction = async (req, res, next) => {
  try {
    const { name, description, start_datetime, end_datetime, status, products, user_ids } = req.body;

    if (!name || !start_datetime || !end_datetime) {
      return res.status(400).json({
        success: false,
        title: 'Datos incompletos',
        message: 'Nombre, fecha de inicio y fecha de fin son obligatorios',
      });
    }

    if (new Date(start_datetime) >= new Date(end_datetime)) {
      return res.status(400).json({
        success: false,
        title: 'Fechas inválidas',
        message: 'La fecha de inicio debe ser anterior a la fecha de fin',
      });
    }

    // Create the auction
    const auction = await auctionService.createAuction({ name, description, start_datetime, end_datetime, status });

    // Add products if provided
    if (products && products.length > 0) {
      for (const product of products) {
        await auctionService.addProductToAuction(auction.id, {
          productId: product.id,
          productType: product.type,
          startPrice: product.start_price,
          stepNewBid: product.step_new_bid,
          position: product.position || 0,
          shippingObservations: product.shipping_observations || null,
        });

        // Set postal refs for each product
        const refs = product.postal_refs || [];
        if (refs.length > 0) {
          await auctionService.setProductPostalCodes(
            auction.id,
            product.id,
            product.type,
            refs
          );
        }
      }
    }

    // Assign sellers if provided
    if (user_ids && user_ids.length > 0) {
      await auctionService.assignSellersToAuction(auction.id, user_ids);
    } else if (products && products.length > 0) {
      // Auto-detect sellers from products
      const sellerIds = new Set();
      for (const product of products) {
        const table = product.type === 'art' ? 'art' : 'others';
        const result = await db.execute({
          sql: `SELECT seller_id FROM ${table} WHERE id = ?`,
          args: [product.id],
        });
        if (result.rows.length > 0) {
          sellerIds.add(result.rows[0].seller_id);
        }
      }
      if (sellerIds.size > 0) {
        await auctionService.assignSellersToAuction(auction.id, [...sellerIds]);
      }
    }

    // Fetch full auction details
    const fullAuction = await auctionService.getAuctionById(auction.id);

    res.status(201).json({
      success: true,
      title: 'Subasta creada',
      message: 'La subasta se ha creado correctamente',
      auction: fullAuction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/auctions
 * List all auctions with optional status filter
 */
const listAuctions = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filters = {};
    if (status) filters.status = status;

    const auctions = await auctionService.listAuctions(filters);

    res.status(200).json({
      success: true,
      auctions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/auctions/:id
 * Get full auction details
 */
const getAuction = async (req, res, next) => {
  try {
    const auction = await auctionService.getAuctionById(req.params.id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        title: 'No encontrada',
        message: 'Subasta no encontrada',
      });
    }

    res.status(200).json({
      success: true,
      auction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/auctions/:id
 * Update auction (only if draft or scheduled)
 */
const updateAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, start_datetime, end_datetime, status, products, user_ids } = req.body;

    const auction = await auctionService.updateAuction(id, {
      name,
      description,
      start_datetime,
      end_datetime,
      status,
    });

    if (!auction) {
      return res.status(404).json({
        success: false,
        title: 'No encontrada',
        message: 'Subasta no encontrada o no se puede modificar en su estado actual',
      });
    }

    // Update products if provided
    if (products !== undefined) {
      // Remove existing products
      const existingArts = await db.execute({
        sql: 'SELECT id, art_id FROM auction_arts WHERE auction_id = ?',
        args: [id],
      });
      for (const row of existingArts.rows) {
        await auctionService.removeProductFromAuction(id, row.art_id, 'art');
      }
      const existingOthers = await db.execute({
        sql: 'SELECT id, other_id FROM auction_others WHERE auction_id = ?',
        args: [id],
      });
      for (const row of existingOthers.rows) {
        await auctionService.removeProductFromAuction(id, row.other_id, 'other');
      }

      // Add new products
      for (const product of products) {
        await auctionService.addProductToAuction(id, {
          productId: product.product_id || product.id,
          productType: product.product_type || product.type,
          startPrice: product.start_price,
          stepNewBid: product.step_new_bid,
          position: product.position || 0,
          shippingObservations: product.shipping_observations || null,
        });

        const refs = product.postal_refs || [];
        if (refs.length > 0) {
          await auctionService.setProductPostalCodes(id, product.product_id || product.id, product.product_type || product.type, refs);
        }
      }
    }

    // Update sellers if provided
    if (user_ids !== undefined) {
      await auctionService.assignSellersToAuction(id, user_ids);
    }

    const fullAuction = await auctionService.getAuctionById(id);

    res.status(200).json({
      success: true,
      title: 'Subasta actualizada',
      message: 'La subasta se ha actualizado correctamente',
      auction: fullAuction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/auctions/:id
 * Delete auction (only if draft or cancelled)
 */
const deleteAuction = async (req, res, next) => {
  try {
    const result = await auctionService.deleteAuction(req.params.id);

    if (!result) {
      return res.status(400).json({
        success: false,
        title: 'No se puede eliminar',
        message: 'Solo se pueden eliminar subastas en estado borrador o canceladas',
      });
    }

    res.status(200).json({
      success: true,
      title: 'Subasta eliminada',
      message: 'La subasta se ha eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/auctions/:id/start
 * Manually start an auction
 */
const startAuction = async (req, res, next) => {
  try {
    const auction = await auctionService.startAuction(req.params.id);

    if (!auction) {
      return res.status(400).json({
        success: false,
        title: 'No se puede iniciar',
        message: 'Solo se pueden iniciar subastas programadas',
      });
    }

    // Broadcast via Socket.IO if available
    const auctionSocket = req.app.get('auctionSocket');
    if (auctionSocket) {
      auctionSocket.broadcastAuctionStarted(auction.id);
    }

    res.status(200).json({
      success: true,
      title: 'Subasta iniciada',
      message: 'La subasta se ha iniciado correctamente',
      auction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/auctions/:id/cancel
 * Cancel an auction
 */
const cancelAuction = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check current status
    const current = await db.execute({
      sql: 'SELECT id, status FROM auctions WHERE id = ?',
      args: [id],
    });

    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        title: 'No encontrada',
        message: 'Subasta no encontrada',
      });
    }

    if (current.rows[0].status === 'finished') {
      return res.status(400).json({
        success: false,
        title: 'No se puede cancelar',
        message: 'No se pueden cancelar subastas finalizadas',
      });
    }

    await db.execute({
      sql: "UPDATE auctions SET status = 'cancelled' WHERE id = ?",
      args: [id],
    });

    // Update product statuses
    await db.execute({
      sql: "UPDATE auction_arts SET status = 'unsold' WHERE auction_id = ?",
      args: [id],
    });
    await db.execute({
      sql: "UPDATE auction_others SET status = 'unsold' WHERE auction_id = ?",
      args: [id],
    });

    // Broadcast cancellation
    const auctionSocket = req.app.get('auctionSocket');
    if (auctionSocket) {
      auctionSocket.broadcastAuctionEnded(id);
    }

    res.status(200).json({
      success: true,
      title: 'Subasta cancelada',
      message: 'La subasta se ha cancelado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/postal-codes
 * List all postal codes for multi-select
 */
const listPostalCodes = async (req, res, next) => {
  try {
    const { country } = req.query;
    const postalCodes = await auctionService.listPostalCodes(country);

    res.status(200).json({
      success: true,
      postalCodes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/postal-codes
 * Create a new postal code entry
 */
const createPostalCode = async (req, res, next) => {
  try {
    const { postal_code, city, province, country } = req.body;

    if (!postal_code) {
      return res.status(400).json({
        success: false,
        title: 'Datos incompletos',
        message: 'El código postal es obligatorio',
      });
    }

    const result = await db.execute({
      sql: 'INSERT INTO postal_codes (postal_code, city, province, country) VALUES (?, ?, ?, ?)',
      args: [postal_code, city || null, province || null, country || 'ES'],
    });

    res.status(201).json({
      success: true,
      title: 'Código postal creado',
      message: 'Código postal añadido correctamente',
      postalCode: {
        id: Number(result.lastInsertRowid),
        postal_code,
        city,
        province,
        country: country || 'ES',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/postal-codes/search?q=...
 * Search postal codes, provinces, and countries (async multi-select).
 * Returns mixed results with ref_type field.
 */
const searchPostalCodes = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 3) {
      return res.status(200).json({
        success: true,
        postalCodes: [],
      });
    }

    const postalCodes = await auctionService.searchPostalCodes(q, 50);

    res.status(200).json({
      success: true,
      postalCodes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/postal-codes/by-ids?ids=1,2,3
 * Get postal codes by IDs (for loading pre-selected values)
 */
const getPostalCodesByIds = async (req, res, next) => {
  try {
    const { ids } = req.query;

    if (!ids) {
      return res.status(200).json({
        success: true,
        postalCodes: [],
      });
    }

    const idArray = ids.split(',').map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));

    if (idArray.length === 0) {
      return res.status(200).json({
        success: true,
        postalCodes: [],
      });
    }

    const postalCodes = await auctionService.getPostalCodesByIds(idArray);

    res.status(200).json({
      success: true,
      postalCodes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/postal-codes/by-refs
 * Resolve an array of postal refs back to their display format.
 * Body: { refs: [{ ref_type, postal_code_id?, ref_value?, country? }] }
 */
const getPostalCodesByRefs = async (req, res, next) => {
  try {
    const { refs } = req.body;

    if (!refs || !Array.isArray(refs) || refs.length === 0) {
      return res.status(200).json({
        success: true,
        postalCodes: [],
      });
    }

    const postalCodes = await auctionService.getPostalRefsByRefs(refs);

    res.status(200).json({
      success: true,
      postalCodes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/products/for-auction
 * List products eligible for auction (for_auction=1, is_sold=0, approved)
 */
const getProductsForAuction = async (req, res, next) => {
  try {
    // Optional: exclude products from a specific auction (used when editing)
    const { excludeAuctionId } = req.query;

    // Get art products that are:
    // - marked for auction (for_auction = 1)
    // - not sold
    // - approved
    // - not removed
    // - NOT already assigned to another auction (unless it's the auction being edited)
    let artSql = `
      SELECT a.id, a.name, a.price, a.basename, a.seller_id, u.full_name as seller_name, 'art' as product_type
      FROM art a
      LEFT JOIN users u ON a.seller_id = u.id
      WHERE a.for_auction = 1 AND a.is_sold = 0 AND a.status = 'approved' AND a.removed = 0
        AND NOT EXISTS (
          SELECT 1 FROM auction_arts aa
          JOIN auctions auc ON aa.auction_id = auc.id
          WHERE aa.art_id = a.id
    `;
    const artArgs = [];

    if (excludeAuctionId) {
      artSql += ` AND auc.id != ?`;
      artArgs.push(excludeAuctionId);
    }
    artSql += `)`;

    const artResult = await db.execute({ sql: artSql, args: artArgs });

    // Get others products with the same logic
    let othersSql = `
      SELECT o.id, o.name, o.price, o.basename, o.seller_id, u.full_name as seller_name, 'other' as product_type
      FROM others o
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.for_auction = 1 AND o.is_sold = 0 AND o.status = 'approved' AND o.removed = 0
        AND NOT EXISTS (
          SELECT 1 FROM auction_others ao
          JOIN auctions auc ON ao.auction_id = auc.id
          WHERE ao.other_id = o.id
    `;
    const othersArgs = [];

    if (excludeAuctionId) {
      othersSql += ` AND auc.id != ?`;
      othersArgs.push(excludeAuctionId);
    }
    othersSql += `)`;

    const othersResult = await db.execute({ sql: othersSql, args: othersArgs });

    const products = [...artResult.rows, ...othersResult.rows];

    res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAuction,
  listAuctions,
  getAuction,
  updateAuction,
  deleteAuction,
  startAuction,
  cancelAuction,
  listPostalCodes,
  searchPostalCodes,
  getPostalCodesByIds,
  getPostalCodesByRefs,
  createPostalCode,
  getProductsForAuction,
};
