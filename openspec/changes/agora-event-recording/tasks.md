## 1. Esquema de base de datos (alto riesgo: infraestructura compartida)

- [x] 1.1 `api/config/database.js`: añadir `recording_enabled INTEGER NOT NULL DEFAULT 0` al `CREATE TABLE events`, con un comentario que explique que el modo lo decide `interaction_mode` y que sólo tiene efecto con `provider='agora'` y `format='live'`. Ninguna línea de comentario termina en punto y coma ni lleva barra invertida.
- [x] 1.2 Mismo fichero: añadir `safeAlter('ALTER TABLE events ADD COLUMN recording_enabled INTEGER NOT NULL DEFAULT 0')` junto a `host_echo_cancellation`, sin backfill.
- [x] 1.3 Mismo fichero: `CREATE TABLE IF NOT EXISTS event_recordings` con las columnas de la spec (`id`, `event_id`, `mode`, `attempt`, `recorder_uid`, `status`, `stop_reason`, `resource_id`, `sid`, `s3_bucket`, `s3_prefix`, `applied_layout`, `upload_status`, `file_list`, `error`, `created_at`, `started_at`, `stopped_at`, `updated_at`), sus `CHECK` y la FK a `events(id)`.
- [x] 1.4 Mismo fichero: índice único parcial `idx_event_recordings_live ON event_recordings(event_id) WHERE status IN ('starting','recording','stopping')` e índice único `idx_event_recordings_attempt ON event_recordings(event_id, attempt)`.
- [x] 1.5 `docker compose exec api npm test -- dbDump` en verde (la tabla nueva y sus comentarios sobreviven al volcado y la restauración).

## 2. Configuración

- [x] 2.1 `api/config/env.js`: bloque `recording` con `bucket`, `region` (defecto `eu-west-1`), `accessKey`, `secretKey`; `config.recording.enabled` por configuración presente (las cuatro variables + `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET`) y forzado a `false` con `NODE_ENV=test`.
- [x] 2.2 Mismo fichero: fallo de arranque con mensaje que nombra la variable ausente cuando la configuración es parcial.
- [x] 2.3 `api/.env.example`: documentar las cuatro variables, la política IAM de sólo `s3:PutObject` y por qué esta clave no contradice «ninguna credencial AWS en `.env`» (es de Agora, no de la aplicación).
- [x] 2.4 `api/.env.test`: definir las cuatro variables con valores ficticios, con un comentario que diga que es a propósito (como `DB_BACKUP_ENABLED=true`).
- [x] 2.5 `api/package.json`: añadir `@aws-sdk/s3-request-presigner` con la misma versión fijada que `@aws-sdk/client-s3`.

## 3. Validación y escritura del flag

- [x] 3.1 `api/validators/eventSchemas.js`: `recording_enabled` (`boolean | 0 | 1`) en `createEventSchema` y `updateEventSchema`, con mensaje propio.
- [x] 3.2 `api/controllers/eventAdminController.js`: `toFlag(recording_enabled)` en la creación y en la edición.
- [x] 3.3 `api/services/eventService.js`: columna en el `INSERT` de `createEvent` y en `allowedFields` de `updateEvent`.
- [x] 3.4 `api/tests/eventHostFlags.test.js`: añadir `recording_enabled` a la matriz de flags (mismos seis casos por las cuatro plazas) y actualizar el comentario de cabecera.

## 4. Piezas puras compartidas

