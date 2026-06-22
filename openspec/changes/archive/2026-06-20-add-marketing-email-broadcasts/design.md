## Context

La galería envía email **transaccional** vía Resend a través de `api/services/emailService.js` (wrapper `sendMail` + `EMAIL_PROVIDER`), usando una API key **send-only** (`RESEND_API_KEY`). Este cambio añade un canal distinto, **marketing**, a contactos suscritos en Resend, organizados por *topics* dentro de una *Audience*.

Estado de Resend (confirmado):
- La **Broadcasts API** (`broadcasts.create`) acepta `segment_id` (requerido), `topic_id` (opcional), `from`, `subject`, `html`/`text` y `send: true`. Un broadcast con `segment_id` + `topic_id` entrega al **segmento ∩ topic** y Resend gestiona cola, throttling y baja por topic.
- La key transaccional actual es **send-only** (`restricted_api_key`): no puede crear/leer broadcasts, segmentos ni topics. Se requiere una key **full-access** para marketing.
- IDs ya creados en Resend: segmento newsletter `3e5ea4a7-0052-400c-9073-8b239d81dff0`; topics *Nuevos autores* `b68d58ad-4a90-43fa-897c-99e415614f05`, *Subastas y sorteos* `16cbe6a4-1c57-49f9-b193-49b8d0ffe9e8`, *Programación de eventos en directo* `49c78a66-5d4a-4b46-aa41-3d907effe998`, y *Newsletter* `26f1a32f-ef3d-4159-bd84-4a9ed83daa13` (sólo para el broadcast mensual manual; no se usa en código).

Modelo de datos relevante: autores = `users` (`role='seller'`, `visible=1`; campos `full_name`, `location`, `bio`, `profile_img`). `auctions` (`name`, `description`, `start_datetime`, `end_datetime`, `status` `draft|scheduled|active|finished|cancelled`; imágenes vía `auction_arts`/`auction_others`→`product_images`). `draws` (`name`, `price`, `units`, `start/end_datetime`, `product_id`+`product_type`, `status` con `scheduled`). `events` (`title`, `description`, `event_datetime`, `cover_image_url`, `category`, `status` con `scheduled`). `emailService.js` ya tiene `getProductImageUrl()` (URLs absolutas vía CDN) reutilizable.

Restricciones del proyecto: backend Express + Turso/SQLite, env vía `config/env.js`, logging Pino, validación Zod, respuestas con helpers, **sin TypeScript**; `database.js` idempotente (sin `ALTER`); frontend Next.js, UI minimalista, textos es-ES.

## Goals / Non-Goals

**Goals:**
- Enviar anuncios de marketing al **segmento newsletter ∩ topic** mediante la Broadcasts API, con una key full-access dedicada y aislada de la transaccional.
- Anuncios **automáticos** (subasta/sorteo/evento) disparados por el cambio de estado, **una sola vez por entidad**, sin bloquear el flujo de negocio si el envío falla.
- Anuncio **manual** de nuevos autores desde una nueva sección admin "Marketing".
- Plantillas de marketing consistentes con el lenguaje visual existente, renderizadas server-side.
- Seguridad operativa: ningún envío real desde entornos no productivos por defecto.
- Auditoría de todos los envíos.

**Non-Goals:**
- Sincronización/opt-in de usuarios de la galería como contactos de Resend (se gestiona manualmente en Resend por ahora).
- Webhooks de eventos de Resend (delivered/bounced/opened/complained).
- UI de preferencias de suscripción por topic en la web pública.
- El envío de la newsletter mensual (sigue siendo 100% manual en la UI de Resend con su Template; aquí sólo se versiona el HTML de referencia).
- Cambiar el email transaccional existente.

## Decisions

### 1. Broadcasts API (no batch-send) para "segmento ∩ topic"
Se usa `resend.broadcasts.create({ segment_id, topic_id, from, subject, html, name, send: true })`.
- **Por qué:** es el primitivo nativo para enviar a un segmento respetando un topic; Resend gestiona cola, throttling, deduplicación de destinatarios y baja por topic. No hay que materializar ni mantener la lista de destinatarios.
- **Alternativa descartada:** `send-batch-emails` con `topicId` construyendo la lista desde la BD local. Funcionaría con la key send-only, pero duplica el estado de suscripción (la app dejaría de ser consistente con Resend), obliga a paginar contactos y reimplementa throttling/baja. Mayor superficie y riesgo.

