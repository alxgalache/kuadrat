## Context

Kuadrat es una galería online minimalista. Las obras vendidas se envían físicamente al coleccionista junto con un Certificado de Autenticidad (CoA) en papel. Hoy el CoA es estático y no permite probar criptográficamente la autenticidad. Queremos pegar a cada CoA una pegatina **NTAG 424 DNA** (chip NXP NT4H2421Gx) que, al ser leída con cualquier móvil con NFC, abra una URL única irrepetible verificable contra nuestro backend.

El proyecto ya tiene infraestructura para el flujo (`api/` Express con Turso, `client/` Next.js, Docker Compose). Falta:
1. Modelo de datos para vincular tag ↔ obra y auditar verificaciones.
2. Endpoint público criptográfico que verifique el "SUN message" generado por el chip.
3. Página pública `/coa` que muestre el resultado al coleccionista.
4. Subproyecto operativo Node.js, fuera de Docker, para programar las pegatinas con el lector ACS ACR1552U que ya está adquirido. El operador (tú) ejecuta el script localmente; no hay infraestructura adicional en el servidor.

Restricciones del proyecto que condicionan el diseño:
- Backend en **CommonJS** (no ESM), JavaScript puro.
- Frontend en **JavaScript puro** (NO TypeScript), pages = `page.js`.
- Schema en `api/config/database.js` como única fuente de verdad, idempotente, sin `ALTER TABLE` ni migraciones SQL sueltas.
- Logging con Pino, no `console.log`.
- Validación con Zod, no regex inline en controladores.
- Respuestas con `sendSuccess()`, no `res.json()` directo.
- Errores con `ApiError`, no `throw new Error()`.
- Rate-limit obligatorio en endpoints públicos.

## Goals / Non-Goals

**Goals:**
- Implementar verificación criptográfica completa de NTAG 424 DNA con PICC cifrado (16 bytes AES-128-CBC) y CMAC truncado (8 bytes), siguiendo NXP AN12196.
- Diversificación de claves per-UID con el método NXP AN10922 simplificado (AES-CMAC con `MASTER_KEY` sobre `label || UID || SYSTEM_ID`), de modo que el compromiso de una pegatina no expone las demás.
- Anti-replay robusto vía contador SDM (`UPDATE … WHERE last_counter < ?`, atómico contra carreras).
- Cinco estados de fallo distinguibles devueltos al cliente: `malformed`, `invalid_cmac`, `unknown_tag`, `revoked`, `replay`.
- Página pública `/coa` con éxito (muestra obra + contador de verificaciones) y fallo (mensaje claro al coleccionista, sin filtrar detalles del sistema).
- Subproyecto `scripts/nfc-personalization/` autocontenido (su propio `package.json` y `node_modules`), con tres comandos: `personalize`, `lock` (bloqueo permanente, IRREVERSIBLE, diferido), `inspect`.
- Branding consistente: logo + "140d Galería de Arte" en la página `/coa`.
- Privacidad GDPR: IPs en `verification_events` como HMAC-SHA256 con sal, nunca en claro.
- Tests unitarios para `ntag424Service.js` con vectores conocidos (deriva, descifrado, sesión, CMAC truncado).

**Non-Goals:**
- No usaremos la variante NTAG 424 DNA **TagTamper** en v1 (detección física de despegado). La aplicación de adhesivo tamper-evident + laminado del CoA cubre el caso de uso actual; pivotar a TagTamper más adelante es compatible.
- No activaremos modo **LRP** (Leakage Resilient Primitive) en v1; AES-128 estándar es suficiente para el volumen previsto (<200 obras/año).
- No vincularemos pegatinas a `orders.id` en esta primera iteración (decisión confirmada con el usuario: programación independiente de la venta). Una columna `order_id NULL` puede añadirse como mejora futura sin romper el modelo.
- No exponer el contador SDM bajo el control del coleccionista: solo se muestra como "Verificación n.º N de este certificado" en la página `/coa` exitosa (decisión confirmada).
- No implementaremos UI de panel admin (frontend) para gestionar `nfc_tags` en v1. Sí implementaremos los endpoints REST admin (listado, detalle con historial, cambio de estado) protegidos por `authenticate` + `adminAuth`, para que sean usables desde la UI del admin existente o desde herramientas como `curl`/Postman. La UI completa de admin queda como mejora futura.
- No instalaremos drivers PC/SC en el contenedor de backend. El backend NUNCA toca hardware NFC; sólo verifica criptográficamente los parámetros que recibe por HTTP.
- No automatizaremos el bloqueo permanente: requiere doble confirmación interactiva, ejecutado por el operador tras periodo de prueba (días/semanas) con el móvil.

