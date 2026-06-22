## Why

La galería ya envía marketing (anuncios automáticos + newsletter) a una audiencia de Resend segmentada por *topics*, pero **no existe forma de que un visitante se dé de alta**: la audiencia se cura a mano en Resend. Falta el canal de captación: un visitante de la web debe poder suscribirse a la newsletter y elegir a qué *topics* quiere apuntarse, alimentando directamente la audiencia de Resend que el sistema de broadcasts ya explota.

## What Changes

- **Punto de entrada en el footer** (`client/components/Footer.js`): un icono de newsletter (sobre) en la primera posición del grupo de iconos, con el mismo diseño que los iconos sociales, que abre el modal de suscripción.
- **Banner de primera visita** (`client/components/NewsletterBanner.js`): banner fijo inferior con texto de invitación + enlace que abre el modal + botón de cerrar; al cerrarlo se persiste en `localStorage` y no vuelve a aparecer.
- **Modal de suscripción a la newsletter** (nuevo `client/components/NewsletterSubscribeModal.js`): título, subtítulo y texto introductorio; inputs de **Nombre**, **Apellidos** y **email**; un *checkbox group* con los cuatro topics (Programación de eventos en directo, Subastas y sorteos, Nuevos autores, Newsletter) **todos pre-marcados** (mínimo uno obligatorio); el widget **Cloudflare Turnstile** (mismo patrón que `ArtProductInquiryModal.js`); y un **checkbox de consentimiento** de Términos y Condiciones + Política de Privacidad con enlaces que abren en `_blank`.
- **Endpoint público de suscripción** (`POST /api/newsletter/subscribe`): validación Zod, verificación Turnstile y *rate limit* de anti-abuso (mismo patrón que `inquiriesRoutes.js`). Da de alta o actualiza el contacto en Resend.
- **Gestión de contactos de la audiencia vía Resend** en la capa de marketing existente: con el cliente **full-access** ya configurado (`RESEND_MARKETING_API_KEY`), el backend hace *upsert* del contacto (crear si no existe; **re-suscribir silenciosamente** si existe como `unsubscribed`), fija las preferencias de *topics* (opt_in los seleccionados, opt_out el resto) y lo asocia al **segmento newsletter manual** (`RESEND_NEWSLETTER_SEGMENT_ID`). Gobernado por el **mismo circuit breaker** `MARKETING_EMAILS_ENABLED`.
- **Topic *Newsletter* ahora referenciado en código:** nueva variable `RESEND_TOPIC_NEWSLETTER` (el topic `26f1a32f-…`, hasta ahora sólo manual) para poder ofrecerlo como opción en el formulario.
- **Re-suscripción sin fricción:** si el email ya existe en Resend (incluso como dado de baja), el frontend **no muestra error de validación**; el backend actualiza datos y preferencias y lo re-suscribe, devolviendo éxito.
- **Visibilidad opcional del punto de entrada** (icono del footer + banner) vía `NEXT_PUBLIC_NEWSLETTER_ENABLED` (build-time, fail-safe a *enabled*), para poder ocultarlo en entornos donde el marketing está apagado.
- **Fuera de alcance:** email de bienvenida / doble opt-in (suscripción es opt-in simple; el consentimiento se cubre con el checkbox de T&C/privacidad); UI de gestión de preferencias post-alta en la web (Resend ya ofrece su página de preferencias/baja); sincronización de usuarios logueados como contactos.

## Capabilities

### New Capabilities
- `newsletter-subscription`: Flujo público de alta en la newsletter — icono en el footer + banner de primera visita, modal con datos + topics + Turnstile + consentimiento, endpoint público con validación/captcha/rate-limit, mapeo de topics a preferencias de Resend, manejo de errores y re-suscripción silenciosa de contactos existentes.

### Modified Capabilities
- `marketing-email-provider`: Se amplía la capa de integración con Resend (mismo cliente full-access, mismo circuit breaker) para **gestionar contactos de la audiencia** (upsert, preferencias de topics, alta en segmento manual, re-suscripción) además de los broadcasts; y la configuración de marketing por entorno pasa a incluir `RESEND_TOPIC_NEWSLETTER`.

## Impact

- **Backend:** nuevo `api/controllers/newsletterController.js`, `api/routes/newsletterRoutes.js`, `api/validators/newsletterSchemas.js`; nuevas funciones de gestión de contactos en `api/services/marketingEmailService.js`; nuevo `RESEND_TOPIC_NEWSLETTER` en `api/config/env.js` y `api/.env.example`; montaje de la ruta en `api/server.js`; nuevo limitador (o reutilización de `inquiryLimiter`) en `api/middleware/rateLimiter.js`.
- **Frontend:** icono de newsletter en `client/components/Footer.js`; nuevo `client/components/NewsletterBanner.js` (banner de primera visita + propietario global del modal, montado en `client/app/layout.js`); nuevo `client/components/NewsletterSubscribeModal.js`; método `subscribe` en `client/lib/api.js`; copys/constantes en `client/lib/constants.js`; nueva `NEXT_PUBLIC_NEWSLETTER_ENABLED` (las 4 ubicaciones de `NEXT_PUBLIC_*` documentadas en CLAUDE.md).
- **Dependencias:** ninguna nueva (SDK `resend` ya presente; Turnstile ya integrado).
- **Resend/Infra:** requiere que la key full-access tenga permisos de gestión de contactos y que el segmento newsletter sea **manual** (admite alta de contactos). Reutiliza `MARKETING_EMAILS_ENABLED` como interruptor.
- **Comportamiento de usuario:** los visitantes no logueados pueden auto-suscribirse y elegir topics; los contactos creados alimentan los broadcasts existentes (segmento ∩ topic).
- **Riesgo principal:** alta de contactos reales desde un entorno no productivo → mitigado porque `RESEND_NEWSLETTER_SEGMENT_ID` apunta al segmento de pruebas fuera de producción y por el circuit breaker `MARKETING_EMAILS_ENABLED`.
</content>
</invoke>
