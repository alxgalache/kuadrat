/**
 * Auction Socket.IO module
 * Handles real-time auction events: bids, price updates, extensions, endings
 */
module.exports = function setupAuctionSocket(io) {
  io.on("connection", (socket) => {
    console.log("Auction socket connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("Auction socket disconnected:", socket.id);
    });

    // Join an auction room to receive real-time updates
    socket.on("join-auction", (auctionId) => {
      if (!auctionId) return;
      socket.join(`auction-${auctionId}`);
      console.log(`Socket ${socket.id} joined auction ${auctionId}`);
    });

    // Leave an auction room
    socket.on("leave-auction", (auctionId) => {
      if (!auctionId) return;
      socket.leave(`auction-${auctionId}`);
      console.log(`Socket ${socket.id} left auction ${auctionId}`);
    });
  });

  // Return broadcast helper functions
  return {
    /**
     * Broadcast a new bid to all clients in the auction room
     * @param {string} auctionId
     * @param {object} bidData - { buyerFirstName, buyerLastName, amount, productId, productType, createdAt }
     */
    broadcastNewBid(auctionId, bidData) {
      io.to(`auction-${auctionId}`).emit("new_bid", bidData);
    },

    /**
     * Broadcast a price update for a specific product
     * @param {string} auctionId
     * @param {object} data - { productId, productType, newPrice, nextBidAmount }
     */
    broadcastPriceUpdate(auctionId, data) {
      io.to(`auction-${auctionId}`).emit("price_update", data);
    },

    /**
     * Broadcast that the auction has been extended (anti-sniping)
     * @param {string} auctionId
     * @param {object} data - { newEndDatetime }
     */
    broadcastAuctionExtended(auctionId, data) {
      io.to(`auction-${auctionId}`).emit("auction_extended", data);
    },

    /**
     * Broadcast that the auction has ended
     * @param {string} auctionId
     */
    broadcastAuctionEnded(auctionId) {
      io.to(`auction-${auctionId}`).emit("auction_ended", { auctionId });
    },

    /**
     * Broadcast that the auction has started
     * @param {string} auctionId
     */
    broadcastAuctionStarted(auctionId) {
      io.to(`auction-${auctionId}`).emit("auction_started", { auctionId });
    },

    /**
     * Broadcast countdown sync to keep clients in sync with server time
     * @param {string} auctionId
     * @param {object} data - { remainingMs, endDatetime }
     */
    broadcastCountdownSync(auctionId, data) {
      io.to(`auction-${auctionId}`).emit("countdown_sync", data);
    },
  };
};
