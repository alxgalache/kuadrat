## Context

> **Lectura previa obligatoria:** `docs/stripe_connect/master_plan.md`. Este design.md asume que el lector ha leído ese documento y se concentra en las decisiones específicas del Change #1 (`stripe-connect-accounts`).

Hasta ahora, la integración de Stripe en el repo (`api/services/stripeService.js`) sólo cubre el lado del **comprador**: creación de `PaymentIntent`, `findOrCreateCustomer`, `SetupIntent` para auctions, y un webhook `payment_intent.succeeded` que libera inventario en caso de fallo. No existe ninguna pieza de Connect — ni cuentas conectadas, ni transfers, ni webhooks de Connect.

El monedero del artista (`users.available_withdrawal`) se acredita en `api/scheduler/confirmationScheduler.js` cuando un item está confirmado (`status='arrived'` con `sendcloud_shipment_id`) tras `SENDCLOUD_AUTO_CONFIRM_DAYS` (14 días por defecto). El "payout" actual al artista consiste en que el seller pulsa "Realizar transferencia" en su monedero, lo que dispara un email al admin con los datos del IBAN y el admin hace la transferencia bancaria por su cuenta. **Ese flujo se mantiene intacto en este Change #1**: este change sólo añade el lifecycle de la cuenta conectada en Stripe, sin tocar todavía el flujo de pago real (eso es Change #2).

### Stack actual relevante

- **API:** Express.js (Node 20), Turso (libsql/SQLite-compatible).
- **Validación:** Zod schemas en `api/validators/` aplicados via `validate()` middleware.
- **Logging:** Pino estructurado (`config/logger.js`). Cero `console.log` en producción.
- **Config:** centralizada en `api/config/env.js` (singleton, validado al startup).
- **Schema:** definido en `api/config/database.js` con `CREATE TABLE IF NOT EXISTS`. Source of truth única — nunca `ALTER TABLE`.
- **Errores:** clase `ApiError` lanzada desde controllers, capturada por middleware global.
- **Stripe SDK:** ya instalado (`require('stripe')`); cliente singleton creado en `stripeService.js`.
- **Webhook actual:** `POST /api/stripe/webhook` con `STRIPE_WEBHOOK_SECRET`, raw body.
- **Frontend:** Next.js 16 App Router, TailwindCSS, JavaScript (no TypeScript). Componentes admin en `client/app/admin/...`, seller en `client/app/seller/...`.

### Estado de la cuenta de Stripe

- La cuenta del platform NO tiene Connect activado todavía. Activarlo es el paso 0 del rollout (manual, en el dashboard de Stripe).
- Los datos públicos del platform en Stripe (nombre comercial, soporte, dominio) deben configurarse a `140d Galería de Arte`, `info@140d.art`, `https://pre.140d.art` (o `https://140d.art` cuando se promueva a producción).

## Goals / Non-Goals

### Goals

- Permitir al admin crear una **cuenta conectada Stripe** para cualquier seller existente desde la página de detalle del autor.
- Permitir al artista (seller) **completar el onboarding** vía un link hosted por Stripe que recibe por email o que ve directamente en su dashboard.
- Mantener el estado de la cuenta conectada **sincronizado en BD** (`stripe_connect_status`, `stripe_transfers_capability_active`, `stripe_connect_requirements_due`) tanto reactivamente (webhook) como bajo demanda (botón "Sincronizar").
- Capturar **datos fiscales del artista** (`tax_status`, `tax_id`, `fiscal_*`, `irpf_retention_rate`, `autofactura_agreement_signed_at`) en una sección admin nueva, prerrequisito para la facturación de los Changes #2 y #4.
- Hacer todas las operaciones de creación **idempotentes** (resilientes a race conditions y reintentos).
- Establecer la **infraestructura del webhook de Connect** (controlador, parsing thin events, log de idempotencia, despacho a handlers) sobre la que se construirán los handlers de transfers en el Change #2.

