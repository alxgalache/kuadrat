# Tasks — stripe-connect-events-wallet

> **Lectura previa obligatoria:** `docs/stripe_connect/master_plan.md` (todo) + `proposal.md` y `design.md` de este change. Los Changes #1 y #2 deben estar implementados y desplegados antes.

## Fase 0 — Prerrequisitos

- [x] 0.1 Verificar que Change #2 está merged y desplegado en pre.
- [x] 0.2 Verificar que existe en pre al menos un evento de pago histórico para usar como dato de prueba (o crear uno).
- [x] 0.3 Confirmar que el flujo de checkout de eventos persiste correctamente `event_attendees.amount_paid` y `status='paid'`.
- [x] 0.4 Confirmar que `config.events.creditGraceDays` puede añadirse a `api/config/env.js` (default 1).

## Fase 1 — Schema

- [x] 1.1 En `api/config/database.js`, añadir `safeAlter('events','finished_at','DATETIME')`, `safeAlter('events','host_credited_at','DATETIME')`, `safeAlter('events','host_credit_excluded','INTEGER NOT NULL DEFAULT 0')`.
- [x] 1.2 Añadir `safeAlter('event_attendees','commission_amount','REAL')` y `safeAlter('event_attendees','host_credited_at','DATETIME')`.
- [x] 1.3 Crear los dos índices parciales (`idx_events_pending_credit`, `idx_event_attendees_credit`).
- [x] 1.4 Reiniciar la API y verificar columnas/índices con `PRAGMA table_info`.

## Fase 2 — Config

- [x] 2.1 Añadir `config.events.creditGraceDays` (default 1) en `api/config/env.js`.
- [x] 2.2 Documentar la nueva env var en `api/.env.example`.

## Fase 3 — Marcado de `finished_at`

- [x] 3.1 Localizar el handler de "host disconnect" en `api/services/eventService.js` o `api/services/livekitService.js`. Si no existe (LiveKit webhook no implementado para participant_disconnected con identity=host), crearlo.
- [x] 3.2 En ese handler, si `events.access_type='paid'` y `finished_at IS NULL`, ejecutar `UPDATE events SET finished_at=CURRENT_TIMESTAMP, status='finished' WHERE id=? AND finished_at IS NULL`. Idempotente.
- [x] 3.3 Loggear con pino la transición.
- [x] 3.4 Buscar otros lugares donde `events.status` pase a `'finished'` (cron, endpoint admin); en cada uno, garantizar que `finished_at` también queda seteado.

## Fase 4 — Endpoints admin de eventos

- [x] 4.1 En `api/controllers/eventAdminController.js`, añadir:
  - `markEventFinished(req,res)` → `POST /api/admin/events/:id/mark-finished`. Acepta body opcional `{ finished_at }`. Setea sólo si `finished_at IS NULL`.
  - `excludeEventCredit(req,res)` → `POST /api/admin/events/:id/exclude-credit`. Body `{ reason }`. UPDATE con flag y log de razón.
  - `includeEventCredit(req,res)` → `POST /api/admin/events/:id/include-credit`. Quita el flag.
- [x] 4.2 Validators Zod en `api/validators/eventSchemas.js`: `markEventFinishedSchema`, `excludeEventCreditSchema`.
- [x] 4.3 Registrar las rutas en `api/routes/admin/eventRoutes.js`.

## Fase 5 — Scheduler

- [x] 5.1 Crear `api/scheduler/eventCreditScheduler.js` siguiendo el patrón de `confirmationScheduler.js`.
- [x] 5.2 Implementar el SELECT del design §4 (eventos elegibles).
- [x] 5.3 Para cada evento, transacción con: cargar attendees, calcular comisión + sellerEarning con `computeStandardVat`, actualizar attendees, incrementar bucket del host, marcar `events.host_credited_at`.
- [x] 5.4 Guard `WHERE host_credited_at IS NULL` en el UPDATE final del evento (anti doble-crédito).
- [x] 5.5 Loggear `eventId`, `hostUserId`, `attendeeCount`, `totalCredit`.
- [x] 5.6 Llamar a `sendHostEventCreditedEmail` tras la transacción exitosa.
- [x] 5.7 Registrar el scheduler en `api/server.js` con el resto.
- [x] 5.8 Configurable `cron` (default cada hora) y `enabled` flag.

