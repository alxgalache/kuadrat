## ADDED Requirements

### Requirement: Casilla de grabación por evento

La tabla `events` SHALL tener la columna `recording_enabled INTEGER NOT NULL DEFAULT 0`, declarada en el `CREATE TABLE` de `api/config/database.js` y añadida a las bases existentes con `safeAlter`, sin backfill: todo evento anterior al cambio queda sin grabar.

El valor SHALL escribirse por las mismas plazas que los flags de host: `createEventSchema` y `updateEventSchema` en `api/validators/eventSchemas.js` (aceptando `true`/`false`/`0`/`1` y rechazando cualquier otro valor), la conversión `toFlag` de `api/controllers/eventAdminController.js`, la lista de columnas del `INSERT` de `eventService.createEvent` y la lista blanca `allowedFields` de `eventService.updateEvent`.

El valor SHALL guardarse sea cual sea el proveedor o el formato, y SHALL tener efecto sólo cuando el evento es elegible (ver «Predicado de grabación»). Como cualquier otro campo, NO SHALL poder cambiarse con el evento `active` o `finished`: la edición de esos eventos ya está bloqueada.

#### Scenario: Evento nuevo con grabación
- **WHEN** el admin crea un evento Agora en directo con `recording_enabled: true`
- **THEN** la fila guardada SHALL tener `recording_enabled = 1`

#### Scenario: Edición que desactiva la grabación
- **WHEN** el admin edita un evento `scheduled` con `recording_enabled: 0`
- **THEN** la fila SHALL quedar con `recording_enabled = 0`

#### Scenario: Valor inválido
- **WHEN** la petición trae `recording_enabled: "sí"`
- **THEN** la API SHALL responder 400 y no guardar nada

#### Scenario: Evento anterior al cambio
- **WHEN** arranca la api sobre una base de datos existente
- **THEN** todos los eventos existentes SHALL tener `recording_enabled = 0`

### Requirement: Casilla de grabación en el formulario de admin

Las pantallas `client/app/admin/espacios/nuevo/page.js` y `client/app/admin/espacios/[id]/page.js` SHALL mostrar la casilla «Grabar el evento (audio y vídeo)» sólo cuando el formulario tenga `provider = 'agora'` y `format = 'live'`, en los dos modos de interacción.

Debajo SHALL mostrar un texto de ayuda según el modo: en `broadcast`, que se guarda un único vídeo con todo lo que aparece en escena (cámaras y pantalla compartida) y el audio de todos; en `meeting`, que se guarda una pista de audio y otra de vídeo por cada participante. En los dos, que la grabación se detiene sola a las 3 horas del inicio del evento y que los asistentes verán un aviso.

Cuando `GET /api/admin/events/recording/availability` devuelva `recordingAvailable: false`, la casilla SHALL mostrarse deshabilitada con el texto «La grabación no está configurada en este entorno». Los textos SHALL vivir en `EVENT_RECORDING_COPY` de `client/lib/constants.js`.

#### Scenario: Evento LiveKit
- **WHEN** el formulario tiene `provider = 'livekit'`
- **THEN** la casilla NO SHALL mostrarse

#### Scenario: Entorno sin grabación configurada
- **WHEN** el servidor responde `recordingAvailable: false`
- **THEN** la casilla SHALL verse deshabilitada con la explicación

### Requirement: Predicado de grabación

La elegibilidad de un evento para grabarse SHALL decidirse en un único predicado por lado —`api/utils/eventRecording.js` y `client/lib/eventRecording.js`— y en ningún otro sitio: `recording_enabled = 1` y `provider = 'agora'` y `format = 'live'`. El servidor SHALL grabar sólo mientras, además, el evento esté `active`.

El modo de grabación NO SHALL elegirse: SHALL derivarse de `interaction_mode`, `broadcast → mix` y `meeting → individual`.

#### Scenario: Evento de vídeo con la casilla marcada
- **WHEN** un evento `format = 'video'` tiene `recording_enabled = 1` y pasa a `active`
- **THEN** NO SHALL arrancarse ninguna grabación

#### Scenario: Modo derivado
- **WHEN** arranca la grabación de un evento `meeting`
- **THEN** la tarea SHALL crearse en modo `individual`

### Requirement: Grabación de un evento broadcast

