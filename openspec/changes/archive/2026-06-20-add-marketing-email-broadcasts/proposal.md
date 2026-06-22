## Why

La galería ya envía email **transaccional** vía Resend (confirmaciones, avisos, restablecimientos). Falta el otro gran canal: **email de marketing** a los suscriptores (newsletter y anuncios). Hoy no hay forma de avisar a la audiencia cuando entra un autor nuevo, se programa una subasta/sorteo o se anuncia un evento en directo, pese a que Resend ya tiene la audiencia segmentada por *topics*. Este cambio conecta los eventos de negocio de la app con la **Broadcasts API de Resend** para enviar esos anuncios de forma automática (eventos de catálogo) o manual (autores), respetando las suscripciones y la baja por topic que gestiona Resend.

## What Changes

- **Capa de marketing email independiente de la transaccional.** Nuevo servicio que usa la **Broadcasts API de Resend** (`broadcasts.create({ segment_id, topic_id, html, subject, send: true })`) con una **API key full-access propia** (`RESEND_MARKETING_API_KEY`), separada de la key send-only transaccional. Un broadcast = envío al **segmento newsletter ∩ topic**; Resend gestiona cola, throttling y baja por topic.
- **Seguridad de audiencia por entorno:** `RESEND_NEWSLETTER_SEGMENT_ID` apunta a un **segmento de pruebas** fuera de producción y al **segmento real** en producción (misma variable, valor por entorno), de modo que staging envía de verdad pero sólo a contactos de prueba. Reforzado por un **circuit breaker** `MARKETING_EMAILS_ENABLED` (default desactivado) que corta todos los envíos sin redeploy y deja el marketing en no-op cuando no hay key (local).
- **Plantillas de marketing** en un nuevo directorio `api/assets/resend_templates/` con el mismo lenguaje visual que los emails actuales: `new-author.html`, `auction-announcement.html`, `draw-announcement.html`, `event-announcement.html`, y `newsletter.html` (movida desde `docs/`, sólo como fuente de referencia para el Template manual de Resend). Render server-side por sustitución de tokens `{{TOKEN}}` (escapados); el `{{{...}}}` de Resend sólo aplica a la newsletter manual.
- **Tabla de auditoría e idempotencia** `marketing_sends`: registra cada envío y actúa como **guard de envío único** para los anuncios automáticos (una edición o re-guardado nunca reenvía).
- **Anuncio de nuevos autores (manual):** nueva sección **"Marketing"** en el menú admin → el admin elige un autor en un modal y dispara el broadcast (segmento newsletter + topic *Nuevos autores*) con imagen, nombre, ubicación y bio del autor.
- **Anuncios automáticos de catálogo:** al crear (o transicionar a) los estados que cualifican —subasta `scheduled`/`active`, sorteo `scheduled`, evento `scheduled`— la app dispara el broadcast al topic correspondiente, una sola vez por entidad, sin bloquear el flujo si Resend falla.
- **Sección admin "Marketing"** (sólo admin): lanzador de "Nuevos autores" e **historial de envíos** (auditoría de `marketing_sends`).
- **Fuera de alcance (futuro):** sincronización/opt-in de usuarios de la galería como contactos de Resend, webhooks de eventos de Resend (entregado/rebotado/abierto) y UI de preferencias de suscripción por topic en la web.

## Capabilities

### New Capabilities
- `marketing-email-provider`: Capa de envío de marketing sobre la Broadcasts API de Resend — key full-access dedicada, configuración de entorno (segmento + topics), kill-switch, wrapper `sendBroadcast`, almacenamiento y render server-side de plantillas, y tabla `marketing_sends` (auditoría + guard de envío único).
- `new-author-announcement`: Broadcast manual disparado por el admin al topic *Nuevos autores* con la ficha del autor (imagen, nombre, ubicación, bio).
- `auction-announcement`: Broadcast automático al topic *Subastas y sorteos* cuando una subasta entra en `scheduled`/`active`, con contenido fiel al grid de subastas.
- `draw-announcement`: Broadcast automático al topic *Subastas y sorteos* cuando un sorteo entra en `scheduled`, con contenido fiel al grid de sorteos.
- `live-event-announcement`: Broadcast automático al topic *Programación de eventos en directo* cuando un evento entra en `scheduled`.
- `admin-marketing-section`: Sección admin "Marketing" (entrada de menú, página, modal de nuevos autores e historial de envíos) y los endpoints admin que la sostienen.

### Modified Capabilities
<!-- Ninguna: los emails transaccionales y los flujos de creación de subasta/sorteo/evento no cambian su comportamiento especificado; sólo se añade un disparo de anuncio posterior al commit. -->

## Impact

- **Dependencias:** ninguna nueva (se reutiliza el SDK `resend` ya instalado). Nueva env var crítica `RESEND_MARKETING_API_KEY` (full-access).
- **Backend:** nuevo `api/services/marketingEmailService.js` (+ `marketing/index.js`); nuevo directorio `api/assets/resend_templates/`; nueva tabla `marketing_sends` en `api/config/database.js`; bloque `marketing` en `api/config/env.js` y `api/.env.example`; nuevos endpoints en `api/routes/admin/` + `api/validators/marketingSchemas.js`; *hooks* post-commit en los controladores admin de subastas, sorteos y eventos.
- **Frontend:** nueva entrada "Marketing" en `client/components/Navbar.js`; nueva página `client/app/admin/marketing/page.js`; nuevo `MarketingNewAuthorModal.js`; métodos de marketing en `client/lib/api.js`.
- **Infra/Resend:** requiere una API key full-access y que el segmento newsletter y los topics existan en Resend (ya creados). Los IDs se inyectan por entorno.
- **Comportamiento de usuario:** los suscriptores empiezan a recibir anuncios; cada correo respeta la suscripción y la baja por topic gestionadas por Resend.
- **Riesgo principal:** envío accidental a suscriptores reales desde un entorno no productivo → mitigado porque fuera de producción `RESEND_NEWSLETTER_SEGMENT_ID` apunta a un segmento de pruebas, reforzado por el circuit breaker `MARKETING_EMAILS_ENABLED` y por el guard de envío único.
