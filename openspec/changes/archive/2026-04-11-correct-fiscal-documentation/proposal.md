## Why

La implementación actual del modelo fiscal de Stripe Connect (4 changes archivados: `stripe-connect-accounts`, `stripe-connect-manual-payouts`, `stripe-connect-events-wallet`, `stripe-connect-fiscal-report`) contiene **errores fundamentales** en la documentación canónica que describe el régimen tributario, el flujo de facturación y el modelo de relación entre la galería, el artista y el comprador.

Estos errores fueron identificados al contrastar la implementación con el modelo correcto descrito en `docs/rebuild_invoicing/master_rebuild.md` y `docs/rebuild_invoicing/master_rebuild_summary.md` (conversación con Gemini sobre el modelo fiscal real de la empresa).

> **Lectura obligatoria antes de actuar:** `docs/rebuild_invoicing/master_rebuild.md` (fuente de verdad del modelo correcto), `docs/rebuild_invoicing/master_rebuild_summary.md` (tablas resumen con cálculos correctos).

### Errores a corregir

| # | Error | Ubicación | Corrección |
|---|---|---|---|
| 1 | **Tipo de IVA REBU: 10% → 21%** | master_plan §2.1, §2.2; gestoria §3.1, §8.1, §8.2, §8.5, §11 | En el REBU español, el IVA sobre el margen del comisionista se calcula al tipo **general (21%)**, no al reducido (10%). El 10% es el tipo que aplica el ARTISTA como creador en la factura que emite a la galería, pero el IVA que la galería ingresa a Hacienda sobre su margen es al 21%. |
| 2 | **Eliminación del estatus `particular`** | master_plan §2.3, §4.1, §7, §8; gestoria §5, §8.1, §11 | Según la legislación de Hacienda, todo vendedor que opera a través de la plataforma debe estar dado de alta en el Censo de Empresarios (modelo 036/037), independientemente de su relación con la Seguridad Social. La exención del SMI sólo aplica a la cuota de autónomos (Seguridad Social), NO a las obligaciones con Hacienda. Se elimina `particular` como valor válido de `tax_status`. |
| 3 | **Eliminación completa de la autofacturación** | master_plan §2.3, §4.1, §7, §8; gestoria §5, §8.1, §11 | Al no existir artistas particulares, desaparece el caso de uso de la autofacturación (art. 5 RF). Todos los artistas (autónomos o sociedades) emiten su propia factura a la galería. Se eliminan las referencias a `autofactura_agreement_signed_at`, `invoicing_mode`, y el modo `autofactura`/`pending_agreement`. |
| 4 | **Modelo conceptual de facturación artista↔galería** | master_plan §2.3; gestoria §2, §5 | El modelo actual dice "el artista emite factura por la comisión". El correcto es: **el artista emite factura a la galería por SU PARTE** (75% arte / 90% estándar), no por la comisión de la galería. La galería no emite factura al artista — es el artista quien factura a la galería. |
| 5 | **Factura al comprador (REBU)** | gestoria §2, §4 | En REBU, la factura al comprador **NO desglosa IVA**. Sólo muestra el importe total y la mención legal obligatoria. La documentación actual no lo especifica claramente. |
| 6 | **Datos del informe fiscal para la gestoría** | gestoria §3.1, §8.1, §8.2, §11 | Los ejemplos numéricos CSV/JSON usan `10%` para REBU. Deben actualizarse a `21%` con los importes recalculados. Los campos `Modo facturación` y `Acuerdo autofacturación` deben eliminarse del formato. |

### Impacto

Este change es **sólo documental** — no toca código. Corrige la fuente de verdad (`master_plan.md`) y el documento de entrega a la gestoría (`fiscal_report_for_gestoria.md`) para que reflejen el modelo fiscal correcto. Los cambios de código se realizarán en el Change #2 posterior.

## What Changes

### Capa afectada: Documentación (sólo)

No se modifica ningún fichero de código. No hay cambios de schema de base de datos. No hay nuevas dependencias.

### Ficheros a modificar

#### 1. `docs/stripe_connect/master_plan.md`

**§2.1 — Tabla de comisiones:**
- Cambiar `Tributa REBU 10%` → `REBU (IVA 21% sobre el margen)`

**§2.2 — Régimen fiscal:**
- Cambiar IVA para obras de arte de `10 %` a `21 %` sobre el margen
- Actualizar la nota explicativa: el 10% es el tipo del artista como creador, el 21% es el tipo general que aplica al margen REBU de la galería

**§2.3 — Estado fiscal del artista:**
- Eliminar el caso `particular` completamente
- Eliminar toda referencia a autofacturación (art. 5 RF)
- Reescribir la sección con sólo dos casos: `autonomo` y `sociedad`
- Documentar que el artista emite factura a la galería por su parte (no por la comisión)
- Explicar que el artista es quien emite la factura, nunca la galería al artista

**§4.1 — Schema `users`:**
- Cambiar CHECK de `tax_status` de `('particular','autonomo','sociedad')` a `('autonomo','sociedad')`
- Eliminar el campo `autofactura_agreement_signed_at`

