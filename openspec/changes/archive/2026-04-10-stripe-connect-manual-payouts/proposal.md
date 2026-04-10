## Why

Este es el **Change #2 de 4** del roadmap definido en `docs/stripe_connect/master_plan.md` (§7). El Change #1 (`stripe-connect-accounts`) deja a cada artista con una cuenta conectada de Stripe Connect operativa y onboardada. Este change construye encima la **ejecución real de los pagos** al artista, sustituyendo la transferencia bancaria manual desde el banco del admin por una llamada `transfers.create` a Stripe contra la cuenta conectada del artista.

> **IMPORTANTE:** antes de implementar nada de este change, leer `docs/stripe_connect/master_plan.md` completo. Las decisiones clave (modelo separate charges, plazo manual de 14 días por devoluciones, split del monedero en dos buckets REBU/estándar, branding "140d Galería de Arte", régimen fiscal por tipo de producto) están allí, no se reproducen exhaustivamente en este documento.

El flujo actual tiene tres problemas que este change resuelve:

1. **Pago manual desde banco personal/corporativo del admin.** Sustituido por `stripe.transfers.create` contra `acct_*`. El KYC/AML lo asume Stripe (gracias al Change #1).
2. **Sin trazabilidad item por item.** Cada payout queda registrado en una nueva tabla `withdrawal_items` que apunta polimórficamente a `art_order_items`, `other_order_items` o `event_attendees`, con `taxable_base` y `vat_amount` por línea. La gestoría puede reconstruir cualquier trimestre.
3. **Mezcla de regímenes fiscales.** El monedero único `users.available_withdrawal` se parte en dos buckets — `available_withdrawal_art_rebu` (arte, REBU 10%) y `available_withdrawal_standard_vat` (otros productos y eventos, IVA estándar 21%) — para que un payout siempre sea de un único régimen y la autofactura/factura sea limpia.

El plazo manual de 14 días entre venta y payout se mantiene (es el plazo de devoluciones del comprador). El admin sigue siendo quien dispara cada pago, pero ahora desde un panel dentro de la app y sin tocar su banco.

## What Changes

### Backend — Schema

- **Modificar `users`** (vía `safeAlter`, patrón ya usado en `api/config/database.js`):
  - `available_withdrawal_art_rebu REAL NOT NULL DEFAULT 0`.
  - `available_withdrawal_standard_vat REAL NOT NULL DEFAULT 0`.
  - **Mantener** `available_withdrawal` durante una ventana transitoria como columna read-only legada (para no romper queries existentes hasta que migren). Marcar como deprecated en código.
- **Modificar `withdrawals`** (vía `safeAlter`):
  - `iban` → permitir NULL (los nuevos rows de Stripe Connect no lo necesitan; los rows históricos lo mantienen).
  - `stripe_transfer_id TEXT` (NULLable; UNIQUE cuando no nulo, vía índice parcial).
  - `stripe_transfer_group TEXT` — siempre `WITHDRAWAL_<id>`, redundante con `id` pero útil para correlación cross-Stripe.
  - `vat_regime TEXT CHECK(vat_regime IN ('art_rebu','standard_vat'))` — un payout pertenece a un único régimen.
  - `taxable_base_total REAL` — suma de bases imponibles de los items incluidos.
  - `vat_amount_total REAL` — suma de IVAs.
  - `executed_at DATETIME` — momento real de la llamada `transfers.create` exitosa.
  - `executed_by_admin_id INTEGER REFERENCES users(id)`.
  - `failure_reason TEXT`.
  - `reversed_at DATETIME`, `reversal_amount REAL`, `reversal_reason TEXT`.
  - El `status` actual (`pending`/`completed`/`failed`) se amplía a `pending|processing|completed|failed|reversed` a nivel de aplicación. SQLite no permite ALTER del CHECK; lo enforcamos en el código y documentamos.
- **Nueva tabla `withdrawal_items`** (pivot polimórfica):
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`.
  - `withdrawal_id INTEGER NOT NULL REFERENCES withdrawals(id)`.
  - `item_type TEXT NOT NULL CHECK(item_type IN ('art_order_item','other_order_item','event_attendee'))`.
  - `item_id INTEGER NOT NULL`.
  - `seller_earning REAL NOT NULL` — neto que recibió el artista por ese item (precio − comisión).
  - `taxable_base REAL NOT NULL` — base imponible (depende del régimen).
  - `vat_rate REAL NOT NULL` — `0.10` o `0.21`.
  - `vat_amount REAL NOT NULL`.
  - `vat_regime TEXT NOT NULL CHECK(vat_regime IN ('art_rebu','standard_vat'))`.
  - `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`.
  - Índices: `(withdrawal_id)`, `(item_type, item_id)`.
  - **Unicidad item por item:** un mismo `(item_type,item_id)` no puede aparecer en dos withdrawals salvo que el primero esté en estado `failed` o `cancelled`. SQLite no permite expresar este filtro contra otra tabla en un partial index, así que se enforza a nivel de aplicación dentro de la transacción de creación del withdrawal.

### Backend — Servicios

- **Ampliar `api/services/stripeConnectService.js`** (creado en Change #1) con:
  - `createTransfer({ withdrawal, connectedAccountId, idempotencyKey })` → `stripe.transfers.create({ amount, currency: 'eur', destination, transfer_group, metadata })` con `source_transaction: undefined` (financiado desde balance de plataforma) y `idempotencyKey: 'transfer_withdrawal_' + withdrawal.id + '_v1'`.
  - `retrieveTransfer(transferId)` y `listTransferReversals(transferId)` (utilitarios para el panel admin).
- **Nuevo helper `api/utils/vatCalculator.js`**:
  - `computeRebuVat({ priceCents, commissionCents })` → para arte: la base imponible REBU es el margen del marketplace (= comisión), tipo 10%. Devuelve `{ taxableBase, vatRate: 0.10, vatAmount, sellerEarning }`.
  - `computeStandardVat({ priceCents, commissionCents })` → para otros productos / eventos: base = `(precio − comisión) / 1.21`, tipo 21%. Devuelve `{ taxableBase, vatRate: 0.21, vatAmount, sellerEarning }`.
  - Reutilizado por el scheduler (al acreditar) y por el controlador de payouts (al fijar los importes en `withdrawal_items`).

### Backend — Modificación del scheduler de confirmación

- **`api/scheduler/confirmationScheduler.js`** — al acreditar un item ya no incrementa `available_withdrawal`. En su lugar:
  - Si el item es de `art_order_items` → incrementa `available_withdrawal_art_rebu`.
  - Si el item es de `other_order_items` → incrementa `available_withdrawal_standard_vat`.
  - El cálculo de `sellerEarning` no cambia; sólo cambia la columna destino.
- **`PATCH /api/orders/:orderId/items/:itemId/status`** (en `api/controllers/ordersController.js`) — segundo lugar donde se acredita el monedero. Mismo cambio: split por bucket.
- **Eventos** (acreditación de `event_attendees`) — actualmente fuera de scope hasta el Change #3, pero el bucket destino ya queda definido (`standard_vat`).

### Backend — Endpoints admin de payouts

- **`api/controllers/stripeConnectPayoutsController.js`** (nuevo):
  - `GET /api/admin/payouts` — lista de sellers con saldo > 0 en cualquiera de los dos buckets, con totales por bucket. Soporta filtros básicos (?sellerId, ?regime).
  - `GET /api/admin/payouts/:sellerId` — detalle del seller: ambos balances, lista de items pendientes de pagar (los que están acreditados pero no aparecen en ningún `withdrawal_items` activo), agrupados por régimen, con totales y desglose VAT.
  - `POST /api/admin/payouts/:sellerId/preview` — recibe `{ vat_regime, item_ids? }` y devuelve el resumen del payout que se ejecutaría: total, base imponible, IVA, número de items, idempotency key prevista. NO toca BD ni Stripe.
  - `POST /api/admin/payouts/:sellerId/execute` — ejecuta el payout. Cuerpo: `{ vat_regime, item_ids?, confirmation_token }`. Flujo:
    1. Validar que el seller tiene `stripe_connect_status = 'active'` y `stripe_transfers_capability_active = 1`.
    2. Validar `confirmation_token` (echo de un token devuelto por `preview`, vida 5 min, anti doble-click).
    3. Abrir transacción local: crear row en `withdrawals` con `status='processing'`, insertar `withdrawal_items`, decrementar el bucket correspondiente del seller. Comprobar app-side que ningún item ya esté en otro withdrawal activo.
    4. Llamar a `stripeConnectService.createTransfer(...)` con `idempotencyKey` derivada del `withdrawals.id`.
    5. Persistir `stripe_transfer_id`, `executed_at`, `status='completed'`. Si la llamada falla → `status='failed'`, `failure_reason`, **revertir** el decremento del bucket y borrar las filas de `withdrawal_items`.
    6. Enviar email al seller "Se ha enviado un pago de X€".
  - `POST /api/admin/payouts/withdrawals/:id/mark-reversed` — registro manual a posteriori de un reversal hecho desde el dashboard de Stripe (out of scope automatizar el reversal vía API en v1; el admin lo dispara en Stripe Dashboard y refleja aquí).

### Backend — Endpoint seller (cambio de semántica)

- **`POST /api/seller/withdrawals`** (en `api/routes/sellerRoutes.js:387`) — **deja de crear un row en `withdrawals` y deja de tocar el saldo**. Se convierte en un *nudge*: sólo envía un email al admin "el artista X solicita un pago" con enlace a `/admin/payouts/<sellerId>`. Devuelve `200 { ok: true }` sin payload de withdrawal.
- **`GET /api/seller/withdrawals`** (si existe) — sigue devolviendo el histórico, pero ahora con los dos buckets y los nuevos campos visibles.
- **Tasas de la endpoint del request body** — `iban` y `recipientName` ya no se usan en el nuevo flujo. Se ignoran si llegan, no rompen el contrato. Eventualmente se eliminan en una limpieza posterior.

### Backend — Webhook (transfer.* handlers)

- **`api/controllers/stripeConnectWebhookController.js`** (creado en Change #1) — añadir handlers V1 para:
  - `transfer.created` — confirma `executed_at` y `stripe_transfer_id` (no-op si ya está; idempotente vía `stripe_connect_events`).
  - `transfer.reversed` — marca `withdrawals.status = 'reversed'`, `reversed_at`, `reversal_amount`, **revierte** el decremento del bucket sumando `reversal_amount` al bucket original. NO borra los `withdrawal_items` (mantiene la trazabilidad histórica).
  - `transfer.failed` — marca `status='failed'`, escribe `failure_reason`, revierte el decremento del bucket. Email al admin.
- **NOTA:** los eventos `transfer.*` son V1 "Mi cuenta" (plataforma), no de "Cuentas conectadas". Stripe no permite suscribirlos en un destino de tipo Connected accounts / V2. Los handlers se definen en `stripeConnectWebhookController.js` pero se invocan desde `stripePaymentsController.js` (webhook de pagos, `/api/payments/stripe/webhook`).

### Backend — Validators

- **`api/validators/stripeConnectPayoutsSchemas.js`** (nuevo) — Zod schemas para `executePayoutSchema`, `previewPayoutSchema`, `markReversedSchema`.

### Backend — Migración de datos

- **Script idempotente `api/migrations/2026-04-stripe-connect-wallet-split.js`** (o equivalente in-process al primer arranque tras el deploy):
  - Para cada usuario con `available_withdrawal > 0`: vuelca todo el saldo a `available_withdrawal_standard_vat` (opción conservadora — ese bucket usa IVA 21% que es el más alto, no perjudica al artista en una primera autofactura). Marca un flag `available_withdrawal = 0`.
  - Genera un log con el listado de usuarios afectados y los importes para que el admin pueda manualmente rebalancear desde la UI si para algún caso conoce el desglose REBU/estándar.
  - **No toca rows históricos de `withdrawals`** — mantienen su estado actual sin `vat_regime`, `withdrawal_items`, etc. Quedan como "pre-Stripe Connect" (filtrables por `stripe_transfer_id IS NULL`).

### Frontend — Admin

- **Nuevo `client/app/admin/payouts/page.js`** — listado de sellers con saldo pendiente, columnas: seller, balance REBU, balance estándar, total, status Stripe Connect (badge), última actividad. Cada fila linkea a `/admin/payouts/[sellerId]`.
- **Nuevo `client/app/admin/payouts/[sellerId]/page.js`** — detalle. Dos secciones, una por régimen, cada una con:
  - Lista de items pendientes (con tipo, producto, comprador, fecha, importe, base, IVA).
  - Total del bucket.
  - Botón "Ejecutar pago de este régimen" → abre `<ConfirmPayoutModal>`.
  - Histórico de payouts ejecutados de ese régimen (con `stripe_transfer_id` enlazado al dashboard de Stripe).
- **Componente `client/components/admin/ConfirmPayoutModal.js`** — flujo en dos pasos:
  1. Llama a `POST .../preview` y muestra el resumen exacto: importe, items incluidos, IVA, idempotency key, advertencia "Esta operación es irreversible una vez confirmada por Stripe".
  2. Botón "Confirmar y ejecutar" llama a `POST .../execute` con el `confirmation_token` del paso 1. Mientras está in-flight, deshabilita el botón y muestra "Procesando con Stripe…".
  3. Resultado: toast verde con `stripe_transfer_id` o toast rojo con `failure_reason`.
- **Modificar página de detalle del autor (Change #1) para añadir "Histórico de pagos"** — opcional; puede vivir sólo en `/admin/payouts/[sellerId]`.

### Frontend — Seller

- **Modificar `client/app/seller/dashboard/page.js`** — el monedero pasa a mostrar **dos balances**:
  - "Saldo arte (REBU 10% IVA)" en €.
  - "Saldo otros productos / eventos (21% IVA)" en €.
  - Total combinado abajo.
- **Modificar el botón "Realizar transferencia"**:
  - Cambia el texto a "Solicitar pago a 140d Galería de Arte".
  - Al hacer click muestra una modal explicativa: "Tu solicitud llegará al equipo. Los pagos se procesan de forma manual; recibirás un email cuando se haya enviado." y un único botón "Enviar solicitud" que llama al `POST /api/seller/withdrawals` modificado.
  - Ya no hay paso 2 con IBAN (el IBAN está en Stripe Connect, lo gestiona el artista durante el onboarding).

### Email

- **Nueva plantilla en `api/services/emailService.js`**: `sendSellerPayoutExecutedEmail({ seller, withdrawal, items })` — al artista cuando se ejecuta un pago. Incluye importe, número de items, régimen fiscal, link al dashboard del seller.
- **Modificar `sendWithdrawalNotificationEmail`** — el email al admin del nuevo flujo *nudge*: ya no incluye IBAN (no aplica), incluye link directo a `/admin/payouts/<sellerId>`.

## Capabilities

### New Capabilities

- `stripe-connect-payouts`: ejecución, registro y reconciliación de payouts vía Stripe Connect Transfers V1 contra cuentas conectadas. Incluye cálculo VAT por item, panel admin de payouts, modal de confirmación irreversible, y handlers de webhook V1 para `transfer.*`.

### Modified Capabilities

- `seller-wallet`: el monedero pasa de un único `available_withdrawal` a dos buckets (`available_withdrawal_art_rebu`, `available_withdrawal_standard_vat`). El scheduler y el endpoint de cambio de status acreditan al bucket correcto según el tipo de item. La UI del seller muestra ambos balances.
- `seller-withdrawals`: el endpoint `POST /api/seller/withdrawals` cambia de "crear withdrawal + zero balance + email" a "email-only nudge". La creación real de withdrawals pasa al panel admin. La tabla `withdrawals` se amplía con `stripe_transfer_id`, `vat_regime`, totales VAT y campos de reversal.

## Impact

- **Layer**: Backend + Frontend + Email + DB schema migration + integración Stripe Transfers V1.
- **Files afectados — Backend**:
  - `api/config/database.js` (safeAlter en `users` y `withdrawals`, nueva tabla `withdrawal_items`).
  - `api/services/stripeConnectService.js` (nuevas funciones de transfers).
  - `api/utils/vatCalculator.js` (nuevo).
  - `api/scheduler/confirmationScheduler.js` (split de buckets).
  - `api/controllers/ordersController.js` (split de buckets en el endpoint de status).
  - `api/controllers/stripeConnectPayoutsController.js` (nuevo).
  - `api/controllers/stripeConnectWebhookController.js` (handlers `transfer.*`).
  - `api/routes/sellerRoutes.js` (cambio de semántica del POST /withdrawals).
  - `api/routes/admin/stripeConnectPayoutsRoutes.js` (nuevo).
  - `api/validators/stripeConnectPayoutsSchemas.js` (nuevo).
  - `api/services/emailService.js` (plantillas nuevas y modificadas).
  - `api/migrations/2026-04-stripe-connect-wallet-split.js` (nuevo, idempotente).
- **Files afectados — Frontend**:
  - `client/lib/api.js` (wrappers nuevos para payouts).
  - `client/app/admin/payouts/page.js` (nuevo).
  - `client/app/admin/payouts/[sellerId]/page.js` (nuevo).
  - `client/components/admin/ConfirmPayoutModal.js` (nuevo).
  - `client/app/seller/dashboard/page.js` (split de balances + nuevo flujo de solicitud).
- **DB schema**: cambios via `safeAlter` (patrón ya usado en el código). Sin DROP. Migración de datos one-shot por separado, idempotente.
- **Dependencies**: ninguna nueva. El paquete `stripe` ya incluye `transfers.create` V1.
- **APIs externas**: Stripe Transfers V1 (`stripe.transfers.create`, `stripe.transfers.retrieve`, `stripe.transfers.listReversals`). Webhook events `transfer.created`, `transfer.reversed`, `transfer.failed` suscritos en el webhook de pagos ("Mi cuenta") ya existente — los eventos `transfer.*` son platform-level V1, no de "Cuentas conectadas". Los handlers viven en `stripeConnectWebhookController.js` y se delegan desde `stripePaymentsController.js`.
- **Config/Infra**: añadir los 3 eventos `transfer.*` al webhook de pagos (`/api/payments/stripe/webhook`). No al endpoint de Connect (que solo acepta eventos V2 de cuentas conectadas).
- **Testing manual**: cuenta de Stripe en test mode con Connect activado, al menos un seller con cuenta conectada `active`, balance pre-cargado en la plataforma (vía `topups` o cobros de prueba). Ejecutar al menos un payout end-to-end y verificar el row en BD + el evento en Stripe Dashboard.

## Non-goals

- **Reversal automatizado vía API.** El admin lo hace en el dashboard de Stripe y refleja en la app vía `mark-reversed`. (El handler de webhook `transfer.reversed` sí se implementa, así que el reflejo es automático cuando el admin actúa en el dashboard.)
- **Gestión de refunds del comprador post-payout.** Si un comprador devuelve un item ya pagado al artista, el saldo del artista puede quedar negativo en su bucket. El admin lo gestiona manualmente. Solución completa fuera de scope v1.
- **UI para que el seller cambie el IBAN.** El IBAN vive en Stripe Connect; el seller lo cambia en su dashboard hosted (link generado por Change #1).
- **Generación de PDFs de autofactura.** Out of scope v1 — Change #4 sólo exporta CSV/JSON.
- **Aplicación real del IRPF.** El campo existe (Change #1) pero no se aplica al cálculo del payout en v1.
- **Buckets adicionales por país de IVA.** Sólo ES en v1.
- **Ejecución programada de payouts.** Siempre manual, siempre disparada por el admin. Sin cron.
- **Acreditación de eventos al monedero.** Eso es Change #3 — aquí sólo se prepara el bucket destino.
