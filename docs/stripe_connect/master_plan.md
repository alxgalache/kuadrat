# Stripe Connect — Master Plan

> **Estado:** documento de referencia canónico para toda la iniciativa Stripe Connect.
> **Audiencia:** Claude (futuras conversaciones), el dev principal, la gestoría (sólo secciones marcadas).
> **Propósito:** este fichero es la **fuente única de verdad** del análisis y de las decisiones tomadas durante la fase de exploración (`/opsx:explore @docs/stripe_connect/init.md`). Sobrevive a cualquier auto-compact del contexto y permite reanudar la implementación sin pérdida de especificidad.
>
> **Importante para Claude:** si encuentras cualquier conflicto entre este fichero y la conversación en curso, prevalece la conversación. Pero ante cualquier ambigüedad sobre intención, alcance o decisiones de diseño, **lee este fichero antes de actuar**.

---

## 1. Branding (lectura obligatoria)

| Contexto | Texto a usar |
|---|---|
| Código fuente, logs, commits, package.json, CLAUDE.md | `Kuadrat` |
| UI (Spanish copy), emails, facturas, informes a la gestoría, descripción de transferencias en Stripe, statement_descriptor, meta tags, dashboard de Stripe Connect | **`140d Galería de Arte`** (forma corta: `140d`) |

- Statement descriptor (max 22 chars, sólo ASCII, sin acentos): `140D GALERIA ARTE`
- En cualquier duda: si lo va a leer un humano fuera del equipo de desarrollo, usar **140d Galería de Arte**.
- Memoria persistente: `~/.claude/projects/-home-axgalache-projects-kuadrat/memory/feedback_public_branding.md`

---

## 2. Contexto del negocio

**140d Galería de Arte** es un marketplace minimalista de arte online (nombre interno del repositorio: `kuadrat`). El operador (la "plataforma" o el "dealer") publica obras de arte y otros productos de los artistas (sellers) en una galería virtual y se queda una comisión por cada venta.

### 2.1 Comisiones (ya implementadas a nivel de env vars y de schema)

| Tipo | Variable backend | Variable frontend | Aplicación |
|---|---|---|---|
| Obra de arte (`art`) | `DEALER_COMMISSION_ART` (default `0.25`) | `NEXT_PUBLIC_DEALER_COMMISSION_ART` | Tributa REBU 10% |
| Otros productos (`others`) | `DEALER_COMMISSION_OTHERS` (default `0.10`) | `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` | IVA estándar 21% |
| Eventos de pago | `DEALER_COMMISSION_OTHERS` (mismo que others) | `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` | IVA estándar 21% |

> El split fue introducido por el change archivado `2026-04-01-split-dealer-commission-by-product-type`. La columna `commission_amount` ya existe en `art_order_items` y `other_order_items` y se usa al acreditar el monedero del artista en `confirmationScheduler.js`.

### 2.2 Régimen fiscal aplicable a los pagos a artistas

| Producto | Régimen | IVA |
|---|---|---|
| Obras de arte originales (`art`) | **REBU** (Régimen Especial de Bienes Usados, Objetos de Arte, Antigüedades y Objetos de Colección) | **10 %** sobre el margen del dealer (no se desglosa al cliente final) |
| Otros productos (`others`) | Régimen general | **21 %** |
| Eventos de pago | Régimen general (servicios) | **21 %** |
| Gastos de envío (Sendcloud / MBE) | Régimen general (servicios de transporte) | **21 %** (NO es suplido — la factura del transportista llega a 140d) |

**Decisión crítica:** un mismo "payout" hacia un artista NO puede mezclar líneas REBU con líneas de IVA estándar, porque la factura/autofactura emitida después tiene una base imponible y un tipo distinto. Por tanto **se separan los saldos del monedero del artista en dos cubos: REBU y estándar** (ver §4.2).

### 2.3 Estado fiscal del artista (particular vs autónomo)

Tres casos posibles a soportar:

1. **Particular sin actividad económica (no autónomo)** — el dealer emite **autofactura** (art. 5 del Reglamento de Facturación) en nombre del artista. Para arte: REBU 10%. Para otros: estándar 21%. Posible IRPF retenido (out of scope v1, sólo guardamos el campo).
2. **Autónomo** — el artista emite su propia factura al dealer. El dealer recibe la factura del artista y la registra como gasto.
3. **Sociedad** — caso excepcional, mismo flujo que autónomo.

**Out of scope v1:** generación automática de PDFs de autofactura. Sólo se exporta CSV/JSON con todos los datos para que la gestoría los emita en su ERP (decisión del usuario).

---

## 3. Decisión arquitectónica fundamental: separate charges and transfers

### 3.1 Por qué NO destination charges

