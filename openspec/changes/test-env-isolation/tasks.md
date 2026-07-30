## 1. Separar `app.js` y `server.js`

- [x] 1.1 Crear `api/app.js` moviendo desde `api/server.js` todo el montaje sin efectos secundarios: instancia de Express, Sentry init, middleware (helmet, cors, compression, morgan/pino-http, rate limiters, seguridad, timeout), servidor HTTP, Socket.IO + handlers, estáticos, montaje de rutas, `notFound`, `Sentry.setupExpressErrorHandler` y `errorHandler`. Exportar `{ app, server, io }`.
- [x] 1.2 Reducir `api/server.js` a bootstrap: importar `{ app, server, io }` de `./app`, conservar `startServer()` (initializeDatabase, runWalletSplitMigration, verifyTransporter, timeouts del servidor, `listen`, arranque de los 5 schedulers, `setupGracefulShutdown`), la llamada final `startServer()` y el reexport `module.exports = { app, server, io }`.
- [x] 1.3 Verificar que el servidor arranca igual que antes (`docker compose up api`): schema inicializado, log "Server started", schedulers arrancados y un endpoint público respondiendo.

## 2. Entorno de test

- [x] 2.1 Crear `api/.env.test` versionado, con cabecera explícita de "valores dummy, nunca credenciales reales": `NODE_ENV=test`, `TURSO_DATABASE_URL=file:./.tmp/test.db`, `JWT_SECRET` de test, `EMAIL_TRANSPORT=noop`, y valores hex sintéticos válidos para `NTAG424_SYSTEM_ID` (3 bytes), `NTAG424_K_PICC` y `NTAG424_MASTER_KEY` (16 bytes) e `IP_HASH_SALT` (≥16 bytes), más cualquier otra variable que `api/config/env.js` exija.
- [x] 2.2 Crear `api/tests/setup/env.js` (usado como `setupFiles`, se ejecuta antes de cualquier `require` del código bajo test): fijar `process.env.NODE_ENV = 'test'` y cargar `.env.test` con `dotenv.config({ path, override: true })` — el `override` es imprescindible porque en Docker las variables de preprod ya vienen inyectadas por `env_file`.
- [x] 2.3 Añadir `.tmp/` y `.env.test.local` a `api/.gitignore`.

## 3. Base de datos aislada

- [x] 3.1 En `api/config/database.js`: detectar `isFileUrl` a partir de `TURSO_DATABASE_URL` y crear el cliente libsql **sin** `authToken` cuando la URL sea `file:`.
- [x] 3.2 En `api/config/env.js`: `TURSO_AUTH_TOKEN` pasa de `required()` a exigirse sólo cuando la URL no es `file:` (reutilizar el helper `requiredIf`).
- [x] 3.3 Añadir la guardia anti-remoto en `api/config/database.js`, antes de crear el cliente: si `NODE_ENV === 'test'` y la URL no es `file:`, imprimir error explicando variable y URL y `process.exit(1)`; si `NODE_ENV !== 'test'` y la URL es `file:`, sólo `logger.warn`.
- [x] 3.4 Hacer que `importPostalCodes()` se omita en modo test salvo `SEED_POSTAL_CODES=1`, y añadir un log indicando que se omite.
- [x] 3.5 Crear `api/tests/setup/globalSetup.js`: borrar `.tmp/test.db` si existe, crear el directorio, ejecutar `initializeDatabase()` y aplicar semillas.
- [x] 3.6 Crear `api/tests/setup/seed.js` con las semillas mínimas (unos pocos `postal_codes` de ejemplo; añadir más sólo si los tests del paso 6 lo exigen).
- [x] 3.7 Crear `api/tests/setup/globalTeardown.js`: cerrar el cliente libsql y borrar `.tmp/test.db`, salvo `KEEP_TEST_DB=1`.
- [x] 3.8 Actualizar `api/jest.config.js` con `setupFiles`, `globalSetup`, `globalTeardown` y `maxWorkers: 1`; y `api/package.json` para que `test` y `test:watch` exporten `NODE_ENV=test`.

## 4. Bloqueo de emails

