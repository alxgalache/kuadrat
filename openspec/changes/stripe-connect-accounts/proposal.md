## Why

140d Galería de Arte (nombre interno del repo: `kuadrat`) opera como un marketplace de arte online donde los artistas (sellers) publican obras y otros productos, y la plataforma se queda una comisión por cada venta. Hasta ahora, el flujo de pago al artista se gestiona de forma totalmente manual: la acción "Realizar transferencia" en el monedero del seller envía un email al admin con los datos del IBAN y el admin hace la transferencia bancaria por su cuenta, fuera de la aplicación.

Este flujo tiene dos problemas graves para escalar el negocio:

1. **No es trazable.** No queda constancia en la aplicación de qué pago se hizo, a quién, por qué importe, y qué items concretos lo componían. Para la declaración fiscal (REBU 10% para arte vs IVA estándar 21% para otros productos y eventos), la gestoría necesita el detalle item por item; reconstruirlo manualmente cada trimestre es inviable.
2. **No es seguro a nivel de KYC/AML.** El admin actúa como pagador final desde su banco personal o corporativo sin que la identidad del artista esté validada por una entidad financiera reconocida. Stripe Connect resuelve esto delegando el KYC a Stripe.

La solución elegida es **Stripe Connect** con el modelo **Marketplace** (separate charges and transfers), que mantiene el flujo de pago al artista bajo control manual del admin (importante por el plazo de 14 días de devoluciones del comprador) pero sustituye la transferencia bancaria personal por una llamada `transfers.create` a Stripe contra una **cuenta conectada** previamente onboardada por el artista.

