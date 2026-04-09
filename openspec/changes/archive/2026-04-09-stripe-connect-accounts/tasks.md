## 0. Preparación externa (manual, antes del deploy)

- [x] 0.1 Activar Stripe Connect en la cuenta del platform en modo **test** desde el dashboard de Stripe (https://dashboard.stripe.com/test/settings/connect). Anotar la fecha de activación. NO activar en live mode hasta haber completado el round-trip completo en test.

- [x] 0.2 Configurar el branding público del platform en Settings → Connect settings:
  - **Display name (público):** `140d Galería de Arte`
  - **Support email:** `info@140d.art`
  - **URL pública del platform:** `https://pre.140d.art` (test) — actualizar a `https://140d.art` cuando se promueva a live.
  - **Logo:** subir el logo de 140d Galería de Arte (mismo que el del header de la web).
  - **Brand color:** colores de 140d.

- [x] 0.3 Crear el endpoint webhook nuevo en Settings → Webhooks → "Add destination":
  - **Endpoint URL (test):** `https://api.pre.140d.art/api/stripe/connect/webhook`
  - **Events from:** `Connected accounts`
  - **Show advanced options → Payload style:** `Thin` (CRÍTICO — si se deja en Snapshot, los handlers no parsearán correctamente).
  - **Events to send:** seleccionar:
    - `v2.core.account[requirements].updated`
    - `v2.core.account[configuration.recipient].capability_status_updated`
  - Copiar el `whsec_*` generado y guardarlo en `STRIPE_CONNECT_WEBHOOK_SECRET` del entorno de **test**.

- [x] 0.4 Verificar la versión del SDK `stripe` en `api/package.json`. Confirmar que soporta `stripeClient.v2.core.accounts.create` y `parseThinEvent`. Si la versión instalada no lo soporta, hacer `npm install stripe@latest` en el directorio `api/` y verificar que el flujo del comprador (`stripeService.createPaymentIntent`, etc.) sigue funcionando.

## 1. Backend: Configuración de entorno

- [x] 1.1 En `api/config/env.js`, añadir bajo el bloque `// --- Stripe ---` un sub-bloque `connect` dentro del objeto `stripe`:
  ```js
  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY', ''),
    publishableKey: optional('STRIPE_PUBLISHABLE_KEY', ''),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
    connect: {
      enabled: optionalBool('STRIPE_CONNECT_ENABLED', false),
      refreshUrl: optional('STRIPE_CONNECT_REFRESH_URL', 'https://pre.140d.art/seller/stripe-connect/refresh'),
      returnUrl: optional('STRIPE_CONNECT_RETURN_URL', 'https://pre.140d.art/seller/stripe-connect/return'),
      webhookSecret: optional('STRIPE_CONNECT_WEBHOOK_SECRET', ''),
    },
  },
  ```
  Mantener las cuatro como `optional` (no `required`) para que el resto del proyecto siga arrancando aunque Connect no esté configurado todavía. La validación "está habilitado pero falta secret" se hace runtime en `stripeConnectService` lanzando un error claro.

- [x] 1.2 En `api/.env.example`, añadir las cuatro variables nuevas con un comentario explicativo:
  ```
  # Stripe Connect (Change #1: stripe-connect-accounts)
  # Enable Stripe Connect features. Set to true once Connect is activated in the Stripe Dashboard.
  STRIPE_CONNECT_ENABLED=false
  # URL where Stripe redirects the artist when an account link expires (must be public).
  STRIPE_CONNECT_REFRESH_URL=https://pre.140d.art/seller/stripe-connect/refresh
  # URL where Stripe redirects the artist after completing the onboarding (must be public).
  STRIPE_CONNECT_RETURN_URL=https://pre.140d.art/seller/stripe-connect/return
  # Webhook signing secret for the Connect webhook endpoint (DIFFERENT from STRIPE_WEBHOOK_SECRET).
  # Get it from Stripe Dashboard → Webhooks → <connect endpoint> → Signing secret.
  STRIPE_CONNECT_WEBHOOK_SECRET=
  ```

## 2. Backend: Schema (database.js)

- [x] 2.1 En `api/config/database.js`, ampliar el `CREATE TABLE IF NOT EXISTS users` añadiendo (después del último campo existente `withdrawal_iban TEXT`) las siguientes columnas:
  ```sql
  -- Stripe Connect (Change #1: stripe-connect-accounts)
  stripe_connect_account_id TEXT UNIQUE,
  stripe_connect_status TEXT
    CHECK(stripe_connect_status IN ('not_started','pending','active','restricted','rejected'))
    NOT NULL DEFAULT 'not_started',
  stripe_transfers_capability_active INTEGER NOT NULL DEFAULT 0,
  stripe_connect_requirements_due TEXT,
  stripe_connect_last_synced_at DATETIME,
  -- Datos fiscales del artista (preparados para Changes #2 y #4)
  tax_status TEXT CHECK(tax_status IN ('particular','autonomo','sociedad')),
  tax_id TEXT,
  fiscal_full_name TEXT,
  fiscal_address_line1 TEXT,
  fiscal_address_line2 TEXT,
  fiscal_address_city TEXT,
  fiscal_address_postal_code TEXT,
  fiscal_address_province TEXT,
  fiscal_address_country TEXT NOT NULL DEFAULT 'ES',
  irpf_retention_rate REAL,
  autofactura_agreement_signed_at DATETIME
  ```
  Recordar que `database.js` es el source of truth: el `CREATE TABLE` se rehidrata desde cero en deploys nuevos, así que estas columnas existirán en todos los entornos creados después de este change.

- [x] 2.2 Después de los `CREATE TABLE` existentes, añadir el bloque para la nueva tabla `stripe_connect_events`:
  ```sql
  CREATE TABLE IF NOT EXISTS stripe_connect_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stripe_event_id TEXT UNIQUE NOT NULL,
    stripe_event_type TEXT NOT NULL,
    account_id TEXT,
    payload_json TEXT NOT NULL,
    processed_at DATETIME,
    processing_error TEXT,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  ```
  Y los índices:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_account ON stripe_connect_events(account_id);
  CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_type ON stripe_connect_events(stripe_event_type);
  ```

- [x] 2.3 Crear el script de migración manual para entornos pre-existentes en `api/migrations/2026-04-stripe-connect-accounts.sql`:
  ```sql
  -- Migration script for stripe-connect-accounts change.
  -- Run ONCE per existing environment with: turso db shell <db-name> < 2026-04-stripe-connect-accounts.sql
  -- For brand-new environments, this script is not needed; database.js initializeDatabase() handles it.

  ALTER TABLE users ADD COLUMN stripe_connect_account_id TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_connect_account_id ON users(stripe_connect_account_id) WHERE stripe_connect_account_id IS NOT NULL;
  ALTER TABLE users ADD COLUMN stripe_connect_status TEXT NOT NULL DEFAULT 'not_started';
  ALTER TABLE users ADD COLUMN stripe_transfers_capability_active INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN stripe_connect_requirements_due TEXT;
  ALTER TABLE users ADD COLUMN stripe_connect_last_synced_at DATETIME;
  ALTER TABLE users ADD COLUMN tax_status TEXT;
  ALTER TABLE users ADD COLUMN tax_id TEXT;
  ALTER TABLE users ADD COLUMN fiscal_full_name TEXT;
  ALTER TABLE users ADD COLUMN fiscal_address_line1 TEXT;
  ALTER TABLE users ADD COLUMN fiscal_address_line2 TEXT;
  ALTER TABLE users ADD COLUMN fiscal_address_city TEXT;
  ALTER TABLE users ADD COLUMN fiscal_address_postal_code TEXT;
  ALTER TABLE users ADD COLUMN fiscal_address_province TEXT;
  ALTER TABLE users ADD COLUMN fiscal_address_country TEXT NOT NULL DEFAULT 'ES';
  ALTER TABLE users ADD COLUMN irpf_retention_rate REAL;
  ALTER TABLE users ADD COLUMN autofactura_agreement_signed_at DATETIME;

  CREATE TABLE IF NOT EXISTS stripe_connect_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stripe_event_id TEXT UNIQUE NOT NULL,
    stripe_event_type TEXT NOT NULL,
    account_id TEXT,
    payload_json TEXT NOT NULL,
    processed_at DATETIME,
    processing_error TEXT,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_account ON stripe_connect_events(account_id);
  CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_type ON stripe_connect_events(stripe_event_type);
  ```
  Nota: las CHECK constraints sobre los enums no se pueden añadir vía `ALTER TABLE` en SQLite; en entornos migrados, la validación queda a cargo de la lógica de aplicación. En entornos nuevos creados desde `database.js`, los CHECK sí están activos.

## 3. Backend: Servicio Stripe Connect

- [x] 3.1 Crear `api/services/stripeConnectService.js` con un import del cliente Stripe singleton ya existente en `stripeService.js` (refactor: extraer el cliente a `api/services/stripeClient.js` si todavía no está separado, exportarlo desde ambos servicios). Importar `config` de `../config/env` y `logger` de `../config/logger`.

- [x] 3.2 Implementar `async function createConnectedAccount({ user })`:
  - Verificar `config.stripe.connect.enabled === true` y `config.stripe.connect.webhookSecret !== ''`. Si no, lanzar `ApiError(503, 'Stripe Connect is not enabled in this environment')`.
  - Llamar a:
    ```js
    const account = await stripeClient.v2.core.accounts.create({
      display_name: user.full_name || user.email,
      contact_email: user.email,
      identity: { country: 'es' },
      dashboard: 'express',
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
    }, {
      idempotencyKey: `account_create_user_${user.id}_v1`,
    });
    ```
  - Devolver el objeto `account` (no persistirlo en BD desde aquí — el controller lo hace).
  - `try/catch` Stripe errors y traducirlos a `ApiError(502, ...)` con el mensaje original en `message` y el `code` de Stripe en `cause`.

- [x] 3.3 Implementar `async function createOnboardingLink({ stripeAccountId })`:
  - Mismo guard de `enabled`.
  - Llamar a:
    ```js
    const link = await stripeClient.v2.core.accountLinks.create({
      account: stripeAccountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: `${config.stripe.connect.refreshUrl}?account=${stripeAccountId}`,
          return_url: `${config.stripe.connect.returnUrl}?account=${stripeAccountId}`,
        },
      },
    });
    ```
  - Devolver `{ url: link.url, expires_at: link.expires_at }`.

- [x] 3.4 Implementar `async function retrieveAccount(stripeAccountId)`:
  - Mismo guard.
  - Llamar a:
    ```js
    return await stripeClient.v2.core.accounts.retrieve(stripeAccountId, {
      include: ['configuration.recipient', 'requirements'],
    });
    ```

- [x] 3.5 Implementar `function mapAccountToLocalStatus(account)` (puro, sin DB):
  - Lee `account.configuration.recipient.capabilities.stripe_balance.stripe_transfers.status` y `account.requirements.summary.minimum_deadline.status`.
  - Devuelve `{ status: 'pending'|'active'|'restricted'|'rejected', transfers_capability_active: boolean, requirements_due: array }`.
  - Tabla de mapeo (ver §7 del design.md): rejected wins → si Stripe marca rejection, devolver `'rejected'` independientemente de los demás campos.

- [x] 3.6 Implementar `async function syncAccountStatus({ user, account = null })`:
  - Si `user.stripe_connect_account_id` es NULL → no-op, devolver `{ status: 'not_started' }`.
  - Si `account` no se pasa, llamar a `retrieveAccount(user.stripe_connect_account_id)`.
  - Llamar a `mapAccountToLocalStatus(account)`.
  - `UPDATE users SET stripe_connect_status = ?, stripe_transfers_capability_active = ?, stripe_connect_requirements_due = ?, stripe_connect_last_synced_at = CURRENT_TIMESTAMP WHERE id = ?`.
  - Loggear el cambio si difiere del estado anterior (`logger.info({ userId, oldStatus, newStatus }, '[stripe-connect] account status synced')`).
  - Devolver el resultado del map + el `account` para que el caller pueda usarlo.

- [x] 3.7 Exportar las funciones via `module.exports = { createConnectedAccount, createOnboardingLink, retrieveAccount, syncAccountStatus, mapAccountToLocalStatus }`.

## 4. Backend: Controller admin de Stripe Connect

- [x] 4.1 Crear `api/controllers/stripeConnectController.js`. Importar el servicio, el cliente DB, `ApiError`, `sendSuccess`/`sendCreated` de `utils/response`, y `logger`.

- [x] 4.2 Implementar `async function createAccountForSeller(req, res, next)`:
  - `const sellerId = parseInt(req.params.id, 10)`.
  - `SELECT * FROM users WHERE id = ? AND role = 'seller'` → si no existe, `ApiError(404, 'Seller not found')`.
  - **Pre-check de datos fiscales** (decisión §17 del design — esta es la Open Question #2 que se resuelve aquí): si `tax_status IS NULL` o `tax_id IS NULL` o `fiscal_full_name IS NULL` o `fiscal_address_line1 IS NULL` o `fiscal_address_postal_code IS NULL` o `fiscal_address_city IS NULL`, lanzar `ApiError(400, 'Fiscal data must be filled before creating the connected account')`.
  - **Idempotency BD guard**: si `seller.stripe_connect_account_id IS NOT NULL`, devolver early `sendSuccess(res, { stripe_connect_account_id: seller.stripe_connect_account_id, stripe_connect_status: seller.stripe_connect_status, already_existed: true })`.
  - Llamar a `stripeConnectService.createConnectedAccount({ user: seller })`.
  - `UPDATE users SET stripe_connect_account_id = ?, stripe_connect_status = 'pending' WHERE id = ?`.
  - Llamar a `syncAccountStatus({ user, account })` para poblar `stripe_transfers_capability_active`, `stripe_connect_requirements_due`, etc.
  - `sendCreated(res, { stripe_connect_account_id: account.id, stripe_connect_status: 'pending' })`.

- [x] 4.3 Implementar `async function generateOnboardingLinkForSeller(req, res, next)`:
  - Validar seller existe y tiene `stripe_connect_account_id`. Si no, `ApiError(409, 'Connected account must be created first')`.
  - Llamar a `stripeConnectService.createOnboardingLink({ stripeAccountId: seller.stripe_connect_account_id })`.
  - `sendSuccess(res, { url, expires_at })`.

- [x] 4.4 Implementar `async function syncStatusForSeller(req, res, next)`:
  - Validar seller con `stripe_connect_account_id`.
  - Llamar a `stripeConnectService.syncAccountStatus({ user: seller })`.
  - Re-leer el seller de BD (para devolver los campos actualizados).
  - `sendSuccess(res, { stripe_connect_status, stripe_transfers_capability_active, stripe_connect_requirements_due, stripe_connect_last_synced_at })`.

- [x] 4.5 Implementar `async function sendOnboardingLinkEmail(req, res, next)`:
  - Validar seller con `stripe_connect_account_id`.
  - Generar el link via `createOnboardingLink`.
  - Llamar a `emailService.sendSellerOnboardingLink({ seller, url: link.url })` (a definir en task 6).
  - `sendSuccess(res, { sent: true, expires_at: link.expires_at })`.

- [x] 4.6 Implementar las versiones seller-authenticated en el mismo archivo o en `api/controllers/sellerStripeConnectController.js`:
  - `async function generateOnboardingLinkForSelf(req, res, next)`: usa `req.user.id` en lugar de `req.params.id`. Mismas validaciones.
  - `async function getStatusForSelf(req, res, next)`: igual con `req.user.id`. **No hace sync forzado** (sólo devuelve el estado almacenado) para evitar latencia y rate limits — el sync se dispara en `/return` y por webhook.

## 5. Backend: Controller webhook de Connect

- [x] 5.1 Crear `api/controllers/stripeConnectWebhookController.js`. Importar el cliente Stripe, el servicio, el cliente DB, `logger`.

- [x] 5.2 Implementar `async function handleConnectWebhook(req, res, next)`:
  - El endpoint usa raw body (configurar en routing con `express.raw({ type: 'application/json' })`).
  - Extraer `sig = req.headers['stripe-signature']`.
  - Verificar `config.stripe.connect.webhookSecret !== ''` antes de parsear; si no, log warning y devolver `200` (no fallar al startup, pero no procesar nada).
  - Parsear: `const thinEvent = stripeClient.parseThinEvent(req.body, sig, config.stripe.connect.webhookSecret);`. `try/catch` errores de firma → `400`.
  - **Persist + idempotencia**: insertar fila en `stripe_connect_events` con `INSERT OR IGNORE` (Turso/SQLite syntax) para que si el evento ya existe, no se duplique. Si el `INSERT` no afectó filas, log info "duplicate event ignored" y devolver `200`.
  - Despachar al handler según `thinEvent.type`:
    - `'v2.core.account[requirements].updated'` → `handleRequirementsUpdated(thinEvent)`.
    - `'v2.core.account[configuration.recipient].capability_status_updated'` → `handleCapabilityUpdated(thinEvent)`.
    - Cualquier otro → log warn y devolver `200` sin marcar como procesado (queda en `stripe_connect_events` con `processed_at = NULL` para diagnóstico).
  - Marcar `processed_at = CURRENT_TIMESTAMP` tras éxito.
  - Si el handler tira excepción: actualizar `processing_error = ?`, log error, devolver `500` para que Stripe reintente.
  - Devolver `200 OK`.

- [x] 5.3 Implementar `async function handleRequirementsUpdated(thinEvent)`:
  - Extraer `accountId = thinEvent.related_object?.id` (o equivalente — la guía oficial usa `thinEvent` directamente; verificar la API exacta de `parseThinEvent` en el SDK).
  - Si no hay accountId, log warn y return.
  - Buscar `user` por `stripe_connect_account_id = ?`. Si no existe en BD, log warn (cuenta huérfana) y return.
  - Llamar a `stripeConnectService.syncAccountStatus({ user })`.

- [x] 5.4 Implementar `async function handleCapabilityUpdated(thinEvent)`:
  - Idem a `handleRequirementsUpdated` — el handler es prácticamente igual porque ambos eventos disparan el mismo sync.
  - Considerar refactor: una sola función `handleAccountChange(thinEvent)` que ambos handlers invocan.

## 6. Backend: Email del onboarding link

- [x] 6.1 En `api/services/emailService.js`, añadir una nueva función `async function sendSellerOnboardingLink({ seller, url })`:
  - Subject: `'140d Galería de Arte — Completa tu cuenta de pagos'`.
  - HTML body con el branding del platform (logo de 140d, NO "Kuadrat"), un saludo personalizado con `seller.full_name`, un párrafo explicando qué va a pedir Stripe (DNI/NIE, dirección, IBAN), un botón visible "Completar onboarding" enlazando a `url`, una nota de que el link expira (los account links de Stripe expiran a las pocas horas), un párrafo de pie con contacto a `info@140d.art`.
  - Plain text fallback equivalente.
  - To: `seller.email`.
  - From: `config.emailFrom`.
  - Loguear el envío.

## 7. Backend: Endpoint de datos fiscales

- [x] 7.1 En `api/controllers/usersController.js` (o crear un nuevo `api/controllers/sellersFiscalController.js`), añadir `async function updateSellerFiscalData(req, res, next)`:
  - `const sellerId = parseInt(req.params.id, 10)`.
  - Validar seller existe.
  - Body validado con Zod schema (task 8) — recibe `tax_status`, `tax_id`, `fiscal_full_name`, `fiscal_address_line1`, `fiscal_address_line2`, `fiscal_address_city`, `fiscal_address_postal_code`, `fiscal_address_province`, `fiscal_address_country`, `irpf_retention_rate` (opcional), `autofactura_agreement_signed` (boolean: si `true` por primera vez, setea `autofactura_agreement_signed_at = CURRENT_TIMESTAMP`; si ya existía y se manda `false`, setear a NULL — permite revocar).
  - `UPDATE users SET ...` con todos los campos.
  - `sendSuccess(res, { ...updatedFiscalFields })`.

## 8. Backend: Validación Zod

- [x] 8.1 Crear `api/validators/stripeConnectSchemas.js`:
  ```js
  const { z } = require('zod');
  // No body schema needed for create/sync (params only)
  // Body schema for sending onboarding link email is empty (uses path param only)
  module.exports = {};
  ```
  (Por completitud — los endpoints actuales no reciben body. Si en el futuro un endpoint admite body, ampliar.)

- [x] 8.2 Crear `api/validators/fiscalSchemas.js`:
  ```js
  const { z } = require('zod');

  const dniRegex = /^\d{8}[A-Z]$/;
  const nieRegex = /^[XYZ]\d{7}[A-Z]$/;
  const cifRegex = /^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/;

  const taxIdSchema = z.string().refine(
    (val) => dniRegex.test(val) || nieRegex.test(val) || cifRegex.test(val),
    { message: 'tax_id debe ser un DNI, NIE o CIF español válido' }
  );

  const sellerFiscalDataSchema = z.object({
    tax_status: z.enum(['particular', 'autonomo', 'sociedad']),
    tax_id: taxIdSchema,
    fiscal_full_name: z.string().min(1).max(200),
    fiscal_address_line1: z.string().min(1).max(200),
    fiscal_address_line2: z.string().max(200).optional().nullable(),
    fiscal_address_city: z.string().min(1).max(100),
    fiscal_address_postal_code: z.string().regex(/^\d{5}$/, 'CP español: 5 dígitos'),
    fiscal_address_province: z.string().min(1).max(100),
    fiscal_address_country: z.string().length(2).default('ES'),
    irpf_retention_rate: z.number().min(0).max(0.5).optional().nullable(),
    autofactura_agreement_signed: z.boolean().optional(),
  });

  module.exports = { sellerFiscalDataSchema, taxIdSchema };
  ```

## 9. Backend: Routing

- [x] 9.1 Crear `api/routes/admin/stripeConnectRoutes.js`:
  ```js
  const express = require('express');
  const router = express.Router();
  const ctrl = require('../../controllers/stripeConnectController');
  const fiscalCtrl = require('../../controllers/usersController'); // o sellersFiscalController
  const { validate } = require('../../middleware/validate');
  const { sellerFiscalDataSchema } = require('../../validators/fiscalSchemas');

  router.post('/sellers/:id/stripe-connect/create', ctrl.createAccountForSeller);
  router.post('/sellers/:id/stripe-connect/onboarding-link', ctrl.generateOnboardingLinkForSeller);
  router.post('/sellers/:id/stripe-connect/onboarding-link/email', ctrl.sendOnboardingLinkEmail);
  router.get('/sellers/:id/stripe-connect/status', ctrl.syncStatusForSeller);
  router.put('/sellers/:id/fiscal', validate(sellerFiscalDataSchema), fiscalCtrl.updateSellerFiscalData);

  module.exports = router;
  ```

- [x] 9.2 En `api/routes/admin/index.js`, montar el nuevo router:
  ```js
  const stripeConnectRoutes = require('./stripeConnectRoutes');
  router.use('/', stripeConnectRoutes);  // o el prefijo que el index actual use
  ```
  (Verificar el patrón existente: los demás sub-routers admin se montan sin prefijo extra porque ya están bajo `/api/admin`.)

- [x] 9.3 En `api/routes/sellerRoutes.js` (o crear `api/routes/sellerStripeConnectRoutes.js`), añadir:
  ```js
  router.post('/seller/stripe-connect/onboarding-link', authenticate, ctrl.generateOnboardingLinkForSelf);
  router.get('/seller/stripe-connect/status', authenticate, ctrl.getStatusForSelf);
  ```

- [x] 9.4 En `api/server.js` o donde se monten los routes, añadir el endpoint del webhook **antes** del `express.json()` global, con raw body parser:
  ```js
  app.post(
    '/api/stripe/connect/webhook',
    express.raw({ type: 'application/json' }),
    require('./controllers/stripeConnectWebhookController').handleConnectWebhook
  );
  ```
  Ojo: este endpoint NO debe pasar por el middleware de auth ni por `express.json()` porque la firma se valida sobre el raw body. Replicar el patrón ya usado para `/api/stripe/webhook` (el del comprador).

## 10. Frontend: API client wrappers

- [x] 10.1 En `client/lib/api.js`, añadir la sección "Stripe Connect (admin)":
  ```js
  // ── Stripe Connect (admin) ─────────────────────────────────
  adminCreateStripeConnectAccount(sellerId)        // POST /admin/sellers/:id/stripe-connect/create
  adminGenerateStripeConnectLink(sellerId)         // POST /admin/sellers/:id/stripe-connect/onboarding-link
  adminSendStripeConnectLinkEmail(sellerId)        // POST /admin/sellers/:id/stripe-connect/onboarding-link/email
  adminGetStripeConnectStatus(sellerId)            // GET /admin/sellers/:id/stripe-connect/status
  adminUpdateSellerFiscalData(sellerId, payload)   // PUT /admin/sellers/:id/fiscal
  ```
  Cada función usa el helper `request` ya existente que gestiona auth, 401, 429.

- [x] 10.2 Sección "Stripe Connect (seller)":
  ```js
  // ── Stripe Connect (seller) ────────────────────────────────
  sellerGenerateStripeConnectLink()                // POST /seller/stripe-connect/onboarding-link
  sellerGetStripeConnectStatus()                   // GET /seller/stripe-connect/status
  ```

## 11. Frontend: Sección Stripe Connect en admin de autores

- [x] 11.1 Localizar la página actual del detalle de autor en el admin (probablemente `client/app/admin/authors/[id]/page.js` o similar). Identificar dónde se renderizan las secciones del autor.

- [x] 11.2 Crear el componente `client/components/admin/StripeConnectSection.js`:
  - Props: `seller` (objeto con todos los campos de stripe_connect_*), `onUpdate` (callback para refrescar el seller tras una acción).
  - Renderiza un `<section>` con título "Stripe Connect" y subtítulo "Cuenta conectada para recibir transferencias del platform".
  - **Badge de estado** con colores Tailwind:
    - `not_started` → `bg-gray-100 text-gray-800` "No iniciado"
    - `pending` → `bg-amber-100 text-amber-800` "Pendiente de onboarding"
    - `active` → `bg-green-100 text-green-800` "Activo"
    - `restricted` → `bg-orange-100 text-orange-800` "Restringido"
    - `rejected` → `bg-red-100 text-red-800` "Rechazado"
  - **Campos read-only** mostrados: `stripe_connect_account_id` (con tooltip "ID de la cuenta en Stripe"), `stripe_transfers_capability_active` ("Sí"/"No"), `stripe_connect_last_synced_at` (formateado en es-ES).
  - **Botón "Crear cuenta conectada"** — `disabled` si `stripe_connect_account_id` ya existe O si los datos fiscales no están completos. Tooltip explicando el motivo si está disabled.
    - On click: confirmar con un dialog "¿Crear la cuenta de pagos para [seller.full_name]?". Llamar a `adminCreateStripeConnectAccount(sellerId)`. Mostrar toast de éxito o error. Llamar a `onUpdate()`.
  - **Botón "Generar enlace de onboarding"** — visible si `stripe_connect_account_id` existe Y `stripe_connect_status !== 'active'`.
    - On click: llamar a `adminGenerateStripeConnectLink(sellerId)`. Abrir modal mostrando la URL.
  - **Botón "Sincronizar estado"** — siempre visible si `stripe_connect_account_id` existe.
    - On click: llamar a `adminGetStripeConnectStatus(sellerId)`. Mostrar toast con el estado actualizado. Llamar a `onUpdate()`.
  - **Lista de requirements pendientes** — si `stripe_connect_requirements_due` existe (parsear JSON), renderizar un `<ul>` con cada requirement. Si está vacío o NULL, no renderizar la lista.

- [x] 11.3 Crear el sub-componente modal `client/components/admin/StripeConnectLinkModal.js`:
  - Props: `isOpen`, `onClose`, `url`, `expiresAt`, `sellerEmail`, `sellerId`.
  - Renderiza:
    - Título "Enlace de onboarding generado"
    - Texto "Comparte este enlace con el artista para que complete su cuenta de pagos. Expira en [tiempo restante hasta `expiresAt`]."
    - Input readonly con la URL completa.
    - Botón "Copiar al portapapeles" → usa `navigator.clipboard.writeText(url)`, muestra toast.
    - Botón "Enviar por email a `sellerEmail`" → llama a `adminSendStripeConnectLinkEmail(sellerId)`, muestra toast.
    - Botón "Cerrar".

- [x] 11.4 Integrar `<StripeConnectSection>` y `<StripeConnectLinkModal>` en la página del detalle del autor admin.

## 12. Frontend: Sección Datos fiscales en admin de autores

- [x] 12.1 Crear el componente `client/components/admin/SellerFiscalForm.js`:
  - Props: `seller`, `onUpdate`.
  - Form controlado con todos los campos:
    - `tax_status` — select con opciones "Particular", "Autónomo", "Sociedad".
    - `tax_id` — input text con placeholder "DNI, NIE o CIF".
    - `fiscal_full_name` — input text "Nombre completo o razón social".
    - `fiscal_address_line1` — input text "Dirección".
    - `fiscal_address_line2` — input text opcional "Dirección (línea 2)".
    - `fiscal_address_postal_code` — input text con maxLength 5.
    - `fiscal_address_city` — input text.
    - `fiscal_address_province` — input text.
    - `fiscal_address_country` — input text default `ES`, readonly o restringido.
    - `irpf_retention_rate` — input number step 0.01 min 0 max 0.5, optional, con tooltip "Out of scope v1 — campo preparado para futuro. No se aplica todavía."
    - Checkbox "El artista ha firmado el acuerdo de autofacturación" — si está marcado y antes no lo estaba, muestra un texto "Se registrará la fecha actual al guardar". Si ya está marcado y se desmarca, muestra "Se eliminará el registro de firma".
  - Validación inline (mismo regex que el backend para `tax_id`, `fiscal_address_postal_code`).
  - Botón "Guardar" → llama a `adminUpdateSellerFiscalData(sellerId, payload)`. Toast de éxito o de error con mensaje del backend.
  - Mostrar la fecha de firma del acuerdo (si existe) como dato readonly.

- [x] 12.2 Integrar `<SellerFiscalForm>` en la página del detalle del autor admin, en una sección "Datos fiscales".

## 13. Frontend: Banner Stripe Connect en dashboard del seller

- [x] 13.1 Crear el componente `client/components/seller/StripeConnectBanner.js`:
  - Llama internamente a `sellerGetStripeConnectStatus()` al mount (o recibe el estado como prop si el dashboard ya lo carga).
  - Renderiza un banner según el estado:
    - `not_started`:
      ```jsx
      <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium">Cuenta de pagos no creada</h3>
        <p className="text-sm text-gray-700">
          Aún no hemos creado tu cuenta de pagos. Contacta con 140d Galería de Arte para empezar.
        </p>
      </div>
      ```
    - `pending`:
      ```jsx
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="font-medium text-amber-900">Completa tu cuenta de pagos</h3>
        <p className="text-sm text-amber-800">
          Necesitamos algunos datos antes de poder enviarte transferencias.
        </p>
        <button onClick={handleContinueOnboarding}>Continuar onboarding</button>
      </div>
      ```
      `handleContinueOnboarding` → llama a `sellerGenerateStripeConnectLink()`, redirige a `data.url`.
    - `restricted`:
      ```jsx
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <h3 className="font-medium text-orange-900">Hay datos pendientes en tu cuenta de pagos</h3>
        <ul>{requirementsDue.map((r) => <li key={r}>{r}</li>)}</ul>
        <button onClick={handleContinueOnboarding}>Completar</button>
      </div>
      ```
    - `active`:
      ```jsx
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-medium text-green-900">Cuenta de pagos conectada</h3>
        <p className="text-sm text-green-800">
          Puedes recibir transferencias de 140d Galería de Arte.
        </p>
      </div>
      ```
    - `rejected`:
      ```jsx
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="font-medium text-red-900">Cuenta de pagos rechazada</h3>
        <p className="text-sm text-red-800">
          Tu cuenta ha sido rechazada por Stripe. Contacta con 140d Galería de Arte.
        </p>
      </div>
      ```
  - **Branding crítico:** todos los textos user-facing usan **"140d Galería de Arte"**. NUNCA "Kuadrat".

- [x] 13.2 Integrar `<StripeConnectBanner>` en el dashboard principal del seller (probablemente `client/app/seller/page.js` o `client/app/seller/dashboard/page.js`). Posicionarlo en la parte superior, antes del monedero.

## 14. Frontend: Páginas intermedias return/refresh

- [x] 14.1 Crear `client/app/seller/stripe-connect/return/page.js`:
  - Client component (`'use client'`).
  - Al mount: extraer `?account=` del query string. Llamar a `sellerGetStripeConnectStatus()` para forzar un refresh del estado en el contexto del seller (el sync real lo hace el webhook, pero esto fuerza una relectura).
  - Mostrar spinner "Actualizando estado de tu cuenta..." durante 1-2s.
  - Redirigir a `/seller` (o el dashboard del seller) con un toast según el estado:
    - Si `status === 'active'` → toast verde "Cuenta de pagos conectada con éxito".
    - Si `status === 'pending'` → toast ámbar "Estamos procesando tus datos. Esto puede tardar unos minutos."
    - Si `status === 'restricted'` → toast naranja "Hay datos pendientes. Revisa el banner en tu dashboard."
    - Si `status === 'rejected'` → toast rojo "Tu cuenta ha sido rechazada. Contacta con 140d Galería de Arte."

- [x] 14.2 Crear `client/app/seller/stripe-connect/refresh/page.js`:
  - Client component.
  - Al mount: llamar a `sellerGenerateStripeConnectLink()` y redirigir inmediatamente a `data.url` (la nueva URL hosted).
  - Mostrar spinner "Generando nuevo enlace de onboarding..." mientras tanto.
  - Si falla, redirigir a `/seller` con toast de error.

## 15. Frontend: Constantes de branding

- [x] 15.1 En `client/lib/constants.js` (o si no existe ya, crear), añadir:
  ```js
  export const PUBLIC_BRAND_NAME = '140d Galería de Arte';
  export const PUBLIC_BRAND_NAME_SHORT = '140d';
  ```
  Y usar estas constantes en todos los strings user-facing del banner, modales, formularios, emails. **Razón:** centralización + previene typos de "Kuadrat" filtrándose.

## 16. Verificación manual

- [x] 16.1 Configurar `STRIPE_CONNECT_ENABLED=true` y todas las URLs/secrets en el entorno local.

- [x] 16.2 Levantar el listener del CLI de Stripe en local:
  ```bash
  stripe listen --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated' --forward-thin-to http://localhost:3001/api/stripe/connect/webhook
  ```
  Copiar el `whsec_*` que muestra el CLI a `STRIPE_CONNECT_WEBHOOK_SECRET` del entorno local.

- [x] 16.3 Crear un seller de prueba en BD y rellenar sus datos fiscales desde el admin (form).

- [x] 16.4 Pulsar "Crear cuenta conectada" en el admin del autor. Verificar que:
  - El endpoint devuelve 201 con un `stripe_connect_account_id` válido (`acct_*`).
  - La fila en `users` se actualiza con el ID y `stripe_connect_status='pending'`.
  - El admin ve el badge "Pendiente de onboarding".

- [x] 16.5 Pulsar "Generar enlace de onboarding" → abrir la modal, copiar la URL.

- [x] 16.6 Pegar la URL en un navegador en modo incógnito (simulando al artista). Completar el formulario hosted por Stripe con datos de test:
  - Tipo de entidad: individual.
  - País: España.
  - Nombre, apellidos, fecha de nacimiento, dirección.
  - Teléfono: cualquier número de test.
  - DNI: usar `00000000T` o el válido de pruebas.
  - IBAN de test: `ES7921000813610123456789`.
  - Aceptar los términos.

- [x] 16.7 Verificar que tras pulsar "Submit" en el formulario hosted:
  - Stripe redirige al `return_url` (`https://pre.140d.art/seller/stripe-connect/return?account=acct_*`).
  - La página de return llama al endpoint de status y redirige al dashboard del seller con un toast.
  - En la consola del CLI de Stripe se ve el evento `v2.core.account[configuration.recipient].capability_status_updated` enviado al webhook local.
  - El handler del webhook se ejecuta, marca el evento como procesado en `stripe_connect_events`, llama a `syncAccountStatus`, y la columna `stripe_connect_status` pasa a `active`.

