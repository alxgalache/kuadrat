## Context

Los eventos Agora se publican en un canal RTC con perfil `live` (`AgoraRTC.createClient({ mode: 'live', codec: 'vp8' })`, `client/hooks/useAgoraRoom.js`), con uids reservados: `1` la cámara y el micro del host, `2` su pantalla compartida en `broadcast` (segundo cliente), y `≥ 101` los asistentes (`event_attendees.agora_uid`). La escena de `broadcast` se compone en cada navegador (`BroadcastStage.js`) y la pizarra es una sala fastboard aparte: **ni una ni otra existen dentro del canal RTC**.

Agora Cloud Recording es un servicio de servidor que entra en el canal como un usuario más, se suscribe a los flujos y escribe los ficheros en un almacenamiento de terceros. Se gobierna por REST (`acquire` → `start` → `query`/`update`/`updateLayout` → `stop`) con la misma autenticación Basic (`AGORA_CUSTOMER_ID`/`AGORA_CUSTOMER_SECRET`) que ya usa la moderación en `api/services/agoraService.js`. Tiene tres modos: `individual`, `mix` (composite) y `web` (graba una página con un Chrome real).

Decisiones de producto ya tomadas: sólo audio y vídeo (sin pizarra ni chat); en `broadcast`, **todo lo que se publique en escena** —pantalla compartida incluida— más el audio global; en `meeting`, una pista de audio y otra de vídeo por participante; WebM/VP8 por uid es aceptable; duración máxima de un evento, 180 minutos.

Restricciones del proyecto que condicionan el diseño: el contenedor `api` tiene 0,75 vCPU sobre una `t4g.medium` ARM64 (no puede servir ni convertir vídeo); ninguna credencial AWS de la aplicación vive en un `.env` (rol de la instancia); los tests no pueden tocar la red; las alertas de trabajos en segundo plano van por log + Sentry + email.

## Goals / Non-Goals

**Goals:**
- Grabar audio y vídeo de los eventos Agora marcados, sin intervención humana durante el evento.
- Que ningún fallo de la grabación afecte al evento en directo.
- Que una grabación nunca quede facturando sin límite, aunque la api esté caída.
- Que el admin pueda descargar el resultado y saber a quién pertenece cada pista.
- Que los participantes sepan que se graba antes de entrar y mientras están dentro.

**Non-Goals:**
- Pizarra, chat, eventos LiveKit y pases de vídeo.
- Reproducción, publicación o conversión de las grabaciones dentro de la aplicación.
- Replicar el diseño exacto de `BroadcastStage` en el fichero grabado.
- Borrado de grabaciones desde la aplicación (lo hace la regla de ciclo de vida del bucket).

## Decisions

### D1. Sólo Cloud Recording `mix` e `individual`; el modo `web` queda descartado

El modo `web` era el único capaz de capturar la pizarra y la escena compuesta, a costa de seis restricciones (sin WebGL, una sola pantalla sin scroll, autoplay, URL con credencial, una ruta de grabación dedicada y un asistente fantasma en la presencia). Al quedar fuera la pizarra, ya no aporta nada. Los modos `mix` e `individual` entran en el canal como **audiencia** de un canal `live`, así que no aparecen en `client.remoteUsers` de nadie, no pasan por la sala Socket.IO y no tocan `event_attendees`: el problema del asistente fantasma desaparece por construcción.

*Alternativas descartadas*: `MediaRecorder` en el navegador del host (un móvil en trípode; un cierre de pestaña pierde el evento), Chrome headless + ffmpeg propios (la instancia no tiene CPU), Media Push a RTMP + Amazon IVS (dos proveedores y dos facturas para lo mismo), LiveKit Egress (60 min/mes en el plan gratuito, $20/1.000 min después, y no cubre los eventos Agora).

### D2. Un flag por evento; el modo lo decide `interaction_mode`