### Non-Goals

- **No** implementar la creación de transfers, ni el monedero dual, ni la modal de irreversibilidad → Change #2.
- **No** implementar la acreditación de eventos al monedero → Change #3.
- **No** implementar el export fiscal CSV/JSON ni el informe markdown para la gestoría → Change #4.
- **No** generar PDFs de autofactura. La gestoría los emitirá en su ERP a partir del export del Change #4.
- **No** validar contra servicios externos (AEAT, EORI, etc.) los campos fiscales — sólo regex de formato.
- **No** permitir al seller iniciar la creación de su cuenta. Sólo el admin la puede crear. El seller sólo puede continuar el onboarding ya iniciado.
- **No** soportar artistas residentes fuera de España. El `identity.country` está hard-coded a `'es'`.
- **No** soportar tests automatizados (no hay test suite configurada en el proyecto). Verificación manual con `stripe listen --thin-events` y cuenta de Stripe en test mode.

## Decisions

### 1. Stripe Connect V2 API (`v2.core.accounts.create`), no V1 legacy

**Decision:** Usar exclusivamente la API V2 de cuentas (`stripeClient.v2.core.accounts.create`, `stripeClient.v2.core.accountLinks.create`, `stripeClient.v2.core.accounts.retrieve`). No usar **nunca** la API V1 legacy con `type: 'express'` / `'standard'` / `'custom'`.

**Alternativas consideradas:**

- **V1 con `type: 'express'`:** la API legacy más conocida. Descartada porque (a) Stripe la considera deprecated en favor de V2, (b) la guía oficial reciente del usuario (`docs/stripe_connect/interactive_platform_guide.md`) prescribe explícitamente V2 con `configuration.recipient`, y (c) V2 es la única que permite el modelo "recipient-only" (cuenta que sólo recibe transferencias, no procesa pagos), que es exactamente lo que necesitamos en el modelo separate charges and transfers.
- **V1 con `type: 'custom'`:** descartada porque obliga a construir UI de KYC propia.

**Justificación:** la guía oficial de Stripe que el usuario aportó (`interactive_platform_guide.md`) prescribe textualmente "Only use the above properties when creating accounts. Never pass type at the top level. **Do not use top level type: 'express' or type: 'standard' or type 'custom'.**" — y la conversación de exploración confirmó que ninguna de las características de V1 nos hace falta.

### 2. Configuración recipient-only (sin merchant ni storer)

**Decision:** En la llamada `accounts.create`, pasar **únicamente** `configuration.recipient`. **No** pasar `configuration.merchant` ni `configuration.storer`.

```js
configuration: {
  recipient: {
    capabilities: {
      stripe_balance: {
        stripe_transfers: { requested: true },
      },
    },
  },
},
```

**Razón:** el artista NO necesita aceptar pagos directamente desde su cuenta (todos los pagos los procesa la cuenta del platform), sólo necesita **recibir transferencias** del platform. La capability `stripe_balance.stripe_transfers` es exactamente eso.

**Implicación:** Stripe inferirá automáticamente que el `service_agreement` es `recipient`, lo que (según `docs/stripe_connect/service-agreement-types.md`) implica un onboarding más ligero, sin requisitos de identidad de comerciante (sólo de receptor de fondos), apropiado para artistas particulares y autónomos pequeños.

### 3. `dashboard: 'express'`

**Decision:** Usar `dashboard: 'express'` en la creación de la cuenta.

**Alternativas consideradas:**

- **`dashboard: 'none'`:** sin dashboard hosted. Descartada porque obligaría al artista a usar SOLO nuestra UI para ver el estado de su cuenta, requirements, payouts, balance, etc. — esto multiplica el trabajo de frontend y nos obliga a mantener parida con cambios regulatorios.
- **`dashboard: 'full'`:** dashboard completo de Stripe. Descartada porque expone funcionalidades innecesarias al artista (crear productos, configurar checkout, etc.) que no aplican a nuestro modelo.

