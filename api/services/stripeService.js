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
 * Find an existing Stripe Customer by email, or create a new one.
 * Prevents duplicate customers with the same email in Stripe.
 * If found, updates name/phone if they differ from the stored values.
 * @param {Object} params
 * @param {string} params.email - Customer email (required)
 * @param {string} [params.name] - Customer name
 * @param {string} [params.phone] - Customer phone
 * @param {Object} [params.metadata] - Metadata to attach (only used on creation)
 * @returns {Promise<Object>} Stripe Customer object
 */
async function findOrCreateCustomer({ email, name, phone, metadata = {} }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  const normalizedEmail = (email || '').toLowerCase().trim();
  if (!normalizedEmail) {
    throw new Error('Email is required to find or create a Stripe customer');
  }

  // Search for an existing customer with this email
  const existing = await stripe.customers.list({
    email: normalizedEmail,
    limit: 1,
  });

  if (existing.data.length > 0) {
    const customer = existing.data[0];

    // Update name/phone if they changed
    const updates = {};
    if (name && name !== customer.name) updates.name = name;
    if (phone && phone !== customer.phone) updates.phone = phone;

    if (Object.keys(updates).length > 0) {
      return stripe.customers.update(customer.id, updates);
    }

    return customer;
  }

  // No existing customer found - create a new one
  return stripe.customers.create({
    email: normalizedEmail,
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    metadata,
  });
}

/**
 * Update a PaymentIntent with additional data (customer, shipping, receipt_email, description, metadata).
 * Used to enrich the PaymentIntent after the buyer fills in personal and address information.
 * @param {string} paymentIntentId
 * @param {Object} params
 * @param {string} [params.customer] - Stripe Customer ID to attach
 * @param {Object} [params.shipping] - Shipping info { name, phone, address: { line1, line2, city, state, postal_code, country } }
 * @param {string} [params.receipt_email] - Email to send the receipt to
 * @param {string} [params.description] - Description of the payment
 * @param {Object} [params.metadata] - Additional metadata key-value pairs (merged with existing)
 * @returns {Promise<Object>} Updated Stripe PaymentIntent object
 */
async function updatePaymentIntent(paymentIntentId, { customer, shipping, receipt_email, description, metadata } = {}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  const updateData = {};
  if (customer) updateData.customer = customer;
  if (shipping) updateData.shipping = shipping;
  if (receipt_email) updateData.receipt_email = receipt_email;
  if (description) updateData.description = description;
  if (metadata) updateData.metadata = metadata;

  return stripe.paymentIntents.update(paymentIntentId, updateData);
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
  updatePaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  constructWebhookEvent,
  createStripeCustomer,
  findOrCreateCustomer,
  createAuctionPaymentIntent,
  retrievePaymentMethod,
  chargeWinnerOffSession,
  attachPaymentMethodToCustomer,
};