## Decisions

### 1. Modo criptográfico: PICC cifrado + CMAC (no PICC en claro)

URL resultante opaca: `https://140d.art/coa?picc=<32hex>&cmac=<16hex>`.

**Por qué**: privacidad. Una URL en claro (`?uid=…&ctr=…`) filtra qué obra es y cuántas veces se ha verificado a cualquiera que vea una captura en redes sociales. Para una galería esto sería poco profesional. El coste extra (descifrar 16 bytes AES-128-CBC en el servidor) es despreciable.

**Alternativa descartada**: PICC en claro. Más simple, pero rompe la privacidad y la apariencia profesional del CoA.

### 2. Asignación de claves K0–K4 del chip

| Clave | Rol | Origen |
|---|---|---|
| K0 | App Master Key (autoriza cambios en config del tag) | Diversificada por UID (label `0x01`) |
| K1 | `SDMFileReadKey` (deriva el CMAC) | Diversificada por UID (label `0x02`) |
| K2 | `SDMMetaReadKey` (descifra el PICC) | **Fija** = `K_PICC` (igual en todas las pegatinas) |
| K3 | No usada (pero no se deja a ceros) | Diversificada por UID (label `0x03`) |
| K4 | No usada (pero no se deja a ceros) | Diversificada por UID (label `0x04`) |

**K2 fija + K1 diversificada** es la decisión clave. Para descifrar el PICC el servidor necesita la clave **antes** de conocer el UID (huevo y gallina), así que `K2 = K_PICC` debe ser igual en todas las pegatinas. Una vez descubierto el UID en el plaintext del PICC, K1 se deriva al vuelo: comprometer una pegatina concreta sólo expone su K1 individual, nunca la maestra.

**Derivación AN10922 simplificado**:
```
K_tag = AES-CMAC(MASTER_KEY, label || UID(7) || SYSTEM_ID(3))
```
Con `SYSTEM_ID = 0x313430` (ASCII `"140"`) para identificar nuestra infraestructura y prevenir colisiones con cualquier otro sistema que en el futuro use el mismo chip.

### 3. Esquema NDEF y offsets SDM

URL plantilla (78 bytes de payload):
```
https://140d.art/coa?picc=<32 ceros ASCII>&cmac=<16 ceros ASCII>
```

Offsets que el chip necesita en `ChangeFileSettings` del File 02:
- `PICCDataMirrorOffset = 25` (0x19) — inicio del placeholder PICC
- `SDMMACInputOffset = 63` (0x3F) — input vacío (la sesión deriva del UID+contador, suficiente)
- `SDMMACOffset = 63` (0x3F) — inicio del placeholder CMAC

Acceso del File 02 durante personalización: `Read=E, Write=0, ReadWrite=0, Change=0`. En el lock posterior se reescribe a `Read=E, Write=F, ReadWrite=F, Change=F`.

### 4. Modelo de datos: dos tablas nuevas en `api/config/database.js`

```sql
CREATE TABLE IF NOT EXISTS nfc_tags (
  uid                    TEXT PRIMARY KEY,
  art_id                 INTEGER NOT NULL,
  serial_label           TEXT,
  status                 TEXT NOT NULL DEFAULT 'active'
                         CHECK(status IN ('active','revoked','lost','damaged')),
  last_counter           INTEGER NOT NULL DEFAULT -1,
  is_permanently_locked  INTEGER NOT NULL DEFAULT 0,
  personalized_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  personalized_by        TEXT NOT NULL,
  locked_at              DATETIME,
  notes                  TEXT,
  FOREIGN KEY (art_id) REFERENCES art(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_art_id ON nfc_tags(art_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_status ON nfc_tags(status);

CREATE TABLE IF NOT EXISTS verification_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uid           TEXT,
  counter       INTEGER,
  status        TEXT NOT NULL
                CHECK(status IN ('ok','invalid_cmac','replay','unknown_tag','revoked','malformed')),
  ip_hash       TEXT,
  user_agent    TEXT,
  occurred_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_verif_events_uid       ON verification_events(uid);
CREATE INDEX IF NOT EXISTS idx_verif_events_status    ON verification_events(status);
CREATE INDEX IF NOT EXISTS idx_verif_events_occurred  ON verification_events(occurred_at);
```

