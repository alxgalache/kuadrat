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

// Storefront buy/quote toggles (build-time).
// Fail-safe: undefined behaves as enabled (preserves the current "Añadir a la
// cesta" behavior). Only the literal string 'false' disables the flag.
export const PAYMENT_ENABLED = process.env.NEXT_PUBLIC_PAYMENT_ENABLED !== 'false';
export const ART_BUY_AVAILABLE = process.env.NEXT_PUBLIC_ART_BUY_AVAILABLE !== 'false';

// Meta Pixel (Facebook/Instagram Ads). Build-time id del conjunto de datos.
// Fail-safe INVERSO al resto de flags: vacío = desactivado. Sin id no se
// inyecta el script ni se emite ningún evento, así que un despliegue que
// olvide la variable no envía datos a Meta en lugar de romperse.
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '';

// Newsletter signup chip (navbar, non-logged users). Fail-safe: unset = enabled,
// only the literal 'false' hides it. Backend signup is gated separately by
// MARKETING_EMAILS_ENABLED.
export const NEWSLETTER_ENABLED = process.env.NEXT_PUBLIC_NEWSLETTER_ENABLED !== 'false';

// Maximum number of images per product (global) and per variation (others)
export const MAX_PRODUCT_IMAGES = 3;

// Platform margin VAT (general rate) applied on top of the gallery's margin for
// standard-regime art sales (cooperative artists). Mirrors VAT_RATE_STANDARD in
// api/utils/vatCalculator.js — it is the gallery's own VAT, NOT the seller's
// tax_vat_art. Used by the publish form's gross-earnings preview so it matches
// the sale-time split in api/utils/artCommission.js to the cent.
export const PLATFORM_MARGIN_VAT_RATE = 0.21;

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

// Event spam detection (same thresholds enforced server-side in
// api/socket/eventSocket.js for Agora rooms)
export const SPAM_MAX_MESSAGES = 10;
export const SPAM_WINDOW_MS = 10000;

// Agora live rooms
// volume-indicator reports levels 0-100 every ~2s; above this threshold the
// participant shows the green "speaking" ring (parity with useIsSpeaking).
export const AGORA_SPEAKING_VOLUME_THRESHOLD = 10;
// Hard cap for meeting mode capacity (Agora limit: 17 simultaneous video
// senders → 16 attendees + host). Mirrored by the API validators.
export const MEETING_MAX_ATTENDEES = 16;

// Agora virtual background (camera effects)
// Effect preference persisted per device; validated on read against the catalog
// in lib/virtualBackgrounds.js (a background removed from the repo degrades to none).
export const AGORA_VIDEO_EFFECT_STORAGE_KEY = 'kuadrat.agora.videoEffect';
// blurDegree accepted by the extension: 1 (low), 2 (medium), 3 (high).
export const AGORA_BLUR_DEGREE_SOFT = 1;
export const AGORA_BLUR_DEGREE_STRONG = 3;
// Static catalog served from client/public/fondos-virtuales/. The processor needs
// the ORIGINAL file (a raw HTMLImageElement), never the next/image optimized URL.
export const AGORA_BACKGROUNDS_BASE_PATH = '/fondos-virtuales/';

// ---------------------------------------------------------------------------
// Consola móvil del host (events.allow_mobile_host_console)
// ---------------------------------------------------------------------------
// Tres modos de vista para operar la retransmisión desde un móvil en horizontal
// montado en un trípode. Solo existen si el evento los habilita y solo para el
// host de una sala Agora en modo broadcast.
export const HOST_VIEW_MODES = {
  FULL: 'full',
  CONSOLE: 'console',
  PREVIEW: 'preview',
};

export const HOST_VIEW_MODE_LABELS = {
  [HOST_VIEW_MODES.FULL]: 'Vista completa',
  [HOST_VIEW_MODES.CONSOLE]: 'Consola',
  [HOST_VIEW_MODES.PREVIEW]: 'Solo vídeo',
};