- [x] 4.1 `api/utils/eventRecording.js`: `isRecordingEligible(event)` (flag + `agora` + `live`) y `recordingModeFor(event)` (`broadcast → mix`, `meeting → individual`).
- [x] 4.2 `api/services/agoraService.js`: exportar la cabecera Basic de la REST (`restHeaders`) para compartirla, y documentar en el bloque de uids reservados la franja 3…12 del grabador (`RECORDER_UID_BASE = 3`).
- [x] 4.3 `api/services/agoraRecordingService.js` (nuevo): constantes (`RECORDING_MAX_MINUTES = 180`, `RECORDING_RETENTION_DAYS = 30`, `RECORDING_MAX_ATTEMPTS = 10`, `RECORDING_RETRY_COOLDOWN_SECONDS = 60`, `RECORDING_QUERY_GRACE_SECONDS = 90`, `RECORDING_STALE_SECONDS = 120`, `RECORDING_MAX_IDLE_SECONDS = 1800`, `RECORDER_TOKEN_MARGIN_SECONDS = 900`), el mapa de regiones S3 → código de Agora (regiones europeas publicadas) y `mixLayoutFor(screenSharing)`.
- [x] 4.4 Mismo fichero: constructores puros de `storageConfig` (prefijo `['eventos', eventHex, recordingHex]` validado contra `^[A-Za-z0-9]+$` y ≤ 128) y de los `clientRequest` de `mix` e `individual` según D3 y D5; `acquire` con `scene: 0`, `region: 'EU'`, `resourceExpiredHour: 24` y `startParameter` idéntico.
- [x] 4.5 Mismo fichero: cálculo del TTL del token (lo que queda de la ventana de 180 min + 15 min) y del uid del grabador (`3 + attempt`).

## 5. Cliente REST y reconciliador

- [x] 5.1 `agoraRecordingService.js`: cliente REST con transporte inyectable, tiempo máximo por llamada, respuesta `{ status, data }` sin lanzar en 404, transporte por defecto que lanza bajo `NODE_ENV=test`, y costura `__configureForTests({ transport, storage })` que sólo funciona bajo test.
- [x] 5.2 Registro sin secretos: los logs de la REST sólo llevan `{ eventId, recordingId, mode, cname, uid, httpStatus, agoraCode }`; nunca el cuerpo de `acquire`/`start`/`update`.
- [x] 5.3 `startTask`: `INSERT` en `starting` (el perdedor del índice único termina sin error), `acquire` → guardar `resource_id`, `start` → guardar `sid`, `started_at`, `applied_layout` y pasar a `recording`; cualquier fallo → `failed` con `error`.
- [x] 5.4 `stopTask`: `UPDATE` condicional `recording → stopping`, `stop` con `async_stop: false`, guardar `file_list`, `upload_status`, `stopped_at`, `stop_reason` → `stopped`; 404 → `stopped`.
- [x] 5.5 `reconcileEvent(eventId, { isHostScreenSharing })`, serializado por evento: arranques colgados → `failed`; parada por `event_ended` / `max_duration` / `recording_disabled`; `query` tras la gracia de 90 s (404 o estado de salida → `interrupted`); reintento de `stopping` colgado; `updateLayout` cuando el diseño deseado difiere del aplicado (sólo `mix`); arranque con tope de intentos, enfriamiento y techo. Con `config.recording.enabled = false` no arranca nada pero sí para lo vivo.
- [x] 5.6 Alertas por tres canales (patrón de `dbBackupService.runBackupSafely`) con deduplicación en memoria: `start_failed` y `gave_up` por evento, `interrupted` y `stop_failed` por tarea. Nunca escapan del reconciliador.
- [x] 5.7 `api/services/emailService.js`: `sendRecordingAlertEmail({ eventTitle, eventId, kind, detail })` a `BUSINESS_EMAIL` en es-ES, con un texto por tipo que diga qué hacer (p. ej. grabar en local como respaldo si no arranca).
- [x] 5.8 `api/scheduler/recordingScheduler.js` (nuevo): node-cron cada 30 s, sin solapar pasadas; candidatos = eventos `active` con grabación elegible ∪ eventos con tarea viva; `isHostScreenSharing` desde `app.get('eventSocket')`.
- [x] 5.9 `agoraRecordingService.js`: `checkRetentionRule()` — con `config.recording.enabled` y `config.useS3`, leer la configuración de ciclo de vida del bucket y exigir una regla `Enabled` que expire `eventos/` (o todo el bucket) en ≤ 30 días; si falta, es más larga o la lectura falla, alerta `retention_rule_missing` por los tres canales, una vez por arranque, sin bloquear grabaciones. El scheduler la llama al arrancar.
- [x] 5.10 `api/server.js`: arrancar el scheduler junto a los demás (nunca desde `app.js`).

## 6. Enganches del ciclo de vida y de la pantalla compartida

