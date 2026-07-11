# Design — per-seller-vat-rates

## Context

Hoy conviven **dos capas de IVA** que no hay que confundir:

1. **IVA de la factura del artista** (10% arte como autor / 21% resto): vive en
   las env vars `TAX_VAT_ART_ES`, `TAX_VAT_ES` y `NEXT_PUBLIC_TAX_VAT_*`. Sus
   únicos consumidores funcionales son la vista previa netEarnings de
   `ProductForm.js`, el texto explicativo de `inferInvoicingMode()` en el
   informe fiscal, y los metadatos de line items de Revolut
   (`ordersController.js:68` — 21% plano, legacy). `config.payment.vatArtEs`
   no tiene ningún consumidor.
2. **Régimen fiscal de la plataforma** (`art_rebu` / `standard_vat`): hoy es un
   mapeo **estructural por tipo de producto** — arte → REBU, otros/eventos →
   estándar. Determina la bolsa del monedero
   (`available_withdrawal_art_rebu` / `_standard_vat`), el `vat_regime` de
   `withdrawals` y `withdrawal_items`, la serie de la factura del comprador
   (A REBU sin desglose de IVA / P estándar con IVA 21%) y la clasificación
   del export fiscal. El IVA de la plataforma sobre su comisión es 21% en
   ambos regímenes (`vatCalculator.js` — numéricamente idéntico; solo cambia
   la etiqueta fiscal).

Dato estructural clave: **los importes** acreditados/retirados son siempre
`price_at_purchase − commission_amount` (bruto con el IVA del artista dentro).
Cambiar el tipo de IVA de un artista **no altera ningún importe** del monedero;
altera la vista previa de neto, la clasificación fiscal de sus ventas de arte
y la documentación (facturas, export).

Con la cooperativa: el artista deja de ser el emisor-autor → factura al 21% y
la galería **no puede aplicar REBU** a la reventa de esas obras → esas ventas
de arte son régimen general de punta a punta (decisión del usuario:
*reclasificación completa*).

Precedente a replicar: `per-seller-commission-rates` (columnas en `users`,
edición admin, endpoint al vendedor, eliminación de env vars).

## Goals / Non-Goals

**Goals:**
- Tipos de IVA configurables por vendedor y tipo de producto, con defaults
  idénticos al comportamiento actual (10 / 21).
- El régimen fiscal de cada venta de arte se deriva del vendedor y queda
  **congelado por item** en el momento de la venta.
- El arte de artistas al 21% fluye como régimen estándar en monedero,
  retiradas, facturas y export fiscal, sin cambiar ningún importe.
- Eliminar las `NEXT_PUBLIC_TAX_VAT_*` del pipeline de build y
  `TAX_VAT_ART_ES` de la API.

**Non-Goals:**
- No se recalcula histórico (backfill uniforme a `art_rebu`).
- No se toca `vatCalculator.js` ni el 21% de la plataforma sobre su comisión.
- No se toca la ruta Revolut (sigue con `TAX_VAT_ES` plano — decisión del
  usuario).
- No hay flag adicional tipo `cooperativa` en `users` (el régimen se deriva
  del tipo — decisión del usuario).
- Sin cambios en emails (sus etiquetas describen bolsas/regímenes y siguen
  siendo correctas).

## Decisions

### 1. Columnas y convención
`tax_vat_art REAL NOT NULL DEFAULT 10` y `tax_vat_other REAL NOT NULL DEFAULT 21`
en `users`: porcentaje entero (como `dealer_commission_*`), singular `other`,
en `CREATE TABLE` **y** `safeAlter` (patrón existente de `database.js`).
Defaults = valores actuales → todo vendedor existente y nuevo se comporta
exactamente como hoy hasta que el admin lo cambie.
*Alternativa descartada:* decimales 0–1 (como las env del API) — rompería la
consistencia con las comisiones en la UI admin y en los endpoints.

### 2. Derivación del régimen — helper único
Nuevo `api/utils/vatRegime.js`:

```js
const REBU_ART_VAT_RATE = 10;
function artVatRegimeForRate(rate) {
  return Number(rate) === REBU_ART_VAT_RATE ? 'art_rebu' : 'standard_vat';
}
```

Regla de negocio: solo la venta del autor al tipo reducido (10%) da derecho a
REBU; cualquier otro valor (21 = cooperativa) → estándar. `other` y eventos →
siempre `standard_vat` (no se deriva nada). Todos los puntos del backend
importan este helper; ninguna comparación `=== 10` suelta.
*Alternativa descartada:* flag explícito (`tax_status='cooperativa'` o
boolean) — el usuario eligió derivar del tipo; evita estados incoherentes
flag/tipo y una segunda fuente de verdad.

### 3. Snapshot `art_order_items.vat_regime` (congelado en venta)
Sin snapshot, el régimen se evaluaría con el tipo *actual* del vendedor en
cada lectura: un cambio de tipo entre la acreditación y la retirada
**desincronizaría** las bolsas (crédito a una bolsa, retirada consultando
otra). Por eso el régimen se congela al crear el item — misma filosofía que
`commission_amount`:

