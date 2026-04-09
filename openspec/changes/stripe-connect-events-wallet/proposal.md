## Why

Este es el **Change #3 de 4** del roadmap definido en `docs/stripe_connect/master_plan.md` (§7.3). Los Changes #1 y #2 dejan operativo el flujo cuenta-conectada → wallet REBU/estándar → payout vía Stripe Transfers para items de arte y de "otros productos". Sin embargo los **eventos de pago** (`events.access_type='paid'` + `event_attendees.status='paid'`) **nunca llegan al monedero del host**: hoy el cobro ocurre en Stripe pero no se acredita nada al `host_user_id` y el admin tiene que pagar al host fuera del sistema.

> **Lectura previa obligatoria:** `docs/stripe_connect/master_plan.md` (§7.3 Change #3, §4 schema, §6 modelo de tres regímenes, decisión #14 sobre el plazo de gracia de 1 día). Las decisiones ya tomadas no se rediscuten en este documento.

Este change cierra el círculo: tras un evento de pago, transcurrido **1 día de gracia** desde que el host abandona el stream, un job acredita automáticamente al host el bucket `available_withdrawal_standard_vat` (los eventos van al régimen de IVA estándar 21%, ya decidido en master plan §6) por la suma de `(amount_paid − commission_amount)` de cada `event_attendees` con `status='paid'`. A partir de ahí, el admin los puede incluir en un payout normal usando el panel `/admin/payouts/[sellerId]` ya construido en Change #2.

El plazo de gracia es **1 día** (no 14 como en bienes físicos): los eventos no tienen devolución por mensajería, sólo reembolsos manuales que el admin/host gestionan en las primeras 24 h. Decisión #14 del master plan.

## What Changes

### Backend — Schema

- **Modificar `events`** vía `safeAlter`:
  - `finished_at DATETIME` — momento real en que termina el evento (no el `event_datetime` programado).
  - `host_credited_at DATETIME` — momento en que el job acreditó al host. NULL = pendiente / no aplica.
  - `host_credit_excluded INTEGER NOT NULL DEFAULT 0` — flag para que el admin pueda marcar manualmente "no acreditar" (ej. hubo reembolsos masivos y el saldo neto es 0 o negativo).
- **Modificar `event_attendees`** vía `safeAlter`:
  - `commission_amount REAL` — comisión retenida por la plataforma sobre `amount_paid`. Se calcula y persiste en el momento del cobro (en el flujo de Stripe que ya existe), o si no existe en el cobro, lo calcula el job a partir de `config.business.dealerCommission` aplicado a `amount_paid`. **Decisión:** lo persiste el job (lectura una sola vez, valor congelado al acreditar).
  - `host_credited_at DATETIME` — marca por-attendee de cuándo entró en el monedero. Permite trazabilidad fina y evita doble acreditación.
- Índices nuevos:
  - `CREATE INDEX idx_events_pending_credit ON events(finished_at, host_credited_at) WHERE access_type='paid' AND host_credited_at IS NULL` (parcial, eficiente para el job).
  - `CREATE INDEX idx_event_attendees_credit ON event_attendees(event_id, status, host_credited_at)`.

### Backend — `finished_at` automático

- **Modificar `api/services/eventService.js` (o `livekitService.js`)** — en el handler que se dispara cuando el host abandona el room (LiveKit emite participant disconnected con identity = host), si `events.access_type='paid'` y `events.finished_at IS NULL`, hacer `UPDATE events SET finished_at = CURRENT_TIMESTAMP, status='finished' WHERE id=? AND finished_at IS NULL`.
- Si el flujo actual ya marca `status='finished'` por otra vía (ej. cron del LiveKit, endpoint admin), añadir el set de `finished_at` allí también. Idempotente.
- **Endpoint admin manual** `POST /api/admin/events/:id/mark-finished` — en caso de fallo del hook automático, el admin puede setearlo a mano. Cuerpo opcional `{ finished_at }` (default: now).

### Backend — Nuevo scheduler

- **Crear `api/scheduler/eventCreditScheduler.js`** — cron horario (reutilizar el patrón de `confirmationScheduler.js`):
  1. `SELECT * FROM events WHERE access_type='paid' AND finished_at IS NOT NULL AND host_credited_at IS NULL AND host_credit_excluded=0 AND finished_at < datetime('now','-1 day')`.
  2. Para cada evento, en transacción:
     - Cargar todos los `event_attendees` con `status='paid'` y `host_credited_at IS NULL` para ese `event_id`.
     - Para cada attendee: calcular `commission_amount` con `computeStandardVat` (helper de Change #2) sobre `amount_paid` si aún no está persistido. `seller_earning = amount_paid - commission_amount`.
     - Sumar todos los `seller_earning` → `totalCredit`.
     - Si `totalCredit > 0`:
       - `UPDATE users SET available_withdrawal_standard_vat = available_withdrawal_standard_vat + ? WHERE id = host_user_id`.
       - `UPDATE event_attendees SET commission_amount=?, host_credited_at=CURRENT_TIMESTAMP WHERE id=?` (uno a uno, dentro de la batch).
     - `UPDATE events SET host_credited_at=CURRENT_TIMESTAMP WHERE id=?`.
  3. Loggear con pino: `eventId`, `hostUserId`, `attendeeCount`, `totalCredit`.
- **Registrar el scheduler** en `api/server.js` junto al resto de schedulers.
- **No tocar `confirmationScheduler.js`** — los eventos tienen su propio scheduler porque su lifecycle (`finished_at`) y plazo de gracia (1 día) son distintos a los de items físicos.

### Backend — Admin endpoints

- **Modificar `GET /api/admin/payouts/:sellerId`** (creado en Change #2) — añadir una sección `eventsPending` que liste eventos de pago del seller con `host_credited_at IS NULL` (en gracia o ya acreditables) con: `event_id`, `title`, `finished_at`, `attendee_count`, `gross`, `commission`, `seller_earning_estimate`, `status` (`'in_grace' | 'pending_credit' | 'excluded'`).
- **Nuevo `POST /api/admin/events/:id/exclude-credit`** — marca `host_credit_excluded=1`. Cuerpo: `{ reason: string }`. Loggea con razón. Una vez excluido, el scheduler lo ignora permanentemente.
- **Nuevo `POST /api/admin/events/:id/include-credit`** — quita el flag (admin se arrepiente).
- Una vez acreditado (`host_credited_at IS NOT NULL`), los `event_attendees` aparecen como items elegibles en el bucket `standard_vat` de `/admin/payouts/[sellerId]` (Change #2 ya carga ese bucket; sólo hay que añadir `event_attendee` como `item_type` válido en la query de items pendientes).

### Backend — Modificación del controlador de payouts

- **Ampliar `stripeConnectPayoutsController.js`** (Change #2) para que la query de items pendientes del seller (en `getSellerPayoutDetail` y `previewPayout`) considere también `event_attendees` con `host_credited_at IS NOT NULL` y que no estén ya en ningún `withdrawal_items` activo. El `item_type` polimórfico ya admite `'event_attendee'` (definido en Change #2).
- La fórmula VAT para event attendees es **`computeStandardVat`** sobre `amount_paid` y `commission_amount` (los mismos campos que persiste el scheduler).

### Frontend — Admin

- **`client/app/admin/payouts/[sellerId]/page.js`** — añadir sección "Eventos en espera de acreditación" arriba de los buckets existentes:
  - Lista de eventos con badge de estado (`En periodo de gracia` / `Pendiente de procesar` / `Excluido`).
  - Por cada evento: botón "Excluir de acreditación" (con modal de confirmación + razón) o "Reactivar" si está excluido.
  - Una vez acreditado, los attendees aparecen normalmente en el bucket `standard_vat`.

### Frontend — Seller

- **`client/app/seller/dashboard/page.js`** — añadir una nueva sección "Mis eventos de pago" con:
  - Lista de eventos del host con `access_type='paid'`.
  - Por cada uno, estado de acreditación: `Próximamente` (sin `finished_at`), `En espera (24 h de gracia)`, `Acreditado el DD/MM/YYYY`, `Excluido`.
  - Importe estimado / acreditado.
- No incluir CTA de acción — el seller no puede actuar sobre esto, sólo informarse.

### Email

- **Nueva plantilla** `sendHostEventCreditedEmail({ host, event, totalCredit })` — al host cuando el scheduler acredita su evento. Incluye título del evento, número de asistentes, importe acreditado, link al dashboard del seller.
- **Plantilla admin** `sendAdminEventCreditExcludedEmail` (opcional) — confirmación de la exclusión manual.

## Capabilities

### New Capabilities

- `event-payouts`: ciclo completo de acreditación de eventos de pago al monedero del host. Incluye el marcado de `finished_at`, el scheduler horario con plazo de gracia de 1 día, los flags de exclusión manual, y la integración con el panel de payouts del Change #2 para que los `event_attendees` sean payable items de pleno derecho.

### Modified Capabilities

- `seller-wallet`: el bucket `available_withdrawal_standard_vat` pasa a recibir también créditos provenientes de eventos (no sólo `other_order_items`). Esto refuerza la decisión arquitectónica del Change #2 de tener buckets por régimen fiscal y no por tipo de producto.

## Impact

- **Layer**: Backend (schema, scheduler nuevo, modificación de eventService/livekitService, admin endpoints, ampliación del controlador de payouts) + Frontend (admin + seller) + Email.
- **Files afectados — Backend**:
  - `api/config/database.js` (safeAlter sobre `events` y `event_attendees`, nuevos índices parciales).
  - `api/services/eventService.js` y/o `api/services/livekitService.js` (set `finished_at` al disconnect del host).
  - `api/scheduler/eventCreditScheduler.js` (nuevo).
  - `api/server.js` (registro del scheduler).
  - `api/controllers/eventAdminController.js` (endpoints `mark-finished`, `exclude-credit`, `include-credit`).
  - `api/routes/admin/eventRoutes.js` (rutas nuevas).
  - `api/controllers/stripeConnectPayoutsController.js` (incluir `event_attendees` en items pendientes y en `getSellerPayoutDetail`).
  - `api/services/emailService.js` (plantillas nuevas).
- **Files afectados — Frontend**:
  - `client/app/admin/payouts/[sellerId]/page.js` (sección eventos pendientes).
  - `client/app/seller/dashboard/page.js` (sección eventos del host).
  - `client/lib/api.js` (wrappers `excludeEventCredit`, `includeEventCredit`, `markEventFinished`).
- **DB schema**: cambios via `safeAlter`. Sin DROP. Sin migración de datos: los eventos pasados quedan con `finished_at IS NULL` y nunca se acreditan retroactivamente (decisión: el admin si quiere acreditar histórico usa SQL directo o el endpoint manual `mark-finished`).
- **Dependencies**: ninguna nueva.
- **APIs externas**: ninguna nueva. Sigue usándose Stripe Transfers V1 a través del flujo de Change #2.
- **Testing manual**: crear un evento de pago en pre, simular asistentes pagados, simular host disconnect, esperar 1 día (o forzar el scheduler manualmente), verificar acreditación y luego ejecutar payout vía Change #2.

## Non-goals

- **Cobro de eventos vía Stripe Connect destination charges.** El cobro sigue siendo a la plataforma; el reparto al host es vía wallet+transfer como el resto del catálogo. No se cambia el flujo de checkout de eventos.
- **Reembolsos automáticos a asistentes.** Los reembolsos los gestiona el admin/host manualmente desde el dashboard de Stripe. La única integración es el flag `host_credit_excluded` para no acreditar eventos cuyo neto es 0 o negativo tras los reembolsos.
- **Acreditación automática para eventos pasados** (anteriores al deploy de este change). Esos eventos quedan con `finished_at IS NULL`. Para acreditarlos retroactivamente el admin usa el endpoint manual `mark-finished` evento por evento.
- **IVA REBU para eventos.** Los eventos siempre van al bucket `standard_vat` 21%. REBU es exclusivo de obras de arte físicas (master plan §6).
- **Notificación al asistente.** Esta capability sólo afecta al flujo seller↔platform. No se envía nada nuevo a los asistentes.
- **Modificación del importe `commission_amount` ya persistido.** Una vez el job lo escribe, es inmutable. Cambios fiscales futuros aplican sólo a eventos no acreditados.
