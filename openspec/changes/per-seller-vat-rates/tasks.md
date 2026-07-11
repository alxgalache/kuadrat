# Tasks — per-seller-vat-rates

## 1. Esquema y helper de régimen

- [x] 1.1 `api/config/database.js`: añadir `tax_vat_art REAL NOT NULL DEFAULT 10` y `tax_vat_other REAL NOT NULL DEFAULT 21` al `CREATE TABLE users` (junto a `dealer_commission_*`)
- [x] 1.2 `api/config/database.js`: añadir los dos `safeAlter('ALTER TABLE users ADD COLUMN ...')` correspondientes
- [x] 1.3 `api/config/database.js`: añadir `vat_regime TEXT` al `CREATE TABLE art_order_items` + `safeAlter` para DBs existentes
- [x] 1.4 `api/config/database.js`: backfill idempotente tras el safeAlter: `UPDATE art_order_items SET vat_regime = 'art_rebu' WHERE vat_regime IS NULL` (log con contador de filas)
- [x] 1.5 Crear `api/utils/vatRegime.js`: `REBU_ART_VAT_RATE = 10`, `artVatRegimeForRate(rate)` (Number(rate) === 10 → 'art_rebu', si no 'standard_vat'); exportar ambos
- [x] 1.6 Crear `api/tests/vatRegime.test.js`: casos 10 → art_rebu; 21/0/15/'10' (string) → según regla; null/undefined → standard_vat (documentar decisión en el helper)

## 2. Snapshot del régimen al crear items de arte

- [x] 2.1 `api/controllers/ordersController.js` (checkout): añadir `tax_vat_art` al SELECT de vendedores (~línea 457) y escribir `vat_regime` derivado en el INSERT de `art_order_items` (~472-495)
- [x] 2.2 `api/controllers/auctionAdminController.js`: añadir `u.tax_vat_art` al SELECT de billing (vía `auctionService.getBidBillingData`) y `vat_regime` al INSERT de `art_order_items` (~708) cuando el producto es arte
- [x] 2.3 `api/controllers/drawAdminController.js`: ídem para el sorteo — `tax_vat_art` en el SELECT de billing (vía `drawService.getParticipationBillingData`) y `vat_regime` en el INSERT de `art_order_items` (~360)
- [x] 2.4 Verificar con `rg "INSERT INTO art_order_items"` que no existe ningún otro punto de inserción sin snapshot

## 3. Acreditación y débito del monedero por régimen del item

- [x] 3.1 `ordersController.js` — confirmación por seller (~1675-1710): añadir `vat_regime` al SELECT cuando la tabla es `art_order_items` y elegir bolsa por `COALESCE(vat_regime,'art_rebu')` (items `other` siguen a estándar)
- [x] 3.2 `ordersController.js` — confirmación pública por item (~2165-2208): mismo cambio
- [x] 3.3 `ordersController.js` — confirmación pública del pedido completo (~2284-2368): añadir `aoi.vat_regime` al SELECT de items de arte y agrupar créditos por `(sellerId, bolsa)` en lugar de por tabla
- [x] 3.4 `ordersController.js` — débitos por cancelación/reembolso (~2441-2600): añadir `vat_regime` a los SELECT de items de arte y debitar la bolsa que corresponde al snapshot (simétrico al crédito)
- [x] 3.5 `api/scheduler/confirmationScheduler.js`: añadir `aoi.vat_regime` a la query de items de arte y elegir bolsa por snapshot en lugar de por tabla
- [x] 3.6 Confirmar que `eventCreditScheduler.js` no necesita cambios (siempre estándar) y actualizar su comentario si menciona el mapeo arte→REBU

## 4. Payouts (stripeConnectPayoutsController)

