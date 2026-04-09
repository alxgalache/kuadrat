# Tasks — stripe-connect-manual-payouts

> **Lectura previa obligatoria:** `docs/stripe_connect/master_plan.md` (todo) y la `proposal.md` + `design.md` de este mismo change. El Change #1 (`stripe-connect-accounts`) debe estar implementado y desplegado antes de empezar este.

## Fase 0 — Prerrequisitos

- [ ] 0.1 Verificar que Change #1 está merged y desplegado en pre.
- [ ] 0.2 Verificar que existe al menos un seller de prueba con `stripe_connect_status='active'` y `stripe_transfers_capability_active=1`.
- [ ] 0.3 En el dashboard de Stripe (test), añadir los eventos `transfer.created`, `transfer.reversed`, `transfer.failed` al endpoint webhook ya creado en Change #1 (`/api/stripe/connect/webhook`).
- [ ] 0.4 Cargar saldo de prueba en la cuenta plataforma (test mode) vía topup o cobros simulados — necesario para que `transfers.create` funcione en pruebas.

## Fase 1 — Schema

- [ ] 1.1 En `api/config/database.js`, dentro del bloque de `safeAlter` existente para `users`, añadir:
  - `safeAlter('users', 'available_withdrawal_art_rebu', 'REAL NOT NULL DEFAULT 0')`.
  - `safeAlter('users', 'available_withdrawal_standard_vat', 'REAL NOT NULL DEFAULT 0')`.
- [ ] 1.2 En el mismo archivo, ampliar `withdrawals` con `safeAlter` para todos los campos listados en el proposal §Schema (`stripe_transfer_id`, `stripe_transfer_group`, `vat_regime`, `taxable_base_total`, `vat_amount_total`, `executed_at`, `executed_by_admin_id`, `failure_reason`, `reversed_at`, `reversal_amount`, `reversal_reason`).
- [ ] 1.3 Añadir `CREATE UNIQUE INDEX idx_withdrawals_stripe_transfer ON withdrawals(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL`.
- [ ] 1.4 Añadir `CREATE INDEX idx_withdrawals_vat_regime`.
- [ ] 1.5 Añadir el `CREATE TABLE IF NOT EXISTS withdrawal_items` completo con sus dos índices.
- [ ] 1.6 Reiniciar la API local y verificar que `initializeDatabase()` no rompe y que las columnas/tabla existen (`SELECT name FROM sqlite_master`).

## Fase 2 — Migración de datos

- [ ] 2.1 Crear `api/migrations/2026-04-stripe-connect-wallet-split.js` con la lógica del design §6.
- [ ] 2.2 Hacer que se ejecute al arranque (en `api/server.js` tras `initializeDatabase()`) sólo si detecta `available_withdrawal > 0` en algún user. Idempotente.
- [ ] 2.3 Loggear con `pino` cada usuario migrado (id + importe).

## Fase 3 — Helper VAT

- [ ] 3.1 Crear `api/utils/vatCalculator.js` con `computeRebuVat` y `computeStandardVat` según las fórmulas del design §3.
- [ ] 3.2 Tests unitarios (al menos 4 casos: precio entero, precio con decimales, comisión 0, comisión = precio).

## Fase 4 — Servicio Stripe Transfers

- [ ] 4.1 En `api/services/stripeConnectService.js`, añadir `createTransfer({ withdrawal, connectedAccountId, idempotencyKey })`. Llama a `stripeClient.transfers.create({ amount, currency:'eur', destination: connectedAccountId, transfer_group: 'WITHDRAWAL_'+withdrawal.id, metadata: { withdrawal_id: withdrawal.id, vat_regime: withdrawal.vat_regime } }, { idempotencyKey })`.
- [ ] 4.2 Añadir `retrieveTransfer(transferId)` y `listTransferReversals(transferId)`.
- [ ] 4.3 Tests unitarios mockeando `stripeClient.transfers.*`.

## Fase 5 — Scheduler y endpoint de status (split de buckets)

