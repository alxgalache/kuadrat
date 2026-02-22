/**
 * Application-wide constants.
 * Centralizes magic numbers and configuration values.
 */

// Debounce timers (ms)
export const DEBOUNCE_POSTAL_CODE = 400;
export const DEBOUNCE_SEARCH = 300;

// Animation durations (ms)
export const ANIMATION_BOUNCE = 600;
export const ANIMATION_FADE = 300;
export const ANIMATION_PRICE_UPDATE = 1000;

// Cart
export const CART_EXPIRY_DAYS = 10;
export const CART_STORAGE_KEY = 'kuadrat_cart';
export const CART_TIMESTAMP_KEY = 'kuadrat_cart_timestamp';

// Pagination
export const DEFAULT_PAGE_SIZE = 12;
export const ADMIN_PAGE_SIZE = 20;
export const ORDERS_PAGE_SIZE = 5;

// Auction
export const AUCTION_BUYER_SESSION_PREFIX = 'auction_buyer_';

// Checkout steps
export const STEP_CART = 1;
export const STEP_ADDRESS = 2;
export const STEP_PAYMENT = 3;

// Bid modal phases
export const BID_PHASES = {
  CHOOSE: 'choose',
  VERIFY: 'verify',
  TERMS: 'terms',
  PERSONAL: 'personal',
  DELIVERY: 'delivery',
  INVOICING: 'invoicing',
  PAYMENT: 'payment',
  CONFIRM: 'confirm',
  SUCCESS: 'success',
};

// Event spam detection
export const SPAM_MAX_MESSAGES = 10;
export const SPAM_WINDOW_MS = 10000;