### 2. API key full-access dedicada (`RESEND_MARKETING_API_KEY`)
Cliente Resend propio del servicio de marketing, separado del transaccional.
- **Por qué:** Broadcasts requiere permisos de gestión que la key send-only no tiene; mantener dos keys aplica **mínimo privilegio** (una filtración de la transaccional no expone la gestión de audiencias, y viceversa).
- **Alternativa descartada:** subir la única key a full-access y compartirla. Más simple pero amplía el blast radius de una filtración.

### 3. Render server-side por tokens `{{TOKEN}}` (no Resend Templates) para los anuncios disparados
Las plantillas viven como `.html` en `api/assets/resend_templates/` y se rellenan en el backend sustituyendo `{{TOKEN}}` por valores **escapados** (`utils/htmlEscape`). Los bloques repetidos (p. ej. previews de producto de una subasta) se pre-renderizan en código y se inyectan como un único token ya escapado. El HTML final se pasa como `html` del broadcast.
- **Por qué:** el contenido depende de datos de la BD en el momento del disparo; renderizar server-side mantiene una sola fuente de verdad (la app) y un pipeline igual al de los emails actuales. Mantiene las plantillas como archivos versionables y revisables.
- **Convención doble (documentada):** `{{TOKEN}}` = sustitución server-side (anuncios). `{{{VAR}}}` = variables de Resend (sólo `newsletter.html`, para el flujo manual). Se documenta en cada archivo para evitar confusión.
- **Alternativa descartada:** crear los anuncios como Resend Templates con `{{{vars}}}` y enviar por template id. Resend no compone bloques repetidos ni lógica condicional sobre datos arbitrarios; el caso de subastas (N previews) no encaja.
- **Motor mínimo:** un `renderTemplate(name, tokens)` que cachea el archivo y hace `String.replace` de `{{KEY}}`. Sin dependencias de plantillas; los valores se escapan antes de inyectar, salvo los tokens marcados como "HTML ya renderizado".

### 4. Dos plantillas para el topic compartido *Subastas y sorteos*
`auction-announcement.html` y `draw-announcement.html` separadas (eventos: `event-announcement.html`).
- **Por qué:** subasta y sorteo tienen formas de datos distintas (subasta: N previews de producto + precio actual/inicial, fiel a `AuctionGridItem`; sorteo: producto único + precio + unidades, fiel a `DrawGridItem`). Dos archivos limpios evitan condicionales frágiles y campos vacíos. Ambos envían al **mismo** `topic_id`.
- **Alternativa descartada:** una plantilla con condicionales por tipo. Menos archivos pero más lógica de render y riesgo de huecos.

### 5. Disparo automático con guard de envío único (`marketing_sends`)
Nueva tabla `marketing_sends` (idempotente en `database.js`). Antes de cada anuncio automático se comprueba si ya existe un registro `status='sent'` para `(kind, entity_id)`; si existe, no se reenvía. Tras enviar (o fallar) se inserta el registro. Para los tipos automáticos se añade un índice único `(kind, entity_id)` sobre envíos exitosos como red de seguridad ante carreras.
- **Por qué:** los disparos están en los *create* y *status-update* de los controladores admin; una edición posterior o un re-guardado vuelve a pasar por "estado cualificado". El guard garantiza **exactamente un** anuncio por entidad.
- **Estados que cualifican:** subasta → primer paso a `scheduled` **o** `active`; sorteo → primer paso a `scheduled`; evento → primer paso a `scheduled`. (Un envío único por entidad: si una subasta nace `scheduled` y luego pasa a `active`, no se reenvía.)
- **Nuevos autores (manual):** se registra para auditoría pero **no** se bloquea el reenvío; la UI avisa "ya enviado el …" y el admin decide. (Sin índice único para `kind='new_author'`.)
- **Alternativa descartada:** un booleano `announced` por entidad en cada tabla. Disperso, requiere columnas nuevas en tres tablas y no centraliza la auditoría.