- [ ] 5.1 Modificar `api/scheduler/confirmationScheduler.js`: el `UPDATE users SET available_withdrawal = ...` se sustituye por dos ramas según la procedencia del item:
  - Items de `art_order_items` → `available_withdrawal_art_rebu`.
  - Items de `other_order_items` → `available_withdrawal_standard_vat`.
- [ ] 5.2 Modificar el handler de `PATCH /api/orders/:orderId/items/:itemId/status` en `api/controllers/ordersController.js` con el mismo split.
- [ ] 5.3 Buscar otros sitios donde se incremente `available_withdrawal` (grep). Aplicar el mismo cambio.
- [ ] 5.4 Test manual: confirmar un item de arte y un item "other" en pre, verificar que cada bucket recibe lo correcto.

## Fase 6 — Endpoint seller (cambio a *nudge*)

- [ ] 6.1 Modificar `POST /api/seller/withdrawals` en `api/routes/sellerRoutes.js:387`:
  - Eliminar el `INSERT INTO withdrawals` y el `UPDATE available_withdrawal = 0`.
  - Sólo enviar el email al admin con link `/admin/payouts/<sellerId>`.
  - Devolver `200 { ok: true, message: 'Solicitud enviada' }`.
- [ ] 6.2 Modificar `sendWithdrawalNotificationEmail` en `api/services/emailService.js` para el nuevo cuerpo (sin IBAN, con link).
- [ ] 6.3 Si existe `GET /api/seller/withdrawals`, ampliarlo para devolver los nuevos campos y filtrar por `vat_regime` si se pasa.

## Fase 7 — Validators

- [ ] 7.1 Crear `api/validators/stripeConnectPayoutsSchemas.js` con:
  - `previewPayoutSchema` → `{ vat_regime: enum(['art_rebu','standard_vat']), item_ids?: number[] }`.
  - `executePayoutSchema` → `{ vat_regime, item_ids?, confirmation_token: string }`.
  - `markReversedSchema` → `{ reversal_amount: number, reversal_reason: string }`.

## Fase 8 — Controlador admin de payouts

- [ ] 8.1 Crear `api/controllers/stripeConnectPayoutsController.js`.
- [ ] 8.2 `listSellersWithBalance(req,res)` — `GET /api/admin/payouts`. Query a `users` con `WHERE available_withdrawal_art_rebu > 0 OR available_withdrawal_standard_vat > 0`, JOIN para obtener `stripe_connect_status`.
- [ ] 8.3 `getSellerPayoutDetail(req,res)` — `GET /api/admin/payouts/:sellerId`. Devuelve ambos buckets, items pendientes (los acreditados que no estén en ningún `withdrawal_items` con withdrawal en estado activo), histórico de payouts.
- [ ] 8.4 `previewPayout(req,res)` — `POST /api/admin/payouts/:sellerId/preview`. Calcula el resumen y genera un `confirmation_token` (UUID + timestamp) que guarda en una `Map` en memoria con TTL 5 min. Devuelve `{ token, summary }`.
- [ ] 8.5 `executePayout(req,res)` — `POST /api/admin/payouts/:sellerId/execute`. Implementa el flujo del design §4 paso a paso, con transacción local + llamada Stripe + manejo de éxito/fallo.
- [ ] 8.6 `markReversed(req,res)` — `POST /api/admin/payouts/withdrawals/:id/mark-reversed`. Actualiza el row y devuelve el bucket.
- [ ] 8.7 Helper interno `findItemsAlreadyInActiveWithdrawal(itemRefs)` que valida la unicidad app-side.

## Fase 9 — Routing admin

- [ ] 9.1 Crear `api/routes/admin/stripeConnectPayoutsRoutes.js`.
- [ ] 9.2 Montar las 5 rutas con sus respectivos middlewares de validación.
- [ ] 9.3 Registrar el router en `api/routes/admin/index.js`.

## Fase 10 — Webhook handlers

