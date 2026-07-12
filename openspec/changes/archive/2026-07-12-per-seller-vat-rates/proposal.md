# Propuesta: per-seller-vat-rates

## Why

Hasta ahora el IVA que factura el artista es global: 10% para obras de arte
(REBU — el autor factura al tipo reducido) y 21% para el resto, definidos en
variables de entorno (`TAX_VAT_ES`, `TAX_VAT_ART_ES`, `NEXT_PUBLIC_TAX_VAT_*`).
La galería incorpora ahora artistas que facturan a través de una **cooperativa
de artistas**: al no ser el autor quien emite la factura, no aplica el tipo
reducido del 10% y, además, la galería **no puede acogerse al REBU** en la
reventa de esas obras (la adquisición no cumple los requisitos del art. 135
LIVA). Esas ventas de arte deben facturarse al 21% y tratarse como régimen
general de punta a punta: bolsa del monedero, retiradas, factura del comprador
y export fiscal para la gestoría.

Se replica el patrón ya probado en `per-seller-commission-rates`: mover los
valores de las env vars a columnas por usuario en `users`, editables por el
admin, con defaults idénticos al comportamiento actual.

## What Changes

- **Esquema (`users`):** dos columnas nuevas, porcentaje entero (misma
  convención que `dealer_commission_*`):
  `tax_vat_art REAL NOT NULL DEFAULT 10` y
  `tax_vat_other REAL NOT NULL DEFAULT 21`. En `CREATE TABLE` + `safeAlter`.
- **Regla de régimen (nueva, única fuente):** helper `api/utils/vatRegime.js`.
  Venta de arte de un vendedor con `tax_vat_art = 10` → régimen `art_rebu`;
  cualquier otro valor → `standard_vat`. Productos `other` y eventos → siempre
  `standard_vat`. No se añade ningún flag redundante: el régimen se **deriva
  del tipo** (decisión del usuario).
- **Snapshot por item (`art_order_items.vat_regime`):** el régimen se congela
  al crear cada item de pedido de arte (checkout, facturación de subasta,
  facturación de sorteo), igual que ya se congela `commission_amount`. Filas
  existentes se backfillean a `'art_rebu'` (todo el histórico era REBU);
  lecturas defensivas con `COALESCE(vat_regime, 'art_rebu')`. Cambiar el tipo
  de un vendedor solo afecta a ventas futuras.
- **Acreditación del monedero por régimen del item** (no por tipo de
  producto): los 3 puntos de confirmación de `ordersController`, los débitos
  por cancelación/reembolso y `confirmationScheduler` eligen la bolsa según el
  `vat_regime` del item. El arte de artistas al 21% se acredita en
  `available_withdrawal_standard_vat`. **Los importes acreditados no cambian**
  (siguen siendo `price_at_purchase − commission_amount`).
- **Payouts (Stripe Connect):** una retirada `art_rebu` incluye solo items de
  arte REBU; una retirada `standard_vat` incluye `other_order_items` + items
  de arte con régimen estándar + `event_attendees`. El cálculo de IVA de la
  plataforma sobre su comisión no cambia (21% en ambos regímenes).
- **Motor de facturas PDF:** la factura de comprador Serie A (REBU, sin
  desglose de IVA) incluye solo los items de arte REBU del pedido; la Serie P
  (estándar, IVA 21% desglosado) incluye también los items de arte de régimen
  estándar. Series C y L sin cambios de fondo (la C puede llevar ahora líneas
  de arte).
- **Informe fiscal (gestoría):** `inferInvoicingMode` deja de hardcodear
  "(10% obras de arte, 21% otros)" y usa los tipos configurados del vendedor.
- **Exposición al cliente (sin env):** `GET /api/seller/commission-rates` y
  `GET /api/seller/wallet` devuelven también `taxVatArt`, `taxVatOther` y el
  régimen de arte derivado; el endpoint admin `edit-data` devuelve los tipos
  del dueño del producto.
- **Vista previa netEarnings (`ProductForm`, modos create y edit):** usa los
  tipos por vendedor servidos por la API en lugar de
  `NEXT_PUBLIC_TAX_VAT_ES` / `NEXT_PUBLIC_TAX_VAT_ART_ES`.
- **UI admin de autores:** ver y editar los dos tipos de IVA por autor
  (validación Zod, rango [0, 100]), junto a las comisiones.
- **UI Monedero:** las bolsas conservan sus etiquetas (describen el régimen);
  cuando el régimen de arte del vendedor es estándar, se indica que sus obras
  se acumulan en la bolsa estándar.
