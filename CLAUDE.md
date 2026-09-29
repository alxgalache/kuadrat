# Monorepo Project: "Kuadrat" - A Minimalist Online Art Gallery

Este fichero se carga en todas las sesiones y contiene solo lo que necesita cualquier tarea. El porqué detallado de cada área está en `.claude/rules/`: consulta el índice en «Conocimiento por dominio».

## Project Overview

Kuadrat is a minimalist online marketplace for art, functioning as a virtual art gallery. Artists (Sellers) list their work and art enthusiasts (Buyers) purchase it. The dealer takes a commission on each sale. The project includes a RESTful API backend, NextJS frontend, real-time auctions, and live events/streaming, all managed within a dockerized monorepo.

## Technology Stack

* **Backend:** Express.js on Node.js 20
* **Database:** Turso (libsql/client, SQLite-compatible)
* **Frontend:** Next.js 16, React 19, JavaScript (no TypeScript), TailwindCSS, App Router
* **Auth:** Passport.js (passport-local + passport-jwt), JWT tokens
* **Payments:** Stripe (primary), Revolut (legacy support)
* **Real-time:** Socket.IO for auctions and event notifications (plus the authenticated per-event room used by Agora events)
* **Streaming:** LiveKit + Agora, selectable per event (`events.provider`, default `livekit`); Agora adds an `interaction_mode` (`broadcast` = LiveKit parity | `meeting` = Meet-style camera grid, max 16 attendees), client-side virtual backgrounds, and in `broadcast` an on-camera interview mode where the admin co-presents with the host (see `.claude/rules/agora/interviews-cohost.md`)
* **Email:** Resend (default) or SMTP through Nodemailer, chosen by `EMAIL_PROVIDER`; every send goes through `sendMail()` in `api/services/emailService.js`
* **Logging:** Pino (structured JSON in production, pretty in development)
* **Validation:** Zod schemas for API request validation
* **Containerization:** Docker and Docker Compose
* **Monitoring:** Sentry (client + server)

## Design Philosophy

* **Extreme Minimalism:** TailwindCSS components and UI Blocks, no modifications
* **Focus on Art:** Only images are the artworks themselves
* **Light Theme Only:** No dark mode
* **All Spanish UI text** (es-ES locale)

## Architecture

Monorepo with two independent apps, each with its own `package.json` (there is none at the repository root): `api/` (Express) and `client/` (Next.js App Router). Directory contents change often, so list them instead of trusting a count written here.

### Backend (`api/`)

* `app.js` assembles Express + Socket.IO and is **free of side effects** (tests import it); `server.js` is the process entry point (schema init, `listen`, schedulers, graceful shutdown). See «Testing» below.
* `config/` — `database.js` (schema, single source of truth), `env.js` (every environment variable, validated at startup), `logger.js` (Pino), `passport.js` (JWT + local strategies), `shutdown.js`.
* Request path: `routes/` → `validators/` (Zod, applied with `middleware/validate.js`) → `controllers/` → `services/`. Admin routes live in `routes/admin/`, whose `index.js` applies `authenticate` + `adminAuth` once for all of them.
* `services/` — business logic and integrations: Stripe and Stripe Connect, Sendcloud and shipping (`services/shipping/`), Agora, LiveKit, email, S3, invoices, NTAG 424. Revolut is legacy.
* `socket/` — `auctionSocket.js`, `drawSocket.js` and `eventSocket.js` (the authenticated per-event room: presence, chat, moderation, stage).
* `scheduler/` — cron jobs: auction lifecycle, reservation release, Sendcloud auto-confirmation, shipment retries, event credits, Agora recording, video-pass closing, database backups. Started from `server.js` only, so never under test.
* `utils/` (shared helpers), `middleware/` (auth and roles, rate limiting, security filters for prototype pollution, command injection and user agents, ETag/Cache-Control, timeout), `scripts/` (operator commands: `npm run backup:now`, `npm run s3:cache-headers`), `tests/` (Jest).
* `controllers/orders/index.js` and `services/email/index.js` are plain re-exports, kept as seams for a future split of the two largest files.