### 6. Disparo *post-commit*, no bloqueante
El anuncio se invoca **después** de que la escritura en BD haya confirmado, en un `try/catch` que sólo loguea: un fallo de Resend nunca revierte ni rompe la creación/edición de la subasta/sorteo/evento/autor.
- **Por qué:** el email de marketing es secundario al dato de negocio; el patrón replica cómo el email transaccional tolera fallos por call site.
- **Implicación:** si Resend falla, queda registro `status='failed'` en `marketing_sends`; el reenvío manual desde la sección Marketing se considera **futuro** (no en este alcance), pero el fallo es visible en el historial.

### 7. Seguridad de audiencia: segmento por entorno + circuit breaker
Dos mecanismos **complementarios y ortogonales**:

**(a) Segmento por entorno (mecanismo principal).** `RESEND_NEWSLETTER_SEGMENT_ID` apunta a un **segmento de pruebas** en local/staging y al **segmento real** en producción — misma variable, valor distinto por entorno (12-factor). El mismo código envía a destinatarios de prueba fuera de producción, lo que permite **validar el envío real de extremo a extremo** (render, creación del broadcast, panel de Resend, recepción) sin escribir nunca a suscriptores reales. No requiere código nuevo: el `segment_id` ya sale de configuración.

**(b) Circuit breaker `MARKETING_EMAILS_ENABLED` (default OFF).** Si está desactivado, el servicio no llama a Resend (no-op + log). Además, si falta `RESEND_MARKETING_API_KEY`, el marketing se considera desactivado (no-op) — caso típico de local sin key. Es el **interruptor de emergencia** (cortar todos los envíos sin redeploy) y el fail-safe de un entorno nuevo. Uso esperado: staging `ENABLED=true` apuntando al segmento de prueba; producción `ENABLED=true` apuntando al segmento real.

- **Por qué dos mecanismos:** el segmento por entorno decide *a quién* (real vs prueba); el circuit breaker decide *si se envía o no en absoluto* (parada de emergencia / dev offline). Cubren riesgos distintos.
- **Requisito del segmento de pruebas:** sus contactos deben estar suscritos a los topics usados (Nuevos autores / Subastas y sorteos / Eventos), porque el broadcast entrega a **segmento ∩ topic**.
- **Alternativa descartada:** dos variables (real + test) más un selector por `NODE_ENV` en código. Innecesario: basta con dar distinto valor a `RESEND_NEWSLETTER_SEGMENT_ID` por entorno; menos lógica y consistente con cómo el proyecto ya gestiona valores por entorno.

### 8. IDs de Resend por variables de entorno
Bloque `marketing` en `config/env.js`: `apiKey` (`RESEND_MARKETING_API_KEY`), `newsletterSegmentId`, `topicNewAuthors`, `topicAuctionsDraws`, `topicLiveEvents`, `enabled` (`MARKETING_EMAILS_ENABLED`), `from` (`MARKETING_FROM`, default `EMAIL_FROM`). Validación condicional: las IDs y la key se exigen sólo cuando `enabled === true` (en entornos con marketing apagado no hace falta configurarlas).
- **Por qué:** los IDs difieren por entorno/cuenta y no deben hardcodearse; consistente con cómo el proyecto gestiona toda la config. El topic *Newsletter* (26f1a32f) se documenta como no usado en código.
- **`RESEND_NEWSLETTER_SEGMENT_ID` por entorno (ver Decisión 7a):** contiene el **segmento de pruebas** en local/staging y el **segmento real** en producción. El código no distingue: usa el valor que le da el entorno.

### 9. Sección admin "Marketing" mínima
Entrada "Marketing" en el dropdown admin (`Navbar.js`) → `/admin/marketing`. La página ofrece **"Nuevos autores"** (modal con selector de autor + previsualización + enviar) y **"Historial de envíos"** (lista paginada de `marketing_sends`). Endpoints admin (auth+adminAuth ya aplicados en `routes/admin/index.js`): `GET /marketing/authors`, `POST /marketing/announce-author` (Zod, rate-limit *sensitive*), `GET /marketing/sends`.
- **Por qué:** los anuncios de catálogo son automáticos (no necesitan UI); la única acción manual es nuevos autores. El historial da observabilidad de todos los envíos (incluidos los automáticos).

