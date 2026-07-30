# Design: turso-s3-backups

## Context

La base de datos de producción vive en Turso Cloud y se accede desde la api con `@libsql/client` (`api/config/database.js` exporta `db`). El único respaldo propio hoy es manual: `turso db shell <db> .dump > fichero.sql` desde el portátil del operador (`docs/turso-doc.md`).

**El alcance es únicamente producción.** Staging seguirá respaldándose a mano cuando el operador lo considere: su información no es crítica y no justifica infraestructura. Esta restricción no es un recorte de última hora, sino la que hace el cambio pequeño — elimina un segundo bucket, un segundo juego de permisos y, sobre todo, un segundo mecanismo de credenciales (staging corre autoalojado en una red doméstica, sin IMDS y hoy sin ninguna credencial AWS: allí S3 no se usa para nada).

Tres hechos del repositorio condicionan el diseño y evitan trabajo:

1. **`@aws-sdk/client-s3` ya es dependencia** y `api/services/s3Service.js` sube medios al bucket `140d-media-pro-243303976956-eu-south-2-an` con `S3Client` sin credenciales explícitas. Subir a S3 no es una integración nueva, y el mecanismo de credenciales ya está resuelto (decisión 9).
2. **Ya hay cinco schedulers `node-cron`** (`auction`, `reservation`, `confirmation`, `shipmentRetry`, `eventCredit`) arrancados desde `api/server.js`. `api/app.js` está libre de efectos secundarios precisamente para que los tests no arranquen schedulers; el backup debe respetar esa frontera.
3. **El entorno de test ya apunta a un fichero SQLite local** (`file:./.tmp/test.db`) a través del mismo cliente, con el mismo esquema creado por `initializeDatabase()`. Eso permite probar el generador de dumps de verdad — generar, reimportar y comparar — sin tocar ninguna base remota.

Restricciones: el contenedor de api tiene 1 GB de límite de memoria en producción; la tabla `postal_codes` tiene ≈37.867 filas; el esquema son ~40 tablas más de 30 índices, con contadores AUTOINCREMENT relevantes (`orders` empieza en 1000).

## Goals / Non-Goals

**Goals:**

- Copia diaria automática de la BD de producción, fuera de Turso, en un bucket S3 bajo nuestro control.
- Fichero restaurable con el procedimiento manual que el operador ya conoce y tiene documentado.
- Retención de 15 días de copias diarias más una copia mensual (día 4) sin caducidad.
- Que un fallo sea ruidoso (log + Sentry + correo) y nunca tumbe la api.
- Que el proceso sea imposible de disparar desde local o desde los tests.

**Non-Goals:**

- Backups automáticos en staging (siguen siendo manuales y a criterio del operador), restauración automatizada, backup de imágenes/`uploads/`, replicación entre regiones, Object Lock, interfaz de administración. (Ver "Non-goals" del proposal.)

## Decisions

### 1. El dump se genera en Node, no con la CLI de Turso

**Decisión:** un servicio nuevo `api/services/dbDumpService.js` reproduce el `.dump` de SQLite usando el cliente `@libsql/client` ya conectado.

`turso db shell <db> .dump` no es más que el `.dump` de SQLite: leer `sqlite_master`, emitir los `CREATE`, emitir un `INSERT` por fila y cerrar con los índices. Es reproducible en ~150 líneas de JavaScript y elimina de un plumazo tres problemas: un binario Go dentro de una imagen `node:20-alpine` (que además exige actualizarlo a mano y confiar en un script de instalación remoto en el build), un segundo mecanismo de autenticación (`TURSO_API_TOKEN` de plataforma, distinto del `TURSO_AUTH_TOKEN` de base de datos) y un `child_process` con redirección de salida dentro de un contenedor que corre como usuario `node` sin escritura fuera de `/app`.

Formato emitido (orden importante):

