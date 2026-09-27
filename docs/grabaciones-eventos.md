# Grabación de los eventos en directo (Agora Cloud Recording)

Guía operativa de la grabación en la nube de los eventos Agora. Cubre el alta en
Agora y en AWS (una vez por entorno), la activación por evento, la descarga de
las grabaciones, la supresión anticipada que pida un participante y qué hacer
ante cada alerta. Decisiones y motivos: `openspec/changes/agora-event-recording`.

**Alcance: producción y preproducción (staging).** Las dos comparten **el mismo
proyecto de Agora** («140d») y cada una tiene **su propio bucket y su propia
llave** (§2 explica por qué no hace falta un segundo proyecto). Los eventos
LiveKit y los pases de vídeo no se graban.

---

## 1. Qué hace el sistema

Cuando un evento Agora en directo tiene marcada la casilla **«Grabar el evento
(audio y vídeo)»**, Agora Cloud Recording entra en el canal como un oyente más
y escribe los ficheros directamente en nuestro bucket. No pasa ni un byte de
vídeo por nuestros servidores.

| Tipo de evento | Qué se graba | Qué queda en el bucket |
|---|---|---|
| **Stream** (`broadcast`) | Un único vídeo con **todo lo que se publica en escena** (cámara del host, pantalla compartida, co-presentador, promovidos con cámara) y **el audio de todos** mezclado | MP4 (1920×1080, audio 48 kHz mono 128 kbps) + copia HLS. Un evento largo puede dar varios MP4 |
| **Reunión** (`meeting`) | **Una pista de audio y otra de vídeo por participante**, incluidos los que entran tarde | Por participante: índice MPD + segmentos WebM (vídeo) e índice M3U8 + segmentos TS (audio). **No hay MP4**: ver §10 |

Mientras el host comparte pantalla en un stream, la grabación pasa a un diseño
con la pantalla en la ventana grande y las cámaras en columna; al dejar de
compartir vuelve al reparto normal.

**No se graban** la pizarra ni el chat (decisión de producto).

### Ciclo de vida

- **Arranca sola** al iniciar el evento (botón «Iniciar evento» del admin).
- **Se detiene sola** al finalizarlo (host o admin), y como máximo **3 horas**
  después de arrancar. El límite existe para que un evento que nadie finaliza no
  quede grabando para siempre.
- Si la grabación **se cae** a mitad del evento, se reanuda sola en una tarea
  nueva: la grabación queda en varias **partes**, cada una en su carpeta, y puede
  faltar un tramo corto.
- Un proceso de la api revisa cada 30 s todos los eventos grabados y es quien
  manda: si una ruta no avisa del fin del evento, la grabación se para igual en
  menos de 30 s.

### Conservación: 30 días naturales

Las grabaciones se eliminan **solas a los 30 días** por una regla del propio
bucket (§4). La aplicación no borra nada. **Para reutilizar una grabación hay
que descargarla antes.** El panel muestra hasta qué fecha está disponible cada
una. Es el plazo que promete la política de privacidad: no se alarga.

---

## 2. Agora: un solo proyecto para los dos entornos

**No hace falta un proyecto de Agora por entorno.** Staging y producción siguen
usando el proyecto «140d» y las mismas variables `AGORA_*` que hoy.

Lo que permite separar los entornos es que **el destino de la grabación no se
configura en la consola de Agora**: nuestra api lo envía dentro de cada petición
de grabación (el bucket, su región y su llave). Cada entorno envía los suyos, así
que el mismo proyecto escribe en el bucket de staging cuando graba un evento de
staging y en el de producción cuando graba uno de producción.

Lo que el proyecto compartido **no** mezcla:

- **Los canales.** Cada evento emite en `event-<id del evento>`, y los ids son
  UUID aleatorios distintos en cada base de datos. Un grabador de staging nunca
  entra en un canal de producción.
- **Las grabaciones.** Cada entorno tiene su bucket (§3), y cada panel de admin
  solo conoce las tareas de su propia base de datos.

Lo que el proyecto compartido **sí** mezcla, y no importa:

- **La facturación y los minutos gratuitos.** Los 10.000 minutos mensuales son
  por **cuenta**, no por proyecto, así que dos proyectos tampoco los separarían.
  Las pruebas de staging consumen de la misma bolsa.
