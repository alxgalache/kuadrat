# Tasks: turso-s3-backups

## 1. Configuración de entorno

- [x] 1.1 Añadir el bloque `backup` a `api/config/env.js`: `enabled` (`optionalBool('DB_BACKUP_ENABLED', false)`, forzado a `false` cuando `NODE_ENV=test`), `bucket` (`AWS_S3_BACKUP_BUCKET`, por defecto `''`), `region` (`AWS_S3_BACKUP_REGION`, con caída a `config.aws.s3Region`) y `cron` (`DB_BACKUP_CRON`, por defecto `'0 4 * * *'`). Sin comprobación de `NODE_ENV === 'production'`: la activación es por configuración presente, como `config.useS3`
- [x] 1.2 Documentar las cuatro variables en `api/.env.example`, en un bloque nuevo junto al de AWS, dejando claro que el bucket de copias es distinto del de medios, que no hacen falta credenciales AWS (las aporta el rol de la instancia EC2) y que en local y staging se queda desactivado

## 2. Generador de dumps (`api/services/dbDumpService.js`)

- [x] 2.1 Crear el módulo con `serializeValue(v)`: `null` → `NULL`, string → comillas simples con `''` internas, number/bigint → literal, `Uint8Array`/`ArrayBuffer` → `X'<hex>'`, boolean → `1`/`0`, y error explícito ante cualquier otro tipo
- [x] 2.2 Implementar la lectura de `sqlite_master` (`SELECT type, name, tbl_name, sql ... WHERE sql IS NOT NULL`), separando tablas de usuario (excluyendo `sqlite_%`) de índices, vistas y triggers, y conservando el `sql` original sin reescribirlo
- [x] 2.3 Implementar el volcado paginado de una tabla: `SELECT * FROM "t" WHERE rowid > ? ORDER BY rowid LIMIT 1000` avanzando por el último `rowid`, emitiendo `INSERT INTO "t" VALUES(...);` por fila y devolviendo el conteo de filas
- [x] 2.4 Implementar `generateDump()` como `async function*` que emite el script completo en el orden del diseño: `PRAGMA foreign_keys=OFF;`, `BEGIN TRANSACTION;`, `CREATE TABLE`s, bloque `sqlite_sequence`, `INSERT`s, índices/vistas/triggers, `COMMIT;`
- [x] 2.5 Tratar `sqlite_sequence` como caso especial: no emitir su `CREATE TABLE`, sí `DELETE FROM sqlite_sequence;` y un `INSERT` por fila, para preservar los contadores AUTOINCREMENT (pedidos desde 1000) — **alto riesgo: si se omite, una restauración reutiliza IDs de pedido ya facturados**
- [x] 2.6 Intentar la lectura dentro de `db.transaction('read')` y, si falla o expira, repetirla sin transacción registrando `logger.warn` con el motivo y marcando el dump como no puntual en el manifiesto
- [x] 2.7 Acumular durante la generación el conteo de filas por tabla y devolverlo junto al texto para alimentar el manifiesto

## 3. Servicio de backup (`api/services/dbBackupService.js`)

- [x] 3.1 Implementar `resolveEnvLabel()` (`production` → `pro`, otro → el propio `NODE_ENV`) y `resolveMadridDate()` (`Intl.DateTimeFormat` con `timeZone: 'Europe/Madrid'`) devolviendo `YYYY-MM-DD` y el día del mes
- [x] 3.2 Canalizar el generador de `dbDumpService` a través de `zlib.createGzip()`, acumular solo los buffers comprimidos y producir el `Buffer` final más su SHA-256 (`crypto`), sin escribir ficheros temporales
- [x] 3.3 Construir el manifiesto JSON: entorno, timestamp UTC de inicio, duración en ms, número de tablas, filas por tabla, bytes antes y después de comprimir, SHA-256 y bandera de instantánea coherente
- [x] 3.4 Implementar `runBackup()`: subir `daily/kuadrat-<env>-YYYY-MM-DD.sql.gz` y su `.meta.json`; si el día del mes es 4, subir además el **mismo** buffer como `monthly/kuadrat-<env>-YYYY-MM-DD.sql.gz` y su manifiesto (sin regenerar el dump)
- [x] 3.5 Registrar `logger.info` en caso de éxito con key, tamaño comprimido, número de tablas, total de filas y duración
- [x] 3.6 Verificar que el módulo no contiene ninguna llamada de borrado a S3 (`DeleteObjectCommand` / `DeleteObjectsCommand`): la retención es responsabilidad exclusiva del ciclo de vida del bucket

## 4. Subida a S3 y alerta por correo

- [x] 4.1 Añadir `uploadObject({ bucket, region, key, body, contentType })` a `api/services/s3Service.js` con caché de `S3Client` por región (`Map`), y hacer que `uploadFile()` delegue en ella con el bucket de medios — **alto riesgo: infraestructura compartida, no debe alterar el comportamiento de `s3-media-storage`**
- [x] 4.2 Subir el dump con `ContentType: 'application/gzip'` y **sin** `ContentEncoding`, para que el fichero descargado coincida con el SHA-256 del manifiesto
- [x] 4.3 Añadir `sendBackupFailureEmail({ env, dateKey, key, error })` a `api/services/emailService.js` dirigido a `config.business.email`, siguiendo el patrón de `sendStaleArrivedAlertEmail`, y exportarlo
- [x] 4.4 Envolver `runBackup()` en un `try/catch` que registre `logger.error`, envíe la excepción a Sentry y dispare el correo de alerta, garantizando que ningún fallo se propague fuera del callback de cron

## 5. Scheduler, disparo manual y arranque

