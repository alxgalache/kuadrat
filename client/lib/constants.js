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
export const STEP_SHIPPING = 3;
export const STEP_PAYMENT = 4;

// Sendcloud feature flags
export const SENDCLOUD_ENABLED_ART = process.env.NEXT_PUBLIC_SENDCLOUD_ENABLED_ART === 'true';
export const SENDCLOUD_ENABLED_OTHERS = process.env.NEXT_PUBLIC_SENDCLOUD_ENABLED_OTHERS === 'true';
export const SENDCLOUD_ENABLED = SENDCLOUD_ENABLED_ART || SENDCLOUD_ENABLED_OTHERS;

// Maximum number of images per product (global) and per variation (others)
export const MAX_PRODUCT_IMAGES = 3;

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

// Stale order alert thresholds (days)
export const STALE_ARRIVED_DAYS = 10;
export const STALE_SENT_DAYS = 15;

// Event spam detection
export const SPAM_MAX_MESSAGES = 10;
export const SPAM_WINDOW_MS = 10000;

// Public brand name — the user-facing marketplace brand.
// "Kuadrat" is only the internal codename; any text shown to buyers, sellers,
// or visitors should use these constants instead of the repo/project name.
export const PUBLIC_BRAND_NAME = '140d Galería de Arte';
export const PUBLIC_BRAND_NAME_SHORT = '140d';

// CoA tag statuses (admin-side). Used by the badge in /admin/coa.
// Keys match `nfc_tags.status` in the DB.
export const COA_TAG_STATUSES = {
  active:  { label: 'Activa',   className: 'bg-green-100 text-green-800' },
  revoked: { label: 'Revocada', className: 'bg-red-100 text-red-800' },
  lost:    { label: 'Perdida',  className: 'bg-amber-100 text-amber-800' },
  damaged: { label: 'Dañada',   className: 'bg-orange-100 text-orange-800' },
};

// CoA verification event statuses (admin-side audit log).
// Keys match `verification_events.status` in the DB.
export const COA_EVENT_STATUSES = {
  ok:           { label: 'OK',              className: 'bg-green-100 text-green-800' },
  invalid_cmac: { label: 'CMAC inválido',   className: 'bg-red-100 text-red-800' },
  replay:       { label: 'Replay',          className: 'bg-amber-100 text-amber-800' },
  unknown_tag:  { label: 'Tag desconocido', className: 'bg-gray-200 text-gray-800' },
  revoked:      { label: 'Revocada',        className: 'bg-red-100 text-red-800' },
  malformed:    { label: 'Mal formada',     className: 'bg-gray-100 text-gray-700' },
};

// Art product inquiry form (in the gallery product detail page).
// All es-ES copy lives here so the modal component stays pure markup.
export const INQUIRY_FIELD_LIMITS = {
  name: 120,
  email: 200,
  phone: 40,
  message: 2000,
};

export const INQUIRY_COPY = {
  prompt: 'Si deseas utilizar otro método de pago, cambiar el método de envío, o solicitar información específica sobre esta obra,',
  promptLink: 'haz click aquí',
  modalTitle: 'Consulta sobre esta obra',
  modalSubtitle: 'Cuéntanos qué necesitas y te responderemos por email.',
  labelName: 'Nombre completo',
  labelEmail: 'Email de contacto',
  labelPhone: 'Teléfono de contacto (opcional)',
  labelMessage: 'Mensaje',
  placeholderName: 'Tu nombre',
  placeholderEmail: 'tucorreo@ejemplo.com',
  placeholderPhone: '+34 600 000 000',
  placeholderMessage: 'Escribe aquí tu consulta…',
  submit: 'Enviar',
  submitting: 'Enviando…',
  cancel: 'Cancelar',
  gdpr: 'Al enviar este formulario usaremos tus datos únicamente para responder a tu consulta. Consulta nuestra',
  gdprLink: 'política de privacidad',
  gdprHref: '/legal/politica-de-privacidad',
  captchaLoading: 'Cargando verificación de seguridad…',
  bannerSuccess: 'Consulta enviada. Te responderemos en breve.',
  bannerErrorCaptchaFailed: 'Verificación de seguridad fallida. Inténtalo de nuevo.',
  bannerErrorCaptchaUnavailable: 'No se puede enviar la consulta en este momento. Inténtalo más tarde.',
  bannerErrorRateLimit: 'Has alcanzado el número máximo de consultas. Inténtalo de nuevo más tarde.',
  bannerErrorEmailDelivery: 'No se pudo enviar el email. Inténtalo más tarde.',
  bannerErrorProductNotFound: 'No se pudo enviar la consulta: obra no encontrada.',
  bannerErrorGeneric: 'No se pudo enviar la consulta. Inténtalo más tarde.',
};

// CoA verification result messages (Spanish) shown to a collector when their
// tap fails. Keys match the status strings returned by /api/coa/verify.
export const COA_FAILURE_MESSAGES = {
  malformed:
    'El enlace de verificación es inválido. Es posible que la URL se haya copiado o modificado de forma incorrecta.',
  invalid_cmac:
    'La firma del certificado no es válida. Esta pegatina podría ser una copia o haber sido manipulada.',
  unknown_tag:
    'Este certificado no está registrado en nuestra galería. Si lo has recibido junto con una obra, ponte en contacto con nosotros.',
  replay:
    'Esta lectura ya había sido registrada anteriormente. Si crees que es un error, verifica que la pegatina no haya sido copiada.',
  revoked:
    'Este certificado ha sido marcado como revocado, perdido o dañado. Ponte en contacto con la galería para más información.',
};