## Fase 6 — Email

- [x] 6.1 Añadir `sendHostEventCreditedEmail({ host, event, totalCredit, attendeeCount })` en `api/services/emailService.js`. Plantilla en es-ES, branding "140d Galería de Arte".
- [x] 6.2 (Opcional) `sendAdminEventCreditExcludedEmail` para confirmaciones de exclusión.

## Fase 7 — Integración con el panel de payouts (Change #2)

- [x] 7.1 En `api/controllers/stripeConnectPayoutsController.js`, ampliar la query de items pendientes del seller para incluir también `event_attendees` con `host_credited_at IS NOT NULL`, `status='paid'`, y que no estén en ningún `withdrawal_items` activo.
- [x] 7.2 Mapear cada attendee a un objeto `{ item_type:'event_attendee', item_id, seller_earning, taxable_base, vat_rate, vat_amount, vat_regime:'standard_vat' }` usando `computeStandardVat` con los valores ya persistidos.
- [x] 7.3 En `getSellerPayoutDetail`, añadir una sección `eventsPending` con eventos del seller en gracia / pendientes / excluidos (para visibilidad antes de la acreditación).
- [x] 7.4 Verificar que el flujo `preview` + `execute` del Change #2 funciona correctamente con `item_type='event_attendee'` (la unicidad app-side ya cubre este `item_type`).

## Fase 8 — Frontend admin

- [x] 8.1 En `client/lib/api.js`, añadir wrappers `markEventFinished`, `excludeEventCredit`, `includeEventCredit`.
- [x] 8.2 En `client/app/admin/payouts/[sellerId]/page.js`, añadir sección "Eventos en espera de acreditación" arriba de los buckets:
  - Lista con badge de estado.
  - Botones "Excluir" / "Reactivar" con modal.
- [x] 8.3 Verificar que los attendees ya acreditados aparecen en el bucket `standard_vat` con su correcta etiqueta (tipo: Evento).

## Fase 9 — Frontend seller

- [x] 9.1 ~En `client/app/seller/dashboard/page.js`~ — no existe en este codebase. Se añadió la sección "Mis eventos de pago" en `client/app/seller/profile/page.js`, la landing de facto del vendedor. Nuevo endpoint `GET /api/seller/paid-events` y wrapper `sellerAPI.getPaidEvents()`.
- [x] 9.2 Mostrar cada evento con estado: `Próximamente`, `En espera (24h de gracia)`, `Acreditado el ...`, `Excluido`.
- [x] 9.3 Importe estimado / acreditado por evento.
- [x] 9.4 Sin CTA: sólo informativo.

## Fase 10 — Testing manual

- [x] 10.1 En pre, crear un evento de pago, simular 3 asistentes con `status='paid'`.
- [x] 10.2 Iniciar el evento (host conecta a LiveKit), abandonar el room.
- [x] 10.3 Verificar `events.finished_at` seteado, `status='finished'`.
- [x] 10.4 Forzar el scheduler manualmente (o esperar 1 día). Verificar:
  - `event_attendees.commission_amount` y `host_credited_at` poblados.
  - `events.host_credited_at` poblado.
  - `users.available_withdrawal_standard_vat` incrementado correctamente.
  - Email recibido por el host.
- [x] 10.5 Como admin, abrir `/admin/payouts/<hostId>` → ver attendees como items pendientes.
- [x] 10.6 Ejecutar payout vía Change #2 → verificar `withdrawal_items` con `item_type='event_attendee'`.
- [x] 10.7 Probar `exclude-credit` antes del plazo y verificar que el scheduler salta el evento.
- [x] 10.8 Probar `mark-finished` manual sobre un evento sin `finished_at`.
- [x] 10.9 Probar evento sin asistentes pagados: el job debe marcar `host_credited_at` igualmente y no enviar email.

## Fase 11 — Documentación

- [x] 11.1 Actualizar `docs/stripe_connect/master_plan.md` §13 changelog con entry para Change #3.
- [x] 11.2 Documentar las limitaciones (refund post-acreditación, no retro-acreditación) en una nota dentro del propio change o en el master plan.

## Fase 12 — Go-live

- [x] 12.1 Smoke test en producción con un evento de prueba real (precio simbólico).
- [x] 12.2 Verificar logs del scheduler tras 24 h.
- [x] 12.3 Confirmar que el host recibe el email.
