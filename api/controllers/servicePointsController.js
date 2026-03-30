const { sendSuccess } = require('../utils/response')
const { isSendcloudEnabledForAny } = require('../services/shipping/shippingProviderFactory')
const sendcloudProvider = require('../services/shipping/sendcloudProvider')

/**
 * GET /api/shipping/service-points
 * Query: { carrier, country, postalCode, radius? }
 */
const getServicePoints = async (req, res, next) => {
  try {
    if (!isSendcloudEnabledForAny()) {
      return sendSuccess(res, { servicePoints: [] })
    }

    const { carrier, country, postalCode, radius } = req.query

    const servicePoints = await sendcloudProvider.getServicePoints({
      carrier,
      country,
      postalCode,
      radius: radius ? parseInt(radius, 10) : 5000,
    })

    sendSuccess(res, { servicePoints })
  } catch (error) {
    next(error)
  }
}

module.exports = { getServicePoints }