La grabación de un evento `broadcast` SHALL usar el modo `mix` de Agora Cloud Recording con esta configuración:
- `channelType: 1`, `streamTypes: 2`, `videoStreamType: 0` (flujo alto).
- `subscribeVideoUids: ['#allstream#']` y `subscribeAudioUids: ['#allstream#']`: todo lo que se publique en el canal —cámara del host, pantalla compartida (uid 2), co-presentador y promovidos— entra en el vídeo, y el audio de todos se mezcla.
- `audioProfile: 1` (48 kHz, mono, ~128 kbps). El valor por defecto `0` NO SHALL usarse.
- `transcodingConfig` con lienzo de 1920×1080, 30 fps, 3000 kbps y fondo negro, más el diseño de «Diseño del lienzo según la pantalla compartida».
- `recordingFileConfig.avFileType: ['hls', 'mp4']`.

#### Scenario: Host solo
- **WHEN** en un evento `broadcast` grabado sólo publica el host
- **THEN** el MP4 SHALL contener su cámara ocupando el lienzo y su audio

#### Scenario: Entrevista con co-presentador
- **WHEN** el admin co-presenta en un evento `broadcast` grabado
- **THEN** el MP4 SHALL contener las dos cámaras y el audio de los dos, aunque el co-presentador haya entrado después de arrancar la grabación

#### Scenario: Asistente promovido
- **WHEN** el host da la palabra a un asistente que habla sin cámara
- **THEN** su voz SHALL quedar en la mezcla de audio

### Requirement: Diseño del lienzo según la pantalla compartida

En modo `mix`, el diseño del lienzo SHALL derivarse de una única función pura `mixLayoutFor(screenSharing)`: `{ mixedVideoLayout: 1 }` (adaptativo) sin pantalla compartida, y `{ mixedVideoLayout: 2, maxResolutionUid: '2' }` (vertical con la pantalla en la ventana grande) con ella.

El estado de la pantalla compartida SHALL leerse de la presencia en memoria de `api/socket/eventSocket.js` (`entry.screenSharing` del host, fijado por el mensaje `screen_share`) mediante un lector `isHostScreenSharing(eventId)` expuesto por el objeto que devuelve `eventSocket`. NO SHALL copiarse a otro almacén. Si no hay presencia del host, SHALL tomarse como `false`.

El diseño aplicado a cada tarea SHALL guardarse en `event_recordings.applied_layout` (`'adaptive' | 'screen'`). Cuando el deseado difiera del aplicado, el sistema SHALL llamar a `updateLayout` y, sólo si responde con éxito, actualizar la columna. Un fallo de `updateLayout` NO SHALL detener la grabación y SHALL reintentarse en la siguiente reconciliación. El manejador `screen_share` SHALL disparar una reconciliación inmediata del evento.

#### Scenario: El host empieza a compartir pantalla
- **WHEN** el host de un evento `broadcast` grabado emite `screen_share { active: true }`
- **THEN** el sistema SHALL llamar a `updateLayout` con el diseño vertical y `maxResolutionUid: '2'`
- **AND** `applied_layout` SHALL pasar a `'screen'`

#### Scenario: El host deja de compartir
- **WHEN** el host emite `screen_share { active: false }`
- **THEN** el sistema SHALL volver al diseño adaptativo

#### Scenario: Fallo de updateLayout
- **WHEN** `updateLayout` responde con error
- **THEN** la tarea SHALL seguir en `recording` con su `applied_layout` anterior
- **AND** la siguiente reconciliación SHALL volver a intentarlo

#### Scenario: Grabación reanudada con la pantalla ya compartida
- **WHEN** arranca una tarea nueva mientras el host comparte pantalla
- **THEN** el `start` SHALL llevar ya el diseño vertical

### Requirement: Reemisión del estado de pantalla compartida tras la unión

El host SHALL volver a emitir `screen_share` con su estado actual cada vez que se une o se reúne a la sala Socket.IO del evento, no sólo cuando cambia `room.screenEnabled` (`client/components/AgoraLiveRoom.js`). La señal de «me acabo de unir» SHALL ser un contador de uniones confirmadas (`joinVersion` de `client/hooks/useEventRoomSocket.js`), no `joined`, que en una reconexión automática pasa de verdadero a verdadero. Sin ello, un reinicio de la api borra la presencia y el diseño deseado de la grabación queda en adaptativo con la pantalla compartida en curso.

