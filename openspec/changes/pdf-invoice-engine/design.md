## Context

La galería 140d opera bajo dos regímenes fiscales españoles según el tipo de producto:

- **REBU (Régimen Especial de Bienes Usados)**: Para obras de arte. La galería compra al artista y revende al comprador. La factura al comprador NO desglosa IVA — incluye la mención legal obligatoria. El IVA sobre el margen (21%) se declara internamente en el Modelo 303.
- **Régimen General (IVA 21%)**: Para productos no artísticos y tickets de eventos. La factura desglosa base imponible + IVA 21%.

Actualmente el sistema calcula correctamente comisiones, IVA y gestiona pagos a artistas mediante Stripe Connect, pero no genera documentos PDF descargables. Los datos necesarios ya existen en la base de datos: pedidos con direcciones de facturación, items con precios y comisiones, datos fiscales de artistas, y registros de pagos ejecutados con desglose por ítem.

Los datos fiscales de la galería están configurados en variables de entorno y validados al arrancar (`config.business.*`).

## Goals / Non-Goals

**Goals:**
- Generar 4 tipos de documentos PDF: factura REBU (serie A), factura estándar (serie P), factura de comisión (serie C), nota de liquidación REBU (serie L)
- Numeración secuencial sin huecos por serie y año (requisito fiscal español)
- Generación idempotente: la primera llamada asigna número, las siguientes reutilizan el mismo número
- Diseño minimalista A4 alineado con la estética del frontend (Inter, colores Tailwind)
- Separar automáticamente pedidos mixtos (art + other) en dos facturas por régimen
- Documentos generados bajo demanda desde el panel admin — sin almacenamiento de PDFs

**Non-Goals:**
- Facturación automática (se genera manualmente por el admin)
- Almacenamiento persistente de archivos PDF (se regeneran bajo demanda)
- Envío de facturas por email (futuro)
- Facturación del artista hacia la galería (informativo, fuera del sistema)
- Autofacturación funcional (solo botón placeholder en la UI)
- Modo oscuro o idiomas distintos del español

## Decisions

### D1: Librería PDF — PDFKit
**Decisión**: Usar PDFKit como librería de generación de PDF.
**Alternativas consideradas**:
- **pdfmake**: Más declarativo pero más pesado, peor soporte de fuentes custom.
- **Puppeteer/Playwright + HTML→PDF**: Mayor fidelidad visual pero requiere navegador headless (pesado para un servidor Express).
- **jsPDF**: Orientado a cliente, no ideal para backend.

**Rationale**: PDFKit es ligero (~2MB), maduro, permite streaming, soporta fuentes TTF embebidas, y da control total sobre el layout. Ideal para documentos A4 con estructura tabular simple.

### D2: Fuente — Inter embebida
**Decisión**: Embeber la fuente Inter (.ttf regular + bold) directamente en el proyecto.
**Rationale**: Es la misma fuente del frontend. PDFKit requiere archivos .ttf (no puede usar Google Fonts dinámicamente). Se almacenarán en `api/assets/fonts/`.

### D3: Sin almacenamiento de PDF
**Decisión**: Los PDFs se generan bajo demanda y se envían como stream al cliente. No se almacenan en disco ni en S3.
**Rationale**: Los datos fuente ya están en la base de datos y son inmutables una vez creado el pedido/pago. Regenerar es barato (~50ms). Almacenar duplicaría información y añadiría complejidad de gestión de archivos.

### D4: Tabla `invoices` para numeración
**Decisión**: Crear una tabla `invoices` que persiste solo la metadata de numeración (serie, año, secuencia, tipo, referencias). El PDF se genera a partir de los datos del pedido/pago.
**Rationale**: La numeración secuencial sin huecos es un requisito legal. La tabla asegura unicidad (UNIQUE constraint) y permite reutilizar el número en regeneraciones. No almacena el contenido del PDF.

### D5: Arquitectura en dos capas — pdfGenerator + invoiceService
**Decisión**: Separar en dos módulos:
- `api/services/pdfGenerator.js`: Capa de bajo nivel — recibe datos estructurados y genera el PDF con PDFKit. No conoce la base de datos.
- `api/services/invoiceService.js`: Capa de negocio — consulta la BD, gestiona numeración, prepara los datos y delega a pdfGenerator.

**Rationale**: Separación de responsabilidades. El generador PDF es testeable de forma aislada. El servicio de facturación encapsula la lógica de negocio.

### D6: Pedidos mixtos → dos facturas separadas
**Decisión**: Si un pedido contiene items `art` (REBU) y `other` (estándar), se generan dos facturas independientes con números de serie distintos.
**Rationale**: No se pueden mezclar regímenes fiscales en un mismo documento. Es un requisito legal.

### D7: Costes de envío en facturas
**Decisión**:
- REBU: El envío se incluye en el total sin desglose de IVA (sigue el régimen REBU del producto).
- Estándar: El envío aparece como línea separada con base + IVA 21%.
**Rationale**: El envío sigue el régimen fiscal del producto al que está asociado.

### D8: Factura de comisión solo para régimen estándar
**Decisión**: La factura de comisión (serie C) solo se genera para items con `vat_regime = 'standard_vat'`. Para REBU se genera una nota de liquidación (serie L) que es un documento interno, no una factura fiscal.
**Rationale**: Bajo REBU, la galería no emite factura de comisión — el margen se gestiona internamente para el Modelo 303.

### D9: Generación post-pago
**Decisión**: Las facturas de comisión (C) y notas de liquidación (L) solo se pueden generar después de ejecutar el pago al artista. Los botones aparecen en el historial de pagos, no antes del pago.
**Rationale**: El documento fiscal se genera sobre operaciones ya ejecutadas, no sobre intenciones de pago.

### D10: Series de numeración
**Decisión**: 4 series independientes con formato `X-YYYY-NNNNN`:
- `A-2026-00001`: Factura REBU al comprador
- `P-2026-00001`: Factura estándar al comprador
- `C-2026-00001`: Factura de comisión al artista
- `L-2026-00001`: Nota de liquidación REBU

**Rationale**: Series separadas por tipo de documento permiten seguimiento fiscal claro y cumplen con la normativa española de numeración correlativa por serie.

## Risks / Trade-offs

- **[Concurrencia en numeración]** → Mitigación: usar transacción atómica (INSERT + SELECT MAX) en `createBatch()` para garantizar secuencia sin huecos. SQLite serializa escrituras, eliminando el riesgo de colisión.
- **[Fuente Inter no disponible]** → Mitigación: verificar existencia de archivos .ttf al arrancar. Fallback a Helvetica (embebida en PDFKit) con warning en logs.
- **[Datos incompletos en pedidos antiguos]** → Mitigación: validar datos mínimos antes de generar. Si faltan datos de facturación del comprador, retornar 400 con mensaje descriptivo.
- **[Tamaño del PDF en pedidos grandes]** → Mitigación: streaming directo al response (no buffer en memoria). PDFKit soporta pipe nativo.
- **[Regeneración modifica datos]** → No ocurre: los datos de pedidos y pagos son inmutables una vez creados/ejecutados.
