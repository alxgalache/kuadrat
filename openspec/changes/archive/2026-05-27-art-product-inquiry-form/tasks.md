## 1. Configuración y entorno

- [x] 1.1 Añadir `BUSINESS_EMAIL` (opcional, fallback a `EMAIL_FROM`), `TURNSTILE_SECRET` (opcional), `INQUIRY_RATE_LIMIT_MAX` (default 3), `INQUIRY_RATE_LIMIT_WINDOW_SECONDS` (default 60) en `api/config/env.js` y exponerlos como `config.businessEmail`, `config.turnstileSecret`, `config.rateLimit.inquiry.{max,windowSeconds}`. ✱ `BUSINESS_EMAIL` ya existe como `config.business.email` (con el fallback ya implementado); se reutiliza esa propiedad.
- [x] 1.2 Documentar las nuevas variables en `api/.env.example` con comentarios claros (incluyendo `NEXT_PUBLIC_TURNSTILE_SITE_KEY` aunque sea de cliente).
- [x] 1.3 Añadir las variables al apartado "Environment Variables" de `CLAUDE.md` (grupo Email para BUSINESS_EMAIL, nuevo grupo Captcha para TURNSTILE_SECRET).

## 2. Backend — servicio de Turnstile

- [x] 2.1 Crear `api/services/turnstileService.js` con función `async verify(token, remoteip)` que haga POST a `https://challenges.cloudflare.com/turnstile/v0/siteverify` con `secret`, `response` y `remoteip`. Devolver `{ success: bool, errorCodes: [] }`.
- [x] 2.2 Manejar timeouts y errores de red lanzando un error específico distinguible de "token inválido" (para que el controller pueda mapear a 503 vs 400).
- [x] 2.3 Loguear `warn` cuando `success === false` (incluyendo `error-codes`) y `error` cuando la llamada a Cloudflare falla por red.

## 3. Backend — validación Zod

- [x] 3.1 Crear `api/validators/inquirySchemas.js` con `artInquirySchema`: `productId` (`z.coerce.number().int().positive()`), `name` (string 1..120), `email` (string email max 200), `phone` (string max 40 optional + regex laxa `^[+\\d\\s().-]+$`), `message` (string 1..2000), `turnstileToken` (string min 1 max 2000).
- [x] 3.2 Trim/normalizar los strings en el schema (`z.string().trim()`).

## 4. Backend — rate limiter

- [x] 4.1 Añadir `inquiryLimiter` en `api/middleware/rateLimiter.js` siguiendo el patrón existente (usa `config.rateLimit.inquiry`).
- [x] 4.2 Verificar que el window de 60 minutos sale del `*_WINDOW_SECONDS * 60` legacy convention documentada en CLAUDE.md.

## 5. Backend — email

- [x] 5.1 Añadir `sendArtInquiryEmail({ inquiry, product })` en `api/services/emailService.js`. Construye HTML con: bloque "Datos del usuario" (nombre, email, teléfono si lo hay), bloque "Mensaje" (texto del usuario, escapado con `utils/htmlEscape.js`), bloque "Obra" (nombre, ID, URL pública `${CLIENT_URL}/galeria/p/${id}`, autor, precio formateado en euros).
- [x] 5.2 Configurar `replyTo` con el email del usuario y `to` con `config.businessEmail || config.emailFrom`. Asunto: `[Consulta] <product.name> (#<product.id>)`.
- [x] 5.3 Loguear `info` tras envío exitoso con `{ productId, to, replyTo }` (sin loguear el mensaje completo por privacidad).

## 6. Backend — controller

- [x] 6.1 Crear `api/controllers/inquiriesController.js` con `createArtInquiry(req, res, next)`.
- [x] 6.2 Si `config.turnstileSecret` está vacío → lanzar `ApiError(503, 'CAPTCHA_UNAVAILABLE', 'Verificación de seguridad no disponible')`.
- [x] 6.3 Llamar a `turnstileService.verify(body.turnstileToken, req.ip)`. Si lanza error de red → 503 `CAPTCHA_UNAVAILABLE`. Si devuelve `success: false` → 400 `CAPTCHA_FAILED`.
- [x] 6.4 Cargar la obra (`SELECT id, name, slug, price, seller_full_name FROM art WHERE id = ?`). Si no existe → 404 `PRODUCT_NOT_FOUND`.
- [x] 6.5 Llamar a `emailService.sendArtInquiryEmail({ inquiry, product })`. Si lanza → 500 `EMAIL_DELIVERY_FAILED`.
- [x] 6.6 Responder con `sendSuccess(res, null, 'Consulta enviada')`.

## 7. Backend — ruta

- [x] 7.1 Crear `api/routes/inquiriesRoutes.js` con `POST /art` aplicando `inquiryLimiter` + `validate(artInquirySchema)` + `inquiriesController.createArtInquiry`. Pública (sin auth).
- [x] 7.2 Montar `/api/inquiries` en `api/server.js` en el orden adecuado (después de rate limit base, antes del errorHandler global).

## 8. Frontend — API client y constantes