#### Scenario: Reinicio de la api con la pantalla compartida
- **WHEN** la api se reinicia mientras el host comparte pantalla y su socket vuelve a unirse
- **THEN** la presencia del host SHALL volver a tener `screenSharing = true`

### Requirement: Grabación de un evento meeting

La grabación de un evento `meeting` SHALL usar el modo `individual` con `channelType: 1`, `streamTypes: 2`, `videoStreamType: 0`, `streamMode: 'standard'`, `subscribeVideoUids` y `subscribeAudioUids` a `['#allstream#']`, `subscribeUidGroup: 4` y `recordingFileConfig.avFileType: ['hls']`. NO SHALL pedirse `mp4`, que en este modo es un error.

El resultado SHALL ser una pista de audio y una de vídeo por cada uid que publique, incluidos los participantes que entren después de arrancar la grabación. Con el cliente publicando VP8, el vídeo SHALL quedar en segmentos WebM con índice MPD; ese formato se acepta y la conversión a MP4 queda fuera de la aplicación.

#### Scenario: Participante que entra tarde
- **WHEN** un asistente entra en una reunión grabada media hora después de arrancar la grabación
- **THEN** sus pistas de audio y vídeo SHALL aparecer en la carpeta de la tarea con su uid en el nombre

#### Scenario: Petición de MP4
- **WHEN** se construye la petición de `start` de una reunión
- **THEN** `avFileType` SHALL ser exactamente `['hls']`

### Requirement: Almacenamiento de las grabaciones

Toda tarea SHALL escribir en el bucket configurado (`vendor: 1`, `region` según la tabla de regiones de Agora para `AGORA_RECORDING_S3_REGION`) bajo `fileNamePrefix: ['eventos', <eventId sin guiones>, <recordingId sin guiones>]`. Cada elemento SHALL cumplir `^[A-Za-z0-9]+$` y el prefijo completo, con separadores, SHALL medir como máximo 128 caracteres. El bucket y el prefijo resultante SHALL guardarse en la fila de la tarea (`s3_bucket`, `s3_prefix`).

Una región sin código de Agora conocido SHALL hacer fallar el arranque de la api cuando la grabación esté configurada.

Cada entorno (producción y preproducción) SHALL tener su propio bucket y su propio usuario IAM. El bucket SHALL tener Block Public Access activado y el versionado desactivado.

#### Scenario: Id con guiones
- **WHEN** se construye el `storageConfig` de un evento cuyo id es un UUID con guiones
- **THEN** ningún elemento de `fileNamePrefix` SHALL contener guiones

#### Scenario: Reanudación
- **WHEN** un evento tiene dos tareas por una interrupción
- **THEN** cada una SHALL tener su propia carpeta

### Requirement: Conservación de 30 días naturales

Las grabaciones SHALL conservarse 30 días naturales (`RECORDING_RETENTION_DAYS = 30`) y eliminarse después sin intervención humana. La eliminación SHALL aplicarla una regla de ciclo de vida del propio bucket —`Expiration` de 30 días sobre `eventos/` y `AbortIncompleteMultipartUpload` de 1 día—; la aplicación NO SHALL borrar objetos de grabación. El bucket NO SHALL tener versionado, porque con versionado la expiración deja el objeto vivo como versión anterior.

Cuando `config.recording.enabled` y `config.useS3` sean verdaderos, el scheduler de grabación SHALL leer al arrancar la configuración de ciclo de vida del bucket (`GetBucketLifecycleConfiguration`, función nueva en `api/services/s3Service.js`) y exigir una regla `Enabled` que expire `eventos/` —o el bucket entero— en 30 días o menos. Si no existe, es más larga o la lectura falla, SHALL avisar por los tres canales con el tipo `retention_rule_missing`, una vez por arranque, sin impedir las grabaciones.

#### Scenario: Regla correcta
- **WHEN** el bucket de producción tiene una regla activa que expira `eventos/` a los 30 días
- **THEN** el arranque del scheduler NO SHALL emitir ninguna alerta

#### Scenario: Regla ausente
- **WHEN** el bucket de producción no tiene reglas de ciclo de vida
- **THEN** SHALL enviarse un email `retention_rule_missing` a `BUSINESS_EMAIL`
- **AND** las grabaciones SHALL seguir arrancando

