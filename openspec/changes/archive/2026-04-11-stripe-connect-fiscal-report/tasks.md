# Tasks — stripe-connect-fiscal-report

> **Lectura previa obligatoria:** `docs/stripe_connect/master_plan.md` (todo) + `proposal.md` y `design.md` de este change. Los Changes #1, #2 y #3 deben estar desplegados antes de empezar este.

## Fase 0 — Prerrequisitos

- [x] 0.1 Verificar que Changes #1, #2 y #3 están merged y desplegados en pre.
- [x] 0.2 Verificar que en pre existe al menos un payout `completed` de cada régimen (REBU y estándar). Si no, crearlos manualmente siguiendo los flujos de Change #2 y/o #3.
- [x] 0.3 **Pedir al usuario los datos fiscales del platform** (master plan §9 marca estos campos como pendientes):
  - `BUSINESS_LEGAL_NAME` (razón social legal).
  - `BUSINESS_TAX_ID` (CIF).
  - `BUSINESS_ADDRESS_LINE1`, `LINE2?`, `CITY`, `POSTAL_CODE`, `PROVINCE`.
- [x] 0.4 Persistir esos valores en el `.env` de pre y producción.

## Fase 1 — Config

- [x] 1.1 En `api/config/env.js`, añadir un bloque `business`:
  ```js
  business: {
    name: process.env.BUSINESS_NAME || '140d Galería de Arte',
    legalName: process.env.BUSINESS_LEGAL_NAME,
    taxId: process.env.BUSINESS_TAX_ID,
    address: {
      line1: process.env.BUSINESS_ADDRESS_LINE1,
      line2: process.env.BUSINESS_ADDRESS_LINE2 || null,
      city: process.env.BUSINESS_ADDRESS_CITY,
      postalCode: process.env.BUSINESS_ADDRESS_POSTAL_CODE,
      province: process.env.BUSINESS_ADDRESS_PROVINCE,
      country: process.env.BUSINESS_ADDRESS_COUNTRY || 'ES',
    },
    email: process.env.BUSINESS_EMAIL || process.env.EMAIL_FROM,
  }
  ```
