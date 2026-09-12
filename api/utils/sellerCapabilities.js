/**
 * What each kind of seller is allowed to do (seller-kind-artist-speaker).
 *
 * `users.seller_kind` is a second axis on top of `role`. A speaker IS a
 * seller — they invoice, hold a wallet, appear in payouts and host paid
 * events — they simply never publish a product. Expressing that as a new
 * `role` would have thrown them out of the twenty `role = 'seller'` checks
 * spread across stripeConnectController, stripeConnectPayoutsController,
 * marketingController, usersController and authorRoutes, only to have to
 * readmit them one by one.
 *
 * Every consumer asks these predicates. Nobody compares the literal
 * `'speaker'` inline. The repository has paid for that lesson twice already:
 * `zoneResolver` exists because the tariff-matching predicate was duplicated,
 * and `ProductForm` compared `productCategory === 'others'` in THREE places
 * against a value the `<select>` could not emit — three inline copies is what
 * let the typo survive. A `seller_kind === 'speaker'` scattered over eight
 * routes and a dozen screens would end the same way.
 *
 * The client half lives in `client/lib/sellerCapabilities.js` and must agree.
 */

/** The two values `users.seller_kind` may hold. */
const SELLER_KINDS = Object.freeze(['artist', 'speaker']);

/** The value a row gets when nobody chose one. Matches the column DEFAULT. */
const DEFAULT_SELLER_KIND = 'artist';

/**
 * Normalise whatever a row or a token payload carries into one of the two
 * values.
 *
 * An absent or unrecognised value reads as `'artist'`, matching the column
 * DEFAULT: this is what makes an API booted against a database whose
 * `safeAlter` has not run yet behave exactly as it did before the change,
 * rather than locking every seller out of their own products.
 *
 * @param {{ seller_kind?: string }|string|null|undefined} userOrKind
 * @returns {'artist'|'speaker'}
 */
function sellerKindOf(userOrKind) {
  const raw = typeof userOrKind === 'string' ? userOrKind : userOrKind?.seller_kind;
  return SELLER_KINDS.includes(raw) ? raw : DEFAULT_SELLER_KIND;
}

/** Whether `value` is one of the two accepted kinds. */
function isValidSellerKind(value) {
  return SELLER_KINDS.includes(value);
}

/** A seller who only takes part in multimedia events. */
function isSpeaker(userOrKind) {
  return sellerKindOf(userOrKind) === 'speaker';
}

/** The full seller that existed before this change. */
function isArtistSeller(userOrKind) {
  return sellerKindOf(userOrKind) === 'artist';
}

/** May publish and manage `art`, `others` and legacy `products`. */
function canPublishProducts(userOrKind) {
  return isArtistSeller(userOrKind);
}

/** May reach the Sendcloud seller shipments screens and endpoints. */
function canManageShipments(userOrKind) {
  return isArtistSeller(userOrKind);
}

/** May hold a `user_sendcloud_configuration` row worth writing. */
function canHaveSendcloudConfig(userOrKind) {
  return isArtistSeller(userOrKind);
}

/**
 * May host an event. Both kinds can — hosting is the whole point of a speaker
 * and was never taken away from an artist. The predicate exists so the intent
 * is written down somewhere and a future gate is not added by accident.
 */
function canHostEvents() {
  return true;
}

module.exports = {
  SELLER_KINDS,
  DEFAULT_SELLER_KIND,
  sellerKindOf,
  isValidSellerKind,
  isSpeaker,
  isArtistSeller,
  canPublishProducts,
  canManageShipments,
  canHaveSendcloudConfig,
  canHostEvents,
};
