# Proposal: turso-s3-backups

## Why

La base de datos de producción vive en Turso Cloud y hoy **no existe ninguna copia de seguridad propia**: el único respaldo es el point-in-time recovery del proveedor y un dump manual que se ejecuta a mano con `turso db shell .dump` cuando alguien se acuerda (proceso documentado en `docs/turso-doc.md`). Un borrado accidental, una migración fallida o la pérdida del acceso a la cuenta de Turso dejarían la galería sin forma de recuperar pedidos, facturas, wallets de sellers ni certificados NFC. Se necesita una copia diaria automática, fuera del proveedor de base de datos y bajo nuestro control (AWS S3, donde ya guardamos los medios).

**Solo producción.** Staging seguirá respaldándose a mano cuando el operador lo estime oportuno: su información no es crítica y no justifica infraestructura. Esa restricción es la que mantiene el cambio pequeño — un bucket, un juego de permisos y ningún secreto nuevo.

## What Changes

- **Dump programático desde Node, sin turso CLI.** Un nuevo servicio genera el `.sql` leyendo `sqlite_master` y paginando las filas con el mismo `@libsql/client` que ya usa la aplicación. El fichero producido es equivalente al de `turso db shell <db> .dump` (incluye `sqlite_sequence`, así que los contadores AUTOINCREMENT — pedidos desde 1000 — se preservan), por lo que **el procedimiento de restauración sigue siendo exactamente el de `docs/turso-doc.md`**. No se añade ningún binario a la imagen Docker ni un segundo token de autenticación.
- **Scheduler diario a las 04:00 (Europe/Madrid).** Un sexto scheduler `api/scheduler/backupScheduler.js`, arrancado desde `api/server.js` junto a los cinco existentes. Se activa solo cuando `DB_BACKUP_ENABLED=true` y hay bucket de backups configurado; en local y bajo `NODE_ENV=test` nunca se ejecuta.
- **Subida a S3 comprimida, con manifiesto.** El dump se sube gzipped como `daily/kuadrat-pro-YYYY-MM-DD.sql.gz` al bucket `140d-db-backups-pro`, acompañado de un `.meta.json` con conteo de filas por tabla, tamaño, duración y SHA-256, para poder verificar una restauración sin abrir el dump.
- **Retención por reglas de ciclo de vida de S3, no por borrado desde la aplicación.** Los días 4 de cada mes el mismo dump se sube **además** a `monthly/kuadrat-pro-YYYY-MM-DD.sql.gz`. Una regla de ciclo de vida caduca `daily/` a los 15 días y `monthly/` no caduca nunca. Consecuencia deliberada: el proceso de backup **nunca borra nada** y su política IAM no necesita `s3:DeleteObject`, de modo que ningún fallo del código puede vaciar el bucket de copias.
- **Nuevo bucket y nueva configuración AWS.** `AWS_S3_BACKUP_BUCKET` (y `AWS_S3_BACKUP_REGION`, opcional) se añaden a `api/config/env.js`; el bucket de backups es **distinto** del de medios (`AWS_S3_BUCKET`) para poder darle una política, un ciclo de vida y un versionado propios. `api/services/s3Service.js` gana una función de subida a bucket explícito.
- **Disparo manual a demanda.** `npm run backup:now` (envoltorio delgado sobre la misma función, ejecutable con `docker compose exec api npm run backup:now`) permite estrenar el sistema de forma observada —sin staging donde ensayar, la primera ejecución no debe ser a las 04:00 sin nadie mirando— y deja una herramienta permanente para hacer copia antes de un despliegue arriesgado.
- **Alertas de fallo.** Un backup fallido se registra con `logger.error`, se envía a Sentry y genera un correo a `BUSINESS_EMAIL` mediante `emailService` (silenciado automáticamente bajo el transporte `noop` de los tests).
- **Guía operativa completa en español** (`docs/backups-s3.md`): creación del bucket, bloqueo de acceso público, cifrado, versionado, reglas de ciclo de vida, el bloque nuevo de la política IAM del rol de EC2, variables de entorno, verificación de la primera copia y procedimiento de restauración de extremo a extremo.

## Capabilities

### New Capabilities

- `database-backups`: generación programada del dump SQL de la base de datos Turso, compresión y subida al bucket S3 de copias, copia mensual del día 4, manifiesto de verificación, disparo manual, activación por configuración y alertas ante fallo.

### Modified Capabilities

<!-- Ninguna. `s3-media-storage` conserva sus requisitos: el bucket de medios, sus keys y su fallback a disco no cambian; s3Service solo gana una función adicional que las rutas de medios no usan. -->

## Impact

- **Capa afectada:** solo backend. Ningún cambio en `client/`.
- **Esquema de base de datos:** ninguno. El proceso es de solo lectura sobre la BD (`SELECT` sobre `sqlite_master` y sobre cada tabla); no escribe una sola fila.
- **Ficheros nuevos:** `api/services/dbDumpService.js`, `api/services/dbBackupService.js`, `api/scheduler/backupScheduler.js`, `api/scripts/runBackup.js`, `api/tests/dbDump.test.js`, `api/tests/dbBackup.test.js`, `docs/backups-s3.md`.
- **Ficheros modificados:** `api/config/env.js` (bloque `backup`), `api/services/s3Service.js` (subida a bucket explícito), `api/services/emailService.js` (correo de fallo), `api/server.js` (arranque del scheduler), `api/package.json` (script `backup:now`), `api/.env.example`, `api/.env.test` (`DB_BACKUP_ENABLED=true` a propósito, para que la aserción de aislamiento sea significativa), `CLAUDE.md` y `AGENTS.md` (sección de backups).
- **Dependencias nuevas:** ninguna. `@aws-sdk/client-s3` y `node-cron` ya están instalados; la compresión usa `zlib` del núcleo de Node.
- **Infraestructura:** un bucket S3 nuevo, `140d-db-backups-pro`, en `eu-south-2` (la región del bucket de medios). **Ningún secreto nuevo:** `s3Service.js` instancia `new S3Client({ region })` sin credenciales explícitas y la instancia EC2 las aporta por su rol IAM (documentado en el cambio archivado `2026-04-07-migrate-images-to-s3`). El único cambio en AWS es añadir a la política existente de ese rol un tercer bloque con **solo `s3:PutObject`** sobre `arn:aws:s3:::140d-db-backups-pro/*` — sin `GetObject` ni `DeleteObject`, a diferencia del bloque de medios: la api no podrá leer ni borrar una copia una vez subida.
- **Coste y recursos:** dump completo estimado en 6–10 MB de texto (≈1–2 MB gzipped, dominado por las 37.867 filas de `postal_codes`); con 15 copias diarias más las mensuales el almacenamiento es de céntimos al mes. El contenedor de api tiene 1 GB de memoria, y aun así el dump se genera por lotes y se comprime en streaming.

## Non-goals

- **No** se hacen backups automáticos en staging: se mantiene el respaldo manual del operador. El código no lo impide (se activa por configuración, no por `NODE_ENV`), pero no se crea bucket ni credenciales para ese entorno.
- **No** se automatiza la restauración: sigue siendo un procedimiento manual y deliberado, documentado paso a paso.
- **No** se hace backup de los ficheros subidos (`uploads/` / bucket de medios); solo de la base de datos.
- **No** se ejecuta backup en local ni en tests.
- **No** se replican los backups entre regiones ni se activa Object Lock/WORM (se documenta como mejora futura).
- **No** se toca el bucket de medios ni el comportamiento de `s3-media-storage`.
- **No** se añade interfaz de administración para consultar o lanzar backups (el disparo manual es un script de consola, no un endpoint).