- [x] 6.1 `api/socket/eventSocket.js`: exponer `isHostScreenSharing(eventId)` en el objeto que devuelve el módulo (lee la entrada del host en la presencia; sin presencia, `false`).
- [x] 6.2 Mismo fichero: en el manejador `screen_share`, tras actualizar la presencia, llamar a `reconcileEvent` sin esperar y registrando el error.
- [x] 6.3 `api/controllers/eventAdminController.js`: llamada sin espera a `reconcileEvent` en `startEvent`, `endEvent` y `markEventFinished`.
- [x] 6.4 `api/controllers/eventController.js`: llamada sin espera a `reconcileEvent` en `endEvent` (host).

## 7. Endpoints de admin

- [x] 7.1 `api/services/s3Service.js`: `listObjectsIn({ bucket, region, prefix })` paginado, `getPresignedDownloadUrl({ bucket, region, key, expiresIn, downloadName })` y `getLifecycleRules({ bucket, region })`, todos con el rol de la instancia (sin credenciales explícitas).
- [x] 7.2 `api/validators/eventSchemas.js`: esquemas de `GET /:id/recordings` y de la descarga (`file` con `^[A-Za-z0-9_.-]+\.mp4$`).
- [x] 7.3 `api/controllers/eventRecordingAdminController.js` (nuevo): disponibilidad, listado (tareas con `availableUntil` = fecha de `started_at` + 30 días, + objetos del bucket cuando `config.useS3`; agrupación por uid en `individual` con el patrón `__uid_s_<uid>__uid_e_<tipo>` y nombres desde el host y `event_attendees.agora_uid`) y descarga (tarea del evento, modo `mix`, clave construida en el servidor, 503 sin credenciales). Respuestas con `sendSuccess`, errores con `ApiError`.
- [x] 7.4 `api/routes/admin/eventRoutes.js`: `GET /recording/availability` **por encima** de las rutas `/:id`, `GET /:id/recordings` y `GET /:id/recordings/:recordingId/download` con `validate()`.

## 8. Tests del servidor (sin red)

- [x] 8.1 `api/tests/agoraRecording.test.js`: piezas puras — elegibilidad (matriz proveedor × formato × flag), modo derivado, `mixLayoutFor`, `storageConfig` (sin guiones, ≤ 128), `clientRequest` de `mix` (`#allstream#`, `audioProfile: 1`, `videoStreamType: 0`, `channelType: 1`, 1920×1080, `['hls','mp4']`) e `individual` (`standard`, `subscribeUidGroup: 4`, exactamente `['hls']`), `startParameter` igual al `clientRequest`, TTL de 195 min en la primera tarea, uids 3…12.
- [x] 8.2 Mismo fichero, reconciliador con transporte falso y base local: arranque al pasar a `active`; dos reconciliaciones simultáneas → una sola tarea; parada al finalizar; parada a los 180 min con `max_duration` y sin reanudar; `query` 404 → `interrupted` + tarea nueva con `attempt + 1`; tope de 10 y enfriamiento de 60 s; `starting` colgado → `failed`; `stopping` colgado → reintento; `updateLayout` al cambiar la pantalla y reintento tras fallo; `config.recording.enabled = false` no arranca pero para.
- [x] 8.3 Mismo fichero: el manejador `screen_share` dispara la reconciliación (con el `io` falso de `eventSocketCohost.test.js`); un evento LiveKit o de vídeo con el flag nunca arranca nada.
- [x] 8.4a Mismo fichero: `checkRetentionRule` con reglas falsas — regla de 30 días sobre `eventos/` (sin alerta), regla de bucket entero de 30 días (sin alerta), sin reglas (alerta), regla de 90 días (alerta), regla deshabilitada (alerta), lectura fallida (alerta), sin `config.useS3` (ni lectura ni alerta).
- [x] 8.4 Mismo fichero: ninguna línea de log contiene la clave del bucket ni el token tras un `start` rechazado (como `sendcloudAuth.test.js`); un email por tipo y evento en `emailService.__getOutbox()`; sin transporte inyectado la tarea queda `failed` sin salir a la red.
- [x] 8.5 `api/tests/eventRecordingAdmin.test.js`: disponibilidad; listado con lister falso (MP4 en `mix`, agrupación y nombres en `individual`, uid desconocido, `availableUntil` = inicio + 30 días); descarga (400 con ruta, 404 con tarea de otro evento, 400 con modo `individual`, 503 sin credenciales, clave = prefijo + fichero); 401 para no admin (lo que ya devuelve `adminAuth`).
- [x] 8.6 `api/tests/testEnvironmentIsolation.test.js`: afirmar `config.recording.enabled === false` bajo test con las variables definidas.
- [x] 8.7 `docker compose exec api npm test` en verde.