`events.recording_enabled INTEGER NOT NULL DEFAULT 0`. `broadcast → mix`, `meeting → individual`. Un criterio, una lectura: no hay selector de modo que pueda contradecir el tipo de evento. Como los otros flags de host, se guarda siempre y **sólo tiene efecto** con `provider='agora'` y `format='live'`; la elegibilidad vive en un predicado por lado (`api/utils/eventRecording.js` y `client/lib/eventRecording.js`), igual que `sellerCapabilities`. Un evento `active` no es editable (`eventAdminController.updateEvent`), así que la decisión de grabar queda fijada antes de que entre nadie: el aviso que se da al acceder no puede quedar desmentido a mitad de evento.

### D3. `broadcast`: `mix` con todo lo publicado y el audio de todos

```jsonc
recordingConfig: {
  channelType: 1,                        // perfil live, igual que el cliente
  streamTypes: 2, videoStreamType: 0,    // flujo ALTO, nunca el low de 480×270
  maxIdleTime: 1800,
  subscribeVideoUids: ['#allstream#'],
  subscribeAudioUids: ['#allstream#'],
  audioProfile: 1,                       // 48 kHz mono ~128 kbps
  transcodingConfig: { width: 1920, height: 1080, fps: 30, bitrate: 3000,
                       backgroundColor: '#000000', ...diseño (D4) }
},
recordingFileConfig: { avFileType: ['hls', 'mp4'] }   // ['mp4'] solo da error
```

- **`#allstream#` y no una lista de uids.** En `broadcast` sólo publican quienes están en escena (host, su pantalla, co-presentador, promovidos con cámara): el resto es suscriptor y la Co-host authentication del proyecto lo garantiza. Enumerar uids perdería al co-presentador, cuyo uid es de asistente (≥ 101) y sólo se conoce si ya está en la sala al arrancar. Con un único publicador, el lienzo entero es suyo: idéntico a grabar sólo el uid 1.
- **`audioProfile: 1`.** El valor por defecto (`0`) son ~48 kbps y tiraría en la mezcla todo lo que `AGORA_MIC_ENCODER_HOST` (`high_quality`, 128 kbps mono) y `AGORA_MIC_NO_PROCESSING` existen para entregar.
- **Lienzo 1920×1080.** Lo más detallado que se graba es la pantalla compartida (`AGORA_SCREEN_ENCODER_BROADCAST`, 1792×1008); con un lienzo de 720p quedaría a la mitad. Según la documentación de precios, la tarifa de grabación depende de la **resolución agregada de los flujos grabados**, no del lienzo de salida, así que el lienzo mayor sólo cuesta almacenamiento (~1,35 GB/h por copia). Se verifica en la primera factura (ver Riesgos).
- **MP4 + HLS.** El MP4 es el entregable; el HLS se conserva como redundancia. Agora parte el MP4 cada ~2–3 h o ~2 GB, así que un evento de 3 h puede dar varios ficheros: el panel los lista todos en orden.

### D4. Diseño del lienzo: adaptativo, y vertical con la pantalla en grande

Dos estados, una función pura `mixLayoutFor(screenSharing)`:

| Estado | `transcodingConfig` | Resultado |
|---|---|---|
| sin pantalla (`adaptive`) | `mixedVideoLayout: 1` | un publicador llena el lienzo; varios se reparten en ventanas iguales |
| con pantalla (`screen`) | `mixedVideoLayout: 2, maxResolutionUid: '2'` | la pantalla en la ventana grande, las cámaras en columna |

- **La fuente es la presencia**, no un estado nuevo: el host ya emite `screen_share { active }` por socket en los dos modos (`AgoraLiveRoom.js`) y `eventSocket.js` lo guarda en `entry.screenSharing`. Se expone un lector `isHostScreenSharing(eventId)` en el objeto que devuelve `eventSocket` y el servicio lo recibe inyectado; nunca copia el dato.
- **El diseño aplicado se guarda** en `event_recordings.applied_layout` y el reconciliador (D8) lo compara con el deseado en cada pasada, llamando a `updateLayout` (sólo `mix`) si difieren. Un `updateLayout` fallido no es fatal —la pantalla sigue grabándose, sólo que más pequeña— y se reintenta en la pasada siguiente. El manejador `screen_share` dispara una reconciliación inmediata para que el cambio no espere 30 s.
- **Reemisión tras la (re)unión.** La presencia vive en memoria y se pierde si la api se reinicia; el efecto del host sólo emite al cambiar `room.screenEnabled`. `useEventRoomSocket` expone `joinVersion`, que sube en cada unión confirmada, y el efecto lo añade a sus dependencias para que el host vuelva a declarar su estado tras cada unión. `joined` no sirve: una reconexión automática de Socket.IO pasa de verdadero a verdadero sin pasar por falso, y el efecto no se volvería a ejecutar. Sin esto, una grabación reanudada tras un reinicio usaría el diseño adaptativo con la pantalla compartida en curso.
- *Descartados*: replicar `BroadcastStage` con `mixedVideoLayout: 3` (diseño a medida con coordenadas por uid: dejaría un hueco negro para la pantalla el 95 % del evento y obligaría a mantener una segunda copia de la lógica de escena, el error que `zoneResolver` documenta); vertical fijo desde el inicio (comportamiento no documentado cuando `maxResolutionUid` no publica).