#### Scenario: Regla más larga que el plazo
- **WHEN** la única regla expira los objetos a los 90 días
- **THEN** SHALL emitirse la alerta `retention_rule_missing`

#### Scenario: Entorno sin credenciales de lectura
- **WHEN** arranca la api de preproducción, con grabación pero sin `config.useS3`
- **THEN** NO SHALL leerse la configuración del bucket ni emitirse alerta

### Requirement: Configuración y credencial delegada

`api/config/env.js` SHALL leer `AGORA_RECORDING_S3_BUCKET`, `AGORA_RECORDING_S3_REGION` (por defecto `eu-west-1`), `AGORA_RECORDING_S3_ACCESS_KEY` y `AGORA_RECORDING_S3_SECRET_KEY`, y exponer `config.recording.enabled`.

- La grabación SHALL activarse por configuración presente: las cuatro variables de grabación más `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_ID` y `AGORA_CUSTOMER_SECRET`.
- Si hay alguna variable de grabación definida pero falta alguna de las ocho, el arranque SHALL fallar con un mensaje que nombre lo que falta.
- Bajo `NODE_ENV=test`, `config.recording.enabled` SHALL ser `false` siempre. `api/.env.test` SHALL definir las cuatro variables con valores ficticios, a propósito.
- La clave de acceso SHALL ser la de un usuario IAM cuya única política es `s3:PutObject` sobre el bucket de grabaciones. La aplicación NO SHALL usarla para ninguna llamada propia a AWS.

#### Scenario: Configuración parcial
- **WHEN** está definido `AGORA_RECORDING_S3_BUCKET` pero no `AGORA_RECORDING_S3_SECRET_KEY`
- **THEN** la api NO SHALL arrancar y el error SHALL nombrar la variable que falta

#### Scenario: Sin configurar
- **WHEN** ninguna variable de grabación está definida
- **THEN** la api SHALL arrancar con `config.recording.enabled = false`

#### Scenario: En test
- **WHEN** la suite se ejecuta con `.env.test`
- **THEN** `config.recording.enabled` SHALL ser `false` aunque las variables estén definidas

### Requirement: Registro de tareas de grabación

Cada tarea de Agora SHALL tener una fila en la tabla nueva `event_recordings` (declarada en `api/config/database.js`) con, al menos: `id`, `event_id`, `mode` (`'mix' | 'individual'`), `attempt`, `recorder_uid`, `status` (`'starting' | 'recording' | 'stopping' | 'stopped' | 'interrupted' | 'failed'`), `stop_reason` (`'event_ended' | 'max_duration' | 'recording_disabled'`), `resource_id`, `sid`, `s3_bucket`, `s3_prefix`, `applied_layout`, `upload_status`, `file_list`, `error`, `created_at`, `started_at`, `stopped_at` y `updated_at`.

Un índice único parcial sobre `event_id` con `status IN ('starting','recording','stopping')` SHALL impedir dos tareas vivas del mismo evento, y un índice único sobre `(event_id, attempt)` SHALL impedir dos intentos con el mismo número. Ningún comentario dentro del `CREATE TABLE` SHALL terminar una línea en punto y coma ni contener una barra invertida.

#### Scenario: Dos arranques simultáneos
- **WHEN** la transición de inicio del evento y una pasada del scheduler intentan arrancar la grabación a la vez
- **THEN** SHALL existir exactamente una tarea viva para el evento
- **AND** el intento perdedor SHALL terminar sin error y sin llamar a Agora

### Requirement: Reconciliador del ciclo de vida

`api/services/agoraRecordingService.js` SHALL exponer `reconcileEvent(eventId, { isHostScreenSharing })`, que lee el estado del evento y de sus tareas y hace converger la realidad con él: arrancar si el evento debe grabarse y no hay tarea viva, parar si hay tarea viva y no debe grabarse, detectar interrupciones y ajustar el diseño. Las llamadas SHALL serializarse por evento dentro del proceso.

`api/scheduler/recordingScheduler.js` SHALL ejecutar `reconcileEvent` cada 30 segundos para cada evento `active` con grabación elegible y para cada evento con una tarea viva, sin solapar pasadas. SHALL arrancarse sólo desde `api/server.js`.

