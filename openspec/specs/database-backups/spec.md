# database-backups Specification

## Purpose
Copia de seguridad diaria de la base de datos Turso de producción: dump SQL completo generado con el cliente `@libsql/client` (sin CLI de Turso ni binarios externos), comprimido y subido a un bucket S3 dedicado, con copia mensual el día 4, retención delegada en el ciclo de vida de S3 y alerta por log, Sentry y correo ante cualquier fallo.

## Requirements

### Requirement: Generación del dump SQL desde el cliente libsql

El sistema SHALL generar el dump completo de la base de datos usando exclusivamente el cliente `@libsql/client` ya configurado (`api/config/database.js`), sin depender de la CLI de Turso ni de ningún binario externo. El fichero producido SHALL ser un script SQL restaurable con el procedimiento manual existente (`turso db shell <db> < dump.sql`) descrito en `docs/turso-doc.md`.

El dump SHALL emitir, en este orden: `PRAGMA foreign_keys=OFF;`, `BEGIN TRANSACTION;`, las sentencias `CREATE TABLE` de todos los objetos de usuario, los `INSERT` de todas las filas de cada tabla, las sentencias `CREATE INDEX`, `CREATE VIEW` y `CREATE TRIGGER`, y `COMMIT;`.

#### Scenario: Objetos de esquema recuperados de sqlite_master
- **WHEN** se genera un dump
- **THEN** el sistema SHALL leer `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL` y SHALL excluir los objetos internos cuyo nombre empieza por `sqlite_`, emitiendo el `sql` original de cada objeto sin reescribirlo

#### Scenario: Índices y triggers después de los datos
- **WHEN** el dump contiene tablas con índices
- **THEN** todas las sentencias `CREATE INDEX`, `CREATE TRIGGER` y `CREATE VIEW` SHALL emitirse después del último `INSERT`, de forma que la restauración no reconstruya índices fila a fila

#### Scenario: Preservación de sqlite_sequence
- **WHEN** la base de datos contiene la tabla interna `sqlite_sequence` (AUTOINCREMENT)
- **THEN** el dump SHALL incluir `DELETE FROM sqlite_sequence;` seguido de un `INSERT INTO sqlite_sequence VALUES(...)` por fila, de modo que tras restaurar el siguiente `orders.id` siga la numeración vigente (base 1000) y no se reinicie

#### Scenario: Tabla vacía
- **WHEN** una tabla del esquema no tiene filas
- **THEN** el dump SHALL contener su `CREATE TABLE` y ningún `INSERT` para ella

### Requirement: Serialización correcta de los valores

El sistema SHALL serializar cada valor con la sintaxis literal de SQLite: `NULL` sin comillas; texto entre comillas simples con las comillas simples internas duplicadas; enteros (incluidos `BigInt`) sin comillas; reales con precisión de ida y vuelta; blobs como `X'<hex>'`; y booleanos como `1`/`0`.

#### Scenario: Texto con comillas y saltos de línea
- **WHEN** una fila contiene un valor de texto con apóstrofos, saltos de línea o HTML (por ejemplo la descripción de una obra)
- **THEN** el literal emitido SHALL duplicar cada comilla simple y SHALL conservar el resto de caracteres sin escapar, de forma que al restaurar el valor sea idéntico byte a byte al original

#### Scenario: Valores nulos y numéricos
- **WHEN** una fila contiene `NULL`, un entero y un decimal (por ejemplo `commission_amount`)
- **THEN** el `NULL` SHALL emitirse como la palabra clave `NULL` sin comillas y los números SHALL emitirse sin comillas conservando su valor exacto al reimportar

#### Scenario: Valor binario
- **WHEN** una columna contiene un valor binario (`Uint8Array`)
- **THEN** SHALL emitirse como literal hexadecimal `X'...'`

### Requirement: Lectura por lotes con límite de memoria

El sistema SHALL leer las filas de cada tabla en lotes paginados por `rowid` (`WHERE rowid > ? ORDER BY rowid LIMIT <n>`) en lugar de un único `SELECT *`, para no exceder el límite de memoria del contenedor de api (1 GB en producción) ni los límites de tamaño de respuesta de Turso. El dump SHALL escribirse a un flujo comprimido a medida que se genera, sin materializar el texto completo de todas las tablas simultáneamente.

