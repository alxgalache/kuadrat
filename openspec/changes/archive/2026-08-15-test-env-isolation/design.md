## Context

La suite de Jest del backend (`api/tests/`, 19 ficheros) corre hoy con la configuración de desarrollo tal cual: `api/config/database.js` crea el cliente libsql con `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` en tiempo de carga del módulo, y `api/services/emailService.js` crea su transporte real (Resend o SMTP) igual. No hay `NODE_ENV=test`, ni `globalSetup`, ni ficheros de setup: `api/jest.config.js` sólo declara `testEnvironment`, `testTimeout` y cobertura.

Estado actual relevante:

- **9 de 19 tests son de integración** y hacen `require('../server')`. `api/server.js` termina con una llamada incondicional a `startServer()`, así que el simple `require` ejecuta `initializeDatabase()`, `runWalletSplitMigration()`, `verifyTransporter()`, `server.listen()` y arranca cinco `node-cron`: subastas (cada 30 s), limpieza de reservas, confirmación Sendcloud, reintento de envíos y créditos de eventos. Todos escriben en la base configurada.
- **Sólo 2 tests limpian tras de sí** (`productImages.test.js`, `productMultiImage.test.js`), y de forma parcial. `auth.test.js`, `orders.test.js` y `products.test.js` crean usuarios, obras y pedidos con sufijo `Date.now()` y los dejan.
- **El correo tiene un único chokepoint**: `sendMail(options)` en `emailService.js` decide entre `resendClient.emails.send()` y `transporter.sendMail()`, y devuelve `{ messageId }`. Los ~40 emisores de la aplicación pasan todos por ahí.
- **`api/config/env.js` valida en carga** y hace `process.exit(1)` si falta algo: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `NTAG424_SYSTEM_ID`/`K_PICC`/`MASTER_KEY` (hex de longitud exacta) e `IP_HASH_SALT`.
- **El contenedor de desarrollo** (`docker-compose.yml`) monta `./api:/app` e inyecta `./api/.env` vía `env_file`, es decir, las variables ya están en `process.env` antes de que Node arranque.
- `client/` no tiene runner de tests ni ningún fichero de test.

## Goals / Non-Goals

**Goals:**
- Ninguna escritura en la base de datos Turso remota durante `npm test`, en ningún escenario — incluidos fallos a mitad de test, `--bail` y `Ctrl-C`.
- Ningún envío de email real durante los tests, sea cual sea el proveedor activo (Resend o SMTP) y sea cual sea la ruta de código que lo dispare.
- Ningún proceso de fondo de producción (schedulers, `listen`, Socket.IO) activo durante los tests.
- Fallo ruidoso e inmediato si alguna de las tres garantías anteriores no se puede cumplir, en vez de degradación silenciosa.
- Cambio inerte fuera de `NODE_ENV=test`: desarrollo, preproducción y producción se comportan exactamente igual que hoy.

**Non-Goals:**
- Montar infraestructura de tests en `client/`.
- Reescribir la lógica de aserciones de los tests actuales; sólo se adapta lo imprescindible (import de la app, y semillas que antes dependían de datos preexistentes en preproducción).
- Añadir cobertura de tests nueva más allá de la que verifica este propio mecanismo.
- Cambiar el esquema de base de datos o el modelo de despliegue.

## Decisions

### D1 — Base de datos: fichero SQLite local a través del mismo cliente libsql

`@libsql/client` acepta URLs `file:` de forma nativa y expone la misma API (`execute`, `batch`, `transaction`), así que basta con cambiar la URL: ni una línea de los controladores ni de `utils/transaction.js` cambia. `api/config/database.js` sigue siendo el origen único del esquema y se ejecuta contra el fichero local en `globalSetup`.

`api/.env.test` fija `TURSO_DATABASE_URL=file:./.tmp/test.db`. Al ser un fichero dentro del bind mount `./api:/app`, funciona igual dentro y fuera de Docker; se añade `.tmp/` a `api/.gitignore`.

Detalle de implementación: `createClient` recibe `authToken` sólo cuando la URL **no** empieza por `file:`, y en `env.js` `TURSO_AUTH_TOKEN` pasa de `required()` a `requiredIf(!isFileUrl, ...)` — el helper ya existe y se usa para las credenciales de proveedor de email.

