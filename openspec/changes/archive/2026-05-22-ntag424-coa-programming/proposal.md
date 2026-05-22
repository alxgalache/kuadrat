## Why

La galería envía con cada obra vendida un Certificado de Autenticidad (CoA) en papel. Para que ese certificado pruebe inequívocamente la autenticidad de la obra y sea resistente al clonado/falsificación, queremos incorporar a cada CoA una pegatina NFC NTAG 424 DNA programada en modo SUN (Secure Unique NFC) con PICC cifrado + CMAC. Cada tap con un móvil abrirá una URL única (no replicable), el backend la verificará criptográficamente y mostrará al coleccionista una página pública que confirma la autenticidad y muestra la obra. La pegatina se programa en local por el operador de la galería con un lector ACR1552U; no requiere infraestructura física adicional en el servidor.

## What Changes

- Nuevo endpoint público `GET /api/coa/verify` que verifica los parámetros SUN (`picc`, `cmac`) del NTAG 424 DNA, controla replay vía contador SDM y devuelve la obra asociada o un código de fallo.
- Nuevos endpoints admin protegidos (auth + adminAuth) para gestión de tags: `GET /api/admin/coa/tags` (listado paginado), `GET /api/admin/coa/tags/:uid` (detalle con historial de verificaciones), `PATCH /api/admin/coa/tags/:uid/status` (cambiar `status` a `active`/`revoked`/`lost`/`damaged` con motivo en `notes`).
- Nueva página pública Next.js `client/app/coa/page.js` (Server Component) que llama internamente al endpoint y renderiza la verificación al coleccionista (éxito o uno de los modos de fallo, en es-ES y con branding "140d Galería de Arte").
- Nuevas tablas en `api/config/database.js`: `nfc_tags` (registro de pegatinas vinculadas a obras) y `verification_events` (auditoría de cada intento de verificación, con IP hasheada por GDPR).
- Nuevas variables de entorno `NTAG424_K_PICC`, `NTAG424_MASTER_KEY`, `NTAG424_SYSTEM_ID`, `IP_HASH_SALT`, registradas y validadas en `api/config/env.js` como `config.ntag424.*` y `config.ipHashSalt`.
- Nuevo subproyecto Node.js aislado en `scripts/nfc-personalization/` (fuera de Docker, ejecutado en el equipo del operador con acceso USB al lector ACR1552U) con tres comandos: `personalize` (programa la pegatina y la registra en BD), `lock` (bloqueo permanente, diferido e irreversible) e `inspect` (diagnóstico).
- Documentación operativa: README del subproyecto con flujo paso a paso, checklist por lote, custodia de claves y procedimiento de rotación.

No hay cambios *breaking*: la funcionalidad es estrictamente aditiva sobre la tabla `art` existente.

## Capabilities

### New Capabilities
- `coa-nfc-verification`: Verificación criptográfica de etiquetas NTAG 424 DNA pegadas a los certificados de autenticidad de las obras. Cubre el endpoint público `/api/coa/verify`, los endpoints admin de gestión (`/api/admin/coa/tags*`), el modelo de datos `nfc_tags` + `verification_events`, las reglas anti-replay basadas en contador SDM, los modos de fallo (`malformed`, `invalid_cmac`, `unknown_tag`, `revoked`, `replay`) y la página pública `/coa` que muestra el resultado al coleccionista.
- `nfc-tag-personalization`: Proceso operativo de programación de pegatinas NTAG 424 DNA por el operador de la galería. Cubre el subproyecto Node.js aislado, la derivación de claves diversificadas per-UID (NXP AN10922), la configuración SDM (PICC cifrado + CMAC), la escritura del NDEF, el registro en `nfc_tags`, el bloqueo permanente diferido e irreversible y los procedimientos de inspección, revocación y rotación de claves.

### Modified Capabilities
<!-- Ninguna: la funcionalidad es estrictamente aditiva. La tabla `art` no se modifica; sólo se le añade una nueva relación FK desde `nfc_tags`. -->

## Impact

- **Código backend**: nuevos ficheros `api/controllers/coaController.js`, `api/controllers/coaAdminController.js`, `api/routes/coaRoutes.js`, `api/routes/admin/coaRoutes.js`, `api/services/ntag424Service.js`, `api/utils/ipPrivacy.js`, `api/validators/coaSchemas.js`. Modificaciones en `api/config/database.js` (nuevas tablas), `api/config/env.js` (nuevas vars), `api/server.js` (montar el router público) y `api/routes/admin/index.js` (montar el sub-router admin).
- **Código frontend**: nuevo `client/app/coa/page.js` (Server Component) + componentes auxiliares (`CoaSuccess`, `CoaFailure`) con Tailwind. Reutiliza helper `getArtImageUrl()` de `client/lib/api.js`. Posible nueva entrada en `client/lib/constants.js` para mensajes de error.
- **Base de datos**: 2 tablas nuevas (`nfc_tags`, `verification_events`) con sus índices. Sin migraciones SQL sueltas: schema actualizado dentro de `initializeDatabase()` (idempotente con `IF NOT EXISTS`). FK a `art(id)` con `ON DELETE RESTRICT` para evitar borrados accidentales.
- **Dependencias backend**: añadir `node-aes-cmac` a `api/package.json`.
- **Subproyecto nuevo**: `scripts/nfc-personalization/` con `package.json` propio (deps: `nfc-pcsc`, librería NTAG 424 DNA — selección final en design.md, `node-aes-cmac`, `@libsql/client`, `prompts`, `dotenv`). NO entra en Docker, NO comparte `node_modules` con `api/` ni `client/`. El módulo criptográfico (`ntag424Service`) se duplica en el script (lectura/derivación) para mantener el subproyecto autocontenido.
- **Seguridad / custodia**: las claves `NTAG424_K_PICC` y `NTAG424_MASTER_KEY` son los secretos más sensibles del sistema. Procedimiento de custodia y rotación documentado en el README del subproyecto.
- **Privacidad (GDPR)**: las IPs de `verification_events` se almacenan como HMAC-SHA256 con sal (`IP_HASH_SALT`), no en claro.
- **Rate limiting**: el endpoint `/api/coa/verify` se monta con un limiter dedicado (basado en `paymentVerificationLimiter` o uno nuevo `coaVerifyLimiter`) suficientemente permisivo para taps repetidos por un coleccionista legítimo, pero protegiendo de enumeración por IP.
- **Sentry**: errores del endpoint y de la página `/coa` se capturan con el SDK ya configurado.
- **Sin impacto** sobre auctions, events, orders, Stripe Connect, livekit ni emails: módulo independiente.
