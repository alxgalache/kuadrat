## Context

La galería ya tiene un canal de **marketing** sobre Resend (`api/services/marketingEmailService.js`): un cliente **full-access** (`RESEND_MARKETING_API_KEY`) que envía broadcasts al **segmento newsletter ∩ topic** mediante la Broadcasts API, gobernado por el circuit breaker `MARKETING_EMAILS_ENABLED` y con el segmento configurable por entorno (`RESEND_NEWSLETTER_SEGMENT_ID` apunta a un segmento de **pruebas** fuera de producción). La audiencia de Resend, sin embargo, **se cura a mano**: no hay alta self-service.

Este cambio añade la **captación**: un visitante NO logueado se suscribe desde la web, elige *topics*, y el backend hace *upsert* del contacto en la audiencia de Resend. Reutiliza el cliente, la config y el circuit breaker existentes.

Estado y restricciones relevantes:
- **Modelo de Resend (Topics/Segments):** la cuenta usa el modelo nuevo: contactos a nivel de cuenta (**sin `audienceId`**), *topics* como preferencias de suscripción, y *segmentos* como agrupaciones. El SDK `resend@^6.14.0` **ya es dependencia** del backend (`api/package.json`) y cubre toda la gestión de contactos; no hace falta ninguna librería adicional (en este *checkout* `node_modules` no está instalado, pero Docker/`npm install` lo resuelve). Métodos relevantes confirmados (camelCase): `contacts.create({ email, firstName, lastName, unsubscribed, segments, topics })`, `contacts.update({ id|email, firstName, lastName, unsubscribed })` (**no acepta topics**) y `contacts.topics.update({ id|email, topics: [{ id, subscription }] })`. El segmento newsletter es **manual** (admite alta de contactos) — confirmado con el usuario.
- **IDs ya creados en Resend** (de la migración de marketing): segmento newsletter `3e5ea4a7-…`; topics *Nuevos autores* `b68d58ad-…`, *Subastas y sorteos* `16cbe6a4-…`, *Programación de eventos en directo* `49c78a66-…`, y **Newsletter** `26f1a32f-…` (hasta ahora sólo manual; este cambio lo referencia en código).
- **Patrón de captcha + anti-abuso ya existente:** `ArtProductInquiryModal.js` (frontend) + `inquiriesController.js`/`inquiriesRoutes.js` (backend: `inquiryLimiter` + `validate()` + `turnstileService.verify`). Se replica tal cual.
- **Stack:** Express + Turso, env vía `config/env.js`, Pino, Zod, helpers de respuesta, **sin TypeScript**; frontend Next.js, UI minimalista (componentes Tailwind/Headless UI como en el modal de inquiry), textos es-ES.

## Goals / Non-Goals

**Goals:**
- Permitir que un visitante NO logueado se suscriba a la newsletter eligiendo a qué *topics* apuntarse.
- Hacer *upsert* idempotente del contacto en Resend: crear si no existe; actualizar y **re-suscribir** si existe (incluso dado de baja), **sin exponer al usuario que ya existía**.
- Fijar las preferencias de *topics* (opt_in los marcados / opt_out los no marcados) y asociar el contacto al segmento newsletter manual.
- Reutilizar el cliente full-access, la config y el circuit breaker de marketing; no abrir un segundo canal de credenciales.
- Anti-abuso equivalente al formulario de inquiry: Turnstile + rate limit + validación Zod.
- Seguridad de audiencia por entorno: ningún alta a la audiencia real desde entornos no productivos por defecto.

**Non-Goals:**
- Email de bienvenida o **doble opt-in** (opt-in simple; el consentimiento se cubre con el checkbox de T&C/privacidad).
- UI propia de gestión de preferencias o baja post-alta en la web (Resend ya sirve su página de preferencias/unsubscribe vía `{{{RESEND_UNSUBSCRIBE_URL}}}` en los broadcasts).
- Sincronizar usuarios logueados (sellers/admins/buyers) como contactos de Resend.
- Persistir los suscriptores en la BD local (la fuente de verdad es Resend, como en el resto del marketing).
- Cambiar el comportamiento de los broadcasts existentes.

## Decisions