Decisiones:
- `last_counter DEFAULT -1` para que el primer tap (contador SDM = 0) sea aceptado por `counter > last_counter`.
- Boolean como `INTEGER 0/1`, coherente con `art.visible`, `art.is_sold`, etc.
- `ON DELETE RESTRICT` en la FK: evita borrar una obra con tags activos por accidente.
- Sin `ON DELETE CASCADE` en `verification_events` (la auditoría debe sobrevivir incluso a borrados de tags).

### 5. Endpoint `GET /api/coa/verify`

Decisión: usar **`GET`** con query string (no `POST` con JSON), porque el chip escribe la URL en el NDEF y el móvil la abre directamente en el navegador. Cambiarlo implicaría un redirector intermedio. No tiene sentido.

Pipeline del controlador:
1. Validar formato con Zod schema (`coaVerifySchema`): `picc` = 32 hex, `cmac` = 16 hex. Si falla → `malformed` (registrar evento, responder).
2. `verifySunParams({ piccHex, cmacHex })`:
   - Descifrar PICC con `K_PICC` (AES-128-CBC, IV=0, sin padding). Extraer `tag`, `uid(7)`, `counter(3 LE)`.
   - Derivar `K1` para ese UID.
   - Calcular `sessionKey = AES-CMAC(K1, SV2)` donde `SV2 = 0x3CC3000100 80 || UID || counterLE`.
   - Calcular `expectedCmac = bytes_impares(AES-CMAC(sessionKey, empty))` (8 bytes truncados, índices 1,3,5,…,15).
   - Comparar en tiempo constante con `crypto.timingSafeEqual()`. Si falla → `invalid_cmac`.
3. Consultar `nfc_tags JOIN art` por UID. Si no existe → `unknown_tag`. Si `status != 'active'` → `revoked`.
4. Si `counter <= last_counter` → `replay`.
5. `UPDATE nfc_tags SET last_counter = ? WHERE uid = ? AND last_counter < ?`. Si `rowsAffected === 0` → `replay` (carrera).
6. Devolver `{ success: true, status: 'ok', counter, art: {...} }` con `sendSuccess()`.
7. **Siempre** registrar en `verification_events` (incluso casos malformed/unknown_tag).

Errores inesperados (DB caída, etc.) van por `ApiError` → `errorHandler` global → Sentry.

**Rate-limit**: limiter dedicado `coaVerifyLimiter` (definido en `api/middleware/rateLimiter.js`), tipo 60 req/min por IP. Suficientemente alto para taps repetidos por un coleccionista legítimo; suficientemente bajo para frenar enumeración masiva. Configurable vía `config.rateLimit.coaVerify.*`.

**Caching**: explícito `no-store` (Cache-Control). Cada tap genera URL única; cachear sería catastrófico.

### 5.bis. Endpoints admin de gestión de tags

Tres endpoints protegidos por `authenticate` + `adminAuth` montados bajo `/api/admin/coa/`, en `api/routes/admin/coaRoutes.js` y registrados en `api/routes/admin/index.js`:

- `GET /api/admin/coa/tags?page=1&limit=20&status=active&art_id=42` — listado paginado de `nfc_tags` JOIN `art` (devuelve `uid`, `serial_label`, `art_id`, `art_name`, `status`, `last_counter`, `is_permanently_locked`, `personalized_at`, `personalized_by`, `locked_at`). Filtros opcionales por `status` y `art_id`. Usa `sendPaginated()`.
- `GET /api/admin/coa/tags/:uid` — detalle de un tag con los últimos N eventos de `verification_events` (default 50, configurable vía `?events_limit=...`). Útil para diagnóstico ("¿cuándo se ha verificado?", "¿hay intentos `invalid_cmac` sospechosos?"). Usa `sendSuccess()`.
- `PATCH /api/admin/coa/tags/:uid/status` — body `{ status: 'active'|'revoked'|'lost'|'damaged', notes?: string }`. Cambia el estado del tag y opcionalmente añade notas (concatenadas a `notes` con marca de tiempo). Validación por Zod schema `coaAdminStatusSchema`. Idempotente: cambiar a un estado que ya está vigente no falla. Usa `sendSuccess()`.

Estos endpoints NO permiten crear ni borrar tags (la creación pasa siempre por el script de personalización, el borrado nunca: se usa `status` para "tachar"). NO permiten modificar `uid`, `art_id`, `last_counter`, `is_permanently_locked` ni nada criptográficamente relevante.

