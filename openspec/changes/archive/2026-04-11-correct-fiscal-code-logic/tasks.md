# Tareas: Corrección de la lógica fiscal en el código

## Fase 1: Cambios críticos de lógica

- [x] **T1: Corregir VAT_RATE_REBU en vatCalculator.js** — Cambiar `VAT_RATE_REBU = 0.10` a `0.21` (línea 33). Actualizar comentarios que mencionan "10%" en el mismo fichero (líneas 9, 14, 45 aprox). La fórmula `taxableBase = commission / (1 + rate)` NO cambia.

- [x] **T2: Eliminar particular/autofactura de inferInvoicingMode en fiscalReportFormatter.js** — Eliminar el bloque `if (user.tax_status === 'particular')` completo (líneas 164-177). Eliminar las entradas `autofactura` y `pending_agreement` del diccionario `INVOICING_MODE_LABEL_ES` (líneas 48, 50). El JSDoc del return type debe cambiar de `'autofactura'|'factura_recibida'|'pending_agreement'|'error'` a `'factura_recibida'|'error'`.

- [x] **T3: Corregir dirección de facturación en fiscalReportFormatter.js** — Actualizar las explicaciones de `inferInvoicingMode` para autónomo (línea 182) y sociedad (línea 189). NUEVO TEXTO autónomo: `'El artista autónomo emite factura a 140d por su parte de la venta (precio − comisión) con el IVA correspondiente (10% obras de arte, 21% otros). Para productos estándar, 140d emite factura al artista por la comisión con IVA del 21%.'`. NUEVO TEXTO sociedad: `'La sociedad artística emite factura a 140d por su parte de la venta (precio − comisión) con el IVA correspondiente (10% obras de arte, 21% otros). Para productos estándar, 140d emite factura a la sociedad por la comisión con IVA del 21%.'`

- [x] **T4: Eliminar autofactura de buildSellerBlock y queries en fiscalReportFormatter.js** — Eliminar `autofactura_agreement_signed_at` de: (a) `buildSellerBlock` return object (línea 240), (b) SELECT en `loadSellerUserById` (línea 326), (c) SELECT en `loadSellerUsersByIds` (línea 349), (d) fila CSV "Acuerdo autofacturación" (líneas 684-690).

- [x] **T5: Corregir schema de base de datos en database.js** — (a) Eliminar `'particular'` del CHECK constraint de `tax_status` en el CREATE TABLE de users (línea 55 aprox) → `CHECK(tax_status IN ('autonomo','sociedad'))`. (b) Eliminar la columna `autofactura_agreement_signed_at DATETIME` del CREATE TABLE (línea 65 aprox). (c) Eliminar el `safeAlter` que añade la columna autofactura (línea 657 aprox). (d) Añadir un nuevo `safeAlter` para `DROP COLUMN autofactura_agreement_signed_at` siguiendo el patrón existente.

- [x] **T6: Corregir validadores Zod en fiscalSchemas.js** — (a) Eliminar `'particular'` de `z.enum(['autonomo', 'sociedad', 'particular'])` → `z.enum(['autonomo', 'sociedad'])` (línea 23 aprox). (b) Eliminar el campo `autofactura_agreement_signed: z.boolean().optional()` (línea 33 aprox).

- [x] **T7: Eliminar lógica autofactura del controlador usersController.js** — Eliminar toda la lógica de `autofactura_agreement_signed` del endpoint `updateSellerFiscalData` (líneas 127-216): eliminar del destructuring de `req.body`, eliminar la lógica de timestamp condicional, eliminar de la query UPDATE SQL (SET y args), eliminar del objeto response.

- [x] **T8: Limpiar formulario SellerFiscalForm.js** — (a) Cambiar default de `tax_status` de `'particular'` a `'autonomo'` en los estados iniciales (líneas 32, 48). (b) Eliminar `<option value="particular">Particular</option>` del select (línea 182). (c) Eliminar todo el bloque del checkbox "acuerdo de autofacturación" (líneas ~340-373). (d) Eliminar las refs a `autofactura_agreement_signed` del state, effect, handleChange, handleSubmit (líneas 42, 61, 88-89, 142). (e) Eliminar el comentario sobre autofacturas (línea 8 aprox).