### Frontend (`client/`)

* `app/` — App Router routes: `galeria/` (art), `tienda/` (store products), `eventos/` (auctions and draws), `live/` (live events and video passes), `admin/`, `seller/`, `orders/`, `legal/`, plus the checkout result pages.
* `components/` — shared UI, with `events/` (live rooms), `shipping/`, `seller/`, `admin/` and `coa/`; `hooks/`; `contexts/` (auth, cart, cookie consent, notifications). The live room is `AgoraLiveRoom.js` for Agora events and `EventLiveRoom.js` for LiveKit ones.
* `lib/api.js` — centralized API client (request deduplication, global 401/429 handling; `lib/api/index.js` re-exports it); `lib/serverApi.js` — server-side fetches; `lib/constants.js` — app constants **and all es-ES copy**.
* `next.config.js` — Sentry wrapping, `output: 'standalone'` and the **Content-Security-Policy**: every new third-party origin has to be added there, or it fails in the browser with nothing but a console violation.

### Elsewhere

`deploy/` (nginx, `deploy.sh`, CloudFront), `docs/` (operator guides), `openspec/` (specs and change proposals), `scripts/` (NFC personalization, video encoding, the rules checker).

## Key Patterns

### Backend Patterns

* **Structured Logging:** All files use `const logger = require('../config/logger')` (Pino). No `console.log` in production code.
* **Centralized Config:** All env vars accessed via `const config = require('../config/env')`. Validates required vars at startup.
* **Request Validation:** Zod schemas in `api/validators/`, applied via `validate()` middleware in routes.
* **Response Helpers:** `sendSuccess()`, `sendPaginated()`, `sendCreated()` from `api/utils/response.js`.
* **Error Handling:** `ApiError` class thrown in controllers, caught by global `errorHandler` middleware.
* **Transactions:** `createBatch()` from `api/utils/transaction.js` for atomic multi-table operations.
* **Caching:** `cacheControl()` middleware on public GET endpoints (art, others, authors).
* **Rate Limiting:** 4-tier via `config.rateLimit.*` (general, auth, sensitive, paymentVerification).
* **Graceful Shutdown:** SIGTERM/SIGINT handlers close HTTP, Socket.IO, log sequence.
* **Response Compression:** gzip via `compression` middleware (early in stack).

### Frontend Patterns

* **Performance:** CartContext uses `useMemo`/`useCallback` on all exposed functions.
* **Error Boundaries:** `<ErrorBoundary>` component for graceful failure handling.
* **Shared Hooks:** `useDebounce`, `usePostalCodeValidation` avoid duplicate logic.
* **Constants:** Magic numbers extracted to `lib/constants.js`.
* **API Client:** Centralized `lib/api.js` with request deduplication and global 401/429 handling.

## Testing (isolation rules — non-negotiable)

The local development environment points at the **preproduction** Turso database and at the real email provider. A test run must therefore never be allowed to reach either. Run the backend suite with `npm test` from `api/` (or `docker compose exec api npm test`).

**The three guarantees, each enforced in code rather than by convention:**

* **Local database.** `api/.env.test` sets `TURSO_DATABASE_URL=file:./.tmp/test.db` — a local SQLite file through the very same `@libsql/client`, so no application code changes. `api/tests/setup/globalSetup.js` recreates it from `initializeDatabase()` (still the single source of schema truth) and `globalTeardown.js` deletes it; `KEEP_TEST_DB=1` keeps it for post-mortem. `importPostalCodes()` is skipped under test (`SEED_POSTAL_CODES=1` forces the full ES.csv import); a few sample codes are seeded in `tests/setup/seed.js`.
* **Anti-remote guard.** `api/config/database.js` aborts the process (`process.exit(1)`, before the client is created) when `NODE_ENV=test` and the URL is not `file:`. This is the backstop that makes the rest a guarantee: a stale `.env`, a compose file injecting preprod, or a broken dotenv override can no longer write to preproduction.
* **No email leaves the process.** `config.emailTransport` is `noop` whenever `NODE_ENV=test` (or `EMAIL_TRANSPORT=noop`). `sendMail()` in `api/services/emailService.js` — the single chokepoint for both Resend and SMTP — records the message in an in-memory outbox and returns a synthetic `messageId` instead of contacting anyone. `marketingEmailService.marketingActive()` carries the same kill switch. Assert on email with `emailService.__getOutbox()` / `__clearOutbox()`.

