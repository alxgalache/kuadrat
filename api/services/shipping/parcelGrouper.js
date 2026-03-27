/**
 * Groups cart items into parcels per seller based on product type and co-packability.
 *
 * Rules:
 * - Art products: always separate parcels (one per piece)
 * - Others products with can_copack=1: aggregated into one parcel (summed weight)
 * - Others products with can_copack=0: each becomes its own parcel
 *
 * @param {object[]} items - Cart items for a single seller
 *   Each item: { productId, productType, quantity, weight, dimensions, canCopack, name, price, sellerId }
 * @returns {object[]} Array of parcels
 *   Each parcel: { weight, dimensions, totalValue, quantity, items, itemIds, productType }
 */
function groupIntoParcels(items) {
  const parcels = []

  const artItems = items.filter(i => i.productType === 'art')
  const otherItems = items.filter(i => i.productType === 'other' || i.productType === 'others')

  // Art: each item is its own parcel
  for (const item of artItems) {
    parcels.push({
      weight: item.weight || null,
      dimensions: item.dimensions || null,
      totalValue: item.price || 0,
      quantity: 1,
      productType: 'art',
      items: [item],
      itemIds: [{ productId: item.productId, productType: 'art' }],
    })
  }

  // Others: group by co-packability
  const copackable = otherItems.filter(i => i.canCopack !== 0 && i.canCopack !== false)
  const nonCopackable = otherItems.filter(i => i.canCopack === 0 || i.canCopack === false)

  // Co-packable items -> one aggregated parcel
  if (copackable.length > 0) {
    let totalWeight = 0
    let totalValue = 0
    let totalQuantity = 0
    const allItems = []
    const allItemIds = []

    for (const item of copackable) {
      const qty = item.quantity || 1
      totalWeight += (item.weight || 0) * qty
      totalValue += (item.price || 0) * qty
      totalQuantity += qty
      allItems.push(item)
      allItemIds.push({ productId: item.productId, productType: 'other', variantId: item.variantId })
    }

    parcels.push({
      weight: totalWeight || null,
      dimensions: null, // Don't aggregate dimensions for co-packed items
      totalValue,
      quantity: totalQuantity,
      productType: 'other',
      items: allItems,
      itemIds: allItemIds,
    })
  }

  // Non-co-packable items -> each is its own parcel
  for (const item of nonCopackable) {
    const qty = item.quantity || 1
    // For items with quantity > 1, create one parcel per unit
    for (let i = 0; i < qty; i++) {
      parcels.push({
        weight: item.weight || null,
        dimensions: item.dimensions || null,
        totalValue: item.price || 0,
        quantity: 1,
        productType: 'other',
        items: [item],
        itemIds: [{ productId: item.productId, productType: 'other', variantId: item.variantId }],
      })
    }
  }

  return parcels
}

/**
 * Groups cart items by seller, then creates parcels per seller.
 *
 * @param {object[]} items - All cart items
 * @returns {Map<number, { sellerId, sellerName, parcels, items }>}
 */
function groupBySeller(items) {
  const sellerMap = new Map()

  for (const item of items) {
    const sid = item.sellerId
    if (!sellerMap.has(sid)) {
      sellerMap.set(sid, {
        sellerId: sid,
        sellerName: item.sellerName || '',
        items: [],
      })
    }
    sellerMap.get(sid).items.push(item)
  }

  // Create parcels per seller
  for (const [sid, group] of sellerMap) {
    group.parcels = groupIntoParcels(group.items)
  }

  return sellerMap
}

module.exports = { groupIntoParcels, groupBySeller }
