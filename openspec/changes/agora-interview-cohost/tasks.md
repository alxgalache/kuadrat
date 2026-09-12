## 1. Backend — elegibilidad y uids reservados

- [x] 1.1 Añadir `HOST_SCREEN_UID = 2` a `api/services/agoraService.js`, exportarlo junto a `HOST_UID` y documentar en el comentario de cabecera que 1 y 2 son del host (cámara y pantalla) y que los asistentes empiezan en 101
- [x] 1.2 Añadir a `api/services/eventService.js` el predicado único `isBroadcastCohost(event, attendee)`. Debe comprobar `provider='agora'`, `interaction_mode='broadcast'` y `is_staff=1`, y que existe un `users` con ese email y `role='admin'` (una sola consulta `SELECT 1`). Exportarlo y escribir en su JSDoc por qué se revalida el rol (sesión en `localStorage` sin caducidad)
- [x] 1.3 Añadir `screenTokenSchema` a `api/validators/eventSchemas.js` (params `id`, body vacío), siguiendo la forma de `renewTokenSchema`

## 2. Backend — tokens (ALTO RIESGO: autenticación de streaming)

- [x] 2.1 En `getViewerToken` (`api/controllers/eventController.js`), rama Agora: calcular `coHost` con el predicado, dar `publisher` si `meeting || speaker_granted === 1 || coHost`, y añadir `coHost` a la respuesta
- [x] 2.2 En `renewToken`, rama de asistente: la misma regla de rol y `coHost` en la respuesta
- [x] 2.3 En `renewToken`, rama JWT: sustituir `decoded.id !== event.host_user_id && decoded.role !== 'admin'` por `decoded.id !== event.host_user_id` (403 a un admin no host) y actualizar el comentario de la ruta en `api/routes/eventRoutes.js`
- [x] 2.4 Añadir el controlador `getScreenToken`. Validaciones en orden:
  - evento existe (404)
  - `provider='agora'` e `interaction_mode='broadcast'` (400)
  - `status='active'` y `agora_channel_name` (400)
  - `req.user.id === event.host_user_id` (403)

  Devuelve `{ success, uid: HOST_SCREEN_UID, rtcToken }` con rol `publisher`
- [x] 2.5 Registrar `POST /:id/screen-token` en `api/routes/eventRoutes.js` con `authenticate` y `validate(screenTokenSchema)`, documentado como el resto de rutas

## 3. Backend — protección del staff frente a la moderación

- [x] 3.1 En `resolveAgoraAttendee`, rechazar con `ApiError(400, …)` a un asistente con `is_staff = 1` **antes** de cualquier escritura. Cubre promover y degradar desde el host y desde `api/controllers/eventAdminController.js`; verificar que ambos pasan por el helper
- [x] 3.2 En `banFromChat`, rechazar con 400 un objetivo `is_staff = 1` antes de `markAttendeeChatBanned`
- [x] 3.3 En `reportSpam`, rechazar con 400 un objetivo `is_staff = 1` antes de `markAttendeeChatBanned` y de `banAttendee`

## 4. Backend — sala socket (ALTO RIESGO: autenticación de la sala)

- [x] 4.1 En `authenticateJoin` de `api/socket/eventSocket.js`, rama JWT: aceptar como host solo `decoded.id === event.host_user_id`; el resto recibe `{ ok:false, reason:'Credenciales inválidas' }`
- [x] 4.2 Rama de asistente de `authenticateJoin`:
  - sustituir la comprobación de pago por la misma exención de staff que `requiresPayment`, extrayendo el predicado a un sitio compartido en lugar de copiarlo
  - evaluar `coHost` con `eventService.isBroadcastCohost`
  - fijar `speaker: true` en la entrada si es co-presentador
- [x] 4.3 Añadir `coHost` a `publicPresence` y refrescarlo en la rama de reconexión de `join_event_room` (junto a `speaker` y `chatBanned`)
- [x] 4.4 Ignorar `hand_raise` de una entrada `coHost` y saltar `checkSpam` para `coHost` igual que para `isHost`
- [x] 4.5 Añadir el `Map` `eventStageLayouts` (valores `'split'` | `'pip'`, defecto `'split'`), incluir `stageLayout` en la respuesta de `join_event_room` y borrarlo en `broadcastEventEnded` junto a `eventWhiteboards`
- [x] 4.6 Añadir el manejador `stage_layout { mode }`: solo desde una entrada con `coHost: true` y valor válido; guarda y difunde `stage_layout { mode }` a `event-room-{eventId}`; cualquier otro caso se ignora en silencio