- [x] 16.8 Refrescar la página del admin: el badge debe estar en "Activo" y `stripe_transfers_capability_active` en "Sí".

- [x] 16.9 Verificar idempotencia: en el dashboard de Stripe, en el endpoint webhook, hacer "Resend" del último evento. El log debe mostrar "duplicate event ignored" y la fila NO se duplica en `stripe_connect_events`.

- [x] 16.10 Verificar que pulsar "Crear cuenta conectada" otra vez sobre el mismo seller devuelve `already_existed: true` y NO crea una segunda cuenta en Stripe.

- [x] 16.11 Verificar el flujo completo en el UI del seller: login como el seller, ver el banner verde "Cuenta de pagos conectada".

- [x] 16.12 Verificar el flujo de "link expirado": en el dashboard de Stripe, ver el link generado. Esperar a que expire (o forzar el refresh enlazando manualmente a `/seller/stripe-connect/refresh?account=acct_*`). Verificar que regenera el link y redirige al onboarding.

- [x] 16.13 Verificar el bloqueo de creación sin datos fiscales: crear otro seller SIN rellenar los datos fiscales. Pulsar "Crear cuenta conectada" → debe devolver 400 con mensaje claro y NO debe crear nada en Stripe.

## 17. Fixes post-implementación (descubiertos durante E2E manual, 2026-04-09)