Rate-limit: usar `sensitiveLimiter` ya existente (más estricto que `generalLimiter`).

Logging: cambios de status registrados con `logger.info({...})` indicando admin que ejecuta, UID, transición de estado, motivo.

### 6. Página `client/app/coa/page.js` como Server Component

Decisiones:
- Server Component (sin `'use client'`): la verificación se hace en SSR, no expone el endpoint al cliente.
- Llama al backend desde dentro de Docker. Variable de entorno **server-side only**: `INTERNAL_API_URL` (p. ej. `http://api:3001/api` si el servicio se llama `api` en docker-compose).
- Si por timeout / 5xx el backend falla, muestra `Failure` con `status='malformed'` y captura con Sentry.
- Estilos: Tailwind utility classes, sin clases custom. Componentes `<CoaSuccess>` y `<CoaFailure>` en el mismo archivo (o en `client/components/coa/`).
- Branding: header con `<Image src="/logo.svg" />` (logo de 140d Galería de Arte) y `<h1>` "Certificado de Autenticidad verificado" o "No se ha podido verificar" según resultado.
- Imagen de la obra: usar helper `getArtImageUrl(art.basename)` reutilizado de `client/lib/api.js` (soporta CDN_URL).
- Contador: en `Success`, mostrar "Verificación nº N de este certificado".
- Mensajes de error en es-ES por código de status, extraídos a `client/lib/constants.js` (`COA_FAILURE_MESSAGES`).

### 7. Subproyecto `scripts/nfc-personalization/`

**Aislamiento estricto**: directorio raíz `scripts/nfc-personalization/` con su propio `package.json`, `node_modules`, `.env`. NO en Docker. NO comparte deps con `api/` ni `client/`.

Razón: `nfc-pcsc` requiere compilación nativa (`pcsclite`) y acceso USB físico al lector ACR1552U. Meterlo en Docker rompe el build del backend en macOS/Windows y añade fricción con device pass-through.

**Comandos**:
- `npm run personalize` → flujo interactivo: detecta tag → pregunta slug de la obra → confirma → autentica con K0=ceros → escribe K1..K4..K0 → escribe NDEF → configura SDM → registra en BD → imprime instrucciones de verificación con móvil.
- `npm run lock -- <UID>` → bloqueo permanente, IRREVERSIBLE. Doble confirmación. Cambia FileSettings del File 02 a `Read=E, Write=F, ReadWrite=F, Change=F` y marca en BD `is_permanently_locked=1, locked_at=NOW()`.
- `npm run inspect` → diagnóstico, lee FileSettings, contador SDM actual, estado del chip; no modifica nada.

**Conexión a Turso**: directa con `@libsql/client` (mismo `TURSO_DATABASE_URL` que el backend). El script NO usa el endpoint Express. Razón: el backend sólo verifica; el script registra.

**Módulo criptográfico**: duplicado entre `api/services/ntag424Service.js` (verificación) y `scripts/nfc-personalization/src/lib/crypto.js` (derivación). Decisión por simplicidad (50 tags, script esporádico). Tests con vectores compartidos garantizan que ambas implementaciones coinciden.

### 8. Selección de librería NTAG 424 DNA — RESUELTO

**Decisión final: usar la librería `ntag424`** (npm: `ntag424` v0.3.x, repo `nikeee/node-ntag424`, licencia **AGPL-3.0**).

Razones:
- Implementa correctamente `AuthenticateEV2First`, `ChangeKey`, `ChangeFileSettings`, `WriteData`, `GetFileSettings` con todo el cifrado de sesión y MAC sobre comandos. Ahorra ~500 líneas de criptografía delicada y un montón de bugs sutiles.
- La AGPL no se activa en nuestro caso: el script corre en local en el equipo del operador, no se ofrece como servicio de red ni se redistribuye. Si en el futuro se quisiera publicar el subproyecto, habría que adoptar AGPL o reescribir la capa.
- Mantenida activamente (último publish hace pocas semanas).
- La librería es ESM-only, por lo que **el subproyecto `scripts/nfc-personalization/` está escrito como ESM** (`"type": "module"`, `import` en lugar de `require()`). No afecta a backend ni frontend.

**Por qué no `MxAshUp/ntag424-js` (MIT)**: cubre solo verificación (descifrar PICC + comprobar CMAC), no la programación.

