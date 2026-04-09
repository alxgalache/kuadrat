# Design — stripe-connect-manual-payouts

> Lectura previa obligatoria: `docs/stripe_connect/master_plan.md` (especialmente §6.6 Transfers V1 recipe, §7.2 Change #2, §4 schema canónico) y `docs/stripe_connect/transfers.md`. Este documento NO repite las decisiones de la fase de exploración; las usa.

## 1. Decisiones clave (resumen)

| # | Decisión | Justificación |
|---|---|---|
| 1 | **Transfers V1** (no V2) para ejecutar payouts. | V2 cubre `accounts.*` pero el endpoint `transfers.create` sólo existe en V1. Stripe lo permite mezclar (cuenta creada en V2, transfer en V1). Confirmado en `docs/stripe_connect/transfers.md`. |
| 2 | **Separate charges and transfers**, `source_transaction = NULL`. Financiado desde el balance de plataforma. | Necesario para mantener el plazo manual de 14 días. Decidido en master plan §3. |
| 3 | **Dos buckets en `users`** (`available_withdrawal_art_rebu`, `available_withdrawal_standard_vat`) en lugar de uno. | Cada payout debe ser de un único régimen fiscal para que la autofactura/factura sea limpia. Mezclar en el mismo transfer obligaría a prorratear post-hoc. |
| 4 | **Tabla `withdrawal_items` polimórfica** (`item_type`, `item_id`). | Mismo patrón que las tres pivot tables existentes (postal_codes). Permite que un withdrawal cubra arte + futuros otros items sin tablas separadas. |
| 5 | **Unicidad item-en-withdrawal a nivel de aplicación** (no índice parcial). | SQLite no permite filtros que referencien otra tabla en un partial index. La regla "un item sólo puede estar en un withdrawal activo" se valida dentro de la transacción de creación. |
| 6 | **Confirmation token + flujo preview/execute en dos pasos.** | Anti doble-click y anti race condition entre admins. El token vive 5 min en memoria del proceso (Map en el controller); en multi-instancia se podría mover a DB pero v1 corre en una sola instancia. |
| 7 | **Idempotency key** = `transfer_withdrawal_<id>_v1`. | Derivada del PK local, único, estable. Si Stripe responde 5xx y se reintenta, no se duplica el transfer. |
| 8 | **Reversal: webhook escucha + endpoint admin manual de reflejo**, sin API call automática. | Reversal vía API es delicado (depende del balance disponible en la cuenta destino). Mejor que el admin lo dispare en el dashboard y la app sólo refleje. El webhook hace el reflejo automático en la mayoría de casos. |
| 9 | **`safeAlter`** para los cambios de schema. | Patrón ya en uso en `api/config/database.js` (líneas 600+). Contradice CLAUDE.md pero es lo que hace el código real. Mantenemos consistencia. |
| 10 | **Migración del saldo histórico → bucket `standard_vat`.** | Conservadora: 21% > 10%, no perjudica al artista. El admin puede rebalancear manualmente desde la UI si conoce el desglose. |
| 11 | **`POST /api/seller/withdrawals` se convierte en *nudge*** (no crea row, sólo email). | El admin pasa a ser el único creador de withdrawals. El seller perdería trazabilidad si pudiera crear rows en `pending` que luego el admin tendría que ejecutar a mano. Más limpio: una sola fuente de creación. |

## 2. Modelo de datos

### 2.1 Cambios en `users`

```sql
ALTER TABLE users ADD COLUMN available_withdrawal_art_rebu REAL NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN available_withdrawal_standard_vat REAL NOT NULL DEFAULT 0;
-- available_withdrawal se mantiene; quedará en 0 tras la migración y deprecated en el código.
```

### 2.2 Cambios en `withdrawals`

```sql
ALTER TABLE withdrawals ADD COLUMN stripe_transfer_id TEXT;
ALTER TABLE withdrawals ADD COLUMN stripe_transfer_group TEXT;
ALTER TABLE withdrawals ADD COLUMN vat_regime TEXT;            -- 'art_rebu' | 'standard_vat'
ALTER TABLE withdrawals ADD COLUMN taxable_base_total REAL;
ALTER TABLE withdrawals ADD COLUMN vat_amount_total REAL;
ALTER TABLE withdrawals ADD COLUMN executed_at DATETIME;
ALTER TABLE withdrawals ADD COLUMN executed_by_admin_id INTEGER;
ALTER TABLE withdrawals ADD COLUMN failure_reason TEXT;
ALTER TABLE withdrawals ADD COLUMN reversed_at DATETIME;
ALTER TABLE withdrawals ADD COLUMN reversal_amount REAL;
ALTER TABLE withdrawals ADD COLUMN reversal_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_stripe_transfer
  ON withdrawals(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_vat_regime ON withdrawals(vat_regime);
```

- `iban` queda como NOT NULL en el DDL pero a nivel de aplicación los nuevos rows escriben un placeholder `''` o, si se puede vía safeAlter, se relaja a NULLable. **Decisión:** mantener NOT NULL por compatibilidad; el código de creación nuevo escribe `''` y el front no lo muestra cuando `vat_regime IS NOT NULL`.
- `status` se sigue almacenando como TEXT con CHECK actual; los nuevos valores `processing`, `reversed` se enforzan en código y se documentan en el spec. SQLite no permite ALTER del CHECK; aceptamos esta limitación.

### 2.3 Nueva tabla `withdrawal_items`

```sql
CREATE TABLE IF NOT EXISTS withdrawal_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  withdrawal_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('art_order_item','other_order_item','event_attendee')),
  item_id INTEGER NOT NULL,
  seller_earning REAL NOT NULL,
  taxable_base REAL NOT NULL,
  vat_rate REAL NOT NULL,
  vat_amount REAL NOT NULL,
  vat_regime TEXT NOT NULL CHECK(vat_regime IN ('art_rebu','standard_vat')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id)
);
CREATE INDEX IF NOT EXISTS idx_withdrawal_items_withdrawal ON withdrawal_items(withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_items_lookup ON withdrawal_items(item_type, item_id);
```

## 3. Cálculo VAT por item

### 3.1 Arte (REBU 10% sobre el margen)

```js
// priceCents y commissionCents son enteros (céntimos) si el resto del código lo es;
// si el código almacena REAL, mismas fórmulas con floats.
function computeRebuVat({ priceCents, commissionCents }) {
  const sellerEarningCents = priceCents - commissionCents;
  // Base imponible REBU = margen del marketplace = comisión, IVA incluido en el margen
  const taxableBaseCents = Math.round(commissionCents / 1.10);
  const vatAmountCents = commissionCents - taxableBaseCents;
  return {
    sellerEarning: sellerEarningCents,
    taxableBase: taxableBaseCents,
    vatRate: 0.10,
    vatAmount: vatAmountCents,
  };
}
```

### 3.2 Otros productos / eventos (estándar 21%)

```js
function computeStandardVat({ priceCents, commissionCents }) {
  const sellerEarningCents = priceCents - commissionCents;
  // Base imponible = comisión sin IVA (la comisión es lo que la plataforma factura al artista)
  const taxableBaseCents = Math.round(commissionCents / 1.21);
  const vatAmountCents = commissionCents - taxableBaseCents;
  return {
    sellerEarning: sellerEarningCents,
    taxableBase: taxableBaseCents,
    vatRate: 0.21,
    vatAmount: vatAmountCents,
  };
}
```

> **Nota fiscal:** estas fórmulas calculan el IVA que la **plataforma** factura/autofactura sobre la **comisión**. El `sellerEarning` (lo que efectivamente se transfiere al artista) NO incluye este IVA — el IVA forma parte de la comisión que retiene la plataforma. La gestoría usa estos campos para componer las facturas en su ERP.

## 4. Flujo end-to-end de un payout

```
Admin abre /admin/payouts                              ← lista de sellers con saldo
   ↓
Admin entra a /admin/payouts/[sellerId]                ← detalle dos secciones (REBU / estándar)
   ↓
Admin click "Ejecutar pago REBU"
   ↓
ConfirmPayoutModal abre
   ↓
POST /api/admin/payouts/:sellerId/preview { vat_regime: 'art_rebu' }
   ← devuelve { token, summary: { total, taxable_base, vat, items[], idempotency_key } }
   ↓
Admin lee, click "Confirmar y ejecutar"
   ↓
POST /api/admin/payouts/:sellerId/execute { vat_regime, item_ids, confirmation_token }
   ↓
[transacción local]
  - SELECT bucket actual del seller (FOR UPDATE conceptual)
  - Validar que ningún item ya esté en otro withdrawal activo
  - INSERT withdrawals (status='processing', vat_regime, totales, executed_by_admin_id)
  - INSERT withdrawal_items[]
  - UPDATE users SET available_withdrawal_<bucket> = available_withdrawal_<bucket> - total
[/transacción]
   ↓
stripe.transfers.create({ amount, currency:'eur', destination, transfer_group, metadata },
                        { idempotencyKey: 'transfer_withdrawal_<id>_v1' })
   ↓
  ✅ éxito → UPDATE withdrawals SET status='completed', stripe_transfer_id=tr.id, executed_at=now
            → sendSellerPayoutExecutedEmail
            → toast verde
  ❌ error → UPDATE withdrawals SET status='failed', failure_reason=err.message
            → revertir el decremento del bucket
            → DELETE withdrawal_items donde withdrawal_id=...
            → toast rojo
```

## 5. Manejo de webhooks `transfer.*`

| Evento | Handler |
|---|---|
| `transfer.created` | Confirmar `stripe_transfer_id` y `executed_at` si no estaban. Idempotente. |
| `transfer.reversed` | `withdrawals.status='reversed'`, `reversed_at`, `reversal_amount`. Sumar `reversal_amount` al bucket original del seller. NO borrar `withdrawal_items` (trazabilidad histórica). Email al admin. |
| `transfer.failed` | `withdrawals.status='failed'`, `failure_reason`. Revertir decremento del bucket. Email al admin. |

Todos los eventos se desduplican vía `stripe_connect_events.stripe_event_id UNIQUE` (tabla creada en Change #1).

## 6. Migración de datos

```js
// api/migrations/2026-04-stripe-connect-wallet-split.js
// Idempotente: detecta si ya se ha ejecutado mirando un row en una tabla de
// migrations o (más simple) si todos los users tienen available_withdrawal=0.
async function run() {
  const users = await db.execute(`SELECT id, available_withdrawal FROM users WHERE available_withdrawal > 0`);
  for (const u of users.rows) {
    await db.execute({
      sql: `UPDATE users
            SET available_withdrawal_standard_vat = available_withdrawal_standard_vat + ?,
                available_withdrawal = 0
            WHERE id = ? AND available_withdrawal = ?`,
      args: [u.available_withdrawal, u.id, u.available_withdrawal],
    });
    logger.info({ userId: u.id, amount: u.available_withdrawal }, 'wallet split migration: dumped to standard_vat bucket');
  }
}
```

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Doble click del admin → doble transfer | Confirmation token de un solo uso + idempotency key derivada del withdrawal id (si Stripe recibe la misma key, devuelve el mismo objeto). |
| Race entre dos admins ejecutando el mismo bucket | El UPDATE del bucket lleva un guard `WHERE available_withdrawal_X = ?` con el valor leído. Si otra ejecución se coló, `rowsAffected=0` y se aborta. Mismo patrón que el código actual de withdrawals. |
| `transfers.create` 5xx → reintento | Idempotency key absorbe el reintento; el row local queda en `processing` hasta que se resuelve. Si tras N reintentos falla definitivamente, se marca `failed` y se revierte. |
| Reversal post-payout a una cuenta vacía | Detectado por Stripe (responde error). El admin lo gestiona en el dashboard. La app no intenta reversar automáticamente. |
| Refund del comprador después del payout | Out of scope v1. Se documenta como limitación conocida. El admin compensa manualmente ajustando el bucket del artista (endpoint admin no expuesto en v1; SQL directo si urge). |
| Migración volcando todo al bucket estándar | Conservadora (más IVA → menos riesgo fiscal). El admin tiene UI futura para rebalancear; en v1 si necesita hacerlo, SQL directo. |
| `iban` sigue NOT NULL | Nuevos rows escriben `''`. La UI no lo muestra cuando `vat_regime IS NOT NULL`. Aceptado como deuda menor. |
| `status` CHECK no permite `processing`/`reversed` | SQLite no permite ALTER CHECK. Los valores se almacenan igualmente (CHECK no se reevalúa en INSERTs si la columna ya existe? — comprobar). Si bloquea, plan B: re-crear tabla `withdrawals_new` con CHECK ampliado, copiar datos. Decisión final en implementación. |

## 8. Lo que NO entra en este change

Ver la sección **Non-goals** del proposal. En particular: refunds post-payout, reversal vía API automatizado, PDFs de autofactura, IRPF aplicado, eventos acreditando al monedero (eso es Change #3), export a gestoría (Change #4).