## 5. Backend — tests

- [x] 5.1 Crear `api/tests/agoraBroadcastCohost.test.js` (supertest + `tests/helpers/app.js`, eventos Agora insertados en la BD local). `.env.test` no trae credenciales de Agora, así que hay que espiar `agoraService.generateRtcToken` para capturar `{ uid, role }`, y `banPublish` / `liftPublishBan` para afirmar que no se llaman. Casos:
  - admin staff en `broadcast` → `publisher` + `coHost: true` + uid ≥ 101
  - staff cuyo usuario ya no es admin → `subscriber` + `coHost: false`
  - staff en `meeting` → `publisher` + `coHost: false`
  - asistente ordinario → `subscriber`
  - `renew-token` del co-presentador conserva `publisher`
- [x] 5.2 En el mismo fichero:
  - `renew-token` con JWT de admin no host → 403 y ningún token `HOST_UID`
  - `renew-token` con JWT del host → `publisher` uid 1
- [x] 5.3 En el mismo fichero, `screen-token`:
  - host → uid 2 `publisher`
  - admin no host → 403
  - seller no host → 403
  - evento `meeting` → 400
  - evento LiveKit → 400
  - evento no activo → 400
  - sin JWT → 401
- [x] 5.4 En el mismo fichero, moderación sobre staff:
  - `demote` y `promote` → 400, sin cambiar `speaker_granted` ni llamar a `banPublish`
  - `ban-from-chat` → 400, `chat_banned` sigue a 0
  - `report-spam` → 400, sin filas nuevas en `event_bans`
- [x] 5.5 Crear `api/tests/eventSocketCohost.test.js`. La API no tiene `socket.io-client`: montar `setupEventSocket` con un `io` falso que capture el manejador de `connection`, sockets falsos que registren `on`/`emit`/`join`, y un `io.to()` que registre difusiones. Sin dependencias nuevas. Casos:
  - JWT de admin no host → denegado
  - JWT del host → entrada de host
  - co-presentador → presencia con `coHost: true` y `speaker: true`
  - `stage_layout` del co-presentador → difundido y entregado en la respuesta de unión del siguiente
  - `stage_layout` del host, de un asistente o con valor inválido → ignorado
  - `hand_raise` del co-presentador → ignorado
  - once mensajes del co-presentador en 10 s → sin ban
  - `broadcastEventEnded` → la siguiente sala arranca en `'split'`
- [x] 5.6 Ejecutar la suite completa (`docker compose exec api npm test`) y confirmar verdes `adminEventAccess.test.js`, `eventHostFlags.test.js` y `testEnvironmentIsolation.test.js`

## 6. Cliente — constantes, API y socket

- [x] 6.1 En `client/lib/constants.js`, junto a las constantes Agora, añadir:
  - `AGORA_HOST_UID = 1` y `AGORA_HOST_SCREEN_UID = 2`, sustituyendo la constante local `HOST_RTC_UID` de `AgoraLiveRoom.js`
  - `STAGE_LAYOUTS` (`SPLIT`, `PIP`) y sus etiquetas es-ES («Dividida», «Recuadro»)
  - la indicación de conmutador bloqueado
  - `AGORA_LOW_STREAM_PARAMETER` (480 × 270, 15 fps), con el comentario de que el defecto del SDK es 160 × 120 en 4:3
  - las fracciones de ancho del recuadro de `'pip'` y del de esquina, y el desplazamiento sobre los controles de fastboard
- [x] 6.2 Leer en el bundle instalado (`docker exec kuadrat-client-1 …/agora-rtc-sdk-ng/AgoraRTC_N-production.js`) el perfil que `createScreenVideoTrack({}, 'disable')` aplica por defecto. Con su frame rate y bitrate, definir `AGORA_SCREEN_ENCODER_BROADCAST` con resolución máxima 1792 × 1008 y explicar la cuenta de píxeles en el comentario
- [x] 6.3 Añadir `eventsAPI.getScreenToken(eventId)` a `client/lib/api.js` (POST con JWT, sin cuerpo)
- [x] 6.4 En `client/hooks/useEventRoomSocket.js`: estado `stageLayout` (inicializado desde la respuesta de unión), escucha de `stage_layout` y acción `setStageLayout(mode)`, documentando que el servidor la valida