**Dependencias finales del subproyecto**:
```
nfc-pcsc          — comunicación PC/SC con el lector
ntag424           — APDUs NTAG 424 DNA (AGPL)
node-aes-cmac     — derivación de claves (idéntica al backend)
@libsql/client    — registro en Turso
prompts           — CLI interactivo
dotenv            — secretos en .env
```

`src/lib/ntag424.js` no implementa APDUs; expone constantes específicas del proyecto (`NTAG424_NDEF_AID`, `FILE_NDEF`, `FACTORY_KEY`, offsets SDM) y dos helpers: `buildNdefBuffer(baseUrl)` para construir el NDEF de 79 bytes coherente con los offsets, y `SDM_FILE_SETTINGS_OPEN`/`SDM_FILE_SETTINGS_LOCKED` con la forma que espera `session.setFileSettings()`. Toda la criptografía de sesión queda dentro de la librería.

### 9. Custodia de claves y rotación

`NTAG424_K_PICC` y `NTAG424_MASTER_KEY` son los secretos más sensibles del sistema. Si se filtran:
- Cualquiera puede generar pegatinas falsas que pasen la verificación.
- Cualquiera puede descifrar URLs SUN que circulen por internet y enumerar la colección.

Mínimos exigidos:
1. Generación con CSPRNG (`openssl rand -hex 16`).
2. Almacenamiento en producción vía secrets manager del backend (no `.env` plano en disco). En desarrollo: `.env` local **gitignored** con permisos `600`.
3. Backup impreso en papel + GPG-cifrado off-site.
4. Nunca loguear `process.env` completo, ni las claves, ni en errores capturados por Sentry.
5. Rotación: documentada en README del subproyecto. AES-128 está sobrado para el volumen previsto; rotación planificada cada 3–5 años o tras evento sospechoso. Si se rota, las pegatinas ya bloqueadas permanentemente son irreemplazables criptográficamente y habría que sustituirlas físicamente (esto es inherente al modelo, no un defecto).

### 10. Privacidad GDPR

`verification_events.ip_hash` se calcula como `HMAC-SHA256(IP_HASH_SALT, ip).slice(0,32)`. Permite detectar abuso/enumeración por IP sin almacenar datos personales identificables. `user_agent` se trunca a 256 caracteres. Política aplicable al resto del proyecto: no añadir campos PII a `verification_events` (no email, no userId).

### 11. Variables de entorno nuevas

Añadir a `api/config/env.js`:

```js
// dentro del objeto config:
ntag424: {
  systemId: required('NTAG424_SYSTEM_ID'),      // 6 hex (3 bytes)
  kPicc: required('NTAG424_K_PICC'),            // 32 hex (16 bytes)
  masterKey: required('NTAG424_MASTER_KEY'),    // 32 hex (16 bytes)
},
ipHashSalt: required('IP_HASH_SALT'),           // 32+ hex
```

Validación adicional en arranque: las tres NTAG424_* deben ser hex válido del tamaño correcto; si no, `process.exit(1)`. Implementar como helper `requiredHex(name, byteLength)` añadido a `env.js`.

`scripts/nfc-personalization/.env.example` documenta las mismas + `GALLERY_BASE_URL` (p. ej. `https://140d.art`) + `OPERATOR` (nombre humano del operador para auditoría en `nfc_tags.personalized_by`).

## Risks / Trade-offs

- **[Riesgo] Compromiso del entorno de programación** (malware en el portátil que ejecuta `personalize.js`) → Mitigación: documentar (no obligar todavía) usar equipo dedicado con disco cifrado y `.env` con permisos `600`. Generación de claves con `openssl rand`. Logs del script nunca imprimen claves. Mejora futura: HSM o equipo Raspberry Pi dedicado.

- **[Riesgo] Pérdida de las claves maestras** → Mitigación: backup impreso GPG-cifrado + custodia documentada. Sin las claves, las pegatinas existentes siguen funcionando criptográficamente pero el servidor no puede verificarlas (catástrofe). El README del subproyecto destaca esto en color rojo.

- **[Riesgo] Sustitución física de la pegatina** (despegarla del CoA legítimo y pegarla en una falsificación) → Mitigación v1: adhesivo tamper-evident + laminado físico del CoA. Migración futura a NTAG 424 DNA TagTamper si se considera necesario; arquitectura compatible.

- **[Riesgo] Pegatinas falsificadas (clones genéricos vendidos como NTAG)** → Mitigación: compra a distribuidor reconocido (Identiv / Shop NFC / RapidNFC). Inspect-tag.js comprueba que el chip responde a comandos NTAG 424 DNA antes de proceder. Si el comando `GetVersion` no devuelve `NT4H2421Gx`, abortar.

