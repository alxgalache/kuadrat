# Tasks — correct-fiscal-documentation

> **Lectura previa obligatoria:** `docs/rebuild_invoicing/master_rebuild.md` y `docs/rebuild_invoicing/master_rebuild_summary.md` (fuentes de verdad del modelo correcto). Leer `proposal.md` de este change.

## Fase 1 — master_plan.md

- [x] 1.1 Corregir §2.1 (tabla de comisiones): `Tributa REBU 10%` → `REBU (IVA 21% sobre el margen)`.
- [x] 1.2 Corregir §2.2 (régimen fiscal): `10 %` → `21 %` sobre el margen. Actualizar nota explicativa.
- [x] 1.3 Reescribir §2.3 (estado fiscal del artista): eliminar `particular`, eliminar autofacturación, dejar sólo `autonomo`/`sociedad`, documentar que el artista factura a la galería por su parte (75%/90%).
- [x] 1.4 Corregir §4.1 (schema users): eliminar `particular` del CHECK, eliminar `autofactura_agreement_signed_at`.
- [x] 1.5 Corregir §4.2 (schema withdrawal_items): comentario de vat_rate `0.10` → `0.21`.
- [x] 1.6 Corregir §7 (roadmap): eliminar referencias a autofactura y particular en Change #1 y Change #4.
- [x] 1.7 Corregir §8 (decisiones): reescribir decisión #19 sobre autofacturación.
- [x] 1.8 Corregir §10 (asunciones): eliminar referencia a autofacturación, añadir asunción de alta en Hacienda obligatoria.
- [x] 1.9 Añadir entrada en §13 (changelog) documentando las correcciones.

## Fase 2 — fiscal_report_for_gestoria.md

- [x] 2.1 Corregir §2 (modelo MoR): `REBU 10 %` → `REBU 21 %`, reescribir punto de facturación artista→galería, eliminar autofacturación.
- [x] 2.2 Corregir §3.1 (arte/REBU): cambiar `10 %` → `21 %` en todo el bloque, recalcular ejemplo numérico (comisión 300€: base=247,93€, IVA=52,07€).
- [x] 2.3 Corregir §4 (flujo de cobro): clarificar factura al comprador REBU (sin desglose IVA), actualizar referencias al 21%.
- [x] 2.4 Reescribir §5 completamente: eliminar autofacturación, reemplazar por "Facturación entre galería y artista" (todos emiten su propia factura).
- [x] 2.5 Corregir §8.1 (CSV individual): eliminar `particular`/autofactura, cambiar `10%`→`21%`, recalcular importes.
- [x] 2.6 Corregir §8.2 (CSV agregado): eliminar columna "Modo facturación", cambiar `10%`→`21%`, recalcular.
- [x] 2.7 Corregir §8.5 (importar al ERP): `10 %` → `21 %`, eliminar referencia a autofacturas.
- [x] 2.8 Corregir §11 (glosario): eliminar `particular` de `Estado fiscal`, cambiar `10%`→`21%` en `% IVA`, eliminar campos de autofacturación.

## Fase 3 — Verificación

- [x] 3.1 Buscar en ambos ficheros: `10 %`, `10%`, `0.10`, `0,10`, `particular`, `autofactura`, `pending_agreement`, `invoicing_mode`. Verificar que ninguna aparece en contexto activo (sólo en changelog §13 como referencia histórica).
- [x] 3.2 Verificar que los ejemplos numéricos son internamente consistentes (sumas cuadran).
- [x] 3.3 Verificar coherencia entre master_plan.md y fiscal_report_for_gestoria.md.
