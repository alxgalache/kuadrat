/**
 * Event Socket.IO module
 * Handles real-time event notifications: start, end
 */
module.exports = function setupEventSocket(io) {
  io.on("connection", (socket) => {
    // Join an event room to receive real-time updates
    socket.on("join_event", (eventId) => {
      if (!eventId) return;
      socket.join(`event-${eventId}`);
    });

    // Leave an event room
    socket.on("leave_event", (eventId) => {
      if (!eventId) return;
      socket.leave(`event-${eventId}`);
    });
  });

  // Return broadcast helper functions
  return {
    /**
     * Broadcast that the event has started (went live)
     * @param {string|number} eventId
     */
    broadcastEventStarted(eventId) {
      io.to(`event-${eventId}`).emit("event_started", { eventId });
    },

    /**
     * Broadcast that the event has ended
     * @param {string|number} eventId
     */
    broadcastEventEnded(eventId) {
      io.to(`event-${eventId}`).emit("event_ended", { eventId });
    },
  };
};