*Alternativas descartadas:*
- **Base Turso dedicada a tests** — mantiene la fidelidad con producción pero sigue acumulando basura (en otra base), exige red y cuota, y no elimina la posibilidad de apuntar a la base equivocada.
- **`:memory:`** — el aislamiento es perfecto pero cada worker de Jest reconstruiría el esquema completo, y perdemos la posibilidad de inspeccionar el fichero cuando un test falla. Un fichero recreado en cada ejecución da lo mismo con mejor diagnóstico.
- **Registro de entidades + borrado en `afterAll`** — el enfoque menos invasivo, pero un test que falla antes de su `afterAll`, un `Ctrl-C` o un scheduler dejan residuos igualmente. No cumple el goal.

### D2 — Guardia anti-remoto que aborta el proceso

`database.js`, en tiempo de carga: si `NODE_ENV === 'test'` y la URL no empieza por `file:`, escribe un error explicando el fallo y hace `process.exit(1)` sin haber creado el cliente. Simétricamente, si `NODE_ENV !== 'test'` y la URL es `file:`, avisa por log (útil en local, no es un error).

Esta guardia es lo que convierte el resto del diseño en una garantía y no en una convención: cubre el caso realista de que el override de variables de entorno falle (ver D5), el de un `.env.test` mal editado y el de un futuro `docker-compose` que inyecte la URL de preprod en el contenedor de tests.

### D3 — Correo: cortocircuito en `sendMail()` con outbox en memoria

`config.emailTransport` (nuevo, derivado: `'noop'` si `EMAIL_TRANSPORT=noop` o `NODE_ENV === 'test'`; en otro caso `'live'`). En modo `noop`, `sendMail()` retorna antes de tocar Resend o SMTP: empuja `{ to, from, subject, html, attachments, replyTo, sentAt }` a un array en memoria y devuelve `{ messageId: 'noop-<n>' }`. Se exportan `__getOutbox()` y `__clearOutbox()` para que los tests puedan asertar qué se habría enviado — un efecto colateral útil: hoy no hay forma de testear los emails.

Se elige el chokepoint sobre `jest.mock` porque:
- Cubre las dos ramas de proveedor con una sola condición y no hay que mantener un mock en paralelo cuando se añadan funciones a `emailService`.
- Cubre rutas indirectas (un servicio que llame a `sendMail` sin pasar por las funciones exportadas).
- Sirve además fuera de tests: `EMAIL_TRANSPORT=noop` permite levantar el entorno local sin riesgo de escribir a destinatarios reales.

En el mismo modo, `verifyTransporter()` es un no-op (hoy abre una conexión SMTP real).

*Alternativa descartada:* `jest.mock('../services/emailService')` global — no toca código de producción, pero se desincroniza en cuanto se añade un emisor y no cubre llamadas indirectas.

Riesgo colateral a cubrir: el proveedor de marketing (`RESEND_MARKETING_API_KEY`, segmentos y topics de newsletter) usa un cliente Resend distinto. Se aplica el mismo cortocircuito a su punto de envío para que un test de newsletter no impacte contactos reales.

### D4 — Separación `app.js` / `server.js`

`api/app.js` exporta `{ app, server, io }` con todo el montaje de Express, middleware, rutas y Socket.IO — sin efectos secundarios. `api/server.js` importa de ahí y conserva `startServer()` + la llamada final, más los schedulers y `setupGracefulShutdown`. `server.js` sigue reexportando `{ app, server, io }` para no romper nada externo.

Los 9 tests de integración pasan a `require('../app')`. Es la forma estándar de testear Express con supertest (supertest levanta su propio listener efímero) y elimina de raíz los schedulers, el `listen` y el `verifyTransporter` durante Jest.

*Alternativa descartada:* envolver `startServer()` en `if (config.nodeEnv !== 'test')`. Es un cambio de una línea, pero deja el arranque del servidor como efecto secundario de un `require` — el patrón que ha causado este problema — y no evita que un uso futuro lo reintroduzca.

### D5 — Carga de entorno de test: asignación explícita, no `dotenv` por defecto

Punto sutil y decisivo: `dotenv.config()` **no sobrescribe** variables ya presentes en `process.env`. En el contenedor de desarrollo las variables llegan por `env_file`, así que un `dotenv.config({ path: '.env.test' })` normal no cambiaría `TURSO_DATABASE_URL`. El fichero de setup (`setupFiles`, que Jest ejecuta antes de cualquier `require` del módulo bajo test) carga `.env.test` con `override: true` y fija `NODE_ENV='test'` de forma explícita.

