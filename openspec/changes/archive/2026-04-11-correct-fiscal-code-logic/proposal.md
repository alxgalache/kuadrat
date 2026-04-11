# Propuesta: Corrección de la lógica fiscal en el código

## Resumen

Corregir toda la lógica fiscal y de facturación en el código de la aplicación para alinearla con el modelo correcto de facturación descrito en `docs/rebuild_invoicing/master_rebuild.md` y `docs/rebuild_invoicing/master_rebuild_summary.md`. El Cambio #1 ya corrigió toda la documentación; este cambio aplica esas correcciones al código fuente.

## Contexto

La implementación actual contiene 6 errores fundamentales que afectan al cálculo de impuestos, la gestión de estados fiscales de los artistas, la descripción de las obligaciones de facturación y la interfaz de administración.

---

## Errores a corregir

### Error 1: Tipo impositivo REBU (0.10 → 0.21)

**Problema:** `VAT_RATE_REBU = 0.10` en `api/utils/vatCalculator.js`. Bajo el REBU, el IVA del margen de la galería se calcula al tipo general (21%), no al tipo reducido de arte (10%). El 10% es lo que el artista factura a la galería como creador, pero el cálculo REBU de la galería usa el 21%.

**Corrección:** Cambiar la constante a `0.21`. La fórmula `taxableBase = commission / (1 + rate)` es correcta; solo cambia la constante.

**Ejemplo recalculado:** Venta 1000€, comisión 25% = 250€ margen → `taxableBase = 250 / 1.21 = 206,61€`, `vatAmount = 43,39€`.

### Error 2: Eliminación del estado fiscal "particular"

**Problema:** El sistema permite `tax_status = 'particular'` en la base de datos, validadores y UI. Bajo la legislación española, todos los artistas que venden a través de una galería deben estar dados de alta en Hacienda (036/037). La exención del SMI aplica solo a la Seguridad Social, no a las obligaciones fiscales con Hacienda.

**Corrección:** Eliminar `'particular'` del CHECK constraint, de los validadores Zod, y de la UI del formulario fiscal. Cambiar el default a `'autonomo'`.

### Error 3: Eliminación completa del concepto de autofacturación

**Problema:** El código contiene un sistema completo de "acuerdo de autofacturación" (columna DB, validación, lógica de controlador, formulario UI, informe fiscal) que era necesario solo para artistas "particulares". Al eliminar el estado "particular", todo el sistema de autofacturación queda obsoleto.

**Corrección:** Eliminar la columna `autofactura_agreement_signed_at`, toda la lógica asociada en controladores, validadores, formularios y el informe fiscal.

### Error 4: Corrección de la dirección de facturación en el informe fiscal

**Problema:** El informe fiscal actual dice que el artista emite factura "por el importe de la comisión", cuando en realidad el artista emite factura por su parte de la venta (precio − comisión). Son importes diferentes y flujos fiscales distintos.

**Corrección:** Actualizar las explicaciones en `inferInvoicingMode` del `fiscalReportFormatter.js`:

- **REBU (arte):** "El artista emite factura a la galería por la venta de la obra (precio − comisión) con IVA del 10% (tipo reducido para obras de arte como creador). La galería no emite factura de comisión independiente bajo el régimen REBU; el margen (comisión) tributa internamente al 21% mediante el cálculo REBU."
- **Estándar (otros/eventos):** "El artista emite factura a la galería por su parte de la venta (precio − comisión) con IVA del 21%. La galería emite factura al artista por el importe de la comisión con IVA del 21%."

Nota: Estas facturas son obligaciones externas al sistema (las emite cada parte con su propia facturación). El informe fiscal documenta la obligación; el sistema no genera estas facturas.

### Error 5: Etiquetas UI incorrectas ("REBU 10%" → "Arte (REBU)")

**Problema:** Múltiples componentes del frontend y templates de email muestran "REBU 10%" como etiqueta del régimen fiscal, induciendo a error.

**Corrección:** Cambiar todas las ocurrencias a "Arte (REBU)" sin mencionar porcentaje, para evitar confusión (el 21% es el IVA interno del margen de la galería, no visible al comprador).

### Error 6: Nota de IVA en formularios de precios

**Problema:** Los formularios de creación/edición de productos estándar y eventos no indican que el precio introducido incluye IVA del 21%.