- [x] 8.1 Añadir en `client/lib/api.js` un namespace `inquiriesAPI` con `createArtInquiry({ productId, name, email, phone, message, turnstileToken })` que llame al `POST /api/inquiries/art`.
- [x] 8.2 Añadir en `client/lib/constants.js` las cadenas es-ES del texto bajo el autor, labels y placeholders del form, aviso GDPR (texto + label del enlace + href `/legal/politica-de-privacidad`), banners de éxito/error y mensajes por código de error (`CAPTCHA_FAILED`, `CAPTCHA_UNAVAILABLE`, `RATE_LIMIT`, `EMAIL_DELIVERY_FAILED`, `PRODUCT_NOT_FOUND`).
- [x] 8.3 Añadir `INQUIRY_FIELD_LIMITS` (name 120, email 200, phone 40, message 2000) a `client/lib/constants.js`.

## 9. Frontend — componente del modal

- [x] 9.1 Crear `client/components/ArtProductInquiryModal.js` (`'use client'`) usando el patrón de modal Tailwind UI Block existente (referencia: `ShippingSelectionModal`).
- [x] 9.2 Props: `{ open, onClose, product }` (`product` debe incluir al menos `id`, `name`, `seller_full_name`, `price`).
- [x] 9.3 Estados internos: `formData` (name, email, phone, message), `turnstileToken`, `submitting`, `error`.
- [x] 9.4 Renderizar inputs con `required`, `maxLength` según `INQUIRY_FIELD_LIMITS` y `type="email"` / `type="tel"` cuando corresponda.
- [x] 9.5 Integrar widget de Turnstile: al abrirse el modal, cargar `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` vía `next/script` o `<script>` con `onload`. Renderizar el widget en un `<div>` con `data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}` en modo `managed`. Callback de `success` actualiza `turnstileToken`. Limpieza al cerrar el modal (eliminar el widget para evitar fugas).
- [x] 9.6 Botón "Enviar" deshabilitado si: faltan campos obligatorios, no hay `turnstileToken`, o `submitting === true`.
- [x] 9.6b Renderizar bajo el botón "Enviar" el aviso GDPR en es-ES con enlace a `/legal/politica-de-privacidad` abierto en nueva pestaña (`target="_blank"`, `rel="noopener noreferrer"`).
- [x] 9.7 On submit: llamar a `inquiriesAPI.createArtInquiry`. En éxito → `showBanner('Consulta enviada. Te responderemos en breve')` + `onClose()`. En error → resetear widget de Turnstile + `showBanner(<mensaje correspondiente al código>)`.
- [x] 9.8 Asegurar accesibilidad mínima: `aria-modal="true"`, focus trap básico, cierre por ESC y click fuera.

## 10. Frontend — integración en la ficha de obra

- [x] 10.1 En `client/app/galeria/p/[id]/ArtProductDetail.js`, importar el modal con `dynamic(() => import('@/components/ArtProductInquiryModal'), { ssr: false })`.
- [x] 10.2 Añadir estado `inquiryModalOpen` y handler `handleOpenInquiryModal`.
- [x] 10.3 Renderizar el texto explicativo debajo del bloque "Autor: ..." (o del bloque "Soporte:" si no hay autor) usando la constante de `lib/constants.js`. El fragmento "haz click aquí" debe ser un `<button>` estilizado como enlace (`underline text-gray-700 hover:text-gray-500`) que llame al handler.
- [x] 10.4 Si `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` no está definida, no renderizar el enlace.
- [x] 10.5 Renderizar el modal al final del JSX con `open={inquiryModalOpen}`, `onClose`, y `product={{ id, name, seller_full_name, price }}`.

## 11. Frontend — CSP y configuración Next

- [x] 11.1 En `client/next.config.js`, ajustar el `Content-Security-Policy` para incluir `https://challenges.cloudflare.com` en `script-src` y `frame-src`. Verificar que no rompe nada más.

## 12. Verificación manual

- [x] 12.1 Levantar la app en local con docker compose, abrir `/galeria/p/<id>` de una obra existente y verificar que el texto + enlace aparecen bajo el autor.
- [x] 12.2 Abrir el modal, comprobar que el widget de Turnstile carga sin errores de CSP en la consola.
- [x] 12.3 Intentar enviar el formulario sin captcha resuelto → botón debe estar deshabilitado.
- [x] 12.4 Enviar el formulario con campos válidos → verificar banner de éxito + email recibido en la bandeja apuntada por `BUSINESS_EMAIL` (o `EMAIL_FROM` si la primera no está definida), con `Reply-To` correcto, asunto correcto y bloque de obra completo.
- [x] 12.5 Probar caso `productId` inexistente forzando la petición desde la consola → 404 + banner correcto.
- [x] 12.6 Probar rate limit haciendo 4 envíos seguidos → el 4º debe devolver 429 + banner correcto.
- [x] 12.7 Verificar que con `TURNSTILE_SECRET` vacío en el backend, el endpoint responde 503 y el banner se muestra adecuadamente. ✱ Tras esta verificación se ajustó el modal para que, al recibir `CAPTCHA_UNAVAILABLE`, se cierre y resetee el formulario (el usuario no puede recuperarse desde dentro del modal).
- [x] 12.8 Verificar comportamiento sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` definida en cliente: el enlace no se renderiza.
- [x] 12.9 Verificar que el enlace del aviso GDPR abre `/legal/politica-de-privacidad` en una nueva pestaña sin perder el estado del formulario.
