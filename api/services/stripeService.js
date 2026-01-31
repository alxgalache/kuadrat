const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a Stripe PaymentIntent
 * @param {Object} params
 * @param {number} params.amount - Amount in minor units (cents)
 * @param {string} params.currency - Currency code (e.g. 'eur')
 * @param {Object} [params.metadata] - Metadata to attach
 * @returns {Promise<Object>} Stripe PaymentIntent object
 */
async function createPaymentIntent({ amount, currency = 'eur', metadata = {} }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata,
  });

  return paymentIntent;
}

/**
 * Retrieve a PaymentIntent by ID
 * @param {string} paymentIntentId
 * @returns {Promise<Object>} Stripe PaymentIntent object
 */
async function retrievePaymentIntent(paymentIntentId) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  return stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Cancel a PaymentIntent
 * @param {string} paymentIntentId
 * @returns {Promise<Object>} Cancelled PaymentIntent object
 */
async function cancelPaymentIntent(paymentIntentId) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  return stripe.paymentIntents.cancel(paymentIntentId);
}

/**
 * Construct and verify a webhook event from Stripe
 * @param {string|Buffer} rawBody - Raw request body
 * @param {string} signature - Stripe-Signature header
 * @returns {Object} Verified Stripe event object
 */
function constructWebhookEvent(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  constructWebhookEvent,
};
