// Use axios instead of node-fetch to avoid ESM/CJS interop issues and improve error handling
const axios = require('axios');

const getBaseUrl = () => {
  const mode = (process.env.REVOLUT_MODE || 'sandbox').toLowerCase();
  return mode === 'production'
    ? process.env.REVOLUT_API_URL_PRODUCTION
    : process.env.REVOLUT_API_URL_SANDBOX;
};

/**
 * Create a Revolut Order and return the API response.
 * Pass a fully built payload that conforms to Revolut Merchant API "Create an order".
 *
 * @param {Object} payload - The full order payload to send to Revolut API
 * @returns {Promise<Object>} Revolut order object ({ id, token, state, ... })
 */
async function createRevolutOrder(payload) {
  const apiVersion = process.env.REVOLUT_API_VERSION;
  const secret = process.env.REVOLUT_SECRET_KEY;
  if (!secret) {
    throw new Error('REVOLUT_SECRET_KEY is not configured');
  }

  const url = `${getBaseUrl()}/orders`;
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Revolut-Api-Version': `${apiVersion}`
      },
      timeout: 15000,
    });
    return res.data;
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || {};
    const errMsg =
      data.message || data.error_description || data.error || error.message || 'Failed to create Revolut order';
    const err = new Error(errMsg);
    err.status = status;
    err.response = data;
    throw err;
  }
}

/**
 * Retrieve a Revolut Order by ID
 * @param {string} orderId
 * @returns {Promise<Object>} Revolut order object
 */
async function getRevolutOrder(orderId) {
  const apiVersion = process.env.REVOLUT_API_VERSION;
  const secret = process.env.REVOLUT_SECRET_KEY;
  if (!secret) {
    throw new Error('REVOLUT_SECRET_KEY is not configured');
  }

  const url = `${getBaseUrl()}/orders/${encodeURIComponent(orderId)}`;
  try {
    const res = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Accept': 'application/json',
        'Revolut-Api-Version': `${apiVersion}`,
      },
      timeout: 15000,
    });
    return res.data;
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || {};
    const errMsg = data.message || data.error_description || data.error || error.message || 'Failed to fetch Revolut order';
    const err = new Error(errMsg);
    err.status = status;
    err.response = data;
    throw err;
  }
}

/**
 * List payments created for a Revolut Order
 * Tries Merchant API endpoint: GET /orders/{orderId}/payments
 * @param {string} orderId
 * @returns {Promise<Array>} Array of payment objects
 */
async function getRevolutOrderPayments(orderId) {
  const apiVersion = process.env.REVOLUT_API_VERSION;
  const secret = process.env.REVOLUT_SECRET_KEY;
  if (!secret) {
    throw new Error('REVOLUT_SECRET_KEY is not configured');
  }

  const url = `${getBaseUrl()}/orders/${encodeURIComponent(orderId)}/payments`;
  try {
    const res = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Accept': 'application/json',
        'Revolut-Api-Version': `${apiVersion}`,
      },
      timeout: 15000,
    });
    // Ensure array shape
    if (Array.isArray(res.data)) return res.data;
    if (res.data && Array.isArray(res.data.payments)) return res.data.payments;
    return [];
  } catch (error) {
    const status = error.response?.status || 500;
    // If 404 or 400, let caller decide to fallback to order fetch
    if (status === 404 || status === 400) {
      const err = new Error('Payments endpoint not available');
      err.status = status;
      throw err;
    }
    const data = error.response?.data || {};
    const errMsg = data.message || data.error_description || data.error || error.message || 'Failed to fetch Revolut order payments';
    const err = new Error(errMsg);
    err.status = status;
    err.response = data;
    throw err;
  }
}

/**
 * Retrieve a payment by id
 * @param {string} paymentId
 * @returns {Promise<Object>} Payment object
 */
async function getRevolutPayment(paymentId) {
  const apiVersion = process.env.REVOLUT_API_VERSION;
  const secret = process.env.REVOLUT_SECRET_KEY;
  if (!secret) {
    throw new Error('REVOLUT_SECRET_KEY is not configured');
  }

  const url = `${getBaseUrl()}/payments/${encodeURIComponent(paymentId)}`;
  try {
    const res = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Accept': 'application/json',
        'Revolut-Api-Version': `${apiVersion}`,
      },
      timeout: 15000,
    });
    return res.data;
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || {};
    const errMsg = data.message || data.error_description || data.error || error.message || 'Failed to fetch Revolut payment';
    const err = new Error(errMsg);
    err.status = status;
    err.response = data;
    throw err;
  }
}

module.exports = {
  createRevolutOrder,
  getRevolutOrder,
  getRevolutOrderPayments,
  getRevolutPayment,
};