- **Las estadísticas de uso** de la consola, que suman los dos entornos.

Una vez, en la consola de Agora (`console.agora.io`), en el proyecto «140d»:

1. **All features → Cloud Recording → Enable.** Sin esto, todas las grabaciones
   de los dos entornos fallan con un error de autorización y llega la alerta
   `start_failed`.
2. La **Co-host authentication** ya debe estar activada (requisito previo de los
   eventos Agora). El grabador entra con un token de suscriptor.
3. Las credenciales REST (`AGORA_CUSTOMER_ID` / `AGORA_CUSTOMER_SECRET`) son las
   mismas que ya usa la moderación. No hacen falta otras.

> **Si algún día se quiere aislar staging del todo** (por ejemplo, para que una
> intrusión en la máquina de staging no dé acceso a los canales de producción),
> la solución sería un segundo proyecto con su propio certificado. Hoy ya es
> así con o sin grabación, porque staging tiene el certificado que firma los
> tokens de producción: la grabación no cambia ese riesgo. El código no
> necesitaría cambios, solo otras variables `AGORA_*` en el `.env` de staging.
> Lo mismo si algún día se usan los webhooks de Agora: un proyecto compartido
> enviaría los avisos de los dos entornos a la misma URL.

---

## 3. Crear el bucket (uno por entorno)

Se crean **dos** buckets, uno para producción y otro para staging, con los mismos
pasos. En la consola de S3:

1. **Región: Europa (Irlanda) `eu-west-1`.** **No** `eu-south-2` (España), donde
   está el bucket de medios: Agora solo acepta las regiones S3 de su tabla, y la
   de España no está. Valen `eu-west-1`, `eu-west-2`, `eu-west-3`,
   `eu-central-1`, `eu-north-1` y `eu-south-1`
   (`api/utils/agoraStorageRegions.js`). Cualquier otra hace fallar el arranque.
2. **Nombre:** `140d-event-recordings-pro` (producción) y
   `140d-event-recordings-pre` (staging). Si el nombre está cogido, añade un
   sufijo: el código no asume nada del nombre.
   > **Usa el nombre exacto que muestra la consola**: es el ARN del bucket
   > (pestaña «Propiedades» → «Información general») sin el prefijo
   > `arn:aws:s3:::`. Los buckets de medios y de copias de esta cuenta llevan el
   > sufijo de la cuenta (`140d-media-pro-243303976956-eu-south-2-an`); los de
   > grabaciones se crearon sin él, y sus nombres son exactamente
   > `140d-event-recordings-pro` y `140d-event-recordings-pre`, los que usa esta
   > guía. Si alguna vez se recrean con otro nombre, hay que cambiarlo en las
   > políticas de §5 y §6, en la variable de §7 y en los comandos de §9 y §11.
   > Un nombre que no coincide no da ningún error al guardar la política:
   > simplemente hace que el permiso no sirva.
3. **Bloquear todo el acceso público: activado.** Las grabaciones de eventos de
   pago no pueden ser públicas, y nada de este bucket pasa por CloudFront.
4. **Versionado de bucket: DESACTIVADO, a propósito.** Con versionado, la regla
   de 30 días no borra el vídeo: solo le pone una marca de borrado y el fichero
   sigue existiendo como versión anterior. Las grabaciones se conservarían más
   tiempo del que dice la política de privacidad, y nada lo mostraría.
5. **Cifrado en reposo:** SSE-S3, el valor por defecto.

> **¿Por qué dos buckets y no uno?** Un solo bucket también funcionaría: bastaría
> con poner el mismo nombre y la misma llave en los dos `.env`, y las pruebas de
> staging seguirían siendo posibles. Se usan dos por tres motivos. Primero, la
> llave de staging no puede escribir en el bucket de producción; staging corre
> en una máquina menos protegida. Segundo, las grabaciones de prueba no se
> mezclan con las de asistentes reales, que son las que están sujetas a la
> política de privacidad y a las peticiones de supresión (§11). Tercero, cuesta
> solo repetir estos pasos una vez más.

---

## 4. Reglas de ciclo de vida (los 30 días)

