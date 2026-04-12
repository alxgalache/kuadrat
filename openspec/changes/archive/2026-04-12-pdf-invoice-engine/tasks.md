## 1. Infraestructura y dependencias

- [x] 1.1 Instalar PDFKit como dependencia en `api/package.json` (`npm install pdfkit`)
- [x] 1.2 Descargar e instalar archivos de fuente Inter (Regular y Bold .ttf) en `api/assets/fonts/`
- [x] 1.3 Añadir tabla `invoices` en `api/config/database.js` con columnas: id, invoice_number (UNIQUE), series ('A'|'P'|'C'|'L'), year, sequence, invoice_type ('buyer_rebu'|'buyer_standard'|'commission'|'settlement_rebu'), order_id, withdrawal_id, event_attendee_id, issued_at. Constraint UNIQUE(series, year, sequence).

## 2. Servicio de generación PDF (capa baja)

- [x] 2.1 Crear `api/services/pdfGenerator.js` con función base que inicializa un documento PDFKit A4 con fuente Inter, márgenes de 50pt, y colores del sistema (#111827 texto, #1d4ed8 acento)
- [x] 2.2 Implementar función de header del documento: logo/nombre de galería ("140d Galería de Arte"), tipo de documento, número de factura, fecha de emisión
- [x] 2.3 Implementar función de sección emisor/receptor: datos fiscales de la galería (de config.business) y datos del cliente/artista
- [x] 2.4 Implementar función de tabla de líneas de productos: columnas adaptables según tipo de documento (con o sin desglose IVA)
- [x] 2.5 Implementar función de sección de totales: base imponible, IVA, total (configurable por tipo)
- [x] 2.6 Implementar función de pie de documento: menciones legales, disclaimers, datos de registro

## 3. Servicio de facturación (capa de negocio)

- [x] 3.1 Crear `api/services/invoiceService.js` con función de asignación de número de factura (idempotente: busca existente o crea nuevo con secuencia atómica)
- [x] 3.2 Implementar `generateBuyerRebuInvoice(orderId)`: consulta datos del pedido, filtra art_order_items, valida datos de facturación del comprador, genera PDF serie A sin IVA con mención REBU
- [x] 3.3 Implementar `generateBuyerStandardInvoice(orderId)`: consulta datos del pedido, filtra other_order_items, calcula base+IVA 21% por línea, envío como línea separada con IVA, genera PDF serie P
- [x] 3.4 Implementar `generateEventAttendeeInvoice(attendeeId)`: consulta datos del asistente y evento, valida status paid/joined, genera PDF serie P con datos simplificados (nombre+email, sin dirección)
- [x] 3.5 Implementar `generateCommissionInvoice(withdrawalId)`: consulta withdrawal+items con vat_regime='standard_vat', valida status completed, genera PDF serie C con líneas individuales "Comisión por intermediación – [Producto] (Pedido #XXXX)" y IVA 21%
- [x] 3.6 Implementar `generateSettlementNote(withdrawalId)`: consulta withdrawal+items con vat_regime='art_rebu', valida status completed, genera PDF serie L con cálculo de margen por obra (venta − coste = margen, margen/1.21 = base, IVA embebido) y disclaimer "Documento interno de liquidación — no constituye factura"

## 4. Controlador y rutas API

- [x] 4.1 Crear `api/controllers/invoiceController.js` con handlers: getBuyerInvoice, getEventAttendeeInvoice, getCommissionInvoice, getSettlementNote. Cada handler valida parámetros, llama al servicio, y retorna PDF con Content-Type application/pdf y Content-Disposition attachment
- [x] 4.2 Crear `api/routes/admin/invoiceRoutes.js` con rutas: GET /order/:orderId/buyer?type=rebu|standard, GET /event-attendee/:attendeeId, GET /withdrawal/:withdrawalId/commission, GET /withdrawal/:withdrawalId/settlement
- [x] 4.3 Montar rutas de facturación en `api/routes/admin/index.js` bajo el prefijo `/invoices`

## 5. Frontend — Botones en pedidos

- [x] 5.1 Modificar `client/app/admin/pedidos/[id]/page.js`: añadir sección "Facturas" en el sidebar debajo del resumen del pedido. Mostrar condicionalmente "Descargar factura REBU" (si hay art items) y/o "Descargar factura IVA 21%" (si hay other items). Cada botón descarga el PDF correspondiente vía la API.

## 6. Frontend — Botones en eventos

- [x] 6.1 Modificar `client/app/admin/espacios/[id]/page.js`: añadir botón/icono de descarga de factura junto a cada asistente con status 'paid' o 'joined' en la lista de asistentes. El botón llama al endpoint de factura de evento.

## 7. Frontend — Botones en pagos

- [x] 7.1 Modificar `client/app/admin/payouts/[sellerId]/page.js`: en la tabla de historial de pagos, añadir botón "Factura comisión" para withdrawals completados con vat_regime='standard_vat', y botón "Nota de liquidación" para withdrawals completados con vat_regime='art_rebu'. Cada botón descarga el PDF correspondiente.
- [x] 7.2 Modificar el componente BucketCard en `client/app/admin/payouts/[sellerId]/page.js`: añadir debajo de cada botón "Ejecutar pago" un botón secundario/outline "Generar autofactura en nombre del artista" sin funcionalidad (placeholder).

## 8. Tests y verificación

- [x] 8.1 Crear test unitario para la función de asignación de números de factura: secuencialidad, idempotencia, separación por series y años
- [x] 8.2 Crear test unitario para la generación de PDF: verificar que cada tipo de documento genera un buffer PDF válido (magic bytes %PDF), con contenido esperado
- [x] 8.3 Verificación manual: generar cada uno de los 4 tipos de documento y comprobar visualmente el resultado en un visor PDF