#### Scenario: Tabla grande
- **WHEN** se vuelca la tabla `postal_codes` (≈37.867 filas)
- **THEN** el sistema SHALL emitir sus filas en lotes sucesivos y el proceso SHALL completarse sin agotar la memoria del contenedor

#### Scenario: Instantánea coherente
- **WHEN** comienza la generación del dump
- **THEN** el sistema SHALL intentar leer dentro de una transacción de solo lectura para obtener una instantánea coherente; si el proveedor rechaza o expira la transacción, el sistema SHALL continuar la lectura sin transacción y SHALL registrar un aviso (`logger.warn`) indicando que el dump no es puntual

### Requirement: Manifiesto de verificación del dump

El sistema SHALL producir, junto a cada dump, un manifiesto JSON con: nombre del entorno, marca de tiempo UTC de inicio, duración en milisegundos, número de tablas, conteo de filas por tabla, tamaño en bytes antes y después de comprimir, y el SHA-256 del fichero comprimido subido.

#### Scenario: Manifiesto acompaña al dump
- **WHEN** un backup se sube correctamente
- **THEN** el manifiesto SHALL subirse con la misma key que el dump sustituyendo la extensión por `.meta.json`

#### Scenario: Verificación de integridad tras la descarga
- **WHEN** un operador descarga un dump y calcula su SHA-256
- **THEN** el valor SHALL coincidir con el campo correspondiente del manifiesto

### Requirement: Subida al bucket S3 de copias

El sistema SHALL comprimir el dump con gzip y subirlo al bucket indicado por `AWS_S3_BACKUP_BUCKET` (`140d-db-backups-pro`), que SHALL ser distinto del bucket de medios (`AWS_S3_BUCKET`). La key diaria SHALL ser `daily/kuadrat-<env>-YYYY-MM-DD.sql.gz`, donde `<env>` se deriva de `NODE_ENV` (`production` → `pro`) y la fecha SHALL calcularse en la zona horaria `Europe/Madrid`.

#### Scenario: Subida diaria correcta
- **WHEN** el backup del 12 de agosto de 2026 se ejecuta en producción
- **THEN** el objeto SHALL subirse con la key `daily/kuadrat-pro-2026-08-12.sql.gz`, `ContentType: application/gzip` y `ContentEncoding` sin definir, junto con `daily/kuadrat-pro-2026-08-12.meta.json`

#### Scenario: Bucket de medios intacto
- **WHEN** se sube un backup
- **THEN** ningún objeto SHALL escribirse en el bucket de `AWS_S3_BUCKET` y el comportamiento de subida y borrado de imágenes SHALL permanecer sin cambios

#### Scenario: Reejecución el mismo día
- **WHEN** el backup se ejecuta dos veces el mismo día (por ejemplo tras un reinicio del contenedor y una ejecución manual)
- **THEN** la segunda subida SHALL sobrescribir la key del día sin error y sin crear objetos huérfanos

### Requirement: Copia mensual del día 4

El sistema SHALL subir adicionalmente el dump del día 4 de cada mes bajo el prefijo `monthly/`, con la key `monthly/kuadrat-<env>-YYYY-MM-DD.sql.gz` y su manifiesto correspondiente. El día del mes SHALL evaluarse en la zona horaria `Europe/Madrid`, la misma con la que se programa la ejecución.

#### Scenario: Ejecución del día 4
- **WHEN** el backup se ejecuta el 4 de septiembre de 2026
- **THEN** el mismo contenido SHALL subirse como `daily/kuadrat-pro-2026-09-04.sql.gz` y como `monthly/kuadrat-pro-2026-09-04.sql.gz`, generando el dump una sola vez

#### Scenario: Cualquier otro día
- **WHEN** el backup se ejecuta un día distinto del 4
- **THEN** SHALL subirse únicamente bajo `daily/` y ningún objeto SHALL escribirse bajo `monthly/`

#### Scenario: Fallo de la copia mensual
- **WHEN** la subida diaria tiene éxito y la copia mensual falla
- **THEN** el backup SHALL considerarse fallido a efectos de alerta (para no perder silenciosamente la retención larga), pero la copia diaria ya subida SHALL conservarse