// Preferencia por dispositivo. Se lee SIEMPRE desde un efecto, nunca desde el
// inicializador de useState: todo el árbol de app/layout.js respeta esa regla y
// romperla reintroduce discrepancias de hidratación.
export const HOST_VIEW_MODE_STORAGE_KEY = 'kuadrat.agora.hostViewMode';

// Textos es-ES de la consola. Los dos estados deshabilitados explican por qué
// un control no está disponible: un hueco vacío se lee como un fallo de carga.
export const HOST_CONSOLE_COPY = {
  live: 'EN DIRECTO',
  connected: (n) => `${n} conectado${n === 1 ? '' : 's'}`,
  mic: 'Micrófono',
  camera: 'Cámara',
  speaker: 'Altavoz',
  screen: 'Pantalla',
  endStream: 'Finalizar stream',
  micLevel: 'Nivel de micrófono',
  micLevelOff: 'Micrófono apagado',
  chooseSource: 'Elegir fuente',
  noDevices: 'No se encontraron dispositivos',
  close: 'Cerrar',
  enterFullscreen: 'Pantalla completa',
  backToFull: 'Volver a la vista completa',
  // Chrome para Android no ofrece captura de pantalla de forma fiable.
  screenUnsupported: 'No disponible en este navegador',
  // En Android la salida de audio la enruta el sistema (setSinkId es de escritorio).
  speakerUnsupported: 'La gestiona el sistema',
};

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

// Quote request form (ArtProductQuoteModal). Independent from the inquiry form
// copy/limits above. The postal code length is fixed by a 5-digit regex, so it
// has no maxLength entry here.
export const QUOTE_FIELD_LIMITS = {
  name: 120,
  email: 200,
  phone: 40,
  message: 2000,
};

export const QUOTE_COPY = {
  modalTitle: 'Solicitar cotización',
  modalSubtitle: 'Completa el formulario con el código postal donde quieras recibir la obra y nos pondremos en contacto contigo para su tramitación.',
  labelName: 'Nombre completo',
  labelEmail: 'Email de contacto',
  labelPhone: 'Teléfono de contacto (opcional)',
  labelPostalCode: 'Código postal para el envío',
  labelMessage: 'Más información',
  placeholderName: 'Tu nombre',
  placeholderEmail: 'tucorreo@ejemplo.com',
  placeholderPhone: '+34 600 000 000',
  placeholderPostalCode: '28001',
  placeholderMessage: 'Escribe aquí los detalles que quieras compartir…',
  submit: 'Enviar',
  submitting: 'Enviando…',
  cancel: 'Cancelar',
  gdpr: 'Al enviar este formulario usaremos tus datos únicamente para tramitar tu solicitud de cotización. Consulta nuestra',
  gdprLink: 'política de privacidad',
  gdprHref: '/legal/politica-de-privacidad',
  captchaLoading: 'Cargando verificación de seguridad…',
  bannerSuccess: 'Solicitud enviada. Nos pondremos en contacto contigo en breve.',
  bannerErrorCaptchaFailed: 'Verificación de seguridad fallida. Inténtalo de nuevo.',
  bannerErrorCaptchaUnavailable: 'No se puede enviar la solicitud en este momento. Inténtalo más tarde.',
  bannerErrorRateLimit: 'Has alcanzado el número máximo de solicitudes. Inténtalo de nuevo más tarde.',
  bannerErrorEmailDelivery: 'No se pudo enviar el email. Inténtalo más tarde.',
  bannerErrorProductNotFound: 'No se pudo enviar la solicitud: obra no encontrada.',
  bannerErrorGeneric: 'No se pudo enviar la solicitud. Inténtalo más tarde.',
};

// Newsletter signup (NewsletterSubscribeModal). The `key` of each topic is sent
// to the backend, which maps it to the Resend topic ID. All pre-checked by
// default; at least one must remain selected to submit.
export const NEWSLETTER_FIELD_LIMITS = {
  firstName: 120,
  lastName: 120,
  email: 200,
};