Además, SHALL llamarse a `reconcileEvent` sin esperar su resultado y registrando su error desde `eventAdminController.startEvent`, `eventAdminController.endEvent`, `eventController.endEvent`, `eventAdminController.markEventFinished` y el manejador `screen_share` de `eventSocket.js`. Ninguna de esas rutas SHALL esperar a Agora ni fallar por un error de grabación.

#### Scenario: Inicio del evento
- **WHEN** el admin inicia un evento Agora en directo con grabación
- **THEN** la respuesta de inicio NO SHALL esperar a la API de Agora
- **AND** SHALL crearse una tarea sin esperar a la siguiente pasada del scheduler

#### Scenario: Ruta de fin que no avisa
- **WHEN** un evento pasa a `finished` por una ruta que no llama a `reconcileEvent`
- **THEN** la siguiente pasada del scheduler SHALL parar la tarea viva

#### Scenario: Agora no responde al iniciar
- **WHEN** Agora tarda o devuelve un 504 al arrancar la grabación
- **THEN** el evento SHALL quedar `active` y los participantes SHALL poder entrar

### Requirement: Arranque de una tarea

Arrancar SHALL consistir en: insertar la fila en `starting`, llamar a `acquire` y guardar `resource_id`, llamar a `start` y guardar `sid` y `started_at` pasando a `recording`. Si falla cualquier paso, la fila SHALL quedar en `failed` con el error.

- `acquire` SHALL llevar `scene: 0`, `region: 'EU'`, `resourceExpiredHour: 24` y un `startParameter` idéntico al `clientRequest` del `start`.
- El `uid` del grabador SHALL ser `3 + attempt`, con `attempt` desde 0; con el tope de 10 intentos queda en 3…12, dentro de la franja reservada que nunca se asigna a asistentes, y nunca 1 ni 2.
- El token del grabador SHALL generarse con `agoraService.generateRtcToken`, rol `subscriber`, y un TTL igual a lo que quede de la ventana de 180 minutos más 15 minutos. NO SHALL usarse `DEFAULT_TOKEN_TTL_SECONDS`.
- `maxIdleTime` SHALL ser 1800 segundos.
- La cabecera Basic de la REST SHALL ser la misma que usa la moderación en `api/services/agoraService.js` (compartida, no duplicada), y cada llamada SHALL acotarse con un tiempo máximo.

#### Scenario: Token de la primera tarea
- **WHEN** arranca la primera tarea de un evento
- **THEN** el TTL del token SHALL ser de 195 minutos

#### Scenario: Segundo intento
- **WHEN** arranca el segundo intento de un evento
- **THEN** el grabador SHALL usar el uid 4

#### Scenario: Arranque colgado
- **WHEN** una fila lleva más de 120 segundos en `starting`
- **THEN** la reconciliación SHALL marcarla `failed`

### Requirement: Parada de una tarea

Cuando un evento deje de deber grabarse —ya no está `active`, se ha superado el techo o la grabación ya no es elegible— la reconciliación SHALL pasar su tarea `recording` a `stopping` con un `UPDATE` condicional, llamar a `stop` con `async_stop: false` y guardar `file_list`, `upload_status`, `stopped_at` y el `stop_reason` (`'event_ended' | 'max_duration' | 'recording_disabled'`), dejando la fila en `stopped`.

Un `stop` que responda 404 SHALL tratarse como tarea ya terminada y dejar la fila en `stopped`. Una fila que lleve más de 120 segundos en `stopping` SHALL reintentar el `stop`.

#### Scenario: El host finaliza el stream
- **WHEN** el host pulsa «Finalizar stream» en un evento grabado
- **THEN** la tarea SHALL quedar `stopped` con `stop_reason = 'event_ended'`

#### Scenario: Dos paradas a la vez
- **WHEN** la transición de fin y una pasada del scheduler intentan parar la misma tarea
- **THEN** sólo una SHALL llamar a `stop`

### Requirement: Interrupción y reanudación acotada

Para cada tarea `recording` con más de 90 segundos, la reconciliación SHALL llamar a `query`. Si responde 404 o un estado de salida, la fila SHALL pasar a `interrupted` y, si el evento sigue debiendo grabarse, SHALL arrancarse una tarea nueva.