- Columna `vat_regime TEXT` en `art_order_items` (`CREATE TABLE` + `safeAlter`).
- La escriben los 3 puntos que insertan items de arte: checkout
  (`ordersController`), facturación de subasta (`auctionAdminController`),
  facturación de sorteo (`drawAdminController`). Los SELECT de esos flujos ya
  traen (o pueden traer) `users` → añadir `tax_vat_art` y derivar.
- **Backfill idempotente** en `database.js` tras el `safeAlter`:
  `UPDATE art_order_items SET vat_regime = 'art_rebu' WHERE vat_regime IS NULL`
  (todo el histórico era REBU — era el único régimen posible).
- Lecturas defensivas: `COALESCE(vat_regime, 'art_rebu')` en queries, por si
  alguna fila escapara al backfill.
- `other_order_items` NO lleva columna: su régimen es constante
  (`standard_vat`), añadirla sería estado muerto.

### 4. Acreditación/débito del monedero por régimen del item
Los puntos que hoy eligen bolsa por `product_type`/tabla pasan a elegirla por
el régimen del item:
- items `other` → `available_withdrawal_standard_vat` (sin cambios);
- items `art` → `COALESCE(vat_regime,'art_rebu')` decide la bolsa.

Puntos afectados (todos ya seleccionan la fila del item; solo hay que añadir
`vat_regime` al SELECT cuando la tabla es `art_order_items` y cambiar la
elección de columna):
1. `ordersController` — confirmación por seller (`~1700`).
2. `ordersController` — confirmación pública por item (`~2200`).
3. `ordersController` — confirmación pública del pedido completo (`~2357`):
   la agrupación pasa de `(sellerId)` por tabla a `(sellerId, bolsa)`.
4. `ordersController` — débitos por cancelación/reembolso (`~2465`, `~2567`):
   simétricos al crédito (misma bolsa que se acreditó, gracias al snapshot).
5. `confirmationScheduler` — auto-confirmación Sendcloud.
6. `eventCreditScheduler` — sin cambios (siempre estándar).

### 5. Payouts: selección de pendientes por régimen
`stripeConnectPayoutsController`:
- `art_rebu` → `art_order_items` con `COALESCE(vat_regime,'art_rebu') = 'art_rebu'`.
- `standard_vat` → `other_order_items` (todos) **+** `art_order_items` con
  `vat_regime = 'standard_vat'` **+** `event_attendees` (como hoy).
- Cada fila ya viaja etiquetada con su `item_type`; `withdrawal_items` admite
  `item_type='art_order_item'` con `vat_regime='standard_vat'` sin cambio de
  esquema (CHECK ya permite ambos valores en columnas independientes).
- `vatComputeFor(regime)` no cambia: un item de arte dentro de un payout
  estándar usa `computeStandardVat` — numéricamente idéntico a
  `computeRebuVat` (ambos extraen el 21% de la comisión); lo que importa es
  la etiqueta fiscal registrada.
- Restricción por ids (`item_ids`): los ids de `art_order_items` y
  `other_order_items` pueden colisionar. El payload de preview/execute gana un
  campo opcional `art_item_ids` usado solo con `vat_regime='standard_vat'`;
  `item_ids` conserva su significado actual (tabla "nativa" del régimen).
  Validador `stripeConnectPayoutsSchemas.js` actualizado.
- Los helpers `itemTypeFor`/`itemTableFor`/`productJoinFor` (asunción
  régimen→una tabla) se reestructuran: los loaders son explícitos por tabla y
  las filas siempre autoetiquetadas.
- Verificar que `itemDescription.describeBatch` y la UI de
  `/admin/payouts/[sellerId]` renderizan filas `art_order_item` dentro de un
  payout estándar (el código ya es por `item_type`; se espera que funcione).

### 6. Facturas PDF: clasificación por régimen del item
`invoiceService.js`:
- `generateBuyerRebuInvoice` (Serie A): solo items de arte con régimen REBU
  (hoy: todos los items de arte). Error 400 si el pedido no tiene ninguno.
- `generateBuyerStandardInvoice` (Serie P): items `other` **+** items de arte
  con régimen estándar. El desglose extrae el 21% del precio (régimen general
  de la reventa — correcto también para arte: la galería vende al tipo
  general; el 10% del autor solo aplica a la factura artista→galería, que es
  externa al sistema).
- Un pedido "mixto" ahora también puede serlo por regímenes de arte:
  obra REBU + obra estándar → Serie A + Serie P.
- Serie C (comisión, solo payouts estándar): puede llevar líneas de arte;
  los importes salen de `withdrawal_items` ya persistidos — sin cambio de
  cálculo. Serie L (liquidación REBU): sin cambios (solo ve items REBU).
- `invoiceController.getBuyerInvoice` y los botones del admin de pedidos
  eligen Serie A/P por **presencia de items de cada régimen**, no por
  presencia de items de cada tabla.