**Structural rules that make the above possible:**

* `api/app.js` assembles Express + Socket.IO and is **free of side effects**; `api/server.js` is the process entry point and owns everything that touches the world (schema init, wallet migration, email verification, `listen`, the schedulers, graceful shutdown). Tests import `app.js`, never `server.js` — importing `server.js` would start the schedulers, which mutate whatever database is configured.
* Integration tests require `tests/helpers/app.js`, not `../app` directly: it registers the `afterAll` that releases the Socket.IO handles, without which the Jest worker never exits.
* Sentry is skipped entirely under test (`instrument.js` and the `setupExpressErrorHandler` call are both guarded). Merely importing `@sentry/node` installs global require-hook instrumentation that survives Jest's per-file module registry and breaks unrelated suites.
* `dotenv` does **not** overwrite variables already in `process.env`, and in Docker the preprod values arrive via compose `env_file`. `tests/setup/env.js` therefore loads `.env.test` with `{ override: true }`. Never load a test env file without it.
* `api/.env.test` is **versioned** and contains dummy values only — never a real credential. Personal overrides go in the gitignored `.env.test.local`.
* `tests/testEnvironmentIsolation.test.js` asserts all three guarantees; treat a failure there as a stop-the-line event.
* `client/` has no test runner yet. When one is added the same rule applies: client tests must not reach the network, the API or any real database.

## Database Schema Management

The database schema is defined in `api/config/database.js`. This file is the **single source of truth**.

**Key rules:**
* `initializeDatabase()` runs on every startup (idempotent via `IF NOT EXISTS`).
* Schema changes: update the `CREATE TABLE` statement, which is what a fresh database gets. When existing databases (production) must gain a column too, add an idempotent `safeAlter('ALTER TABLE … ADD COLUMN …')` beside the others in `initializeDatabase()`, never a separate migration script. A `CHECK` constraint lives only in the `CREATE TABLE`: SQLite does not apply a constraint added by `ALTER TABLE` to the rows already written, so validate the value with Zod on the routes that write it.
* It holds every table and index, including the performance indexes on orders, products, auctions and events.
* Orders auto-increment starts at 1000 (for fresh DBs).
* Postal codes imported from `api/migrations/ES.csv` (only when empty).
* **A `--` comment inside a `CREATE TABLE` must never end a line with a semicolon, and must never contain a backslash escape.** SQLite stores the statement in `sqlite_master` *with its comments*, and `restoreInto` in `api/tests/dbDump.test.js` splits the dump on semicolon-plus-newline — the only terminator that was true of our dump until a comment could carry one. A semicolon there splits the table in two on restore (`SQLITE_ERROR: incomplete input`); and since the schema is a JS template literal, a `\n` written inside a comment becomes a real newline that ends the comment early and leaves its tail as SQL. Both were found this way: green suite, then three failures in `dbDump.test.js` only.

## Postal Code References (Polymorphic Pivot Tables)

Three pivot tables use a **polymorphic reference pattern**:
* `ref_type` — `'postal_code'` | `'province'` | `'country'`
* `postal_code_id` — set only when `ref_type = 'postal_code'`
* `ref_value` — province name or country code otherwise

## Product Images (Polymorphic, up to 3 per entity)

Product images live in a single polymorphic table `product_images`:
* `product_type` — `'art'` | `'other'` | `'other_var'`
* `product_id` — the FK into `art`, `others`, or `other_vars` respectively
* `basename` — globally unique UUID-based filename; the file lives under `art/` for `'art'` and under `others/` for both `'other'` and `'other_var'`
* `position` — 0..2 ordering within each `(product_type, product_id)` group

