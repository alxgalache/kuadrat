/**
 * One-off migration script: Add polymorphic postal code references.
 *
 * Drops and recreates the three pivot tables with ref_type / ref_value columns
 * so that shipping zones and auction products can reference individual postal
 * codes, entire provinces, or entire countries.
 *
 * Usage:
 *   node api/migrations/migrate_postal_refs.js
 *
 * IMPORTANT: This deletes all existing data in the three pivot tables.
 */

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  console.log('Starting postal refs migration...');

  // 1. Drop old indexes
  for (const idx of ['idx_szpc_zone_postal', 'idx_szpc_zone_ref']) {
    try {
      await db.execute(`DROP INDEX IF EXISTS ${idx}`);
      console.log(`  Dropped ${idx}`);
    } catch (err) {
      console.log(`  ${idx} did not exist, skipping`);
    }
  }

  // 2. Drop old tables
  for (const table of [
    'shipping_zones_postal_codes',
    'auction_arts_postal_codes',
    'auction_others_postal_codes',
  ]) {
    await db.execute(`DROP TABLE IF EXISTS ${table}`);
    console.log(`  Dropped ${table}`);
  }

  // 3. Recreate with new schema
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shipping_zones_postal_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipping_zone_id INTEGER NOT NULL,
      ref_type TEXT NOT NULL DEFAULT 'postal_code',
      postal_code_id INTEGER,
      ref_value TEXT,
      FOREIGN KEY (shipping_zone_id) REFERENCES shipping_zones(id) ON DELETE CASCADE,
      FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
    )
  `);
  console.log('  Created shipping_zones_postal_codes');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS auction_arts_postal_codes (
      id TEXT PRIMARY KEY,
      auction_id TEXT NOT NULL,
      art_id INTEGER NOT NULL,
      ref_type TEXT NOT NULL DEFAULT 'postal_code',
      postal_code_id INTEGER,
      ref_value TEXT,
      FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
      FOREIGN KEY (art_id) REFERENCES art(id),
      FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
    )
  `);
  console.log('  Created auction_arts_postal_codes');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS auction_others_postal_codes (
      id TEXT PRIMARY KEY,
      auction_id TEXT NOT NULL,
      other_id INTEGER NOT NULL,
      ref_type TEXT NOT NULL DEFAULT 'postal_code',
      postal_code_id INTEGER,
      ref_value TEXT,
      FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
      FOREIGN KEY (other_id) REFERENCES others(id),
      FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
    )
  `);
  console.log('  Created auction_others_postal_codes');

  // 4. Create query-performance index (no unique constraint needed — CRUD is delete-all-then-reinsert)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_szpc_zone_ref
    ON shipping_zones_postal_codes(shipping_zone_id, ref_type)
  `);
  console.log('  Created idx_szpc_zone_ref');

  // 5. Add postal_codes lookup indexes (idempotent)
  await db.execute('CREATE INDEX IF NOT EXISTS idx_postal_codes_code_country ON postal_codes(postal_code, country)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_postal_codes_province_country ON postal_codes(province, country)');
  console.log('  Created postal_codes lookup indexes');

  console.log('Migration complete!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