- **Limpieza de configuración:** se eliminan `NEXT_PUBLIC_TAX_VAT_ES` y
  `NEXT_PUBLIC_TAX_VAT_ART_ES` de todo el pipeline de build (env.example ×2,
  Dockerfiles ×2, docker-compose ×3) y `TAX_VAT_ART_ES` de la API (su registro
  `vatArtEs` no tiene ningún consumidor). `TAX_VAT_ES` **se conserva** solo
  para los metadatos de line items de Revolut (ruta legacy; decisión explícita
  del usuario de dejarla como está).

## Capabilities

### New Capabilities
- `per-seller-vat-rates`: columnas `tax_vat_art` / `tax_vat_other` en `users`,
  su edición por admin y exposición al vendedor, la regla de derivación del
  régimen fiscal (10 → REBU, resto → estándar), y el snapshot
  `art_order_items.vat_regime` que congela el régimen por venta.

### Modified Capabilities
- `seller-net-earnings-preview`: la vista previa usa los tipos de IVA
  por-vendedor obtenidos de la API (create: seller; edit: dueño del producto)
  en lugar de las `NEXT_PUBLIC_TAX_VAT_*`.
- `seller-wallet`: la bolsa de destino de cada crédito/débito se decide por el
  `vat_regime` del item (snapshot), no por el tipo de producto; el wallet
  expone los tipos y el régimen de arte del vendedor; nota en el dashboard
  para artistas de régimen estándar.
- `stripe-connect-payouts`: las queries de items pendientes seleccionan por
  `vat_regime` del item; una retirada `standard_vat` puede contener items de
  arte (`item_type = 'art_order_item'`).
- `stripe-connect-fiscal-report`: la explicación de facturación usa los tipos
  configurados del vendedor en lugar de porcentajes fijos.
- `pdf-invoice-engine`: la clasificación Serie A / Serie P de los items de
  arte se hace por su `vat_regime`, no por la tabla de origen.
- `auction-bid-billing`: el INSERT de facturación congela `vat_regime` según
  el `tax_vat_art` del vendedor del producto subastado.
- `draw-billing`: ídem para el producto sorteado.
- `admin-product-edit`: `GET /api/admin/products/:id/edit-data` devuelve
  también los tipos de IVA del dueño para la vista previa de neto.

## Impact

- **Database (`api/config/database.js`):** 2 columnas en `users` + 1 columna
  en `art_order_items` (CREATE TABLE + `safeAlter`) + backfill idempotente de
  `vat_regime` a `'art_rebu'`.
- **Backend:** `utils/vatRegime.js` (nuevo), `ordersController.js` (checkout
  snapshot + 3 créditos + débitos de cancelación), `confirmationScheduler.js`,
  `auctionAdminController.js`, `drawAdminController.js`,
  `stripeConnectPayoutsController.js`, `services/invoiceService.js`,
  `utils/fiscalReportFormatter.js`, `routes/sellerRoutes.js` (wallet +
  commission-rates), `routes/admin/authorRoutes.js`,
  `controllers/adminProductEditController.js`,
  `validators/authorSchemas.js`, `validators/stripeConnectPayoutsSchemas.js`,
  `config/env.js` (retirar `vatArtEs`).
- **Frontend:** `components/ProductForm.js`, `app/orders/page.js`,
  `app/admin/authors/[id]/page.js`, `app/admin/authors/[id]/edit/page.js`,
  `app/admin/products/[id]/edit/page.js`, `lib/api.js`.
- **Infra/config:** retirar `NEXT_PUBLIC_TAX_VAT_*` de `.env.example` (raíz),
  `client/.env.example`, `client/Dockerfile.staging`, `client/Dockerfile.prod`,
  `docker-compose.prod.yml`, `docker-compose.pre2.yml`, `docker-compose.m1.yml`
  y de los `.env` locales; retirar `TAX_VAT_ART_ES` de `api/.env.example` y
  `.env` locales de la API.
- **Tests:** nuevo test del helper de régimen; actualizar
  `fiscalReportFormatter.test.js` (textos de `inferInvoicingMode`).
- **Docs:** CLAUDE.md / GEMINI.md (sección de variables de entorno).

## Non-goals

- No se recalculan ventas históricas: `vat_regime` se congela por item al
  crearlo y el backfill marca todo el histórico como REBU (era el único
  régimen posible hasta ahora).
- Los metadatos de line items enviados a Revolut siguen usando `TAX_VAT_ES`
  plano (ruta legacy, solo informativa; Stripe es el proveedor primario).
- No cambia el IVA de la plataforma sobre su comisión (21% en ambos
  regímenes, `vatCalculator.js` intacto).
- No se toca `irpf_retention_rate` ni el resto de datos fiscales del artista.
- No hay IVA por producto individual ni por país (solo por vendedor y tipo de
  producto, España).
- Los emails no cambian: sus etiquetas ya describen el régimen de la bolsa o
  de la retirada, que siguen siendo correctas.
