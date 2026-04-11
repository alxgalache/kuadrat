# Design — stripe-connect-events-wallet

> Lectura previa obligatoria: `docs/stripe_connect/master_plan.md` §7.3 + decisión #14, y los artefactos de Change #2 (especialmente `design.md` §3 cálculo VAT y §4 flujo end-to-end). Este documento NO repite esas piezas.

## 1. Decisiones clave

| # | Decisión | Justificación |
|---|---|---|
| 1 | **Scheduler propio** (`eventCreditScheduler`) en lugar de extender `confirmationScheduler`. | El lifecycle de eventos no es por-item con `status='arrived'` sino por-evento con `finished_at`. El plazo de gracia es 1 día, no 14. Mezclarlo en el mismo job ensuciaría las queries y los logs. |
| 2 | **Plazo de gracia: 1 día** (no 14). | Los eventos no tienen devolución por mensajería. Decisión #14 master plan. Configurable vía `config.events.creditGraceDays` con default 1. |
| 3 | **Acreditación todo-o-nada por evento.** | Cuando el job procesa un evento, acredita TODOS sus attendees pagados en una transacción y marca `events.host_credited_at`. No hay "acreditar el 80%". Si hay reembolsos parciales pendientes, el admin marca `host_credit_excluded=1` antes de que se cumpla el plazo. |
| 4 | **`commission_amount` se persiste por attendee al acreditar**, no al cobrar. | El cobro de eventos ya existe y modificarlo abre demasiada superficie. El job tiene toda la información necesaria (precio, comisión config) y persiste el valor congelado. |
| 5 | **Bucket destino siempre `available_withdrawal_standard_vat`** (21%). | Los eventos no son arte → no aplican REBU (master plan §6). Decisión cerrada. |
| 6 | **`finished_at` se setea automáticamente al disconnect del host del room LiveKit**, con fallback admin manual. | Es el momento real en que el contenido de pago concluye, no el `event_datetime` programado. Los eventos pueden empezar tarde o terminar antes. |
| 7 | **No retro-acreditación automática.** | Eventos pasados (pre-deploy) quedan con `finished_at IS NULL`. El admin decide caso por caso si los acredita vía `mark-finished` manual. Evita un import masivo con datos potencialmente incompletos. |
| 8 | **Flag `host_credit_excluded` en `events`, no en `event_attendees`.** | La exclusión es por evento (todos sus attendees a la vez). Granularidad por-attendee es over-engineering para v1; el admin gestiona los reembolsos en Stripe Dashboard antes del plazo. |
| 9 | **Uso de `safeAlter`** para los cambios de schema, igual que Change #2. | Consistencia con el código real. |
| 10 | **`event_attendee` ya está en el CHECK de `withdrawal_items.item_type`** (definido en Change #2). | Aquí sólo "activamos" su uso; no requiere nueva migración. |

## 2. Modelo de datos

### 2.1 Cambios en `events`

```sql
ALTER TABLE events ADD COLUMN finished_at DATETIME;
ALTER TABLE events ADD COLUMN host_credited_at DATETIME;
ALTER TABLE events ADD COLUMN host_credit_excluded INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_events_pending_credit
  ON events(finished_at, host_credited_at)
  WHERE access_type = 'paid' AND host_credited_at IS NULL;
```

### 2.2 Cambios en `event_attendees`

```sql
ALTER TABLE event_attendees ADD COLUMN commission_amount REAL;
ALTER TABLE event_attendees ADD COLUMN host_credited_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_event_attendees_credit
  ON event_attendees(event_id, status, host_credited_at);
```

## 3. Cálculo VAT y comisión por attendee

Reutiliza el helper `computeStandardVat` del Change #2:

```js
// para cada attendee con status='paid' y host_credited_at IS NULL
const priceCents = Math.round(attendee.amount_paid * 100);
const commissionRate = config.business.dealerCommission; // ej 0.30
const commissionCents = Math.round(priceCents * commissionRate);
const { sellerEarning, taxableBase, vatRate, vatAmount } = computeStandardVat({
  priceCents,
  commissionCents,
});
// persistir attendee.commission_amount = commissionCents/100
// el sellerEarning entra al bucket
```

> Cuando el admin más adelante incluya estos attendees en un payout (vía panel Change #2), el controlador volverá a calcular los mismos valores con los mismos inputs persistidos para llenar `withdrawal_items.{taxable_base,vat_amount,vat_rate}`. Determinismo total.

## 4. Flujo end-to-end

```
Asistente compra entrada al evento (flujo existente)
   → event_attendees (status='paid', amount_paid=X, commission_amount=NULL, host_credited_at=NULL)

Día del evento → host abre el room LiveKit
   → eventService marca events.status='active'

Host abandona el room
   → eventService/livekitService UPDATE events SET finished_at=now(), status='finished'
     WHERE id=? AND finished_at IS NULL

24 h después
   → eventCreditScheduler tick (cada hora)
   → SELECT eventos elegibles
   → para cada evento, transacción:
       · cargar attendees pagados sin acreditar
       · calcular commission + sellerEarning con computeStandardVat
       · UPDATE event_attendees SET commission_amount=?, host_credited_at=now() (uno por uno)
       · UPDATE users.available_withdrawal_standard_vat += sum(sellerEarning)
       · UPDATE events SET host_credited_at=now()
   → email al host

Más tarde → admin entra a /admin/payouts/[host_user_id]
   → ve los attendees acreditados como items pendientes en el bucket standard_vat
   → ejecuta payout (flujo Change #2 sin cambios)
```

## 5. Casos borde

| Caso | Comportamiento |
|---|---|
| Host abandona y vuelve a entrar antes del scheduler | `finished_at` ya seteado; el segundo disconnect es no-op (guard `WHERE finished_at IS NULL`). El evento se acredita 24 h después del primer disconnect. Aceptable. |
| Evento sin asistentes pagados | `totalCredit = 0`. El job marca `events.host_credited_at=now()` igualmente para no reprocesar. No incrementa el bucket. No envía email. |
| Reembolso de un asistente entre `finished_at` y la acreditación | Si el reembolso cambia `event_attendees.status` a `cancelled`, ese attendee queda fuera del SELECT del job (filtra `status='paid'`). Acreditación parcial automática. |
| Reembolso después de acreditar | `host_credited_at` ya seteado → fuera del SELECT. El admin compensa manualmente (ajuste fuera de scope v1). Documentado como limitación. |
| Admin marca `host_credit_excluded=1` antes del plazo | El job lo ignora (filtra `host_credit_excluded=0`). Permanente hasta que se haga `include-credit`. |
| Falla `eventService` y nunca se setea `finished_at` | Admin usa `POST /api/admin/events/:id/mark-finished` con `finished_at` opcional. |
| El job se ejecuta a la vez para el mismo evento desde dos instancias | v1 corre en una sola instancia (igual que el resto de schedulers). No problem. Si en el futuro hay multi-instancia, añadir un lock (out of scope v1). |
| Comisión cambia tras persistir `commission_amount` | Ya persistido, congelado. Eventos futuros usan el nuevo valor. Correcto. |

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Hook de disconnect de LiveKit no se dispara (red, crash) | Endpoint manual `mark-finished` + el admin ve la lista de eventos sin `finished_at` en el panel y puede marcarlos. |
| Reembolso post-acreditación deja saldo negativo en el bucket del host | Documentado como limitación. Admin compensa con SQL directo o esperando que otros eventos cubran la diferencia. |
| Doble disparo del job para el mismo evento (no debería ocurrir, pero por seguridad) | El UPDATE final de `events.host_credited_at` lleva guard `WHERE host_credited_at IS NULL`. Si rowsAffected=0, abortar la transacción del bucket. |
| Conteo de asistentes muy grande → transacción lenta | Aceptable v1; los eventos son de orden 10²-10³ asistentes máx. Si crece, batchear. |
| Eventos en `finished_at` sin asistentes pagados llenan los logs | Loggear como `debug`, no `info`. |

## 7. Lo que NO entra

Ver Non-goals del proposal. En particular: cobro vía destination charges, reembolsos automáticos, retro-acreditación de eventos pasados, REBU para eventos, granularidad por-attendee de la exclusión.