> Estos fixes se añadieron después de la implementación inicial del change, durante la verificación manual del flujo end-to-end. Se mantienen dentro del Change #1 (no se crea un change separado) porque forman parte del cierre del mismo cambio.

### 17.1 Webhook 400 — rename `parseThinEvent` → `parseEventNotification`

**Root cause:** el diseño del Change #1 se escribió usando el nombre antiguo `stripeClient.parseThinEvent(...)`, que fue renombrado a `stripeClient.parseEventNotification(...)` en `stripe-node v19.0.0` (2025-09-30). El paquete instalado (`stripe: ^20.3.1`) ya NO expone `parseThinEvent`. Cualquier POST del CLI o del dashboard al webhook produce `TypeError: stripeClient.parseThinEvent is not a function`, que el `try/catch` envuelve como "invalid signature" y devuelve HTTP 400.

**Verificación empírica:**
- CHANGELOG oficial de `stripe-node`, release `19.0.0 - 2025-09-30`: `⚠️ Rename function StripeClient.parseThinEvent to StripeClient.parseEventNotification and remove the Stripe.ThinEvent interface`.
- Código fuente actual de `src/stripe.core.ts`: la nueva función devuelve un objeto con **`related_object` en snake_case** (como antes) y añade `fetchRelatedObject()` y `fetchEvent()` en camelCase. El dispatcher que lee `event.related_object?.id` sigue siendo compatible sin cambios.