- **Destination charge** mueve el dinero al artista en el mismo instante del pago del comprador (instantáneo o programado por Stripe). El platform sólo retiene la comisión (`application_fee_amount`).
- El requisito del usuario es **retener el pago al artista durante al menos 14 días** (plazo de devoluciones del comprador), y disparar el pago **manualmente** desde un panel admin cuando lo decida.
- En destination charges, revertir un transfer ya hecho requiere que la cuenta destino tenga saldo suficiente — irrecuperable si el artista ya hizo cash-out.
- Por tanto: **separate charges and transfers** es la única opción compatible con el flujo manual.

### 3.2 Modelo elegido

```
┌─────────────────────────────────────────────────────────────────┐
│  COMPRADOR                                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ paga el total (art + envío + IVA)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  PaymentIntent (cuenta plataforma 140d)                          │
│  - destination = NULL                                            │
│  - application_fee_amount = NULL                                 │
│  - transfer_data = NULL                                          │
│  - metadata: order_id, ...                                       │
│  - transfer_group: "ORDER_<id>"                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ payment_intent.succeeded
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Saldo plataforma 140d (Stripe balance + reflejo en BD)          │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │ confirmationSch │───▶│ Acredita users.available_withdrawal │ │
│  │ +14 días        │    │ (split en dos cubos REBU vs std)    │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │ admin abre admin/payouts y aprueba
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  POST /v1/transfers                                              │
│  - destination = acct_xxx (cuenta conectada del artista)         │
│  - amount = saldo aprobado del cubo REBU o estándar              │
│  - currency = "eur"                                              │
│  - transfer_group = "WITHDRAWAL_<id>"                            │
│  - description = "140d Galería de Arte - pago obras ..."         │
│  - metadata = { withdrawal_id, vat_regime, item_ids }            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ transfer.created → webhook → BD persiste
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cuenta conectada del artista (acct_xxx)                         │
│  Configuración: dashboard=express, configuration=recipient       │
│  Capability: stripe_balance.stripe_transfers (active)            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Características clave del modelo

- El platform es **Merchant of Record (MoR)**: emite factura al comprador.
- El cobro al comprador, el saldo y el reembolso siguen los flujos actuales (no cambian).
- El movimiento de fondos al artista es **independiente y diferido**, controlado por el admin.
- Ventana de 14 días aplicada por `confirmationScheduler.js` ya existente, que acredita el monedero (`available_withdrawal`) cuando el item está confirmado.
- El admin tiene total flexibilidad: puede pagar antes (no hay safeguard duro) o no pagar nunca (saldo persiste).

---

## 4. Schema y modelo de datos

### 4.1 Tablas existentes relevantes (NO se reescriben — sólo se anotan los campos que se añaden o se referencian)

#### `users` (existente)
Campos actuales relevantes:
- `id`, `email`, `role` (`buyer|seller|admin`), `full_name`, `slug`
- `available_withdrawal REAL NOT NULL DEFAULT 0` — monedero unificado actual
- `withdrawal_recipient TEXT` — nombre del titular IBAN
- `withdrawal_iban TEXT` — IBAN para transferencia manual

**Campos a añadir en Change #1 (stripe-connect-accounts):**
```sql
-- Stripe Connect (lifecycle de la cuenta conectada)
stripe_connect_account_id TEXT UNIQUE,        -- ej: "acct_1Mio2eLkdIwHu7ix"
stripe_connect_status TEXT CHECK(stripe_connect_status IN
  ('not_started','pending','active','restricted','rejected'))
  DEFAULT 'not_started',
stripe_transfers_capability_active INTEGER NOT NULL DEFAULT 0, -- bool
stripe_connect_requirements_due TEXT,         -- JSON array snapshot del último requirements.summary
stripe_connect_last_synced_at DATETIME,