- [x] 4.1 `loadPendingOrderItems`: filtrar por régimen — art_rebu: tabla `art_order_items` + `AND COALESCE(i.vat_regime,'art_rebu') = 'art_rebu'`; standard: `other_order_items` sin filtro
- [x] 4.2 Nueva carga de items de arte estándar (tabla `art_order_items` + `vat_regime = 'standard_vat'`, `item_type='art_order_item'`) e incluirla en `loadPendingItems('standard_vat')` junto a others y event attendees
- [x] 4.3 Revisar los helpers `itemTypeFor`/`itemTableFor`/`productJoinFor`: eliminar la asunción régimen→una-tabla; las filas siempre viajan autoetiquetadas con `item_type` (fallbacks solo donde sea imprescindible)
- [x] 4.4 `api/validators/stripeConnectPayoutsSchemas.js` + preview/execute: aceptar `art_item_ids` opcional (solo `standard_vat`) y pasarlo como restricción de la nueva carga; `item_ids` conserva su semántica actual
- [x] 4.5 Verificar que el execute inserta `withdrawal_items` con `item_type='art_order_item'` y `vat_regime='standard_vat'` para arte estándar, y que la reversión (fail path) restaura la bolsa correcta
- [x] 4.6 Verificar que `api/utils/itemDescription.js` (`describeBatch`) resuelve descripciones de items de arte dentro de un payout estándar
- [x] 4.7 Verificar que `client/app/admin/payouts/[sellerId]/page.js` y `ConfirmPayoutModal` renderizan filas `art_order_item` en la bolsa estándar (código por `item_type`; ajustar si asume tabla por régimen)

## 5. Motor de facturas PDF

- [x] 5.1 `api/services/invoiceService.js` — `loadArtOrderItems`: incluir `COALESCE(vat_regime,'art_rebu') AS vat_regime` en el SELECT
- [x] 5.2 `generateBuyerRebuInvoice` (Serie A): incluir solo items de arte con régimen `art_rebu`; 400 si el pedido no tiene ninguno
- [x] 5.3 `generateBuyerStandardInvoice` (Serie P): incluir items `other` + items de arte con régimen `standard_vat` (desglose base + IVA 21% igual que las líneas actuales); 400 si no hay items estándar
- [x] 5.4 `api/controllers/invoiceController.js` — `getBuyerInvoice`: elegir Serie A/P por presencia de items de cada régimen (no por tabla)
- [x] 5.5 Admin pedidos (`client/app/admin/pedidos/[id]`): mostrar los botones "Descargar factura REBU" / "Descargar factura IVA 21%" según el régimen de los items del pedido (la API debe exponer el dato en el detalle del pedido admin si aún no llega)
- [x] 5.6 Verificar que Serie C (comisión, payouts estándar) renderiza líneas de arte correctamente (importes ya persistidos en `withdrawal_items`) y que Serie L (liquidación REBU) queda intacta

## 6. Informe fiscal (gestoría)

- [x] 6.1 `api/utils/fiscalReportFormatter.js` — `inferInvoicingMode(user)`: componer la explicación con `tax_vat_art`/`tax_vat_other` del vendedor (sin "(10% obras de arte, 21% otros)" fijo), manteniendo autonomo/sociedad/error
- [x] 6.2 Añadir `tax_vat_art, tax_vat_other` al SELECT del bloque de vendedor del informe
- [x] 6.3 Actualizar `api/tests/fiscalReportFormatter.test.js` (textos de explicación + caso vendedor 21/21)

## 7. Exposición por API

- [x] 7.1 `api/routes/sellerRoutes.js` — `GET /wallet`: añadir `tax_vat_art, tax_vat_other` al SELECT y devolver `taxVatArt`, `taxVatOther`, `artVatRegime` (derivado con el helper)
- [x] 7.2 `api/routes/sellerRoutes.js` — `GET /commission-rates`: añadir las dos columnas al SELECT y devolver `taxVatArt`, `taxVatOther`
- [x] 7.3 `api/controllers/adminProductEditController.js` — edit-data: devolver `tax_rates: { art, other }` del dueño junto a `commission_rates`
- [x] 7.4 `api/routes/admin/authorRoutes.js` — GET del autor: añadir `tax_vat_art, tax_vat_other` al SELECT de respuesta
- [x] 7.5 `api/routes/admin/authorRoutes.js` — PUT del autor: aceptar y persistir ambos campos (patrón `!== undefined ? Number(...) : existente`, como las comisiones) y devolverlos
- [x] 7.6 `api/validators/authorSchemas.js`: añadir `tax_vat_art` y `tax_vat_other` opcionales con validador porcentual [0, 100] (espejo de `commissionPercent`)

## 8. Frontend