### D5. `meeting`: `individual`, una pista por uid

```jsonc
recordingConfig: {
  channelType: 1, streamTypes: 2, videoStreamType: 0, maxIdleTime: 1800,
  streamMode: 'standard',
  subscribeVideoUids: ['#allstream#'], subscribeAudioUids: ['#allstream#'],
  subscribeUidGroup: 4            // 18–32 uids
},
recordingFileConfig: { avFileType: ['hls'] }   // 'mp4' no existe en este modo
```

- **Sin MP4.** La referencia de `avFileType` lo excluye de `individual`, y con VP8 en el cliente la salida por uid es índice MPD + segmentos WebM (`streamMode: 'standard'`: *«If VP8 encoding is used on the Web client, a merged MPD file is generated instead»*) más el índice M3U8 del audio. La conversión (`convert_v2.py` de Agora, Python 3.12 con ffmpeg incluido) exige Linux AMD64 —la instancia es ARM64— y queda fuera de la aplicación, documentada en `docs/grabaciones-eventos.md`. Cambiar el cliente a H.264 se descarta: toca a todos los clientes de todos los eventos para mejorar el formato de un fichero de archivo.
- **`subscribeUidGroup: 4`.** El techo de `meeting` son 17 publicadores (16 asistentes + host, `validateProviderRules`), que cabrían en el grupo 3 (13–17). El grupo es una estimación de pico para reservar recursos, no una tarifa: sobreestimar no cuesta y quedarse corto sí.
- La pantalla compartida en `meeting` sustituye a la cámara **en el mismo uid** (`screenShareMode: 'swap'`), así que la pista de vídeo de ese uid cambia de resolución a mitad de fichero. Aceptado.

### D6. Almacenamiento: un bucket dedicado por entorno, privado y con caducidad

- `vendor: 1` (Amazon S3), `region` por tabla de Agora (`eu-west-1 → 4`; se mapean las regiones europeas publicadas y cualquier otra hace fallar el arranque). **No puede ser `eu-south-2` (España)**, donde vive el bucket de medios: no figura en la tabla de regiones S3 de Agora. Irlanda sigue siendo UE, que es lo que importa para el RGPD.
- **`fileNamePrefix: ['eventos', <eventId sin guiones>, <recordingId sin guiones>]`.** Agora sólo admite `a-z A-Z 0-9` en cada elemento, ≤ 128 caracteres en total; nuestros ids son `randomUUID()` con guiones, que darían un 400 en el primer `start` real. Queda `eventos/<32 hex>/<32 hex>/` (73 caracteres). Cada tarea tiene su carpeta; las reanudaciones no se pisan.
- **Block Public Access activado.** Nada se sirve por CloudFront ni lleva `Cache-Control: immutable`: una grabación de un evento de pago no puede quedar pública.
- **Un bucket y una llave por entorno** (producción y preproducción): una llave filtrada de preproducción no puede escribir en las grabaciones reales, y los ficheros de prueba no se mezclan con las de asistentes reales, que son las sujetas a la política de privacidad y a las peticiones de supresión. Un solo bucket compartido también funcionaría sin cambiar código (mismo nombre y misma llave en los dos `.env`) y seguiría permitiendo verificar en preproducción; se descarta por esos dos motivos, a un coste de repetir los pasos de consola una vez.
- **Un solo proyecto de Agora para los dos entornos**, el que ya comparten hoy. El destino de la grabación no se configura en la consola de Agora sino en cada `start` (`storageConfig`), así que el mismo proyecto escribe en el bucket de cada entorno según qué api lo pida. Los canales no chocan (`event-<UUID>` de cada base de datos) y cada panel sólo conoce las tareas de su propia base de datos. Dos proyectos no separarían la facturación: los minutos gratuitos son por cuenta. Separarlos sólo aislaría el certificado de firma de tokens, algo que la grabación no cambia (staging ya puede firmar tokens de producción hoy); queda anotado como mejora de seguridad independiente, y también por si algún día se usan webhooks de Agora, que en un proyecto compartido llegarían de los dos entornos a la misma URL.
- **Sin versionado**, a propósito: ver D14.
- `acquire` lleva `region: 'EU'`, que restringe el servicio de grabación a Europa.