-- Datos fiscales del artista (necesarios para la autofactura/factura)
tax_status TEXT CHECK(tax_status IN ('particular','autonomo','sociedad')),
tax_id TEXT,                                  -- DNI/NIE/CIF
fiscal_full_name TEXT,                        -- razón social o nombre completo del titular fiscal
fiscal_address_line1 TEXT,
fiscal_address_line2 TEXT,
fiscal_address_city TEXT,
fiscal_address_postal_code TEXT,
fiscal_address_province TEXT,
fiscal_address_country TEXT DEFAULT 'ES',
irpf_retention_rate REAL,                     -- NULLable; out of scope v1 pero campo preparado
autofactura_agreement_signed_at DATETIME      -- aceptación del acuerdo de autofacturación
```

**Campos a añadir en Change #2 (stripe-connect-manual-payouts):**
```sql
-- Two-bucket wallet
available_withdrawal_art_rebu REAL NOT NULL DEFAULT 0,
available_withdrawal_standard_vat REAL NOT NULL DEFAULT 0
-- (la columna available_withdrawal existente se mantiene como agregado read-only:
--  available_withdrawal = available_withdrawal_art_rebu + available_withdrawal_standard_vat,
--  pero las acreditaciones nuevas siempre van a uno de los dos cubos)
```

#### `art_order_items` y `other_order_items` (existentes)
- Ya tienen `commission_amount REAL NOT NULL` y `price_at_purchase REAL NOT NULL`.
- En Change #2 se añadirá `taxable_base REAL` y `vat_amount REAL` (calculados al confirmar el item).

#### `events` y `event_attendees` (existentes)
- `events.price`, `events.access_type`, `events.status` ya existen.
- `event_attendees.amount_paid`, `event_attendees.stripe_payment_intent_id` ya existen.
- En Change #3 se añadirá `events.finished_at DATETIME` y `events.host_credited_at DATETIME`.

#### `withdrawals` (existente)
Campos actuales: `id`, `user_id`, `amount`, `iban`, `recipient_name`, `status`, `admin_notes`, `created_at`.
**Campos a añadir en Change #2:**
```sql
vat_regime TEXT CHECK(vat_regime IN ('rebu_art','standard_vat')) NOT NULL,
stripe_transfer_id TEXT UNIQUE,               -- ej: "tr_1MiN3gLkdIwHu7ixNCZvFdgA"
stripe_transfer_group TEXT,                   -- ej: "WITHDRAWAL_42"
stripe_transfer_status TEXT,                  -- created|reversed|failed
stripe_balance_transaction_id TEXT,
processed_at DATETIME,
total_taxable_base REAL,                      -- suma de taxable_base de los items incluidos
total_vat_amount REAL                         -- suma de vat_amount de los items incluidos
```

### 4.2 Nuevas tablas

#### `withdrawal_items` (Change #2 — pivot polimórfico)
```sql
CREATE TABLE IF NOT EXISTS withdrawal_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  withdrawal_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN
    ('art_order_item','other_order_item','event_attendee')),
  item_id INTEGER NOT NULL,
  -- Snapshot de los importes en el momento de incluir el item en el payout
  -- (porque el item podría borrarse o el price_at_purchase podría reinterpretarse)
  amount REAL NOT NULL,           -- price_at_purchase - commission_amount
  taxable_base REAL NOT NULL,     -- base imponible para autofactura/factura
  vat_amount REAL NOT NULL,       -- importe IVA
  vat_rate REAL NOT NULL,         -- 0.10 para REBU o 0.21 para estándar
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id),
  UNIQUE(withdrawal_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_withdrawal_items_withdrawal ON withdrawal_items(withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_items_item ON withdrawal_items(item_type, item_id);
```

> Patrón polimórfico ya en uso en `shipping_zones_postal_codes` (`ref_type` + `postal_code_id`/`ref_value`) — coherente con el resto del schema.

#### `stripe_connect_events` (Change #1 — log de webhooks recibidos, idempotencia)
```sql
CREATE TABLE IF NOT EXISTS stripe_connect_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT UNIQUE NOT NULL,        -- ej: "evt_..."
  stripe_event_type TEXT NOT NULL,             -- ej: "v2.core.account[requirements].updated"
  account_id TEXT,                             -- acct_xxx si aplica
  payload_json TEXT NOT NULL,                  -- evento "thin" o resuelto
  processed_at DATETIME,                       -- NULL hasta que se haya manejado
  processing_error TEXT,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_account ON stripe_connect_events(account_id);
CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_type ON stripe_connect_events(stripe_event_type);
```

---

## 5. Variables de entorno nuevas

```
# Stripe Connect (Change #1)
STRIPE_CONNECT_ENABLED=true
STRIPE_CONNECT_REFRESH_URL=https://pre.140d.art/seller/stripe-connect/refresh
STRIPE_CONNECT_RETURN_URL=https://pre.140d.art/seller/stripe-connect/return
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Stripe Statement Descriptor (transfers — Change #2)
STRIPE_TRANSFER_DESCRIPTION_PREFIX="140d Galeria de Arte"
STRIPE_TRANSFER_STATEMENT_DESCRIPTOR="140D GALERIA ARTE"
```

> `STRIPE_CONNECT_WEBHOOK_SECRET` es **distinto** del `STRIPE_WEBHOOK_SECRET` actual: el webhook actual es para `payment_intent.*` (eventos snapshot del comprador), mientras que el de Connect es un endpoint independiente que recibe **thin events** de cuentas y de transfers.

> URLs concretas: el dominio real es `https://pre.140d.art` (preview) según `config.sitePublicBaseUrl` en `api/config/env.js`. En producción será `https://140d.art` cuando se promueva.

Estas variables se añaden al `config` en `api/config/env.js` bajo `config.stripe.connect.*`.

---

## 6. Stripe Connect — configuración técnica

### 6.1 Versión del SDK y de la API

- SDK: usar la última versión de `stripe` (npm). El proyecto ya tiene `stripe` instalado para los flujos de comprador.
- Versión de la API: la SDK gestiona la versión por defecto. Para los endpoints **V2** (`v2.core.accounts.create`, `v2.core.accountLinks.create`) la SDK usa la versión preview adecuada automáticamente.
- **Cliente Stripe único:** crear un singleton en `stripeService.js` (ya existe) y reutilizarlo desde `stripeConnectService.js`.

### 6.2 Llamada de creación de la cuenta conectada (V2)

```js
// api/services/stripeConnectService.js
const account = await stripeClient.v2.core.accounts.create({
  display_name: artistDisplayName,         // ej: "Juan Pérez" o "Estudio Foo"
  contact_email: artistEmail,
  identity: { country: 'es' },             // OBLIGATORIO 'es'
  dashboard: 'express',                    // dashboard hosted por Stripe
  defaults: {
    responsibilities: {
      fees_collector: 'application',       // las fees las cobra la plataforma
      losses_collector: 'application',     // las pérdidas las asume la plataforma
    },
  },
  configuration: {
    recipient: {                           // SOLO recipient — ni merchant ni storer
      capabilities: {
        stripe_balance: {
          stripe_transfers: { requested: true },
        },
      },
    },
  },
}, {
  idempotencyKey: `account_create_user_${userId}_v1`,  // evita duplicados en race
});
```

**Reglas estrictas:**
- **NUNCA** pasar `type` en el top-level (ni `'express'`, ni `'standard'`, ni `'custom'`). Esto invocaría la API legacy v1.
- **NUNCA** añadir `merchant` ni `storer` dentro de `configuration`. Sólo `recipient`.
- `service_agreement` se infiere automáticamente como `recipient` por la presencia exclusiva de `configuration.recipient`.

### 6.3 Account Links (onboarding hosted por Stripe)

```js
const accountLink = await stripeClient.v2.core.accountLinks.create({
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
// accountLink.url → la URL hosted que el artista abre en su navegador
```

### 6.4 Lectura del estado de la cuenta

```js
const account = await stripeClient.v2.core.accounts.retrieve(stripeAccountId, {
  include: ['configuration.recipient', 'requirements'],
});

const transfersStatus = account?.configuration?.recipient
  ?.capabilities?.stripe_balance?.stripe_transfers?.status;
const readyToReceive = transfersStatus === 'active';

const reqStatus = account?.requirements?.summary?.minimum_deadline?.status;
const onboardingComplete = reqStatus !== 'currently_due' && reqStatus !== 'past_due';
```

Mapeo a nuestra columna `users.stripe_connect_status`:

| Estado Stripe | Nuestro `stripe_connect_status` |
|---|---|
| Cuenta no creada | `not_started` |
| Cuenta creada, requirements pendientes | `pending` |
| Cuenta creada, transfers active | `active` |
| Cuenta creada, transfers `inactive` por requisitos | `restricted` |
| Cuenta rechazada / desactivada por Stripe | `rejected` |

### 6.5 Webhook de Connect — thin events

**Endpoint nuevo:** `POST /api/stripe/connect/webhook` (raw body, sin auth, validado por firma).

Eventos a escuchar (configurar en el dashboard de Stripe):
- `v2.core.account[requirements].updated`
- `v2.core.account[configuration.recipient].capability_status_updated`
- `transfer.created` (legacy snapshot — Change #2)
- `transfer.reversed` (legacy snapshot — Change #2)
- `transfer.failed` (legacy snapshot — Change #2)
- `payout.failed` (legacy snapshot — sólo si en algún momento se activan payouts automáticos del artista, en v1 N/A)

**Parsing de thin events:**
```js
const thinEvent = stripeClient.parseThinEvent(rawBody, sigHeader, webhookSecret);
// thinEvent.id → "evt_..."
// thinEvent.type → "v2.core.account[requirements].updated"
// thinEvent.related_object → { type: "v2.core.account", id: "acct_..." }

// Para obtener el payload completo:
const event = await stripeClient.v2.core.events.retrieve(thinEvent.id);
```

**Patrón handler:**
1. Insertar fila en `stripe_connect_events` con `processed_at = NULL` (idempotencia: si ya existe el `stripe_event_id`, ignorar).
2. Llamar al handler correspondiente al `event.type`.
3. El handler hace `accounts.retrieve` y actualiza `users` con el estado fresco.
4. Marcar `processed_at = now()`.
5. Devolver `200 OK` rápido (Stripe reintenta si tarda > 30s).

> **Patrón webhook idempotente:** ya en uso en `stripePaymentsController.js` para `payment_intent.succeeded`. Replicar la misma técnica.

### 6.6 Transfers (Change #2)

```js
const transfer = await stripeClient.transfers.create({
  amount: amountCents,                      // siempre en céntimos
  currency: 'eur',
  destination: stripeAccountId,
  description: `140d Galeria de Arte - pago ${vatRegime === 'rebu_art' ? 'obras' : 'productos/servicios'} (W#${withdrawalId})`,
  transfer_group: `WITHDRAWAL_${withdrawalId}`,
  metadata: {
    withdrawal_id: String(withdrawalId),
    user_id: String(userId),
    vat_regime: vatRegime,                  // 'rebu_art' | 'standard_vat'
    items_count: String(itemIds.length),
    platform: 'kuadrat',                    // marcador interno
  },
}, {
  idempotencyKey: `transfer_withdrawal_${withdrawalId}_v1`,
});
```

**Constraints clave del API de transfers:**
- `source_transaction` será `null` (financiamos desde el balance del platform, no desde un charge específico).
- Reversal sólo posible si la cuenta destino tiene saldo. Una vez el artista ha hecho cash-out, el reversal falla → la única vía es proceso manual externo.

---

## 7. Roadmap de cambios OpenSpec (4 changes)

> Los 4 changes están **completamente definidos en este master plan**. Cada uno se materializará como artefactos OpenSpec en `openspec/changes/<nombre>/`. Los nombres de los changes son definitivos.

### Change #1 — `stripe-connect-accounts`

**Alcance:** lifecycle de la cuenta conectada del artista (creación, onboarding, sync de estado, datos fiscales).

**Artefactos a crear:**
- `openspec/changes/stripe-connect-accounts/proposal.md`
- `openspec/changes/stripe-connect-accounts/design.md`
- `openspec/changes/stripe-connect-accounts/tasks.md`
- `openspec/changes/stripe-connect-accounts/specs/stripe-connect-accounts/spec.md`

**Backend:**
1. Nuevas env vars (§5).
2. Schema additions a `users` (§4.1, sección Change #1) + nueva tabla `stripe_connect_events` (§4.2).
3. Nuevo `api/services/stripeConnectService.js` con:
   - `createConnectedAccount({ user })` → `v2.core.accounts.create` con idempotencyKey.
   - `createOnboardingLink({ user })` → `v2.core.accountLinks.create`.
   - `retrieveAccount(stripeAccountId)` → `v2.core.accounts.retrieve` con `include`.
   - `syncAccountStatus({ user, account? })` → fetch + update `users.stripe_connect_*`.
4. Nuevo `api/controllers/stripeConnectController.js` con:
   - `POST /api/admin/sellers/:id/stripe-connect/create` (admin) → crea la cuenta y guarda `stripe_connect_account_id`.
   - `POST /api/admin/sellers/:id/stripe-connect/onboarding-link` (admin) → genera link y devuelve URL.
   - `GET /api/admin/sellers/:id/stripe-connect/status` (admin) → fuerza un sync y devuelve estado actual.
   - `POST /api/seller/stripe-connect/onboarding-link` (seller authenticated) → genera link para él mismo.
   - `GET /api/seller/stripe-connect/status` (seller) → estado actual.
5. Nuevo `api/controllers/stripeConnectWebhookController.js` con:
   - `POST /api/stripe/connect/webhook` → parseThinEvent, persiste, despacha al handler.
   - Handlers para `v2.core.account[requirements].updated` y `v2.core.account[configuration.recipient].capability_status_updated`.
6. Endpoint admin para actualizar **datos fiscales** del artista: `PUT /api/admin/sellers/:id/fiscal` (con todos los campos `tax_*`, `fiscal_*`, `irpf_*`, `autofactura_*`).
7. Validación Zod en `api/validators/stripeConnectSchemas.js` y `api/validators/fiscalSchemas.js`.

**Frontend:**
1. **Admin → Autores → Detalle del artista**: nueva sección "Stripe Connect" con:
   - Botón "Crear cuenta conectada" (deshabilitado si ya existe `stripe_connect_account_id`).
   - Botón "Generar enlace de onboarding" (visible si la cuenta existe y `stripe_connect_status !== 'active'`). Al hacer click, muestra la URL en una modal con un botón "Copiar" + "Enviar por email al artista".
   - Botón "Sincronizar estado" (siempre visible si existe la cuenta).
   - Badge con el estado actual (`not_started`, `pending`, `active`, `restricted`, `rejected`).
   - Lista de `requirements_due` en formato legible.
2. **Admin → Autores → Detalle del artista**: nueva sección "Datos fiscales" con form para `tax_status`, `tax_id`, `fiscal_full_name`, `fiscal_address_*`, `irpf_retention_rate` (input numérico opcional), checkbox "El artista ha firmado el acuerdo de autofacturación" (con timestamp).
3. **Seller → Dashboard del artista**: banner persistente "Conecta tu cuenta para recibir pagos" que muestra el estado actual:
   - `not_started`: "Aún no hemos creado tu cuenta de pagos. Contacta con 140d Galería de Arte." (no acción del seller).
   - `pending` con `account_id`: botón "Continuar onboarding" → redirige a la URL hosted de Stripe.
   - `restricted`: "Hay datos pendientes en tu cuenta de pagos" + botón "Completar".
   - `active`: banner verde "Cuenta de pagos conectada. Puedes recibir transferencias."
   - `rejected`: "Tu cuenta de pagos ha sido rechazada por Stripe. Contacta con 140d Galería de Arte."
4. **Seller → ruta `/seller/stripe-connect/return`**: página intermedia que llama al endpoint de status, espera 1-2s, redirige al dashboard del seller.
5. **Seller → ruta `/seller/stripe-connect/refresh`**: misma página, pero al volver de un link expirado regenera y redirige al onboarding.

**Capability nueva:** `stripe-connect-accounts`.

### Change #2 — `stripe-connect-manual-payouts`

**Alcance:** monedero dual REBU/estándar, panel admin de payouts, ejecución manual del transfer, webhook legacy de transfers.

**Backend:**
1. Schema additions (§4.1 Change #2 y §4.2 `withdrawal_items`).
2. Migración de `available_withdrawal` → split en dos cubos (a partir de la fecha de despliegue, los créditos nuevos van al cubo correcto; el saldo histórico se conserva como `available_withdrawal_standard_vat` por defecto, pero **el usuario debe poder reasignarlo manualmente desde el admin** si hay obras de arte pendientes — incluir en plan de migración).
3. Modificar `confirmationScheduler.js` y los puntos de acreditación del monedero para acreditar el cubo correcto (`art_order_items` → REBU; `other_order_items` → estándar; `event_attendees` → estándar).
4. Calcular y persistir `taxable_base` y `vat_amount` por item al confirmar (helpers en `api/utils/paymentHelpers.js`).
5. Nuevo `stripeConnectService.createTransfer(...)` (§6.6).
6. Nuevo controlador `api/controllers/admin/payoutsController.js` con:
   - `GET /api/admin/payouts/pending` → lista de sellers con saldo > 0 en cualquier cubo, agrupados.
   - `GET /api/admin/payouts/sellers/:id` → detalle de un seller con sus items confirmados pendientes (separados por cubo).
   - `POST /api/admin/payouts/sellers/:id/preview` → recibe lista de `item_ids`, devuelve subtotal, base imponible, IVA, importe neto.
   - `POST /api/admin/payouts/sellers/:id/execute` → recibe `{ vat_regime, item_ids, amount }`, crea fila en `withdrawals`, rellena `withdrawal_items`, llama a `stripe.transfers.create`, persiste `stripe_transfer_id`, decrementa el cubo correspondiente del monedero atómicamente. Idempotency key.
7. Webhook handlers para `transfer.created`, `transfer.reversed`, `transfer.failed`.
8. Modal de confirmación de irreversibilidad antes de ejecutar el transfer (ver UI).

**Frontend:**
1. Nueva página `/admin/payouts` (lista) y `/admin/payouts/[sellerId]` (detalle por artista).
2. Selector de items a incluir (checkboxes), forzando que sólo items del mismo `vat_regime` puedan estar marcados a la vez (UI bloquea mezclar arte con otros).
3. Modal de confirmación con resumen + warning "Esta acción es **irreversible** una vez Stripe procesa el transfer y el artista hace cash-out. Verifica el importe y los datos del artista antes de confirmar." + checkbox de aceptación + botón rojo "Confirmar y enviar transferencia".
4. Email al admin (mantener la alerta actual de "Realizar transferencia") con un enlace a `/admin/payouts/[sellerId]`.
5. **Seller → Dashboard del monedero**: mostrar dos saldos separados ("Disponible (obras de arte)" / "Disponible (otros productos y eventos)") y el historial de payouts recibidos con su estado.

**Capabilities afectadas:** modifica `seller-wallet` (split del monedero), modifica `seller-withdrawals` (panel admin nuevo + transfer real), capability nueva `stripe-connect-payouts`.

### Change #3 — `stripe-connect-events-wallet`

**Alcance:** integrar los eventos de pago en el flujo de monedero (actualmente fuera del scheduler).

**Backend:**
1. Añadir `events.finished_at DATETIME` y `events.host_credited_at DATETIME` al schema.
2. Cuando el host abandona el stream (lógica ya existente en `eventService` o `livekitService`), si el evento es de pago marcar `finished_at = now()`.
3. Nuevo job en `auctionScheduler.js` (o un nuevo `eventScheduler.js`): cada hora, encontrar eventos con `finished_at IS NOT NULL`, `host_credited_at IS NULL`, `finished_at < now() - 1 day` (1 día de gracia para reembolsos manuales). Acreditar el cubo `available_withdrawal_standard_vat` con `(amount_paid - commission_amount)` por cada `event_attendees` con pago confirmado. Marcar `host_credited_at = now()`.
4. El admin puede ver los eventos de pago en `/admin/payouts/[sellerId]` y elegir incluirlos en el siguiente transfer.

**Frontend:**
1. Mostrar en el dashboard del seller (sección "Eventos") los eventos de pago con su estado de acreditación.
2. UI para que el admin marque manualmente un evento como "no acreditar" si hubo reembolsos.

**Capabilities afectadas:** modifica `live-events-ux-improvements` (o crea `event-payouts`).

### Change #4 — `stripe-connect-fiscal-report`

**Alcance:** informe markdown para la gestoría con todo el detalle fiscal del flujo + endpoint de export CSV/JSON de los items por payout.

**Backend:**
1. Nuevo endpoint `GET /api/admin/payouts/:withdrawalId/fiscal-export?format=csv|json` que devuelve:
   - Datos del artista (fiscal_*).
   - Datos de la plataforma (140d Galería de Arte, CIF, dirección).
   - Cada item con: descripción, base imponible, tipo IVA, importe IVA, total.
   - Subtotales y totales.
   - Modo de facturación aplicable (`autofactura` o `factura_recibida`).
   - Tipo de operación (REBU o estándar).
2. Endpoint `GET /api/admin/payouts/fiscal-export?from=...&to=...&format=csv` para informes mensuales/trimestrales agregados.

**Frontend:**
1. Botón "Exportar para gestoría (CSV)" en cada payout y en la lista global.
2. Botón "Exportar todos los payouts del trimestre" en `/admin/payouts`.

**Documentación:**
1. Crear `docs/stripe_connect/fiscal_report_for_gestoria.md` con:
   - Explicación del flujo de cobro y pago.
   - Modelo MoR (140d emite factura al comprador).
   - Régimen REBU para obras de arte.
   - Régimen estándar 21% para otros y eventos.
   - IVA del transporte (Sendcloud/MBE).
   - Autofacturación para artistas particulares (art. 5 RF).
   - IRPF retenido (campo preparado, no aplicado en v1).
   - Cómo importar el CSV de export en su ERP.
   - Casos de borde: reembolsos, reversiones, transferencias fallidas.
2. Incluir en `docs/stripe_connect/master_plan.md` (este fichero) un enlace a este documento cuando exista.

**Capability nueva:** `stripe-connect-fiscal-report`.

---

## 8. Decisiones tomadas (registro completo)

| # | Decisión | Razón | Cuándo se decidió |
|---|---|---|---|
| 1 | **Separate charges and transfers** (NO destination charges) | Único modelo compatible con la retención manual de 14 días | Round 1 de exploración |
| 2 | **Stripe Connect V2 API** (`v2.core.accounts.create`) | El usuario sigue el guide oficial actualizado; configuración recipient + dashboard express + responsibilities application | Round 1 |
| 3 | **`configuration.recipient` exclusivo** (sin merchant ni storer) | El artista no necesita aceptar pagos directamente, sólo recibir transferencias del platform | Round 1 |
| 4 | **`dashboard: 'express'`** | Stripe-hosted dashboard para el artista; minimiza desarrollo de UI custom | Round 1 |
| 5 | **`fees_collector: 'application'` y `losses_collector: 'application'`** | El platform asume todas las fees y los riesgos | Round 1 |
| 6 | **`identity.country: 'es'`** | Todos los artistas son residentes fiscales en España (constraint del negocio) | Round 1 |
| 7 | **Hybrid onboarding (admin inicia + artista completa)** | El admin crea la cuenta y envía el link al artista; el artista completa el formulario hosted en Stripe | Round 1 |
| 8 | **Stripe-hosted onboarding** (NO custom UI) | Las regulaciones KYC cambian frecuentemente; mantener UI custom es costoso | Round 1 |
| 9 | **Two-bucket wallet** (`available_withdrawal_art_rebu` + `available_withdrawal_standard_vat`) | Un transfer no puede mezclar líneas REBU con líneas de IVA estándar (factura distinta) | Round 2 — usuario aceptó Option A |
| 10 | **`withdrawal_items` polimórfico** con `taxable_base` + `vat_amount` + `vat_rate` por item | Permite generar autofactura/factura con detalle exacto | Round 2 |
| 11 | **Modal de confirmación de irreversibilidad** antes de ejecutar transfer | Reversal sólo posible si la cuenta destino tiene saldo; los cash-outs son irrecuperables | Round 2 |
| 12 | **Sin safeguard de 14 días en el panel admin** | Total flexibilidad para el admin (puede pagar antes); el scheduler ya gate-keepea la acreditación del monedero | Round 2 |
| 13 | **IRPF out of scope v1**, pero se guarda el campo `irpf_retention_rate` | El usuario quiere preparar el campo aunque no se aplique todavía | Round 2 |
| 14 | **Eventos: host marca `finished_at` al abandonar el stream**, scheduler acredita +1 día | El admin/el host puede emitir reembolsos manuales antes de que el saldo se considere disponible | Round 2 |
| 15 | **Reembolsos: proceso manual externo** (no integrado en v1) | El plazo de 14 días + el flujo de confirmación dan suficiente protección; refund a Stripe se hace desde el dashboard | Round 2 |
| 16 | **Branding público: "140d Galería de Arte"** | "Kuadrat" es el nombre interno del repositorio; nunca debe aparecer en UI/emails/Stripe descriptions | Round 2 — corrección explícita del usuario |
| 17 | **Statement descriptor: `140D GALERIA ARTE`** (ASCII, sin acentos, ≤22 chars) | Constraint de Stripe sobre statement_descriptor | Round 2 |
| 18 | **Shipping IVA: 21% en ambos lados** (no es suplido) | Las facturas del transportista van a 140d, no al artista, por tanto no es suplido legalmente válido | Round 2 |
| 19 | **Autofacturación: Option B (export CSV/JSON)** — sin generar PDFs en v1 | La gestoría emitirá los documentos en su ERP a partir del export | Final |
| 20 | **4 changes OpenSpec independientes** (no un single change masivo) | Permite reviewar e implementar incrementalmente sin bloquear todo | Final |

---

## 9. Datos fiscales del platform (a guardar en config / env, no en DB)

| Campo | Valor | Env var |
|---|---|---|
| Razón social pública | 140d Galería de Arte | `BUSINESS_NAME` |
| Razón social legal (gestoría) | _(pendiente — pedir al usuario)_ | `BUSINESS_LEGAL_NAME` |
| CIF/NIF | _(pendiente)_ | `BUSINESS_TAX_ID` |
| Dirección fiscal | _(pendiente)_ | `BUSINESS_ADDRESS_*` |
| Email fiscal | info@140d.art (ya en `EMAIL_FROM`) | — |

> Estos datos se incorporarán al export CSV/JSON del Change #4. **Action item:** preguntar al usuario en el momento de implementar Change #4.

---

## 10. Asunciones explícitas (revisar al implementar)

1. **Todos los artistas son residentes fiscales en España.** Si en el futuro se admite un artista de otro país, hay que reabrir las decisiones #6, #9 y todo el modelo fiscal.
2. **El platform es residente fiscal en España.** Modelo MoR español aplicable.
3. **Sólo EUR.** Todos los pagos en euros, no se soporta multi-divisa.
4. **El balance de Stripe del platform tiene fondos suficientes** para emitir los transfers en el momento del payout. Si no, `transfers.create` falla con `balance_insufficient` — hay que mostrar un error claro al admin.
5. **El scheduler de confirmación (`confirmationScheduler.js`) es la ÚNICA fuente de acreditación del monedero.** Cualquier punto que acredite manualmente debe reusar el helper para mantener la consistencia REBU/estándar.
6. **El artista NO puede iniciar él mismo la creación de la cuenta en v1.** Requiere intervención del admin (decisión #7). En el futuro se podría exponer un botón "Solicitar onboarding" en el seller dashboard.
7. **No hay límite mínimo ni máximo en el monto de un payout** (no enforced en código). El admin elige. Si Stripe rechaza por debajo del mínimo de la cuenta destino, se devuelve el error tal cual.

---

## 11. Notas para Claude en futuras conversaciones

- **Lee este fichero ANTES de tocar nada relacionado con Stripe Connect.** Es la fuente de verdad.
- Si el usuario menciona "el monedero", "los payouts", "la cuenta conectada del artista", "la facturación", "la gestoría" — empieza por leer la sección relevante de este documento.
- Si encuentras una decisión que no está aquí pero que te haga falta tomar, **pregunta al usuario antes de implementar**. Este documento se actualiza con cada decisión nueva.
- Cuando un Change se implemente y se archive, marca su sección con `(IMPLEMENTADO)` y añade un enlace al PR/commit.
- Si necesitas actualizar este documento, hazlo de forma quirúrgica (Edit, no Write completo) y registra el cambio en una nueva entrada al final de la §13.

---

## 12. Referencias externas

- Stripe Connect Marketplace overview: https://docs.stripe.com/connect
- Stripe V2 Accounts API: https://docs.stripe.com/api/v2/core/accounts
- Stripe Account Links V2: https://docs.stripe.com/api/v2/core/account_links
- Stripe Transfers API (legacy v1): https://docs.stripe.com/api/transfers
- Stripe Thin Events: https://docs.stripe.com/webhooks?snapshot-or-thin=thin
- Stripe Service Agreements: ver `docs/stripe_connect/service-agreement-types.md`
- AEAT — REBU: https://sede.agenciatributaria.gob.es/Sede/iva/regimenes-iva/regimen-especial-bienes-usados-rebu.html
- AEAT — Autofacturación (art. 5 RF): https://sede.agenciatributaria.gob.es/Sede/iva/facturacion/expedicion-facturas/expedicion-tercero-empresario.html

---

## 13. Changelog del master plan

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-04-08 | Creación inicial tras la fase de exploración (`/opsx:explore`). Captura todas las decisiones de Round 1, Round 2 y final. | Claude (Opus 4.6) en sesión `8ef81333` |