Los reintentos SHALL acotarse a 10 intentos por evento y a un enfriamiento de 60 segundos tras un arranque fallido. Al agotarse, NO SHALL arrancarse ninguna tarea más para ese evento.

#### Scenario: El grabador muere a mitad del evento
- **WHEN** `query` devuelve 404 para la tarea de un evento todavía `active`
- **THEN** la tarea SHALL quedar `interrupted`
- **AND** SHALL arrancarse una tarea nueva con el siguiente `attempt`

#### Scenario: Credenciales rotas
- **WHEN** todos los arranques de un evento fallan
- **THEN** SHALL haber como máximo 10 filas para ese evento
- **AND** entre dos intentos SHALL haber al menos 60 segundos

### Requirement: Techo de duración

Ninguna grabación SHALL superar 180 minutos (`RECORDING_MAX_MINUTES`) contados desde el `started_at` de la primera tarea del evento. Alcanzado el techo, la tarea viva SHALL pararse con `stop_reason = 'max_duration'` y NO SHALL arrancarse ninguna otra para ese evento.

#### Scenario: Evento que nadie finaliza
- **WHEN** un evento grabado sigue `active` 180 minutos después de arrancar su primera tarea
- **THEN** la tarea SHALL pararse con `stop_reason = 'max_duration'`
- **AND** las pasadas siguientes NO SHALL arrancar otra

### Requirement: Alertas de grabación

Los fallos de grabación SHALL avisarse por tres canales, con el mismo patrón que `dbBackupService.runBackupSafely`: `logger.error`, Sentry cargado de forma perezosa y nunca bajo test, y un email a `BUSINESS_EMAIL` mediante `emailService.sendRecordingAlertEmail`. Los tipos SHALL ser `start_failed` (una vez por evento), `interrupted` (una por tarea), `gave_up` (una por evento), `stop_failed` (una por tarea) y `retention_rule_missing` (una por arranque), deduplicados en memoria. Ninguna alerta SHALL propagar su propio error fuera del reconciliador.

#### Scenario: Primer arranque fallido
- **WHEN** falla el primer arranque de la grabación de un evento
- **THEN** SHALL enviarse un email a `BUSINESS_EMAIL` con el título del evento y el tipo `start_failed`

#### Scenario: Fallos repetidos
- **WHEN** fallan cinco arranques seguidos del mismo evento
- **THEN** SHALL haberse enviado un único email `start_failed` para ese evento

#### Scenario: Fallo al enviar la alerta
- **WHEN** el envío del email de alerta lanza un error
- **THEN** la reconciliación SHALL continuar con el resto de eventos

### Requirement: Secretos fuera de los registros

Los cuerpos de `acquire`, `start` y `update` contienen la clave del bucket y el token del grabador: NO SHALL registrarse nunca, ni en éxito ni en error, ni viajar a Sentry. Los registros de la REST de grabación SHALL limitarse a `{ eventId, recordingId, mode, cname, uid, httpStatus, agoraCode }`.

#### Scenario: Arranque rechazado
- **WHEN** Agora responde 400 a un `start`
- **THEN** ninguna línea de log SHALL contener el valor de `AGORA_RECORDING_S3_SECRET_KEY` ni el token

### Requirement: Aislamiento en test

Con `config.recording.enabled = false` (siempre bajo test), `reconcileEvent` NO SHALL arrancar tareas; sí SHALL parar las vivas que encuentre. Para ejercitar el servicio, los tests SHALL usar una costura explícita (`__configureForTests({ transport, storage })`) que habilita la grabación sólo dentro de ese módulo y sólo con `NODE_ENV=test`.

El transporte REST por defecto SHALL lanzar un error bajo `NODE_ENV=test`, de modo que un test que habilite la grabación y olvide inyectar el transporte falle en lugar de llamar a Agora. `api/tests/testEnvironmentIsolation.test.js` SHALL afirmar que la grabación está desactivada bajo test.

#### Scenario: Test sin transporte inyectado
- **WHEN** un test habilita la grabación con la costura pero sin transporte y reconcilia un evento grabable
- **THEN** la llamada a Agora SHALL fallar dentro del proceso sin salir a la red
- **AND** la tarea SHALL quedar `failed`

#### Scenario: Suite normal
- **WHEN** la suite reconcilia un evento grabable sin usar la costura
- **THEN** NO SHALL crearse ninguna tarea
