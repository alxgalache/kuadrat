const cron = require('node-cron');
const { db } = require('../config/database');
const auctionService = require('../services/auctionService');
const drawService = require('../services/drawService');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Auction lifecycle scheduler
 * Runs every 30 seconds to:
 * 1. Start scheduled auctions whose start_datetime has passed
 * 2. End active auctions whose end_datetime has passed
 */
module.exports = function startAuctionScheduler(app) {
  const auctionSocket = app.get('auctionSocket');
  const drawSocket = app.get('drawSocket');

  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const now = new Date().toISOString();

      // 1. Start scheduled auctions
      const scheduledAuctions = await db.execute({
        sql: "SELECT id FROM auctions WHERE status = 'scheduled' AND start_datetime <= ?",
        args: [now],
      });

      for (const auction of scheduledAuctions.rows) {
        try {
          logger.info({ auctionId: auction.id }, 'Scheduler: Starting auction');
          await auctionService.startAuction(auction.id);
          if (auctionSocket) {
            auctionSocket.broadcastAuctionStarted(auction.id);
          }
        } catch (err) {
          logger.error({ auctionId: auction.id, err }, 'Scheduler: Error starting auction');
        }
      }

      // 2. End active auctions whose end_datetime has passed
      const endedAuctions = await db.execute({
        sql: "SELECT id FROM auctions WHERE status = 'active' AND end_datetime <= ?",
        args: [now],
      });

      for (const auction of endedAuctions.rows) {
        try {
          logger.info({ auctionId: auction.id }, 'Scheduler: Ending auction');
          await processAuctionEnd(auction.id, app);
        } catch (err) {
          logger.error({ auctionId: auction.id, err }, 'Scheduler: Error ending auction');
        }
      }
      // ── Draw lifecycle ──────────────────────────────────────

      // 3. Start scheduled draws
      const scheduledDraws = await db.execute({
        sql: "SELECT id FROM draws WHERE status = 'scheduled' AND start_datetime <= ?",
        args: [now],
      });

      for (const draw of scheduledDraws.rows) {
        try {
          logger.info({ drawId: draw.id }, 'Scheduler: Starting draw');
          await drawService.startDraw(draw.id);
        } catch (err) {
          logger.error({ drawId: draw.id, err }, 'Scheduler: Error starting draw');
        }
      }

      console.log('Scheduler: Tick completed NOW', now)
      // 4. End active draws whose end_datetime has passed
      const endedDraws = await db.execute({
        sql: "SELECT id FROM draws WHERE status = 'active' AND end_datetime <= ?",
        args: [now],
      });

      for (const draw of endedDraws.rows) {
        try {
          logger.info({ drawId: draw.id }, 'Scheduler: Ending draw');
          await drawService.endDraw(draw.id);
          if (drawSocket) {
            drawSocket.broadcastDrawEnded(draw.id);
          }
        } catch (err) {
          logger.error({ drawId: draw.id, err }, 'Scheduler: Error ending draw');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler: Error in auction scheduler tick');
    }
  });

  logger.info('Auction & draw scheduler started (runs every 30 seconds)');
};

/**
 * Process auction end: determine winners, charge cards, send emails, mark products
 */
async function processAuctionEnd(auctionId, app) {
  const auctionSocket = app.get('auctionSocket');

  // 1. End the auction (status → finished)
  await auctionService.endAuction(auctionId);

  // 2. Broadcast immediately so the frontend always receives the end signal
  if (auctionSocket) {
    auctionSocket.broadcastAuctionEnded(auctionId);
  }

  // 3. Post-processing: mark products sold/unsold (best-effort, never blocks broadcast)
  try {
    const auction = await auctionService.getAuctionById(auctionId);
    if (!auction) return;

    const winningBids = await auctionService.getWinningBids(auctionId);

    for (const winner of winningBids) {
      try {
        const table = winner.productType === 'art' ? 'art' : 'others';
        await db.execute({
          sql: `UPDATE ${table} SET is_sold = 1 WHERE id = ?`,
          args: [winner.productId],
        });
      } catch (err) {
        logger.error({ productId: winner.productId, err }, 'Scheduler: Error marking product sold');
      }
    }
  } catch (err) {
    logger.error({ auctionId, err }, 'Scheduler: Error in post-processing after auction end');
  }

  logger.info({ auctionId }, 'Scheduler: Auction processing complete');
}
