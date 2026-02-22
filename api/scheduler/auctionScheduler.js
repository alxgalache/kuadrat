const cron = require('node-cron');
const { db } = require('../config/database');
const auctionService = require('../services/auctionService');
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
    } catch (err) {
      logger.error({ err }, 'Scheduler: Error in auction scheduler tick');
    }
  });

  logger.info('Auction scheduler started (runs every 30 seconds)');
};

/**
 * Process auction end: determine winners, charge cards, send emails, mark products
 */
async function processAuctionEnd(auctionId, app) {
  const auctionSocket = app.get('auctionSocket');

  // 1. End the auction
  await auctionService.endAuction(auctionId);

  // 2. Get the full auction data
  const auction = await auctionService.getAuctionById(auctionId);
  if (!auction) return;

  // 3. Get winning bids
  const winningBids = await auctionService.getWinningBids(auctionId);

  // 4. Process each winning bid
  const stripeService = require('../services/stripeService');
  const emailService = require('../services/emailService');

  for (const winner of winningBids) {
    try {
      // Get buyer payment data
      const paymentData = await auctionService.getBuyerPaymentData(winner.buyerId);

      if (!paymentData || !paymentData.stripe_customer_id || !paymentData.stripe_payment_method_id) {
        logger.error({ buyerId: winner.buyerId, auctionId }, 'Scheduler: No payment data for buyer');
        continue;
      }

      // Charge the winner off-session (amount in cents)
      const amountInCents = Math.round(winner.amount * 100);
      const chargeResult = await stripeService.chargeWinnerOffSession({
        customerId: paymentData.stripe_customer_id,
        paymentMethodId: paymentData.stripe_payment_method_id,
        amount: amountInCents,
        currency: 'eur',
        metadata: {
          auction_id: auctionId,
          auction_buyer_id: winner.buyerId,
          product_id: String(winner.productId),
          product_type: winner.productType,
        },
      });

      if (chargeResult.success) {
        // Mark product as sold
        const table = winner.productType === 'art' ? 'art' : 'others';
        await db.execute({
          sql: `UPDATE ${table} SET is_sold = 1 WHERE id = ?`,
          args: [winner.productId],
        });

        // Send winner email
        if (emailService.sendAuctionWonEmail) {
          await emailService.sendAuctionWonEmail({
            email: winner.buyerEmail,
            firstName: winner.buyerFirstName,
            auctionName: auction.name,
            productName: winner.productName || 'Producto',
            winningAmount: winner.amount,
          }).catch(err => logger.error({ err }, 'Scheduler: Error sending winner email'));
        }

        logger.info({ email: winner.buyerEmail, amount: winner.amount }, 'Scheduler: Successfully charged winner');
      } else if (chargeResult.requiresAction) {
        // SCA required - send email with payment link
        logger.info({ email: winner.buyerEmail }, 'Scheduler: SCA required for winner');
        if (emailService.sendSCARequiredEmail) {
          await emailService.sendSCARequiredEmail({
            email: winner.buyerEmail,
            firstName: winner.buyerFirstName,
            paymentUrl: `${config.clientUrl}/subastas/pago?pi=${chargeResult.paymentIntentId}`,
            auctionName: auction.name,
            productName: winner.productName || 'Producto',
            amount: winner.amount,
          }).catch(err => logger.error({ err }, 'Scheduler: Error sending SCA email'));
        }
      }
    } catch (err) {
      logger.error({ productId: winner.productId, err }, 'Scheduler: Error processing winner');
    }
  }

  // 5. Notify non-winners (buyers who bid but didn't win)
  // Get all unique buyers for this auction
  const allBuyers = await db.execute({
    sql: `SELECT DISTINCT ab.id, ab.email, ab.first_name
          FROM auction_buyers ab
          INNER JOIN auction_bids abid ON ab.id = abid.auction_buyer_id
          WHERE ab.auction_id = ?`,
    args: [auctionId],
  });

  const winnerBuyerIds = new Set(winningBids.map(w => w.buyerId));

  for (const buyer of allBuyers.rows) {
    if (!winnerBuyerIds.has(buyer.id)) {
      // This buyer didn't win - could send a notification email here
      logger.info({ email: buyer.email, auctionId }, 'Scheduler: Buyer did not win');
    }
  }

  // 6. Broadcast auction ended
  if (auctionSocket) {
    auctionSocket.broadcastAuctionEnded(auctionId);
  }

  logger.info({ auctionId }, 'Scheduler: Auction processing complete');
}