### D7. Credencial de escritura: usuario IAM de sólo `s3:PutObject`

`start` exige `accessKey`/`secretKey` **dentro de la petición**. Opciones:

- **(A, elegida) Usuario IAM dedicado** con una única política: `s3:PutObject` sobre `arn:aws:s3:::<bucket-grabaciones>/*`. Sus claves van en `api/.env` (`AGORA_RECORDING_S3_ACCESS_KEY`/`SECRET_KEY`).
- **(B) STS temporal** asumido desde el rol de la instancia: el encadenamiento de roles limita la sesión a **1 hora**, así que un evento de 3 h más la subida posterior al `stop` necesita un bucle de renovación por `update` que sobreviva a reinicios de la api; si el token caduca durante la subida, los ficheros acaban en la copia de respaldo de Agora (`backuped`) y llegan tarde o no llegan. Y no funciona en preproducción, que no tiene rol.

A es más simple, no depende de la duración del evento ni de la ventana de subida, y funciona en cualquier entorno. Su radio de exposición si se filtra: añadir o sobrescribir objetos en **un** bucket durante, como mucho, los 30 días que vive cada objeto; sin leer, sin listar y sin borrar. La rotación de la clave está documentada en `docs/grabaciones-eventos.md`. **No contradice la regla del proyecto**: esa credencial no es de la aplicación —la aplicación nunca la usa para hablar con AWS— sino una credencial de escritura delegada a Agora. La aplicación sigue leyendo con el rol de la instancia, al que se añaden `s3:ListBucket`, `s3:GetObject` y `s3:GetLifecycleConfiguration` sobre el bucket de grabaciones. Escribe Agora, lee la aplicación y **borra el propio bucket** por su regla de ciclo de vida: la misma separación que las copias de la base de datos.

### D8. Un reconciliador es la autoridad del ciclo de vida

`api/scheduler/recordingScheduler.js` (node-cron, cada 30 s, arrancado sólo desde `api/server.js`, sin solapar pasadas) llama a `agoraRecordingService.reconcileEvent(eventId, { isHostScreenSharing })` para cada evento candidato: los `active` con grabación elegible y los que tengan una tarea viva. `reconcileEvent` lee el estado de la base de datos y converge:

```
tarea viva 'starting' con > 120 s  → 'failed' (arranque colgado; sin sid no se puede parar)
tarea viva 'recording':
   evento ya no graba              → stop  (stop_reason: event_ended | max_duration | recording_disabled)
   edad > 90 s y query = 404/salida → 'interrupted' + alerta; se trata como si no hubiera tarea viva
   mix y diseño deseado ≠ aplicado → updateLayout
tarea viva 'stopping' con > 120 s  → reintenta stop (404 ⇒ 'stopped')
sin tarea viva y el evento graba   → start, salvo tope de intentos, enfriamiento o techo
```