```sql
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE …            -- todas las tablas de usuario
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('orders',1042);
INSERT INTO "art" VALUES(…);   -- datos, tabla a tabla
CREATE INDEX …            -- índices, vistas y triggers al final
COMMIT;
```

**`sqlite_sequence` es el detalle que se olvida y duele.** Es una tabla interna (`sqlite_%`), así que el filtro obvio la excluiría; si no se vuelca, tras una restauración el siguiente pedido reutilizaría IDs ya emitidos en facturas. Se trata como caso especial: no se emite su `CREATE TABLE` (SQLite la crea sola con la primera tabla AUTOINCREMENT), pero sí `DELETE FROM sqlite_sequence;` y sus filas, exactamente como hace `.dump`.

Los índices van después de los `INSERT` para que la restauración no reindexe fila a fila. El `sql` de `sqlite_master` se emite **literal**, sin reescribir: es la definición real vigente en el servidor, que puede diferir del texto de `api/config/database.js` (por ejemplo la tabla `withdrawals` recreada por la migración `withdrawals_new`).

*Alternativas descartadas:* (a) CLI de Turso en la imagen — peso y dependencia externa, ya explicado; (b) réplica embebida de libsql (`syncUrl`) para obtener un `.db` binario y subirlo — produce un backup restaurable con `turso db create --from-file`, pero introduce un modo de cliente que la aplicación no usa hoy, requiere disco local en el contenedor y rompe la simetría con el procedimiento de restauración ya documentado; (c) exportar desde la interfaz web de Turso — no automatizable.

### 2. Fidelidad de los literales y de los enteros

El serializador cubre `null` → `NULL`, string → comillas simples con `''` para las internas, number/bigint → literal sin comillas, `Uint8Array`/`ArrayBuffer` → `X'<hex>'`, boolean → `1`/`0`. No se escapan saltos de línea ni caracteres de control dentro de las cadenas: SQLite admite literales multilínea y así el valor vuelve idéntico byte a byte (importa para descripciones con HTML de las obras).

`@libsql/client` usa `intMode: 'number'` por defecto, que **lanza** si un entero no cabe en un `double` seguro. En este esquema no hay columnas con enteros de 64 bits reales (los IDs son autoincrementales pequeños y las fechas son texto ISO), así que se mantiene el cliente compartido `db` en lugar de abrir un segundo cliente con `intMode: 'bigint'` — un cliente extra creado fuera de `api/config/database.js` esquivaría además la guardia anti-remota de `NODE_ENV=test`. El serializador acepta `bigint` de todas formas, por si el modo cambia en el futuro. Se registra como riesgo.

### 3. Lectura por lotes y compresión en streaming

Cada tabla se lee con `SELECT * FROM "t" WHERE rowid > ? ORDER BY rowid LIMIT 1000` avanzando por el último `rowid`. Motivo doble: no materializar 37.867 filas de `postal_codes` en un array y no chocar con los límites de tamaño de respuesta de Turso.

El generador es un `async function*` que emite trozos de texto SQL; el consumidor los escribe en un `zlib.createGzip()` y acumula **solo la salida comprimida** en un array de buffers. Con ~1–2 MB gzipped el `Buffer.concat` final es trivial para un contenedor de 1 GB, y permite usar `PutObjectCommand` con un `Buffer` (que conoce su longitud) sin añadir `@aws-sdk/lib-storage` ni escribir ficheros temporales en un contenedor que corre como usuario `node`.

El SHA-256 se calcula sobre ese buffer final, que es exactamente lo que se sube: el operador puede verificarlo con `sha256sum` tras descargar.

**Coherencia de la instantánea:** un dump repartido en cientos de peticiones HTTP no es puntual. Se intenta `db.transaction('read')` para leer todo bajo una instantánea coherente y evitar un backup con integridad referencial rota (p. ej. un `orders` sin sus `art_order_items`). Turso limita la duración de las transacciones interactivas, así que si la transacción falla o expira se repite la lectura sin ella y se registra `logger.warn`: a las 04:00 el tráfico de escritura es prácticamente nulo y un backup ligeramente inconsistente es infinitamente mejor que ninguno.

