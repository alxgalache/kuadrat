/**
 * Guards for changing a seller's `seller_kind` (seller-kind-artist-speaker).
 *
 * Changing the kind is not a label edit. It withdraws or grants whole sections
 * of the application AND it cuts the seller's open sessions, so it has to be
 * refused rather than dragged through whenever either of those would leave
 * something in a state nobody can see or fix.
 *
 * The rule is: enumerate what blocks it, in es-ES, and hand the list back so
 * the admin can resolve it and retry. Two alternatives were considered and
 * rejected in the design:
 *
 *   - Demote and hide the artwork (`visible = 0`). That unpublishes goods that
 *     may sit in a buyer's cart, in a running auction, or in a draw whose
 *     participants have already authorised a charge — silently, on the same
 *     click the admin thought was changing a label.
 *   - Demote and touch nothing. That leaves artwork on sale whose author no
 *     longer has a panel to manage it, mark it shipped, or answer for the
 *     order. An ownerless state, and no screen anywhere reveals it.
 */
const { db } = require('../config/database');

/** Order-item statuses that are still open. NULL counts as open too. */
const OPEN_ITEM_STATUSES = ['paid', 'sent', 'arrived'];

/** Auction and draw statuses that are not yet over. */
const OPEN_CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active'];

const countOf = (result) => Number(result.rows[0]?.total) || 0;

/**
 * List everything that prevents changing this seller's kind right now.
 *
 * @param {number|string} sellerId
 * @param {{ toKind: 'artist'|'speaker' }} options
 * @returns {Promise<Array<{ code: string, count: number, message: string }>>}
 *          empty when the change may proceed
 */
