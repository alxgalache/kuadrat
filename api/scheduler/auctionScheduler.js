const cron = require('node-cron');
const { db } = require('../config/database');
const auctionService = require('../services/auctionService');

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
          console.log(`[Scheduler] Starting auction ${auction.id}`);
          await auctionService.startAuction(auction.id);
          if (auctionSocket) {
            auctionSocket.broadcastAuctionStarted(auction.id);
          }
        } catch (err) {
          console.error(`[Scheduler] Error starting auction ${auction.id}:`, err.message);
        }
      }

      // 2. End active auctions whose end_datetime has passed
      const endedAuctions = await db.execute({
        sql: "SELECT id FROM auctions WHERE status = 'active' AND end_datetime <= ?",
        args: [now],
      });

      for (const auction of endedAuctions.rows) {
        try {
          console.log(`[Scheduler] Ending auction ${auction.id}`);
          await processAuctionEnd(auction.id, app);
        } catch (err) {
          console.error(`[Scheduler] Error ending auction ${auction.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error in auction scheduler tick:', err.message);
    }
  });

  console.log('[Scheduler] Auction scheduler started (runs every 30 seconds)');
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
        console.error(`[Scheduler] No payment data for buyer ${winner.buyerId} in auction ${auctionId}`);
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
          }).catch(err => console.error('[Scheduler] Error sending winner email:', err.message));
        }

        console.log(`[Scheduler] Successfully charged winner ${winner.buyerEmail} for ${winner.amount} EUR`);
      } else if (chargeResult.requiresAction) {
        // SCA required - send email with payment link
        console.log(`[Scheduler] SCA required for winner ${winner.buyerEmail}`);
        if (emailService.sendSCARequiredEmail) {
          const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
          await emailService.sendSCARequiredEmail({
            email: winner.buyerEmail,
            firstName: winner.buyerFirstName,
            paymentUrl: `${clientUrl}/subastas/pago?pi=${chargeResult.paymentIntentId}`,
            auctionName: auction.name,
            productName: winner.productName || 'Producto',
            amount: winner.amount,
          }).catch(err => console.error('[Scheduler] Error sending SCA email:', err.message));
        }
      }
    } catch (err) {
      console.error(`[Scheduler] Error processing winner for product ${winner.productId}:`, err.message);
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
      console.log(`[Scheduler] Buyer ${buyer.email} did not win in auction ${auctionId}`);
    }
  }

  // 6. Broadcast auction ended
  if (auctionSocket) {
    auctionSocket.broadcastAuctionEnded(auctionId);
  }

  console.log(`[Scheduler] Auction ${auctionId} processing complete`);
}
