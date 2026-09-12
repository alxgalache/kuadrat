/**
 * Client half of the seller capability model (seller-kind-artist-speaker).
 *
 * Mirrors `api/utils/sellerCapabilities.js` and must agree with it. The
 * server is the authority — every one of these capabilities is also enforced
 * by `requireArtistSeller` — and this module only decides what to OFFER. A
 * hidden menu entry is not a permission.
 *
 * Every screen asks these predicates instead of comparing the literal
 * `'speaker'`, for the reason the API module documents at length: three
 * inline copies of a comparison is exactly what let the `productCategory ===
 * 'others'` typo survive in `ProductForm`.
 */

/** The two values `users.seller_kind` may hold. */
export const SELLER_KINDS = ['artist', 'speaker']

/** The value a row gets when nobody chose one. Matches the column DEFAULT. */
export const DEFAULT_SELLER_KIND = 'artist'

/**
 * Normalise whatever the stored `user` object carries into one of the two
 * values.
 *
 * An absent value reads as `'artist'`. That matters here more than on the
 * server: the `user` object lives in `localStorage` and a session opened
 * before this change deployed carries no `seller_kind` at all. Reading that
 * as a speaker would strip an artist's own menu until they signed in again.
 */
export function sellerKindOf(userOrKind) {
  const raw = typeof userOrKind === 'string' ? userOrKind : userOrKind?.seller_kind
  return SELLER_KINDS.includes(raw) ? raw : DEFAULT_SELLER_KIND
}

/** A seller who only takes part in multimedia events. */
export function isSpeaker(userOrKind) {
  return sellerKindOf(userOrKind) === 'speaker'
}

/** The full seller that existed before this change. */
export function isArtistSeller(userOrKind) {
  return sellerKindOf(userOrKind) === 'artist'
}

/** May reach the publish form and the products screen. */
export function canPublishProducts(userOrKind) {
  return isArtistSeller(userOrKind)
}

/** May reach «Mis envíos». */
export function canManageShipments(userOrKind) {
  return isArtistSeller(userOrKind)
}

/** May be offered a Sendcloud configuration section in the admin panel. */
export function canHaveSendcloudConfig(userOrKind) {
  return isArtistSeller(userOrKind)
}

/** May reach «Pedidos». A speaker never has an order item of their own. */
export function canSeeOrders(userOrKind) {
  return isArtistSeller(userOrKind)
}

/**
 * May reach «Monedero». BOTH kinds can, and that is the whole point of
 * splitting the wallet out of `/orders`: a speaker earns through paid events
 * and needs to see their balance and request payment without ever having an
 * order.
 */
export function canSeeWallet() {
  return true
}
