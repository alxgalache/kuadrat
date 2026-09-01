/**
 * Server-side verification of the Sendcloud shipping a buyer selected.
 *
 * A Sendcloud selection never lands on the cart item: `setSendcloudShipping`
 * writes to `shippingSelections`, a state keyed by seller and parallel to the
 * cart, and `item.shipping` stays `null`. That is why `verifyShippingCosts`
 * skips these items on its first line — and why, until this module existed,
 * `computeShippingTotal` summed nothing and the buyer was never charged for
 * shipping at all.
 *
 * The price charged is the one THIS module re-quotes, never the one the browser
 * sent. The browser's figure travels only so a rate that moved between the
 * screen and the payment is caught and refused, rather than silently charged.
 * Same principle `zoneResolver` states for the legacy flow: the price shown and
 * the price validated are one number, not two that have to agree — which is why
 * the parcels are rebuilt through `cartQuoting`, the very code the quote
 * endpoint used, instead of a second copy of the grouping rules.
 *
 * Rejections carry a machine code in `title`, like the rest of the checkout:
 *   SHIPPING_SELECTION_REQUIRED  — a Sendcloud seller group with no method chosen
 *   SHIPPING_METHOD_UNAVAILABLE  — the chosen code is not in the fresh quote
 *   SHIPPING_COST_OUTDATED       — the price moved since it was shown
 *   SHIPPING_ADDRESS_REQUIRED    — a delivery group arrived with no address
 */

const logger = require('../../config/logger')
const { ApiError } = require('../../middleware/errorHandler')
const { quoteSellerGroups } = require('./cartQuoting')
const { isSendcloudEnabled } = require('./shippingProviderFactory')

/**
 * Euros to integer cents.
 *
 * Money is compared here and nowhere in floating point: `Math.abs(a - b) > 0.01`
 * does not express "one cent of tolerance", because 15,30 and 15,29 are
 * 0.010000000000001563 apart in binary floating point and the boundary the
 * comparison claims to allow gets rejected at random.
 */
function toCents(amount) {
  return Math.round((Number(amount) || 0) * 100)
}

/**
 * The cart items that are priced by Sendcloud, in the shape `cartQuoting`
 * expects. Items of a type Sendcloud does not handle are left to the legacy
 * verification, which prices them per item.
 */
function sendcloudItemsOf(compactItems, artMap, otherMap) {
  const items = []

  for (const item of compactItems) {
    const type = item.type === 'others' ? 'other' : item.type
    if (!isSendcloudEnabled(type)) continue

    const product = type === 'art' ? artMap.get(item.id) : otherMap.get(item.id);
    if (!product || !product.seller_id) continue

    items.push({
      productId: item.id,
      productType: type,
      quantity: item.quantity || 1,
      sellerId: product.seller_id,
      variantId: item.variantId ?? null,
    })
  }

  return items
}

/**
 * Verify the buyer's per-seller Sendcloud selections and return what to charge.
 *
 * @param {object[]} compactItems - `{ type, id, variantId?, quantity }`
 * @param {Map} artMap - from `loadProductsDetails`
 * @param {Map} otherMap - from `loadProductsDetails`
 * @param {object} options
 * @param {object[]} options.shippingSelections - `{ sellerId, shippingOptionCode, servicePointId, cost, type? }`
 * @param {{country: string, postalCode: string}} [options.deliveryAddress]
 * @returns {Promise<{sellerId: number, cost: number, shippingOptionCode: string, servicePointId: string|null, name: string, type: string}[]>}
 * @throws {ApiError} 400 with a machine code in `title`
 */
