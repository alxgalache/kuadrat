## ADDED Requirements

### Requirement: Disponibilidad de la grabación por entorno

La API SHALL exponer `GET /api/admin/events/recording/availability` (JWT de admin, aplicado en `api/routes/admin/index.js`), declarado en `api/routes/admin/eventRoutes.js` **por encima** de las rutas `/:id` para que Express no lo lea como un id. SHALL responder con `sendSuccess` `{ recordingAvailable, downloadsAvailable }`:
- `recordingAvailable` = `config.recording.enabled`.
- `downloadsAvailable` = `config.useS3`, el criterio ya establecido para «este entorno tiene credenciales AWS de la aplicación» (rol de la instancia).

#### Scenario: Producción configurada
- **WHEN** el admin consulta la disponibilidad en un entorno con grabación y con S3 de medios
- **THEN** la respuesta SHALL ser `{ recordingAvailable: true, downloadsAvailable: true }`

#### Scenario: Usuario no admin
- **WHEN** un vendedor llama al endpoint
- **THEN** la API SHALL rechazarlo con el 401 que devuelve el middleware `adminAuth` existente

### Requirement: Listado de las grabaciones de un evento

La API SHALL exponer `GET /api/admin/events/:id/recordings`, que devuelve las tareas de `event_recordings` del evento ordenadas por `attempt` con su modo, estado, `stop_reason`, `upload_status`, `error`, fechas, bucket y prefijo, más `downloadsAvailable`.

Cuando `downloadsAvailable` sea verdadero, SHALL leer los objetos bajo el prefijo de cada tarea con `ListObjectsV2` paginado (función nueva en `api/services/s3Service.js`, credenciales del rol de la instancia) y adjuntar:
- en tareas `mix`: los ficheros `.mp4` con nombre y tamaño, en orden;
- en tareas `individual`: los participantes, según el requisito «Correspondencia de pistas y participantes».

Cada tarea SHALL llevar `availableUntil`, calculado en el servidor como la fecha de `started_at` más 30 días (la fecha más temprana en que S3 empieza a borrar sus objetos).

El bucket SHALL ser la fuente de verdad del contenido, no el `file_list` devuelto por `stop`: una tarea `interrupted` nunca devolvió `file_list` y sus ficheros existen igualmente. Cuando `downloadsAvailable` sea falso, la respuesta SHALL incluir el `file_list` guardado, si existe, y ninguna lista leída del bucket.

#### Scenario: Stream grabado con dos partes
- **WHEN** el admin consulta un evento `broadcast` cuya grabación se interrumpió y se reanudó
- **THEN** la respuesta SHALL traer dos tareas, cada una con sus MP4

#### Scenario: Grabación caducada
- **WHEN** el admin consulta un evento grabado hace 40 días
- **THEN** la tarea SHALL traer un `availableUntil` pasado y ningún fichero

#### Scenario: Entorno sin credenciales de lectura
- **WHEN** el admin consulta las grabaciones en preproducción
- **THEN** la respuesta SHALL traer las tareas con su bucket y su prefijo
- **AND** NO SHALL llamarse a S3

### Requirement: Correspondencia de pistas y participantes

En tareas `individual`, el listado SHALL agrupar los objetos por uid, extraído del nombre del fichero con el patrón `__uid_s_<uid>__uid_e_<tipo>`, y devolver por cada uid: su nombre, su papel, las pistas presentes (`audio`, `video`), el número de objetos y los bytes totales. El nombre SHALL resolverse así: uid `1` es el host del evento (`users.full_name` de `host_user_id`); cualquier otro uid se busca en `event_attendees.agora_uid` de ese evento (`first_name` + `last_name`); un uid sin coincidencia se muestra como «Participante (uid N)».

#### Scenario: Reunión con tres personas
- **WHEN** el admin consulta una reunión grabada con el host y dos asistentes
- **THEN** la respuesta SHALL traer tres participantes con sus nombres y sus pistas