- [x] 8.1 `client/components/ProductForm.js`: estado `taxRates {art, other}`; en create llenarlo desde `sellerAPI.getCommissionRates()` (nuevos campos); en edit desde la nueva prop `initialTaxRates`; eliminar las lecturas de `process.env.NEXT_PUBLIC_TAX_VAT_*`; la vista previa solo se muestra con comisión + IVA de la categoría activa cargados; `vatPercent` = tipo del vendedor
- [x] 8.2 `client/app/admin/products/[id]/edit/page.js`: pasar `initialTaxRates` desde `tax_rates` del edit-data
- [x] 8.3 `client/app/admin/authors/[id]/edit/page.js`: dos inputs numéricos (0-100, step 0.01) junto a las comisiones, con ayuda es-ES: "10 = autor (REBU) · otro valor (p. ej. 21) = facturación vía cooperativa (régimen general). Solo afecta a ventas futuras."
- [x] 8.4 `client/app/admin/authors/[id]/page.js`: mostrar los dos tipos de IVA junto a las comisiones
- [x] 8.5 `client/app/orders/page.js`: leer `taxVatArt`/`taxVatOther`/`artVatRegime` del wallet; cuando `artVatRegime === 'standard_vat'`, nota bajo la bolsa estándar ("Incluye tus obras de arte (IVA 21%)") en el panel y en el modal de solicitud
- [x] 8.6 `client/lib/api.js`: verificar que el PUT de autores del admin pasa los campos nuevos (el body suele ser passthrough) y que no hay que tocar `getWallet`/`getCommissionRates` (respuestas ampliadas)

## 9. Limpieza de configuración y docs

- [x] 9.1 Eliminar `NEXT_PUBLIC_TAX_VAT_ES` y `NEXT_PUBLIC_TAX_VAT_ART_ES` de `/.env.example` y `client/.env.example`
- [x] 9.2 Eliminarlas de `client/Dockerfile.staging` y `client/Dockerfile.prod` (ARG + ENV)
- [x] 9.3 Eliminarlas de `docker-compose.prod.yml`, `docker-compose.pre2.yml` y `docker-compose.m1.yml` (build.args del servicio client)
- [x] 9.4 Eliminarlas de los `.env` locales (raíz, `client/.env`, `client/.env.local` si existen)
- [x] 9.5 `api/config/env.js`: eliminar `vatArtEs` (sin consumidores); dejar `vatEs`/`TAX_VAT_ES` con comentario "solo metadatos Revolut legacy (ordersController.placeOrder)"
- [x] 9.6 `api/.env.example` y `.env` locales de la API: eliminar `TAX_VAT_ART_ES`; comentar el uso restante de `TAX_VAT_ES`
- [x] 9.7 Actualizar CLAUDE.md (y la línea equivalente de GEMINI.md): IVA por vendedor en `users.tax_vat_art/tax_vat_other`, regla de derivación del régimen, snapshot `art_order_items.vat_regime`, y estado legacy de `TAX_VAT_ES`
- [x] 9.8 `rg "TAX_VAT"` global: solo deben quedar el uso Revolut de la API y sus comentarios/env

## 10. Verificación end-to-end

- [~] 10.1 Ejecutar la suite de tests de la API (`npm test` en `api/`) — vatRegime, fiscalReportFormatter, vatCalculator, invoiceNumbering, pdfGenerator en verde
      · vatRegime (nuevo, 8 casos) y vatCalculator (17 en total con vatRegime) verdes en este entorno.
      · fiscalReportFormatter/invoiceNumbering/pdfGenerator NO ejecutados aquí: `api/node_modules` es propiedad de root y está vacío (las deps viven en el contenedor Docker); no se puede `npm install` en este sandbox. Ejecutar `npm test` dentro del contenedor.
- [ ] 10.2 Arranque con DB existente: columnas creadas por safeAlter, backfill aplicado (log), segunda ejecución no-op
- [ ] 10.3 Flujo autor (tipo 10): publicar arte → preview 10% → comprar → confirmar → crédito en bolsa REBU → payout art_rebu → factura Serie A — idéntico a hoy
- [ ] 10.4 Flujo cooperativa (tipo 21): admin fija `tax_vat_art=21` → publicar arte → preview 21% → comprar → confirmar → crédito en bolsa estándar → payout standard_vat con la obra listada → factura comprador Serie P con IVA desglosado → export fiscal etiqueta estándar
- [ ] 10.5 Cambio de tipo con ventas pendientes: vender con tipo 10, cambiar a 21 antes de confirmar → el item conserva REBU (bolsa y payout); las ventas nuevas van a estándar
- [ ] 10.6 Cancelación/reembolso de un item estándar de arte debita la bolsa estándar
- [ ] 10.7 Monedero: artista 21 ve la nota en la bolsa estándar; artista 10 ve el panel idéntico a hoy
