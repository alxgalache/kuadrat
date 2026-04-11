/**
 * One-off migration — Change #2: stripe-connect-manual-payouts
 *
 * Splits the legacy single-bucket seller wallet (`users.available_withdrawal`)
 * into the two new VAT-regime buckets introduced in Change #2:
 *
 *   - `available_withdrawal_art_rebu`       → REBU 21% bucket (art)
 *   - `available_withdrawal_standard_vat`   → Standard 21% bucket (others/events)
 *
 * All legacy balances are dumped into the *standard_vat* bucket because we have
 * no reliable way to reconstruct, for each seller, which portion came from art
 * sales vs other products. Sellers whose legacy balance was purely from art
 * will be contacted manually — see design.md §6.
 *
 * Idempotency:
 *   - The migration is driven entirely by `available_withdrawal > 0`. Once a
 *     user's legacy balance is zeroed (inside the same UPDATE that credits the
 *     new bucket), a subsequent run finds no users to process and exits.
 *   - The UPDATE is guarded by `WHERE id = ? AND available_withdrawal = ?` so
 *     any concurrent change to the legacy column causes the row to be skipped
 *     instead of double-counted.
 *
 * Invocation:
 *   - Runs automatically at API startup from `api/server.js` after
 *     `initializeDatabase()`. Not intended to be run as a standalone CLI.
 */
const { db } = require('../config/database');
const logger = require('../config/logger');

async function runWalletSplitMigration() {
  const legacy = await db.execute({
    sql: 'SELECT id, available_withdrawal FROM users WHERE available_withdrawal > 0',
    args: [],
  });

  if (legacy.rows.length === 0) {
    // Nothing to migrate — either fresh DB or already migrated.
    return { migrated: 0, skipped: 0 };
  }

  logger.info(
    { count: legacy.rows.length },
    '[wallet-split] legacy wallet balances detected — running migration'
  );

  let migrated = 0;
  let skipped = 0;

  for (const user of legacy.rows) {
    const legacyAmount = Number(user.available_withdrawal) || 0;
    if (legacyAmount <= 0) {
      skipped += 1;
      continue;
    }

    const result = await db.execute({
      sql: `UPDATE users
            SET available_withdrawal_standard_vat = available_withdrawal_standard_vat + ?,
                available_withdrawal = 0
            WHERE id = ? AND available_withdrawal = ?`,
      args: [legacyAmount, user.id, legacyAmount],
    });

    if (result.rowsAffected === 1) {
      migrated += 1;
      logger.info(
        { userId: user.id, amount: legacyAmount },
        '[wallet-split] dumped legacy balance to standard_vat bucket'
      );
    } else {
      // Balance changed between SELECT and UPDATE (extremely unlikely during
      // startup, but possible). Log and skip — the next run will retry.
      skipped += 1;
      logger.warn(
        { userId: user.id, amount: legacyAmount },
        '[wallet-split] balance changed during migration — skipping, will retry on next startup'
      );
    }
  }

  logger.info(
    { migrated, skipped },
    '[wallet-split] migration complete'
  );

  return { migrated, skipped };
}

module.exports = { runWalletSplitMigration };
