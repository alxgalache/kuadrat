// Re-export of the marketing email service (mirrors services/email/index.js).
// Lets call sites require('../services/marketing') for a future split.
module.exports = require('../marketingEmailService');