### 1. Reutilizar la capa de marketing (cliente full-access + circuit breaker) para gestionar contactos
Las nuevas funciones de gestión de contactos viven en `api/services/marketingEmailService.js` (junto al envío de broadcasts), usando el **mismo** cliente Resend (`getClient()`), el mismo `marketingActive()` (enabled + key) y la misma config.
- **Por qué:** la gestión de contactos requiere precisamente la key **full-access** que ese servicio ya inicializa; duplicar cliente/config sería redundante. El gate `marketingActive()` ya cubre "sin key → no-op" (local) y el corte de emergencia.
- **Implicación (confirmada):** la suscripción se gobierna con el **mismo** `MARKETING_EMAILS_ENABLED`. Si está OFF, el endpoint responde "suscripción no disponible" (503) y el punto de entrada puede ocultarse vía `NEXT_PUBLIC_NEWSLETTER_ENABLED`.
- **Alternativa descartada:** un flag y/o key propios para suscripción. Más superficie de config sin beneficio: la acción no envía correos pero sí necesita la key de gestión.

### 2. Upsert idempotente con re-suscripción silenciosa
El backend resuelve el contacto por email con `contacts.get({ email })`:
- **No existe** → `contacts.create({ email, firstName, lastName, unsubscribed: false, segments: [newsletterSegmentId], topics: [...] })` (topics y segmento inline en la creación).
- **Existe** → `contacts.update({ email, firstName, lastName, unsubscribed: false })` (que **no** acepta topics) **+** `contacts.topics.update({ email, topics: [...] })` para las preferencias **+** asegurar pertenencia al segmento manual. Esto **re-suscribe** a un contacto dado de baja.
- El endpoint **siempre** devuelve el mismo éxito, exista o no el contacto; el frontend **nunca** muestra "ya estás suscrito".
- **Por qué:** requisito explícito del usuario — no debe haber fricción ni fuga de información sobre si el email ya estaba en la lista; y la re-suscripción debe ocurrir por detrás. Separar create (topics inline) de update (topics vía `contacts.topics.update`) refleja la API real de Resend v6.
- **Nota de implementación:** las llamadas a Resend se aíslan en helpers del servicio; los topics se normalizan siempre a `{ id, subscription: 'opt_in'|'opt_out' }`. Queda por confirmar al implementar sólo el detalle menor del nombre del campo de segmentos en la creación (`segments` según docs) y el método para añadir al segmento a un contacto **ya existente** (la API expone una operación de pertenencia a segmento equivalente al `add-contact-to-segment` del MCP).

### 3. Topics: opt_in los seleccionados, opt_out los no seleccionados (mapeo explícito)
El formulario ofrece los **cuatro** topics; el backend traduce la selección a una lista completa de preferencias: cada topic conocido se manda `opt_in` si está marcado y `opt_out` si no. Los IDs salen de config (`topicLiveEvents`, `topicAuctionsDraws`, `topicNewAuthors`, `topicNewsletter`).
- **Por qué:** enviar el estado completo (no sólo los marcados) hace la operación idempotente y correctamente **des-suscribe** de un topic que el usuario desmarcó en una re-suscripción.
- **Validación:** al menos un topic seleccionado (regla de negocio confirmada). El backend valida los IDs contra el conjunto conocido y descarta cualquier otro.

### 4. Topic *Newsletter* añadido a la config (`RESEND_TOPIC_NEWSLETTER`)
Se añade `topicNewsletter: requiredIf(marketingEnabled, 'RESEND_TOPIC_NEWSLETTER')` al bloque `marketing` de `config/env.js`, documentado en `.env.example` con el ID `26f1a32f-…`.
- **Por qué:** el topic *Newsletter* ahora se ofrece en el formulario, así que deja de ser "sólo manual" y necesita estar en config como los otros tres (mismo patrón, mismas reglas de validación condicional).

### 5. Endpoint público con el mismo blindaje que el formulario de inquiry
`POST /api/newsletter/subscribe`, montado en `server.js`, con: `newsletterLimiter` (reutiliza `inquiryLimiter` o un limitador propio análogo), `validate(newsletterSubscribeSchema)` y verificación Turnstile en el controlador **antes** de tocar Resend, idéntico a `createArtInquiry`.
- **Por qué:** endpoint público sin auth → mismo riesgo de abuso que el inquiry; reutilizar el patrón probado (códigos `CAPTCHA_UNAVAILABLE`/`CAPTCHA_FAILED`, 429 por rate limit) da consistencia y testabilidad.
- **Errores normalizados (ApiError):** `CAPTCHA_UNAVAILABLE` (503, falta secreto Turnstile), `CAPTCHA_FAILED` (400), `NEWSLETTER_DISABLED` (503, circuit breaker OFF), validación Zod (400), y error de Resend → 502/500 `SUBSCRIPTION_FAILED`. La existencia previa del email **no** es error.

