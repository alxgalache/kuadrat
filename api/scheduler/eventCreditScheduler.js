const cron = require('node-cron');
const { db } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');
const { createBatch } = require('../utils/transaction');
const { computeStandardVat } = require('../utils/vatCalculator');
const { sendHostEventCreditedEmail } = require('../services/emailService');

/**
 * Change #3: stripe-connect-events-wallet
 * -------------------------------------------------------------------------
 * Hourly job that credits the host's `available_withdrawal_standard_vat`
 * bucket once a paid event has been finished for more than
 * `config.events.creditGraceDays` (default 1 day).
 *
 * The job is idempotent per event: the final UPDATE on
 * `events.host_credited_at` is guarded by `WHERE host_credited_at IS NULL`.
 * If another instance (or a previous tick) already credited the event, the
 * UPDATE is a no-op and the attendee/bucket writes are skipped.
 *
 * A grace of 1 day (not 14 like shipped items) is defined in decision #14 of
 * `docs/stripe_connect/master_plan.md`.
 */

/**
 * Load the events eligible for credit processing.
 * @returns {Promise<Array>}
 */
async function loadEligibleEvents() {
  const graceDays = Math.max(0, Number(config.events.creditGraceDays) || 1);
  // TODO - La hora no coincide con la hora real de españa (una hora menos) No es demasiado problema, pero se anota
  const cutoffISO = new Date(Date.now() - graceDays * 24 * 3600 * 1000).toISOString();
  // For debug purposes:
  // const cutoffISO = new Date(Date.now() + (2 * 24 * 3600 * 1000)).toISOString();

  const result = await db.execute({
    sql: `
      SELECT id, title, host_user_id, finished_at
      FROM events
      WHERE access_type = 'paid'
        AND finished_at IS NOT NULL
        AND host_credited_at IS NULL
        AND host_credit_excluded = 0
        AND finished_at <= ?
      ORDER BY finished_at ASC
    `,
    args: [cutoffISO],
  });
  return result.rows;
}

/**
 * Load paid attendees that have not been credited yet for a given event.
 * Accepts both `paid` and `joined` because the attendee status flips from
 * `paid` → `joined` at the moment they request their LiveKit viewer token
 * (see `eventController.getViewerToken`). Either state means the attendee
 * completed payment; only `cancelled`/`registered` are excluded.
 */
async function loadUncreditedAttendees(eventId) {
  const result = await db.execute({
    sql: `
      SELECT id, amount_paid
      FROM event_attendees
      WHERE event_id = ?
        AND status IN ('paid', 'joined')
        AND host_credited_at IS NULL
    `,
    args: [eventId],
  });
  return result.rows;
}

/**
 * Process a single event: persist per-attendee fiscal split, bump the host
 * bucket, stamp `events.host_credited_at`.
 *
 * @returns {Promise<{ totalCredit: number, attendeeCount: number }>} zero-values
 *          if the event had no paid attendees (host_credited_at is stamped
 *          anyway so the scheduler does not retry forever).
 */
async function creditEvent(event) {
  const attendees = await loadUncreditedAttendees(event.id);

  // Commission rate is the same one the fiscal flow uses for "others":
  // standard 21% VAT comes from there. Stored in env as a whole percentage
  // (e.g. "10" → 10%), divided by 100 to get the multiplier — matches the
  // convention used in ordersController.js.
  const commissionRate = (Number(config.payment.dealerCommissionOthers) || 0) / 100;

  const lines = [];
  let totalCredit = 0;

  for (const attendee of attendees) {
    const amountPaid = Number(attendee.amount_paid) || 0;
    const commission = Math.round(amountPaid * commissionRate * 100) / 100;
    const split = computeStandardVat({ price: amountPaid, commission });
    lines.push({
      attendeeId: attendee.id,
      commission,
      sellerEarning: split.sellerEarning,
    });
    totalCredit += split.sellerEarning;
  }

  totalCredit = Math.round(totalCredit * 100) / 100;

  // Single batch: per-attendee UPDATE, host bucket bump (conditional on
  // totalCredit > 0), final UPDATE on events.host_credited_at with guard.
  const batch = createBatch();
  for (const line of lines) {
    batch.add(
      `UPDATE event_attendees
         SET commission_amount = ?, host_credited_at = CURRENT_TIMESTAMP
       WHERE id = ? AND host_credited_at IS NULL`,
      [line.commission, line.attendeeId]
    );
  }
  if (totalCredit > 0) {
    batch.add(
      `UPDATE users
         SET available_withdrawal_standard_vat = COALESCE(available_withdrawal_standard_vat, 0) + ?
       WHERE id = ?`,
      [totalCredit, event.host_user_id]
    );
  }
  batch.add(
    `UPDATE events
       SET host_credited_at = CURRENT_TIMESTAMP
     WHERE id = ? AND host_credited_at IS NULL`,
    [event.id]
  );

  const results = await batch.execute();
  const finalUpdate = results[results.length - 1];
  if (!finalUpdate || finalUpdate.rowsAffected === 0) {
    logger.warn(
      { eventId: event.id },
      '[eventCreditScheduler] events.host_credited_at guard rejected update — skipping'
    );
    return { totalCredit: 0, attendeeCount: 0, skipped: true };
  }

  return { totalCredit, attendeeCount: lines.length };
}

