const { db } = require('../config/database')
const logger = require('../config/logger')
const { ApiError } = require('../middleware/errorHandler')
const { sendSuccess } = require('../utils/response')
const { quoteSellerGroups } = require('../services/shipping/cartQuoting')

/**
 * POST /api/shipping/options
 *
 * Returns normalized shipping options grouped by seller.
 * Body: { items: [...], deliveryAddress: { country, postalCode, city, address } }
 */
const getShippingOptions = async (req, res, next) => {
  try {
    const { items, deliveryAddress } = req.body

    // The grouping, the parcels and the provider dispatch live in
    // `cartQuoting`, shared with the payment endpoints that charge for this
    // quote. Everything below is presentation: pickup and the response shape.
    const quoted = await quoteSellerGroups({ items, deliveryAddress })
    const sellers = []

    for (const { sellerId, group, productTypes, deliveryOptions, deliveryError } of quoted) {
      // Get seller pickup info. `allow_store_pickup` lives on the Sendcloud
      // configuration and is the ONLY thing that decides whether the option is
      // offered; the users.pickup_* columns are read for display only.
      const sellerResult = await db.execute({
        sql: `SELECT u.full_name, u.pickup_address, u.pickup_city, u.pickup_postal_code,
                     u.pickup_country, u.pickup_instructions,
                     usc.allow_store_pickup
              FROM users u
              LEFT JOIN user_sendcloud_configuration usc ON usc.user_id = u.id
              WHERE u.id = ?`,
        args: [sellerId],
      })

      // Pickup is a STORE feature. Art shipments are arranged by hand from the
      // Sendcloud web interface, so an art-only group is never offered pickup
      // here — and a mixed group is offered it on account of its store items.
      const hasStoreItems = productTypes.includes('other')

      let pickupOption = null
      if (sellerResult.rows.length > 0 && hasStoreItems) {
        const seller = sellerResult.rows[0]
        // A seller with no Sendcloud configuration row has no flag, so the
        // LEFT JOIN yields null — which is the same answer as an explicit 0.
        if (seller.allow_store_pickup) {
          pickupOption = {
            address: seller.pickup_address || '',
            city: seller.pickup_city || '',
            postalCode: seller.pickup_postal_code || '',
            country: seller.pickup_country || 'ES',
            instructions: seller.pickup_instructions || '',
          }
        }
      }

      sellers.push({
        sellerId,
        sellerName: sellerResult.rows[0]?.full_name || group.sellerName || '',
        parcelCount: group.parcels.length,
        productCount: group.items.reduce((sum, i) => sum + (i.quantity || 1), 0),
        deliveryOptions,
        pickupOption,
        deliveryError,
      })
    }

    sendSuccess(res, { sellers })
  } catch (error) {
    next(error)
  }
}

module.exports = { getShippingOptions }