export const NEWSLETTER_TOPICS = [
  {
    key: 'newsletter',
    label: 'Newsletter',
    description: 'Newsletter mensual con las novedades de la Galería.',
  },
  {
    key: 'live_events',
    label: 'Programación de eventos en directo',
    description: 'Notificación de creación de eventos en directo, para añadir al calendario.',
  },
  {
    key: 'auctions_draws',
    label: 'Subastas y sorteos',
    description: 'Notificaciones sobre nuevos eventos de subastas y sorteos, justo cuando se abra el plazo.',
  },
  {
    key: 'new_authors',
    label: 'Nuevos autores',
    description: 'Notificación de nuevos autores o colaboradores añadidos a la Galería.',
  },
];

// localStorage key: once the first-visit newsletter banner is dismissed it
// never shows again.
export const NEWSLETTER_BANNER_DISMISSED_KEY = 'newsletter_banner_dismissed';

export const NEWSLETTER_COPY = {
  footerIconLabel: 'Suscríbete a la newsletter',
  bannerText: 'Suscríbete a la newsletter de la Galería y no te pierdas ninguna novedad: nuevos autores, programación de eventos en directo, subastas, sorteos, etc.',
  bannerCta: 'Suscríbete',
  modalTitle: 'Suscríbete a la newsletter',
  modalSubtitle: 'Suscríbete y recibe todas las novedades e informaciones de la Galería.',
  intro: 'Te informaremos sobre nuevos artistas, eventos, noticias, directos, etc. Elige qué novedades quieres recibir y te escribiremos solo cuando haya algo que merezca la pena.',
  labelFirstName: 'Nombre',
  labelLastName: 'Apellidos',
  labelEmail: 'Email',
  labelTopics: '¿Qué quieres recibir?',
  placeholderFirstName: 'Tu nombre',
  placeholderLastName: 'Tus apellidos',
  placeholderEmail: 'tucorreo@ejemplo.com',
  consentPrefix: 'He leído y acepto los',
  consentTermsLink: 'términos y condiciones',
  consentTermsHref: '/legal/terminos-y-condiciones',
  consentAnd: 'y la',
  consentPrivacyLink: 'política de privacidad',
  consentPrivacyHref: '/legal/politica-de-privacidad',
  submit: 'Suscribirse',
  submitting: 'Suscribiendo…',
  cancel: 'Cancelar',
  captchaLoading: 'Cargando verificación de seguridad…',
  bannerSuccess: '¡Listo! Te has suscrito correctamente.',
  bannerErrorCaptchaFailed: 'Verificación de seguridad fallida. Inténtalo de nuevo.',
  bannerErrorCaptchaUnavailable: 'No se puede completar la suscripción en este momento. Inténtalo más tarde.',
  bannerErrorRateLimit: 'Has realizado demasiados intentos. Inténtalo de nuevo más tarde.',
  bannerErrorDisabled: 'La suscripción no está disponible en este momento.',
  bannerErrorGeneric: 'No se pudo completar la suscripción. Inténtalo más tarde.',
};

// Limited-edition copy (Spanish). The remaining-copies count is deliberately
// never shown to buyers.
export const EDITION_COPY = {
  // Ficha pública y formulario admin: "Edición limitada de 15 ejemplares"
  limited: (editionSize) => `Edición limitada de ${editionSize} ejemplares`,
  // CoA con nº de ejemplar: "Edición Limitada. Ejemplar 3 de 15"
  coaNumbered: (editionNumber, editionSize) =>
    `Edición Limitada. Ejemplar ${editionNumber} de ${editionSize}`,
  // Admin CoA: "Ejemplar 3 de 15"
  adminNumbered: (editionNumber, editionSize) => `Ejemplar ${editionNumber} de ${editionSize}`,
};

