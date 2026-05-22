## ADDED Requirements

### Requirement: Modelo de datos para tags NFC y eventos de verificación
La base de datos SHALL incluir dos tablas nuevas, `nfc_tags` y `verification_events`, definidas idempotentemente en `api/config/database.js` (sin migraciones SQL sueltas, sin `ALTER TABLE`).

`nfc_tags` SHALL contener: `uid` (PRIMARY KEY, hex 14 chars), `art_id` (FK a `art(id)` con `ON DELETE RESTRICT`), `serial_label` (opcional, p. ej. `GAL-2026-0017`), `status` (`active|revoked|lost|damaged`, default `active`), `last_counter` (INTEGER, default `-1`), `is_permanently_locked` (INTEGER 0/1, default `0`), `personalized_at` (DATETIME, default `CURRENT_TIMESTAMP`), `personalized_by` (TEXT, NOT NULL), `locked_at` (DATETIME nullable), `notes` (TEXT nullable). Índices sobre `art_id` y `status`.

`verification_events` SHALL contener: `id` (autoincrement), `uid` (nullable, en casos `malformed` puede no recuperarse), `counter` (nullable), `status` (`ok|invalid_cmac|replay|unknown_tag|revoked|malformed`), `ip_hash` (HMAC-SHA256 con sal, truncado a 32 hex chars), `user_agent` (truncado a 256 chars), `occurred_at` (DATETIME default `CURRENT_TIMESTAMP`). Índices sobre `uid`, `status`, `occurred_at`.

#### Scenario: Creación idempotente del schema
- **WHEN** se arranca el backend con la base de datos vacía
- **THEN** `initializeDatabase()` crea `nfc_tags` y `verification_events` con sus índices
- **AND** un segundo arranque con la misma base de datos no produce errores ni cambios (los `CREATE TABLE IF NOT EXISTS` no hacen nada).

#### Scenario: FK protege contra borrado de obras con tags activos
- **WHEN** existe una fila en `nfc_tags` con `art_id = 42`
- **AND** se intenta `DELETE FROM art WHERE id = 42`
- **THEN** la operación SHALL fallar con error de FK (`ON DELETE RESTRICT`).

### Requirement: Variables de entorno criptográficas validadas al arranque
El backend SHALL exigir y validar al arranque (`api/config/env.js`) cuatro nuevas variables:
- `NTAG424_SYSTEM_ID` — 6 hex chars (3 bytes).
- `NTAG424_K_PICC` — 32 hex chars (16 bytes), clave AES-128 fija que descifra el PICC.
- `NTAG424_MASTER_KEY` — 32 hex chars (16 bytes), clave AES-128 maestra para diversificación.
- `IP_HASH_SALT` — al menos 32 hex chars, sal para el HMAC-SHA256 sobre IPs.

Las variables SHALL ser accesibles vía `config.ntag424.{systemId,kPicc,masterKey}` y `config.ipHashSalt`, nunca leídas con `process.env` directo desde controladores o servicios.

#### Scenario: Arranque rechaza valores inválidos
- **WHEN** se arranca el backend con `NTAG424_K_PICC=abc` (longitud incorrecta)
- **THEN** el proceso SHALL terminar con `process.exit(1)` y un mensaje de error indicando el nombre de la variable y el formato esperado.

#### Scenario: Las claves NUNCA se exponen en logs
- **WHEN** el backend captura un error y lo serializa a logs Pino o Sentry
- **THEN** el output SHALL NO contener los valores de `NTAG424_K_PICC` ni `NTAG424_MASTER_KEY`
- **AND** el código SHALL NO imprimir `process.env` completo.

### Requirement: Endpoint público `GET /api/coa/verify`
El backend SHALL exponer un endpoint público `GET /api/coa/verify` que reciba dos query params: `picc` (32 hex chars) y `cmac` (16 hex chars). El endpoint SHALL:
1. Validar el formato con un Zod schema en `api/validators/coaSchemas.js` aplicado vía `validate()` en `api/routes/coaRoutes.js`.
2. Verificar criptográficamente los parámetros usando `api/services/ntag424Service.js`.
3. Consultar el tag y la obra en una sola query con JOIN.
4. Comprobar el contador SDM contra `last_counter` para anti-replay.
5. Actualizar `last_counter` atómicamente.
6. Registrar el resultado en `verification_events` (siempre, incluso en fallos).
7. Devolver la respuesta con `sendSuccess()`.

