# Tasks: art-limited-editions

## 1. Esquema de base de datos

- [x] 1.1 Añadir `edition_size` (INTEGER NOT NULL DEFAULT 1) y `editions_sold` (INTEGER NOT NULL DEFAULT 0) al CREATE TABLE de `art` en `api/config/database.js` + `safeAlter` para bases existentes
- [x] 1.2 Añadir backfill idempotente: `UPDATE art SET editions_sold = 1 WHERE is_sold = 1 AND editions_sold = 0`
- [x] 1.3 Añadir `inventory_released_at` (DATETIME) al CREATE TABLE de `orders` + `safeAlter`
- [x] 1.4 Añadir `edition_number` (INTEGER nullable) al CREATE TABLE de `nfc_tags` + `safeAlter`

## 2. Reserva y liberación de inventario (checkout)

- [x] 2.1 `ordersController.placeOrder`: sustituir la reserva de arte (`SET is_sold = 1 ... WHERE is_sold = 0`) por el incremento guardado de `editions_sold` con `is_sold` derivado en la misma sentencia (batch + verificación `rowsAffected`)
- [x] 2.2 `ordersController.placeOrder`: sustituir los rollbacks de reserva (líneas ~402 y ~420) por el decremento guardado
- [x] 2.3 `inventoryService.releaseOrderInventory`: reclamar la liberación con `UPDATE orders SET inventory_released_at = CURRENT_TIMESTAMP WHERE id = ? AND inventory_released_at IS NULL` y abortar sin tocar inventario si `rowsAffected = 0`; sustituir el reset de arte por el decremento guardado
- [x] 2.4 `ordersController.verifyPayment` (vía legacy, ~línea 2877): eliminar el re-marcado `is_sold = 1` de arte (la reserva de `placeOrder` es el único punto de consumo del checkout); dejar intacto el manejo de variantes
- [x] 2.5 Tests (`api/tests/`): reserva concurrente del último ejemplar, reserva con ejemplares de sobra, rechazo por edición agotada, doble liberación del mismo pedido, verifyPayment no toca el contador

## 3. Publicación y edición de productos

- [x] 3.1 `productSchemas.js`: aceptar `edition_size` opcional (entero 1–1000, default 1) en el schema de creación de arte
- [x] 3.2 `artController.createArtProduct`: persistir `edition_size` en el INSERT; incluir `edition_size` en las respuestas públicas (listado y detalle)
- [x] 3.3 `adminProductEditController`: ignorar/descartar `edition_size` en el full-update de arte (inmutable, como `slug` y `status`)
- [x] 3.4 `ProductForm.js`: campo "Nº de ejemplares de la edición" (default 1) solo en modo creación; en modo edición admin mostrar "Edición limitada de N ejemplares" como texto de solo lectura cuando `edition_size > 1` y no enviar el campo
- [x] 3.5 `sellerRoutes.js`: calcular `total_stock` de arte como `edition_size - editions_sold`
- [x] 3.6 Ficha pública `galeria/p/[id]`: mostrar "Edición limitada de N ejemplares" cuando `edition_size > 1` (texto es-ES en `client/lib/constants.js`)

## 4. Sorteos

- [x] 4.1 `drawAdminController`/`drawService` (create/update): validar para arte que `units ≤ edition_size - editions_sold`, con 400 y mensaje es-ES
- [x] 4.2 `drawAdminController.billParticipation`: rechazar con 409 si las participaciones ya facturadas del sorteo alcanzan `units`
- [x] 4.3 `billParticipation`: consumir un ejemplar con el incremento guardado antes del cobro Stripe (409 si `rowsAffected = 0`); liberar con el decremento guardado si el cobro lanza excepción o falla
- [x] 4.4 Tests: tope de `units`, edición agotada, liberación tras cobro fallido, `requires_action` mantiene la reserva

## 5. Subastas

- [x] 5.1 `auctionScheduler.processAuctionEnd`: sustituir `UPDATE art SET is_sold = 1` por el incremento guardado; loguear error estructurado si `rowsAffected = 0` (edición agotada); sin cambios para `others`
- [x] 5.2 Test: adjudicación sobre edición no marca `is_sold` hasta agotar; adjudicación sobre obra única mantiene el comportamiento actual

## 6. CoA / NFC

- [x] 6.1 `coaController.verifyCoa`: añadir `edition_size` y `edition_number` a la query (JOIN ya existente) y a la respuesta OK
- [x] 6.2 `client/app/coa/page.js`: mostrar "Edición Limitada. Ejemplar n de N" cuando `edition_size > 1` (fallback "Edición limitada de N ejemplares" si `edition_number` es NULL); textos en `client/lib/constants.js`
- [x] 6.3 `coaAdminController` (list + detail): incluir `edition_number` y `edition_size` en las respuestas
- [x] 6.4 `admin/coa` (listado) y `admin/coa/[uid]` (detalle): mostrar "Ejemplar n de N" cuando aplique
- [x] 6.5 `scripts/nfc-personalization/src/personalize.js` + `lib/db.js`: guard por número de tags activos < `edition_size`; prompt de número de ejemplar (1..N) con rechazo de duplicados activos; insertar `edition_number`; `serial_label` con formato `GAL-YYYY-XXXX-n/N` para ediciones
- [x] 6.6 Tests de CoA (`coaController.test.js`, `coaAdminController.test.js`): edición en respuesta de verify y admin; varias filas activas por `art_id`

## 7. Documentación y cierre

- [x] 7.1 Actualizar `CLAUDE.md`: sección de ediciones limitadas (regla "is_sold de arte solo se escribe junto a editions_sold", puntos de consumo por canal, NFC multi-etiqueta)
- [x] 7.2 Actualizar `scripts/nfc-personalization/README.md` con el flujo de ediciones
- [x] 7.3 Ejecutar la suite completa de tests del API — 15/15 suites unitarias en verde (135 tests). Los 4 tests de integración (`auth`, `orders`, `products`, `productMultiImage`) fallan **igual que en baseline** (comparado con `git stash`): fallos preexistentes del entorno, sin regresiones. Esquema verificado en la BD de preprod: `art.edition_size`, `art.editions_sold`, `orders.inventory_released_at`, `nfc_tags.edition_number` presentes; backfill coherente (0 filas con `is_sold=1 AND editions_sold=0` sobre 30 obras)
- [ ] 7.4 **[Requiere acción del usuario]** Validar manualmente en preprod con la artista `aka.alicia@axgalache.me`: publicar una tirada de prueba, comprar un ejemplar, comprobar que la obra sigue visible, crear un sorteo con `units`, y personalizar/verificar una etiqueta CoA numerada