- **Las transiciones del evento no tienen lógica propia**: `eventAdminController.startEvent`, `eventAdminController.endEvent`, `eventController.endEvent`, `eventAdminController.markEventFinished` y el manejador `screen_share` llaman a la misma `reconcileEvent` sin esperarla (`.catch` a log). Son un atajo, no un requisito: si una ruta futura de fin de evento se olvida de llamarla, el reconciliador la para en ≤ 30 s. Una sola implementación, y el inicio no espera nunca a la REST de Agora (que el código ya documenta con POSTs de 7 s y 504).
- **Exclusión mutua en dos niveles.** Dentro del proceso, `reconcileEvent` se serializa por evento (mapa de promesas). En la base de datos, un **índice único parcial** `event_recordings(event_id) WHERE status IN ('starting','recording','stopping')` impide dos tareas vivas, y otro único `(event_id, attempt)` impide dos intentos con el mismo número —y, por tanto, el mismo uid de grabador—. El `INSERT` perdedor es un no-op.
- **Estados.** `starting` → `recording` → `stopping` → `stopped`; `interrupted` y `failed` como salidas anómalas. `resource_id` se persiste tras `acquire` y `sid` inmediatamente tras `start` para acotar la ventana en que un fallo del proceso deja un grabador sin localizar.
- **Sondeo, no webhook.** El servicio de notificaciones de Agora exigiría un endpoint público, un secreto, configuración en consola y tolerar entregas duplicadas y desordenadas, y seguiría sin cubrir los casos en que la api está caída. `query` cada 30 s detecta una tarea muerta en ≤ 30 s con cero infraestructura nueva; lo que sólo el webhook sabría (la subida posterior al `stop`) se ve en el propio bucket (D11). `query` no se llama en los primeros 90 s de una tarea: la documentación pide esperar a la primera porción (15 s en `mix`, 1 min en `individual`).

### D9. Límites: techo, reintentos, uids y fusibles