### 6. Frontend: punto de entrada en footer + banner de primera visita + modal compartido
Decisión revisada (el chip en la Navbar se descartó por preferencia de diseño). El modal vive en **un único** componente global (`NewsletterBanner.js`, montado en `layout.js` junto a `CookieBanner`) y se abre desde dos sitios:
- **Icono en el footer** (`Footer.js`, ahora `'use client'`): un `EnvelopeIcon` (solid) en la primera posición del grupo de iconos, con el mismo estilo que los iconos sociales. Al pulsarlo despacha el evento de ventana `open-newsletter-modal` (mismo patrón que `open-cart-drawer` del carrito).
- **Banner de primera visita** (`NewsletterBanner.js`): banner full-width (estilo `bg-gray-900`) renderizado en flujo normal **después del footer** (se monta tras `LayoutWrapper` en `layout.js`), por lo que siempre queda **debajo** del contenido del footer y no se solapa a ningún ancho (se descartó `position: fixed` precisamente por el solape). Contiene el texto, un enlace "Suscríbete" (abre el modal) y un botón de cerrar (icono "X") a la derecha. La primera visita se detecta por ausencia de marca en `localStorage` (`NEWSLETTER_BANNER_DISMISSED_KEY`); al cerrar o al usar el CTA se persiste la marca y el banner no reaparece.
- **Modal** `NewsletterSubscribeModal.js` calcado de `ArtProductInquiryModal.js`: Headless UI `Dialog`, Turnstile vía `next/script` con render explícito, `useBannerNotification`, copys en `client/lib/constants.js` (`NEWSLETTER_COPY`, `NEWSLETTER_FIELD_LIMITS`, `NEWSLETTER_TOPICS`). Campos: Nombre, Apellidos, email; checkbox group de topics (pre-marcados, mín. 1); Turnstile; consentimiento con enlaces a T&C y Privacidad (`target="_blank" rel="noopener noreferrer"`).
- **Validación cliente:** email válido, nombre obligatorio, ≥1 topic, consentimiento marcado y token Turnstile presente habilitan el botón. La existencia previa del email **no** produce mensaje (éxito normal).
- **`subscribe`** en `client/lib/api.js` (objeto `newsletterAPI`), POST a `/api/newsletter/subscribe`.
- **Por qué un único propietario del modal:** evita montar el modal en dos sitios; el evento de ventana desacopla el footer del estado del modal, igual que ya hace el carrito.
- **Visibilidad:** ya no se restringe a usuarios no logueados (es un punto de entrada tipo "redes sociales" del footer, válido para todos); se gobierna sólo por `NEXT_PUBLIC_NEWSLETTER_ENABLED`.

### 7. `NEXT_PUBLIC_NEWSLETTER_ENABLED` para la visibilidad del punto de entrada
Var build-time `NEXT_PUBLIC_*`, parseada `!== 'false'` (fail-safe: ausente = visible), leída en `client/lib/constants.js`. Gobierna tanto el icono del footer como el banner.
- **Por qué:** `MARKETING_EMAILS_ENABLED` es backend-only y el front no puede leerlo; este flag evita mostrar un punto de entrada que daría 503 en entornos con marketing apagado. Sigue el patrón existente (`PAYMENT_ENABLED`, `ART_BUY_AVAILABLE`) y exige tocar las **4 ubicaciones** de `NEXT_PUBLIC_*` (CLAUDE.md).
- **Alternativa descartada:** mostrarlo siempre y dejar que el backend devuelva 503. Peor UX para una feature que por defecto (circuit breaker OFF) estaría inactiva.

### 8. Seguridad de audiencia por entorno (heredada del marketing)
El alta usa `RESEND_NEWSLETTER_SEGMENT_ID`, que fuera de producción apunta al **segmento de pruebas**. Así, un alta en staging crea el contacto en el segmento de pruebas, nunca en la audiencia real, y `MARKETING_EMAILS_ENABLED` permite cortar en caliente.
- **Trade-off:** el contacto se crea a nivel de cuenta (modelo Resend) y se asocia al segmento configurado; la separación real/prueba depende de que el segmento por entorno esté bien configurado, igual que en los broadcasts.