**Justificación:** `'express'` proporciona un dashboard hosted minimalista donde el artista ve sus payouts recibidos, balance, datos de identidad, sin exponerle herramientas que no le aplican. Es exactamente el sweet spot para nuestro caso.

### 4. `responsibilities: { fees_collector: 'application', losses_collector: 'application' }`

**Decision:** El platform asume tanto las fees de Stripe como las pérdidas (chargebacks, fraudes, refunds).

**Razón:** estamos en modelo Marketplace donde el platform es Merchant of Record. El artista no debe ver las fees de Stripe ni asumir el riesgo de chargebacks de los compradores; eso es responsabilidad de 140d Galería de Arte como operador del marketplace.

### 5. `identity.country: 'es'` hard-coded

**Decision:** El país en `accounts.create` se pasa siempre como `'es'`.

**Razón:** todos los artistas son residentes fiscales en España (constraint del negocio confirmado en exploración). El régimen REBU es específico de España. Si en el futuro se quiere soportar artistas de otros países, hay que reabrir muchas decisiones (régimen fiscal, datos fiscales, modelo de autofactura, etc.) — fuera del scope.

**Trade-off:** queda como TODO documentado en el master plan §10.

### 6. Idempotency keys en `accounts.create`

**Decision:** La llamada a `accounts.create` se hace con `idempotencyKey: \`account_create_user_${userId}_v1\``.

**Razón:** los race conditions son posibles si el admin pulsa "Crear cuenta" dos veces (rapid double-click, retry de red, browser refresh). Sin idempotency key, Stripe crearía dos cuentas distintas y sólo guardaríamos el ID de la última, dejando huérfana la primera (irrecuperable, las cuentas no se pueden eliminar desde la API).

**Justificación del sufijo `v1`:** si en el futuro hay que recrear la cuenta de un usuario porque la primera quedó en estado `rejected` o porque hubo un error, se cambia el sufijo a `v2`, etc. Permite la "recreación deliberada" sin colisionar con el idempotency key anterior.

**Validación adicional en BD:** además del idempotency key de Stripe, el endpoint admin comprueba primero si `users.stripe_connect_account_id IS NOT NULL` y, si lo es, devuelve la cuenta existente sin llamar a Stripe (early return). Doble defensa: BD guard + idempotency key.

### 7. `stripe_connect_status` como enum local mapeado del estado real de Stripe

**Decision:** Mantener una columna local `stripe_connect_status TEXT CHECK(... IN ('not_started','pending','active','restricted','rejected'))` y mapear el estado real de Stripe (`account.configuration.recipient.capabilities.stripe_balance.stripe_transfers.status`, `account.requirements.summary.minimum_deadline.status`) a este enum local en `syncAccountStatus()`.

**Tabla de mapeo:**

| Condiciones | `stripe_connect_status` |
|---|---|
| `users.stripe_connect_account_id IS NULL` | `not_started` |
| Cuenta creada, transfers `inactive` por requirements pendientes | `pending` |
| transfers `active` (`stripe_transfers.status === 'active'`) | `active` |
| transfers `pending`/`unrequested` con requirements `past_due` o `errored` | `restricted` |
| Cuenta marcada como `rejected` por Stripe (rejection del KYC, fraude, etc.) | `rejected` |

**Razón para no leer Stripe en cada request:** mostrar el banner del seller en cada page load disparando un `accounts.retrieve` sería costoso, lento, y susceptible a rate limits de Stripe. La columna local refleja el último estado conocido (sincronizado por webhook + sync manual). El admin tiene un botón "Sincronizar" para forzar el refresh cuando lo necesite.

