# Copias de seguridad de la base de datos en S3

Guía operativa del sistema de backups automáticos de la base de datos de Turso.
Cubre el alta del bucket en AWS, los permisos, la verificación de la primera
copia y el procedimiento de restauración.

**Alcance: solo producción.** Staging se respalda a mano cuando el operador lo
considera; su información no es crítica. Ver §9.

---

## 1. Qué hace el sistema

Todos los días a las **04:00 (hora de Madrid)** el contenedor de la api:

1. Genera un dump SQL completo de la base de datos leyéndola con el mismo
   cliente `@libsql/client` que usa la aplicación (**no** hace falta la CLI de
   Turso; ver `api/services/dbDumpService.js`).
2. Lo comprime con gzip y lo sube al bucket **`140d-db-backups-pro`** como
   `daily/kuadrat-pro-AAAA-MM-DD.sql.gz`.
3. Sube junto a él un `daily/kuadrat-pro-AAAA-MM-DD.meta.json` con el número de
   filas de cada tabla, los tamaños, la duración y el **SHA-256** del fichero
   subido.
4. **Los días 4 de cada mes** sube además el mismo fichero a
   `monthly/kuadrat-pro-AAAA-MM-DD.sql.gz`. El dump se genera una sola vez.

El proceso es de **solo lectura** sobre la base de datos: no escribe ni una fila.

### Retención

| Prefijo    | Se conserva            | Quién lo borra                          |
|------------|------------------------|-----------------------------------------|
| `daily/`   | 15 días                | Regla de ciclo de vida de S3            |
| `monthly/` | Indefinidamente        | Nadie                                   |

**El proceso de backup nunca borra nada.** La retención la aplica AWS mediante
una regla de ciclo de vida, y la política IAM ni siquiera concede permiso de
borrado sobre este bucket. Es deliberado: un fallo en la lógica de fechas no
puede vaciar el histórico de copias.

---

## 2. Crear el bucket

En la consola de S3, región **Europa (España) `eu-south-2`** — la misma del
bucket de medios:

1. **Crear bucket** → nombre `140d-db-backups-pro`.
   > Los nombres de bucket son únicos en **todo AWS**. Si la consola responde
   > `BucketAlreadyExists`, añade un sufijo (por ejemplo
   > `140d-db-backups-pro-243303976956`) y usa ese nombre en
   > `AWS_S3_BACKUP_BUCKET`. El código no asume nada del nombre.
2. **Bloquear todo el acceso público**: activado (valor por defecto). Los dumps
   contienen datos personales de compradores y vendedores.
3. **Versionado de bucket**: activado. Protege frente a una sobrescritura
   accidental de una copia.
4. **Cifrado en reposo**: SSE-S3 (`AES-256`), que es el valor por defecto.
5. Región: `eu-south-2`. Si por lo que sea se crea en otra, hay que rellenar
   `AWS_S3_BACKUP_REGION`; de lo contrario el SDK responderá con un error 301
   `PermanentRedirect` bastante opaco.

---

## 3. Reglas de ciclo de vida (la retención)

En el bucket → pestaña **Administración** → **Crear regla de ciclo de vida**:

**Regla 1 — caducidad de las copias diarias**

- Nombre: `expire-daily-after-15-days`
- Ámbito: *Limitar el ámbito con prefijo* → `daily/`
- Acción: *Caducar versiones actuales de objetos* → **15 días**
- Acción adicional (si activaste el versionado): *Eliminar permanentemente
  versiones no actuales* → **7 días**

**No crees ninguna regla para `monthly/`.** Esa es exactamente la forma en que
se cumple el requisito de conservar la copia del día 4: vive en otro prefijo,
así que la regla de los 15 días no la alcanza.

**Verificación:** en la pestaña Administración la regla debe aparecer con estado
*Habilitada* y el prefijo `daily/` visible en la columna de ámbito. Si nadie
crea esta regla, las copias diarias se acumulan indefinidamente: es un problema
de coste (céntimos), nunca de pérdida de datos.

---

## 4. Permisos IAM

La api **no lleva credenciales de AWS en ningún fichero**. `s3Service.js` crea
el cliente con `new S3Client({ region })` sin credenciales, y el SDK las
resuelve por su cadena por defecto: en la instancia EC2 de producción, el **rol
IAM de la instancia**. No hay que crear usuarios ni claves de acceso.

