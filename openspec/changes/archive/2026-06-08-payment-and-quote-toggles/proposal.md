## Why

La galería necesita poder operar en escenarios donde el pago online no está disponible (p. ej. mientras se configura Stripe Connect, o en preproducción) y/o donde las obras de arte no se venden directamente sino bajo cotización. Hoy las fichas de producto (`/galeria/p/[id]` y `/tienda/p/[id]`) muestran SIEMPRE el botón "Añadir a la cesta", sin forma de desactivarlo ni de ofrecer una vía de "Solicitar cotización" para obras de arte. Dos toggles de entorno a nivel de cliente resuelven esto sin tocar el flujo de carrito existente.

## What Changes

- Añadir dos variables de entorno build-time a nivel de cliente:
  - `NEXT_PUBLIC_PAYMENT_ENABLED` — controla la visibilidad del botón "Añadir a la cesta" en fichas de `art` y `other`.
  - `NEXT_PUBLIC_ART_BUY_AVAILABLE` — solo para `art`, determina si la compra directa está disponible o si se ofrece "Solicitar cotización".
  - Ambas se parsean con `!== 'false'` (**fail-safe**: sin definir = activado, preserva el comportamiento actual). Hay que poner `='false'` explícito para desactivar.
- **Lógica de botón en ficha de `art`** (`ArtProductDetail.js`):
  - `!PAYMENT_ENABLED && !ART_BUY_AVAILABLE` → no se muestra ningún botón.
  - `PAYMENT_ENABLED && ART_BUY_AVAILABLE` → "Añadir a la cesta" (comportamiento actual intacto).
  - en cualquier otro caso (exactamente una a `true`) → "Solicitar cotización".
- **Lógica de botón en ficha de `other`** (`OthersProductDetail.js`):
  - `PAYMENT_ENABLED` → "Añadir a la cesta"; si no, no se muestra ningún botón. `ART_BUY_AVAILABLE` no aplica a `other`.
- Crear un nuevo componente `ArtProductQuoteModal` (independiente de `ArtProductInquiryModal`, sin compartir código) que abre el botón "Solicitar cotización". Campos: nombre completo (obligatorio), email (obligatorio), teléfono (opcional), "Más información" (obligatorio, equivalente al antiguo "Mensaje"), y un campo nuevo "Código postal para el envío" (obligatorio, formato 5 dígitos ES) debajo del teléfono. Título "Solicitar cotización" y subtítulo "Completa el formulario con el código postal donde quieras recibir la obra y nos pondremos en contacto contigo para su tramitación.". Incluye el widget de Cloudflare Turnstile.
- Crear un endpoint público independiente `POST /api/inquiries/quote` (propio Zod schema, controller y plantilla de email), reutilizando `inquiryLimiter` + verificación Turnstile. Envía email "Solicitud de cotización" a `BUSINESS_EMAIL` con los datos del usuario, el código postal, la información extra y la referencia de la obra.
- Cuando la lógica muestre el botón "Solicitar cotización", NO se mostrará el mensaje existente de consulta ("Si deseas utilizar otro método de pago, cambiar el método de envío, o solicitar información específica sobre esta obra, haz click aquí.").
- Documentar las dos nuevas `NEXT_PUBLIC_*` en los CUATRO sitios obligatorios (`.env.example` raíz, `client/.env.example`, `client/Dockerfile.staging` + `client/Dockerfile.prod`, `docker-compose.prod.yml` + `docker-compose.pre2.yml`) y en `CLAUDE.md`.
- Todos los textos UI en es-ES.

## Capabilities

### New Capabilities
- `storefront-buy-quote-toggles`: visibilidad condicionada por entorno del CTA de compra en fichas de `art` y `other` (cesta / cotización / ninguno) según `NEXT_PUBLIC_PAYMENT_ENABLED` y `NEXT_PUBLIC_ART_BUY_AVAILABLE`.
- `art-quote-request`: formulario "Solicitar cotización" sobre una obra concreta (con código postal de envío), protegido con Turnstile + rate limiting, que envía email al buzón comercial vía endpoint independiente.

### Modified Capabilities
- `art-product-inquiry`: el call-to-action de consulta ("haz click aquí") SHALL ocultarse cuando la ficha muestre el botón "Solicitar cotización"; permanece visible (sin cambios) cuando se muestra "Añadir a la cesta".

## Impact

- **Frontend:**
  - `client/lib/constants.js` — añadir `PAYMENT_ENABLED` y `ART_BUY_AVAILABLE` (parse `!== 'false'`); copy es-ES del nuevo modal (`QUOTE_COPY`) y sus límites de campo.
  - `client/app/galeria/p/[id]/ArtProductDetail.js` — lógica de tres ramas para el botón; integrar `ArtProductQuoteModal`; ocultar el mensaje de consulta cuando se muestra cotización.
  - `client/app/tienda/p/[id]/OthersProductDetail.js` — gate del botón "Añadir a la cesta" por `PAYMENT_ENABLED`.
  - `client/components/ArtProductQuoteModal.js` — nuevo componente independiente (no comparte código con `ArtProductInquiryModal`).
  - `client/lib/api.js` — añadir `inquiriesAPI.createQuoteRequest({ productId, name, email, phone, postalCode, message, turnstileToken })`.
- **Backend:**
  - `api/validators/inquirySchemas.js` — nuevo `quoteRequestSchema` (incluye `postalCode` 5 dígitos).
  - `api/controllers/inquiriesController.js` — nuevo `createQuoteRequest`.
  - `api/routes/inquiriesRoutes.js` — nueva ruta `POST /quote` con `inquiryLimiter` + `validate(quoteRequestSchema)`.
  - `api/services/emailService.js` — nueva `sendQuoteRequestEmail({ inquiry, product })`.
- **Config / Infra:** `.env.example` (raíz), `client/.env.example`, `client/Dockerfile.staging`, `client/Dockerfile.prod`, `docker-compose.prod.yml`, `docker-compose.pre2.yml`, `CLAUDE.md`.
- **DB:** sin cambios de esquema (la cotización no se persiste, solo se envía por email).
- **Dependencies:** ninguna nueva.
