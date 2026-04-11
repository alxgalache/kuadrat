## Why

La galería necesita emitir facturas y documentos fiscales en PDF para cumplir con las obligaciones tributarias españolas. Actualmente el sistema calcula comisiones, IVA y gestiona pagos a artistas, pero no genera ningún documento descargable. Se requiere un motor de generación de facturas PDF que cubra los cuatro tipos de documento necesarios: facturas al comprador (REBU y estándar con IVA 21%), facturas de comisión al artista (régimen general), y notas de liquidación internas (REBU). Cada tipo sigue un régimen fiscal distinto y tiene requisitos legales específicos.

## What Changes

- **Nuevo motor de generación de PDF**: Servicio backend basado en PDFKit que genera documentos A4 con diseño minimalista alineado con la estética del frontend (fuente Inter, colores #111827).
- **Nueva tabla `invoices`**: Persistencia de numeración secuencial sin huecos (requisito fiscal) con series diferenciadas: A (REBU comprador), P (estándar comprador), C (comisión artista), L (liquidación REBU).
- **Nuevos endpoints API**: Rutas admin protegidas para generar/descargar cada tipo de factura en PDF.
- **Factura al comprador — REBU (Serie A)**: Sin desglose de IVA, con mención legal obligatoria del régimen especial de bienes usados. Para pedidos con productos de tipo `art`.
- **Factura al comprador — Estándar (Serie P)**: Con desglose de base imponible + IVA 21%. Para pedidos con productos de tipo `other` y para tickets de eventos.
- **Factura de comisión al artista (Serie C)**: Galería → Artista por servicios de intermediación en productos estándar. Líneas individuales por producto. Solo para régimen `standard_vat`.
- **Nota de liquidación REBU (Serie L)**: Documento interno (no factura fiscal) con cálculo de margen por obra. Para régimen `art_rebu`.
- **Pedidos mixtos**: Si un pedido contiene productos `art` y `other`, se generan dos facturas separadas (una por régimen). Nunca se mezclan regímenes en el mismo documento.
- **Idempotencia**: La primera generación asigna número de factura; regeneraciones posteriores reutilizan el mismo número y regeneran el PDF.
- **Botones en panel de administración**: Botones de descarga en el detalle del pedido, en el detalle del evento (por asistente), y en el historial de pagos del artista.
- **Botón placeholder de autofactura**: Botón sin funcionalidad "Generar autofactura en nombre del artista" en la página de pagos.

## Capabilities

### New Capabilities
- `pdf-invoice-engine`: Motor de generación de facturas PDF con PDFKit. Cubre la tabla de numeración, el servicio de generación de los 4 tipos de documento, los endpoints API, y los botones de descarga en el frontend admin.

### Modified Capabilities
- `stripe-connect-fiscal-report`: Se añaden referencias a la generación de facturas PDF como parte del flujo fiscal. Los documentos generados complementan el informe fiscal existente.

## Impact

- **Backend (`api/`)**:
  - `config/database.js` — Nueva tabla `invoices`
  - `package.json` — Nueva dependencia `pdfkit`
  - Nuevos archivos: `services/invoiceService.js`, `services/pdfGenerator.js`, `controllers/invoiceController.js`, `routes/admin/invoiceRoutes.js`
  - `routes/admin/index.js` — Montar nuevas rutas de facturación
  - `config/env.js` — Posibles nuevas variables de entorno para datos fiscales adicionales (si es necesario)
- **Frontend (`client/`)**:
  - `app/admin/pedidos/[id]/page.js` — Sección "Facturas" en el sidebar
  - `app/admin/payouts/[sellerId]/page.js` — Botones de factura de comisión en historial + botón placeholder de autofactura
  - `app/admin/espacios/[id]/page.js` — Botón de factura por asistente de evento
- **Assets**: Archivo de fuente Inter (.ttf) embebido para PDFKit
- **Tests**: Tests unitarios para numeración de facturas y generación de PDF