Read path: API controllers select product rows WITHOUT `basename` and then call `attachProductImages(rows, productType)` from `api/utils/productImages.js` to hydrate each row with `images: [...]` and a derived `thumbnail_basename`. For SQL paths that snapshot a single basename (orders, payments, emails), use the inline subquery `(SELECT basename FROM product_images WHERE product_type = ? AND product_id = X.id ORDER BY position ASC, id ASC LIMIT 1) AS basename`.

The cap of 3 images per `(product_type, product_id)` is enforced at the upload layer (multer maxCount + controller validation), not at the DB level. The `art`, `others`, and `other_vars` tables no longer carry a `basename` column.

## Environment Variables

Every variable is read through `config` (`api/config/env.js`), which validates them at startup, and is documented in `api/.env.example`. The catalogue by group (what is optional, what fails startup when missing or half set) lives in `.claude/rules/infra/environment-variables.md`.

### Adding a new `NEXT_PUBLIC_*` variable

`NEXT_PUBLIC_*` vars are embedded into the JS bundle at build time, so they must be present as ENV variables *during* `npm run build`. To add one, touch all FOUR places — missing any of them silently ships an empty value to production:

1. `/.env.example` (repo root) — the source list read by docker-compose; also add it to local `/.env`.
2. `client/.env.example` — the per-app reference for devs running Next.js outside Docker.
3. `client/Dockerfile.staging` AND `client/Dockerfile.prod` — add an `ARG` line in the build-args block AND a matching `ENV NAME=$NAME` line before `RUN npm run build`. The local `client/Dockerfile` does NOT need it (dev mode reads env vars at runtime).
4. `docker-compose.prod.yml` AND `docker-compose.pre2.yml` (staging) — add `- NEXT_PUBLIC_FOO=${NEXT_PUBLIC_FOO}` inside the client service's `build.args:` block.

## Invariantes transversales

Reglas que, si se olvidan, rompen algo en silencio desde cualquier parte del código. El detalle y el porqué de cada una están en la regla indicada.