Añade este bloque a la política que ya tiene ese rol, **sin tocar los dos
bloques existentes** (`S3ImageUploadAndServe` y `S3ListBucket`):

```json
{
    "Sid": "S3DbBackupPutOnly",
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": [
        "arn:aws:s3:::140d-db-backups-pro/*"
    ]
}
```

**Solo `s3:PutObject`.** Fíjate en el contraste con el bloque de medios, que
concede `PutObject`, `DeleteObject` y `GetObject`: aquí la api puede escribir una
copia pero **no puede leerla de vuelta ni borrarla**. Los dumps contienen
nombres, direcciones, correos y referencias de pago de compradores y
vendedores, así que ni siquiera el proceso que los genera debe poder
recuperarlos. Si alguien comprometiera el contenedor, podría escribir objetos
nuevos, pero no exfiltrar el histórico ni destruirlo.

La lectura de las copias se hace desde la consola de AWS o con la CLI, con
credenciales de administrador — nunca desde la aplicación.

---

## 5. Variables de entorno

En `api/.env` del servidor de producción:

```bash
AWS_S3_BACKUP_BUCKET=140d-db-backups-pro
DB_BACKUP_ENABLED=true

# Opcionales:
AWS_S3_BACKUP_REGION=       # vacío = usa AWS_S3_REGION
DB_BACKUP_CRON=0 4 * * *    # siempre evaluado en Europe/Madrid
```

Ninguna es un secreto: son nombres y un interruptor.

Tres capas impiden que el backup se ejecute donde no debe:

- `DB_BACKUP_ENABLED` está **desactivado por defecto**, así que local y staging
  no hacen nada aunque tuvieran credenciales.
- Bajo `NODE_ENV=test` está desactivado **incondicionalmente**, diga lo que diga
  el fichero de entorno.
- El scheduler se arranca solo desde `api/server.js`, que los tests nunca
  importan.

Si `DB_BACKUP_ENABLED=true` pero falta el bucket, el arranque registra un
`logger.error` y no programa nada: una configuración a medias es visible, pero
no impide que la tienda arranque.

---

## 6. Lanzar una copia a mano

```bash
docker compose exec api npm run backup:now
```

Genera y sube la copia del día igual que la ejecución programada. Ignora
`DB_BACKUP_ENABLED` a propósito (ese interruptor gobierna el scheduler; esto es
una decisión explícita del operador), pero sigue exigiendo el bucket.

Es seguro ejecutarlo en producción: solo lectura sobre la base, solo escritura
sobre S3. Lo peor que puede hacer es sobrescribir la copia de hoy con otra copia
de hoy. Úsalo antes de un despliegue arriesgado o de una migración de esquema.

---

## 7. Verificar la primera copia

Este es el paso obligatorio antes de dar el sistema por bueno. **No lo saltes**:
al no haber backups en staging, esta es la única ocasión de comprobar el
proceso completo con alguien mirando.

```bash
# 1. Lanzar la copia y leer los logs
docker compose exec api npm run backup:now

# 2. Comprobar que los dos objetos están en el bucket
aws s3 ls s3://140d-db-backups-pro/daily/

# 3. Descargar la copia y su manifiesto
aws s3 cp s3://140d-db-backups-pro/daily/kuadrat-pro-AAAA-MM-DD.sql.gz .
aws s3 cp s3://140d-db-backups-pro/daily/kuadrat-pro-AAAA-MM-DD.meta.json .

# 4. El SHA-256 debe coincidir con el del manifiesto
sha256sum kuadrat-pro-AAAA-MM-DD.sql.gz
cat kuadrat-pro-AAAA-MM-DD.meta.json

# 5. Descomprimir
gunzip -k kuadrat-pro-AAAA-MM-DD.sql.gz
head -5 kuadrat-pro-AAAA-MM-DD.sql   # PRAGMA foreign_keys=OFF; / BEGIN TRANSACTION;
```

**6. Ensayo de restauración sobre una base auxiliar** (nunca sobre la de
producción):