`api/.env.test` se versiona en git — sólo contiene valores dummy sintácticamente válidos (claves NTAG de 32/48 hex de relleno, `JWT_SECRET` de test, URL `file:`) para satisfacer los validadores de `env.js`. No hay ningún secreto real. El script pasa a `NODE_ENV=test jest ...`.

### D6 — Ciclo de vida del esquema y semillas

- `globalSetup` (`api/tests/setup/globalSetup.js`): borra `.tmp/test.db` si existe, ejecuta `initializeDatabase()` y aplica las semillas mínimas.
- `globalTeardown`: cierra el cliente y borra el fichero, salvo `KEEP_TEST_DB=1` para poder inspeccionarlo tras un fallo.
- `importPostalCodes()` se omite en modo test (`ES.csv` son ~1,4 MB y decenas de miles de filas; ningún test de integración de los actuales depende de códigos postales — sólo `invoiceNumbering` y `pdfGenerator` los mencionan, y son tests puros). En su lugar se insertan un puñado de códigos postales de ejemplo como semilla, y se deja `SEED_POSTAL_CODES=1` para forzar el import completo cuando algún test lo necesite.
- Jest se ejecuta con `maxWorkers: 1` para el proyecto de integración: un único fichero SQLite compartido entre workers en paralelo produciría bloqueos de escritura. Los tests puros no lo necesitan pero el coste total es bajo (hoy la suite ya es serie de facto por depender de una base remota compartida).

## Risks / Trade-offs

- **Divergencia SQLite local vs Turso remoto** → El motor es el mismo (libsql/SQLite) y `database.js` es el único origen del esquema, así que la superficie de divergencia se limita a latencia y a la semántica de concurrencia. Se mitiga manteniendo `initializeDatabase()` como única vía de creación: si un test pasa en local y falla en remoto, el esquema es el sospechoso y está en un solo fichero.
- **Los tests actuales pueden depender de datos preexistentes de preproducción** → Contra una base vacía saldrá a la luz cualquier dependencia implícita. Es una mejora, pero puede obligar a añadir semillas durante la implementación; el trabajo se acota a los 9 tests de integración y las semillas van a `tests/setup/seed.js`, no dentro de los tests.
- **`api/.env.test` versionado se confunde con un fichero de secretos** → Cabecera explícita en el propio fichero indicando que todos los valores son dummy y que no debe recibir credenciales reales, y `.env.test.local` sigue en `.gitignore` para overrides personales.
- **El cortocircuito de email podría dejarse activo por error en producción** → `EMAIL_TRANSPORT` sólo pasa a `noop` de forma automática con `NODE_ENV=test`; en cualquier otro entorno hay que ponerlo explícitamente, y al hacerlo el arranque emite un `logger.warn` bien visible.
- **`maxWorkers: 1` alarga la suite** → Con 19 ficheros y una base local (sin latencia de red) el tiempo total debería bajar respecto a hoy, no subir.
- **La división `app.js`/`server.js` toca el fichero más crítico del backend** → Es un movimiento de código sin cambios de lógica; se valida arrancando el servidor en local antes de dar el cambio por bueno, y el rollback es un `git revert` de un commit aislado.

## Migration Plan

1. Extraer `app.js` desde `server.js` en un commit propio y verificar arranque en local (`docker compose up api`) — es el paso con más riesgo y el más fácil de revertir por separado.
2. Añadir `.env.test`, los ficheros de `tests/setup/` y la configuración de Jest; los tests siguen pasando contra la base local.
3. Añadir la guardia anti-remoto y el modo `noop` de email.
4. Migrar los 9 tests de integración a `require('../app')` y añadir semillas donde haga falta.
5. Verificación final: `npm test` con la red del contenedor y, como comprobación negativa, ejecutar la suite forzando `TURSO_DATABASE_URL` remota y confirmar que aborta sin escribir.

Rollback: los cambios están confinados a configuración de test más dos ficheros de producción con condicionales inertes fuera de `NODE_ENV=test`; revertir el commit restaura el comportamiento anterior sin migración de datos.

## Open Questions

- Ninguna bloqueante. Pendiente de decidir durante la implementación si el import completo de `ES.csv` acaba haciendo falta para algún test de envíos; el flag `SEED_POSTAL_CODES` deja la puerta abierta sin cerrar el diseño.