- [x] 5.1 Crear `api/scheduler/backupScheduler.js` siguiendo el patrón de `api/scheduler/reservationScheduler.js`: `cron.schedule(config.backup.cron, fn, { timezone: 'Europe/Madrid' })` y log informativo de arranque con bucket y entorno
- [x] 5.2 No programar nada cuando `config.backup.enabled` es falso (log `info`) ni cuando está habilitado sin bucket (log `error`), sin impedir en ningún caso el arranque del servidor
- [x] 5.3 Añadir un flag `running` a nivel de módulo que omita con `logger.warn` una ejecución que llegue con otra en curso
- [x] 5.4 Arrancar el scheduler desde `api/server.js` junto a los cinco existentes — **alto riesgo: `api/app.js` debe seguir libre de efectos secundarios para que los tests nunca disparen un backup**
- [x] 5.5 Crear `api/scripts/runBackup.js` y el script `backup:now` en `api/package.json`: envoltorio delgado sobre `runBackup()` que exige bucket configurado, ignora `DB_BACKUP_ENABLED` (es una acción deliberada), imprime el resultado y sale con código distinto de cero si falla

## 6. Tests

- [x] 6.1 Crear `api/tests/dbDump.test.js` que genere un dump del fichero SQLite de test (ya poblado por `tests/setup/seed.js`) y compruebe estructura: `PRAGMA`/`BEGIN`/`COMMIT`, `CREATE TABLE` antes de los `INSERT` e índices después del último `INSERT`
- [x] 6.2 Test de ida y vuelta: reimportar el dump generado en una base SQLite limpia mediante el mismo `@libsql/client` y comparar el conteo de filas de cada tabla con el original
- [x] 6.3 Test de `sqlite_sequence`: verificar que el dump lo incluye y que, tras reimportarlo, una inserción en `orders` continúa la numeración en lugar de reiniciarla
- [x] 6.4 Tests del serializador: texto con apóstrofos, saltos de línea y HTML; `NULL`; entero; decimal; blob — cada valor debe volver idéntico tras el ciclo de ida y vuelta
- [x] 6.5 Test de nombres de key y copia mensual con fecha simulada: día 4 produce dos subidas y cualquier otro día solo una, con el S3 mockeado (ninguna petición real a AWS)
- [x] 6.6 Test de fallo: si la subida rechaza, se registra el error y el correo de alerta aparece en el outbox (`emailService.__getOutbox()`), sin que la excepción escape
- [x] 6.7 Test de aislamiento: con `NODE_ENV=test`, `config.backup.enabled` es `false` aunque `DB_BACKUP_ENABLED=true`, y el scheduler no programa nada

## 7. Documentación

- [x] 7.1 Escribir `docs/backups-s3.md` (en español): creación del bucket `140d-db-backups-pro` en `eu-south-2`, bloqueo de acceso público, cifrado en reposo y versionado, con nota sobre qué hacer si el nombre corto ya está tomado globalmente
- [x] 7.2 Documentar las reglas de ciclo de vida que implementan la retención: expiración a 15 días con prefijo `daily/`, sin regla para `monthly/`, y cómo verificarlas en la consola
- [x] 7.3 Documentar el bloque JSON exacto a añadir a la política del rol IAM de la instancia EC2 (`S3DbBackupPutOnly`, **solo `s3:PutObject`** sobre `arn:aws:s3:::140d-db-backups-pro/*`), explicando por qué no lleva `GetObject` ni `DeleteObject` al contrario que el bloque de medios, y que no se crean usuarios ni claves
- [x] 7.4 Documentar las variables de entorno, el disparo manual (`docker compose exec api npm run backup:now`), la verificación de la primera copia (existencia del objeto, manifiesto, descarga, `sha256sum`, descompresión) y el procedimiento de restauración completo enlazando con `docs/turso-doc.md`
- [x] 7.5 Documentar el punto ciego: un contenedor caído a las 04:00 no produce copia **ni alerta**, por lo que comprobar periódicamente la presencia del objeto del día en `daily/` forma parte del procedimiento operativo
- [x] 7.6 Dejar constancia en la guía de que staging queda fuera del alcance (respaldo manual del operador) y de qué haría falta si algún día se quisiera activar allí: bucket propio y credenciales AWS, que esa máquina no tiene por estar autoalojada sin IMDS
- [x] 7.7 Añadir una sección "Backups de base de datos" a `CLAUDE.md` y `AGENTS.md` con el resumen operativo: solo producción, dump en Node sin CLI de Turso, prefijos `daily/`/`monthly/`, retención por ciclo de vida, permiso `PutObject` únicamente y la regla de que el proceso nunca borra

## 8. Despliegue

- [ ] 8.1 Crear el bucket y aplicar bloqueo de acceso público, cifrado, versionado y reglas de ciclo de vida según la guía
- [ ] 8.2 Añadir el bloque `S3DbBackupPutOnly` a la política del rol IAM de la instancia, sin tocar los bloques `S3ImageUploadAndServe` ni `S3ListBucket` existentes
- [ ] 8.3 Desplegar con `DB_BACKUP_ENABLED=false`, configurar `AWS_S3_BACKUP_BUCKET` y lanzar un backup manual observado con `docker compose exec api npm run backup:now`
- [ ] 8.4 Verificar esa primera copia de extremo a extremo: objeto y manifiesto presentes, `sha256sum` coincidente, descompresión correcta y **restauración de prueba sobre una BD auxiliar de Turso** (`turso db create backup-test`), comparando conteos y comprobando que `orders` continúa la numeración
- [ ] 8.5 Solo tras la verificación, poner `DB_BACKUP_ENABLED=true` y reiniciar; comprobar el objeto de las 04:00 al día siguiente, la copia mensual el día 4 y la caducidad de `daily/` a los 15 días