```bash
turso db create backup-test
turso db shell backup-test < kuadrat-pro-AAAA-MM-DD.sql

# Comparar unos cuantos conteos con los del manifiesto
turso db shell backup-test "SELECT COUNT(*) FROM orders"
turso db shell backup-test "SELECT COUNT(*) FROM art"

# El contador AUTOINCREMENT debe venir preservado: este valor tiene que
# coincidir con el mayor id de pedido real, no reiniciarse
turso db shell backup-test "SELECT seq FROM sqlite_sequence WHERE name='orders'"

turso db destroy backup-test
```

Ese último punto es el que más importa. `orders` es `AUTOINCREMENT` y empieza en
1000: si `sqlite_sequence` no viajara en el dump, una base restaurada volvería a
emitir números de pedido que ya aparecen en facturas.

Solo después de esta verificación, pon `DB_BACKUP_ENABLED=true` y reinicia.

---

## 8. Vigilancia: el punto ciego

**Si el contenedor de la api está caído a las 04:00, no hay copia y tampoco hay
aviso.** El mecanismo de alerta vive dentro del propio proceso que no llegó a
ejecutarse; no puede avisar de su propia ausencia.

Los fallos que *sí* se notifican —error al generar el dump, credenciales
inválidas, bucket inexistente, error de red— llegan por tres canales: log de
Pino, Sentry y un correo a `BUSINESS_EMAIL`. Un fallo nunca detiene la api ni
impide el intento del día siguiente.

Por tanto, **forma parte del procedimiento operativo comprobar cada cierto
tiempo que existe el objeto del día**:

```bash
aws s3 ls s3://140d-db-backups-pro/daily/ | tail -5
```

Mejora futura anotada: un aviso automático por ausencia (regla de CloudWatch o
un *dead man's switch* externo). Fuera del alcance del cambio actual.

---

## 9. Restaurar la base de datos

Descarga y descomprime el dump del día que necesites (§7, pasos 3–5) y sigue el
procedimiento de **`docs/turso-doc.md`**, que es el mismo de siempre: el fichero
generado por este sistema es equivalente al de `turso db shell <db> .dump`.

En resumen:

1. Restaura primero en una base auxiliar y comprueba los datos.
2. `turso db destroy <bd-original>` y `turso db create <bd-original>`.
3. `turso db shell <bd-original> < kuadrat-pro-AAAA-MM-DD.sql`
4. `turso db tokens create <bd-original>` y actualiza `TURSO_AUTH_TOKEN` en el
   `.env` del servidor.
5. Reinicia el contenedor de la api.

> **Recuerda:** al destruir y recrear la base cambia el token. Si se te olvida el
> paso 4, la api arrancará y fallará en la primera consulta.

Ten en cuenta que Turso conserva además su propio *point-in-time recovery*, que
sigue siendo la vía más rápida para deshacer un error reciente. Estas copias en
S3 son la red para lo que el PITR no cubre: perder el acceso a la cuenta de
Turso, o descubrir el problema semanas después.

---

## 10. Staging

Staging **no hace copias automáticas**: es una decisión explícita, no un olvido.
La máquina está autoalojada, no tiene rol de instancia de AWS ni credenciales, y
su información no es crítica. El respaldo se hace a mano con el procedimiento de
`docs/turso-doc.md`.

Si algún día se quisiera activar allí, harían falta dos cosas que hoy no
existen: un bucket propio (`140d-db-backups-pre`) y credenciales AWS para esa
máquina, que al no tener IMDS obligarían a crear un usuario IAM con
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` en `api/.env.staging` (las lee
directamente el SDK de AWS; no se declaran en `api/config/env.js`). El código no
lo impide: la activación es por configuración presente, no por una comprobación
de `NODE_ENV`.

---

## 11. Referencias en el código

| Fichero | Qué hace |
|---|---|
| `api/services/dbDumpService.js` | Genera el SQL leyendo `sqlite_master` y paginando por `rowid` |
| `api/services/dbBackupService.js` | Comprime, calcula el SHA-256, sube y construye el manifiesto |
| `api/scheduler/backupScheduler.js` | Cron diario, zona `Europe/Madrid`, anti-solapamiento |
| `api/scripts/runBackup.js` | Disparo manual (`npm run backup:now`) |
| `api/services/s3Service.js` | `uploadObject()` — subida a un bucket explícito |
| `api/tests/dbDump.test.js` | Ida y vuelta del dump: genera, reimporta y compara |
| `api/tests/dbBackup.test.js` | Keys, copia del día 4, alerta de fallo, aislamiento en test |