#### Scenario: Uid desconocido
- **WHEN** aparece un fichero con un uid que no está en `event_attendees`
- **THEN** ese participante SHALL mostrarse como «Participante (uid N)»

### Requirement: Descarga prefirmada de los MP4

La API SHALL exponer `GET /api/admin/events/:id/recordings/:recordingId/download?file=<nombre>`, validado con Zod en `api/validators/eventSchemas.js`, que devuelve `{ url }`: una URL prefirmada de GET de 15 minutos con `Content-Disposition: attachment` (dependencia nueva `@aws-sdk/s3-request-presigner`, función nueva en `s3Service.js`).

- `file` SHALL cumplir `^[A-Za-z0-9_.-]+\.mp4$`.
- La tarea SHALL pertenecer al evento y ser de modo `mix`.
- La clave SHALL construirse en el servidor como `s3_prefix` de la fila + `file`; el cliente nunca aporta una clave ni un bucket.
- Con `downloadsAvailable` falso, SHALL responder 503 sin firmar nada.

El cliente SHALL pedir la URL **al pulsar** «Descargar» y navegar a ella en ese momento: una URL firmada con las credenciales temporales del rol deja de valer cuando éstas caducan, así que no se precalculan al listar. Ningún byte de vídeo SHALL pasar por el contenedor `api`.

#### Scenario: Descarga del MP4
- **WHEN** el admin pulsa «Descargar» en un MP4 de un stream grabado
- **THEN** la API SHALL devolver una URL prefirmada para `s3_prefix + file`
- **AND** el navegador SHALL empezar la descarga directamente desde S3

#### Scenario: Nombre con ruta
- **WHEN** la petición trae `file=../otra/clave.mp4`
- **THEN** la API SHALL responder 400 sin firmar nada

#### Scenario: Tarea de otro evento
- **WHEN** el `recordingId` pertenece a otro evento
- **THEN** la API SHALL responder 404

### Requirement: Panel de grabaciones en la ficha del evento

`client/app/admin/espacios/[id]/page.js` SHALL mostrar una sección «Grabaciones» (componente `client/components/admin/EventRecordingsPanel.js`) cuando el evento tenga la grabación marcada o alguna tarea, con, por cada tarea en orden («Parte 1», «Parte 2»…): estado en es-ES, inicio, fin, motivo de parada y «Disponible hasta el DD/MM/AAAA». Un aviso fijo SHALL recordar que las grabaciones se eliminan a los 30 días y que, para reutilizarlas, hay que descargarlas antes.

- Una tarea sin ficheros en el bucket SHALL presentarse como «Eliminada por el plazo de conservación» si su `availableUntil` ya pasó, y como «Sin ficheros» si no.

- En tareas `mix`: cada MP4 con su tamaño y un botón «Descargar».
- En tareas `individual`: la tabla de participantes (nombre, pistas, tamaño) y los comandos de AWS CLI para descargar la sesión completa (`aws s3 sync s3://<bucket>/<prefijo> <carpeta>`) y cada participante (añadiendo `--exclude "*" --include "*__uid_s_<uid>__*"`), con botón para copiarlos. Los comandos SHALL construirse en el cliente con una función pura a partir del bucket, el prefijo y el uid.
- Sin credenciales de lectura: el bucket y el prefijo de cada tarea y la indicación de que los ficheros se consultan en la consola de S3.

Las llamadas SHALL ir por `client/lib/api.js`, y los textos, por `EVENT_RECORDING_COPY` en `client/lib/constants.js`.

#### Scenario: Reunión grabada
- **WHEN** el admin abre la ficha de una reunión grabada
- **THEN** SHALL ver a cada participante con su comando de descarga

#### Scenario: Grabación todavía en curso
- **WHEN** el admin abre la ficha de un evento con la tarea en `recording`
- **THEN** la sección SHALL mostrar el estado «Grabando» y ningún botón de descarga
