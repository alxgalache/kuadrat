/**
 * Stripe Connect Webhook Controller — Change #1: stripe-connect-accounts
 *
 * Receives V2 EventNotifications from Stripe for connected accounts and drives
 * a local state sync for the matching seller.
 *
 * Idempotency: every event is persisted in `stripe_connect_events` with a
 * UNIQUE constraint on `stripe_event_id`. Duplicate deliveries are silently
 * ignored. Errors during dispatch are persisted as `processing_error` so
 * operators can diagnose issues after the fact.
 *
 * This endpoint is:
 *   - PUBLIC (no auth middleware)
 *   - Reads `req.rawBody` captured by the global express.json() verify callback
 *     (see server.js) — matches the existing stripePaymentsController pattern.
 *   - Distinct from /api/payments/stripe/webhook (which handles payment_intent
 *     events on the platform account).
 *
 * NOTE: uses `stripeClient.parseEventNotification` (the post-v19.0.0 API).
 * The returned `V2.Core.EventNotification` still exposes `related_object`
 * in snake_case on the payload — our dispatcher reads `event.related_object?.id`
 * without any transformation.
 */
const stripeClient = require('../services/stripeClient');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const stripeConnectService = require('../services/stripeConnectService');

/**
 * Load a user by their Stripe connected account ID.
 * @private
 */
async function findUserByAccountId(accountId) {
  const result = await db.execute({
    sql: `SELECT * FROM users WHERE stripe_connect_account_id = ?`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

/**
 * Both handled event types drive the same action: re-sync the account state.
 * We factor them into a single function.
 * @private
 */
async function handleAccountChange(event) {
  const accountId = event.related_object?.id || null;
  if (!accountId) {
    logger.warn({ eventId: event.id, eventType: event.type }, '[stripe-connect-webhook] event has no related account id');
    return;
  }

  const user = await findUserByAccountId(accountId);
  if (!user) {
    logger.warn(
      { eventId: event.id, accountId },
      '[stripe-connect-webhook] account not found in BD (orphan event)'
    );
    return;
  }

  await stripeConnectService.syncAccountStatus({ user });
  logger.info(
    { eventId: event.id, userId: user.id, accountId },
    '[stripe-connect-webhook] account synced from webhook'
  );
}

/**
 * Dispatcher — maps event type → handler.
 * Returns `true` if the event was handled, `false` otherwise.
 * @private
 */
async function dispatchHandler(event) {
  switch (event.type) {
    case 'v2.core.account[requirements].updated':
    case 'v2.core.account[configuration.recipient].capability_status_updated':
      await handleAccountChange(event);
      return true;
    default:
      logger.warn(
        { eventId: event.id, eventType: event.type },
        '[stripe-connect-webhook] unknown event type'
      );
      return false;
  }
}

/**
 * POST /api/stripe/connect/webhook
 *
 * Parses the V2 EventNotification, persists it with idempotency guard,
 * dispatches the handler, marks the row as processed on success.
 */
async function handleConnectWebhook(req, res) {
  // Bail early if the connect webhook secret isn't configured. We return 200 so
  // Stripe doesn't retry — the warning surfaces the misconfig without breaking
  // the pipeline.
  if (!config.stripe.connect.webhookSecret) {
    logger.warn('[stripe-connect-webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not configured; ignoring event');
    return res.status(200).json({ received: true, ignored: true });
  }

  const sig = req.headers['stripe-signature'];
  const rawBody = req.rawBody || '';

  let event;
  try {
    event = stripeClient.parseEventNotification(
      rawBody,
      sig,
      config.stripe.connect.webhookSecret
    );
  } catch (err) {
    logger.warn({ err }, '[stripe-connect-webhook] invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Persist for idempotency + audit.
  const accountId = event.related_object?.id || null;
  let inserted;
  try {
    inserted = await db.execute({
      sql: `INSERT OR IGNORE INTO stripe_connect_events
            (stripe_event_id, stripe_event_type, account_id, payload_json)
            VALUES (?, ?, ?, ?)`,
      args: [event.id, event.type, accountId, JSON.stringify(event)],
    });
  } catch (err) {
    logger.error({ err, eventId: event.id }, '[stripe-connect-webhook] failed to persist event');
    return res.status(500).json({ error: 'DB persistence failed' });
  }

  if (inserted.rowsAffected === 0) {
    logger.info({ eventId: event.id }, '[stripe-connect-webhook] duplicate event ignored');
    return res.status(200).json({ received: true, duplicate: true });
  }

  // Dispatch.
  try {
    const handled = await dispatchHandler(event);
    if (handled) {
      await db.execute({
        sql: `UPDATE stripe_connect_events SET processed_at = CURRENT_TIMESTAMP WHERE stripe_event_id = ?`,
        args: [event.id],
      });
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error(
      { err, eventId: event.id, eventType: event.type },
      '[stripe-connect-webhook] handler threw'
    );
    try {
      await db.execute({
        sql: `UPDATE stripe_connect_events SET processing_error = ? WHERE stripe_event_id = ?`,
        args: [String(err?.stack || err?.message || err), event.id],
      });
    } catch (updateErr) {
      logger.error({ err: updateErr }, '[stripe-connect-webhook] failed to persist processing_error');
    }
    // Return 500 so Stripe retries the event later.
    return res.status(500).json({ error: 'Handler failed' });
  }
}

module.exports = {
  handleConnectWebhook,
  // Exported for unit testing.
  handleAccountChange,
  dispatchHandler,
};