## 7. Cliente — `useAgoraRoom` (ALTO RIESGO: hook compartido con `meeting`)

- [x] 7.1 Añadir el parámetro `screenShareMode` (`'swap'` | `'separate-client'`, defecto `'swap'`) y `getScreenToken`. En `'swap'`, `startScreenShare` y `stopScreenShare` deben quedar byte a byte como hoy
- [x] 7.2 En `'separate-client'`, `startScreenShare`:
  - pide `getScreenToken`
  - crea un segundo cliente `live`, `setClientRole('host')`, `join(appId, channel, token, 2)`
  - crea la pista con `AGORA_SCREEN_ENCODER_BROADCAST` y sin audio, y la publica
  - **no** toca la cámara
  - registra `track-ended` → parar, y `token-privilege-will-expire` → pedir de nuevo el token y `renewToken`
- [x] 7.3 En `'separate-client'`, `stopScreenShare` despublica, cierra la pista y hace `leave()` del segundo cliente. La limpieza del efecto de montaje también lo abandona, y lo encadena en `teardownRef` para no dejar el uid 2 ocupado en un remontaje de StrictMode
- [x] 7.4 En `handleUserPublished` del cliente principal, ignorar el uid 2 cuando el hook emite como host en `'separate-client'`: el host no se suscribe a su propia pantalla
- [x] 7.5 Añadir el parámetro `lowStreamParameter`. Si viene y el rol inicial es `host`, tras `join()` resuelto y antes de cualquier `publish` de cámara, llamar a `setLowStreamParameter` y a `enableDualStream()`. Un fallo (`NOT_SUPPORTED`) solo registra `console.warn`
- [x] 7.6 Exponer `setRemoteStreamTypes(map)`: recibe `{ uid → 0|1 }` y llama a `setRemoteVideoStreamType` solo para los uids cuyo valor cambió desde la última llamada (memoria en ref), tragando errores de uids que ya no están
- [x] 7.7 Verificar por regresión en un evento `meeting` que compartir pantalla sigue intercambiando cámara y pantalla, y que ningún participante activa dual stream

## 8. Cliente — escena de broadcast

- [x] 8.1 Crear `client/components/events/BroadcastStage.js`. Recibe:
  - las fuentes ya resueltas (`hostCamera`, `coHostCamera`, `content`, cada una con pista o elemento, anillo y espejo)
  - `layout`, `theaterOpen`, `isWhiteboard`
  - el marcador vacío
  - `onOpenTheater`

  Pinta las siete filas de la tabla de disposiciones de `agora-broadcast-stage`, con el `fit` de cada caso. Mueve aquí `AgoraVideo` o lo exporta desde un módulo compartido, sin duplicarlo
- [x] 8.2 En `BroadcastStage`: anillo de voz por hueco; recuadro de esquina desplazado sobre `.fastboard-bottom-right` cuando el contenido es la pizarra; botón de teatro arriba a la derecha
- [x] 8.3 En `BroadcastStage`, calcular y devolver al padre (callback o hook hermano) el mapa de tipo de flujo: `1` para toda cámara remota pintada en la esquina, `0` para el resto. Nunca incluir el uid 2
- [x] 8.4 En `BroadcastArea` (`client/components/AgoraLiveRoom.js`):
  - resolver las tres fuentes según `agora-broadcast-stage`: cámara del host local o uid 1; primer `coHost` de la presencia con vídeo; pizarra o pantalla local o uid 2
  - sustituir el bloque de pizarra + mosaico `w-48` y el bloque de vídeo del host por `BroadcastStage` dentro del `TheaterShell` existente, conservando la posición de `whiteboardElement` en el árbol
  - pasar el mapa de flujos a `room.setRemoteStreamTypes`
- [x] 8.5 En `BroadcastArea`:
  - excluir los uids 1 y 2 y los de toda entrada `coHost` de `promotedVideoUsers`
  - con `viewMode.isOverlay`, pasar a la escena todas las fuentes de vídeo a `null`
  - el `overlayVideo` de la consola sigue siendo la pista del host como hoy
- [x] 8.6 En `AgoraParticipantGrid` y `AgoraParticipantTile`, dejar sin acción de clic la casilla de una entrada `coHost` para cualquier espectador (incluido el propio co-presentador), con su insignia de micrófono. En `ChatPanel`, no ofrecer el menú de «Expulsar del chat» sobre mensajes de identidades `coHost`