### 7. Informe fiscal (gestoría)
`inferInvoicingMode(user)` deja el hardcode "(10% obras de arte, 21% otros)" y
compone la explicación con `tax_vat_art` / `tax_vat_other` del vendedor (el
SELECT del bloque de vendedor añade las dos columnas). La clasificación por
régimen del export ya es correcta al venir de `withdrawals.vat_regime`.

### 8. Exposición al cliente (sin env, mismo patrón que comisiones)
- `GET /api/seller/commission-rates` → añade `taxVatArt`, `taxVatOther`.
- `GET /api/seller/wallet` → añade `taxVatArt`, `taxVatOther`,
  `artVatRegime` (derivado con el helper) para que el Monedero pueda anotar
  las bolsas sin duplicar la regla en el cliente.
- `GET /api/admin/products/:id/edit-data` → añade `tax_rates: {art, other}`
  del dueño (junto a `commission_rates`).
- `ProductForm.js`: nuevo estado `taxRates` (create: de
  `sellerAPI.getCommissionRates()`; edit: prop `initialTaxRates` desde la
  página admin). Fórmulas idénticas, con el tipo por-vendedor en lugar de
  `process.env.NEXT_PUBLIC_TAX_VAT_*`. La vista previa solo se muestra cuando
  comisión **y** tipo de IVA de la categoría activa están cargados.

### 9. UI
- **Admin autores** (`authors/[id]/edit` + vista): dos inputs numéricos
  (0–100, paso 0.01) junto a las comisiones, con ayuda es-ES: "10 = autor
  (REBU) · otro valor (p. ej. 21) = facturación vía cooperativa (régimen
  general)". Validación Zod espejo de `commissionPercent`.
- **Monedero** (`orders/page.js`): etiquetas de bolsas intactas ("Arte (REBU)"
  solo contendrá ganancias REBU incluso tras un cambio de tipo). Cuando
  `artVatRegime === 'standard_vat'`, la bolsa estándar muestra una nota:
  "Incluye tus obras de arte (IVA 21%)". Sin más cambios visuales.

### 10. Limpieza de configuración
- Eliminar `NEXT_PUBLIC_TAX_VAT_ES` y `NEXT_PUBLIC_TAX_VAT_ART_ES` de:
  `.env.example` (raíz), `client/.env.example`, `client/Dockerfile.staging`,
  `client/Dockerfile.prod`, `docker-compose.prod.yml`,
  `docker-compose.pre2.yml`, `docker-compose.m1.yml` y `.env` locales.
- Eliminar `TAX_VAT_ART_ES` de `api/.env.example` / `.env` locales y
  `vatArtEs` de `config/env.js` (cero consumidores).
- `TAX_VAT_ES` se queda (Revolut legacy) con comentario aclarando su único
  uso restante.

## Risks / Trade-offs

- **[Desincronía bolsa↔pendientes si faltara el snapshot en algún INSERT]** →
  Solo hay 3 puntos que insertan `art_order_items` (checkout, subasta,
  sorteo); verificación explícita en tasks + `COALESCE(...,'art_rebu')`
  defensivo en todas las lecturas (un item sin snapshot se comporta como hoy).
- **[Olvidar un punto de acreditación/débito]** → misma clase de riesgo que en
  `per-seller-commission-rates`; la lista cerrada está en la Decisión 4 y la
  verificación cubre crédito, débito por cancelación, auto-confirmación y
  payout de los dos regímenes.
- **[Colisión de ids en payouts estándar con restricción]** → resuelto con
  `art_item_ids` separado; riesgo residual: el admin UI actual no usa
  restricción por ids (paga la bolsa completa), así que el camino nuevo es
  opcional y compatible.
- **[Cambio de tipo con saldo pendiente]** → por diseño: los items ya creados
  conservan su régimen (snapshot) y su bolsa; solo las ventas futuras cambian.
  Documentado en la ayuda del formulario admin.
- **[Deploy sobre DB existente]** → `safeAlter` + backfill idempotente en el
  arranque; sin pasos manuales. Rollback: el código anterior ignora las
  columnas nuevas (aditivas), sin pérdida.
- **[Spec drift]** → `seller-wallet` describía etiquetas antiguas ("REBU 10%")
  ya corregidas por `correct-fiscal-code-logic`; los deltas de este cambio
  reescriben esos requirements con el comportamiento real actual + el nuevo.

## Migration Plan

1. Deploy API: `initializeDatabase()` añade columnas (`users` ×2,
   `art_order_items` ×1) y backfillea `vat_regime='art_rebu'`. Todo el
   comportamiento es idéntico (defaults 10/21 ⇒ regla deriva REBU para todos).
2. Deploy client (mismo release): `ProductForm` ya no lee env; los tipos
   llegan por API.
3. Retirar las env del pipeline (compose/Dockerfiles) — al estar ya sin
   consumidores, el orden no es crítico.
4. El admin configura `tax_vat_art = 21` a los artistas de cooperativa; desde
   ese momento sus nuevas ventas de arte fluyen como estándar.

## Open Questions

- Texto exacto de la nota de la bolsa estándar para artistas al 21%
  (propuesta: "Incluye tus obras de arte (IVA 21%)") — decidir en
  implementación con el usuario si la propuesta no encaja.