El endpoint SHALL aplicar un rate-limiter dedicado `coaVerifyLimiter` (definido en `api/middleware/rateLimiter.js`, configurable vía `config.rateLimit.coaVerify.*`, valores por defecto 60 req/min por IP) y `cacheControl({ noStore: true })`. SHALL NO requerir autenticación.

#### Scenario: Verificación exitosa de un tag activo
- **WHEN** un coleccionista hace tap y el chip emite `?picc=<32hex>&cmac=<16hex>` válidos
- **AND** el tag existe en `nfc_tags` con `status='active'` y el contador SDM es mayor que `last_counter`
- **THEN** el endpoint SHALL devolver HTTP 200 con `{ success: true, status: 'ok', counter, art: {...} }`
- **AND** SHALL actualizar `nfc_tags.last_counter` al valor del nuevo contador
- **AND** SHALL insertar una fila en `verification_events` con `status='ok'`.

#### Scenario: Parámetros con formato inválido
- **WHEN** se llama al endpoint con `?picc=zz&cmac=zz`
- **THEN** el endpoint SHALL responder con `{ success: true, status: 'malformed' }`
- **AND** SHALL insertar un evento `status='malformed'`
- **AND** SHALL NO ejecutar criptografía AES con los datos inválidos.

#### Scenario: CMAC no coincide
- **WHEN** el PICC descifra a un UID válido pero el CMAC no coincide con el calculado
- **THEN** el endpoint SHALL responder con `{ success: true, status: 'invalid_cmac' }`
- **AND** la comparación de CMAC SHALL usar `crypto.timingSafeEqual()` (constant-time)
- **AND** SHALL insertar un evento `status='invalid_cmac'` con el UID parcial recuperado.

#### Scenario: Tag desconocido
- **WHEN** la verificación criptográfica pasa pero el UID no existe en `nfc_tags`
- **THEN** el endpoint SHALL responder `{ success: true, status: 'unknown_tag' }`
- **AND** SHALL registrar el evento con el UID.

#### Scenario: Tag revocado
- **WHEN** el tag existe pero `status` es `revoked`, `lost` o `damaged`
- **THEN** el endpoint SHALL responder `{ success: true, status: 'revoked' }`
- **AND** SHALL NO actualizar `last_counter`.

#### Scenario: Replay (contador menor o igual al último visto)
- **WHEN** la verificación pasa pero `counter <= last_counter`
- **THEN** el endpoint SHALL responder `{ success: true, status: 'replay' }`
- **AND** SHALL NO actualizar `last_counter`.

#### Scenario: Carrera en actualización de `last_counter`
- **WHEN** dos verificaciones concurrentes con el mismo `counter` llegan en paralelo
- **THEN** la condición `WHERE last_counter < ?` en el UPDATE atómico SHALL hacer que sólo una de las dos modifique la fila (`rowsAffected = 1`); la otra SHALL responder `replay`.

#### Scenario: Rate-limit por IP excede umbral
- **WHEN** una IP supera el umbral de `coaVerifyLimiter`
- **THEN** el endpoint SHALL responder con HTTP 429 con el mensaje del limiter
- **AND** SHALL NO ejecutar criptografía ni consultar la BD.

#### Scenario: No se cachea ninguna respuesta
- **WHEN** se inspecciona la respuesta del endpoint
- **THEN** los headers SHALL incluir `Cache-Control: no-store`.

### Requirement: Servicio criptográfico `ntag424Service`
El backend SHALL implementar `api/services/ntag424Service.js` exponiendo una función pura `verifySunParams({ piccHex, cmacHex })` que:
1. Descifra el PICC con AES-128-CBC, clave `K_PICC`, IV de 16 ceros, sin padding. Extrae el byte de tag, los 7 bytes de UID y los 3 bytes de contador (little-endian).
2. Deriva la clave CMAC del tag con `AES-CMAC(MASTER_KEY, 0x02 || UID || SYSTEM_ID)`.
3. Calcula la clave de sesión `AES-CMAC(K1, 0x3CC30001 || 0x0080 || UID || counterLE)`.
4. Calcula el CMAC esperado: `AES-CMAC(sessionKey, [])`, tomando los 8 bytes de los índices impares.
5. Compara con el CMAC recibido en tiempo constante.