- [ ] 10.1 En `api/controllers/stripeConnectWebhookController.js`, ampliar el switch con `case 'transfer.created'`, `'transfer.reversed'`, `'transfer.failed'`.
- [ ] 10.2 Para `transfer.reversed`: leer `stripe_transfer_id` del payload, buscar el withdrawal, marcarlo `reversed`, sumar `reversal_amount` al bucket original (`vat_regime`).
- [ ] 10.3 Para `transfer.failed`: marcar `failed`, escribir `failure_reason`, revertir el decremento, email al admin.
- [ ] 10.4 Verificar que la idempotencia vía `stripe_connect_events` cubre estos eventos también (Change #1 ya lo deja preparado).

## Fase 11 — Email

- [ ] 11.1 Añadir `sendSellerPayoutExecutedEmail({ seller, withdrawal, items })` en `api/services/emailService.js`.
- [ ] 11.2 Plantilla en español, branding "140d Galería de Arte", incluir importe, régimen, link al dashboard del seller.
- [ ] 11.3 Añadir `sendAdminPayoutFailedEmail` y `sendAdminPayoutReversedEmail` para los casos de webhook.

## Fase 12 — Frontend admin

- [ ] 12.1 Añadir wrappers en `client/lib/api.js`: `listSellersWithBalance`, `getSellerPayoutDetail`, `previewPayout`, `executePayout`, `markPayoutReversed`.
- [ ] 12.2 Crear `client/app/admin/payouts/page.js` (listado).
- [ ] 12.3 Crear `client/app/admin/payouts/[sellerId]/page.js` (detalle, dos secciones por régimen, histórico).
- [ ] 12.4 Crear `client/components/admin/ConfirmPayoutModal.js` con flujo preview→execute, estado in-flight, manejo de error.
- [ ] 12.5 Verificar diseño minimalista, sólo Tailwind por defecto, textos en es-ES.

## Fase 13 — Frontend seller

- [ ] 13.1 Modificar `client/app/seller/dashboard/page.js`:
  - Mostrar dos balances con etiquetas claras.
  - Total combinado abajo.
  - Botón "Solicitar pago a 140d Galería de Arte".
- [ ] 13.2 Eliminar el flujo de IBAN/recipientName del modal de solicitud.
- [ ] 13.3 Modal nuevo, simple, un solo botón "Enviar solicitud".

## Fase 14 — Testing manual end-to-end

- [ ] 14.1 En pre, completar el onboarding de un seller hasta `active`.
- [ ] 14.2 Crear una orden de arte y otra "other", confirmar ambas tras el plazo (o forzar el scheduler).
- [ ] 14.3 Verificar que los buckets se incrementan correctamente.
- [ ] 14.4 Como admin, abrir `/admin/payouts/<sellerId>`, ejecutar payout REBU. Verificar:
  - Row en `withdrawals` con `status='completed'`, `stripe_transfer_id`.
  - Filas en `withdrawal_items`.
  - Bucket art REBU en 0.
  - Email recibido por el seller.
  - Transfer visible en dashboard de Stripe.
- [ ] 14.5 Repetir para el bucket estándar.
- [ ] 14.6 Probar fallo: forzar un destination inválido → verificar rollback del bucket y row `failed`.
- [ ] 14.7 Probar reversal desde dashboard de Stripe → verificar webhook + reflejo en BD.
- [ ] 14.8 Probar el *nudge* del seller: confirmar que llega email al admin y NO se crea row en `withdrawals`.

## Fase 15 — Documentación

- [ ] 15.1 Actualizar `docs/stripe_connect/master_plan.md` §13 (changelog) con un entry para Change #2.
- [ ] 15.2 Documentar en `api/.env.example` cualquier env var nueva (probablemente ninguna; reutilizamos las del Change #1).
- [ ] 15.3 Anotar las limitaciones conocidas en una sección "Known limitations" del propio change o en el master plan.

## Fase 16 — Checklist Stripe Dashboard (live mode)

- [ ] 16.1 Antes del go-live en producción: añadir los 3 eventos `transfer.*` al endpoint webhook live.
- [ ] 16.2 Verificar que el balance de la plataforma en live tiene fondos suficientes para los primeros payouts.
- [ ] 16.3 Hacer un primer payout real con un importe pequeño a un artista de confianza como prueba.
