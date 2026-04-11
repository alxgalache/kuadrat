## Why

Este es el **Change #4 de 4** del roadmap definido en `docs/stripe_connect/master_plan.md` (§7.4) y el cierre de la iniciativa Stripe Connect. Los Changes #1, #2 y #3 dejan operativo el flujo `cuenta conectada → monedero en dos buckets (REBU/estándar) → payout vía Stripe Transfers` para arte, otros productos y eventos. Pero la **gestoría no tiene forma de extraer los datos** que necesita para cerrar cada trimestre: hoy tendría que leer la tabla `withdrawals` y reconstruir manualmente el detalle fiscal por payout, mezclando tipos de IVA, regímenes y datos del artista.

> **Lectura previa obligatoria:** `docs/stripe_connect/master_plan.md` (§6 los tres regímenes, §7.4 Change #4, §9 datos fiscales del platform, decisiones #13 IRPF y #19 autofacturación Option B). Este documento NO repite esas decisiones.

Este change entrega tres cosas:

1. **Endpoints de export CSV/JSON** — uno por payout individual y otro agregado por rango de fechas. La gestoría los importa en su ERP y desde ahí emite las facturas/autofacturas en su formato. Decisión #19 del master plan: **NO generamos PDFs en v1**, sólo datos estructurados.
2. **Botones de export en el panel admin** ya construido en Change #2 — un click, descarga local, fin.
3. **Documento markdown para la gestoría** (`docs/stripe_connect/fiscal_report_for_gestoria.md`) que explica el flujo completo: MoR, REBU, estándar, IVA del transporte, autofacturación art. 5 RF, IRPF preparado-pero-no-aplicado, casos de borde (reembolsos, reversiones, fallos), y cómo importar el CSV. Este documento es el **handoff técnico** entre la plataforma y la gestoría.

Este change **no toca ninguna lógica de negocio**: no crea withdrawals, no llama a Stripe, no modifica buckets. Es exclusivamente lectura + transformación de datos ya persistidos por los changes anteriores.

## What Changes

### Backend — Endpoints de export

- **Nuevo `GET /api/admin/payouts/:withdrawalId/fiscal-export?format=csv|json`**:
  - Devuelve el detalle fiscal completo de un payout individual.
  - Incluye:
    - **Datos del artista** (snapshot en el momento del export): `fiscal_full_name`, `tax_id`, `tax_status`, `fiscal_address_*`, `irpf_retention_rate`, `autofactura_agreement_signed_at`, `stripe_connect_account_id`.
    - **Datos de la plataforma** (desde `config.business.*`): `BUSINESS_NAME` ("140d Galería de Arte"), `BUSINESS_LEGAL_NAME`, `BUSINESS_TAX_ID`, `BUSINESS_ADDRESS_*`, `EMAIL_FROM`.
    - **Metadatos del payout**: `withdrawal_id`, `stripe_transfer_id`, `stripe_transfer_group`, `vat_regime`, `executed_at`, `executed_by_admin_id` (email del admin), `status`, `reversed_at`/`reversal_amount` si aplica.
    - **Líneas** (una por `withdrawal_items` row): `item_type`, `item_id`, `description` (título del producto/evento), `buyer_reference` (orden/attendee para trazabilidad), `seller_earning`, `taxable_base`, `vat_rate`, `vat_amount`, y el total de la línea (`taxable_base + vat_amount`).
    - **Subtotales y totales**: suma de bases imponibles, suma de IVAs, `amount` final transferido.
    - **Modo de facturación aplicable** (derivado): `autofactura` si `tax_status='particular'` (+ requiere `autofactura_agreement_signed_at IS NOT NULL`), si no `factura_recibida`.
    - **Tipo de operación**: `REBU` o `IVA_estandar_21`, derivado de `vat_regime`.
  - `format=csv` devuelve un CSV UTF-8 con BOM (compatible con Excel español), cabeceras en español, separador `;`, decimales con coma.
  - `format=json` devuelve el mismo payload en estructura anidada (objeto con `platform`, `seller`, `withdrawal`, `lines[]`, `totals`, `invoicing`).
  - **Content-Disposition: attachment** con nombre `payout_<withdrawal_id>_<fecha>.csv` o `.json`.
  - Admin-only.

- **Nuevo `GET /api/admin/payouts/fiscal-export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json[&vat_regime=art_rebu|standard_vat][&sellerId=123]`**:
  - Devuelve TODOS los payouts ejecutados en el rango (filtrado por `executed_at`), con sus líneas, en un único archivo.
  - Filtros opcionales por régimen y por seller.
  - El CSV agregado es una tabla "long" con una fila por `withdrawal_items` más columnas redundantes del payout padre (id, fecha, régimen, artista, NIF) — lo que la gestoría necesita para tirar una tabla dinámica en Excel sin joins manuales.
  - El JSON agregado devuelve `{ range, totals_by_regime, payouts: [...] }`.
  - Soporta rangos hasta 1 año para evitar queries abusivas; mayor rango → 400.

- **`GET /api/admin/payouts/summary?from=...&to=...`** (opcional pero muy útil):
  - Devuelve agregados por régimen, por mes, por seller. JSON sólo.
  - Se usa desde la UI para mostrar "Resumen trimestral" antes de exportar.

### Backend — Controller y routing

- **Nuevo `api/controllers/stripeConnectFiscalReportController.js`** — contiene los 3 handlers anteriores.
- **Nuevo helper `api/utils/fiscalReportFormatter.js`**:
  - `buildPayoutReport(withdrawal)` — carga el withdrawal + withdrawal_items + user + config business, construye el objeto canónico.
  - `formatAsCsv(report)` — devuelve string CSV (payout individual) o CSV "long" (agregado).
  - `formatAsJson(report)` — devuelve el objeto.
  - `inferInvoicingMode(user)` — `autofactura` si `tax_status='particular'` y `autofactura_agreement_signed_at IS NOT NULL`, `factura_recibida` si `tax_status IN ('autonomo','sociedad')`, `pending_agreement` si es `particular` pero sin firma (bandera que la gestoría debe resolver antes de declarar).
- **Nuevo `api/routes/admin/stripeConnectFiscalReportRoutes.js`** — monta las rutas en `/api/admin/payouts/...`. Registrar en `api/routes/admin/index.js`.
- **Nuevos validators Zod** en `api/validators/stripeConnectFiscalReportSchemas.js`:
  - `singlePayoutExportSchema` — valida `format`.
  - `rangeExportSchema` — valida `from`, `to` (YYYY-MM-DD), `format`, `vat_regime?`, `sellerId?`, y que el rango no exceda 366 días.
  - `summarySchema` — valida `from`, `to`.

### Backend — Config

- **Ampliar `api/config/env.js`** con el bloque `business`:
  - `BUSINESS_NAME` (default `'140d Galería de Arte'`).
  - `BUSINESS_LEGAL_NAME` (requerido para el export; si no está, el endpoint devuelve 503 con un mensaje claro pidiéndolo).
  - `BUSINESS_TAX_ID` (ídem).
  - `BUSINESS_ADDRESS_LINE1`, `BUSINESS_ADDRESS_LINE2?`, `BUSINESS_ADDRESS_CITY`, `BUSINESS_ADDRESS_POSTAL_CODE`, `BUSINESS_ADDRESS_PROVINCE`, `BUSINESS_ADDRESS_COUNTRY` (default `'ES'`).
  - `BUSINESS_EMAIL` (default = `EMAIL_FROM`).
- Estos son los **campos pendientes del master plan §9** que el usuario debe rellenar antes de ir a producción. Documentados en `api/.env.example`.

### Backend — Helper de descripción por `item_type`

- **`api/utils/itemDescription.js`** (nuevo):
  - `describeArtOrderItem(id)` → `{ description, buyer_reference }` cargando `art_order_items` + JOIN `products` + `orders`.
  - `describeOtherOrderItem(id)` → ídem con `other_products`.
  - `describeEventAttendee(id)` → `{ description: 'Entrada: <event.title>', buyer_reference: 'attendee:<id>' }`.
  - Batch-friendly (`describeBatch(rows)` para evitar N+1 en exports agregados).

### Frontend — Admin

- **`client/app/admin/payouts/[sellerId]/page.js`** (extender, ya existe de Change #2):
  - En cada fila del histórico de payouts del seller, añadir dos iconos/botones: "CSV" y "JSON" que descargan `/api/admin/payouts/:withdrawalId/fiscal-export`.
- **`client/app/admin/payouts/page.js`** (extender, ya existe de Change #2):
  - Añadir en la parte superior una barra de filtros: `Desde [date]`, `Hasta [date]`, `Régimen [todos/REBU/estándar]`, con dos botones: "Exportar agregado CSV" y "Exportar agregado JSON".
  - Además, un botón "Resumen del trimestre" que llama a `/summary` y muestra un pequeño card con los totales.
- Sin modal ni confirmación: la descarga es directa (lectura, no destructiva).

### Documentación para la gestoría

- **Nuevo fichero `docs/stripe_connect/fiscal_report_for_gestoria.md`** en español, dirigido a la gestoría, con las siguientes secciones:
  1. **Qué es 140d Galería de Arte** — razón social, CIF, actividad económica, plataforma.
  2. **Modelo de Merchant of Record** — 140d es quien factura al comprador final; el artista no emite factura al comprador.
  3. **Los tres regímenes fiscales aplicables**:
     - **REBU** (Régimen Especial de Bienes Usados) para arte — 10% sobre el margen del marketplace (la comisión). Fórmula y ejemplo numérico.
     - **IVA estándar 21%** para otros productos (merchandising, catálogos, etc.).
     - **IVA estándar 21%** para entradas a eventos en vivo (streaming y presencial).
  4. **Flujo de cobro y pago**:
     - Cobro via Stripe → platform balance.
     - Plazo manual de 14 días para items físicos, 1 día para eventos.
     - Payout manual vía Stripe Transfers a la cuenta conectada del artista.
     - Cada payout es de **un único régimen fiscal** (decisión arquitectónica).
  5. **Autofacturación (art. 5 Reglamento de Facturación)** — aplicable sólo cuando el artista es `particular` y ha firmado el acuerdo. El plataforma emite una autofactura a nombre del artista para documentar la comisión retenida. Los artistas `autónomo` o `sociedad` emiten su propia factura a 140d por la comisión.
  6. **IVA del transporte** — aplicado al 21% en ambos lados (la plataforma recibe factura del transportista y factura el transporte al comprador con el mismo tipo). **No es suplido** (decisión #18 master plan) porque las facturas del transportista van a 140d, no al artista.
  7. **IRPF** — campo `irpf_retention_rate` preparado en la BD pero **no aplicado al cálculo del payout en v1** (decisión #13). La gestoría puede leerlo del export para calcular manualmente si procede retención.
  8. **Cómo leer el CSV de export**:
     - Columnas del CSV individual (payout único).
     - Columnas del CSV agregado (rango de fechas).
     - Ejemplo real con números.
     - Cómo importar a su ERP (instrucciones genéricas; cada ERP es distinto).
  9. **Casos de borde**:
     - **Reembolsos del comprador** — fuera de scope v1. Si ocurren post-payout, el admin compensa manualmente y la gestoría debe ajustar el trimestre siguiente.
     - **Reversiones de transfer** (`withdrawals.status='reversed'`) — aparecen en el export con `reversal_amount` y `reversed_at`. El importe neto del payout es `amount - reversal_amount`.
     - **Transfers fallidos** (`status='failed'`) — NO cuentan fiscalmente; el export los excluye por defecto (filtro `status='completed'`).
     - **Eventos sin asistentes pagados** — no generan línea en el export (no hay comisión que declarar).
  10. **Trazabilidad back-reference** — cómo mapear una línea del CSV a la orden/attendee original usando `buyer_reference`.
  11. **Glosario** de campos.

## Capabilities

### New Capabilities

- `stripe-connect-fiscal-report`: exportación estructurada (CSV/JSON) del detalle fiscal de cada payout y de rangos agregados, con inferencia del modo de facturación (`autofactura` / `factura_recibida`) y del régimen IVA por item, usando los datos persistidos por los Changes #1-#3. Incluye el documento markdown de handoff para la gestoría y los endpoints admin correspondientes. **NO incluye generación de PDFs** (decisión #19).

## Impact

- **Layer**: Backend (3 endpoints read-only + helpers + config) + Frontend (botones de export en panel existente) + Documentación (markdown para gestoría).
- **Files afectados — Backend**:
  - `api/config/env.js` (bloque `business` nuevo).
  - `api/.env.example` (documentar los campos pendientes del master plan §9).
  - `api/controllers/stripeConnectFiscalReportController.js` (nuevo).
  - `api/utils/fiscalReportFormatter.js` (nuevo).
  - `api/utils/itemDescription.js` (nuevo).
  - `api/routes/admin/stripeConnectFiscalReportRoutes.js` (nuevo).
  - `api/routes/admin/index.js` (registro).
  - `api/validators/stripeConnectFiscalReportSchemas.js` (nuevo).
- **Files afectados — Frontend**:
  - `client/lib/api.js` (wrappers `exportPayoutCsv`, `exportPayoutJson`, `exportRangeCsv`, `exportRangeJson`, `getPayoutsSummary`).
  - `client/app/admin/payouts/[sellerId]/page.js` (botones por fila en el histórico).
  - `client/app/admin/payouts/page.js` (barra de filtros + export agregado + card de resumen).
- **Files afectados — Documentación**:
  - `docs/stripe_connect/fiscal_report_for_gestoria.md` (nuevo — entregable principal del change).
  - `docs/stripe_connect/master_plan.md` (actualizar §13 changelog y añadir enlace a `fiscal_report_for_gestoria.md` en §9).
- **DB schema**: **ninguna modificación**. Todos los datos necesarios ya existen tras los Changes #1-#3 (fiscal_* en `users`, totales en `withdrawals`, detalle en `withdrawal_items`).
- **Dependencies**: ninguna nueva. Generación de CSV con implementación manual simple (escape de `;` y comillas), sin librería (el volumen cabe en memoria cómodamente).
- **APIs externas**: **ninguna**. Este change no habla con Stripe.
- **Config/Infra**: acción manual del usuario — rellenar las env vars `BUSINESS_LEGAL_NAME`, `BUSINESS_TAX_ID`, `BUSINESS_ADDRESS_*` antes de ir a producción. Sin ellas, los endpoints devuelven 503 con mensaje claro.
- **Testing manual**: ejecutar al menos 1 payout REBU + 1 payout estándar en pre (requiere Changes #1-#3 funcionando), exportar cada uno en CSV y JSON, validar que el importe cuadra con el `stripe_transfer_id` visible en Stripe Dashboard, compartir el CSV con la gestoría para que valide formato e importabilidad.

## Non-goals

- **Generación de PDFs de factura/autofactura.** Decisión #19 master plan: la gestoría emite los documentos finales en su ERP a partir del export. V1 sólo entrega datos estructurados.
- **Envío automático del export por email** a la gestoría o al artista. Descarga manual desde el panel admin.
- **Aplicación del IRPF al cálculo del payout.** Decisión #13. El campo se expone en el export como metadato informativo; no se resta del importe transferido.
- **Gestión automatizada de reembolsos** post-payout. El admin los gestiona fuera del sistema y la gestoría ajusta el trimestre siguiente manualmente.
- **Soporte de países distintos a España.** V1 asume `fiscal_address_country='ES'`, régimen español, fechas locales Europe/Madrid.
- **Historial versionado de los datos del artista** en el export. El export usa snapshot actual; si el artista cambia su NIF entre el payout y el export, aparece el nuevo valor. Trade-off asumido: los datos fiscales cambian rara vez y el admin debe congelar el export en disco tras generarlo.
- **Formato XBRL, SII, u otros formatos fiscales oficiales.** La gestoría transforma a partir del CSV si los necesita.
- **Exportación de datos anteriores a Change #1 (pre-Stripe Connect).** Los withdrawals legacy sin `vat_regime` se excluyen del export (filtro `vat_regime IS NOT NULL`). Si la gestoría necesita históricos, consulta SQL directo.
- **Permisos granulares**. Todo el panel de export es admin-only, como el resto del Change #2.