- **Techo de 180 min** (`RECORDING_MAX_MINUTES`) desde el `started_at` de la **primera** tarea del evento. Es lo que para la grabación de un evento que nadie finaliza (el host cierra la pestaña sin «Finalizar»), que se quedaría `active` para siempre. Pasado el techo, se para con `stop_reason = 'max_duration'` y no se reanuda. Consecuencia aceptada: si el admin inicia el evento mucho antes de que empiece la charla, ese tiempo cuenta.
- **Token del grabador sin renovación posible** (*«cloud recording doesn't support token updates»*): TTL = lo que queda de techo + 15 min, nunca el `DEFAULT_TOKEN_TTL_SECONDS` de 4 h. Rol `subscriber`: el grabador sólo se suscribe.
- **`maxIdleTime: 1800`.** Tolera que el host pierda la conexión hasta 30 min sin partir la grabación en trozos. El tiempo inactivo se factura como minutos de audio ($1,49/1.000 min): media hora sin nadie cuesta unos 4 céntimos.
- **Tope de 10 intentos por evento, enfriamiento de 60 s tras un fallo de arranque.** Una configuración rota (credenciales, bucket) no se arregla reintentando.
- **uid del grabador = `3 + attempt`** (3…12), dentro de la franja reservada 1–100 que nunca se asigna a asistentes. `acquire` rechaza un uid que ya esté en el canal; un uid por intento evita que un grabador «fantasma» de un intento perdido bloquee todos los siguientes.
- **Fusibles si la api está caída**: al acabar el evento se van todos del canal y el grabador sale a los 30 min (`maxIdleTime`); como tope absoluto, el token caduca. Al volver la api, el reconciliador para lo que quede.

### D10. Alertas y secretos

- Por tres canales, mismo patrón que `dbBackupService.runBackupSafely`: `logger.error`, Sentry cargado de forma perezosa y nunca en test, y email a `BUSINESS_EMAIL` (`emailService.sendRecordingAlertEmail`). Nunca escapan del reconciliador.
- Tipos: `start_failed` (una vez por evento), `interrupted` (una por tarea), `gave_up` (una por evento, al agotar los intentos; un techo alcanzado con la grabación caída ya se avisó como `interrupted` o `start_failed`), `stop_failed` (una por tarea) y `retention_rule_missing` (una por arranque, D14). Deduplicación en memoria; un reinicio puede repetir un email, lo que se acepta.
- **Los cuerpos de `acquire`/`start` llevan la clave del bucket y el token**: nunca se registran, ni en éxito ni en error. Los logs llevan `{ eventId, recordingId, mode, cname, uid, httpStatus, agoraCode }`. Hay un test que lo afirma, como en `sendcloudAuth.test.js`.

### D11. Acceso del admin: el bucket es la fuente de verdad

- `GET /api/admin/events/recording/availability` → `{ recordingAvailable, downloadsAvailable }`. La primera es `config.recording.enabled` (el formulario la usa para no ofrecer una casilla que no haría nada); la segunda es `config.useS3`, el criterio ya establecido para «este entorno tiene credenciales AWS de la aplicación». Se declara por encima de las rutas `/:id`.
- `GET /api/admin/events/:id/recordings` lista las tareas y, si hay credenciales, los objetos bajo el prefijo de cada una (`ListObjectsV2` paginado). Leer el bucket y no el `fileList` de `stop` hace que el panel sea correcto también para tareas interrumpidas, que nunca devolvieron `fileList`. En `mix` devuelve los MP4 con su tamaño; en `individual`, los agrupa por uid extrayéndolo del nombre (`__uid_s_<uid>__uid_e_<tipo>`) y los cruza con `event_attendees.agora_uid` (uid 1 = host del evento): nombre, pistas presentes, número de objetos y bytes. Coste conocido: una reunión de 3 h con 17 personas son del orden de decenas de miles de segmentos y varias decenas de páginas de listado; es una pantalla de uso esporádico.
- `GET /api/admin/events/:id/recordings/:recordingId/download?file=<nombre>.mp4` → `{ url }`: URL prefirmada de 15 min con `Content-Disposition: attachment`, generada **al pulsar**, no al listar. Las URL firmadas con credenciales temporales del rol dejan de valer cuando caducan esas credenciales, así que una URL precalculada al abrir la página podría estar muerta al usarla. S3 valida la firma al iniciar la petición, así que una descarga larga no se corta. El nombre se valida con `^[A-Za-z0-9_.-]+\.mp4$`, la tarea debe ser del evento y de modo `mix`, y la clave se construye en el servidor a partir del prefijo guardado en la fila.
- Cada tarea lleva `availableUntil` = fecha de `started_at` + 30 días, calculado en el servidor (una sola fuente para el panel). Es la fecha más temprana en que S3 empieza a borrar sus objetos. Si el listado del bucket vuelve vacío y esa fecha ya pasó, la tarea se presenta como «Eliminada por el plazo de conservación»; si vuelve vacío antes, como «Sin ficheros». El bucket sigue siendo la verdad: la constante sólo explica lo que se ve.
- Las pistas de una reunión no se descargan por la web: son miles de ficheros que sólo sirven juntos. El panel muestra el comando exacto de AWS CLI para la sesión completa y para cada participante (`--exclude "*" --include "*__uid_s_<uid>__*"`), construido en el cliente a partir del bucket y el prefijo.
- Nada pasa por el contenedor `api`: ni streaming de ficheros ni ZIPs.

### D12. Información a los participantes

- Insignia «Grabando» (componente único `RecordingBadge`) en la cabecera de escritorio, la barra superior compacta, el cromo horizontal y la consola del host, mientras el evento está `active` y es grabable según el predicado del cliente.
- **Refleja la configuración, no el estado de la tarea.** Un estado en vivo exigiría una señal nueva hasta cada navegador, y el fallo que evita la insignia de configuración es el seguro: informar de más nunca vulnera la privacidad de nadie. Quien necesita saber que una grabación ha fallado es el admin, y lo sabe por la alerta.
- Aviso previo en la ficha del evento y en `EventAccessModal`, con texto distinto por modo: en `broadcast` sólo se graba a quien interviene; en `meeting`, a todo el que tenga cámara o micrófono activos. Los dos dicen que la grabación se conserva 30 días y enlazan a la política de privacidad.
- Textos en `EVENT_RECORDING_COPY` (`client/lib/constants.js`).
- **Política de privacidad**: apartado propio «Grabación de eventos en directo» con qué se graba en cada modo (imagen y voz de quienes intervienen), finalidad (consulta y reutilización del contenido del evento), base legal, encargados (Agora procesa la grabación en su región europea y Amazon Web Services la almacena en la UE), conservación de **30 días naturales** con eliminación automática, y cómo pedir la supresión anticipada. Base legal: para el host y el co-presentador, la relación que les une con la galería para impartir el evento; para los asistentes que intervienen, su consentimiento, que prestan al activar la cámara o el micrófono tras el aviso. Es un consentimiento libre porque se puede asistir sin ser grabado: en `broadcast` sólo se graba a quien recibe la palabra, y en `meeting`, a quien activa cámara o micrófono. Se actualiza la fecha de «Última actualización».
- **Normas de los eventos**: los eventos marcados se graban, se avisa antes de entrar y durante el evento, y la grabación se conserva 30 días.
- La supresión anticipada es practicable gracias a la forma de grabar: en `meeting` basta con borrar las pistas del uid de quien la pide; en `broadcast` la mezcla es un único fichero, así que se borra la grabación entera o se edita fuera. El procedimiento manual está en `docs/grabaciones-eventos.md`.

### D13. Configuración y aislamiento

- Variables: `AGORA_RECORDING_S3_BUCKET`, `AGORA_RECORDING_S3_REGION` (por defecto `eu-west-1`), `AGORA_RECORDING_S3_ACCESS_KEY`, `AGORA_RECORDING_S3_SECRET_KEY`. **Activación por configuración presente**, como las copias. Configuración **parcial** (alguna sí y alguna no, o grabación configurada sin las cuatro credenciales de Agora) hace fallar el arranque nombrando lo que falta: una casilla que se marca y no graba es el fallo silencioso que este proyecto no admite.
- `config.recording.enabled` es falso siempre bajo `NODE_ENV=test`, y `.env.test` define las cuatro variables con valores ficticios **a propósito**, para que esa afirmación signifique algo (mismo criterio que `DB_BACKUP_ENABLED=true`).
- El cliente REST de grabación usa un transporte inyectable; el transporte por defecto **lanza** bajo test, así que un test que olvide inyectar uno falla en lugar de llamar a Agora. El scheduler sólo arranca desde `server.js`, que los tests no importan.

### D14. Conservación: 30 días naturales, aplicados por el bucket

- **La caducidad es una regla de ciclo de vida del bucket**, no código: `Expiration: 30 días` sobre `eventos/` y `AbortIncompleteMultipartUpload: 1 día`. Las partes de una subida multiparte interrumpida (Agora sube MP4 de varios GB) también contienen imagen y voz, y sin la segunda regla sobrevivirían al plazo y se facturarían. La aplicación sigue sin borrar nada, igual que las copias de la base de datos con su regla de 15 días en `daily/`.
- **Sin versionado.** Con versionado, la expiración sólo añade una marca de borrado y el objeto sigue vivo como versión anterior hasta que otra regla lo elimine: una tercera regla que, si falta, deja las grabaciones para siempre sin que nada lo muestre. Y cualquier ventana de recuperación de versiones anteriores alarga la conservación más allá de los 30 días. El versionado protegía de una llave filtrada que sobrescribiera ficheros; con objetos que viven 30 días y una llave que no puede leer, esa protección no compensa el riesgo legal.
- **Comprobación al arrancar, sólo donde hay credenciales**: cuando `config.recording.enabled` y `config.useS3`, el scheduler lee `GetBucketLifecycleConfiguration` al arrancar y exige una regla `Enabled` que expire `eventos/` (o el bucket entero) en ≤ `RECORDING_RETENTION_DAYS` (30) días. Si falta, es más larga o la lectura falla, avisa por los tres canales (tipo `retention_rule_missing`, una vez por arranque). No impide grabar: parar las grabaciones por una regla ausente sería castigar el evento por un fallo de configuración que el aviso ya hace visible. En preproducción, sin credenciales, la regla se comprueba a mano en la consola.
- **S3 aplica la regla de forma asíncrona**, contando desde la creación de cada objeto y redondeando a la medianoche UTC siguiente: el borrado real puede llegar uno o dos días después del día 30. La política de privacidad habla de eliminación automática transcurridos 30 días naturales, que es cierto.
- **Consecuencia de producto**: reutilizar una grabación exige descargarla antes de que caduque. El panel lo dice con la fecha de cada tarea.

## Risks / Trade-offs

- [La tarifa del `mix` podría depender del lienzo de salida y no de los flujos grabados] → la documentación dice lo segundo; se comprueba en la primera factura con eventos grabados. Si fuera lo primero, bajar el lienzo a 1280×720 es un cambio de una constante.
- [La geometría real de los diseños adaptativo y vertical no está documentada con cifras] → verificación visual en preproducción de cada estado (host solo, host + co-presentador, host + pantalla, los tres) antes de producción.
- [El grabador con token `subscriber` bajo Co-host authentication, o la política de sólo `PutObject`, podrían no bastar a Agora] → primera verificación en preproducción; la corrección sería el permiso mínimo adicional que Agora declare, nunca abrir el bucket.
- [Un fallo del proceso entre `start` y persistir `sid` deja un grabador sin localizar] → ventana de milisegundos; sus ficheros llegan igualmente al prefijo de la tarea (fijado antes del `start`), y el grabador sale solo por `maxIdleTime` o por la caducidad del token.
- [La insignia puede decir «Grabando» con la tarea caída] → decisión deliberada (D12); el admin recibe la alerta.
- [La presencia se pierde al reiniciar la api] → reemisión de `screen_share` tras la unión (D4); en el peor caso la pantalla se graba en el diseño adaptativo hasta el siguiente cambio.
- [El techo cuenta desde la primera tarea, que arranca cuando el admin inicia el evento] → aceptado; está en el texto de ayuda de la casilla.
- [Listar una reunión larga son muchas páginas de `ListObjectsV2`] → pantalla de uso esporádico; si molesta, se guarda un resumen por tarea tras la subida.
- [La casilla puede marcarse en un evento LiveKit o de vídeo] → se guarda y se ignora, como los flags de host; el predicado impide tanto la grabación como la insignia.
- [Los eventos LiveKit no se graban] → fuera de alcance por decisión.
- [Alguien olvida crear la regla de ciclo de vida del bucket, y las grabaciones se conservan más de 30 días en contra de la política de privacidad] → comprobación al arrancar en producción con aviso por los tres canales (D14); en preproducción, paso de la lista de verificación.
- [Un admin necesita una grabación después de 30 días] → no es recuperable, por decisión; el panel muestra la fecha límite de cada una.
- [El texto legal es una propuesta técnica, no un dictamen] → conviene que lo revise quien lleve lo jurídico antes de publicarlo.

## Migration Plan

1. **AWS, dos veces (producción y preproducción)**: bucket de grabaciones en `eu-west-1` con Block Public Access, sin versionado, con las reglas de ciclo de vida de D14; usuario IAM propio con la política de sólo `s3:PutObject` sobre su bucket. Sólo en producción: `s3:ListBucket`, `s3:GetObject` y `s3:GetLifecycleConfiguration` sobre el bucket de grabaciones, añadidos al rol de la instancia. Procedimiento completo en `docs/grabaciones-eventos.md`.
2. **Agora**: activar Cloud Recording **una vez** en el proyecto «140d», que comparten los dos entornos.
3. **Variables** en el fichero de entorno de la api de cada entorno: `api/.env` en producción, `api/.env.staging` en staging (`docker-compose.pre2.yml`).
4. **Despliegue** con `./deploy/deploy.sh` (api y cliente juntos por la casilla del formulario). `initializeDatabase()` crea la tabla y la columna; `DEFAULT 0` sin backfill.
5. **Verificación en preproducción** con su propio bucket y usuario IAM (matriz en `tasks.md`), comprobando los ficheros y la regla de ciclo de vida en la consola de S3, ya que allí no hay credenciales de lectura para el panel. El listado y la descarga desde el panel se verifican con la primera grabación de producción.
6. **Vuelta atrás**: vaciar las variables desactiva la función entera (el reconciliador no arranca nada y la casilla desaparece); la columna y la tabla son inertes.

## Open Questions

- Ajuste fino de `bitrate`/`fps` del lienzo tras ver los primeros ficheros.

Resueltas: conservación de **30 días naturales** (D14), **bucket y llave propios para preproducción** (D6) y **un solo proyecto de Agora para los dos entornos** (D6).
