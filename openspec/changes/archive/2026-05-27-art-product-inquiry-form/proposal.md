## Why

Los compradores potenciales que visitan la ficha de una obra suelen tener preguntas concretas (otro método de pago, otro método de envío, información extra sobre la obra) que hoy no tienen una vía clara de comunicación con la galería. Esto se traduce en abandonos: el usuario interesado se va sin contactar porque la única alternativa es buscar manualmente un email o una página de contacto fuera del flujo de compra.

Añadir un formulario de consulta in-situ, justo debajo del autor en `/galeria/p/[id]`, baja la barrera de contacto a un clic y canaliza esas consultas al buzón comercial sin contaminar el flujo de carrito existente.

## What Changes

- Añadir un texto explicativo en `ArtProductDetail.js` debajo del nombre del autor, con un enlace "haz click aquí" que abre un modal.
- Crear un nuevo componente `ArtProductInquiryModal` con formulario: nombre completo (obligatorio), email (obligatorio), teléfono (opcional), mensaje (obligatorio).
- Integrar Cloudflare Turnstile como captcha (widget invisible/managed) para protección anti-bot, validado en backend.
- Crear endpoint público `POST /api/inquiries/art` que valida payload (Zod), verifica el token de Turnstile contra el endpoint de siteverify de Cloudflare, y envía un email a `BUSINESS_EMAIL` (o `EMAIL_FROM` como fallback).
- El email enviado incluye: datos del usuario, mensaje, referencia a la obra (nombre, ID, URL pública, autor, precio) y `Reply-To` con el email del usuario para responder directamente.
- Añadir rate limiting específico (`inquiryLimiter`, ej. 3 envíos/hora por IP) para reforzar Turnstile.
- Añadir variables de entorno: `BUSINESS_EMAIL` (opcional, fallback a `EMAIL_FROM`), `TURNSTILE_SECRET` (api, requerida si la feature está activa), `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (cliente, requerida si la feature está activa).
- Feedback al usuario tras envío usando el sistema de notificaciones existente (`BannerNotificationContext`).
- Mostrar bajo el botón "Enviar" un aviso GDPR en es-ES enlazando a la política de privacidad existente (`/legal/politica-de-privacidad`).
- Todos los textos UI en es-ES.

## Capabilities

### New Capabilities
- `art-product-inquiry`: formulario de consulta sobre una obra concreta desde la ficha pública, con protección Turnstile + rate limiting y envío de email al buzón comercial.

### Modified Capabilities
<!-- ninguna: no se tocan requisitos de specs existentes -->

## Impact

- **Frontend:**
  - `client/app/galeria/p/[id]/ArtProductDetail.js` — añadir texto + enlace bajo el autor; integrar el modal.
  - Nuevo `client/components/ArtProductInquiryModal.js` — modal Tailwind UI Block + form + Turnstile widget.
  - `client/lib/api.js` — añadir `inquiriesAPI.createArtInquiry({ productId, name, email, phone, message, turnstileToken })`.
  - `client/lib/constants.js` — copy es-ES del formulario y del banner success/error.
  - `client/next.config.js` — añadir `challenges.cloudflare.com` al CSP de scripts (Turnstile carga su widget desde ahí).
- **Backend:**
  - `api/config/env.js` — añadir `businessEmail` (opcional, default `EMAIL_FROM`), `turnstileSecret` (opcional pero validado si está presente).
  - `api/.env.example` — documentar las tres nuevas variables.
  - `api/controllers/inquiriesController.js` — nuevo controller con `createArtInquiry`.
  - `api/routes/inquiriesRoutes.js` — nueva ruta pública, sin auth, con `inquiryLimiter` + `validate(artInquirySchema)`.
  - `api/validators/inquirySchemas.js` — Zod schema (name, email, phone optional, message, productId, turnstileToken).
  - `api/middleware/rateLimiter.js` — añadir `inquiryLimiter` (3/hora/IP por defecto).
  - `api/services/emailService.js` — añadir `sendArtInquiryEmail({ inquiry, product })` con plantilla.
  - `api/services/turnstileService.js` — nuevo helper que llama a `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
  - `api/server.js` — montar `/api/inquiries` en el stack de rutas.
- **Dependencies:** ninguna nueva (Turnstile no requiere SDK; el widget es un `<script>` y la verificación es una llamada `fetch`).
- **DB:** sin cambios de esquema (la consulta no se persiste, solo se envía por email).
- **Configuración / CLAUDE.md:** documentar las nuevas env vars en el grupo correspondiente.