- **[Riesgo] Race condition sobre `last_counter`** (dos taps simultáneos) → Mitigación: `UPDATE nfc_tags SET last_counter = ? WHERE uid = ? AND last_counter < ?` atómico; si `rowsAffected = 0`, se trata como `replay`. Test en plan de pruebas (autocannon contra el endpoint con URLs reales).

- **[Riesgo] Pegatina queda en estado inconsistente** (script se interrumpe entre ChangeKey de K1 y K0) → Mitigación: orden de cambio es K1→K2→K3→K4→K0 (K0 al final), por lo que la única forma de "brickear" es interrumpir justo en el último ChangeKey de K0; en ese caso el tag aún es accesible con K0=ceros para reintentar. Si se fastidia más allá, el tag se descarta físicamente (2-5% de mermas por lote es esperable).

- **[Riesgo] Bloqueo permanente erróneo** (operador bloquea la pegatina equivocada o sin haber verificado el tap del móvil) → Mitigación: dos prompts de confirmación explícitos en `lock-tag.js`, periodo recomendado de prueba con móvil de 1-7 días, validación en BD de que `is_permanently_locked = 0` y `status = 'active'` antes de proceder. Una vez bloqueada, la pegatina es irrecuperable y debe sustituirse físicamente si la vinculación a obra es errónea.

- **[Riesgo] Endpoint `/api/coa/verify` usado para enumerar la colección** → Mitigación: PICC cifrado (sin `K_PICC` un atacante no puede generar URLs válidas) + rate-limit por IP + logging para detección de patrones anómalos en `verification_events`.

- **[Riesgo] Duplicación de código criptográfico entre backend y script** → Mitigación: tests unitarios con vectores compartidos. Coste aceptado por simplicidad operativa (50 tags, script ejecutado esporádicamente). Reevaluar si los volúmenes escalan.

- **[Trade-off] Decidimos NO bloquear la pegatina automáticamente al programar** → ventaja: el operador puede corregir errores tras pegarla al CoA. Coste: paso operativo extra. Documentado en checklist.

- **[Trade-off] Decidimos NO vincular `nfc_tags` a `orders.id` en v1** → ventaja: programación independiente de la venta (decisión del usuario). Coste: la página `/coa` no muestra info del pedido. Mejora futura aditiva (columna `order_id NULL` + render condicional en `/coa`).

- **[Trade-off] Decidimos NO usar LRP ni TagTamper en v1** → ventaja: menos complejidad. Coste: vulnerabilidad teórica menor a ataques de canal lateral avanzados y a despegado físico sin tamper-evident adhesivo. Aceptable para el volumen y perfil de amenaza actual.

## Open Questions (resueltas)

1. **Dominio de producción**: ✅ Confirmado `https://140d.art`. La URL escrita en el NDEF de cada pegatina usará este dominio en producción. En pruebas/preproducción, el operador puede sobrescribir `GALLERY_BASE_URL` en `scripts/nfc-personalization/.env`, pero las pegatinas reales se programan apuntando a `https://140d.art`.

2. **Nombre del servicio Docker del backend**: ✅ Confirmado vía `docker-compose.prod.yml`. El servicio se llama `api` y escucha en `3001`. Red compartida `kuadrat-network`. El frontend usa `INTERNAL_API_URL=http://api:3001/api` (server-side only). Los otros compose files (`docker-compose.{yml,local.yml,m1.yml,pre2.yml}`) usan el mismo nombre `api` (verificar como parte de la tarea 5.6).

3. **CDN para la imagen del CoA**: ✅ Resuelto sin acción. El helper `getArtImageUrl(basename)` de `client/lib/api.js` ya soporta `NEXT_PUBLIC_CDN_URL`. La página `/coa` lo usa tal cual.

4. **Política de revocación**: ✅ Confirmado. Se implementan endpoints admin REST en este mismo cambio: `GET /api/admin/coa/tags`, `GET /api/admin/coa/tags/:uid`, `PATCH /api/admin/coa/tags/:uid/status`. Detallado en §5.bis. Ya NO es operación SQL manual.

5. **Tamaño de las pegatinas**: ✅ Confirmado 22 mm de diámetro (mínimo aceptable, sin margen). Compra del lote: insistir al distribuidor en NTAG 424 DNA (NT4H2421Gx) de 22 mm, no clones genéricos.