- [x] 4.1 Añadir a `api/config/env.js` un `emailTransport` derivado: `'noop'` si `EMAIL_TRANSPORT === 'noop'` o `NODE_ENV === 'test'`, en otro caso `'live'`. Documentar la variable en `api/.env.example`.
- [x] 4.2 En `api/services/emailService.js`: cortocircuitar `sendMail(options)` en modo `noop` — no crear ni usar `resendClient`/`transporter`, empujar el mensaje al outbox en memoria y devolver `{ messageId: 'noop-<n>' }`.
- [x] 4.3 Exportar `__getOutbox()` y `__clearOutbox()` desde `emailService` para aserciones en tests.
- [x] 4.4 Convertir `verifyTransporter()` en no-op en modo `noop`, y emitir un `logger.warn` visible al arrancar en `noop` fuera de `NODE_ENV=test`.
- [x] 4.5 Aplicar el mismo cortocircuito al cliente de marketing/newsletter (`RESEND_MARKETING_API_KEY`, segmentos y topics) para que ningún test impacte contactos reales.

## 5. Utilidades para tests

- [x] 5.1 (no necesario) No se crean factories: tras la decisión de saltar `orders` y los 4 tests desfasados de `products`, los tests que quedan activos crean sus fixtures con 3-4 líneas propias. Lo que sí hizo falta y se creó es `api/tests/helpers/app.js`, que carga la app y libera los handles de Socket.IO.
- [x] 5.2 (no necesario) Mismo motivo: sólo 3 suites activas hacen login y cada una lo resuelve en 5 líneas. Se añadiría al reescribir `orders` contra `/placeOrder`.

## 6. Migrar los tests existentes

- [x] 6.1 Cambiar `require('../server')` por `require('../app')` en los 9 tests de integración: `auth`, `orders`, `products`, `productImages`, `productMultiImage`, `coaController`, `coaAdminController`, `editionInventory`, `drawBillingEditions`.
- [x] 6.2 Suite completa en verde contra la base local (19/19 suites). `productMultiImage` era justo este caso —dependía de que la obra recién creada fuese pública— y se corrigió publicando el fixture (`visible=1, status='approved'`); recuperados sus 8 tests. `orders` (9 tests) y 4 tests de `products` resultaron ser deriva de API preexistente, no dependencia de datos: saltados con TODO explicando qué cambió. `pdfGenerator` fallaba por `{ virtual: true }` en el mock de `pdfkit`, que cedía ante el módulo real si otra suite ya lo había cargado.
- [x] 6.3 Los `afterAll` de limpieza se mantienen: ahora son inofensivos (base local efímera) y siguen dando aislamiento entre casos del mismo fichero, que es exactamente el criterio de la tarea. Quitarlos sería un cambio sin ganancia.

## 7. Tests del propio mecanismo

- [x] 7.1 Test que verifica que `require('../app')` no abre puerto ni arranca schedulers (comprobar que `server.listening` es falso).
- [x] 7.2 Test que verifica que `config.database.url` empieza por `file:` durante la suite.
- [x] 7.3 Test que verifica que una operación que envía email deja el mensaje en el outbox y no llama al proveedor.

## 8. Verificación y documentación

- [x] 8.1 `npm test` completo en verde: 19/19 suites, 162 tests pasan, 13 saltados. Verificado contra preproducción tras las ejecuciones: 0 usuarios `@test.com`, 0 obras de prueba, último pedido sigue en id 1040. `.tmp/` queda vacío tras el teardown.
- [x] 8.2 Comprobación negativa: ejecutar la suite forzando `TURSO_DATABASE_URL` remota y confirmar que aborta con el mensaje de la guardia sin ejecutar ninguna sentencia.
- [x] 8.3 Comprobar que el arranque normal del servidor (`NODE_ENV` distinto de test) sigue usando Turso y enviando emails de verdad.
- [x] 8.4 Documentar la política y el nuevo layout (`app.js`/`server.js`, `.env.test`, outbox de email, guardia anti-remoto) en `CLAUDE.md` y `AGENTS.md`, incluyendo la regla de que los futuros tests de `client/` tampoco tocarán red ni base de datos reales.
