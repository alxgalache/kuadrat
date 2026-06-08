## Context

Hoy las fichas de producto muestran SIEMPRE el botón "Añadir a la cesta":
- `client/app/galeria/p/[id]/ArtProductDetail.js` (obras `art`) — además ya integra `ArtProductInquiryModal` (consulta) bajo un gating por `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- `client/app/tienda/p/[id]/OthersProductDetail.js` (productos `other`).

La galería quiere poder operar en escenarios donde el pago no está activo o donde las obras se venden bajo cotización. La plataforma ya dispone de:
- Patrón de toggles build-time `NEXT_PUBLIC_*` parseados en `client/lib/constants.js` (p. ej. `SENDCLOUD_ENABLED_* = process.env.X === 'true'`) y el precedente fail-safe de `client/lib/env.js` (`NEXT_PUBLIC_APP_ENV`, default = production).
- Infra completa de consulta del change `2026-05-27-art-product-inquiry-form`: `ArtProductInquiryModal`, `inquiriesController.createArtInquiry`, `inquirySchemas.artInquirySchema`, `inquiryLimiter`, `turnstileService.verify`, `emailService.sendArtInquiryEmail`, `inquiriesAPI.createArtInquiry`.

Reutilizamos esa infra como **plantilla** pero creando piezas nuevas e independientes para la cotización, según pidió el usuario.

## Goals / Non-Goals

**Goals:**
- Dos toggles build-time que controlen la visibilidad del CTA de compra en `art` y `other` sin tocar el flujo de carrito/checkout.
- Un botón "Solicitar cotización" (solo `art`) que abra un formulario independiente con un campo extra de código postal y envíe la solicitud por email al buzón comercial.
- Reutilizar la protección Turnstile + `inquiryLimiter` ya existentes.
- Encajar en los patrones existentes (constants, Zod, response helpers, Pino, banner notifications, plantillas de email).

**Non-Goals:**
- No se persiste la cotización en BD (igual que las consultas; YAGNI).
- No se valida el código postal contra la BD de códigos postales (es informativo).
- No se añade cotización a productos `other`.
- No se modifica el flujo de carrito/checkout ni la lógica de pago en backend; los toggles son puramente de presentación en el cliente.
- No se factoriza código común entre `ArtProductInquiryModal` y `ArtProductQuoteModal` (el usuario pidió formularios totalmente independientes).

## Decisions

### D1 — Parseo fail-safe de los toggles (`!== 'false'`)

`PAYMENT_ENABLED` y `ART_BUY_AVAILABLE` se definen en `client/lib/constants.js` como `process.env.NEXT_PUBLIC_* !== 'false'`. Sin definir → `true` (preserva el comportamiento actual: cesta visible). Solo `'false'` desactiva.

**Por qué:** la tienda está en producción mostrando "Añadir a la cesta". Un default opt-in (`=== 'true'`) ocultaría la compra en cualquier deploy que no haya configurado las vars, rompiendo la tienda. El fail-safe está alineado con el precedente de `NEXT_PUBLIC_APP_ENV` (default = production). Se acepta la inconsistencia con `SENDCLOUD_ENABLED_*` (`=== 'true'`) porque aquí el riesgo de un default "apagado" es romper ventas.

### D2 — Tabla de verdad del CTA en `art`

```
PAYMENT_ENABLED   ART_BUY_AVAILABLE   → CTA
   false               false           → (ninguno)
   true                true            → "Añadir a la cesta"
   true                false           → "Solicitar cotización"
   false               true            → "Solicitar cotización"