### 4. Retención con ciclo de vida de S3 y dos prefijos, no con borrado desde la api

El requisito ("15 días, sin borrar la copia del día 4") se implementa **separando prefijos** en vez de programando una regla de exclusión:

- todos los días → `daily/kuadrat-pro-YYYY-MM-DD.sql.gz`
- si el día del mes es 4 → **además** `monthly/kuadrat-pro-YYYY-MM-DD.sql.gz` (mismo buffer, segundo `PutObject`; el dump se genera una sola vez)
- regla de ciclo de vida: expiración a 15 días con prefijo `daily/`; `monthly/` sin regla

La propiedad que compra este diseño: **el backup nunca ejecuta un `Delete`** y su política IAM no concede `s3:DeleteObject` sobre el bucket de copias. Un bug en la lógica de fechas no puede vaciar el histórico — que es justo el fallo que convertiría el sistema de backup en el causante de la pérdida de datos. Una regla de ciclo de vida es además declarativa, la aplica AWS aunque el contenedor esté caído, y es auditable desde la consola.

*Alternativa descartada:* `ListObjectsV2` + `DeleteObjects` desde el scheduler saltándose las keys del día 4. Cabe en el repo y es testeable, pero exige permisos de borrado sobre el bucket de copias y hace que la retención dependa de que el proceso se ejecute correctamente.

El nombre lleva la fecha completa también en `monthly/` (`…-2026-09-04`) en vez de solo el mes: así el operador ve de un vistazo a qué corte corresponde y una reejecución del mismo día sobrescribe la misma key en lugar de duplicar.

### 5. Bucket de copias separado del bucket de medios

`AWS_S3_BACKUP_BUCKET` es un bucket distinto de `AWS_S3_BUCKET`: `140d-db-backups-pro`, en `eu-south-2` (la misma región del bucket de medios, ya habilitada en la cuenta — `eu-south-2` es una región opt-in). Los medios son públicos vía CloudFront y se escriben y borran constantemente; las copias son secretas, inmutables y con retención propia. Mezclarlos obligaría a una política única que concediera borrado sobre los backups —la del bucket de medios ya incluye `s3:DeleteObject`— y complicaría el ciclo de vida. Buckets separados permiten además versionado y bloqueo de acceso público específicos.

`api/services/s3Service.js` gana `uploadObject({ bucket, region, key, body, contentType })` con una caché de `S3Client` por región (`Map`), y `uploadFile()` pasa a delegar en ella con el bucket de medios. Los requisitos de `s3-media-storage` no cambian.

`ContentType: 'application/gzip'` y **sin** `ContentEncoding: 'gzip'`: el objeto *es* un fichero comprimido, no un fichero de texto transferido comprimido; marcarlo como encoding haría que algunos clientes lo descomprimieran al vuelo y el `.sql.gz` descargado no cuadrara con el SHA-256 del manifiesto.

### 6. Hora, zona horaria y etiqueta del fichero

`cron.schedule('0 4 * * *', fn, { timezone: 'Europe/Madrid' })`. La instancia corre en UTC; sin la zona explícita el backup se ejecutaría a las 05:00 o 06:00 locales según la estación. La **misma** zona se usa para calcular la fecha de la key y el día del mes (vía `Intl.DateTimeFormat` con `timeZone: 'Europe/Madrid'`), para que "el dump del día 4" y "la ejecución del día 4" no puedan discrepar en la franja de medianoche.

La etiqueta del fichero se deriva de `NODE_ENV` (`production` → `pro`, cualquier otro → el propio valor), sin variable de override: con un solo entorno haciendo backups, un mando para forzarla sería configuración sin caso de uso. Se conserva en el nombre porque un `.sql.gz` descargado se identifica solo, sin depender de en qué carpeta acabó.