async function verifySendcloudShipping(compactItems, artMap, otherMap, options = {}) {
  const { shippingSelections = [], deliveryAddress } = options

  const items = sendcloudItemsOf(compactItems, artMap, otherMap)
  if (items.length === 0) return []

  const selectionBySeller = new Map()
  for (const selection of shippingSelections) {
    selectionBySeller.set(Number(selection.sellerId), selection)
  }

  // Pickup is seller-wide and carries no geographic filter, so a cart whose
  // Sendcloud groups are all pickup legitimately has no delivery address.
  const sellerIds = [...new Set(items.map(i => i.sellerId))]
  const needsDelivery = sellerIds.some(id => {
    const selection = selectionBySeller.get(Number(id))
    return !selection || selection.type !== 'pickup'
  })

  if (needsDelivery && !deliveryAddress?.postalCode) {
    throw new ApiError(
      400,
      'Falta la dirección de entrega para calcular el envío.',
      'SHIPPING_ADDRESS_REQUIRED'
    )
  }

  const verified = []
  const quoted = needsDelivery
    ? await quoteSellerGroups({
        items,
        deliveryAddress: {
          country: deliveryAddress.country || 'ES',
          postalCode: deliveryAddress.postalCode,
        },
      })
    : []

  const quotedBySeller = new Map(quoted.map(q => [Number(q.sellerId), q]))

  for (const sellerId of sellerIds) {
    const selection = selectionBySeller.get(Number(sellerId))

    if (!selection || (!selection.shippingOptionCode && selection.type !== 'pickup')) {
      throw new ApiError(
        400,
        'Selecciona un método de envío para cada vendedor antes de pagar.',
        'SHIPPING_SELECTION_REQUIRED'
      )
    }

    // Pickup costs nothing and is not a Sendcloud option, so there is no rate
    // to re-quote and nothing that can go out of date.
    if (selection.type === 'pickup') {
      verified.push({
        sellerId: Number(sellerId),
        cost: 0,
        shippingOptionCode: '',
        servicePointId: null,
        name: 'Recogida en persona',
        type: 'pickup',
      })
      continue
    }

    const group = quotedBySeller.get(Number(sellerId))
    const option = group?.deliveryOptions?.find(
      candidate => candidate.shippingOptionCode === selection.shippingOptionCode
        || candidate.id === selection.shippingOptionCode
    )

    if (!option) {
      logger.warn(
        { sellerId, shippingOptionCode: selection.shippingOptionCode, deliveryError: group?.deliveryError },
        'Selected Sendcloud option is absent from the fresh quote'
      )
      throw new ApiError(
        400,
        'El método de envío elegido ya no está disponible para esta dirección.',
        'SHIPPING_METHOD_UNAVAILABLE'
      )
    }

    const quotedCents = toCents(option.price)
    const shownCents = toCents(selection.cost)

    if (quotedCents !== shownCents) {
      logger.warn(
        { sellerId, shippingOptionCode: selection.shippingOptionCode, quotedCents, shownCents },
        'Sendcloud rate moved between the quote shown to the buyer and payment'
      )
      throw new ApiError(
        400,
        'El coste de envío ha cambiado. Vuelve a elegir el método de envío.',
        'SHIPPING_COST_OUTDATED'
      )
    }

    verified.push({
      sellerId: Number(sellerId),
      // The freshly quoted number, never the one the browser sent.
      cost: option.price,
      shippingOptionCode: option.shippingOptionCode || option.id,
      servicePointId: selection.servicePointId || null,
      name: option.name || option.carrier?.name || '',
      type: option.type || 'home_delivery',
    })

    logger.info(
      { sellerId, shippingOptionCode: option.shippingOptionCode, cents: quotedCents },
      'Sendcloud shipping verified'
    )
  }

  return verified
}

/**
 * The verified costs in the compact form carried on the PaymentIntent, so order
 * creation records exactly what was charged instead of quoting a second time.
 * Well under Stripe's 500-character limit per metadata value.
 */
function encodeVerifiedShipping(verified) {
  return JSON.stringify(verified.map(v => ({ s: v.sellerId, c: toCents(v.cost) })))
}

/**
 * Read back what `encodeVerifiedShipping` wrote. Returns a Map of sellerId to
 * euros, or null when the metadata is absent — an order paid before this
 * change, or through a provider with no such channel.
 */
function decodeVerifiedShipping(raw) {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return new Map(parsed.map(entry => [Number(entry.s), (Number(entry.c) || 0) / 100]))
  } catch {
    logger.warn({ raw }, 'Could not decode the verified shipping carried on the payment')
    return null
  }
}

module.exports = {
  verifySendcloudShipping,
  encodeVerifiedShipping,
  decodeVerifiedShipping,
  toCents,
}