**Decisión de versión del SDK:** mantener `stripe: ^20.3.1`. Razones: (1) el caret bloquea saltos a v21/v22 (breaking changes adicionales), (2) v20.3.x ya expone `v2.core.accounts.create` y `parseEventNotification` en GA, (3) la API version del Dashboard (`2026-01-28.clover` — que el CLI anuncia en `stripe listen`) coincide exactamente con la fecha de publicación de `stripe-node v20.3.0`, así que SDK y API están alineadas. Subir a v22.x requeriría un change dedicado con revisión de changelogs v20→v22.

- [x] 17.1.1 En `api/services/stripeClient.js`, actualizar el comentario de cabecera (línea ~13) para reemplazar `parseThinEvent` por `parseEventNotification` y, si procede, referenciar el tipo `V2.Core.EventNotification` en lugar de `ThinEvent`.

- [x] 17.1.2 En `api/controllers/stripeConnectWebhookController.js`:
  - Reemplazar la llamada `stripeClient.parseThinEvent(rawBody, sig, config.stripe.connect.webhookSecret)` por `stripeClient.parseEventNotification(rawBody, sig, config.stripe.connect.webhookSecret)`.
  - Renombrar la variable local `thinEvent` a `event` en el scope de `handleConnectWebhook`, `handleAccountChange` y `dispatchHandler` para reflejar la nueva interfaz (`V2.Core.EventNotification`). El acceso `event.related_object?.id`, `event.id`, `event.type` se mantiene sin cambios.
  - Actualizar el JSDoc de cabecera del fichero reemplazando "V2 thin events" por "V2 EventNotifications" y la descripción del flujo.