En el bucket → **Administración** → **Crear regla de ciclo de vida**:

**Regla 1 — caducidad de las grabaciones**

- Nombre: `expire-recordings-after-30-days`
- Ámbito: *Limitar el ámbito con prefijo* → `eventos/`
- Acción: *Caducar versiones actuales de objetos* → **30 días**

**Regla 2 — subidas multiparte incompletas**

- Nombre: `abort-incomplete-multipart-1-day`
- Ámbito: todo el bucket
- Acción: *Eliminar cargas multiparte incompletas* → **1 día**

La segunda no es un detalle de coste: Agora sube MP4 de varios GB en partes, y
las partes de una subida interrumpida también contienen imagen y voz. Sin la
regla sobrevivirían al plazo.

Equivalente por CLI:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket 140d-event-recordings-pro \
  --lifecycle-configuration '{
    "Rules": [
      { "ID": "expire-recordings-after-30-days", "Status": "Enabled",
        "Filter": { "Prefix": "eventos/" }, "Expiration": { "Days": 30 } },
      { "ID": "abort-incomplete-multipart-1-day", "Status": "Enabled",
        "Filter": {}, "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 } }
    ]
  }'
```

S3 aplica las reglas de forma asíncrona, contando desde la creación de cada
fichero: el borrado real puede llegar uno o dos días después del día 30.

**Verificación.** En producción, la api comprueba la regla 1 cada vez que
arranca. Si falta, es más larga de 30 días o no se puede leer, llega la alerta
`retention_rule_missing` (§12). **En staging no puede comprobarla** (no tiene
credenciales de lectura): hay que verla a mano en la pestaña Administración.

---

## 5. La llave de Agora: un usuario IAM de solo escritura

Agora exige la clave del bucket **dentro de cada petición de grabación**; no hay
otra forma de indicarle el destino. Por eso existe una llave, y por eso sus
permisos son los mínimos posibles.

En IAM → **Usuarios → Crear usuario** `agora-cloud-recording-pro` (y
`agora-cloud-recording-pre` para staging), **sin acceso a la consola**, con esta
única política en línea:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AgoraCloudRecordingPutOnly",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::140d-event-recordings-pro/*"
    }
  ]
}
```

Después: **Credenciales de seguridad → Crear clave de acceso** → caso de uso
«Aplicación que se ejecuta fuera de AWS». La clave va a
`AGORA_RECORDING_S3_ACCESS_KEY` / `AGORA_RECORDING_S3_SECRET_KEY` (§7).

**Por qué es aceptable una clave de larga duración aquí, cuando la api no lleva
credenciales de AWS en ningún `.env`:** esta clave **no es de la aplicación**.
La aplicación nunca la usa para hablar con AWS; solo se la entrega a Agora. Con
ella se pueden escribir ficheros en un único bucket, pero no leer, listar ni
borrar nada. Y cada fichero vive como mucho 30 días.

**Rotación** (si se sospecha una filtración o por higiene):

1. Crear una segunda clave de acceso en el mismo usuario.
2. Cambiar las dos variables en `api/.env` y reiniciar la api
   (`./deploy/deploy.sh` o reinicio del contenedor). Hazlo fuera de un evento
   grabado: el grabador en marcha conserva la clave con la que arrancó.
3. Desactivar y luego borrar la clave antigua.

---

## 6. Permisos del rol de la instancia (solo producción)

La api **lee** el bucket con el rol de la instancia EC2, **`140dEC2Role`**, como
el resto de su acceso a S3. Sin credenciales en ningún fichero: el SDK las toma
del rol.

**Dónde NO añadirlo: en `140dS3MediaAccess`.** Es la política que el rol ya
tiene, y ahí están los bloques de medios y de copias. Pero **esa política está
asociada también al usuario IAM `140d-local`**, que tiene una clave de acceso de
larga duración. Añadir allí la lectura de grabaciones daría a esa clave acceso a
la imagen y la voz de asistentes reales. El bloque de copias sí pudo ir ahí
porque sólo permite escribir. Este permite leer datos personales, así que va en
una política propia **sólo del rol**.

**Pasos en la consola de IAM:**