### Requirement: Retención delegada en el ciclo de vida de S3

El sistema NO SHALL borrar objetos del bucket de copias. La retención SHALL aplicarse mediante reglas de ciclo de vida de S3: los objetos bajo `daily/` caducan a los 15 días y los objetos bajo `monthly/` no caducan. La política IAM SHALL conceder sobre el bucket de copias **únicamente `s3:PutObject`**: ni `s3:DeleteObject` ni `s3:GetObject`, de modo que el proceso no pueda borrar ni releer una copia ya subida.

#### Scenario: El código no borra
- **WHEN** se revisa el servicio de backup
- **THEN** no SHALL existir ninguna llamada a `DeleteObjectCommand`, `DeleteObjectsCommand` ni equivalente sobre el bucket de copias

#### Scenario: Copia mensual no afectada por la caducidad diaria
- **WHEN** han pasado más de 15 días desde un backup del día 4
- **THEN** la copia bajo `daily/` SHALL haber caducado y la copia bajo `monthly/` SHALL seguir disponible

### Requirement: Programación diaria a las 04:00 en Europe/Madrid

El sistema SHALL ejecutar el backup una vez al día a las 04:00 hora de `Europe/Madrid` mediante `node-cron`, con la zona horaria declarada explícitamente en la programación para que el cambio de horario de verano no desplace la ejecución. El scheduler SHALL arrancarse desde `api/server.js` junto a los schedulers existentes y NUNCA desde `api/app.js`.

#### Scenario: Arranque del scheduler
- **WHEN** el proceso arranca con el backup habilitado
- **THEN** SHALL registrarse la programación `0 4 * * *` con `timezone: 'Europe/Madrid'` y SHALL emitirse una línea de log informativa con el bucket y el entorno de destino

#### Scenario: Los tests no arrancan backups
- **WHEN** un test de integración importa la aplicación mediante `api/tests/helpers/app.js`
- **THEN** el scheduler de backup NO SHALL arrancarse y ninguna petición SHALL enviarse a AWS

#### Scenario: Solapamiento de ejecuciones
- **WHEN** llega la hora programada y una ejecución anterior sigue en curso
- **THEN** la nueva ejecución SHALL omitirse y SHALL registrarse un aviso, evitando dos dumps concurrentes

### Requirement: Activación por configuración presente

El sistema SHALL ejecutar backups solo cuando `DB_BACKUP_ENABLED` sea `true` y `AWS_S3_BACKUP_BUCKET` esté configurado. Con la variable ausente el backup SHALL estar desactivado (valor por defecto `false`), de modo que ni el entorno local ni staging realizan copias mientras no se les configure. La activación NO SHALL depender de una comprobación de `NODE_ENV === 'production'` en el código, siguiendo el mismo criterio que el flag `config.useS3` de los medios. Bajo `NODE_ENV=test` el backup SHALL estar desactivado incondicionalmente, sin importar el valor de las variables.

#### Scenario: Entorno local o staging sin configurar
- **WHEN** el proceso arranca sin `DB_BACKUP_ENABLED`
- **THEN** el scheduler NO SHALL programarse y SHALL registrarse una línea de log a nivel `info` indicando que el backup está desactivado

#### Scenario: Habilitado sin bucket
- **WHEN** `DB_BACKUP_ENABLED=true` pero `AWS_S3_BACKUP_BUCKET` está vacío
- **THEN** el arranque SHALL registrar un `logger.error` explicando la configuración incompleta y el scheduler NO SHALL programarse, sin impedir el arranque del servidor

#### Scenario: Entorno de test
- **WHEN** `NODE_ENV=test` y `DB_BACKUP_ENABLED=true`
- **THEN** el backup SHALL permanecer desactivado

### Requirement: Alerta ante fallo del backup

El sistema SHALL tratar como fallo cualquier error durante la generación del dump o durante la subida a S3, y SHALL: registrar `logger.error` con el error estructurado, enviar la excepción a Sentry y enviar un correo a `BUSINESS_EMAIL` (con caída a `EMAIL_FROM` cuando no esté definido) mediante `emailService`. Un fallo NUNCA SHALL detener el proceso de la api ni impedir la ejecución del día siguiente.