**Anti-solapamiento:** un flag `running` a nivel de módulo hace que una ejecución que llegue con la anterior en curso se omita con un `logger.warn`. Con un dump de segundos es improbable, pero dos dumps concurrentes duplicarían memoria y peticiones a Turso.

### 7. Activación explícita, con el test bloqueado por construcción

Nuevo bloque en `api/config/env.js`:

```js
backup: {
  enabled: optionalBool('DB_BACKUP_ENABLED', false) && config.nodeEnv !== 'test',
  bucket: optional('AWS_S3_BACKUP_BUCKET', ''),
  region: optional('AWS_S3_BACKUP_REGION', '') || <región de medios>,
  cron: optional('DB_BACKUP_CRON', '0 4 * * *'),
}
```

El código **no** comprueba `NODE_ENV === 'production'`: se activa por configuración presente, igual que el flag `config.useS3` de los medios (el cambio archivado `2026-04-07-migrate-images-to-s3` descartó explícitamente atar aquello a `NODE_ENV` por rígido). Que hoy solo produzca copias producción es una consecuencia de qué entorno tiene las variables puestas, no una condición grabada en el código; el día que staging las necesite bastará con crear su bucket y rellenarlas.

Tres capas, deliberadamente redundantes, para que el backup no pueda ejecutarse donde no debe: por defecto desactivado (local no hace nada aunque tuviera credenciales AWS), forzado a desactivado bajo `NODE_ENV=test`, y arrancado únicamente desde `api/server.js` — que los tests nunca importan. Si `enabled` es cierto pero falta el bucket, se registra `logger.error` y no se programa nada: una configuración a medias debe ser visible, no silenciosa, pero tampoco debe impedir que arranque la tienda.

### 8. Alerta de fallo

`logger.error` estructurado + `Sentry.captureException` + `sendBackupFailureEmail()` a `config.business.email`, siguiendo el patrón de `sendStaleArrivedAlertEmail` / `sendShipmentFailedAdminEmail` en `api/services/emailService.js`. Bajo test el transporte `noop` lo deja en el outbox en memoria, así que la alerta es testeable y jamás sale del proceso. Todo el cuerpo del job va dentro de un `try/catch`: una promesa rechazada dentro de un callback de `node-cron` no se propaga, pero un fallo silencioso en un sistema de backups es el peor modo de fallo posible.

### 9. Credenciales AWS: el rol IAM de la instancia EC2, sin secretos nuevos

`api/services/s3Service.js:12` instancia `new S3Client({ region })` **sin** `credentials`, de modo que el SDK recorre su cadena por defecto —variables de entorno → fichero `~/.aws` → IMDS— y en producción la satisface por el último eslabón: **el rol IAM de la instancia EC2**. Confirmado por cuatro evidencias convergentes: `api/config/env.js` no declara ninguna variable de credencial AWS; el `api/.env` de producción solo contiene `AWS_S3_BUCKET`, `AWS_S3_REGION` y `CDN_BASE_URL`; `docker-compose.prod.yml` no inyecta credenciales ni monta `~/.aws` (el servicio `api` recibe solo `NODE_ENV`, `PORT` y su `env_file`); y el cambio archivado `2026-04-07-migrate-images-to-s3` lo declara literalmente — *"IAM Role en EC2 con permisos S3 (no requiere access keys en el servidor)"*.

Que las subidas de imágenes funcionen hoy demuestra además que el contenedor alcanza IMDS: el bridge de Docker añade un salto, así que el límite de saltos de IMDSv2 de la instancia ya es ≥ 2. No hay que tocar nada de red.

**El único cambio en AWS es un tercer bloque en la política existente.** La política actual del rol es:

```json
{ "Sid": "S3ImageUploadAndServe", "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"],
  "Resource": ["arn:aws:s3:::140d-media-pro-243303976956-eu-south-2-an/*"] },
{ "Sid": "S3ListBucket", "Effect": "Allow",
  "Action": "s3:ListBucket",
  "Resource": ["arn:aws:s3:::140d-media-pro-243303976956-eu-south-2-an"] }
```