Este change (**Change #1 de 4** en el roadmap definido en `docs/stripe_connect/master_plan.md`) cubre exclusivamente el **lifecycle de la cuenta conectada**: creación, onboarding del artista vía link hosted por Stripe, sincronización del estado mediante webhooks, y captura de los datos fiscales del artista necesarios para la posterior emisión de autofacturas o el registro de facturas recibidas.

**No** cubre todavía la ejecución de los payouts ni el monedero dual REBU/estándar (eso es Change #2). Pero es prerrequisito de los tres changes siguientes y debe implementarse primero para que el resto pueda construirse encima.

> **IMPORTANTE:** antes de implementar cualquier cosa de este change, leer el documento maestro `docs/stripe_connect/master_plan.md`. Captura todas las decisiones de la fase de exploración (modelo separate charges, V2 API, configuración recipient-only, branding público "140d Galería de Arte", régimen REBU vs estándar, asunciones, riesgos). Es la fuente única de verdad para toda la iniciativa.

## What Changes

### Backend

- **Nuevas variables de entorno** en `api/config/env.js` bajo `config.stripe.connect`:
  - `STRIPE_CONNECT_ENABLED` (default `false`).
  - `STRIPE_CONNECT_REFRESH_URL` (URL pública a la que Stripe redirige cuando un account link expira; ej: `https://pre.140d.art/seller/stripe-connect/refresh`).
  - `STRIPE_CONNECT_RETURN_URL` (URL pública a la que Stripe redirige al completar el onboarding; ej: `https://pre.140d.art/seller/stripe-connect/return`).
  - `STRIPE_CONNECT_WEBHOOK_SECRET` (distinto del `STRIPE_WEBHOOK_SECRET` actual; el webhook de Connect es un endpoint independiente).
  - Documentar todas en `api/.env.example`.
- **Schema additions** en la tabla `users` (ampliando el `CREATE TABLE IF NOT EXISTS users` en `api/config/database.js`):
  - `stripe_connect_account_id TEXT UNIQUE` — ID de Stripe (`acct_...`) de la cuenta conectada.
  - `stripe_connect_status TEXT CHECK(... IN ('not_started','pending','active','restricted','rejected')) DEFAULT 'not_started'`.
  - `stripe_transfers_capability_active INTEGER NOT NULL DEFAULT 0` — bool, refleja si `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === 'active'`.
  - `stripe_connect_requirements_due TEXT` — JSON snapshot del último `account.requirements.summary.minimum_deadline.currently_due[]` para mostrarlo al artista.
  - `stripe_connect_last_synced_at DATETIME`.
  - **Datos fiscales del artista** (necesarios para Change #2 y Change #4, pero capturados aquí porque son parte de la "ficha del artista para pagos"):
    - `tax_status TEXT CHECK(tax_status IN ('particular','autonomo','sociedad'))`.
    - `tax_id TEXT` (DNI/NIE/CIF).
    - `fiscal_full_name TEXT` (nombre o razón social legal).
    - `fiscal_address_line1 TEXT`, `fiscal_address_line2 TEXT`, `fiscal_address_city TEXT`, `fiscal_address_postal_code TEXT`, `fiscal_address_province TEXT`, `fiscal_address_country TEXT DEFAULT 'ES'`.
    - `irpf_retention_rate REAL` — NULLable; out of scope v1 pero campo preparado.
    - `autofactura_agreement_signed_at DATETIME` — timestamp de aceptación del acuerdo de autofacturación (para artistas particulares).
- **Nueva tabla** `stripe_connect_events` (log de webhooks recibidos para idempotencia):
  - Columnas: `id`, `stripe_event_id UNIQUE`, `stripe_event_type`, `account_id`, `payload_json`, `processed_at`, `processing_error`, `received_at`.
  - Índices: `(account_id)`, `(stripe_event_type)`.
- **Nuevo servicio** `api/services/stripeConnectService.js` con cuatro funciones puras de Stripe:
  - `createConnectedAccount({ user })` → llama a `stripeClient.v2.core.accounts.create(...)` con la configuración exacta del §6.2 del master plan (V2, recipient-only, dashboard express, responsibilities application, country `es`) e idempotencyKey derivada de `userId`.
  - `createOnboardingLink({ stripeAccountId })` → llama a `stripeClient.v2.core.accountLinks.create(...)` con `use_case.account_onboarding.configurations: ['recipient']` y las URLs configuradas.
  - `retrieveAccount(stripeAccountId)` → llama a `stripeClient.v2.core.accounts.retrieve(stripeAccountId, { include: ['configuration.recipient', 'requirements'] })`.
  - `syncAccountStatus({ user, account? })` → orquesta retrieve + update en BD; mapea estados Stripe → `stripe_connect_status` enum local; persiste todos los campos `stripe_connect_*`.
- **Nuevo controlador admin** `api/controllers/stripeConnectController.js` con 5 endpoints:
  - `POST /api/admin/sellers/:id/stripe-connect/create` — crea la cuenta conectada para un seller. Devuelve `{ stripe_connect_account_id, stripe_connect_status }`. Idempotente: si el seller ya tiene una cuenta, devuelve la existente.
  - `POST /api/admin/sellers/:id/stripe-connect/onboarding-link` — genera un account link y devuelve `{ url, expires_at }`. No persiste nada (los links son efímeros).
  - `GET /api/admin/sellers/:id/stripe-connect/status` — fuerza un sync (`syncAccountStatus`) y devuelve el estado actualizado.
  - `POST /api/seller/stripe-connect/onboarding-link` — versión seller-authenticated del endpoint de link, sólo permite generar el link para `req.user.id`.
  - `GET /api/seller/stripe-connect/status` — versión seller-authenticated del status, sólo `req.user.id`.
- **Nuevo controlador de webhook** `api/controllers/stripeConnectWebhookController.js`:
  - `POST /api/stripe/connect/webhook` — endpoint público (no auth, raw body), validado por firma con `STRIPE_CONNECT_WEBHOOK_SECRET` usando `stripeClient.parseThinEvent()`.
  - Handlers para `v2.core.account[requirements].updated` y `v2.core.account[configuration.recipient].capability_status_updated`. Ambos hacen `accounts.retrieve` y llaman a `syncAccountStatus`.
  - Idempotencia vía `stripe_connect_events` (insert con `stripe_event_id UNIQUE`; si ya existe, ignorar).
- **Nuevo endpoint admin** para datos fiscales: `PUT /api/admin/sellers/:id/fiscal` (en `api/controllers/usersController.js` o un nuevo `sellersFiscalController.js`). Recibe todos los campos `tax_*`, `fiscal_*`, `irpf_retention_rate`, `autofactura_agreement_signed_at`.
- **Validación Zod** en dos schemas nuevos:
  - `api/validators/stripeConnectSchemas.js` — valida los pocos parámetros que aceptan los endpoints de Stripe Connect.
  - `api/validators/fiscalSchemas.js` — valida `tax_status`, `tax_id` (regex DNI/NIE/CIF español), código postal, etc.
- **Routing**:
  - Añadir `stripeConnectRoutes.js` (admin) en `api/routes/admin/`.
  - Añadir endpoints seller en `api/routes/sellerRoutes.js` (o nuevo `stripeConnectSellerRoutes.js`).
  - Añadir el webhook en `api/routes/` raíz (no admin) con middleware `express.raw({ type: 'application/json' })`.
- **Seed/migration helper** para poblar `stripe_connect_status = 'not_started'` en todos los sellers existentes (idempotente; el `DEFAULT 'not_started'` lo gestiona, pero el helper actualiza filas pre-existentes a NULL si las hubiera).

### Frontend

- **Admin → Autores → Detalle del artista** (página existente, ampliar):
  - Nueva sección "Stripe Connect" con:
    - Badge de estado (`not_started`, `pending`, `active`, `restricted`, `rejected`) con colores apropiados (gris, ámbar, verde, rojo claro, rojo).
    - Botón "Crear cuenta conectada" (deshabilitado si `stripe_connect_account_id` ya existe).
    - Botón "Generar enlace de onboarding" (visible si la cuenta existe y status `!== 'active'`). Al hacer click, abre una modal con:
      - La URL hosted por Stripe.
      - Botón "Copiar al portapapeles".
      - Botón "Enviar por email al artista" (usa el email del seller, plantilla nueva).
    - Botón "Sincronizar estado" (siempre visible si existe la cuenta) — fuerza el endpoint de status.
    - Lista textual de `requirements_due` (si los hay) en formato legible para el admin.
  - Nueva sección "Datos fiscales" con form para `tax_status`, `tax_id`, `fiscal_full_name`, `fiscal_address_*`, `irpf_retention_rate` (input numérico opcional con tooltip "out of scope v1 — campo preparado para futuro"), checkbox "El artista ha firmado el acuerdo de autofacturación" (con timestamp readonly).
- **Seller → Dashboard del artista** (página existente del seller, ampliar):
  - Banner persistente "Cuenta de pagos" en la parte superior, con un mensaje y CTA dependientes del estado:
    - `not_started`: mensaje gris "Aún no hemos creado tu cuenta de pagos. Contacta con 140d Galería de Arte." Sin acción del seller.
    - `pending` con `account_id`: mensaje ámbar "Completa tu información para empezar a recibir pagos" + botón "Continuar onboarding" → POST al endpoint seller de onboarding-link → redirect a la URL devuelta.
    - `restricted`: mensaje rojo claro "Hay datos pendientes en tu cuenta de pagos" + lista de `requirements_due` + botón "Completar".
    - `active`: banner verde "Cuenta de pagos conectada. Puedes recibir transferencias de 140d Galería de Arte."
    - `rejected`: mensaje rojo "Tu cuenta de pagos ha sido rechazada por Stripe. Contacta con 140d Galería de Arte."
- **Nuevas rutas del seller**:
  - `/seller/stripe-connect/return` — página intermedia que llama al endpoint de status, espera 1-2s, redirige al dashboard del seller con un toast de éxito o error.
  - `/seller/stripe-connect/refresh` — página intermedia que regenera el link y redirige al onboarding hosted.
- **`client/lib/api.js`** — añadir wrappers para los nuevos endpoints (admin y seller).

### Email

- Nueva plantilla de email en `api/services/emailService.js`: `sendSellerOnboardingLink({ seller, url })` — email al artista con la URL hosted por Stripe y un texto de bienvenida explicando qué datos va a pedir Stripe (DNI/NIE, IBAN, dirección).

### Configuración externa (no es código, pero es parte del rollout)

- En el dashboard de Stripe (test mode primero, luego live):
  - Activar Stripe Connect en la cuenta del platform.
  - Configurar los datos públicos del platform (nombre `140d Galería de Arte`, dominio, soporte) — éstos aparecerán en el dashboard hosted que ven los artistas.
  - Crear el endpoint de webhook apuntando a `/api/stripe/connect/webhook`, con eventos `v2.core.account[requirements].updated` y `v2.core.account[configuration.recipient].capability_status_updated`, payload **thin**, y copiar el `whsec_*` a `STRIPE_CONNECT_WEBHOOK_SECRET`.
  - **Documentar este checklist** en una sección al final de `tasks.md` para que el dev no se olvide.

## Capabilities

### New Capabilities

- `stripe-connect-accounts`: lifecycle de las cuentas conectadas de los artistas en Stripe Connect (creación, onboarding hosted, sincronización por webhook, captura de datos fiscales). NO incluye payouts ni monedero — esos son capabilities de los Changes #2 y #3.

### Modified Capabilities

_(ninguna — este change añade una nueva capability sin tocar las existentes. Las modificaciones a `seller-wallet` y `seller-withdrawals` ocurrirán en el Change #2.)_

## Impact

- **Layer**: Backend + Frontend + Email + Configuración externa (Stripe Dashboard).
- **Files afectados — Backend**:
  - `api/config/env.js` (nuevas env vars bajo `config.stripe.connect`).
  - `api/.env.example` (documentación).
  - `api/config/database.js` (campos en `users`, nueva tabla `stripe_connect_events`).
  - `api/services/stripeConnectService.js` (nuevo).
  - `api/controllers/stripeConnectController.js` (nuevo).
  - `api/controllers/stripeConnectWebhookController.js` (nuevo).
  - `api/controllers/usersController.js` (nuevo endpoint fiscal o un nuevo controller).
  - `api/validators/stripeConnectSchemas.js` (nuevo).
  - `api/validators/fiscalSchemas.js` (nuevo).
  - `api/routes/admin/index.js` y `api/routes/admin/stripeConnectRoutes.js` (nuevo).
  - `api/routes/sellerRoutes.js` o `api/routes/stripeConnectSellerRoutes.js` (nuevo).
  - `api/routes/index.js` o `api/server.js` (nuevo route raw para el webhook).
  - `api/services/emailService.js` (nueva plantilla).
- **Files afectados — Frontend**:
  - `client/lib/api.js` (wrappers nuevos).
  - `client/app/admin/authors/[id]/page.js` (o equivalente — ampliar con sección Stripe Connect y sección Datos fiscales).
  - `client/app/seller/dashboard/page.js` (o equivalente — añadir banner).
  - `client/app/seller/stripe-connect/return/page.js` (nuevo).
  - `client/app/seller/stripe-connect/refresh/page.js` (nuevo).
  - Componentes auxiliares en `client/components/admin/StripeConnectSection.js`, `client/components/admin/SellerFiscalForm.js`, `client/components/seller/StripeConnectBanner.js`.
- **DB schema**: añade columnas a `users` + nueva tabla `stripe_connect_events`. Cambios idempotentes via `IF NOT EXISTS`. No requiere `ALTER TABLE` porque `database.js` se rehidrata desde cero en deploy nuevo (regla del proyecto: schema único en `CREATE TABLE`). Para entornos existentes con datos, se incluye un script de migración manual ejecutable una sola vez.
- **Dependencies**: el paquete `stripe` ya está instalado para los flujos de comprador. Verificar que la versión instalada soporta `v2.core.accounts.*` (las versiones recientes lo hacen). Si la versión actual no lo soporta, actualizar.
- **APIs externas**: nueva integración con `stripe.v2.core.accounts.*` y `stripe.v2.core.accountLinks.*`. Webhook nuevo configurado en el dashboard de Stripe.
- **Config/Infra**: requiere creación del endpoint webhook en el dashboard de Stripe (acción manual del admin).
- **Testing manual**: requiere una cuenta de Stripe en test mode con Connect activado. Se puede usar `stripe listen --thin-events` con CLI para forwarding local de webhooks durante desarrollo.

## Non-goals

- **Ejecución de payouts** (transfers a las cuentas conectadas) — Change #2.
- **Split del monedero** en buckets REBU/estándar — Change #2.
- **Tabla `withdrawal_items`** y panel admin de payouts — Change #2.
- **Acreditación de eventos de pago al monedero** — Change #3.
- **Export CSV/JSON para la gestoría** — Change #4.
- **Generación automática de PDFs de autofactura** — fuera del scope v1 (la gestoría los emite en su ERP a partir del export).
- **Integración con IRPF** — el campo `irpf_retention_rate` se guarda pero no se aplica a los cálculos en v1.
- **Permitir al seller iniciar la creación de su cuenta** — en v1 sólo el admin puede crear la cuenta. El seller sólo puede continuar el onboarding una vez creada.
- **Custom UI de KYC** — usamos el dashboard hosted de Stripe (`dashboard: 'express'`) para que Stripe gestione todos los formularios de identidad, IBAN, etc.
- **Validación de campos fiscales más allá de regex** — no comprobamos contra AEAT ni servicios externos en v1.