### 17.2 Rutas `return` / `refresh` públicas con redirect-after-login

**Root cause:** las rutas `/seller/stripe-connect/return` y `/seller/stripe-connect/refresh` están envueltas en `<AuthGuard>`, que redirige a `/autores` cuando no hay sesión. Esto rompe el flujo en tres casos reales:
1. El artista abre el link de onboarding en un navegador/dispositivo distinto del que usó para loguearse en 140d.
2. El JWT del artista expira mientras completa el KYC de Stripe (~30–45 min es común).
3. El admin envía el enlace por email al artista y el artista lo abre directamente sin haber tocado antes el sitio.

El comentario de los env vars `STRIPE_CONNECT_REFRESH_URL` y `STRIPE_CONNECT_RETURN_URL` en `api/.env.example` ya indicaba "must be public" — este fix cumple con esa promesa.

**Solución (Opción A+):** páginas públicas (sin `AuthGuard`) con renderizado condicional y redirect-after-login por `sessionStorage`:
- Si hay `user` con rol `seller` → flujo normal (igual que ahora).
- Si NO hay user → guardar la URL actual (`pathname + search`) en `sessionStorage.stripeConnectReturnTo` y mostrar un mensaje con un botón "Iniciar sesión" que haga `router.push('/autores')`.
- En `client/app/autores/page.js`, tras un `login()` exitoso, comprobar si `sessionStorage.stripeConnectReturnTo` existe **y** empieza por `/seller/stripe-connect/` (whitelist estricta contra open-redirect). Si sí, limpiar la clave y `router.push(returnTo)` en lugar de `/galeria`.