La función SHALL retornar `{ ok: true, uidHex, counter }` o `{ ok: false, reason: 'MALFORMED'|'INVALID_CMAC', uidHex?, counter? }` y NO ejecutar I/O (no consultas a BD, no logs).

#### Scenario: Vector conocido del datasheet AN12196 verifica correctamente
- **WHEN** se invoca `verifySunParams` con `piccHex` y `cmacHex` derivados de un vector de prueba conocido del datasheet
- **THEN** la función SHALL devolver `{ ok: true, uidHex, counter }` con los valores esperados.

#### Scenario: La función no toca BD ni logger
- **WHEN** se ejecuta `verifySunParams` en un test unitario
- **THEN** el test SHALL pasar sin mockear `@libsql/client` ni `logger`
- **AND** SHALL ejecutarse en menos de 10 ms para un input válido típico.

### Requirement: Privacidad de IPs en `verification_events`
El backend SHALL implementar `api/utils/ipPrivacy.js` con función `hashIp(ip)` que devuelve `HMAC-SHA256(IP_HASH_SALT, ip).hex.slice(0, 32)` o `null` si la IP es vacía/`null`. El controlador SHALL almacenar el resultado de esta función en `verification_events.ip_hash`. SHALL NO almacenar la IP en claro en ningún campo.

#### Scenario: IPs idénticas producen mismo hash
- **WHEN** dos verificaciones llegan desde la misma IP con la misma sal
- **THEN** ambas SHALL producir el mismo `ip_hash` (permite detectar enumeración por IP).

#### Scenario: Cambiar la sal invalida la correlación
- **WHEN** se rota `IP_HASH_SALT`
- **THEN** los hashes nuevos SHALL ser distintos a los antiguos para la misma IP (no se pueden correlacionar eventos antiguos con nuevos por IP).

### Requirement: Endpoints admin para gestión de tags NFC
El backend SHALL exponer tres endpoints admin protegidos por `authenticate` + `adminAuth`, montados bajo `/api/admin/coa/`:

- `GET /api/admin/coa/tags` — listado paginado de `nfc_tags` con JOIN a `art`. Acepta query params: `page` (default 1), `limit` (default 20, máximo 100), `status` (opcional, uno de `active|revoked|lost|damaged`), `art_id` (opcional). Devuelve `sendPaginated()` con: `uid`, `serial_label`, `art_id`, `art_name` (de art), `art_slug`, `status`, `last_counter`, `is_permanently_locked`, `personalized_at`, `personalized_by`, `locked_at`, `notes`.
- `GET /api/admin/coa/tags/:uid` — detalle de un tag, incluyendo los últimos N eventos de `verification_events` (default 50, configurable vía `?events_limit`). Devuelve `sendSuccess()` con la fila completa de `nfc_tags` JOIN `art` y un array `events` ordenado por `occurred_at DESC`.
- `PATCH /api/admin/coa/tags/:uid/status` — body JSON `{ status: 'active'|'revoked'|'lost'|'damaged', notes?: string }`. Valida con Zod schema `coaAdminStatusSchema`. Actualiza `nfc_tags.status`; si `notes` viene, lo concatena al campo existente con prefijo `[YYYY-MM-DD HH:MM:SS]`. Idempotente (no falla si el estado coincide con el actual). Devuelve `sendSuccess()` con la fila actualizada.

Estos endpoints SHALL aplicar `sensitiveLimiter` y SHALL NO permitir crear, borrar, ni modificar `uid`, `art_id`, `last_counter`, `is_permanently_locked` ni ningún campo criptográficamente relevante. SHALL registrar cada cambio de status con `logger.info({...})` indicando admin que ejecuta, UID, transición y motivo.

#### Scenario: Listado paginado funciona
- **WHEN** un admin autenticado llama a `GET /api/admin/coa/tags?status=active&page=1&limit=10`
- **THEN** el endpoint SHALL devolver HTTP 200 con paginación y sólo tags `status='active'`
- **AND** SHALL NO devolver datos criptográficos del chip.