- [x] **T9: Eliminar autofactura de query admin en authorRoutes.js** — Eliminar `autofactura_agreement_signed_at` del SELECT de la ruta GET /admin/authors/:id (línea 210).

## Fase 2: Actualización de tests

- [x] **T10: Recalcular valores REBU en vatCalculator.test.js** — Actualizar todos los valores esperados en los tests de REBU que usan divisor 1.10 a divisor 1.21. Ejemplo: comisión 100€ → `taxableBase` pasa de 90.91 a 82.64, `vatAmount` pasa de 9.09 a 17.36. Actualizar también las descripciones que mencionan "10%". Los tests de productos estándar NO cambian.

- [x] **T11: Actualizar tests de fiscalReportFormatter.test.js** — (a) Eliminar el test "autofactura for particular with agreement" (líneas 20-28 aprox). (b) Eliminar el test "pending_agreement for particular without agreement" (líneas 30-37 aprox). (c) Añadir nuevo test: `tax_status = 'particular'` debe retornar `mode: 'error'`. (d) Actualizar los assertions de explicación para autónomo y sociedad con los nuevos textos de T3.

## Fase 3: Etiquetas UI "REBU 10%" → "Arte (REBU)"

- [x] **T12: Actualizar etiquetas en ConfirmPayoutModal.js** — Cambiar "REBU 10%" a "Arte (REBU)" en línea 33.

- [x] **T13: Actualizar etiquetas en payouts/page.js** — Cambiar "REBU 10%" a "Arte (REBU)" en líneas 44, 136, 383.

- [x] **T14: Actualizar etiquetas en payouts/[sellerId]/page.js** — Cambiar "REBU 10%" a "Arte (REBU)" en línea 58.

- [x] **T15: Actualizar etiquetas en orders/page.js** — Cambiar "REBU 10%" a "Arte (REBU)" en líneas 236, 555, 649.

- [x] **T16: Actualizar etiquetas en emailService.js** — Cambiar "REBU 10%" a "Arte (REBU)" en líneas 1812, 1862, 3117.

## Fase 4: Notas de IVA en formularios de precios

- [x] **T17: Añadir nota IVA en formulario de edición de productos** — En `client/app/admin/products/[id]/edit/page.js`, añadir texto informativo "El precio introducido incluye un IVA del 21%" bajo el campo de precio (línea 252 aprox). Mostrar solo cuando `product?.product_type === 'other'`. Usar estilo `text-sm text-gray-500` consistente con el diseño del formulario.

- [x] **T18: Añadir nota IVA en formulario de nuevo evento** — En `client/app/admin/espacios/nuevo/page.js`, añadir texto informativo "El precio incluye un IVA del 21%" bajo el campo de precio (línea 389 aprox). Siempre visible (todos los eventos tributan al 21% estándar). Mismo estilo. También añadida la nota en la página de edición de evento (`client/app/admin/espacios/[id]/page.js`).

## Fase 5: Comentarios en código

- [x] **T19: Actualizar comentarios "REBU 10%" → "REBU 21%"** — En los siguientes archivos, actualizar los comentarios que mencionan "REBU 10%" a "REBU 21%": (a) `api/controllers/ordersController.js` líneas 1679, 2302. (b) `api/scheduler/confirmationScheduler.js` línea 64. (c) `api/routes/sellerRoutes.js` línea 357. (d) `api/validators/stripeConnectPayoutsSchemas.js` línea 7. (e) `api/migrations/2026-04-stripe-connect-wallet-split.js` línea 7.

## Fase 6: Verificación

- [x] **T20: Ejecutar tests del proyecto** — vatCalculator.test.js PASS (7/7), stripeConnectTransfers.test.js PASS. Los 4 fallos son pre-existentes (dependencias no instaladas en entorno local: supertest, @libsql/client).

- [x] **T21: Búsqueda global de términos eliminados** — (a) "REBU 10%": 0 ocurrencias ✓ (b) "autofactura": solo en DROP COLUMN de database.js (esperado) ✓ (c) "'particular'": solo en test que verifica que particular→error (esperado) ✓

- [x] **T22: Verificar coherencia numérica** — Caso 1: 100/1.21=82.64, vat=17.36 ✓. Caso 2: 12.34/1.21=10.20, vat=2.14 ✓. Caso 3: 200/1.21=165.29, vat=34.71 ✓.