**Corrección:** Añadir nota informativa bajo el campo de precio: "El precio introducido incluye un IVA del 21%". En productos, solo visible cuando `product_type === 'other'`. En eventos, siempre visible.

---

## Archivos afectados

### Fase 1: Cambios críticos de lógica (7 archivos)

| Archivo | Cambios |
|---|---|
| `api/utils/vatCalculator.js` | `VAT_RATE_REBU`: 0.10→0.21, actualizar comentarios |
| `api/utils/fiscalReportFormatter.js` | Eliminar particular/autofactura de `inferInvoicingMode`, constantes, `buildSellerBlock`, queries SQL, CSV; corregir dirección facturación |
| `api/config/database.js` | Eliminar `'particular'` del CHECK, eliminar columna `autofactura_agreement_signed_at`, añadir migración DROP COLUMN |
| `api/validators/fiscalSchemas.js` | Eliminar `'particular'` de z.enum, eliminar campo `autofactura_agreement_signed` |
| `api/controllers/usersController.js` | Eliminar toda la lógica de autofactura del endpoint `updateSellerFiscalData` |
| `client/components/admin/SellerFiscalForm.js` | Eliminar opción "Particular", cambiar default a "autonomo", eliminar checkbox autofacturación |
| `api/routes/admin/authorRoutes.js` | Eliminar `autofactura_agreement_signed_at` del SELECT |

### Fase 2: Tests (2 archivos)

| Archivo | Cambios |
|---|---|
| `api/tests/vatCalculator.test.js` | Recalcular todos los valores esperados REBU (divisor 1.10→1.21) |
| `api/tests/fiscalReportFormatter.test.js` | Eliminar tests de autofactura/pending_agreement, añadir test particular→error, actualizar explicaciones |

### Fase 3: Etiquetas UI (5 archivos, 11 ocurrencias)

| Archivo | Líneas |
|---|---|
| `client/components/admin/ConfirmPayoutModal.js` | 33 |
| `client/app/admin/payouts/page.js` | 44, 136, 383 |
| `client/app/admin/payouts/[sellerId]/page.js` | 58 |
| `client/app/orders/page.js` | 236, 555, 649 |
| `api/services/emailService.js` | 1812, 1862, 3117 |

### Fase 4: Notas de IVA en formularios (2 archivos)

| Archivo | Cambios |
|---|---|
| `client/app/admin/products/[id]/edit/page.js` | Nota IVA 21% bajo campo precio (condicional: `product_type === 'other'`) |
| `client/app/admin/espacios/nuevo/page.js` | Nota IVA 21% bajo campo precio (siempre visible) |

### Fase 5: Comentarios en código (5 archivos)

| Archivo | Líneas |
|---|---|
| `api/controllers/ordersController.js` | 1679, 2302 |
| `api/scheduler/confirmationScheduler.js` | 64 |
| `api/routes/sellerRoutes.js` | 357 |
| `api/validators/stripeConnectPayoutsSchemas.js` | 7 |
| `api/migrations/2026-04-stripe-connect-wallet-split.js` | 7 |

### Fase 6: Verificación

- Ejecutar tests existentes para confirmar que los cambios son correctos
- Verificar coherencia numérica entre vatCalculator y tests
- Búsqueda global de términos eliminados (particular, autofactura, REBU 10%)

---

## Notas de migración

- **SQLite y `CREATE TABLE IF NOT EXISTS`:** Modificar el CREATE TABLE solo afecta a bases de datos nuevas.
- **Bases de datos existentes:** Se añadirá un `safeAlter` para `DROP COLUMN autofactura_agreement_signed_at` (SQLite 3.35.0+ soporta DROP COLUMN; la columna no tiene constraints).
- **CHECK constraint `'particular'`:** Al no existir ya en el CREATE TABLE, nuevas DBs no lo permitirán. En DBs existentes, ningún código escribirá este valor (la validación Zod lo rechazará antes).

## Riesgos

- **BAJO:** El cambio de `VAT_RATE_REBU` afecta a cálculos futuros. Los datos históricos en DB (`taxable_base`, `vat_amount` en `order_items` y `withdrawals`) no se recalculan — los tests verificarán la nueva constante.
- **BAJO:** La eliminación de la columna `autofactura_agreement_signed_at` vía `safeAlter` puede fallar silenciosamente en SQLite antiguo — el patrón `safeAlter` del proyecto ya maneja esto.