* **`is_sold` solo se escribe en la misma sentencia que `editions_sold`**, y cada canal de venta consume una sola vez: el contador no es idempotente. Lo vigila `api/tests/editionInventory.test.js`. → `.claude/rules/catalog/limited-editions.md`
* **`password_hash` solo se escribe junto a `password_changed_at`**, en la misma sentencia; los flujos de activación y de restablecimiento nunca se fusionan. Lo vigila `api/tests/passwordChangeInvalidation.test.js`. → `.claude/rules/auth/passwords.md`
* **Una ruta nueva con un secreto en el path exige añadir su prefijo a `api/utils/redactUrl.js`**, o `pino-http` lo escribe en los logs. → `.claude/rules/auth/passwords.md`
* **«Qué zona de envío aplica» tiene una sola respuesta: `api/services/shipping/zoneResolver.js`.** Nunca una consulta paralela. El destino es la dirección del pedido, nunca `item.shipping.deliveryPostalCode`. → `.claude/rules/shipping/zone-resolution.md`
* **El dinero se compara en céntimos enteros**, nunca con `Math.abs(a - b) > 0.01`.
* **Los rechazos llevan un código máquina en `title`** (`SHIPPING_COST_OUTDATED`, `RESET_TOKEN_EXPIRED`…) y sus textos es-ES viven en `client/lib/constants.js`.
* **Un predicado de dominio vive en un módulo con nombre, nunca copiado en línea.** Tres copias de una misma comparación es lo que dejó el `productCategory === 'others'` de `ProductForm` como código muerto, y lo que `zoneResolver` existe para evitar.
* **Toda consulta nueva sobre `event_attendees` decide a conciencia qué hace con `is_staff`.** → `.claude/rules/events/admin-access.md`
* **`access_token_hash` solo aparece en SQL dentro de `api/services/eventService.js`**, y un test lo vigila. → `.claude/rules/events/verification-gates.md`
* **Ninguna respuesta pública revela `video_url`, `video_url_av1` ni `recording_enabled`** (los quita `toPublicEvent`). → `.claude/rules/events/video-cdn.md`, `.claude/rules/agora/recording.md`
* **Nada dentro de la sala en directo ni de la consola del host se pinta con un portal a `document.body`** (el `ConfirmDialog` compartido lo hace). → `.claude/rules/agora/host-mobile-console.md`, `.claude/rules/live-room/compact-layout.md`
* **Un track de Agora sin `encoderConfig` sale con los valores por defecto del SDK: cámara 4:3 y micrófono con calidad de llamada.** El perfil se elige por rol en `AgoraLiveRoom`. → `.claude/rules/agora/camera-aspect-ratio.md`, `.claude/rules/agora/host-audio.md`
* **Hidratación:** ningún proveedor de `client/app/layout.js` lee `localStorage` en un inicializador de `useState`, y ninguna página estática decide una fecha o un valor aleatorio durante el render. → `.claude/rules/infra/production-load.md`
* **`@stripe/stripe-js/pure`, nunca el import por defecto**: el de por defecto inyecta 1 MB de Stripe en todas las páginas. → `.claude/rules/frontend/lcp-listados.md`
* **Un recurso publicado con caché inmutable nunca se sobrescribe: se publica con otro nombre** (medios de S3, vídeos de la portada, `og-image-vN.jpg`). → `.claude/rules/infra/production-load.md`, `.claude/rules/frontend/og-image.md`
* **El régimen de IVA se congela por artículo en `art_order_items.vat_regime`**; facturas, monedero y exportación fiscal leen ese dato, no la tabla del producto. → `.claude/rules/fiscal/vat-regime.md`
* **Desplegar el cliente exige purgar la caché de páginas de nginx cuando los contenedores ya responden**; `./deploy/deploy.sh` lo hace. → `.claude/rules/infra/production-load.md`
* **`api/.env.test` define `DB_BACKUP_ENABLED=true` a propósito**, para que la comprobación de aislamiento signifique algo. → `.claude/rules/infra/db-backups.md`
* **API y cliente se despliegan juntos**: varias rutas cambiaron de contrato a la vez en los dos lados (verificación de email, dirección de entrega, selección de envío).
* **`client/` no tiene runner de tests, y el contenedor `api` solo monta `api/`**: ningún test de Jest puede leer código del cliente. Lo del cliente se verifica a mano.

## Conocimiento por dominio

El porqué detallado de cada área vive en `.claude/rules/`, una regla por tema, y cada regla se carga sola cuando lees un fichero que encaja con sus `paths:`. **Si vas a planificar o modificar algo de un área antes de haber abierto ninguno de sus ficheros, lee primero su regla.** Después de compactar la conversación, una regla vuelve a cargarse en cuanto lees de nuevo un fichero que encaja.

### Catálogo

* [`catalog/limited-editions.md`](.claude/rules/catalog/limited-editions.md) — Ediciones limitadas: `is_sold` solo junto a `editions_sold`, un único punto de consumo por canal de venta y una sola vía de liberación.

### Envíos

* [`shipping/zone-resolution.md`](.claude/rules/shipping/zone-resolution.md) — Qué zona de envío aplica: un solo resolvedor para el precio mostrado y el verificado; el destino es la dirección del pedido.
* [`shipping/art-calculator.md`](.claude/rules/shipping/art-calculator.md) — Calculadora de envíos de obra (admin): medidas del paquete obligatorias, cuatro grupos de zonas, IVA del transporte y guardado por grupo.
* [`shipping/sendcloud-auth-insurance.md`](.claude/rules/shipping/sendcloud-auth-insurance.md) — Autenticación con Sendcloud (OAuth2 con respaldo Basic), secretos fuera de los logs y seguro obligatorio, con una forma distinta en cada endpoint.
* [`shipping/store-shipping.md`](.claude/rules/shipping/store-shipping.md) — Envío de la tienda: la selección viaja aparte del carrito, se recotiza en el servidor, se cobra una vez por vendedor y suma todos los bultos.
* [`shipping/store-pickup.md`](.claude/rules/shipping/store-pickup.md) — Recogida en persona de productos de la tienda: solo la concede `allow_store_pickup`, nunca la dirección; el arte queda fuera.