```

Equivalente: `none` si ambos `false`; `cesta` si **ambos** `true`; `cotización` en otro caso. El estado "Vendido" (`is_sold === 1`) prevalece sobre todo.

**Por qué:** decisión del usuario — "Añadir a la cesta" requiere a la vez pago activo y compra de arte disponible; si solo una condición se cumple, ofrecemos cotización en lugar de cesta; si ninguna, no hay CTA. Se implementa con un helper local puro (p. ej. `getArtCta()`) para que la lógica quede explícita y testeable, evitando ternarios anidados ilegibles.

### D3 — CTA en `other` solo por `PAYMENT_ENABLED`

`OthersProductDetail` envuelve el bloque de acción (selector de cantidad + botón "Añadir a la cesta") en `PAYMENT_ENABLED`. El estado "Vendido"/sin stock se mantiene. `ART_BUY_AVAILABLE` no se importa aquí.

**Por qué:** la cotización es un concepto de obra de arte; los `other` no la ofrecen. Cuando el pago está desactivado simplemente no hay acción de compra.

### D4 — Componente `ArtProductQuoteModal` independiente

Nuevo `client/components/ArtProductQuoteModal.js`, copia adaptada de `ArtProductInquiryModal` (misma mecánica de Turnstile: `Script` explicit render, refs de widget, render/remove/reset en efectos), con:
- Título/subtítulo de cotización.
- Campo `postalCode` (obligatorio, debajo de `phone`), `message` etiquetado "Más información".
- `isValid` que además exige `postalCode` con formato 5 dígitos.
- Llama a `inquiriesAPI.createQuoteRequest(...)`.
- Lazy-loaded con `next/dynamic` (`ssr: false`) en `ArtProductDetail`, igual que el de consulta.

**Por qué:** el usuario pidió explícitamente formularios totalmente independientes (se asume duplicación de código deliberada). Mantener la mecánica idéntica de Turnstile reduce riesgo de regresión.

### D5 — Backend independiente `POST /api/inquiries/quote`

- `quoteRequestSchema` en `inquirySchemas.js`: como `artInquirySchema` + `postalCode: z.string().trim().regex(/^[0-9]{5}$/)`. `message` sigue obligatorio (la etiqueta "Más información" es solo UI).
- `createQuoteRequest` en `inquiriesController.js`: misma estructura que `createArtInquiry` (check `turnstile.secret` → verify → buscar obra → enviar email → `sendSuccess`), pero llama a `sendQuoteRequestEmail` y pasa `postalCode`.
- Ruta `POST /quote` en `inquiriesRoutes.js` con `inquiryLimiter` + `validate(quoteRequestSchema)`.
- `sendQuoteRequestEmail` en `emailService.js`: plantilla análoga a `sendArtInquiryEmail` con asunto/título "Solicitud de cotización", `Reply-To` = email del usuario, y una fila "Código postal de envío".

**Por qué:** misma razón que D4 (independencia). Reutiliza `inquiryLimiter`, `turnstileService` y `config.business.email`, que ya son genéricos. No requiere nuevas env vars de backend.

### D6 — Ocultar el mensaje de consulta cuando se muestra cotización

En `ArtProductDetail`, el bloque del prompt de consulta (`INQUIRY_COPY.prompt` + enlace) se renderiza solo cuando `TURNSTILE_ENABLED` **y** el CTA resuelto NO es "cotización".

**Por qué:** la cotización ya canaliza el contacto comercial; mostrar además el prompt de consulta sería redundante y confuso (requisito del usuario).

### D7 — Copy en `QUOTE_COPY` y límites propios

Nuevo bloque `QUOTE_COPY` y `QUOTE_FIELD_LIMITS` en `client/lib/constants.js` (no se reutiliza `INQUIRY_COPY`), incluyendo `labelPostalCode`, `placeholderPostalCode`, banners de éxito/error, etc. `postalCode` no necesita límite explícito de longitud (el regex fija 5).

**Por qué:** independencia total y textos es-ES distintos (título/subtítulo/etiquetas).

### D8 — Documentación de las dos `NEXT_PUBLIC_*` en los cuatro sitios

Por las reglas de CLAUDE.md, cada `NEXT_PUBLIC_*` debe añadirse en: (1) `/.env.example` raíz, (2) `client/.env.example`, (3) `client/Dockerfile.staging` **y** `client/Dockerfile.prod` (ARG + ENV antes de `RUN npm run build`), (4) `docker-compose.prod.yml` **y** `docker-compose.pre2.yml` (`build.args`). Además actualizar el grupo "Frontend environment identity" / nueva nota en `CLAUDE.md`.

**Por qué:** omitir cualquiera de ellos envía silenciosamente un valor vacío a producción. Como el parseo es `!== 'false'`, un valor vacío se interpreta como `true` (activado) — coherente con el fail-safe, pero igualmente hay que documentarlas para poder desactivarlas.

## Risks / Trade-offs

- **[Riesgo] Olvidar uno de los cuatro sitios de las env vars.** Con el parseo `!== 'false'`, un valor vacío equivale a "activado", así que el síntoma sería "no puedo desactivar el botón en X entorno" en vez de un crash.
  → **Mitigación:** checklist explícito en tasks.md; verificar build de staging.

- **[Trade-off] Duplicación de código entre los dos modales y entre los dos endpoints/plantillas.** Aceptada por requisito explícito del usuario (formularios independientes). Riesgo: divergencia futura en la mecánica de Turnstile.
  → **Mitigación:** copiar la mecánica verbatim y comentar en ambos que comparten patrón.

- **[Riesgo] CSP de Turnstile.** Ya está resuelta por el change de consulta (`challenges.cloudflare.com` en `script-src`/`frame-src`); el nuevo modal usa el mismo origen, no requiere cambios de CSP.

- **[Trade-off] `ART_BUY_AVAILABLE=true` + `PAYMENT_ENABLED=false` → cotización (no cesta).** Es lo decidido por el usuario; significa que "compra de arte disponible" por sí sola no habilita el carrito si el pago global está apagado. Documentado en la tabla de verdad (D2) para evitar confusión.

- **[Riesgo] El modal de cotización no muestra el campo postal en obras vendidas.** No aplica: en `is_sold` se muestra "Vendido" y ningún CTA de cotización, así que el modal no es accesible. Consistente.
