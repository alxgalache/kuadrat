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

/**
 * Create a Stripe Customer
 * @param {Object} params
 * @param {string} params.email - Customer email
 * @param {string} params.name - Customer name
 * @param {Object} [params.metadata] - Metadata to attach
 * @returns {Promise<Object>} Stripe Customer object
 */
async function createStripeCustomer({ email, name, metadata = {} }) {
  const customer = await stripe.customers.create({ email, name, metadata });
  return customer;
}

/**
 * Create a PaymentIntent for the 1 EUR auction registration fee with setup_future_usage
 * @param {Object} params
 * @param {string} params.customerId - Stripe Customer ID
 * @param {number} [params.amount=100] - Amount in minor units (default 100 = 1 EUR)
 * @param {string} [params.currency='eur'] - Currency code
 * @param {Object} [params.metadata] - Metadata to attach
 * @returns {Promise<Object>} Stripe PaymentIntent object
 */
async function createAuctionPaymentIntent({ customerId, amount = 100, currency = 'eur', metadata = {} }) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount, // 100 = 1 EUR in cents
    currency: currency.toLowerCase(),
    customer: customerId,
    setup_future_usage: 'off_session',
    automatic_payment_methods: { enabled: true },
    metadata,
  });
  return paymentIntent;
}

/**
 * Retrieve a PaymentMethod by ID (e.g. to get card details)
 * @param {string} paymentMethodId
 * @returns {Promise<Object>} Stripe PaymentMethod object
 */
async function retrievePaymentMethod(paymentMethodId) {
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  return paymentMethod;
}

/**
 * Charge the auction winner off-session using a saved payment method.
 * Handles SCA (authentication_required) gracefully.
 * @param {Object} params
 * @param {string} params.customerId - Stripe Customer ID
 * @param {string} params.paymentMethodId - Saved PaymentMethod ID
 * @param {number} params.amount - Amount in minor units (cents)
 * @param {string} [params.currency='eur'] - Currency code
 * @param {Object} [params.metadata] - Metadata to attach
 * @returns {Promise<Object>} Result with success flag and paymentIntent or SCA details
 */
async function chargeWinnerOffSession({ customerId, paymentMethodId, amount, currency = 'eur', metadata = {} }) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata,
    });
    return { success: true, paymentIntent };
  } catch (err) {
    if (err.code === 'authentication_required') {
      return {
        success: false,
        requiresAction: true,
        paymentIntentId: err.raw?.payment_intent?.id,
        clientSecret: err.raw?.payment_intent?.client_secret,
      };
    }
    throw err;
  }
}

/**
 * Attach a PaymentMethod to a Customer and set it as the default for invoices
 * @param {string} paymentMethodId - PaymentMethod ID to attach
 * @param {string} customerId - Stripe Customer ID
 * @returns {Promise<Object>} Attached PaymentMethod object
 */
async function attachPaymentMethodToCustomer(paymentMethodId, customerId) {
  const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  return paymentMethod;
}

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  constructWebhookEvent,
  createStripeCustomer,
  createAuctionPaymentIntent,
  retrievePaymentMethod,
  chargeWinnerOffSession,
  attachPaymentMethodToCustomer,
};