**Trade-off aceptado:** puede haber drift temporal entre el estado real de Stripe y el local hasta que llegue el siguiente webhook. Esto es aceptable porque (a) los webhooks son rápidos en práctica, (b) el botón manual existe, y (c) el flujo crítico (ejecutar un transfer en Change #2) hará un sync forzado justo antes de crear el transfer.

### 8. Webhook de Connect en endpoint independiente, separado del webhook de pagos

**Decision:** Crear `POST /api/stripe/connect/webhook` como endpoint **separado** del `POST /api/stripe/webhook` actual. Cada uno tiene su propio `whsec_*` (`STRIPE_CONNECT_WEBHOOK_SECRET` vs `STRIPE_WEBHOOK_SECRET`).

**Alternativas consideradas:**

- **Un único endpoint con un único secret:** descartada porque (a) los eventos de Connect son `thin events` (V2), incompatibles con el parsing snapshot que usa el endpoint actual de `payment_intent.*`, y (b) mezclar eventos de comprador con eventos de cuenta dificulta el debugging y el observability.

**Justificación:** el endpoint de Connect usa `stripeClient.parseThinEvent()` y los handlers dispatch por tipo de evento V2; el endpoint de pagos usa `stripe.webhooks.constructEvent()` y dispatch por tipo snapshot V1. Son dos pipelines distintos, dos secrets distintos, dos endpoints distintos. Más limpio.

### 9. Tabla `stripe_connect_events` para idempotencia + log

**Decision:** Crear una tabla `stripe_connect_events` con `stripe_event_id UNIQUE` para que la inserción del evento al recibirlo actúe como guardia de idempotencia (si Stripe reintenta el mismo evento, el segundo INSERT falla y el handler no se ejecuta dos veces).

**Por qué no usar la tabla `stripe_events` existente** (si la hubiera): no existe una tabla así actualmente; el webhook de pagos hace dispatch sin persistencia (confía en la idempotencia del propio handler). Para Connect introducimos persistencia explícita porque (a) los eventos son raros y queremos un log diagnóstico, (b) los handlers son más complejos y queremos garantizar exactly-once.

**Campos clave:**
- `processed_at DATETIME` — NULL hasta que se haya manejado el evento. Si crashea entre el INSERT y el procesamiento, podemos detectar eventos huérfanos en una tarea de mantenimiento.
- `processing_error TEXT` — guarda el stack trace si el handler falla, para diagnóstico posterior.
- `payload_json TEXT` — guardamos el JSON resuelto (no el thin) para tener todo el contexto.

### 10. Tipo "thin events" en lugar de "snapshot events" para Connect

**Decision:** Configurar el endpoint webhook en el dashboard de Stripe como **payload "Thin"** y usar `stripeClient.parseThinEvent()` para el parsing.

**Razón:** los eventos V2 (`v2.core.account[requirements].updated` etc.) sólo existen en formato thin. Stripe lo prescribe explícitamente: "You must use thin events for V2 accounts" (`interactive_platform_guide.md`).

**Patrón de handler:**
```js
const thinEvent = stripeClient.parseThinEvent(rawBody, sigHeader, webhookSecret);
// thinEvent contiene { id, type, related_object: { type, id } }
// Para obtener el payload completo del evento:
const event = await stripeClient.v2.core.events.retrieve(thinEvent.id);
// Y luego, para obtener el objeto referenciado:
const account = await stripeClient.v2.core.accounts.retrieve(thinEvent.related_object.id, {
  include: ['configuration.recipient', 'requirements'],
});
```

**Trade-off:** los thin events requieren una llamada extra a Stripe (el `events.retrieve` o el `accounts.retrieve` para resolver el contexto). Es aceptable porque los webhooks de Connect son raros (no son cada compra como los `payment_intent.*`).

### 11. Hybrid onboarding: admin crea, artista completa

**Decision:** El flujo es siempre:
1. **Admin** abre la página del artista en `/admin/authors/[id]`, pulsa "Crear cuenta conectada" → la cuenta se crea en Stripe y se persiste el `acct_*`.
2. **Admin** pulsa "Generar enlace de onboarding" → recibe la URL en una modal con opción de copiar o "Enviar por email al artista".
3. **Artista** abre el link (desde el email o desde su dashboard si ya está visible el banner), completa los datos en el formulario hosted por Stripe (DNI/NIE, IBAN, dirección).
4. **Artista** vuelve a la app via `return_url` (`/seller/stripe-connect/return`).
5. **Webhook** llega del lado de Stripe (`v2.core.account[requirements].updated` y `capability_status_updated`) y actualiza el estado en BD a `active`.

**Alternativas consideradas:**

- **Self-service total:** el artista entra en su dashboard y pulsa él mismo "Conectar mi cuenta de pagos". Descartada porque (a) la operativa actual del negocio es que el admin gestiona los autores y los onboardea uno a uno, (b) crear la cuenta requiere `display_name` y `contact_email` que el admin debe revisar, (c) no queremos que el seller pueda crear cuentas duplicadas por error.
- **Admin-only total:** el admin rellena todos los datos de KYC del artista. Descartada porque eso supondría usar Custom Connect y construir una UI de KYC propia, multiplicando el trabajo y la responsabilidad legal.

**Justificación del híbrido:** el admin mantiene el control sobre la creación (gating + validación de datos básicos) pero el KYC lo hace Stripe sobre el propio artista, sin que el admin tenga que manejar copias de DNI ni IBAN.

### 12. Stripe-hosted onboarding (`account_links.create`), no Embedded Components

**Decision:** Usar `v2.core.accountLinks.create` con `use_case.account_onboarding.configurations: ['recipient']` y redirigir al artista a la URL hosted por Stripe.

**Alternativas consideradas:**

- **Embedded Components (`AccountOnboarding`):** integra el formulario KYC en un iframe dentro de nuestra app. Descartada porque (a) requiere instalar `@stripe/react-stripe-js` connect components y manejar el ciclo de vida, (b) hace que cualquier cambio regulatorio que añada nuevos campos rompa la UI hasta que actualicemos, (c) los hosted links son más resilientes y los actualiza Stripe sin que toquemos código.

**Justificación:** los hosted links son la opción más simple y más resiliente. El artista hace la transición a stripe.com, completa el formulario, vuelve a 140d Galería de Arte. La estética del formulario está customizada en el dashboard de Stripe (logo y colores del platform).

### 13. Datos fiscales como columnas en `users`, no tabla aparte

**Decision:** Añadir las columnas `tax_status`, `tax_id`, `fiscal_full_name`, `fiscal_address_*`, `irpf_retention_rate`, `autofactura_agreement_signed_at` directamente a la tabla `users`.

**Alternativas consideradas:**

- **Tabla `seller_fiscal_data` 1:1 con `users`:** descartada porque no hay ningún caso de uso donde un seller tenga múltiples conjuntos de datos fiscales, ni donde los datos fiscales se necesiten sin el resto de datos del usuario. Un join siempre necesario es señal de overengineering.

**Justificación:** el principio del proyecto es "el schema debe ser simple y la verdad sobre los users debe estar en `users`". Las columnas son NULLables salvo `fiscal_address_country` (default `'ES'`), así que sólo se llenan para usuarios con `role='seller'`. Los buyers tienen estos campos vacíos, lo cual es semánticamente correcto.

### 14. `irpf_retention_rate` NULLable, sin lógica aplicada en v1

**Decision:** Añadir el campo `irpf_retention_rate REAL` (NULLable) al schema. **No** aplicarlo en ningún cálculo en v1 (ni en wallet, ni en payouts, ni en facturas).

**Razón:** el usuario quiere capturar el dato ahora para no tener que migrar el schema en el futuro. La aplicación de retenciones IRPF es legalmente compleja (depende del régimen del artista, del importe acumulado, del tipo de operación) y queda explícitamente fuera del scope v1. Cuando se aborde, será un change OpenSpec dedicado.

**UI:** el input numérico opcional aparece en el form de datos fiscales con tooltip "Out of scope v1 — campo preparado para futuro. No se aplica a los pagos actuales."

### 15. Validación regex de `tax_id` (DNI/NIE/CIF español)

**Decision:** Validar `tax_id` con un schema Zod que admita los tres formatos:
- DNI: 8 dígitos + letra (`/^\d{8}[A-Z]$/`)
- NIE: letra X/Y/Z + 7 dígitos + letra (`/^[XYZ]\d{7}[A-Z]$/`)
- CIF: letra + 7 dígitos + dígito o letra de control (`/^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/`)

**Trade-off:** la validación es de **formato**, no de **autenticidad**. No comprobamos contra AEAT. Si un artista pone un DNI inventado pero con formato válido, pasa. Es aceptable porque la verificación real la hace Stripe en el KYC del onboarding.

### 16. URLs del seller para return/refresh: páginas intermedias en Next.js

**Decision:** Crear dos páginas en `client/app/seller/stripe-connect/`:
- `/return/page.js` — recibe `?account=acct_*` (o `?account_id=acct_*`), llama a `GET /api/seller/stripe-connect/status` para forzar un sync, espera hasta 2s mostrando un spinner "Actualizando estado de tu cuenta...", luego redirige a `/seller` con un toast de éxito o de error según el estado resultante.
- `/refresh/page.js` — recibe `?account=acct_*` (Stripe lo envía cuando un link expira), llama a `POST /api/seller/stripe-connect/onboarding-link` para regenerar el link y redirige inmediatamente a la nueva URL.

**Razón para páginas intermedias en lugar de redirects directos:** el `return_url` lo abre el navegador del artista al volver de Stripe, y necesitamos un momento para sincronizar el estado en BD antes de mostrarle el dashboard, porque de lo contrario el artista vería el banner aún en estado `pending` durante unos segundos hasta que el webhook llegue.

### 17. Email de onboarding link al artista

**Decision:** Cuando el admin pulsa "Enviar por email al artista" en la modal del link, se dispara un email con:
- Subject: `"140d Galería de Arte — Completa tu cuenta de pagos"`.
- Body en HTML con el branding del platform (140d, no Kuadrat), un párrafo explicando qué va a pedir Stripe (DNI/NIE, IBAN, dirección), un botón "Completar onboarding" enlazando a la URL, y un párrafo de pie con contacto.
- From: `EMAIL_FROM` (info@140d.art).

**Razón para tener email manual** (no automático al crear la cuenta): el admin puede querer crear varias cuentas en batch y enviar los emails después, o usar un canal alternativo (WhatsApp, llamada). Mantener el envío como acción explícita evita emails no deseados.

### 18. No tests automatizados — verificación manual con `stripe listen`

**Decision:** No escribir tests automatizados para este change. Verificación manual con:
- Cuenta de Stripe en test mode con Connect activado.
- `stripe listen --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated' --forward-thin-to http://localhost:3001/api/stripe/connect/webhook` (CLI de Stripe).
- Crear una cuenta de test, completar el onboarding con datos de test (`000000000` etc.), verificar que el estado se actualiza en BD y en la UI del seller.

**Razón:** el proyecto no tiene test suite. Introducir tests sólo para este change crearía una isla de tests sin infra de soporte. Cuando exista test suite, este change será uno de los primeros candidatos a tener cobertura.

## Risks / Trade-offs

- **Riesgo: Stripe rechaza la cuenta del artista en el KYC.** Si Stripe determina que el artista no puede recibir transfers (datos falsos, lista de sanciones, etc.), la cuenta queda en estado `rejected`. **Mitigación:** la UI del admin y del seller muestra el estado claramente. El admin debe contactar al artista por canal externo. No hay recurso técnico desde la app.

- **Riesgo: drift entre el estado de Stripe y el estado en BD.** Los webhooks pueden retrasarse o perderse (Stripe reintenta hasta 3 días, pero entre intentos hay drift). **Mitigación:** botón manual "Sincronizar" en el admin, sync forzado antes de cualquier operación crítica en Change #2, log de eventos en `stripe_connect_events` para diagnóstico.

- **Riesgo: idempotency key colisión si el admin "recrea" una cuenta tras un rejection.** Si la cuenta del usuario ID 42 fue rechazada y el admin quiere intentarlo de nuevo, el idempotency key `account_create_user_42_v1` ya está usado y Stripe devolvería la cuenta vieja rechazada. **Mitigación:** el sufijo `v1` permite manualmente cambiar a `v2` desde código si hace falta. En v1, si una cuenta es rejected, el admin debe contactar a Stripe support para resolverlo o aceptar que el artista no puede operar.

- **Riesgo: leak del internal name "Kuadrat" al artista.** Si por error alguna copia, log visible al usuario, o email contiene "Kuadrat", se rompe el branding público. **Mitigación:** memoria persistente del usuario (`feedback_public_branding.md`), revisión del código antes de merge, y todos los strings user-facing en este change usan explícitamente `"140d Galería de Arte"`.

- **Riesgo: `display_name` y `contact_email` de la cuenta Stripe quedan obsoletos si el seller cambia su perfil.** **Mitigación:** los `accounts` V2 permiten `update`. Documentado como TODO para el Change #2 o un change de mantenimiento separado. En v1, si el seller cambia su nombre, hay que actualizar la cuenta manualmente desde el dashboard de Stripe.

- **Trade-off: la columna `stripe_connect_requirements_due` es un JSON blob, no una tabla normalizada.** Esto significa que no podemos hacer queries tipo "todas las cuentas con un requirement específico pendiente". **Justificación:** los requirements los lee y los muestra el frontend tal cual; no necesitamos queries por requirement individual. Mantenerlo como blob simplifica el schema y el sync.

- **Trade-off: el form de datos fiscales no valida el `tax_id` contra AEAT.** Si el artista pone un DNI con formato válido pero inventado, pasa nuestra validación. **Justificación:** la validación real la hace Stripe en el KYC. Si llega un mismatch (Stripe rechaza por DNI inválido aunque el formato sea correcto), el `stripe_connect_status` lo refleja.

- **Trade-off: capturar datos fiscales del artista fuera del flujo de Stripe (en nuestra propia BD) duplica información.** Stripe ya guarda nombre, dirección, etc. en la cuenta conectada. **Justificación:** necesitamos los datos en BD para emitir autofacturas/facturas (Change #4) sin tener que llamar a Stripe en cada generación. Además, Stripe no captura `tax_status` (particular vs autónomo) ni `irpf_retention_rate` ni `autofactura_agreement_signed_at` — esos son específicos del régimen español.

## Migration Plan

### Paso 0 — preparación externa (manual, antes del deploy)

1. Activar Stripe Connect en la cuenta del platform (test mode primero).
2. Configurar el branding del platform en el dashboard de Stripe Connect:
   - Display name público: `140d Galería de Arte`.
   - Soporte email: `info@140d.art`.
   - URL del platform: `https://pre.140d.art` (test mode) / `https://140d.art` (live).
   - Logo del platform: subir el logo de 140d.
3. Crear el webhook endpoint en el dashboard de Stripe:
   - URL: `https://api.pre.140d.art/api/stripe/connect/webhook` (test) / `https://api.140d.art/api/stripe/connect/webhook` (live).
   - Eventos: `v2.core.account[requirements].updated`, `v2.core.account[configuration.recipient].capability_status_updated`.
   - Payload type: **Thin** (esto es crítico — sin esto, los handlers no parsearán correctamente).
   - Copiar el `whsec_*` generado y guardarlo en `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. Verificar la versión del SDK `stripe` (npm). Si la instalada no soporta `v2.core.accounts.*`, actualizar (sin downgrade del flujo del comprador).

### Paso 1 — schema (idempotente al deploy)

`api/config/database.js` se ejecuta en cada startup. Las nuevas columnas en `users` y la nueva tabla `stripe_connect_events` se añaden al `CREATE TABLE IF NOT EXISTS`. Pero **CUIDADO**: `CREATE TABLE IF NOT EXISTS` no añade columnas nuevas a una tabla existente — sólo crea la tabla si no existe.

**Estrategia para entornos con datos pre-existentes:**

Como el proyecto opera con un solo entorno de producción y staging que se rehidratan poco, la regla del proyecto es escribir el `CREATE TABLE` con todos los campos finales y aceptar que en entornos existentes hay que correr **una migración manual una sola vez**. Crear el script:

```
api/migrations/2026-04-stripe-connect-accounts.sql
```

Con los `ALTER TABLE users ADD COLUMN ...` correspondientes (uno por cada columna nueva — Turso soporta `ALTER TABLE ... ADD COLUMN`). El script es ejecutable manualmente con `turso db shell <db-name> < api/migrations/2026-04-stripe-connect-accounts.sql`. Para la tabla `stripe_connect_events`, basta con que se ejecute `initializeDatabase()` al deploy (la tabla se crea por `IF NOT EXISTS`).

Documentar este paso explícitamente en `tasks.md` y avisar al admin antes del deploy.

### Paso 2 — backend (deploy)

Deploy del nuevo código backend. En el primer startup:
- `initializeDatabase()` crea `stripe_connect_events` (idempotente).
- `config.stripe.connect.*` se valida (las URLs son optional con default; el secret es required SOLO si `STRIPE_CONNECT_ENABLED=true`).
- El endpoint `/api/stripe/connect/webhook` queda activo.

### Paso 3 — frontend (deploy)

Deploy del nuevo código frontend. En el dashboard del seller, los sellers ven el banner (en estado `not_started` para todos hasta que el admin cree sus cuentas).

### Paso 4 — onboarding gradual de los artistas

El admin entra en cada autor uno a uno y:
1. Rellena los datos fiscales (con los datos que tenga; si faltan, los pide al artista).
2. Pulsa "Crear cuenta conectada".
3. Pulsa "Generar enlace" → "Enviar por email al artista".
4. Espera a que el artista complete el onboarding.
5. Verifica que el estado pasa a `active`.

Este paso es **gradual** y puede tardar semanas. Durante esta ventana, los pagos al artista siguen siendo manuales (transferencia bancaria del admin) — eso no cambia hasta que se implemente Change #2 Y el artista tenga su cuenta `active`.

### Paso 5 — listo para Change #2

Cuando todos los artistas activos tengan `stripe_connect_status='active'`, se puede empezar el Change #2 (`stripe-connect-manual-payouts`).

## Open Questions

1. **¿Activamos Stripe Connect en la cuenta de live mode antes del deploy a producción, o esperamos a tener todo testeado en test mode?** Recomendación: activar en test mode primero, hacer el roundtrip completo con un par de artistas de prueba en pre.140d.art, y sólo entonces activar live. _(decidir antes del Paso 0)_
2. **Qué hacer con sellers existentes que no tienen `tax_id` ni datos fiscales todavía:** ¿bloqueamos la creación de la cuenta hasta que el admin rellene los datos fiscales? Recomendación: **sí**, bloquear (validación en el endpoint `POST /api/admin/sellers/:id/stripe-connect/create`). El admin verá un mensaje claro "Rellena los datos fiscales antes de crear la cuenta de pagos". _(decisión final pendiente — afecta a las scenarios del spec.md)_
3. **Para artistas con `tax_status='particular'`, ¿exigimos `autofactura_agreement_signed_at` antes de poder ejecutar transfers en Change #2?** No afecta a este Change #1, pero hay que decidirlo antes de Change #2. Actualmente el campo es informativo.