## Risks / Trade-offs

- **Alta de contactos reales desde no-producción** → Mitigación: `RESEND_NEWSLETTER_SEGMENT_ID` = segmento de pruebas fuera de prod + circuit breaker `MARKETING_EMAILS_ENABLED`.
- **Abuso/spam del endpoint público** → Mitigación: Turnstile obligatorio + rate limit (`inquiryLimiter` o análogo) + validación Zod estricta, igual que el inquiry.
- **Enumeración de emails** → Mitigación: respuesta de éxito idéntica exista o no el contacto; nunca se revela el estado previo (Decisión 2/5).
- **Detalles menores del SDK (campo `segments` en create; pertenencia a segmento de un contacto ya existente)** → Mitigación: métodos principales ya confirmados (`contacts.create`, `contacts.update`, `contacts.topics.update`); las llamadas se aíslan en helpers y los topics se normalizan a `{ id, subscription }`. Sólo se ajusta el nombre exacto del campo/método de segmento al implementar, sin impacto en el comportamiento especificado.
- **Segmento newsletter no manual / sin permiso de alta** → Mitigación: confirmado que es manual; si la key careciera de permisos, el error de Resend se captura y el endpoint responde `SUBSCRIPTION_FAILED` sin romper.
- **Marketing OFF en prod por descuido** → el punto de entrada (icono del footer + banner) se oculta (flag NEXT_PUBLIC) o el endpoint responde 503; no hay falsos positivos de "suscrito".
- **Re-suscripción que pisa preferencias** → es el comportamiento deseado: el estado completo de topics se reescribe según el formulario (Decisión 3).

## Migration Plan

1. Confirmar que la `RESEND_MARKETING_API_KEY` (full-access) tiene permisos de gestión de contactos y que el segmento newsletter es **manual**.
2. Backend: añadir `RESEND_TOPIC_NEWSLETTER` a `config/env.js` + `.env.example`; implementar las funciones de upsert/topics/segment en `marketingEmailService.js`; crear validador, controlador y ruta; montar en `server.js`; añadir/añadir alias del rate limiter.
3. Frontend: `NEXT_PUBLIC_NEWSLETTER_ENABLED` en las 4 ubicaciones; `newsletterAPI.subscribe` en `lib/api.js`; copys en `constants.js`; `NewsletterSubscribeModal.js`; `NewsletterBanner.js` (banner + modal global) montado en `layout.js`; icono en `Footer.js`.
4. Staging: con `RESEND_NEWSLETTER_SEGMENT_ID` = segmento de pruebas y `MARKETING_EMAILS_ENABLED=true`, suscribir un email nuevo y otro ya existente/dado de baja; verificar en Resend la creación, los topics y la re-suscripción, sin tocar la audiencia real.
5. Producción: `RESEND_TOPIC_NEWSLETTER` + `RESEND_NEWSLETTER_SEGMENT_ID` = segmento real + `MARKETING_EMAILS_ENABLED=true`. **Rollback:** `MARKETING_EMAILS_ENABLED=false` (corta alta y broadcasts) o `NEXT_PUBLIC_NEWSLETTER_ENABLED=false` (oculta el icono del footer y el banner) — sin redeploy de código en el primer caso.

## Open Questions

- **Modelo de segmento (RESUELTO):** segmento **manual**; el backend asocia el contacto a `RESEND_NEWSLETTER_SEGMENT_ID`.
- **Gobierno del endpoint (RESUELTO):** reutiliza `MARKETING_EMAILS_ENABLED`.
- **Estado de topics en el modal (RESUELTO):** los 4 pre-marcados, mínimo uno obligatorio.
- **Email de bienvenida (RESUELTO):** opt-in simple, sin email (fuera de alcance).
- **SDK de Resend (RESUELTO):** `resend@^6.14.0` ya es dependencia; modelo sin `audienceId`; `contacts.create` (topics + `segments` inline), `contacts.update` (sin topics) y `contacts.topics.update` para preferencias. Pendiente sólo el detalle menor del método de pertenencia a segmento para un contacto ya existente; no afecta a las specs.
</content>