- [x] 1.2 **No bloquear el arranque** si faltan — bloquear sólo en el endpoint del export con 503 (decisión #11 del design).
- [x] 1.3 Añadir un helper `assertBusinessConfigComplete()` que devuelve la lista de campos faltantes.
- [x] 1.4 Documentar todas las env vars nuevas en `api/.env.example` con el link al master plan §9.

## Fase 2 — Helpers

- [x] 2.1 Crear `api/utils/itemDescription.js`:
  - `describeArtOrderItem(ids)` → batch, JOIN a `products` + `orders` → `Map<id, { description, buyer_reference }>`.
  - `describeOtherOrderItem(ids)` → ídem con `other_products` + `other_orders`.
  - `describeEventAttendee(ids)` → JOIN `event_attendees` + `events`.
  - `describeBatch(rows)` → orquesta las 3 anteriores y devuelve un único `Map` combinado con claves `${item_type}:${item_id}`.
- [x] 2.2 Crear `api/utils/fiscalReportFormatter.js`:
  - `buildPayoutReport(withdrawalId, { adminEmail }) → PayoutReport` — carga withdrawal + items + user + config business; llama a `describeBatch` para enriquecer las líneas; calcula totales; invoca `inferInvoicingMode`.
  - `buildRangeReport({ from, to, vat_regime?, sellerId?, adminEmail }) → RangeReport` — misma lógica para cada withdrawal del rango + `totals_by_regime` y `totals_by_month`.
  - `inferInvoicingMode(user)` → pura, devuelve `{ mode, explanation }` según la tabla del design §6.
  - `formatAsCsv(report, { kind: 'single' | 'range' })` → string CSV con BOM, separador `;`, coma decimal, fechas DD/MM/YYYY.
  - `formatAsJson(report)` → objeto (el endpoint hace `JSON.stringify`).
  - Helper interno `csvEscape(value)` que cuota campos con `;`, `"`, `\n` siguiendo RFC 4180.
  - Helper interno `formatMoneyEs(n)` (`210.00` → `'210,00'`).
  - Helper interno `formatDateEs(iso)` (`'2026-04-10T...'` → `'10/04/2026'`).
- [x] 2.3 Tests unitarios para:
  - `inferInvoicingMode` — los 5 casos de la tabla.
  - `csvEscape` — campos con separador, con comillas, con saltos de línea.
  - `formatMoneyEs`, `formatDateEs`.
  - `buildPayoutReport` con datos mock de los 3 `item_type`.

## Fase 3 — Validators

- [x] 3.1 Crear `api/validators/stripeConnectFiscalReportSchemas.js`:
  - `singlePayoutExportQuerySchema` → `{ format: z.enum(['csv','json']).default('csv') }`.
  - `rangeExportQuerySchema` → `{ from: dateString, to: dateString, format: enum, vat_regime?: enum, sellerId?: coerceNumber() }` con refine `to >= from` y `diffDays(from,to) <= 366`.
  - `summaryQuerySchema` → igual que range sin `format`.

## Fase 4 — Controller

- [x] 4.1 Crear `api/controllers/stripeConnectFiscalReportController.js`:
  - `exportSinglePayout(req,res,next)` — lee `withdrawalId` de params, `format` de query. Valida que el withdrawal exista y esté en `completed` o `reversed`. Llama a `assertBusinessConfigComplete` — si falta algo, 503 con lista. Llama a `buildPayoutReport`. Si `format==='csv'` → `res.setHeader('Content-Type','text/csv; charset=utf-8')` + `Content-Disposition: attachment; filename="payout_<id>_<YYYYMMDD>.csv"`. Si `json` → `application/json` + filename `.json`. Devuelve el contenido.
  - `exportRange(req,res,next)` — mismo patrón, filename `payouts_<from>_<to>.<ext>`.
  - `getSummary(req,res,next)` — devuelve JSON con `totals_by_regime`, `totals_by_month`, `payout_count`.
- [x] 4.2 Manejo de errores:
  - Withdrawal no encontrado → `ApiError(404, 'Payout no encontrado')`.
  - Withdrawal en `failed` / `pending` / `processing` → `ApiError(409, 'El payout aún no ha sido ejecutado')` / `ApiError(404, 'El payout falló y no tiene información fiscal')`.
  - Config business incompleta → `ApiError(503, 'Datos fiscales del platform incompletos: ' + missing.join(', '))`.
  - Rango demasiado grande → manejado por el validator (400).
- [x] 4.3 Loggear con pino `{ adminId, withdrawalId/range, format }` cada export (auditoría).

## Fase 5 — Routing

- [x] 5.1 Crear `api/routes/admin/stripeConnectFiscalReportRoutes.js`:
  ```js
  router.get('/payouts/fiscal-export', validate(rangeExportQuerySchema,'query'), exportRange);
  router.get('/payouts/summary', validate(summaryQuerySchema,'query'), getSummary);
  router.get('/payouts/:withdrawalId/fiscal-export', validate(singlePayoutExportQuerySchema,'query'), exportSinglePayout);
  ```
  (El orden importa: la ruta específica `/payouts/fiscal-export` debe ir antes de la paramétrica `/payouts/:withdrawalId/fiscal-export`.)
- [x] 5.2 Registrar el router en `api/routes/admin/index.js`.
- [x] 5.3 Verificar que ya tiene `authenticate` + `adminAuth` aplicados desde el índice admin.

## Fase 6 — Frontend — API client

- [x] 6.1 En `client/lib/api.js`, añadir:
  - `exportPayoutCsv(withdrawalId)` → hace un GET con `responseType: 'blob'`, devuelve el Blob para descarga.
  - `exportPayoutJson(withdrawalId)` → ídem en JSON.
  - `exportRangeCsv({ from, to, vat_regime?, sellerId? })`.
  - `exportRangeJson({ from, to, vat_regime?, sellerId? })`.
  - `getPayoutsSummary({ from, to })`.
- [x] 6.2 Helper `triggerDownload(blob, filename)` que crea un `<a>` temporal y dispara el click.

## Fase 7 — Frontend — Panel admin

- [x] 7.1 En `client/app/admin/payouts/[sellerId]/page.js` (ya existe de Change #2):
  - En el histórico de payouts del seller, añadir dos iconos por fila (lado derecho): "CSV" y "JSON" que descargan.
  - Tooltip en es-ES: "Exportar para gestoría (CSV)" / "JSON".
  - Deshabilitar los botones para rows con `status IN ('failed','pending','processing')`.
- [x] 7.2 En `client/app/admin/payouts/page.js` (ya existe de Change #2):
  - Añadir una barra superior con `Desde` `Hasta` `Régimen` + botones "Exportar CSV" "Exportar JSON" "Resumen".
  - El botón "Resumen" llama a `/summary` y abre un pequeño card debajo con los totales por régimen y por mes.
  - Validación cliente: `to >= from`, `<= 366 días`. Error inline si no se cumple.
- [x] 7.3 Minimalismo Tailwind por defecto, textos en es-ES.

## Fase 8 — Documentación de la gestoría

- [x] 8.1 Crear `docs/stripe_connect/fiscal_report_for_gestoria.md` con las 11 secciones listadas en el proposal (sección "Documentación para la gestoría"). Tono: dirigido a la gestoría, terminología fiscal española, ejemplos concretos con números.
- [x] 8.2 Incluir un ejemplo completo de CSV individual y un fragmento de CSV agregado.
- [x] 8.3 Incluir un ejemplo del objeto JSON agregado.
- [x] 8.4 Incluir la tabla de `inferInvoicingMode` con los 4 casos reales (el NULL es error interno).
- [x] 8.5 Incluir la sección de casos de borde (reversiones, fallos, refunds post-payout).
- [x] 8.6 Actualizar `docs/stripe_connect/master_plan.md` §13 changelog con un entry para Change #4 y §9 con un enlace al nuevo documento.

## Fase 9 — Testing manual

- [x] 9.1 En pre, con un payout REBU `completed` existente:
  - `GET /api/admin/payouts/<id>/fiscal-export?format=csv` → descargar, abrir en Excel ES, verificar que las columnas, acentos, coma decimal y fechas son correctas.
  - `GET ...?format=json` → verificar estructura del objeto.
- [x] 9.2 Lo mismo con un payout estándar.
- [x] 9.3 Lo mismo con un payout `reversed` → verificar que aparece `reversal_amount` y `net_of_reversals`.
- [x] 9.4 Export agregado del trimestre → verificar que las filas incluyen todos los payouts `completed`/`reversed` y excluyen `failed`.
- [x] 9.5 Rango de 2 años → 400 con mensaje claro.
- [x] 9.6 Borrar una env var `BUSINESS_LEGAL_NAME` → 503 con mensaje listando el campo faltante. Restaurar.
- [x] 9.7 Endpoint `/summary` → verificar totales por régimen.
- [x] 9.8 Frontend: click en "CSV" descarga archivo con el nombre correcto; click en "Exportar CSV" agregado descarga rango.
- [x] 9.9 Compartir el CSV individual y el agregado con la gestoría; recoger feedback sobre formato.

## Fase 10 — Go-live

- [x] 10.1 Completar env vars `BUSINESS_*` en producción.
- [x] 10.2 Smoke test: exportar un payout real y compartirlo con la gestoría.
- [x] 10.3 Marcar la iniciativa Stripe Connect como **completa** en `docs/stripe_connect/master_plan.md` §13.
- [x] 10.4 Actualizar CLAUDE.md / MEMORY.md con una nota "Stripe Connect initiative completed — see master_plan.md" (opcional; el usuario decide).