## 9. Cliente: formulario de admin

- [x] 9.1 `client/lib/eventRecording.js` (nuevo): `isRecordingEligible(event)` y `isEventRecorded(event)`, espejo del predicado del servidor, y la función pura que construye los comandos de AWS CLI (sesión completa y por uid).
- [x] 9.2 `client/lib/constants.js`: `EVENT_RECORDING_COPY` (etiqueta y ayudas de la casilla por modo, «no configurada», estados y motivos en es-ES, textos del panel, insignia y avisos de acceso por modo).
- [x] 9.3 `client/lib/api.js`: `getRecordingAvailability()`, `getEventRecordings(id)` y `getRecordingDownloadUrl(id, recordingId, file)` en el cliente de admin de eventos.
- [x] 9.4 `client/app/admin/espacios/nuevo/page.js`: casilla visible con `provider='agora'` y `format='live'`, texto de ayuda por modo, deshabilitada con explicación si `recordingAvailable` es falso; enviar `recording_enabled`.
- [x] 9.5 `client/app/admin/espacios/[id]/page.js`: la misma casilla en la edición, cargando el valor guardado.

## 10. Cliente: panel de grabaciones

- [x] 10.1 `client/components/admin/EventRecordingsPanel.js` (nuevo): aviso fijo de que las grabaciones se eliminan a los 30 días y hay que descargarlas antes para reutilizarlas; tareas como «Parte N» con estado, fechas, motivo y «Disponible hasta el DD/MM/AAAA»; sin ficheros → «Eliminada por el plazo de conservación» si la fecha pasó, «Sin ficheros» si no; en `mix`, MP4 con tamaño y «Descargar» que pide la URL al pulsar y navega a ella; en `individual`, tabla de participantes con pistas y tamaño y los comandos con botón de copiar; sin credenciales, bucket y prefijo con la indicación de la consola de S3.
- [x] 10.2 Montarlo en `client/app/admin/espacios/[id]/page.js` cuando el evento tenga la casilla marcada o alguna tarea.

## 11. Cliente: información a los participantes

- [x] 11.1 `client/components/events/RecordingBadge.js` (nuevo): punto rojo + «Grabando», `aria-label` con el aviso completo, variantes clara y sobre fondo oscuro.
- [x] 11.2 Montar la insignia en la cabecera de escritorio de `client/app/live/[slug]/EventDetail.js`, en `client/components/events/LiveRoomTopBar.js`, en `client/components/events/LandscapeStageChrome.js` y en `client/components/events/HostConsole.js`, condicionada a `isEventRecorded(event)` y `status === 'active'`.
- [x] 11.3 Aviso previo por modo en la ficha (`EventDetail.js`, antes de entrar) y en `client/components/EventAccessModal.js`, con el plazo de 30 días y enlace al ancla del apartado de grabación de la política de privacidad.
- [x] 11.4 `client/app/legal/politica-de-privacidad/page.js`: apartado «Grabación de eventos en directo» con ancla (`#grabacion-de-eventos`): qué se graba en cada modo, finalidad, base legal (relación con el host y co-presentador; consentimiento de quien interviene tras el aviso, pudiendo asistir sin ser grabado), encargados (Agora en su región europea, AWS en la UE), conservación de 30 días naturales con eliminación automática, supresión anticipada en info@140d.art. Renumerar los apartados siguientes y actualizar «Última actualización».
- [x] 11.5 `client/app/legal/normas-eventos/page.js`: los eventos marcados se graban, se avisa antes y durante, y la grabación se conserva 30 días, con enlace al apartado de la política.

