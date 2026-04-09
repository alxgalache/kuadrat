# Tasks — stripe-connect-events-wallet

> **Lectura previa obligatoria:** `docs/stripe_connect/master_plan.md` (todo) + `proposal.md` y `design.md` de este change. Los Changes #1 y #2 deben estar implementados y desplegados antes.

## Fase 0 — Prerrequisitos

- [ ] 0.1 Verificar que Change #2 está merged y desplegado en pre.
- [ ] 0.2 Verificar que existe en pre al menos un evento de pago histórico para usar como dato de prueba (o crear uno).
- [ ] 0.3 Confirmar que el flujo de checkout de eventos persiste correctamente `event_attendees.amount_paid` y `status='paid'`.
- [ ] 0.4 Confirmar que `config.events.creditGraceDays` puede añadirse a `api/config/env.js` (default 1).

## Fase 1 — Schema

- [ ] 1.1 En `api/config/database.js`, añadir `safeAlter('events','finished_at','DATETIME')`, `safeAlter('events','host_credited_at','DATETIME')`, `safeAlter('events','host_credit_excluded','INTEGER NOT NULL DEFAULT 0')`.
- [ ] 1.2 Añadir `safeAlter('event_attendees','commission_amount','REAL')` y `safeAlter('event_attendees','host_credited_at','DATETIME')`.
- [ ] 1.3 Crear los dos índices parciales (`idx_events_pending_credit`, `idx_event_attendees_credit`).
- [ ] 1.4 Reiniciar la API y verificar columnas/índices con `PRAGMA table_info`.

## Fase 2 — Config

- [ ] 2.1 Añadir `config.events.creditGraceDays` (default 1) en `api/config/env.js`.
- [ ] 2.2 Documentar la nueva env var en `api/.env.example`.

## Fase 3 — Marcado de `finished_at`

- [ ] 3.1 Localizar el handler de "host disconnect" en `api/services/eventService.js` o `api/services/livekitService.js`. Si no existe (LiveKit webhook no implementado para participant_disconnected con identity=host), crearlo.
- [ ] 3.2 En ese handler, si `events.access_type='paid'` y `finished_at IS NULL`, ejecutar `UPDATE events SET finished_at=CURRENT_TIMESTAMP, status='finished' WHERE id=? AND finished_at IS NULL`. Idempotente.
- [ ] 3.3 Loggear con pino la transición.
- [ ] 3.4 Buscar otros lugares donde `events.status` pase a `'finished'` (cron, endpoint admin); en cada uno, garantizar que `finished_at` también queda seteado.

## Fase 4 — Endpoints admin de eventos

- [ ] 4.1 En `api/controllers/eventAdminController.js`, añadir:
  - `markEventFinished(req,res)` → `POST /api/admin/events/:id/mark-finished`. Acepta body opcional `{ finished_at }`. Setea sólo si `finished_at IS NULL`.
  - `excludeEventCredit(req,res)` → `POST /api/admin/events/:id/exclude-credit`. Body `{ reason }`. UPDATE con flag y log de razón.
  - `includeEventCredit(req,res)` → `POST /api/admin/events/:id/include-credit`. Quita el flag.
- [ ] 4.2 Validators Zod en `api/validators/eventSchemas.js`: `markEventFinishedSchema`, `excludeEventCreditSchema`.
- [ ] 4.3 Registrar las rutas en `api/routes/admin/eventRoutes.js`.

## Fase 5 — Scheduler

- [ ] 5.1 Crear `api/scheduler/eventCreditScheduler.js` siguiendo el patrón de `confirmationScheduler.js`.
- [ ] 5.2 Implementar el SELECT del design §4 (eventos elegibles).
- [ ] 5.3 Para cada evento, transacción con: cargar attendees, calcular comisión + sellerEarning con `computeStandardVat`, actualizar attendees, incrementar bucket del host, marcar `events.host_credited_at`.
- [ ] 5.4 Guard `WHERE host_credited_at IS NULL` en el UPDATE final del evento (anti doble-crédito).
- [ ] 5.5 Loggear `eventId`, `hostUserId`, `attendeeCount`, `totalCredit`.
- [ ] 5.6 Llamar a `sendHostEventCreditedEmail` tras la transacción exitosa.
- [ ] 5.7 Registrar el scheduler en `api/server.js` con el resto.
- [ ] 5.8 Configurable `cron` (default cada hora) y `enabled` flag.

