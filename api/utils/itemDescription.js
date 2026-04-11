/**
 * Item description helpers — Change #4: stripe-connect-fiscal-report
 *
 * Batch-friendly lookups for turning `withdrawal_items` rows into
 * human-readable descriptions and buyer back-references, so the fiscal export
 * lines are self-explanatory when the gestoría opens the CSV.
 *
 * All functions are batch-oriented (one query per item_type) to avoid N+1 on
 * the range export.
 */
const { db } = require('../config/database');

/**
 * Batch lookup for art order items.
 *
 * @param {number[]} ids
 * @returns {Promise<Map<number, { description: string, buyer_reference: string }>>}
 */
async function describeArtOrderItems(ids) {
  const map = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return map;
  const uniqIds = [...new Set(ids.map((id) => Number(id)).filter((n) => Number.isFinite(n)))];
  if (uniqIds.length === 0) return map;
  const placeholders = uniqIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `
      SELECT aoi.id AS id, aoi.order_id AS order_id, a.name AS product_name
      FROM art_order_items aoi
      JOIN art a ON aoi.art_id = a.id
      WHERE aoi.id IN (${placeholders})
    `,
    args: uniqIds,
  });
  for (const row of result.rows) {
    const id = Number(row.id);
    map.set(id, {
      description: row.product_name || '(Obra sin nombre)',
      buyer_reference: `order:${Number(row.order_id)}/art_order_item:${id}`,
    });
  }
  return map;
}

/**
 * Batch lookup for "other" order items.
 *
 * @param {number[]} ids
 * @returns {Promise<Map<number, { description: string, buyer_reference: string }>>}
 */
async function describeOtherOrderItems(ids) {
  const map = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return map;
  const uniqIds = [...new Set(ids.map((id) => Number(id)).filter((n) => Number.isFinite(n)))];
  if (uniqIds.length === 0) return map;
  const placeholders = uniqIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `
      SELECT ooi.id AS id, ooi.order_id AS order_id, o.name AS product_name
      FROM other_order_items ooi
      JOIN others o ON ooi.other_id = o.id
      WHERE ooi.id IN (${placeholders})
    `,
    args: uniqIds,
  });
  for (const row of result.rows) {
    const id = Number(row.id);
    map.set(id, {
      description: row.product_name || '(Producto sin nombre)',
      buyer_reference: `order:${Number(row.order_id)}/other_order_item:${id}`,
    });
  }
  return map;
}

/**
 * Batch lookup for event attendees. IDs are UUID strings.
 *
 * @param {string[]} ids
 * @returns {Promise<Map<string, { description: string, buyer_reference: string }>>}
 */
async function describeEventAttendees(ids) {
  const map = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return map;
  const uniqIds = [...new Set(ids.map((id) => String(id)))].filter((s) => s.length > 0);
  if (uniqIds.length === 0) return map;
  const placeholders = uniqIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `
      SELECT ea.id AS id, ea.event_id AS event_id, e.title AS event_title
      FROM event_attendees ea
      JOIN events e ON ea.event_id = e.id
      WHERE ea.id IN (${placeholders})
    `,
    args: uniqIds,
  });
  for (const row of result.rows) {
    const id = String(row.id);
    map.set(id, {
      description: `Entrada: ${row.event_title || '(Evento sin título)'}`,
      buyer_reference: `event:${row.event_id}/attendee:${id}`,
    });
  }
  return map;
}

/**
 * Enrich a batch of `withdrawal_items` rows with description + buyer reference.
 * Runs one query per distinct item_type and merges the results into a single
 * Map keyed by `${item_type}:${item_id}`.
 *
 * Rows that fail the lookup (e.g. the underlying order row was deleted) map
 * to a placeholder so the export never 500s on orphaned data — this is
 * best-effort traceability.
 *
 * @param {Array<{item_type: string, item_id: string|number}>} rows
 * @returns {Promise<Map<string, { description: string, buyer_reference: string }>>}
 */
async function describeBatch(rows) {
  const artIds = [];
  const otherIds = [];
  const eventAttendeeIds = [];

  for (const row of rows) {
    if (row.item_type === 'art_order_item') {
      artIds.push(row.item_id);
    } else if (row.item_type === 'other_order_item') {
      otherIds.push(row.item_id);
    } else if (row.item_type === 'event_attendee') {
      eventAttendeeIds.push(row.item_id);
    }
  }

  const [artMap, otherMap, eventMap] = await Promise.all([
    describeArtOrderItems(artIds),
    describeOtherOrderItems(otherIds),
    describeEventAttendees(eventAttendeeIds),
  ]);

  const combined = new Map();
  for (const row of rows) {
    const key = `${row.item_type}:${row.item_id}`;
    let entry;
    if (row.item_type === 'art_order_item') {
      entry = artMap.get(Number(row.item_id));
    } else if (row.item_type === 'other_order_item') {
      entry = otherMap.get(Number(row.item_id));
    } else if (row.item_type === 'event_attendee') {
      entry = eventMap.get(String(row.item_id));
    }
    combined.set(
      key,
      entry || {
        description: '(Item no encontrado)',
        buyer_reference: `${row.item_type}:${row.item_id}`,
      }
    );
  }
  return combined;
}

module.exports = {
  describeArtOrderItems,
  describeOtherOrderItems,
  describeEventAttendees,
  describeBatch,
};