### Fiscalidad

* [`fiscal/vat-regime.md`](.claude/rules/fiscal/vat-regime.md) — IVA por vendedor y régimen fiscal derivado de él (REBU o general), congelado por artículo en cada venta.

### Cuentas y vendedores

* [`auth/passwords.md`](.claude/rules/auth/passwords.md) — Contraseñas: activación y restablecimiento nunca se fusionan, corte de sesiones con `password_changed_at` y URLs con secretos redactadas en los logs.
* [`auth/seller-kinds.md`](.claude/rules/auth/seller-kinds.md) — Artista y Ponente (`users.seller_kind`): capacidades en un módulo por lado, cambio de tipo con bloqueos y corte de sesión, monedero común.

### Eventos: acceso, vídeo y staff

* [`events/verification-gates.md`](.claude/rules/events/verification-gates.md) — Verificación de email en eventos, sorteos y subastas: la credencial nace al verificar, plaza = verificado y pagos vinculados al comprador.
* [`events/admin-access.md`](.claude/rules/events/admin-access.md) — Acceso del admin a los directos: una fila real con `is_staff = 1`, excluida de cinco consultas de dinero y aforo.
* [`events/video-cdn.md`](.claude/rules/events/video-cdn.md) — Vídeo pregrabado por CloudFront: URLs firmadas que nunca salen en la API pública, AV1 solo con decodificación por hardware y codificación.
* [`events/video-pass-access.md`](.claude/rules/events/video-pass-access.md) — Sala del pase de vídeo: solo tras entrar en la sala autenticada, chat autenticado, un único horario de cierre y duración medida por la API.

### Salas en directo

* [`live-room/compact-layout.md`](.claude/rules/live-room/compact-layout.md) — Vista compacta de las salas (menos de 1024 px de ancho o 500 de alto): un solo árbol, altura desde `visualViewport`, hojas sin portal y salir del evento.
* [`live-room/participant-row.md`](.claude/rules/live-room/participant-row.md) — Fila de participantes de `broadcast`: una sola fila con «+N más», cola de turno sellada por el servidor y lista completa.

### Agora

* [`agora/camera-aspect-ratio.md`](.claude/rules/agora/camera-aspect-ratio.md) — Cámara de Agora: el SDK publica 4:3 por defecto; perfiles 16:9 por rol, selector de calidad del host y coste por resolución.
* [`agora/host-audio.md`](.claude/rules/agora/host-audio.md) — Audio del host: sin `encoderConfig` el SDK no fija nada y Android lo trata como una llamada; perfil de alta fidelidad y casilla de cancelación de eco.
* [`agora/screen-share-audio.md`](.claude/rules/agora/screen-share-audio.md) — Compartir pantalla con audio: `'disable'` ocultaba la casilla de Chrome; pista de audio, `restrictOwnAudio` y qué admite cada plataforma.
* [`agora/virtual-backgrounds.md`](.claude/rules/agora/virtual-backgrounds.md) — Fondos virtuales (solo cliente): carga diferida del procesador, orden `setOptions` → `enable` y cómo añadir un fondo.
* [`agora/interviews-cohost.md`](.claude/rules/agora/interviews-cohost.md) — Entrevistas en `broadcast`: co-presentador admin, pantalla de escena en el uid 2 con exclusividad, composición de la escena y facturación por píxeles.
* [`agora/host-mobile-console.md`](.claude/rules/agora/host-mobile-console.md) — Consola móvil del host: tres modos sobre un solo `useHostMediaControls`, el árbol normal se oculta sin desmontarse y nada va por portal.
* [`agora/recording.md`](.claude/rules/agora/recording.md) — Grabación en la nube de Agora: el modo lo decide `interaction_mode`, el reconciliador es la autoridad, fusibles, retención en el bucket y nada visible al público.

### Frontend y rendimiento