**§4.2 — Schema `withdrawal_items`:**
- Cambiar comentario `-- 0.10 para REBU o 0.21 para estándar` a `-- 0.21 (tanto REBU como estándar aplican el tipo general)`

**§7 — Roadmap de changes:**
- Change #1: eliminar referencias a autofactura y particular en la descripción del form de datos fiscales (línea 453)
- Change #4: eliminar referencia a "artistas particulares (art. 5 RF)" en la descripción de documentación (línea 533-534)

**§8 — Tabla de decisiones:**
- Decisión #19: actualizar "Autofacturación: Option B (export CSV/JSON)" → reemplazar por una nueva decisión que refleje la eliminación de la autofacturación

**§10 — Asunciones:**
- Punto 5: Actualizar para eliminar referencia a autofacturación
- Añadir: "Todos los artistas deben estar dados de alta en Hacienda (036/037) para poder emitir facturas"

**§13 — Changelog:**
- Añadir entrada con la corrección del modelo fiscal

#### 2. `docs/stripe_connect/fiscal_report_for_gestoria.md`

**§2 — Modelo MoR:**
- Cambiar `REBU 10 %` → `REBU 21 %` (línea 33)
- Reescribir el punto sobre el artista: "el artista emite factura a la galería por su parte (75% arte / 90% estándar)" en lugar de "emite factura por la comisión"
- Eliminar referencia a autofacturación

**§3.1 — Arte / REBU:**
- Cambiar `10 %` a `21 %` en todo el bloque
- Actualizar la fórmula: `taxable_base = commission / 1,21` (no `/1,10`)
- Recalcular el ejemplo numérico completo:
  - Comisión 300€ → base = 300/1,21 = 247,93€ → IVA = 52,07€ (antes: 272,73€ y 27,27€)

**§4 — Flujo de cobro y pago:**
- Actualizar referencias al IVA aplicable (REBU = 21% sobre margen, no 10%)
- Línea 101: clarificar que en REBU la factura al comprador NO desglosa IVA

**§5 — Autofacturación:**
- **Reescribir completamente** → Eliminar autofacturación. Reemplazar por sección "Facturación del artista" que explique:
  - Todos los artistas (autónomos/sociedades) emiten su propia factura a la galería
  - La factura del artista es por SU PARTE de la venta (75%/90%), no por la comisión
  - La galería no emite factura al artista
  - Eliminar tabla de invoicing modes (autofactura/pending_agreement/factura_recibida)

**§8.1 — CSV individual (ejemplo):**
- Cambiar `10%` → `21%` en columna `% IVA`
- Recalcular importes: base imponible y IVA con tasa 21%
- Eliminar filas "Estado fiscal: particular", "Acuerdo autofacturación: Firmado el...", "Modo de facturación: Autofactura", "Explicación: 140d emite autofactura..."
- Cambiar "Estado fiscal" por valor de ejemplo `autonomo`

**§8.2 — CSV agregado (ejemplo):**
- Mismas correcciones de tasa y eliminación de "Modo facturación" → "Autofactura"
- Actualizar ejemplo: "Factura recibida" como único modo

**§8.5 — Cómo importar al ERP:**
- Punto 4: Cambiar "el tipo de IVA al **10 %**" → "**21 %**" para REBU
- Eliminar referencia a autofacturas y autonumeración

**§11 — Glosario:**
- Eliminar campos: `Acuerdo autofacturación`, `Modo de facturación`, `Explicación`
- Cambiar `Estado fiscal`: eliminar `particular` del texto
- Cambiar `% IVA`: de `10% (REBU)` a `21% (REBU)`
- Actualizar `Base imponible`: fórmula usa `1,21` no `1,10`

### Ficheros NO modificados (confirmados sin errores)

- `docs/stripe_connect/onboarding.md` — Sin referencias fiscales
- `docs/stripe_connect/service-agreement-types.md` — Sin referencias fiscales
- `docs/stripe_connect/connected-account-configuration.md` — Sin referencias fiscales
- `docs/stripe_connect/interactive_platform_guide.md` — Template genérico de Stripe
- `docs/stripe_connect/integration-recommendations.md` — Sin referencias fiscales
- `docs/stripe_connect/init.md` — Requisitos originales (se conservan como referencia histórica)
- `docs/rebuild_invoicing/*` — Son los documentos de referencia correctos, no se tocan

## Non-goals

- **No se modifica código en este change.** Los cambios de `vatCalculator.js`, `fiscalReportFormatter.js`, schema de base de datos, schedulers y controladores se realizan en el Change #2.
- **No se implementa el motor de generación de facturas PDF.** Eso es el Change #3.
- **No se generan facturas al comprador.** Sólo se documenta cómo deben ser.
- **No se cambian los ficheros de rebuild_invoicing.** Son la fuente de verdad del modelo correcto.
- **No se elimina código de autofacturación.** La eliminación del código se hará en el Change #2.

## Risks

- **Riesgo bajo.** Este change es puramente documental. No hay riesgo de rotura de funcionalidad.
- **Coherencia:** La documentación quedará temporalmente desalineada con el código hasta que se implemente el Change #2. Se añadirá un banner `⚠️ PENDIENTE DE IMPLEMENTACIÓN` en las secciones afectadas del master_plan.md hasta que el Change #2 actualice el código.