## Fase 6 — Email

- [ ] 6.1 Añadir `sendHostEventCreditedEmail({ host, event, totalCredit, attendeeCount })` en `api/services/emailService.js`. Plantilla en es-ES, branding "140d Galería de Arte".
- [ ] 6.2 (Opcional) `sendAdminEventCreditExcludedEmail` para confirmaciones de exclusión.

## Fase 7 — Integración con el panel de payouts (Change #2)

- [ ] 7.1 En `api/controllers/stripeConnectPayoutsController.js`, ampliar la query de items pendientes del seller para incluir también `event_attendees` con `host_credited_at IS NOT NULL`, `status='paid'`, y que no estén en ningún `withdrawal_items` activo.
- [ ] 7.2 Mapear cada attendee a un objeto `{ item_type:'event_attendee', item_id, seller_earning, taxable_base, vat_rate, vat_amount, vat_regime:'standard_vat' }` usando `computeStandardVat` con los valores ya persistidos.
- [ ] 7.3 En `getSellerPayoutDetail`, añadir una sección `eventsPending` con eventos del seller en gracia / pendientes / excluidos (para visibilidad antes de la acreditación).
- [ ] 7.4 Verificar que el flujo `preview` + `execute` del Change #2 funciona correctamente con `item_type='event_attendee'` (la unicidad app-side ya cubre este `item_type`).

## Fase 8 — Frontend admin

- [ ] 8.1 En `client/lib/api.js`, añadir wrappers `markEventFinished`, `excludeEventCredit`, `includeEventCredit`.
- [ ] 8.2 En `client/app/admin/payouts/[sellerId]/page.js`, añadir sección "Eventos en espera de acreditación" arriba de los buckets:
  - Lista con badge de estado.
  - Botones "Excluir" / "Reactivar" con modal.
- [ ] 8.3 Verificar que los attendees ya acreditados aparecen en el bucket `standard_vat` con su correcta etiqueta (tipo: Evento).

## Fase 9 — Frontend seller

- [ ] 9.1 En `client/app/seller/dashboard/page.js`, añadir sección "Mis eventos de pago".
- [ ] 9.2 Mostrar cada evento con estado: `Próximamente`, `En espera (24h de gracia)`, `Acreditado el ...`, `Excluido`.
- [ ] 9.3 Importe estimado / acreditado por evento.
- [ ] 9.4 Sin CTA: sólo informativo.

## Fase 10 — Testing manual

- [ ] 10.1 En pre, crear un evento de pago, simular 3 asistentes con `status='paid'`.
- [ ] 10.2 Iniciar el evento (host conecta a LiveKit), abandonar el room.
- [ ] 10.3 Verificar `events.finished_at` seteado, `status='finished'`.
- [ ] 10.4 Forzar el scheduler manualmente (o esperar 1 día). Verificar:
  - `event_attendees.commission_amount` y `host_credited_at` poblados.
  - `events.host_credited_at` poblado.
  - `users.available_withdrawal_standard_vat` incrementado correctamente.
  - Email recibido por el host.
- [ ] 10.5 Como admin, abrir `/admin/payouts/<hostId>` → ver attendees como items pendientes.
- [ ] 10.6 Ejecutar payout vía Change #2 → verificar `withdrawal_items` con `item_type='event_attendee'`.
- [ ] 10.7 Probar `exclude-credit` antes del plazo y verificar que el scheduler salta el evento.
- [ ] 10.8 Probar `mark-finished` manual sobre un evento sin `finished_at`.
- [ ] 10.9 Probar evento sin asistentes pagados: el job debe marcar `host_credited_at` igualmente y no enviar email.

## Fase 11 — Documentación

- [ ] 11.1 Actualizar `docs/stripe_connect/master_plan.md` §13 changelog con entry para Change #3.
- [ ] 11.2 Documentar las limitaciones (refund post-acreditación, no retro-acreditación) en una nota dentro del propio change o en el master plan.

## Fase 12 — Go-live

- [ ] 12.1 Smoke test en producción con un evento de prueba real (precio simbólico).
- [ ] 12.2 Verificar logs del scheduler tras 24 h.
- [ ] 12.3 Confirmar que el host recibe el email.
