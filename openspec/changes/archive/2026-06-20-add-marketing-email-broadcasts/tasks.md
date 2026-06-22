## 1. Configuración y entorno

- [x] 1.1 Añadir el bloque `marketing` en `api/config/env.js`: `apiKey` (`RESEND_MARKETING_API_KEY`), `newsletterSegmentId` (`RESEND_NEWSLETTER_SEGMENT_ID`), `topicNewAuthors` (`RESEND_TOPIC_NEW_AUTHORS`), `topicAuctionsDraws` (`RESEND_TOPIC_AUCTIONS_DRAWS`), `topicLiveEvents` (`RESEND_TOPIC_LIVE_EVENTS`), `enabled` (`MARKETING_EMAILS_ENABLED`, default `false`), `from` (`MARKETING_FROM`, default = `EMAIL_FROM`)
- [x] 1.2 Validación condicional: cuando `enabled === true`, exigir `apiKey` y los IDs de segmento/topic (fallo de arranque si faltan); cuando `enabled === false`, no exigirlos
- [x] 1.3 Documentar todas las variables en `api/.env.example`, incluyendo el topic *Newsletter* `26f1a32f-…` como "no usado en código", la nota de circuit breaker default-off, y que `RESEND_NEWSLETTER_SEGMENT_ID` debe apuntar al **segmento de pruebas** fuera de producción y al **segmento real** en producción
- [x] 1.4 Añadir la tabla `marketing_sends` en `api/config/database.js` (CREATE TABLE IF NOT EXISTS, idempotente, sin ALTER): `id`, `kind` ('new_author'|'auction'|'draw'|'event'), `entity_id` TEXT, `topic_id`, `segment_id`, `resend_broadcast_id`, `status` ('sent'|'failed'), `subject`, `error`, `created_at`
- [x] 1.5 Añadir índice de apoyo para el guard: índice único sobre `(kind, entity_id)` para envíos exitosos de tipos automáticos (auction/draw/event) y un índice para consultas del historial

## 2. Plantillas de email

- [x] 2.1 Crear el directorio `api/assets/resend_templates/` y mover `docs/resend-newsletter-template.html` → `api/assets/resend_templates/newsletter.html` (referencia del Template manual de Resend; conserva sus `{{{VAR}}}`)
- [x] 2.2 Crear `new-author.html` con tokens `{{TOKEN}}` server-side (imagen, nombre, ubicación, bio) y el lenguaje visual de la galería (tarjeta 600px, fuente del sistema, `#111827`/`#374151`/`#6b7280`, bordes `#e5e7eb`, botón `#111827`, modo claro forzado)
- [x] 2.3 Crear `auction-announcement.html` fiel a `AuctionGridItem` (nombre, imagen(es), fechas inicio/fin); el bloque de previews se inyecta como un único token pre-renderizado
- [x] 2.4 Crear `draw-announcement.html` fiel a `DrawGridItem` (nombre, imagen del producto, precio, fechas inicio/fin)
- [x] 2.5 Crear `event-announcement.html` (título, descripción, imagen de portada, fecha/hora, categoría)
- [x] 2.6 Documentar en cada archivo la convención de placeholders (`{{TOKEN}}` server-side vs `{{{VAR}}}` Resend) y usar siempre URLs absolutas + alt text en imágenes

## 3. Servicio de marketing (backend)

- [x] 3.1 Crear `api/services/marketingEmailService.js` (+ `api/services/marketing/index.js` re-export): inicializar un cliente Resend dedicado desde `config.marketing.apiKey` sólo cuando `enabled === true`
- [x] 3.2 Implementar `renderTemplate(name, tokens)`: cachear el archivo de `assets/resend_templates/`, sustituir `{{KEY}}` por valores escapados (`utils/htmlEscape`); soportar tokens marcados como "HTML ya renderizado" (no re-escapar)
- [x] 3.3 Implementar `sendBroadcast({ name, segmentId, topicId, subject, html })`: si `enabled === false` **o falta `apiKey`** (caso local), no enviar y devolver no-op; si activo, llamar `resend.broadcasts.create({ ..., send: true })`, normalizar a `{ broadcastId }`, lanzar si hay error
- [x] 3.4 Implementar el helper de auditoría/guard: `recordSend(...)` (insert en `marketing_sends`) y `hasBeenSent(kind, entityId)` (consulta del guard de envío único)
- [x] 3.5 Implementar `sendNewAuthorAnnouncement(author)`: render `new-author.html` + asunto "Nuevo artista en 140d: {nombre}" + `sendBroadcast` (segmento newsletter + topic *Nuevos autores*) + `recordSend`; permite reenvío (sin guard)
- [x] 3.6 Implementar `sendAuctionAnnouncement(auction)` y `sendDrawAnnouncement(draw)`: aplicar guard `hasBeenSent`, render + asunto + `sendBroadcast` (topic *Subastas y sorteos*) + `recordSend`
- [x] 3.7 Implementar `sendEventAnnouncement(event)`: aplicar guard, render + asunto + `sendBroadcast` (topic *Programación de eventos en directo*) + `recordSend`
- [x] 3.8 Asegurar que todos los helpers capturan errores, los registran (Pino + `marketing_sends` status='failed') y nunca propagan fallos al llamante

