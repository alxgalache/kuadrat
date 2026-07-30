/**
 * Direct Turso client for the personalization scripts.
 *
 * The script talks to the database directly (not through the Express API)
 * because the API is read-only for verification and does not expose write
 * endpoints for nfc_tags. The auth token used here must have write
 * permissions over nfc_tags.
 */

import { createClient } from '@libsql/client';

let _client = null;

export function turso() {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env');
  }
  _client = createClient({ url, authToken });
  return _client;
}

export async function findArtBySlug(slug) {
  const result = await turso().execute({
    sql: `SELECT id, name, slug, status, removed, edition_size
          FROM art
          WHERE slug = ?
          LIMIT 1`,
    args: [slug],
  });
  return result.rows[0] || null;
}

/**
 * All active tags bound to an artwork, ordered by edition number.
 * A limited edition has one physical sticker (and one row) per copy, so this
 * returns up to `art.edition_size` rows; unique works return at most one.
 */
export async function listActiveTagsByArt(artId) {
  const result = await turso().execute({
    sql: `SELECT uid, edition_number FROM nfc_tags
          WHERE art_id = ? AND status = 'active'
          ORDER BY edition_number ASC, personalized_at ASC`,
    args: [artId],
  });
  return result.rows;
}

export async function getTagByUid(uid) {
  const result = await turso().execute({
    sql: `SELECT t.uid, t.art_id, t.serial_label, t.edition_number, t.status, t.last_counter,
                 t.is_permanently_locked, t.personalized_at, t.personalized_by,
                 t.locked_at, t.notes,
                 a.name AS art_name, a.slug AS art_slug, a.edition_size
          FROM nfc_tags t
          LEFT JOIN art a ON a.id = t.art_id
          WHERE t.uid = ?
          LIMIT 1`,
    args: [uid],
  });
  return result.rows[0] || null;
}

export async function insertNfcTag({ uid, artId, serialLabel, editionNumber = null, operator }) {
  await turso().execute({
    sql: `INSERT INTO nfc_tags (uid, art_id, serial_label, edition_number, status, personalized_by)
          VALUES (?, ?, ?, ?, 'active', ?)`,
    args: [uid, artId, serialLabel, editionNumber, operator],
  });
}

export async function markAsLocked(uid) {
  await turso().execute({
    sql: `UPDATE nfc_tags
          SET is_permanently_locked = 1, locked_at = CURRENT_TIMESTAMP
          WHERE uid = ?`,
    args: [uid],
  });
}

export async function markAsDamaged(uid, note) {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const appended = `[${stamp}] ${note}`;
  await turso().execute({
    sql: `UPDATE nfc_tags
          SET status = 'damaged',
              notes = CASE
                WHEN notes IS NULL OR notes = '' THEN ?
                ELSE notes || char(10) || ?
              END
          WHERE uid = ?`,
    args: [appended, appended, uid],
  });
}