// Artist card modal copy (Spanish).
export const AUTHOR_CARD_COPY = {
  // Etiqueta de sección sobre la biografía (se renderiza en mayúsculas)
  bioLabel: 'Biografía',
  // Mostrado cuando el artista no tiene biografía publicada
  bioEmpty: 'Este artista todavía no ha publicado su biografía.',
  close: 'Cerrar',
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

// Grid scroll restoration (galería / tienda, incluidas sus rutas por autor).
// La instantánea se guarda en sessionStorage bajo GRID_RESTORE_STORAGE_PREFIX +
// el id que marca la entrada del historial; ese id vive en window.history.state
// bajo GRID_RESTORE_HISTORY_KEY, que es lo que distingue "volver atrás" de una
// navegación nueva a la misma URL.
export const GRID_RESTORE_STORAGE_PREFIX = 'kuadrat.gridRestore.';
export const GRID_RESTORE_HISTORY_KEY = '__gridRestoreId';
// Tope de rehidratación: 10 páginas × DEFAULT_PAGE_SIZE = 120 productos en una
// sola petición. Por encima se restaura hasta el tope (ver design.md).
export const GRID_RESTORE_MAX_PAGES = 10;
// Pasado este tiempo la instantánea se descarta y el grid arranca desde arriba.
export const GRID_RESTORE_TTL_MS = 30 * 60 * 1000;
// Máximo de instantáneas conservadas en sessionStorage; en cada escritura se
// purgan las caducadas y se recorta a las más recientes.
export const GRID_RESTORE_MAX_SNAPSHOTS = 10;

// ── Carga incremental de las rejillas (grid-infinite-scroll) ──
//
// Margen de anticipación del IntersectionObserver: la carga se dispara cuando el
// centinela entra en esta franja por debajo del área visible, no cuando el
// visitante topa con el final.
//
// El observador es el mecanismo principal precisamente porque NO mide nada: con
// `root: null` su marco de referencia es el viewport del documento, el mismo
// contra el que el navegador calcula el recorrido de scroll. La implementación
// anterior comparaba `window.innerHeight` (viewport VISUAL, que encoge cuando la
// barra del navegador está a la vista) con `document.documentElement.scrollHeight`
// (medido contra el viewport de MAQUETACIÓN, que no cambia), con tolerancia cero.
// Con la barra visible esa condición es inalcanzable, y como en el fondo de la
// página ya no se emiten más eventos de scroll, no había segundo intento.
export const GRID_INFINITE_SCROLL_ROOT_MARGIN_PX = 600;

// Umbral del vigía de respaldo (scroll + resize). Mismo valor que el margen del
// observador para que ambos disparadores coincidan. Nunca comparar contra el
// fondo exacto: ese es el defecto que este cambio corrige.
export const GRID_INFINITE_SCROLL_FALLBACK_PX = 600;

// Evento de analítica que emite el botón manual. Es la única señal disponible
// sobre si la carga automática funciona en los navegadores donde la incidencia
// no es reproducible: si funciona, casi nadie pulsa el botón. Hay que darlo de
// alta como objetivo en el panel de Plausible o se descarta en silencio.
export const GRID_LOAD_MORE_EVENT = 'GridLoadMoreManual';

// Textos del pie de rejilla. Dos variantes de vocabulario porque la galería
// habla de «obras» y la tienda de «productos»; el resto es idéntico.
export const GRID_LOAD_MORE_COPY = {
  art: {
    boton: 'Cargar más obras',
    error: 'No se pudieron cargar más obras.',
  },
  other: {
    boton: 'Cargar más productos',
    error: 'No se pudieron cargar más productos.',
  },
  cargando: 'Cargando...',
  reintentar: 'Reintentar',
};

// ── Calculadora de envíos de obras (sendcloud-art-shipping-calculator) ──

// Los cuatro territorios de España, en el orden en que se muestran. Baleares va
// aparte de la península porque no comparten tarifa: sobre el mismo paquete,
// correos:standard cuesta 6,38 € a Madrid y 8,48 € a Palma, y cada destino
// tiene opciones que el otro no tiene.
export const ART_SHIPPING_ZONE_GROUPS = ['peninsula', 'baleares', 'canarias', 'ceuta_melilla'];

export const ART_SHIPPING_ZONE_LABELS = {
  peninsula: 'Península',
  baleares: 'Baleares',
  canarias: 'Canarias',
  ceuta_melilla: 'Ceuta y Melilla',
};

// Código postal con el que se cotiza cada grupo; se muestra junto al título del
// bloque para que el admin sepa contra qué destino se pidió la tarifa.
export const ART_SHIPPING_ZONE_POSTAL_CODES = {
  peninsula: '28001',
  baleares: '07001',
  canarias: '35001',
  ceuta_melilla: '51001',
};

export const ART_SHIPPING_COPY = {
  // Opción que Sendcloud devuelve sin tarifa (quotes: []): existe y es
  // anunciable, pero va con contrato propio del vendedor y no tiene precio
  // publicado. Se muestra en gris en vez de esconderla.
  noRate: 'Sin tarifa disponible (contrato propio del vendedor)',
  missingPackaging:
    'Introduce las dimensiones y el peso del embalaje para poder calcular el envío.',
  // Sendcloud tarifa el seguro hasta 5000 € y por encima recorta en silencio.
  insuranceCeiling: (price) =>
    `Esta obra vale ${price} €, pero Sendcloud solo asegura hasta 5.000 €. El exceso necesita una cobertura aparte.`,
  noOptions: 'Sendcloud no ofrece ninguna tarifa para este paquete en esta zona.',
  vatNote: 'IVA del transporte (21 %)',
};

// Techo del seguro de Sendcloud, en euros. Espeja INSURED_VALUE_MAX de
// api/services/shipping/sendcloudPricing.js.
export const ART_SHIPPING_INSURANCE_CEILING = 5000;

// El filtro no dispara petición por debajo de este número de caracteres, pero
// sí cuando el campo se vacía por completo: si no, borrar el filtro dejaría la
// lista congelada en el último resultado.
export const ART_SHIPPING_FILTER_MIN_CHARS = 3;

// Rechazos de la verificación de envío al iniciar el pago. La API los distingue
// con un código de máquina en `title` (que `lib/api.js` expone como
// `error.title`), y cada uno tiene una acción distinta: el mensaje anterior,
// único para todos, decía "Recarga la página", que no arregla nada — el carrito
// vive en localStorage y recargar no lo toca.
export const SHIPPING_VERIFICATION_ERRORS = {
  SHIPPING_ADDRESS_REQUIRED:
    'Falta la dirección de entrega para calcular el envío. Vuelve al paso anterior y compruébala.',
  SHIPPING_METHOD_UNAVAILABLE:
    'El método de envío elegido ya no está disponible para esa dirección. Elimina el producto de la cesta y vuelve a añadirlo eligiendo otro envío.',
  SHIPPING_COST_OUTDATED:
    'El precio del envío ha cambiado desde que añadiste el producto a la cesta. Elimínalo y vuelve a añadirlo para continuar.',
  SHIPPING_SELECTION_REQUIRED:
    'Selecciona un método de envío para cada vendedor antes de continuar con el pago.',
};

// Rechazos del enlace de cambio de contraseña que envía el administrador. La
// API los distingue con un código de máquina en `title` (expuesto por
// `lib/api.js` como `error.title`), igual que SHIPPING_VERIFICATION_ERRORS.
// La página nunca compara texto en castellano: cada código lleva a una acción
// distinta — pedir otro enlace al admin frente a "este enlace ya lo usaste".
export const PASSWORD_RESET_ERRORS = {
  RESET_TOKEN_INVALID:
    'Este enlace no es válido o ya se ha utilizado. Pide al administrador de la galería que te envíe uno nuevo.',
  RESET_TOKEN_EXPIRED:
    'Este enlace ha caducado. Los enlaces son válidos durante 24 horas. Pide al administrador de la galería que te envíe uno nuevo.',
  RESET_PASSWORD_WEAK:
    'La contraseña no cumple los requisitos de seguridad.',
};

// Texto genérico cuando la API responde algo que no es ninguno de los códigos
// anteriores (fallo de red, 500, etc.).
export const PASSWORD_RESET_GENERIC_ERROR =
  'No se ha podido validar el enlace. Inténtalo de nuevo en unos minutos.';

// ─── Identificador fiscal del comprador en el carrito ─────────────────────
// El algoritmo vive en `client/lib/spanishTaxId.js` (y su gemelo del backend);
// aquí solo la copia es-ES, igual que SHIPPING_VERIFICATION_ERRORS.
export const BUYER_TAX_ID_COPY = {
  label: 'DNI/NIE',
  placeholder: '12345678Z',
  invalid: 'Introduce un DNI o NIE válido',
};

// ─── Impersonation de usuarios por el admin ───────────────────────────────
// Clave de localStorage del marcador de impersonation. Solo gobierna la UI:
// el estado real vive dentro del claim `act` del JWT, firmado por el backend,
// así que editar esta clave a mano no concede ningún permiso.
export const IMPERSONATION_STORAGE_KEY = 'impersonation';

// Duración de la sesión, declarada al admin antes de entrar. Debe coincidir
// con IMPERSONATION_TTL_MINUTES en api/controllers/impersonationController.js.
export const IMPERSONATION_TTL_MINUTES = 60;

// Códigos máquina que el backend envía en `title`, mismo patrón que
// PASSWORD_RESET_ERRORS: la página nunca tiene que reconocer prosa en español.
export const IMPERSONATION_ERRORS = {
  IMPERSONATION_TARGET_FORBIDDEN:
    'No se puede impersonar a un administrador.',
  IMPERSONATION_TARGET_NOT_ACTIVATED:
    'Este artista todavía no ha configurado su contraseña, así que no tiene una sesión que reproducir. Usa "Reenviar" para enviarle la invitación.',
  IMPERSONATION_NOT_ACTIVE:
    'No hay ninguna sesión de impersonation activa.',
  IMPERSONATION_ACTOR_INVALID:
    'Tu sesión de administrador ya no es válida. Vuelve a iniciar sesión.',
  IMPERSONATION_ACTION_BLOCKED:
    'Esta acción no está disponible mientras impersonas a otro usuario.',
};

export const IMPERSONATION_GENERIC_ERROR =
  'No se ha podido completar la operación. Inténtalo de nuevo en unos minutos.';

export const IMPERSONATION_COPY = {
  // Barra de navegación
  exitLabel: 'Terminar impersonate',
  bannerPrefix: 'Actuando como',
  // Diálogo de entrada
  confirmTitle: (name) => `Impersonar a ${name}`,
  confirmMessage: (name) =>
    `Vas a entrar en la cuenta de ${name}. Verás y podrás hacer exactamente lo mismo que ${name}: sus pedidos, sus artículos y sus pantallas de vendedor. Todo lo que hagas queda registrado a tu nombre. La sesión dura ${IMPERSONATION_TTL_MINUTES} minutos y no podrás acceder al panel de administración hasta que la termines desde la barra superior.`,
  confirmText: 'Impersonar',
};

// Menú de acciones de cada artista en /admin/autores.
export const AUTHOR_ACTIONS_COPY = {
  trigger: 'Acciones',
  view: 'Ver',
  edit: 'Editar',
  password: 'Contraseña',
  resend: 'Reenviar invitación',
  impersonate: 'Impersonar',
};

// El envío individual del enlace de contraseña mata cualquier enlace que el
// artista tenga en su bandeja. La acción masiva ya lo advertía; la individual
// enviaba el correo con un solo clic y sin vuelta atrás.
export const PASSWORD_RESET_CONFIRM_COPY = {
  title: (name) => `Enviar cambio de contraseña a ${name}`,
  message: (name) =>
    `Se enviará a ${name} un email con un enlace para establecer una contraseña nueva, válido durante 24 horas. Si ya le habías enviado uno antes, dejará de funcionar en cuanto se envíe este.`,
  confirmText: 'Enviar email',
};

// Semilla de ordenación de las rejillas de catálogo. Entero sin signo de 32
// bits: es lo que consume el generador del servidor y lo que `Math.random()`
// produce con una sola multiplicación. Ver `lib/catalogOrderSeed.js`.
export const CATALOG_ORDER_SEED_MAX = 4294967295;