## 12. Cliente: reemisión de la pantalla compartida

- [x] 12.1 `client/hooks/useEventRoomSocket.js` expone `joinVersion`, que sube en cada unión confirmada (reconexiones incluidas: con `joined` no basta, porque una reconexión automática pasa de verdadero a verdadero), y `client/components/AgoraLiveRoom.js` lo añade a las dependencias del efecto que llama a `setScreenSharing`, para reemitir el estado tras cada (re)unión, con un comentario que explique el reinicio de la api.
- [x] 12.2 `docker compose exec client npm run lint` y `docker compose exec -e NODE_ENV=production client npm run build` sin errores.

## 13. Documentación

- [x] 13.1 `docs/grabaciones-eventos.md` (nuevo): activar Cloud Recording en la consola de Agora; crear el bucket de cada entorno (eu-west-1, Block Public Access, **sin versionado** y por qué); reglas de ciclo de vida en JSON (expiración de 30 días sobre `eventos/` y limpieza de subidas multiparte incompletas a 1 día); usuario IAM por entorno y política JSON de sólo `s3:PutObject`; permisos `s3:ListBucket` + `s3:GetObject` + `s3:GetLifecycleConfiguration` para el rol de la instancia de producción; supresión anticipada a petición de un participante (qué borrar en cada modo); variables; qué se graba en cada modo; descargar un MP4; descargar las pistas de una reunión con AWS CLI; convertirlas con `convert_v2.py` en Linux x86; costes; alertas; rotación de la clave IAM; puntos ciegos.
- [x] 13.2 `CLAUDE.md`: sección «Grabación de eventos Agora (Cloud Recording)» con las reglas que sostienen el diseño (modo por `interaction_mode`, `#allstream#`, `audioProfile: 1`, prefijo alfanumérico, token sin renovación, reconciliador como autoridad, techo, credencial delegada, bucket como fuente de verdad, 30 días aplicados por el bucket y sin versionado, insignia de configuración) y la entrada de las variables en «Environment Variables».

## 14. Puesta en marcha y verificación (operador)

- [ ] 14.1 Preproducción (staging): Cloud Recording activado una vez en el proyecto de Agora «140d» (compartido con producción: las variables `AGORA_*` no cambian); bucket y usuario IAM propios según `docs/grabaciones-eventos.md`; reglas de ciclo de vida comprobadas en la consola de S3 (allí la api no puede leerlas); las cuatro `AGORA_RECORDING_S3_*` de staging en su `api/.env`.
- [ ] 14.2 `broadcast` en preproducción, comprobando cada fichero en la consola de S3: host solo; host + co-presentador; host + pantalla compartida (cambio a vertical y vuelta); los tres a la vez; promovido hablando sin cámara. Revisar la geometría real de los diseños y que el audio suena a 128 kbps.
- [ ] 14.3 `meeting` en preproducción con tres personas, una entrando tarde y otra compartiendo pantalla: pistas de audio y vídeo de cada uid en la consola de S3 (staging no tiene credenciales de lectura; los nombres en el panel se comprueban con la primera reunión grabada en producción).
- [ ] 14.4 Interrupción: parar la tarea a mano con `stop` por la REST y comprobar que en ≤ 30 s hay una tarea nueva con uid 4 y llega el email `interrupted`.
- [ ] 14.5 Fin de evento por el host y por el admin: tarea `stopped` con `event_ended` y ficheros subidos.
- [ ] 14.6 Comprobar que el grabador con token `subscriber` entra bajo Co-host authentication y que la política de sólo `s3:PutObject` le basta; si Agora pidiera otro permiso, añadir sólo ese y documentarlo.
- [ ] 14.7 Producción: bucket con sus reglas, usuario IAM, permisos del rol, las cuatro `AGORA_RECORDING_S3_*` de producción (las `AGORA_*` no cambian) y `./deploy/deploy.sh`; comprobar que el arranque **no** emite `retention_rule_missing`; primera grabación real listada y descargada desde el panel.
- [ ] 14.8 Primera factura de Agora con grabaciones: confirmar que el `mix` se factura por los flujos grabados y no por el lienzo de 1920×1080 (si no, bajar el lienzo a 1280×720).