## 4. Disparadores (hooks post-commit)

- [x] 4.1 En el controlador admin de subastas: tras confirmar create/status-update, si la subasta queda en `scheduled`/`active`, invocar `sendAuctionAnnouncement` en try/catch no bloqueante
- [x] 4.2 En el controlador admin de sorteos: tras confirmar create/status-update a `scheduled`, invocar `sendDrawAnnouncement` en try/catch no bloqueante
- [x] 4.3 En el controlador admin de eventos: tras confirmar create/status-update a `scheduled`, invocar `sendEventAnnouncement` en try/catch no bloqueante
- [x] 4.4 Verificar que el guard de envío único evita reenvíos en ediciones/transiciones posteriores (incl. subasta `scheduled`→`active`)

## 5. Endpoints admin y validación

- [x] 5.1 Crear `api/validators/marketingSchemas.js` con el esquema Zod de `announce-author` (`authorId`)
- [x] 5.2 Crear el controlador de marketing (`api/controllers/`): `listAuthorsForAnnounce`, `announceAuthor`, `listMarketingSends` (helpers de respuesta `sendSuccess`/`sendPaginated`, errores con `ApiError`)
- [x] 5.3 Crear `api/routes/admin/marketingRoutes.js` y montarlo en `api/routes/admin/index.js`: `GET /marketing/authors`, `POST /marketing/announce-author` (validate + rate-limit *sensitive*), `GET /marketing/sends`
- [x] 5.4 `announceAuthor` valida que el `authorId` es un autor visible (`role='seller'`, `visible=1`) antes de enviar; responde con resultado o error

## 6. Frontend (sección Marketing)

- [x] 6.1 Añadir la entrada "Marketing" en el dropdown admin de `client/components/Navbar.js` → `/admin/marketing` (sólo admin)
- [x] 6.2 Crear `client/app/admin/marketing/page.js` (AuthGuard admin, `<ErrorBoundary>`): tarjetas/opciones "Nuevos autores" e "Historial de envíos"
- [x] 6.3 Crear `client/components/MarketingNewAuthorModal.js`: selector de autor, previsualización de datos, botón enviar, aviso si el autor ya fue anunciado, manejo de éxito/error vía NotificationContext
- [x] 6.4 Implementar la vista "Historial de envíos" (lista paginada de `marketing_sends`: tipo, entidad, estado, fecha)
- [x] 6.5 Añadir los métodos de marketing en `client/lib/api.js` (`getAnnounceAuthors`, `announceAuthor`, `getMarketingSends`); textos es-ES y UI minimalista

## 7. Verificación

- [x] 7.1 Arranque: con `MARKETING_EMAILS_ENABLED=true` y sin key/IDs, el arranque falla; con `MARKETING_EMAILS_ENABLED=false`, arranca sin esas vars
- [x] 7.2 Con kill-switch OFF: disparar create de subasta/sorteo/evento y el anuncio de autor → no se envía nada, se registra el no-op, y los flujos de negocio funcionan
- [x] 7.3 Con `MARKETING_EMAILS_ENABLED=true` y `RESEND_NEWSLETTER_SEGMENT_ID` = **segmento de pruebas**: enviar un anuncio de cada tipo y verificar recepción en los contactos de prueba + panel de Resend (broadcast creado, scoping segmento ∩ topic correcto), sin tocar suscriptores reales
- [x] 7.4 Guard de envío único: re-guardar/editar una subasta ya anunciada y confirmar que no se reenvía; comprobar el registro en `marketing_sends`
- [x] 7.5 Render de plantillas: revisar las 4 plantillas de anuncio en Gmail (imágenes absolutas, modo claro, responsive) y que el escapado evita inyección
- [x] 7.6 Sección admin: verificar acceso sólo-admin, envío manual de nuevo autor (con aviso de "ya anunciado") y paginación del historial

## 8. Prerequisito operativo (Resend / despliegue — fuera del código)

- [x] 8.1 Crear en Resend una API key **full-access** para marketing y custodiarla
- [x] 8.2 Confirmar que existen el segmento newsletter **real** y los topics; crear además un **segmento de pruebas** con contactos propios y suscribirlos a los tres topics (Nuevos autores / Subastas y sorteos / Eventos)
- [x] 8.3 Configurar por entorno: `RESEND_MARKETING_API_KEY`, los IDs de topics y `MARKETING_FROM` en todos; `RESEND_NEWSLETTER_SEGMENT_ID` = segmento de **pruebas** en staging y **real** en producción; `MARKETING_EMAILS_ENABLED=true` en staging y producción (en local sin key queda en no-op)
- [x] 8.4 Subir la plantilla de newsletter (`newsletter.html`) como Template en Resend para el envío mensual manual
