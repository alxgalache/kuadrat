## 1. Configuración y variables de entorno

- [x] 1.1 Añadir `topicNewsletter: requiredIf(marketingEnabled, 'RESEND_TOPIC_NEWSLETTER')` al bloque `marketing` de `api/config/env.js`
- [x] 1.2 Documentar `RESEND_TOPIC_NEWSLETTER` (ID `26f1a32f-…`) en `api/.env.example`, retirando/ajustando la nota de "no usado en código"
- [x] 1.3 Añadir `NEXT_PUBLIC_NEWSLETTER_ENABLED` en las 4 ubicaciones de `NEXT_PUBLIC_*` (raíz `.env.example`, `client/.env.example`, `client/Dockerfile.staging` + `client/Dockerfile.prod`, `docker-compose.prod.yml` + `docker-compose.pre2.yml`)
- [x] 1.4 Exponer `NEWSLETTER_ENABLED` (parseo `!== 'false'`, fail-safe a true) en `client/lib/constants.js`

## 2. Backend — gestión de contactos en Resend

- [x] 2.1 Añadir helpers de gestión de contactos en `api/services/marketingEmailService.js` reutilizando `getClient()` y `marketingActive()`: `getContactByEmail`, `upsertSubscriber({ email, firstName, lastName, topicSelections })`
- [x] 2.2 Implementar el *upsert* idempotente: `contacts.get({ email })` → si no existe `contacts.create({ ..., unsubscribed:false, segments:[newsletterSegmentId], topics })`; si existe `contacts.update({ email, ..., unsubscribed:false })` + `contacts.topics.update({ email, topics })` + asegurar pertenencia al segmento (operación de segment-membership; confirmar nombre del método en el SDK v6), re-suscribiendo a contactos `unsubscribed`
- [x] 2.3 Mapear la selección a estado completo de topics conocidos (`opt_in`/`opt_out`) usando los IDs de `config.marketing.*` (incluido `topicNewsletter`); descartar IDs desconocidos
- [x] 2.4 Respetar el circuit breaker: si `!marketingActive()`, no llamar a Resend y devolver un resultado "no realizado" para que el controlador responda 503
- [x] 2.5 Exportar las nuevas funciones en `module.exports` y en `api/services/marketing/index.js`

## 3. Backend — endpoint público

- [x] 3.1 Crear `api/validators/newsletterSchemas.js` (Zod): `email` válido/normalizado, `firstName` obligatorio, `lastName` opcional, `topics` array de strings con mín. 1, `turnstileToken` requerido; `.strip()`
- [x] 3.2 Crear `api/controllers/newsletterController.js` (`subscribe`): verificar Turnstile (patrón de `inquiriesController.js`: `CAPTCHA_UNAVAILABLE`/`CAPTCHA_FAILED`), comprobar circuit breaker (503 `NEWSLETTER_DISABLED`), invocar `upsertSubscriber`, devolver `sendSuccess`; tratar email existente como éxito y errores de Resend como `SUBSCRIPTION_FAILED`
- [x] 3.3 Crear `api/routes/newsletterRoutes.js`: `POST /subscribe` con `inquiryLimiter` (o `newsletterLimiter` análogo) + `validate(newsletterSubscribeSchema)`
- [x] 3.4 Montar la ruta en `api/server.js` bajo `/api/newsletter`

## 4. Frontend — API y copys

- [x] 4.1 Añadir `newsletterAPI.subscribe(payload)` en `client/lib/api.js` (POST `/api/newsletter/subscribe`)
- [x] 4.2 Añadir `NEWSLETTER_COPY` (título, subtítulo, texto, labels, topics con su ID y descripción, consentimiento + enlaces T&C/privacidad, mensajes de banner) y `NEWSLETTER_FIELD_LIMITS` en `client/lib/constants.js`

## 5. Frontend — modal de suscripción

- [x] 5.1 Crear `client/components/NewsletterSubscribeModal.js` espejo de `ArtProductInquiryModal.js`: Headless UI `Dialog`, Turnstile vía `next/script` (render/reset/remove explícitos), `useBannerNotification`
- [x] 5.2 Implementar campos Nombre, Apellidos, email; checkbox group de topics (los 4 pre-marcados, mín. 1); checkbox de consentimiento con enlaces `target="_blank" rel="noopener noreferrer"`
- [x] 5.3 Implementar validación cliente (nombre, email válido, ≥1 topic, consentimiento, token) para habilitar el envío y manejo de errores por banner (sin mensaje para email existente)
- [x] 5.4 Implementar el submit: llamar a `newsletterAPI.subscribe`, mostrar éxito y cerrar; en error reiniciar Turnstile y mostrar banner acorde (429, `CAPTCHA_FAILED`, `CAPTCHA_UNAVAILABLE`, `NEWSLETTER_DISABLED`, genérico)

## 6. Frontend — punto de entrada (footer + banner)

- [x] 6.1 Crear `client/components/NewsletterBanner.js` (cliente): propietario global del modal + banner de primera visita full-width (`bg-gray-900`) en flujo normal debajo del footer (sin `position: fixed`, para no solaparse), con detección por `localStorage` (`NEWSLETTER_BANNER_DISMISSED_KEY`), enlace "Suscríbete" que abre el modal, botón de cerrar (icono "X") a la derecha que persiste el descarte, y listener del evento `open-newsletter-modal`. Gobernado por `NEWSLETTER_ENABLED`
- [x] 6.2 Montar `<NewsletterBanner />` en `client/app/layout.js` (junto a `CookieBanner`)
- [x] 6.3 Añadir el icono de newsletter (`EnvelopeIcon` solid) en la primera posición del grupo de iconos de `client/components/Footer.js` (ahora `'use client'`), que despacha `open-newsletter-modal`; gobernado por `NEWSLETTER_ENABLED`
- [x] 6.4 Añadir `bannerText`, `bannerCta`, `footerIconLabel` a `NEWSLETTER_COPY` y la constante `NEWSLETTER_BANNER_DISMISSED_KEY` en `client/lib/constants.js`
- [x] 6.5 Retirar el chip, el modal y el estado/imports asociados de `client/components/Navbar.js`

## 7. Verificación

- [x] 7.1 Validar el arranque del backend con `MARKETING_EMAILS_ENABLED=true` exigiendo `RESEND_TOPIC_NEWSLETTER`, y con marketing OFF sin exigirlo (verificado estáticamente: `requiredIf(marketingEnabled, 'RESEND_TOPIC_NEWSLETTER')`, igual que los topics hermanos; `node --check` OK en todo el backend)
- [x] 7.2 Probar en staging (segmento de pruebas): alta de email nuevo (verificar contacto + topics + segmento en Resend), email existente y email dado de baja (re-suscripción), captcha fallido, rate limit y marketing OFF (503)
- [x] 7.3 Verificar el frontend: icono del footer abre el modal, banner de primera visita (aparece, CTA abre modal, cerrar persiste y no reaparece), modal completo, enlaces legales en `_blank`, validación de ≥1 topic y consentimiento, y feedback de éxito/error