1. **Roles** → `140dEC2Role`.
2. Pestaña **Permisos** → **Agregar permisos** → **Crear política insertada**.
3. En el editor, pestaña **JSON**, borra lo que haya y pega el documento
   completo, con el nombre real de tu bucket de producción en las dos líneas de
   `Resource` (ver la nota de §3):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "S3EventRecordingsRead",
         "Effect": "Allow",
         "Action": [
           "s3:ListBucket",
           "s3:GetLifecycleConfiguration",
           "s3:GetObject"
         ],
         "Resource": [
           "arn:aws:s3:::140d-event-recordings-pro",
           "arn:aws:s3:::140d-event-recordings-pro/*"
         ]
       }
     ]
   }
   ```

   Las dos líneas de `Resource` son necesarias: la primera, sin `/*`, es el
   bucket (para listar y leer la regla); la segunda, con `/*`, son los ficheros
   (para descargar).
4. **Siguiente** → nombre `140dEventRecordingsRead` → **Crear política**.

Al terminar, `140dEC2Role` tendrá dos políticas: `140dS3MediaAccess`, sin
cambios, y `140dEventRecordingsRead`, que es insertada y por eso no se puede
asociar por error a otro usuario o rol.

**Comprobación:** tras desplegar con las variables de §7, la api lee la regla
de 30 días al arrancar. Si este permiso falta o el nombre del bucket no
coincide, llega la alerta `retention_rule_missing` («no se pudo leer»; §12). Si
no llega, el permiso funciona.

- `ListBucket` permite listar las partes y los ficheros en el panel.
- `GetObject` permite firmar las URL de descarga.
- `GetLifecycleConfiguration` permite la comprobación de los 30 días al
  arrancar.

**Sin `DeleteObject`.** Escribe Agora, lee la aplicación y borra el bucket con
su regla: la misma separación que las copias de la base de datos.

Staging no tiene rol, así que allí el panel muestra la ruta de cada grabación en
lugar de los ficheros, y la descarga se hace desde la consola de S3.

---

## 7. Variables de entorno

Las cuatro `AGORA_*` **no cambian**: son las del proyecto «140d», iguales en los
dos entornos, como hoy. Se añaden cuatro nuevas, **distintas en cada entorno**:

| Variable | Producción (`api/.env` de la EC2) | Staging (`api/.env` del Mac mini) |
|---|---|---|
| `AGORA_RECORDING_S3_BUCKET` | nombre real del bucket de producción | nombre real del bucket de staging |
| `AGORA_RECORDING_S3_REGION` | `eu-west-1` | `eu-west-1` |
| `AGORA_RECORDING_S3_ACCESS_KEY` | clave de `agora-cloud-recording-pro` | clave de `agora-cloud-recording-pre` |
| `AGORA_RECORDING_S3_SECRET_KEY` | su secreto | su secreto |

Por ejemplo, en producción:

```bash
AGORA_RECORDING_S3_BUCKET=140d-event-recordings-pro
AGORA_RECORDING_S3_REGION=eu-west-1
AGORA_RECORDING_S3_ACCESS_KEY=AKIA...
AGORA_RECORDING_S3_SECRET_KEY=...
```

- **Las tres primeras vacías = grabación desactivada**: la casilla del formulario
  aparece deshabilitada con «La grabación no está configurada en este entorno».
- **Configuración a medias = la api no arranca**, con un mensaje que nombra la
  variable que falta. Es a propósito: una casilla que se marca y no graba nada es
  peor que un arranque fallido. Lo mismo si faltan las cuatro `AGORA_*`.
- Ninguna `NEXT_PUBLIC_*`: no hay que recompilar el cliente para activarlas.
- Bajo `NODE_ENV=test` la grabación está desactivada siempre, diga lo que diga
  el fichero.

---

## 8. Grabar un evento

1. Crear o editar el evento en `/admin/espacios`, con proveedor **Agora** y
   formato **en directo** (stream o reunión).
2. Marcar **«Grabar el evento (audio y vídeo)»**. No se puede cambiar con el
   evento en curso: la edición de eventos activos está bloqueada, y así el aviso
   que reciben los asistentes al entrar no puede quedar desmentido.
3. Iniciar el evento como siempre. La grabación arranca sola.

Los asistentes ven un aviso antes de entrar (en la ficha y en el modal de
acceso) y la insignia **«Grabando»** durante el evento. La insignia indica que el
evento está configurado para grabarse, **no** que la grabación esté funcionando
en ese momento: si falla, quien se entera es el admin, por email (§12).

---

## 9. Consultar y descargar

En la ficha del evento de admin, sección **«Grabaciones»**: una **Parte** por
cada tarea, con su estado, inicio, fin, motivo de parada y «Disponible hasta el
…».

### Stream: MP4

Botón **«Descargar»** en cada MP4. La URL se firma al pulsar, vale 15 minutos y
el navegador descarga directamente de S3. Una descarga larga no se corta al
caducar la URL: S3 la comprueba al empezar.

### Reunión: pistas por participante

Son miles de ficheros que solo sirven juntos, así que no se descargan por la
web. El panel muestra a cada participante con su nombre, sus pistas y el
**comando exacto** para descargar la sesión completa o solo sus pistas:

```bash
# Sesión completa
aws s3 sync "s3://140d-event-recordings-pro/eventos/<evento>/<parte>/" "./grabacion-parte-1"

# Solo un participante (uid 101)
aws s3 sync "s3://140d-event-recordings-pro/eventos/<evento>/<parte>/" "./grabacion-parte-1-uid-101" \
  --exclude "*" --include "*__uid_s_101__*"
```

Requiere AWS CLI con credenciales de **lectura** sobre el bucket (las del
operador, nunca la llave de Agora, que no puede leer). El uid `1` es siempre el
host; el resto son asistentes, y el panel los traduce a su nombre.

### Staging

El panel muestra la ruta `s3://…/eventos/<evento>/<parte>/` de cada parte. Los
ficheros se consultan en la consola de S3.

---

## 10. Convertir las pistas de una reunión a MP4

Agora no produce MP4 en el modo por participante, y como el navegador publica
VP8, el vídeo llega en WebM. Se importa tal cual en DaVinci Resolve, Premiere o
ffmpeg. Si hace falta MP4:

1. Descargar la carpeta de la parte (§9) en una máquina **Linux x86-64** (el
   script de Agora no funciona en ARM ni en Windows; nuestra EC2 es ARM).
2. Descargar la herramienta de conversión de Agora (`convert_v2.py`, Python 3.12,
   trae ffmpeg incluido) desde su documentación: *Cloud Recording → Merge and
   transcode recorded files*.
3. `python3 convert_v2.py --dir ./grabacion-parte-1 --recording_mode individual`
   → un `<uid>_0_merge_av.mp4` por participante. `--uid 101` convierte solo uno.

Las pistas llevan su hora de inicio, así que se pueden resincronizar.

---

## 11. Supresión anticipada (petición de un participante)

La política de privacidad permite pedir en info@140d.art que se suprima una
intervención antes de los 30 días. Es un borrado manual, con credenciales de
administrador de AWS (la aplicación no borra):

- **Reunión:** basta con borrar las pistas de su uid en cada parte. El panel da
  el uid junto a su nombre:
  ```bash
  aws s3 rm "s3://140d-event-recordings-pro/eventos/<evento>/<parte>/" \
    --recursive --exclude "*" --include "*__uid_s_<uid>__*"
  ```
- **Stream:** la mezcla es un único fichero, así que no se puede quitar a una
  persona sin editar el vídeo. Se borra la carpeta de la parte entera, o se
  edita fuera y se sustituye.

Deja constancia de la petición y de la fecha del borrado.

---

## 12. Alertas: qué significa cada una

Llegan por email a `BUSINESS_EMAIL` (además de log y Sentry), una sola vez por
evento o por tarea:

| Alerta | Qué ha pasado | Qué hacer |
|---|---|---|
| `start_failed` — «no ha podido arrancar» | Agora rechaza la grabación. Se reintenta cada minuto, hasta 10 veces | Si el evento importa, grabarlo también en local. Revisar variables, Cloud Recording activado (§2) y la política de la llave (§5) |
| `interrupted` — «se ha interrumpido» | El grabador se ha detenido solo; se reanuda en una parte nueva | Nada, si llega a reanudarse |
| `gave_up` — «se ha dejado de intentar» | Diez intentos fallidos: no se volverá a intentar | Grabar en local lo que quede. Revisar logs y Sentry antes del próximo evento grabado |
| `stop_failed` — «no ha podido detenerse» | La orden de parar falló. Se reintenta cada 2 min; si no, Agora para sola al quedarse el canal vacío (30 min) | Comprobar en el panel que la parte acaba «Detenida» |
| `retention_rule_missing` — «no caducan a los 30 días» | Falta la regla de §4, es más larga o no se puede leer | Crear o corregir la regla. Es un incumplimiento de la política de privacidad mientras dure |

---

## 13. Costes

Tarifas publicadas por Agora (por cada 1.000 minutos): audio 1,49 $, vídeo HD
5,99 $, Full HD 13,49 $, 2K 23,99 $, 2K+ 53,99 $. Se factura por la **suma de
resoluciones de lo que se graba a la vez**, igual que el RTC. Comparte los
10.000 minutos gratuitos del mes con el RTC y con las pruebas de staging, que
van a la misma cuenta.

| Evento de 90 min | Banda | Coste |
|---|---|---|
| Stream, host solo | HD | 0,54 $ |
| Stream con co-presentador | Full HD | 1,21 $ |
| Stream con pantalla compartida | 2K | 2,16 $ (solo los minutos compartiendo) |
| Reunión de 8 cámaras | Full HD | 1,21 $ |
| Reunión de 17 cámaras | 2K+ | 4,86 $ |

Almacenamiento: ~1,35 GB por hora de stream por copia (MP4 + HLS) durante como
mucho 30 días: céntimos por evento.

**Pendiente de verificar en la primera factura:** que el lienzo de 1920×1080 no
encarece el modo stream. Según Agora se factura por los flujos grabados, no por
el lienzo. Si no fuera así, se baja a 1280×720 cambiando `MIX_CANVAS` en
`api/services/agoraRecordingService.js`.

---

## 14. Puntos ciegos conocidos

- **La insignia «Grabando» no es el estado real.** Refleja la configuración. El
  fallo real se ve en la alerta y en el panel.
- **Con la api caída al terminar el evento**, nadie da la orden de parar. El
  grabador sale solo 30 min después de quedarse el canal vacío (unos céntimos de
  audio), y como tope absoluto caduca su token. Al volver la api, lo que quede se
  para solo.
- **Un fallo de la api justo entre el arranque y el registro** deja un grabador
  que el sistema no conoce. Sus ficheros llegan igual a la carpeta de su parte,
  que aparece como «Fallida».
- **El diseño de la pantalla compartida depende de la presencia del host**, que
  vive en memoria: tras un reinicio de la api el host la vuelve a declarar al
  reconectar. Si no pudiera, la pantalla se sigue grabando, solo que más pequeña.
- **La geometría exacta de los diseños** (adaptativo y vertical) no está
  documentada por Agora con cifras. Se comprueba con la primera grabación de
  cada tipo en staging.
- **El cliente no tiene tests automáticos**: formulario, panel, insignia y
  avisos se verifican a mano.

---

## 15. Referencias en el código

| Pieza | Fichero |
|---|---|
| Motor (reconciliador, peticiones, alertas, comprobación de los 30 días) | `api/services/agoraRecordingService.js` |
| Scheduler (cada 30 s) | `api/scheduler/recordingScheduler.js` |
| Predicado «¿se graba este evento?» | `api/utils/eventRecording.js` y `client/lib/eventRecording.js` |
| Regiones S3 aceptadas por Agora | `api/utils/agoraStorageRegions.js` |
| Endpoints de admin | `api/controllers/eventRecordingAdminController.js` |
| Listado, URL firmada y lectura de reglas | `api/services/s3Service.js` |
| Tabla de tareas | `event_recordings` en `api/config/database.js` |
| Panel, casilla, insignia, aviso | `client/components/admin/EventRecordingsPanel.js`, `client/components/admin/RecordingCheckbox.js`, `client/components/events/RecordingBadge.js`, `client/components/events/RecordingNotice.js` |
| Tests | `api/tests/agoraRecording.test.js`, `api/tests/eventRecordingAdmin.test.js` |