- [x] 17.2.1 En `client/app/seller/stripe-connect/return/page.js`:
  - Eliminar el wrapper `<AuthGuard>` del `export default`.
  - Importar `useAuth` desde `@/contexts/AuthContext` y leer `{ user, loading: authLoading }`.
  - Si `authLoading` → spinner actual.
  - Si `user && user.role === 'seller'` → flujo actual (fetch status → toast → redirect `/orders`).
  - Si no → guardar `window.location.pathname + window.location.search` en `sessionStorage.stripeConnectReturnTo` (solo en cliente: comprobar `typeof window !== 'undefined'`) y renderizar una tarjeta con título "Gracias por completar la información", mensaje "Tu cuenta de pagos con 140d Galería de Arte se está procesando. Para ver el estado o continuar, inicia sesión con tu cuenta de artista." y un botón "Iniciar sesión" que llame a `router.push('/autores')`.

- [x] 17.2.2 En `client/app/seller/stripe-connect/refresh/page.js`:
  - Eliminar el wrapper `<AuthGuard>`.
  - Importar `useAuth` y leer `{ user, loading: authLoading }`.
  - Si `authLoading` → spinner.
  - Si `user && user.role === 'seller'` → flujo actual (generateLink + `window.location.href`).
  - Si no → guardar la URL en `sessionStorage.stripeConnectReturnTo` (mismo patrón que 17.2.1) y renderizar tarjeta con título "Generar nuevo enlace de onboarding", mensaje "Para generar un nuevo enlace y continuar tu onboarding con 140d Galería de Arte, inicia sesión con tu cuenta de artista." y botón "Iniciar sesión" → `router.push('/autores')`.