#### Scenario: Detalle incluye historial de verificaciones
- **WHEN** un admin llama a `GET /api/admin/coa/tags/<UID>?events_limit=20`
- **THEN** el endpoint SHALL devolver la fila del tag más un array `events` con hasta 20 entradas de `verification_events`, más recientes primero.

#### Scenario: Cambio de status a revocado registra motivo
- **WHEN** un admin llama a `PATCH /api/admin/coa/tags/<UID>/status` con `{ status: 'lost', notes: 'Coleccionista reporta robo' }`
- **THEN** el tag SHALL pasar a `status='lost'`
- **AND** `notes` SHALL contener `[<timestamp>] Coleccionista reporta robo` (concatenado al `notes` previo si lo había)
- **AND** una llamada posterior a `/api/coa/verify` con ese tag SHALL devolver `status='revoked'`.

#### Scenario: Idempotencia
- **WHEN** un admin llama a `PATCH /api/admin/coa/tags/<UID>/status` con `{ status: 'active' }` sobre un tag que ya está `active`
- **THEN** el endpoint SHALL devolver HTTP 200 sin error
- **AND** NO crea entrada espuria en `notes`.

#### Scenario: No autenticado o no admin rechazado
- **WHEN** un usuario sin token JWT, o con token de un usuario no admin, llama a cualquier endpoint admin de CoA
- **THEN** el endpoint SHALL devolver HTTP 401 o 403 según corresponda
- **AND** SHALL NO ejecutar ninguna consulta a `nfc_tags`.

### Requirement: Página pública `/coa` que muestra el resultado al coleccionista
El frontend SHALL implementar `client/app/coa/page.js` como Server Component (sin `'use client'`) que:
1. Lee los query params `picc` y `cmac` (App Router pattern).
2. Llama internamente al backend vía `INTERNAL_API_URL` (variable server-only, p. ej. `http://api:3001/api`) usando `fetch` con `cache: 'no-store'`.
3. Renderiza un componente `<CoaSuccess>` si la respuesta es `status='ok'`, mostrando: logo de "140d Galería de Arte", título "Certificado de Autenticidad verificado ✓", imagen de la obra (via `getArtImageUrl(basename)`), nombre, descripción, tipo, dimensiones, y el contador "Verificación nº N de este certificado".
4. Renderiza un componente `<CoaFailure>` en cualquier otro caso con un mensaje en es-ES específico para cada `status` (`malformed`, `invalid_cmac`, `unknown_tag`, `revoked`, `replay`).
5. Los mensajes de fallo SHALL estar centralizados en `client/lib/constants.js` como `COA_FAILURE_MESSAGES`.
6. SHALL usar exclusivamente clases Tailwind, sin CSS custom.
7. SHALL capturar errores de red/timeout del backend con Sentry y mostrar `Failure` con `status='malformed'`.

#### Scenario: Verificación exitosa muestra la obra
- **WHEN** el coleccionista hace tap y el backend responde `status='ok'` con la obra
- **THEN** la página SHALL mostrar el logo + "140d Galería de Arte" en cabecera
- **AND** SHALL mostrar título "Certificado de Autenticidad verificado ✓"
- **AND** SHALL mostrar imagen, nombre, descripción y dimensiones de la obra
- **AND** SHALL mostrar texto "Verificación nº N de este certificado".

#### Scenario: Verificación falla con mensaje claro
- **WHEN** el backend responde con `status='invalid_cmac'`
- **THEN** la página SHALL mostrar el mensaje correspondiente de `COA_FAILURE_MESSAGES` ("La firma del certificado no es válida. Esta pegatina podría ser una copia.")
- **AND** SHALL NO mostrar la imagen ni datos de ninguna obra
- **AND** SHALL incluir una línea de contacto con la galería.

#### Scenario: Backend caído o timeout
- **WHEN** la llamada interna al backend lanza una excepción o tarda más del timeout
- **THEN** la página SHALL renderizar `<CoaFailure status="malformed" />`
- **AND** SHALL capturar el error en Sentry sin filtrar query params ni datos sensibles.

#### Scenario: Falta query param
- **WHEN** la URL es `/coa` sin `picc` o sin `cmac`
- **THEN** la página SHALL renderizar directamente `<CoaFailure status="malformed" />` sin llamar al backend.