* [`frontend/image-loading.md`](.claude/rules/frontend/image-loading.md) — Indicador de carga de imágenes: `onLoad` no basta, arranque por `IntersectionObserver`, 200 ms de retardo y giro sobre el `<circle>`.
* [`frontend/lcp-listados.md`](.claude/rules/frontend/lcp-listados.md) — LCP de `/galeria` y `/tienda`: rejilla servida por ISR, semilla sorteada en el servidor, Stripe `pure`, Inter autoalojada y `BrandLogo`.
* [`frontend/critical-path.md`](.claude/rules/frontend/critical-path.md) — Ruta crítica: CSS en línea, interfaz bajo demanda (`useOnDemandComponent`), Replay tras `load`, analítica sin precarga y lecturas sin preflight.
* [`frontend/og-image.md`](.claude/rules/frontend/og-image.md) — Imagen social por defecto: el logotipo en la zona segura del recorte central; cambiarla es publicarla con otro nombre.

### Infraestructura y operación

* [`infra/production-load.md`](.claude/rules/infra/production-load.md) — Carga en producción: ISR de las fichas, nginx y su caché, límites de CPU, despliegue, SSR sin pantalla en blanco, banner de cookies, S3 y `/health`.
* [`infra/db-backups.md`](.claude/rules/infra/db-backups.md) — Backups diarios de Turso a S3: volcado propio sin CLI, `sqlite_sequence` obligatorio, el proceso nunca borra y alerta por tres canales.
* [`infra/sentry.md`](.claude/rules/infra/sentry.md) — Sentry por entorno: nunca importado bajo test, silenciado en desarrollo y el ruido de terceros descartado con condiciones estrictas.
* [`infra/plausible.md`](.claude/rules/infra/plausible.md) — Plausible autoalojado: dos `<Script>` solo en producción, la CSP en dos directivas, el proxy del EC2 para la IP real y la memoria de ClickHouse.
* [`infra/environment-variables.md`](.claude/rules/infra/environment-variables.md) — Catálogo de variables de entorno por grupo: cuáles son opcionales y cuáles impiden arrancar si faltan o están a medias.

### Certificados de autenticidad

* [`coa/ntag424.md`](.claude/rules/coa/ntag424.md) — Certificados de autenticidad NTAG 424 DNA: verificación pública, endpoints de admin, ediciones limitadas y scripts de personalización.

## Mantenimiento de estas instrucciones

* **Este fichero se carga en todas las sesiones y tiene un presupuesto de 40.000 caracteres**, el límite más bajo que aplica Claude Code con cualquier modelo: avisa a 150.000 con 1M de contexto y a 40.000 con 200k. Aquí solo va lo que necesita toda sesión.
* **El conocimiento nuevo de un área va a su regla**, en `.claude/rules/<dominio>/<tema>.md`, con `paths:` que apunten a los ficheros que describe y con una línea en el índice de arriba. Si además introduce un invariante que se rompe en silencio desde cualquier parte, añade una línea en «Invariantes transversales».
* **Nunca una regla sin `paths:`**: se cargaría en todas las sesiones y sumaría al límite combinado. **Nunca un import `@ruta` en este fichero**: los imports se cargan siempre y no ahorran nada.
* **El frontmatter de una regla tiene exactamente esta forma.** El comprobador no acepta otra, y Claude Code carga en todas las sesiones una regla cuyo YAML no puede leer.

  ```
  ---
  paths:
    - "api/services/shipping/**"
    - "client/components/{ProductForm,ShoppingCartDrawer}.js"
  ---
  ```

  Las rutas de Next con segmentos dinámicos (`[id]`, `[slug]`) se cubren con `**` desde la carpeta padre, porque un `[` en un patrón abre una clase de caracteres.
* **Tras crear, mover o renombrar ficheros, o al tocar una regla, ejecuta `node scripts/check-claude-rules.mjs`** (Node ≥ 22.5, sin dependencias). Comprueba que cada patrón encuentra ficheros, que índice y reglas coinciden, que las rutas citadas existen y que este fichero cabe en su presupuesto. **Un patrón que deja de encontrar ficheros no da ningún error en Claude Code: la regla simplemente deja de cargarse.**
* `.claude/` está en `.gitignore` salvo `.claude/rules/`, que se versiona igual que este fichero.
