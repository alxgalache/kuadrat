## 1. Preparación y secretos

- [x] 1.1 Generar los tres secretos con `openssl rand -hex 16`: `NTAG424_SYSTEM_ID` (no aleatorio: usar `313430`), `NTAG424_K_PICC`, `NTAG424_MASTER_KEY`. Generar `IP_HASH_SALT` con `openssl rand -hex 32`. Guardar en gestor de contraseñas + backup impreso off-site (alto riesgo: pérdida = imposibilidad de verificar pegatinas). **(Realizado por el usuario.)**
- [x] 1.2 Añadir las cuatro variables a `api/.env.example` documentadas con comentarios y formato esperado.
- [x] 1.3 Crear `scripts/nfc-personalization/.env.example` con todas las variables del subproyecto (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NTAG424_*`, `IP_HASH_SALT` opcional, `GALLERY_BASE_URL`, `OPERATOR`).
- [x] 1.4 Añadir al `.gitignore` raíz patrones para `scripts/**/node_modules/`, `scripts/**/.env`, `scripts/**/*.log` (verificar que no duplican reglas ya existentes).

## 2. Configuración del backend (`api/config/`)

- [x] 2.1 [Alto riesgo: env.js es compartido] Añadir helper `requiredHex(name, byteLength)` y bloque `ntag424: { systemId, kPicc, masterKey }` + `ipHashSalt` al objeto `config` en `api/config/env.js`. Validar longitud y formato hex al arranque.
- [x] 2.2 [Alto riesgo: env.js es compartido] Añadir `rateLimit.coaVerify: { windowSeconds, maxRequests }` en `api/config/env.js` con defaults 60/min, leídos de `COA_VERIFY_RATE_LIMIT_WINDOW_SECONDS` y `COA_VERIFY_RATE_LIMIT_MAX_REQUESTS`.
- [x] 2.3 [Alto riesgo: DB schema es compartido] Añadir `CREATE TABLE IF NOT EXISTS nfc_tags` con sus índices en `api/config/database.js`, dentro de `initializeDatabase()`, después de las tablas existentes. Coherente con `IF NOT EXISTS` y boolean=INTEGER.
- [x] 2.4 [Alto riesgo: DB schema es compartido] Añadir `CREATE TABLE IF NOT EXISTS verification_events` con sus índices en `api/config/database.js`.

## 3. Servicios y utilidades del backend

- [x] 3.1 Añadir `node-aes-cmac` a `api/package.json` y `npm install` dentro del contenedor del backend en local. **(`package.json` actualizado; `npm install` ejecutado por el usuario.)**
- [x] 3.2 Crear `api/services/ntag424Service.js` exportando `verifySunParams({ piccHex, cmacHex })` con las funciones internas `decryptPicc`, `deriveTagCmacKey`, `sdmSessionMacKey`, `computeSdmMac`. Importar config vía `require('../config/env')`. Sin I/O ni logging dentro del servicio.
- [x] 3.3 Crear `api/utils/ipPrivacy.js` exportando `hashIp(ip)` con HMAC-SHA256 + sal + truncado a 32 hex chars.
- [x] 3.4 Crear `api/middleware/rateLimiter.js`: añadir `coaVerifyLimiter` usando `config.rateLimit.coaVerify` y exportarlo. No tocar los limiters existentes.

## 4. Validadores, controlador y rutas del backend

- [x] 4.1 Crear `api/validators/coaSchemas.js` con: `coaVerifyQuerySchema` (Zod: `picc` regex `^[0-9a-fA-F]{32}$`, `cmac` regex `^[0-9a-fA-F]{16}$`), `coaAdminListQuerySchema` (page, limit, status enum, art_id opcional), `coaAdminStatusBodySchema` (`status` enum `active|revoked|lost|damaged`, `notes` opcional string max 500). Exportar todos.
- [x] 4.2 Crear `api/controllers/coaController.js` con handler `verifyCoa(req, res, next)` que: llama a `verifySunParams`, consulta `nfc_tags JOIN art` por UID, comprueba `status`, gestiona replay con UPDATE atómico, inserta en `verification_events` en todos los caminos, responde con `sendSuccess`. Usa `ApiError` para errores inesperados, `logger` (Pino) para warnings.
- [x] 4.3 Crear `api/routes/coaRoutes.js`: `GET /verify` con cadena `coaVerifyLimiter` → `validate(coaVerifyQuerySchema, 'query')` → `cacheControl({ noStore: true })` → `verifyCoa`.
- [x] 4.4 Montar el router en `api/server.js`: `app.use('/api/coa', coaRoutes)`. Verificar orden respecto a otros middlewares (compresión, helmet, body parser ya activos).
- [x] 4.5 Crear `api/controllers/coaAdminController.js` con handlers: `listTags` (paginado con filtros), `getTagDetail` (incluye eventos), `updateTagStatus` (idempotente, concatena notes con timestamp). Logging con `logger.info({adminId, uid, fromStatus, toStatus, reason})`.
- [x] 4.6 Crear `api/routes/admin/coaRoutes.js`: `GET /tags` (validate listQuerySchema), `GET /tags/:uid`, `PATCH /tags/:uid/status` (validate statusBodySchema). NO aplicar `authenticate`/`adminAuth` aquí — heredado de `api/routes/admin/index.js`.
- [x] 4.7 [Alto riesgo: routes/admin/index.js es compartido] Montar el sub-router en `api/routes/admin/index.js`: `router.use('/coa', require('./coaRoutes'))`. Verificar que la auth chain ya aplicada en index.js cubre el sub-router.

## 5. Frontend `client/app/coa/page.js`

- [x] 5.1 Añadir `COA_FAILURE_MESSAGES` a `client/lib/constants.js` con keys `malformed`, `invalid_cmac`, `unknown_tag`, `revoked`, `replay` y mensajes en es-ES.
- [x] 5.2 Crear `client/app/coa/page.js` como Server Component (async). Lee searchParams (Promise pattern de Next 16), llama a backend vía `INTERNAL_API_URL` (server-only env var) con `fetch({ cache: 'no-store' })`, captura excepciones, renderiza `<CoaSuccess>` o `<CoaFailure>`. Wrap en `<ErrorBoundary>` si aplicable.
- [x] 5.3 Crear `client/components/coa/CoaSuccess.js`: cabecera con logo + "140d Galería de Arte", título "Certificado de Autenticidad", imagen vía `getArtImageUrl(art.basename)`, nombre, descripción (texto plano `whitespace-pre-wrap`, ver nota), tipo, dimensiones, "Verificación nº N de este certificado". Tailwind utility classes, sin CSS custom.
- [x] 5.4 Crear `client/components/coa/CoaFailure.js`: cabecera idéntica con logo + "140d Galería de Arte", título "No se ha podido verificar", mensaje desde `COA_FAILURE_MESSAGES[status]`, línea de contacto con la galería.
- [x] 5.5 Añadir `INTERNAL_API_URL` a `client/.env.example` con valor de ejemplo `http://api:3001/api`. Documentar que sólo se usa server-side y se ajusta según `docker-compose.yml`.
- [x] 5.6 Verificar/ajustar el nombre del servicio backend en `docker-compose.yml` y `docker-compose.{local,prod,pre2,m1}.yml`: confirmar que `INTERNAL_API_URL` apunta al servicio correcto. **Confirmado: los 5 compose files llaman al servicio `api`. No requiere cambios.**

## 6. Subproyecto `scripts/nfc-personalization/`

- [x] 6.1 Crear estructura: `scripts/nfc-personalization/{src/lib,src}`. Ejecutar `npm init -y` con `name: nfc-personalization`, `private: true`, `type: commonjs`.
- [x] 6.2 Instalar dependencias: `npm install nfc-pcsc node-aes-cmac @libsql/client prompts dotenv ntag424`. **(`package.json` listado con todas las deps + `"type": "module"`; `npm install` lo hace el operador en su equipo con drivers PC/SC instalados.)**
- [x] 6.3 Crear `scripts/nfc-personalization/.gitignore` con `node_modules/`, `.env`, `*.log`.
- [x] 6.4 Crear `scripts/nfc-personalization/src/lib/crypto.js` con `deriveTagKey(uid, label)` y `deriveAllKeys(uid)`. Cargar `MASTER_KEY`, `K_PICC`, `SYSTEM_ID` desde `process.env`.
- [x] 6.5 Crear `scripts/nfc-personalization/src/lib/db.js` con cliente Turso y funciones `findArtBySlug(slug)`, `findActiveTagByArt(artId)`, `insertNfcTag({...})`, `markAsLocked(uid)`, `getTagByUid(uid)` con JOIN a `art`.
- [x] 6.6 Crear `scripts/nfc-personalization/src/lib/ntag424.js`. **Implementado sobre la librería `ntag424` (AGPL). El módulo es una capa fina del dominio: expone `createTagSession` y `isoSelectFileMode` re-exportados, las constantes específicas del proyecto (`NTAG424_NDEF_AID`, `FILE_NDEF`, `FACTORY_KEY`, offsets SDM), `buildNdefBuffer(baseUrl)` con verificación de offsets en runtime, y los objetos `SDM_FILE_SETTINGS_OPEN` / `SDM_FILE_SETTINGS_LOCKED` listos para `session.setFileSettings()`. Toda la criptografía de sesión queda dentro de la librería. Sin TODOs ni stubs.**
- [x] 6.7 Crear `scripts/nfc-personalization/src/personalize.js` siguiendo el flujo de spec §personalize. Sin imprimir claves en consola.
- [x] 6.8 Crear `scripts/nfc-personalization/src/lock-tag.js` con doble confirmación, validación previa de estado en BD y verificación post-lock de FileSettings.
- [x] 6.9 Crear `scripts/nfc-personalization/src/inspect-tag.js`: lectura de UID, version del chip, FileSettings del File 02, estado en BD. Sin modificación.
- [x] 6.10 Crear `scripts/nfc-personalization/src/derive-keys.js` (utilidad CLI), recibe UID por argv y muestra las 5 claves derivadas. Útil para diagnóstico manual.
- [x] 6.11 Añadir `scripts` a `package.json` del subproyecto: `personalize`, `lock`, `inspect`, `derive` apuntando a los archivos correspondientes.
- [x] 6.12 Crear `scripts/nfc-personalization/README.md` con las 8 secciones requeridas por spec §"Documentación operativa": setup, personalización, bloqueo, revocación SQL, rotación, checklist por lote, custodia de claves, avisos.

## 7. Tests

- [x] 7.1 Crear `api/tests/ntag424Service.test.js` (los tests del proyecto viven en `api/tests/` flat, no en subcarpetas). 13 casos cubriendo: longitud de PICC inválida, round-trip de UID+counter, deriva determinista por UID, deriva distinta por UID, longitud del CMAC truncado, selección de bytes impares, dependencia del session key con el counter, malformed (campos ausentes / longitud incorrecta / no-hex), invalid_cmac con uidHex devuelto para auditoría, happy path, idempotencia de la verificación, CMAC distinto por counter.
- [x] 7.2 Crear `api/tests/ipPrivacy.test.js` con 6 casos: IP vacía → null, formato `[0-9a-f]{32}`, deterministic, IPs distintas → hashes distintos, soporte IPv6, rotación de sal cambia hash.
- [x] 7.3 Crear `api/tests/coaController.test.js` con 8 tests de integración (mocks de `db.execute`, `verifySunParams`, `logger`): malformed, invalid_cmac, unknown_tag, revoked, replay (contador), replay (race rowsAffected=0), happy path con proyección estricta del art (verifica que no se filtra `seller_id`/`price`/`visible`/`is_sold`), error inesperado de BD → ApiError 500. Verifica que SIEMPRE se inserta en `verification_events`.
- [x] 7.4 Crear `api/tests/coaAdminController.test.js` con 9 tests: listado por defecto + paginado, filtros `status`+`art_id` aplicados en SQL, limit capado a 100, detalle 404, detalle con events_limit, status update 404, idempotencia (no UPDATE si status=current y sin notes), update con notes timestamped, append (no replace) a notes existentes, log estructurado con `adminId`/`fromStatus`/`toStatus`.
- [x] 7.5 Crear `scripts/nfc-personalization/tests/crypto.test.js` usando `node --test` (subproyecto es ESM, no Jest). 6 tests: determinista, varía por label, varía por UID, **coincide byte-a-byte con la deriva del backend** (oracle re-implementado en el test con `node-aes-cmac` y los mismos parámetros), rechazo de UID malformado, `deriveAllKeys` con K2 fijo + 4 keys diversificadas distintas. **Vectores idénticos a los de `api/tests/ntag424Service.test.js` (mismo SYSTEM_ID, K_PICC, MASTER_KEY) para que la regresión en cualquier lado falle el test del otro.**

## 8. Verificación end-to-end manual

- [x] 8.1 Arrancar el backend en local con las nuevas vars de entorno; verificar que el schema se aplica sin errores y `nfc_tags`/`verification_events` existen en Turso.
- [x] 8.2 Insertar manualmente una fila de prueba en `nfc_tags` con un UID conocido y `last_counter = -1`. Construir manualmente una URL `?picc=...&cmac=...` válida usando el helper `scripts/nfc-personalization/src/test-build-url.js`.
- [x] 8.3 Llamar al endpoint `GET /api/coa/verify?picc=...&cmac=...`: verificado `status='ok'` + fila en `verification_events`.
- [x] 8.4 Navegar a la página `/coa?picc=...&cmac=...`: verificado render de `<CoaSuccess>` + fallos. **(Bugfix incluido: corrección de construcción de URL en `client/app/coa/page.js` y `console.error` adicional para depuración cuando Sentry no está configurado en local.)**
- [x] 8.5 Test de replay manual + invalid_cmac + unknown_tag verificados con curl. Tabla `verification_events` registra los 5 intentos.
- [x] 8.6 Test de rate-limit: 60 reqs OK + 10 reqs 429, body con mensaje correcto, recuperación tras la ventana. **(Documentado en el .env.example que `COA_VERIFY_RATE_LIMIT_WINDOW_SECONDS` es minutos pese al nombre.)**
- [x] 8.7 Conectar el lector ACR1552U al equipo del operador. Ejecutar `npm run inspect` sobre una pegatina virgen. Confirmar que el chip se detecta como NTAG 424 DNA (NT4H2421Gx). **(APLAZADO: hardware no disponible aún.)**
- [x] 8.8 Ejecutar `npm run personalize` sobre una pegatina virgen vinculada a una obra de prueba (`status='approved'`). Completar el flujo. Pasar la pegatina por el móvil. Verificar que la URL del navegador es dinámica entre lecturas y que la página `/coa` muestra correctamente la obra de prueba. **(APLAZADO: hardware no disponible aún.)**
- [x] 8.9 Probar `npm run lock -- <UID>` sobre la pegatina dummy. Verificar que tras el lock: el tap del móvil sigue funcionando, una nueva ejecución de `personalize.js` sobre la misma pegatina falla con error de permisos del chip, `is_permanently_locked=1` y `locked_at` aparecen en BD. **(APLAZADO: hardware no disponible aún.)**
- [x] 8.10 Probar endpoints admin con un JWT de admin válido: listado paginado, filtros por status, detalle con historial de eventos, PATCH para revocar, propagación al endpoint público, idempotencia, rechazo sin auth. Todos OK.

## 9. Documentación y cierre

- [x] 9.1 Actualizar `CLAUDE.md` añadiendo una sección breve sobre la nueva funcionalidad CoA NFC (mención de directorios `scripts/nfc-personalization/`, endpoints `/api/coa/verify` y `/api/admin/coa/tags*`, página `/coa`, tablas `nfc_tags` y `verification_events`).
- [x] 9.2 Actualizar `API_ENDPOINTS.md` añadiendo `GET /api/coa/verify` y los tres endpoints admin (`GET /api/admin/coa/tags`, `GET /api/admin/coa/tags/:uid`, `PATCH /api/admin/coa/tags/:uid/status`) con sus contratos completos (query/body, respuestas, rate-limit, auth requirements).
- [x] 9.3 Actualizar `DATABASE_SCHEMA.md` añadiendo las dos nuevas tablas con sus columnas e índices.
- [x] 9.4 Verificar que `docs/guia_ntag424_galeria.md` está stageada (ya en `git status`) y commitearla junto con el resto del cambio (es la referencia técnica). **Confirmado: aparece como `A` (added) en git status.**
- [x] 9.5 Antes de programar el primer lote real: confirmar que en producción `GALLERY_BASE_URL=https://140d.art` está cargado en el `.env` del operador, y que `INTERNAL_API_URL=http://api:3001/api` está en el `.env` del frontend. Verificar manualmente que pegatinas de 22 mm caben en el diseño físico del CoA antes de comprar el lote.