#### Scenario: Fallo de subida a S3
- **WHEN** la subida a S3 falla (credenciales inválidas, bucket inexistente o error de red)
- **THEN** SHALL registrarse el error, SHALL notificarse a Sentry y SHALL enviarse un correo de alerta indicando entorno, fecha, key de destino y mensaje de error

#### Scenario: El proceso sobrevive al fallo
- **WHEN** un backup falla
- **THEN** el proceso de la api SHALL seguir sirviendo peticiones y el scheduler SHALL volver a intentarlo en la siguiente ejecución programada

#### Scenario: Sin correos en tests
- **WHEN** el backup falla bajo `NODE_ENV=test`
- **THEN** el correo de alerta SHALL registrarse en el outbox en memoria y ningún mensaje SHALL salir del proceso

#### Scenario: Éxito registrado
- **WHEN** un backup termina correctamente
- **THEN** SHALL registrarse una línea `logger.info` con la key subida, el tamaño comprimido, el número de tablas, el total de filas y la duración

### Requirement: Disparo manual del backup

El sistema SHALL exponer la misma rutina de backup como script ejecutable desde la consola (`npm run backup:now` en `api/package.json`, invocable con `docker compose exec api npm run backup:now`), para poder estrenar el sistema de forma observada y para hacer copias a demanda antes de una operación arriesgada. El script SHALL reutilizar la función del scheduler sin duplicar lógica y SHALL terminar con código de salida distinto de cero si el backup falla.

#### Scenario: Ejecución manual correcta
- **WHEN** un operador ejecuta `docker compose exec api npm run backup:now` con el backup configurado
- **THEN** SHALL generarse y subirse el dump del día igual que en la ejecución programada, SHALL imprimirse el resultado y el proceso SHALL terminar con código 0

#### Scenario: Ejecución manual sin configuración
- **WHEN** se ejecuta el script sin `AWS_S3_BACKUP_BUCKET` configurado
- **THEN** SHALL fallar con un mensaje explicativo y código de salida distinto de cero, sin generar el dump

#### Scenario: Independiente del interruptor del scheduler
- **WHEN** se ejecuta el script con `DB_BACKUP_ENABLED=false` pero con bucket configurado
- **THEN** el backup SHALL ejecutarse igualmente, ya que la ejecución manual es una acción deliberada del operador y no depende de la programación automática

### Requirement: Documentación operativa del bucket y la restauración

El repositorio SHALL incluir una guía en español (`docs/backups-s3.md`) que cubra: creación del bucket `140d-db-backups-pro` en `eu-south-2`, bloqueo de acceso público, cifrado en reposo, versionado, las reglas de ciclo de vida que implementan la retención, el bloque nuevo de la política IAM del rol de la instancia EC2 (solo `s3:PutObject`, sin `GetObject` ni `DeleteObject`), las variables de entorno a añadir, la verificación de la primera copia y el procedimiento completo de restauración a partir de un dump descargado.

#### Scenario: Credenciales documentadas
- **WHEN** un operador consulta la guía para saber con qué identidad AWS escribe la api
- **THEN** SHALL encontrar documentado que las credenciales las aporta el rol IAM de la instancia EC2 por la cadena por defecto del SDK, que no hay claves de acceso en ningún `.env`, y el bloque JSON exacto que hay que añadir a la política existente

#### Scenario: Alta del bucket desde cero
- **WHEN** un operador sigue la guía
- **THEN** SHALL poder crear el bucket, aplicar la política y el ciclo de vida, configurar las variables y verificar que la primera copia aparece en `daily/` sin consultar otra fuente

#### Scenario: Punto ciego documentado
- **WHEN** un operador consulta la guía sobre cómo saber que los backups siguen ocurriendo
- **THEN** SHALL encontrar advertido que un contenedor caído a las 04:00 no produce copia **ni alerta**, y que comprobar periódicamente la presencia del objeto del día en `daily/` forma parte del procedimiento operativo

#### Scenario: Restauración documentada
- **WHEN** un operador necesita restaurar la base de datos desde un backup
- **THEN** la guía SHALL indicar cómo descargar y descomprimir el objeto de S3 y SHALL enlazar con el procedimiento de `docs/turso-doc.md` para recrear la base de datos y regenerar el token
