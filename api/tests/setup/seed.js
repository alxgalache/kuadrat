/**
 * Minimal seed data for the local test database.
 *
 * Deliberately small: tests should create the entities they need through
 * `tests/helpers/factories.js` so each one states its own preconditions. Only
 * reference data that is expensive to build and shared across the suite belongs
 * here.
 */

// A handful of real Spanish postal codes, standing in for the full ES.csv
// import (~1.4 MB) that `initializeDatabase()` skips under NODE_ENV=test.
const POSTAL_CODES = [
  { postal_code: '28001', city: 'Madrid', province: 'Madrid', country: 'ES' },
  { postal_code: '08001', city: 'Barcelona', province: 'Barcelona', country: 'ES' },
  { postal_code: '41001', city: 'Sevilla', province: 'Sevilla', country: 'ES' },
  { postal_code: '46001', city: 'Valencia', province: 'Valencia', country: 'ES' },
  { postal_code: '48001', city: 'Bilbao', province: 'Bizkaia', country: 'ES' },
  { postal_code: '15001', city: 'A Coruña', province: 'A Coruña', country: 'ES' },
  { postal_code: '35001', city: 'Las Palmas de Gran Canaria', province: 'Las Palmas', country: 'ES' },
  { postal_code: '07001', city: 'Palma', province: 'Illes Balears', country: 'ES' },
];

async function seedTestDatabase(db) {
  const existing = await db.execute('SELECT COUNT(*) as count FROM postal_codes');
  if (existing.rows[0].count > 0) return;

  await db.batch(
    POSTAL_CODES.map((row) => ({
      sql: 'INSERT INTO postal_codes (postal_code, city, province, country) VALUES (?, ?, ?, ?)',
      args: [row.postal_code, row.city, row.province, row.country],
    })),
    'write'
  );
}

module.exports = { seedTestDatabase, POSTAL_CODES };