Se le añade, sin tocar los dos bloques anteriores:

```json
{ "Sid": "S3DbBackupPutOnly", "Effect": "Allow",
  "Action": "s3:PutObject",
  "Resource": ["arn:aws:s3:::140d-db-backups-pro/*"] }
```

Nótese el contraste deliberado: el bloque de medios concede `PutObject`, `DeleteObject` y `GetObject`; el de backups **solo `PutObject`**. La api no puede leer ni borrar una copia una vez subida. Los dumps contienen datos personales de compradores y sellers (nombres, direcciones, emails, referencias de pago), así que ni siquiera el proceso que los genera debe poder recuperarlos: quien comprometiera el contenedor podría escribir objetos nuevos, pero no exfiltrar el histórico ni destruirlo. Es la misma idea de la decisión 4, aplicada en la capa de permisos.

No se crean usuarios IAM ni claves de acceso, y `api/.env` no gana ningún secreto: `AWS_S3_BACKUP_BUCKET` es un nombre.

### 10. Disparo manual para el primer ensayo (y para backups a demanda)

Sin backups en staging desaparece el entorno donde ensayar antes de tocar producción: la primera ejecución real del código sería directamente contra la base de producción, a las 04:00, sin nadie mirando. Para no depender de eso, `runBackup()` se expone además como script ejecutable (`npm run backup:now` en `api/package.json`, envoltorio delgado sobre la misma función) que se lanza con `docker compose exec api npm run backup:now`.

Esto convierte el estreno en un acto deliberado y observado —se ejecuta, se leen los logs, se descarga el objeto y se ensaya la restauración— en lugar de una sorpresa nocturna. Y deja además una herramienta útil de forma permanente: una copia a demanda antes de un despliegue arriesgado o de una migración de esquema. La operación es de solo lectura sobre la base y de solo escritura sobre S3, así que ejecutarla a mano en producción es seguro; lo peor que puede hacer es sobrescribir la copia del día con otra copia del mismo día.

## Risks / Trade-offs

