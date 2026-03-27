const config = require('../../config/env')
const sendcloudProvider = require('./sendcloudProvider')
const legacyProvider = require('./legacyProvider')

/**
 * Returns the appropriate shipping provider based on product type
 * and environment configuration.
 *
 * @param {'art' | 'other' | 'others'} productType
 * @returns {object} Provider with getDeliveryOptions, getServicePoints, createShipments, etc.
 */
function getProvider(productType) {
  const normalizedType = productType === 'others' ? 'other' : productType

  if (normalizedType === 'art' && config.sendcloud.enabledArt) {
    return sendcloudProvider
  }

  if (normalizedType === 'other' && config.sendcloud.enabledOthers) {
    return sendcloudProvider
  }

  return legacyProvider
}

/**
 * Check if Sendcloud is enabled for a given product type.
 */
function isSendcloudEnabled(productType) {
  const normalizedType = productType === 'others' ? 'other' : productType

  if (normalizedType === 'art') return config.sendcloud.enabledArt
  if (normalizedType === 'other') return config.sendcloud.enabledOthers

  return false
}

/**
 * Check if Sendcloud is enabled for any product type.
 */
function isSendcloudEnabledForAny() {
  return config.sendcloud.enabledArt || config.sendcloud.enabledOthers
}

module.exports = { getProvider, isSendcloudEnabled, isSendcloudEnabledForAny }