/**
 * Run a single tick immediately. Exported so admin / tests / manual triggers
 * can kick it off without waiting for the cron fire.
 */
async function runOnce() {
  let events;
  try {
    events = await loadEligibleEvents();
  } catch (err) {
    logger.error({ err }, '[eventCreditScheduler] Failed to load eligible events');
    return { processed: 0, credited: 0, skipped: 0, errored: 0 };
  }

  if (events.length === 0) {
    logger.debug('[eventCreditScheduler] No eligible events this tick');
    return { processed: 0, credited: 0, skipped: 0, errored: 0 };
  }

  logger.info(
    { count: events.length },
    '[eventCreditScheduler] Processing eligible events'
  );

  let credited = 0;
  let skipped = 0;
  let errored = 0;

  for (const event of events) {
    try {
      const result = await creditEvent(event);
      if (result.skipped) {
        skipped += 1;
        continue;
      }

      logger.info(
        {
          eventId: event.id,
          hostUserId: Number(event.host_user_id),
          attendeeCount: result.attendeeCount,
          totalCredit: result.totalCredit,
        },
        '[eventCreditScheduler] Event credited'
      );

      if (result.totalCredit > 0) {
        credited += 1;
        try {
          const host = await loadHost(event.host_user_id);
          if (host) {
            await sendHostEventCreditedEmail({
              host,
              event,
              totalCredit: result.totalCredit,
              attendeeCount: result.attendeeCount,
            });
          }
        } catch (emailErr) {
          logger.error(
            { emailErr, eventId: event.id, hostUserId: Number(event.host_user_id) },
            '[eventCreditScheduler] Failed to send host credited email'
          );
        }
      } else {
        // Empty event (no paid attendees): host_credited_at stamped, bucket
        // unchanged, no email. Documented in design §5.
        logger.debug(
          { eventId: event.id },
          '[eventCreditScheduler] Event stamped without credit (no paid attendees)'
        );
      }
    } catch (err) {
      errored += 1;
      logger.error(
        { err, eventId: event.id },
        '[eventCreditScheduler] Failed to credit event — continuing with next'
      );
    }
  }

  return { processed: events.length, credited, skipped, errored };
}

async function loadHost(hostUserId) {
  const result = await db.execute({
    sql: `SELECT id, full_name, email FROM users WHERE id = ? LIMIT 1`,
    args: [hostUserId],
  });
  return result.rows[0] || null;
}

/**
 * Start the scheduler. Returns the cron task handle or null when disabled.
 */
function startEventCreditScheduler() {
  if (!config.events.creditSchedulerEnabled) {
    logger.info('[eventCreditScheduler] Disabled via config.events.creditSchedulerEnabled');
    return null;
  }

  const schedule = config.events.creditSchedulerCron || '0 * * * *';
  const task = cron.schedule(schedule, () => {
    runOnce().catch((err) => {
      logger.error({ err }, '[eventCreditScheduler] Unhandled error in tick');
    });
  });

  logger.info(
    {
      cron: schedule,
      graceDays: config.events.creditGraceDays,
    },
    '[eventCreditScheduler] Started'
  );

  return task;
}

module.exports = startEventCreditScheduler;
module.exports.runOnce = runOnce;
