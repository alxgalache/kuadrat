# Plan: Corrección del Modelo de Facturación

## Problema

La implementación actual del modelo fiscal/facturación en Stripe Connect tiene errores fundamentales heredados de las 4 propuestas anteriores de openspec. El modelo correcto está documentado en `docs/rebuild_invoicing/master_rebuild.md` y `master_rebuild_summary.md` (información provista por Gemini).

**Error principal:** VAT_RATE_REBU = 0.10 → debería ser 0.21 (el tipo general se aplica al margen del comisionista, no el reducido del 10% que aplica al artista como creador).

## Enfoque

Tres cambios de openspec secuenciales:

### Cambio #1: Corrección de documentación fiscal (`correct-fiscal-documentation`)
- Actualizar `docs/stripe_connect/master_plan.md` con el modelo correcto de Gemini
- Actualizar `docs/stripe_connect/fiscal_report_for_gestoria.md`
- Actualizar otros ficheros afectados en `docs/stripe_connect/`

### Cambio #2: Corrección de código y lógica (`correct-invoicing-logic`)
- Cambiar `VAT_RATE_REBU` de 0.10 a 0.21 en `vatCalculator.js`
- Eliminar `tax_status = 'particular'` del schema y código
- Eliminar funcionalidad de autofacturación
- Actualizar informe fiscal (`fiscalReportFormatter.js`)
- Nota IVA en formulario de creación de productos estándar
- Actualizar schedulers y controllers afectados

### Cambio #3: Motor de generación de facturas PDF (`buyer-invoice-pdf`)
- Endpoint API para generar factura PDF bajo demanda
- Serie A- (REBU arte) y P- (IVA 21% estándar)
- Factura simplificada (nombre + email comprador)
- REBU: sin desglose IVA + mención legal
- Estándar: base + 21% IVA + total
- Botón de descarga en panel admin

## Decisiones tomadas

| # | Decisión | Valor |
|---|----------|-------|
| 1 | Precio estándar incluye 21% IVA | Sí |
| 2 | Autofacturación | Eliminar completamente |
| 3 | Eventos incluyen 21% IVA | Sí |
| 4 | Factura artista → galería | Solo informativo (docs + informe fiscal) |
| 5 | `particular` en tax_status | Quitar del CHECK (BD ya limpia) |
| 6 | Generación factura comprador | Bajo demanda desde admin panel |
| 7 | Acceso comprador a factura | No — solo admin |
| 8 | Almacenamiento PDF | No — descarga directa |
| 9 | Generación PDF | Backend (endpoint API) |
| 10 | Numeración facturas | A-2026-00001 (REBU) / P-2026-00001 (estándar) |
| 11 | Eventos generan factura | Sí (serie P-) |
| 12 | Datos comprador en factura | Factura simplificada (nombre + email) |

## Estado actual
- [x] Análisis completo de discrepancias
- [x] Feedback y preguntas resueltas
- [ ] Cambio #1: Propuesta → Implementación → Verificación
- [ ] Cambio #2: Propuesta → Implementación → Verificación
- [ ] Cambio #3: Propuesta → Implementación → Verificación