## 9. Cliente — rol co-presentador

- [x] 9.1 En `client/app/live/[slug]/EventDetail.js`, pasar `isCoHost={!!agoraCreds.coHost}` a `AgoraLiveRoom`
- [x] 9.2 En `AgoraLiveRoom`, con `isCoHost && !isMeeting`:
  - `initialRole: 'host'`
  - `cameraEncoderConfig = AGORA_CAMERA_ENCODER_HOST`
  - `micTrackConfig = { encoderConfig: AGORA_MIC_ENCODER_HOST }`, sin claves 3A
  - `lowStreamParameter`
  - `useScreenWakeLock` habilitado

  Para el host en `broadcast`: `screenShareMode: 'separate-client'`, `getScreenToken` y `lowStreamParameter`. Nada cambia para `meeting` ni para asistentes
- [x] 9.3 Habilitar `useHostMediaControls` para `isHost || isCoHost` (sigue siendo una única instancia). Comprobar que para el co-presentador `selectVideoQuality` sale `null`
- [x] 9.4 Crear la presentación `CoHostControls` (en `client/components/events/`):
  - interruptores de micrófono y cámara con `DeviceDropdown`
  - altavoces solo si hay dispositivos
  - conmutador «Dividida» / «Recuadro» ligado a `socket.stageLayout` / `socket.setStageLayout`, deshabilitado con su indicación mientras haya pantalla o pizarra
  - errores de dispositivo
  - sin pantalla, pizarra, efectos, calidad ni «Finalizar stream»
- [x] 9.5 En `BroadcastArea`, renderizar `CoHostControls` para el co-presentador y ocultarle el botón «Levantar mano»
- [x] 9.6 En `client/app/admin/espacios/nuevo/page.js` y `client/app/admin/espacios/[id]/page.js`, ampliar el texto de ayuda de «El host escuchará a los invitados por altavoz»: marcarlo también en entrevistas con el admin si el host no usará auricular

## 10. Verificación manual en dispositivo (obligatoria antes de cerrar)

- [ ] 10.1 Entrevista con tres navegadores (host, admin, asistente): encender y apagar cada cámara en todas las combinaciones y confirmar en los tres las disposiciones 1 cámara / dividida / recuadro, con el conmutador del admin sincronizado y un asistente que entra tarde en `'pip'`
- [ ] 10.2 El host comparte pantalla con y sin admin en cámara: pantalla en la escena, esquina con las cámaras, conmutador bloqueado; al parar desde el aviso del navegador vuelve la disposición anterior sin corte de la cámara
- [ ] 10.3 Pizarra con las dos cámaras: esquina sobre la pizarra y zoom y páginas de fastboard pulsables por el host; teatro sobre la escena en los tres modos
- [ ] 10.4 En `chrome://webrtc-internals` del asistente: resolución recibida de la pantalla ≤ 1792 × 1008 y de las cámaras de la esquina 480 × 270; con la cámara al 100 %, 1280 × 720. El host no recibe el uid 2
- [ ] 10.5 El host hace clic en la casilla del admin (no pasa nada) y el admin sigue publicando; el admin no tiene «Levantar mano» ni menú de moderación
- [ ] 10.6 Consola móvil del host (Pixel) con el admin en cámara: la emisión de ambos continúa y al volver a la vista completa la escena reaparece sin recargar
- [ ] 10.7 Ajustar a ojo las fracciones de los recuadros en escritorio, en teatro y en móvil vertical, y fijarlas en `constants.js`
- [ ] 10.8 Regresión: evento `meeting` (compartir pantalla, rejilla, admin como asistente) y evento LiveKit sin cambios

## 11. Documentación

- [x] 11.1 Añadir a `CLAUDE.md` la sección «Entrevistas en eventos Agora stream (co-presentador y escena)»:
  - un cliente = una pista de vídeo, de ahí el uid 2
  - el host no se suscribe a su pantalla
  - el flujo reducido por defecto es 4:3
  - cuenta de píxeles y bandas (incluido el caso host a 1080p)
  - el co-presentador se deriva de `is_staff` + `users.role`
  - protección del staff frente a la moderación
  - la disposición vive en el socket
  - el procedimiento de audio para entrevistas remotas y presenciales
- [x] 11.2 Actualizar en `CLAUDE.md` la línea de Streaming del resumen y la sección «Admin access to Live events», que hoy afirma que el admin «is a participant, not a host» y recibe `subscriber` en broadcast