- **El dump generado a mano diverge del `.dump` de SQLite en algún caso no previsto** → los tests reimportan el dump generado sobre una base limpia y comparan conteos por tabla y filas concretas; y antes de dejarlo programado se ejecuta a mano en producción (decisión 10) para descargar el fichero y ensayar una restauración real sobre una BD auxiliar de Turso.
- **Ya no hay entorno de ensayo previo a producción** (staging queda fuera del alcance) → cubierto por el disparo manual observado y por el hecho de que el proceso es de solo lectura sobre la base: un dump defectuoso produce un fichero malo en S3, nunca un daño en la BD. El ensayo de restauración se hace siempre sobre una base auxiliar, jamás sobre la de producción.
- **Backup no puntual si la transacción de lectura no aguanta** → se registra `logger.warn` con el motivo y se ejecuta a las 04:00, con tráfico de escritura mínimo. Turso conserva además su propio PITR como segunda red.
- **Un entero mayor que 2^53 haría fallar la lectura** con `intMode: 'number'` → hoy no existe ninguna columna así; si apareciera, el backup fallaría ruidosamente (correo + Sentry) en lugar de generar datos corruptos, y la solución sería un cliente dedicado con `intMode: 'bigint'`.
- **La retención depende de una configuración manual en AWS**: si nadie crea la regla de ciclo de vida, las copias diarias se acumulan indefinidamente → solo tiene impacto en coste (céntimos), nunca en pérdida de datos; la guía incluye la verificación de la regla y su comprobación forma parte de las tareas de despliegue.
- **El dump contiene datos personales de compradores y sellers** → bucket con acceso público bloqueado, cifrado en reposo, y permiso de la api limitado a `s3:PutObject` (sin `GetObject` ni `DeleteObject`, a diferencia del bucket de medios). Acceso de lectura restringido a administradores. Se documenta en la guía.
- **`postal_codes` infla el dump** (≈90 % del volumen, contenido estático regenerable desde `api/migrations/ES.csv`) → se acepta a cambio de que el dump sea una restauración completa de un solo paso; gzipped son ~1–2 MB y excluirla introduciría un backup que no restaura la base tal cual estaba.
- **El rol IAM se desasocia o pierde el permiso** → los backups fallarían con excepción de credenciales del SDK, que aquí es ruidosa por diseño (log + Sentry + correo), a diferencia del riesgo equivalente ya asumido para los medios.
- **Si el contenedor está caído a las 04:00 no hay copia ni alerta**, porque el aviso vive dentro del proceso que no se ejecutó → mitigado por `restart: unless-stopped` en `docker-compose.prod.yml` y por la comprobación periódica de que existe el objeto del día en `daily/`, que la guía incorpora al procedimiento operativo. Un aviso automático por ausencia (regla de CloudWatch o *dead man's switch* externo) queda anotado como mejora futura.
- **Staging sin copia automática** → decisión explícita del propietario: la información no es crítica y el respaldo manual existente basta. El código no lo impide (decisión 7): activarlo allí sería crear su bucket y poner las variables, con la salvedad de que esa máquina no tiene credenciales AWS y necesitaría un usuario IAM.

## Migration Plan

1. Crear el bucket `140d-db-backups-pro` en `eu-south-2` con la guía (`docs/backups-s3.md`): bloqueo de acceso público, cifrado en reposo, versionado y las reglas de ciclo de vida.
2. Añadir el bloque `S3DbBackupPutOnly` (solo `s3:PutObject`) a la política del rol IAM que ya tiene la instancia EC2, sin tocar los bloques de medios existentes.
3. Desplegar el código con `DB_BACKUP_ENABLED=false`: sin cambios de comportamiento.
4. Poner `AWS_S3_BACKUP_BUCKET` en `api/.env`, dejar `DB_BACKUP_ENABLED=false` todavía, y lanzar un backup manual observado con `docker compose exec api npm run backup:now`.
5. Verificar esa primera copia: existencia del objeto y del manifiesto, `sha256sum` coincidente tras descargar, descompresión correcta y **restauración de prueba sobre una BD auxiliar de Turso** siguiendo `docs/turso-doc.md` (`turso db create backup-test`, importar el dump, comparar conteos y comprobar que `orders` continúa la numeración).
6. Solo entonces, poner `DB_BACKUP_ENABLED=true` y reiniciar. Comprobar al día siguiente el objeto de las 04:00, el día 4 la copia mensual y a los 15 días la caducidad de `daily/`.
7. **Rollback:** poner `DB_BACKUP_ENABLED=false` y reiniciar el contenedor. No hay estado que revertir — el proceso no escribe en la base de datos ni borra en S3.

## Open Questions

- ~~**¿Cómo obtiene la api sus credenciales AWS?**~~ **Resuelto:** rol IAM de la instancia EC2 vía IMDS, sin claves en el `.env`. Solo hay que añadir un bloque `PutObject` a la política existente (decisión 9).
- ~~**Nombre y región del bucket.**~~ **Resuelto:** `140d-db-backups-pro` en `eu-south-2`. Al ser un nombre corto y globalmente único en todo AWS, si la consola respondiera `BucketAlreadyExists` habría que añadir un sufijo (p. ej. `-243303976956`) y ajustar `AWS_S3_BACKUP_BUCKET`; el código no asume nada del nombre.
- ~~**¿Qué hacemos con staging?**~~ **Resuelto:** fuera del alcance; respaldo manual a criterio del operador.
- **¿Interesa a medio plazo replicar el prefijo `monthly/` a otra región o cuenta?** Fuera de alcance aquí; sería la defensa frente a la pérdida de la propia cuenta de AWS.
