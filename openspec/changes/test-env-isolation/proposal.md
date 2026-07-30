## Why

Ejecutar la suite de tests del backend escribe en la base de datos Turso de preproducción (la misma que se usa en local) y envía emails reales a través del proveedor configurado. El desarrollador tiene que limpiar a mano los usuarios, obras y pedidos de prueba después de cada ejecución, y los destinatarios de preproducción reciben correos que no corresponden a ninguna acción real.

La causa raíz es más amplia de lo que parece: `api/server.js` invoca `startServer()` como efecto secundario del `require`, de modo que los 9 tests de integración que hacen `require('../server')` no sólo crean fixtures — también ejecutan `initializeDatabase()`, verifican el transporte SMTP y **arrancan los cinco schedulers de producción** (subastas, limpieza de reservas, confirmación Sendcloud, reintento de envíos, créditos de eventos), que siguen mutando preproducción durante toda la ejecución de Jest.

## What Changes

- **Base de datos local para tests.** Los tests dejan de apuntar a Turso remoto y usan una base SQLite local a través del mismo cliente `@libsql/client` (URL `file:`). El esquema se crea desde `api/config/database.js` (que sigue siendo el origen único) en un `globalSetup` de Jest, y la base se descarta al terminar.
- **Guardia dura anti-remoto.** Si la suite arranca con `NODE_ENV=test` y una URL de base de datos remota (`libsql://`, `wss://`, `https://`), el proceso aborta con un mensaje explícito en lugar de escribir. Impide reproducir el problema por descuido o por un `.env` mal cargado.
- **Emails bloqueados en tests.** `sendMail()` — el único punto de envío de `api/services/emailService.js`, común a Resend y SMTP — cortocircuita en modo test: no contacta con ningún proveedor, registra el mensaje en un *outbox* en memoria consultable desde los tests y devuelve un `messageId` sintético, de forma que los `try/catch` y las lecturas de `info.messageId` de los ~40 puntos de llamada siguen funcionando sin cambios.
- **Separación `app.js` / `server.js`.** La construcción de Express + Socket.IO se extrae a `api/app.js`; `server.js` queda como bootstrap (esquema, migración de wallet, verificación de email, schedulers, `listen`). Importar la app en un test deja de arrancar servidor y schedulers. **BREAKING** para los tests existentes: los 9 que hacen `require('../server')` pasan a `require('../app')`.
- **Configuración de entorno de test.** Nuevo `api/.env.test` (versionado, sin secretos reales) con valores dummy para todo lo que `api/config/env.js` exige, cargado por Jest antes que `.env`/`.env.local`. `TURSO_AUTH_TOKEN` pasa a ser obligatorio sólo cuando la URL es remota.
- **Documentación.** `CLAUDE.md` y `AGENTS.md` recogen la política: los tests nunca tocan la base de datos ni el correo de preproducción, y así lo hará también el frontend cuando incorpore runner de tests.

Fuera de alcance: montar infraestructura de tests en `client/` (hoy no existe ningún test ni runner allí) y reescribir la lógica de los tests actuales más allá de lo necesario para que corran aislados.

## Capabilities

### New Capabilities
- `test-environment-isolation`: garantiza que cualquier ejecución de tests del backend queda contenida —sin escrituras en la base de datos remota, sin envío de correo real y sin procesos en segundo plano de producción— y define el arranque de aplicación separado del bootstrap del servidor.

### Modified Capabilities
<!-- Ninguna: los specs existentes describen comportamiento de producto, que no cambia. -->

## Impact

**Código afectado**
- `api/server.js` → dividido en `api/app.js` (Express + Socket.IO + rutas + middleware) y `api/server.js` (bootstrap + `listen`).
- `api/config/database.js` — cliente libsql tolerante a URLs `file:` (sin `authToken`), guardia anti-remoto en test, `importPostalCodes()` omitible en test.
- `api/config/env.js` — `TURSO_AUTH_TOKEN` condicional a URL remota; nuevo flag de transporte de email.
- `api/services/emailService.js` — cortocircuito y outbox en `sendMail()`.
- `api/jest.config.js` — `globalSetup`, `globalTeardown`, `setupFiles`; `api/package.json` — script `test` con `NODE_ENV=test`.
- `api/tests/*.js` — los 9 tests de integración cambian `require('../server')` por `require('../app')`.
- Nuevos: `api/.env.test`, `api/tests/setup/` (env, globalSetup, globalTeardown), `api/tests/helpers/`.

**Sin impacto**
- Comportamiento en desarrollo, preproducción y producción: fuera de `NODE_ENV=test` todas las rutas nuevas son inertes (misma URL de Turso, mismo proveedor de email, mismo arranque de servidor).
- Esquema de base de datos: no se añade ni modifica ninguna tabla.
- `client/`: sin cambios de código.

**Dependencias**
- Ninguna nueva en producción. `@libsql/client` ya soporta URLs `file:` de forma nativa, por lo que no hace falta añadir `better-sqlite3` ni ningún driver alternativo.
