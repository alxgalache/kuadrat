/**
 * Shared Stripe SDK client singleton.
 *
 * Single source of truth for the Stripe SDK instance across the API.
 * Used by:
 *   - stripeService.js        → PaymentIntents (buyer flow)
 *   - stripeConnectService.js → Connected accounts (seller flow, Change #1)
 *   - stripeConnectWebhookController.js → parseEventNotification for V2 events
 *
 * The client supports both V1 and V2 APIs:
 *   - stripeClient.paymentIntents.* (V1)
 *   - stripeClient.v2.core.accounts.* (V2)
 *   - stripeClient.parseEventNotification(raw, sig, secret) (V2 EventNotification verification)
 *
 * NOTE: `parseThinEvent` was renamed to `parseEventNotification` in stripe-node v19.0.0
 * (CHANGELOG: https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md). The new
 * function returns a `V2.Core.EventNotification` whose payload still exposes
 * `related_object` in snake_case (plus SDK-added helpers `fetchRelatedObject()`
 * and `fetchEvent()` in camelCase).
 */
const Stripe = require('stripe');

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = stripeClient;
