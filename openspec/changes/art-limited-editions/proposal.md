# Proposal: art-limited-editions

## Why

Hasta ahora cada fila de `art` representaba una obra física única: la reserva de inventario es un flag binario (`is_sold`) y toda la lógica asume una sola unidad vendible. Una nueva artista de la galería publicará impresiones de collage digital con edición limitada (p. ej. 15 ejemplares), un caso que el modelo actual no puede representar: habría que duplicar 15 productos idénticos con rotación manual de visibilidad, slugs artificiales y 15 certificados/etiquetas NFC apuntando a filas distintas.

## What Changes

- **Modelo de edición en fila única (opción C):** se añaden a `art` las columnas `edition_size` (tamaño de la tirada, default 1, inmutable tras la creación) y `editions_sold` (ejemplares reservados/vendidos). `is_sold` conserva su semántica de "agotada": pasa a ser un derivado mantenido atómicamente (`editions_sold >= edition_size`), por lo que todos sus lectores actuales (filtro de galería, badge de vendida, elegibilidad de subastas, dashboard del seller) siguen funcionando sin cambios. Con `edition_size = 1` el comportamiento es idéntico al actual.
- **Reserva/liberación de inventario por contador:** la reserva atómica del checkout pasa de `SET is_sold = 1 ... WHERE is_sold = 0` a un incremento guardado de `editions_sold` (con actualización de `is_sold` en la misma sentencia); la liberación (pago fallido/expirado/cancelado) pasa a decremento guardado. El paso legacy de `verifyPayment` que re-marcaba `is_sold = 1` (idempotente con flag, no con contador) se elimina para el arte ya reservado.
- **Publicación:** el seller fija `edition_size` al publicar (`/seller/publish`, ProductForm). El valor es inmutable: el formulario de edición del admin lo muestra en solo lectura y el backend rechaza su modificación.
- **Ficha pública:** las obras con `edition_size > 1` muestran "Edición limitada de N ejemplares" (sin revelar el remanente disponible). Un mismo usuario puede comprar ejemplares distintos en pedidos sucesivos (sin bloqueo por historial); el carrito sigue impidiendo añadir dos veces la misma obra.
- **Sorteos:** la columna existente `draws.units` pasa a estar aplicada de verdad: la facturación de cada ganador consume un ejemplar (incremento guardado), se valida que `units` no exceda los ejemplares disponibles al crear/editar el sorteo, y se rechaza facturar más participaciones que `units` (cierre de un hueco preexistente).
- **Subastas:** una subasta adjudica exactamente un ejemplar; el scheduler que marcaba `is_sold = 1` incondicionalmente al terminar pasa al incremento guardado.
- **CoA / NFC multi-etiqueta:** `nfc_tags` gana `edition_number`; el script de personalización permite hasta `edition_size` etiquetas activas por obra (hoy el guard rechaza la segunda), pregunta el número de ejemplar y graba `serial_label` con formato `GAL-<año>-<artId>-<n/N>`. La página pública `/coa` y el admin de CoA muestran "Edición Limitada. Ejemplar n de N".

## Capabilities

### New Capabilities

- `art-limited-editions`: modelo de datos de ediciones limitadas en `art` (`edition_size`, `editions_sold`, semántica derivada de `is_sold`), fijación inmutable de la tirada en la publicación, visualización "Edición limitada de N ejemplares" en la ficha pública y disponibilidad restante en el dashboard del seller.

### Modified Capabilities

- `concurrent-purchase-protection`: la reserva atómica y la liberación de inventario para arte pasan de flag binario a contador de ediciones guardado; se elimina el re-marcado legacy en la verificación de pago.
- `draw-billing`: la facturación de una participación ganadora consume un ejemplar de la edición de forma atómica y se rechaza cuando ya se facturaron `units` participaciones o no quedan ejemplares.
- `draw-management`: la creación/edición de sorteos valida `units` contra los ejemplares disponibles del producto (`edition_size - editions_sold` para arte).
- `auction-bid-billing`: la adjudicación al terminar la subasta consume exactamente un ejemplar (incremento guardado en el scheduler) en lugar de marcar `is_sold = 1` incondicionalmente.
- `admin-product-edit`: el formulario de edición admin muestra `edition_size` en solo lectura y el endpoint de actualización rechaza modificarlo.
- `nfc-tag-personalization`: se permite personalizar hasta `edition_size` etiquetas activas por obra, con captura del número de ejemplar y nuevo formato de `serial_label`.
- `coa-nfc-verification`: `nfc_tags` incorpora `edition_number`; la respuesta de verificación y la página pública `/coa` incluyen "Edición Limitada. Ejemplar n de N" cuando aplica. Además el requisito de la página `/coa` se pone al día con la implementación real, que había divergido desde el commit fundacional del CoA: (a) se documenta el campo `art.artistName` (de `users.full_name` vía `art.seller_id`), que la implementación devuelve y la página muestra pero la spec nunca recogió — el desajuste dejaba el test de la proyección en rojo desde su creación; (b) el logo de la galería lo aporta el `Navbar` global, no `<CoaSuccess>`, que deliberadamente no duplica cabecera de marca; (c) la cabecera son dos elementos (badge "Certificado verificado" + título "Certificado de Autenticidad"), no el título único "Certificado de Autenticidad verificado ✓" que describía la spec.
- `coa-admin-frontend`: el listado y el detalle de tags muestran el número de ejemplar de cada etiqueta.

## Impact

- **BD (`api/config/database.js`):** columnas nuevas `art.edition_size`, `art.editions_sold`, `nfc_tags.edition_number` (vía `safeAlter` + CREATE TABLE actualizado).
- **Backend:** `ordersController.js` (reserva/rollback en `placeOrder`, paso legacy de `verifyPayment`), `inventoryService.js` (liberación), `drawAdminController.js` + `drawService.js` (facturación y validación de `units`), `auctionScheduler.js` (adjudicación), `artController.js` (creación con `edition_size`, respuesta pública), `adminProductEditController.js` (inmutabilidad), `sellerRoutes.js` (stock restante), `coaController.js` + `coaAdminController.js` (edición en respuestas), `productSchemas.js` y `drawSchemas`/validators.
- **Frontend:** `ProductForm.js` (campo tirada), ficha `galeria/p/[id]` (texto de edición), `admin/products/[id]/edit` (solo lectura), `app/coa/page.js` y `admin/coa/*` (ejemplar n de N), `lib/constants.js` (textos es-ES).
- **Scripts:** `scripts/nfc-personalization/src/personalize.js` y `lib/db.js` (guard por edición, prompt de ejemplar, serial).
- **Riesgo principal:** el paso de un flag idempotente a un contador no idempotente — hay que garantizar que ningún camino incrementa/decrementa dos veces (reserva vs verificación de pago, doble liberación). Concentrar tests ahí (`api/tests/`).
- **Sin impacto:** wallet/payouts, facturas Serie A/P, export fiscal, emails y envíos — ya operan sobre snapshots per-item de `art_order_items` y soportan N pedidos por `art_id`.
