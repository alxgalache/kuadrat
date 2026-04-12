const logger = require('../config/logger');

/**
 * Draw Socket.IO module
 * Handles real-time draw events: draw endings and lifecycle updates
 */
module.exports = function setupDrawSocket(io) {
  io.on("connection", (socket) => {
    logger.debug({ socketId: socket.id }, 'Draw socket connected');

    socket.on("disconnect", () => {
      logger.debug({ socketId: socket.id }, 'Draw socket disconnected');
    });

    // Join a draw room to receive real-time updates
    socket.on("join-draw", (drawId) => {
      if (!drawId) return;
      socket.join(`draw-${drawId}`);
      logger.debug({ socketId: socket.id, drawId }, 'Socket joined draw');
    });

    // Leave a draw room
    socket.on("leave-draw", (drawId) => {
      if (!drawId) return;
      socket.leave(`draw-${drawId}`);
      logger.debug({ socketId: socket.id, drawId }, 'Socket left draw');
    });
  });

  // Return broadcast helper functions
  return {
    /**
     * Broadcast that the draw has ended
     * @param {string} drawId
     */
    broadcastDrawEnded(drawId) {
      io.to(`draw-${drawId}`).emit("draw_ended", { drawId });
    },
  };
};