## Risks / Trade-offs

- **Envío accidental a suscriptores reales desde no-producción** → Mitigación: `RESEND_NEWSLETTER_SEGMENT_ID` apunta a un segmento de pruebas fuera de producción (Decisión 7a), reforzado por el circuit breaker `MARKETING_EMAILS_ENABLED` (Decisión 7b).
- **El segmento por entorno es una redirección, no una supresión** → si el segmento de pruebas contiene por error un contacto real, se le envía; y sus contactos deben estar suscritos a los topics o el envío de prueba no llega. Mitigación: curar el segmento de pruebas y suscribir sus contactos a los tres topics; el circuit breaker permite cortar en caliente.
- **Reenvío por edición o por carrera** → Mitigación: guard `marketing_sends` por `(kind, entity_id)` + índice único para tipos automáticos; chequeo dentro de transacción.
- **`segment_id`/`topic_id` o key mal configurados** → Mitigación: validación condicional al arranque cuando `enabled=true`; un error de Resend se registra como `failed` y es visible en el historial sin romper el flujo.
- **Imágenes no absolutas/rotas en clientes de correo** → Mitigación: reutilizar `getProductImageUrl()`/CDN y `getAuthorImageUrl`-equivalente server-side; URLs absolutas siempre; alt text.
- **Coste/permiso de la key full-access más amplios que send-only** → Trade-off aceptado por aislamiento; la key vive sólo en el backend y se usa exclusivamente en el servicio de marketing.
- **Doble convención de placeholders (`{{}}` vs `{{{}}}`)** → Mitigación: documentar en cada plantilla y en `.env.example`; el motor server-side sólo toca `{{TOKEN}}`.
- **Anuncio de subasta que "nace activa" vs "programada"** → el guard de envío único garantiza un solo correo aunque pase por ambos estados.

## Migration Plan

1. Crear en Resend una API key **full-access** para marketing; confirmar que el segmento newsletter y los topics existen (ya creados).
2. Añadir dep. nada nuevo (SDK `resend` ya presente). Implementar: tabla `marketing_sends`, bloque `marketing` en `env.js`/`.env.example`, `marketingEmailService.js`, plantillas en `api/assets/resend_templates/`, endpoints admin + validadores, *hooks* post-commit, y frontend (Navbar + página + modal + api.js).
3. Mover `docs/resend-newsletter-template.html` → `api/assets/resend_templates/newsletter.html` (referencia del Template manual).
4. Crear en Resend un **segmento de pruebas** con contactos propios y suscribirlos a los tres topics (Nuevos autores / Subastas y sorteos / Eventos).
5. Desplegar a **staging** con `RESEND_NEWSLETTER_SEGMENT_ID = <segmento de pruebas>` y `MARKETING_EMAILS_ENABLED=true`: disparar un anuncio de cada tipo y verificar recepción en los contactos de prueba + el broadcast en el panel de Resend, sin tocar a suscriptores reales.
6. En **producción**: configurar `RESEND_MARKETING_API_KEY` + topics + `RESEND_NEWSLETTER_SEGMENT_ID = <segmento real>` + `MARKETING_EMAILS_ENABLED=true`. **Rollback:** poner `MARKETING_EMAILS_ENABLED=false` (corta todos los envíos sin redeploy de código).

## Open Questions

- **Seguridad de audiencia (RESUELTO):** segmento por entorno como mecanismo principal (`RESEND_NEWSLETTER_SEGMENT_ID` = segmento de pruebas fuera de prod) + `MARKETING_EMAILS_ENABLED` como circuit breaker / no-op en local. Ver Decisión 7.
- **Asuntos por defecto (RESUELTO, confirmado):** "Nuevo artista en 140d: {nombre}", "Nueva subasta: {nombre}", "Nuevo sorteo: {nombre}", "Nuevo evento en directo: {título}".
- **Registro de no-op/failed (RESUELTO):** `marketing_sends` sólo registra `sent` y `failed`. Los envíos saltados por el circuit breaker / falta de key se registran únicamente en el log (no en `marketing_sends`).
- **Reenvío manual de fallidos:** queda fuera de alcance; ¿se quiere un botón de reintento en el historial en una iteración posterior?