- [x] 17.2.3 En `client/app/autores/page.js`, modificar `handleSubmit` para que, tras el `await login(email, password)` exitoso, lea `sessionStorage.getItem('stripeConnectReturnTo')`. Si existe y cumple `returnTo.startsWith('/seller/stripe-connect/')` (whitelist estricta), hacer `sessionStorage.removeItem('stripeConnectReturnTo')` y `router.push(returnTo)` en lugar de `/galeria`. Mantener el `router.refresh()` posterior para que el layout se rehidrate con el estado autenticado.

### 17.3 Acción admin directa: enviar nuevo enlace de onboarding por email

**Motivación:** durante la verificación manual queda claro que la forma más cómoda de "corregir datos erróneos" en un `acct_*` con estado `pending` / `restricted` es **reenviar al artista al hosted onboarding**. Stripe permite corregir todos los campos `currently_due` / `past_due` en la misma cuenta conectada — no hace falta crear una nueva. Por tanto NO se añade lógica de reset de cuenta ni versionado del `idempotencyKey`; basta con una acción admin directa que, en un único clic, genere un nuevo `accountLink` y lo envíe al email del artista.

Esta acción ya es posible en dos pasos (botón "Generar enlace de onboarding" → modal → botón "Enviar a {email}"), pero se quiere también un atajo de un único clic en la sección admin.

- [x] 17.3.1 En `client/components/admin/StripeConnectSection.js`, añadir un handler `handleSendLinkEmail` que llame a `adminAPI.stripeConnect.sendLinkEmail(seller.id)` (endpoint ya existente — `POST /api/admin/sellers/:id/stripe-connect/onboarding-link/email`), muestre `showSuccess('Enviado', 'Nuevo enlace de onboarding enviado a {email}.')` al éxito, `showApiError(err)` al fallo, y respete el flag `busy` para deshabilitar los otros botones durante la llamada.

- [x] 17.3.2 Añadir un botón nuevo en la barra de acciones de `StripeConnectSection.js` con label "Enviar nuevo enlace por email". Condición de visibilidad: `accountId && status !== 'active' && status !== 'not_started'` (no tiene sentido en `active` ni cuando no hay cuenta). Estilo: variante secundaria (`bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100`) para diferenciarlo de "Generar enlace de onboarding". Icono: `EnvelopeIcon` de `@heroicons/react/24/outline`.

- [x] 16.14 Verificar el envío del email: pulsar "Enviar por email" en la modal del link. Comprobar la bandeja del seller (o el log SMTP en desarrollo). El email debe usar **"140d Galería de Arte"**, NO "Kuadrat".