async function sellerKindChangeBlockers(sellerId, { toKind }) {
  const blockers = [];

  // ── Applies in BOTH directions ────────────────────────────────────────
  //
  // Not about products at all: it is about the session cut-off that rides
  // along with every kind change. A host in the middle of a broadcast would
  // lose their token renewal and be thrown out of their own room, in front of
  // their audience, with no explanation and no way back before signing in
  // again. `scheduled` does not block — nothing is live yet.
  const liveEvents = await db.execute({
    sql: `SELECT COUNT(*) AS total, MIN(title) AS sample
          FROM events
          WHERE host_user_id = ? AND status = 'active'`,
    args: [sellerId],
  });
  if (countOf(liveEvents) > 0) {
    const title = liveEvents.rows[0].sample;
    blockers.push({
      code: 'LIVE_EVENT',
      count: countOf(liveEvents),
      message: `Está retransmitiendo un evento en directo${title ? ` («${title}»)` : ''}. Cambiar el tipo cerraría su sesión y le echaría de su propia sala. Espera a que finalice.`,
    });
  }

  // ── Applies only when withdrawing capabilities ────────────────────────
  if (toKind !== 'speaker') {
    return blockers;
  }

  const artProducts = await db.execute({
    sql: 'SELECT COUNT(*) AS total FROM art WHERE seller_id = ? AND removed = 0',
    args: [sellerId],
  });
  if (countOf(artProducts) > 0) {
    const n = countOf(artProducts);
    blockers.push({
      code: 'LIVE_ART',
      count: n,
      message: `Tiene ${n} ${n === 1 ? 'obra publicada' : 'obras publicadas'} en la galería. ${n === 1 ? 'Elimínala' : 'Elimínalas'} antes de convertirle en Ponente.`,
    });
  }

  const otherProducts = await db.execute({
    sql: 'SELECT COUNT(*) AS total FROM others WHERE seller_id = ? AND removed = 0',
    args: [sellerId],
  });
  if (countOf(otherProducts) > 0) {
    const n = countOf(otherProducts);
    blockers.push({
      code: 'LIVE_OTHERS',
      count: n,
      message: `Tiene ${n} ${n === 1 ? 'producto publicado' : 'productos publicados'} en la tienda. ${n === 1 ? 'Elimínalo' : 'Elimínalos'} antes de convertirle en Ponente.`,
    });
  }

  // Auctions and draws are reached through the product, so the two checks
  // above already catch the usual case. They are asked anyway for two
  // reasons: «tiene una subasta activa» tells the admin what to do and «tiene
  // 1 obra publicada» does not; and an artwork already marked `removed = 1`
  // with its auction still running is a real corner that must not slip past.
  const openAuctions = await db.execute({
    sql: `SELECT COUNT(*) AS total FROM (
            SELECT au.id
            FROM auction_arts aa
            JOIN art a ON aa.art_id = a.id
            JOIN auctions au ON aa.auction_id = au.id
            WHERE a.seller_id = ? AND au.status IN (${OPEN_CAMPAIGN_STATUSES.map(() => '?').join(',')})
            UNION
            SELECT au.id
            FROM auction_others ao
            JOIN others o ON ao.other_id = o.id
            JOIN auctions au ON ao.auction_id = au.id
            WHERE o.seller_id = ? AND au.status IN (${OPEN_CAMPAIGN_STATUSES.map(() => '?').join(',')})
          )`,
    args: [sellerId, ...OPEN_CAMPAIGN_STATUSES, sellerId, ...OPEN_CAMPAIGN_STATUSES],
  });
  if (countOf(openAuctions) > 0) {
    const n = countOf(openAuctions);
    blockers.push({
      code: 'OPEN_AUCTION',
      count: n,
      message: `Tiene ${n} ${n === 1 ? 'subasta sin finalizar' : 'subastas sin finalizar'}. ${n === 1 ? 'Espera a que termine o cancélala' : 'Espera a que terminen o cancélalas'}.`,
    });
  }

  const openDraws = await db.execute({
    sql: `SELECT COUNT(*) AS total
          FROM draws d
          WHERE d.status IN (${OPEN_CAMPAIGN_STATUSES.map(() => '?').join(',')})
            AND (
              (d.product_type = 'art'
                AND EXISTS (SELECT 1 FROM art a WHERE a.id = d.product_id AND a.seller_id = ?))
              OR
              (d.product_type = 'other'
                AND EXISTS (SELECT 1 FROM others o WHERE o.id = d.product_id AND o.seller_id = ?))
            )`,
    args: [...OPEN_CAMPAIGN_STATUSES, sellerId, sellerId],
  });
  if (countOf(openDraws) > 0) {
    const n = countOf(openDraws);
    blockers.push({
      code: 'OPEN_DRAW',
      count: n,
      message: `Tiene ${n} ${n === 1 ? 'sorteo sin finalizar' : 'sorteos sin finalizar'}. ${n === 1 ? 'Espera a que termine o cancélalo' : 'Espera a que terminen o cancélalos'}.`,
    });
  }

  // An order item is open while it is not confirmed. NULL is open too: it is
  // what an item carries before anybody touches its status.
  const statusPlaceholders = OPEN_ITEM_STATUSES.map(() => '?').join(',');
  const openItems = await db.execute({
    sql: `SELECT COUNT(*) AS total FROM (
            SELECT aoi.id
            FROM art_order_items aoi
            JOIN art a ON aoi.art_id = a.id
            WHERE a.seller_id = ?
              AND (aoi.status IS NULL OR aoi.status IN (${statusPlaceholders}))
            UNION ALL
            SELECT ooi.id
            FROM other_order_items ooi
            JOIN others o ON ooi.other_id = o.id
            WHERE o.seller_id = ?
              AND (ooi.status IS NULL OR ooi.status IN (${statusPlaceholders}))
          )`,
    args: [sellerId, ...OPEN_ITEM_STATUSES, sellerId, ...OPEN_ITEM_STATUSES],
  });
  if (countOf(openItems) > 0) {
    const n = countOf(openItems);
    blockers.push({
      code: 'OPEN_ORDER_ITEM',
      count: n,
      message: `Tiene ${n} ${n === 1 ? 'artículo de pedido sin cerrar' : 'artículos de pedido sin cerrar'}. ${n === 1 ? 'Complétalo' : 'Complétalos'} antes de convertirle en Ponente.`,
    });
  }

  return blockers;
}

module.exports = {
  sellerKindChangeBlockers,
  OPEN_ITEM_STATUSES,
  OPEN_CAMPAIGN_STATUSES,
};
