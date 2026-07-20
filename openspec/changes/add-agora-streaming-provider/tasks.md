# Tasks: add-agora-streaming-provider

> Orden: backend (schema → env → servicio → socket → controllers/rutas) antes que frontend. Tareas marcadas **[ALTO RIESGO]** tocan infraestructura compartida — revisar con especial cuidado que la rama LiveKit queda intacta.

## 1. Esquema de BD y configuración

- [x] 1.1 **[ALTO RIESGO]** `api/config/database.js`: añadir a `CREATE TABLE events` las columnas `provider` (TEXT NOT NULL DEFAULT 'livekit', CHECK livekit|agora), `interaction_mode` (TEXT NOT NULL DEFAULT 'broadcast', CHECK broadcast|meeting), `agora_channel_name` (TEXT) y `whiteboard_room_uuid` (TEXT); y a `CREATE TABLE event_attendees` las columnas `agora_uid` (INTEGER) y `speaker_granted` (INTEGER NOT NULL DEFAULT 0). Añadir las 6 líneas `safeAlter` correspondientes (patrón existente).
- [x] 1.2 `api/config/env.js`: añadir grupo `agora { appId, appCertificate, customerId, customerSecret }` con `optional(...)` (mismo patrón que `livekit`) y grupo `agoraWhiteboard { appIdentifier, ak, sk, region }` (defecto region `eu`).
- [x] 1.3 `api/.env.example` y `/.env` local: documentar `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET` y las 4 `AGORA_WHITEBOARD_*` junto al bloque LiveKit existente (sin `NEXT_PUBLIC_*`, sin build-args de Docker).
- [x] 1.4 `api/package.json`: añadir dependencia `agora-token`; `client/package.json`: añadir `agora-rtc-sdk-ng`. Ejecutar install y verificar arranque de ambos contenedores.

## 2. Servicio Agora (backend)

- [x] 2.1 Crear `api/services/agoraService.js`: `generateRtcToken({ channel, uid, role, ttlSeconds=14400 })` con `agora-token` (`RtcTokenBuilder.buildTokenWithUid`, `RtcRole.PUBLISHER|SUBSCRIBER`); error claro (`ApiError`-compatible) si faltan credenciales; logging Pino.
- [x] 2.2 `api/services/agoraService.js`: asignación de uid estable — `ensureAttendeeUid(eventId, attendeeId)` (SELECT `agora_uid` o `UPDATE ... COALESCE(MAX(agora_uid),100)+1` con reintento ante colisión); host fijo uid=1.
- [x] 2.3 `api/services/agoraService.js`: cliente REST de moderación con `fetch` + Basic Auth (`config.agora.customerId:customerSecret`): `banPublish(channel, uid)` (`POST https://api.agora.io/dev/v1/kicking-rule`, privileges `['publish_audio','publish_video']`, time 1440, guarda ruleId en `Map`), `liftPublishBan(channel, uid)` (DELETE por ruleId, con recuperación vía `GET /dev/v1/kicking-rule` si el Map no lo tiene), `kickUser(channel, uid)` (privileges `['join_channel']`).
- [x] 2.4 Tests manuales del servicio (script one-shot o REPL): token PUBLISHER/SUBSCRIBER decodificable, creación+borrado de kicking rule contra el proyecto real.

## 3. Sala Socket.IO de eventos Agora

- [x] 3.1 **[ALTO RIESGO]** `api/socket/eventSocket.js`: añadir sala `event-room-{eventId}` con `join_event_room` autenticado (asistente: `attendeeId+accessToken` revalidados con `eventService` — evento Agora activo, pago, bans email/IP; host/admin: JWT verificado). ACK con presencia completa + identidad propia; `room_join_denied` si rechazo. NO tocar la sala pública `event-{eventId}` ni el chat de pases de vídeo.
- [x] 3.2 `api/socket/eventSocket.js`: presencia en memoria por evento (`{identity, name, isHost, agoraUid, handRaised, speaker, chatBanned}`) con broadcasts `presence_joined`/`presence_left`/`presence_updated` y limpieza en `disconnect`.
- [x] 3.3 `api/socket/eventSocket.js`: chat `event_chat_message` con enforcement server-side de `chat_banned` (consulta `eventService.isAttendeeChatBanned`, cacheada en la entrada de presencia) y difusión `{identity, name, message, timestamp}`; sin historial.
- [x] 3.4 `api/socket/eventSocket.js`: anti-spam en servidor (mismos umbrales que el cliente LiveKit: >10 mensajes/10 s, constantes compartidas) → auto chat-ban + `eventService.banAttendee` (email+IP) + broadcast `chat_banned {identity}`.
- [x] 3.5 `api/socket/eventSocket.js`: `hand_raise {raised}` → actualiza presencia + `presence_updated`; y emisores dirigidos de moderación `promoted`/`demoted`/`force_mute`/`chat_banned` invocables desde los controllers (exponer helpers en el objeto retornado, patrón `broadcastEventStarted`).

## 4. Endpoints y controllers

- [x] 4.1 `api/validators/eventSchemas.js`: `createEventSchema`/`updateEventSchema` con `provider` (enum livekit|agora) e `interaction_mode` (enum broadcast|meeting) + regla cruzada (`meeting` ⇒ `provider='agora'` y `max_attendees` 1..16); nuevo `renewTokenSchema`.
- [x] 4.2 `api/services/eventService.js`: `createEvent`/`updateEvent` aceptan y persisten `provider` e `interaction_mode`; `startEvent` acepta `agoraChannelName`; helpers `setSpeakerGranted(attendeeId, granted)` y lectura de `speaker_granted`/`agora_uid`.
- [x] 4.3 `api/controllers/eventAdminController.js`: `createEvent`/`updateEvent` pasan los campos nuevos (validación de negocio meeting/aforo); `startEvent` rama Agora (fija `agora_channel_name='event-{id}'`, sin llamada externa, mismo broadcast `event_started`); `endEvent` rama Agora (sin borrado de sala). Rama LiveKit intacta.
- [x] 4.4 `api/controllers/eventController.js`: `getViewerToken`/`getHostToken` bifurcados por `event.provider` — rama Agora devuelve `{provider:'agora', appId, channel, uid, rtcToken, interactionMode}` (uid vía `ensureAttendeeUid`, rol según modo y `speaker_granted`; host uid=1) manteniendo todas las validaciones y el paso a `joined`; `endEvent` rama Agora. Rama LiveKit intacta byte a byte.
- [x] 4.5 `api/controllers/eventController.js` + `api/routes/eventRoutes.js`: nuevo `POST /api/events/:id/renew-token` (validate(renewTokenSchema), limiter general) que re-evalúa estado y re-emite token del rol vigente; también acepta JWT de host.
- [x] 4.6 `api/controllers/eventController.js` y `api/controllers/eventAdminController.js`: `promoteParticipant`/`demoteParticipant` bifurcados — rama Agora: `setSpeakerGranted` + `liftPublishBan`/`banPublish` + emisión socket `promoted`/`demoted` + limpieza de mano en presencia; `muteParticipant` (admin) rama Agora → `force_mute` por socket; `banFromChat`/`reportSpam` rama Agora → persistencia actual + broadcast `chat_banned` (sin llamada LiveKit).
- [x] 4.7 `api/controllers/eventAdminController.js`: `listParticipants` rama Agora sirviendo desde la presencia Socket.IO (mismo shape que consume el panel admin). Rama LiveKit intacta.

## 5. Frontend — hooks e infraestructura

- [x] 5.1 `client/lib/api.js`: añadir `eventsAPI.renewToken(eventId, attendeeId, accessToken)`; verificar que `getViewerToken`/`getHostToken` propagan el shape Agora sin transformación.
- [x] 5.2 `client/lib/constants.js`: constantes compartidas de sala (umbral de `volume-indicator`, umbrales de spam ya existentes reutilizados, aforo máx. meeting = 16).
- [x] 5.3 Crear `client/hooks/useEventRoomSocket.js`: join autenticado a `event-room-{eventId}`, estado de presencia/chat/mano, envío de mensajes/mano, y callbacks de moderación entrante (`promoted`/`demoted`/`force_mute`/`chat_banned`).
- [x] 5.4 Crear `client/hooks/useAgoraRoom.js`: ciclo de vida RTC completo con `agora-rtc-sdk-ng` (create client mode 'live', join con `{appId, channel, uid, rtcToken}`, `setClientRole`, publish/unpublish de micro/cámara, suscripción a remotos, `volume-indicator` habilitado, `renewToken` en `token-privilege-will-expire`, detección `UID_BANNED`, `onAutoplayFailed`, leave/cleanup).
- [x] 5.5 Crear `client/hooks/useAgoraDevices.js`: enumeración (`AgoraRTC.getMicrophones/getCameras/getPlaybackDevices`), cambio en caliente (`track.setDevice`, `audioTrack.setPlaybackDevice`) y hot-plug (`onMicrophoneChanged`/`onCameraChanged`/`onPlaybackDeviceChanged`).
- [x] 5.6 **[ALTO RIESGO]** Extraer el dropdown presentacional a `client/components/events/DeviceDropdown.js` y hacer que el `DeviceSelector` de `client/components/EventLiveRoom.js` lo renderice SIN cambiar su lógica LiveKit (verificar visualmente un evento LiveKit tras el refactor).

## 6. Frontend — sala Agora modo broadcast (paridad)

- [x] 6.1 Crear `client/components/AgoraLiveRoom.js` (esqueleto + import dinámico `ssr:false`): props `{appId, channel, uid, rtcToken, interactionMode, isHost, eventId, onKicked}`; conexión vía `useAgoraRoom` + `useEventRoomSocket`; overlay "Activar audio" y render condicional broadcast/meeting.
- [x] 6.2 `AgoraLiveRoom.js` broadcast: área de vídeo del host (16:9, negra, "Esperando al host..."/"Tu vista de presentador", pantalla completa para viewers, anillo de hablando vía volume-indicator) + grid de cámaras de promovidos.
- [x] 6.3 `AgoraLiveRoom.js` broadcast: grid de tiles de iniciales alimentado por presencia (mismos colores/estados/badges/orden/acciones que `EventLiveRoom.js`: host primero, mano priorizada, local "(Tu)" al final, clic promote/demote del host, self-mute del promovido).
- [x] 6.4 `AgoraLiveRoom.js` broadcast: controles de host (toggles Micrófono/Cámara con `useAgoraDevices` + DeviceDropdown, "Altavoces" solo selector, toggle "Pantalla" con swap cámara↔pantalla incl. `track-ended`, "Finalizar stream" con `ConfirmDialog` → `eventsAPI.endEvent`).
- [x] 6.5 `AgoraLiveRoom.js` broadcast: botón "Levantar mano"/"Bajar mano" (socket), flujo de promoción entrante (renew-token → `setClientRole('host')` → publicar micro auto-on) y de degradación (unpublish → audience → estados visuales).
- [x] 6.6 `AgoraLiveRoom.js`: `ChatPanel` reutilizando la UI actual sobre `useEventRoomSocket` (mensajes, menú tres puntos del host "Expulsar del chat" → `eventsAPI.banFromChat`, estado chat-banned local, contador "N conectados" por presencia).
- [x] 6.7 `AgoraLiveRoom.js`: gestión de `event_ended` (modal "Evento finalizado" + leave), `onKicked` por `UID_BANNED` (pantalla de expulsión + limpieza localStorage + redirección) y `force_mute` entrante.

## 7. Frontend — sala Agora modo meeting

- [x] 7.1 `AgoraLiveRoom.js` meeting: grid responsivo de tiles grandes (1/2/3/4 columnas, vídeo o avatar de inicial, nombre, badge de micro, anillo de hablando, "(Tu)") con entrada muteado+cámara off por defecto.
- [x] 7.2 `AgoraLiveRoom.js` meeting: barra inferior de controles propios para todos (micro, cámara, selectores de dispositivo) + controles extra de host (pantalla → área destacada, silenciar participante vía admin/mute o menú de tile, "Finalizar evento").
- [x] 7.3 `AgoraLiveRoom.js` meeting: chat lateral idéntico y moderación de chat operativa; sin botón de mano.

## 8. Frontend — integración de página y admin

- [x] 8.1 **[ALTO RIESGO]** `client/app/live/[slug]/EventDetail.js`: bifurcar por `event.provider` — estado de credenciales genérico, `connectAsViewer`/`connectAsHost` conservan el flujo LiveKit intacto y montan `AgoraLiveRoom` cuando la respuesta trae `provider='agora'`. Verificar visualmente un evento LiveKit tras el cambio.
- [x] 8.2 `client/app/admin/espacios/nuevo/page.js`: selects "Proveedor de streaming" (con `format='live'`) y "Modo de interacción" (con `provider='agora'`) + aforo obligatorio ≤ 16 en meeting con texto de ayuda es-ES.
- [x] 8.3 `client/app/admin/espacios/[id]/page.js`: mismos selects en edición (bloqueados si el evento no es editable, regla actual) y lista de participantes operativa para eventos Agora (promote/demote/mute contra los endpoints bifurcados).

## 9. Verificación de paridad (QA manual guiado)

- [ ] 9.1 Consola Agora: proyecto con App Certificate, **Co-host authentication activado** y credenciales RESTful generadas; variables en `.env`; arranque limpio de api.
- [ ] 9.2 Checklist broadcast Agora vs LiveKit (dos navegadores + móvil): host publica cám/micro/pantalla y cambia dispositivos; viewer entra muteado, levanta mano, es promovido (micro auto-on), habla, es degradado; chat + expulsión de chat + anti-spam; overlay de audio; pantalla completa; "Finalizar stream" → modal en viewers; evento LiveKit de control se comporta idéntico a antes del cambio.
- [ ] 9.3 Prueba de enforcement: con token SUBSCRIBER, forzar `setClientRole('host')+publish()` desde consola del navegador → debe fallar; degradar a un promovido y verificar que la kicking rule bloquea su republicación.
- [ ] 9.4 Checklist meeting: 3+ participantes con cámaras, self mute/unmute, host silencia a uno, pantalla compartida, chat, aforo >16 rechazado en el formulario.
- [ ] 9.5 Regresión de pases de vídeo (`format='video'`): reproducción sincronizada y chat Socket.IO intactos.

## 10. Fase opcional — pizarra interactiva (separable; requiere Whiteboard activado en consola, región UE)

- [x] 10.1 `api/package.json`: dependencia `netless-token`; `client/package.json`: `@netless/fastboard` y `@netless/fastboard-react`.
- [x] 10.2 Crear `api/services/whiteboardService.js`: SDK token con AK/SK, creación lazy de sala (`POST https://api.netless.link/v5/rooms` + persistir `events.whiteboard_room_uuid`), room tokens `writer`/`reader`.
- [x] 10.3 `api/controllers/eventController.js` + `api/routes/eventRoutes.js` + `api/validators/eventSchemas.js`: `POST /api/events/:id/whiteboard-token` (mismas credenciales que `/token`; roles por modo y flag "todos escriben").
- [x] 10.4 `api/socket/eventSocket.js`: broadcast `whiteboard_toggle {active, everyoneWrites}` emitible por el host.
- [x] 10.5 `client/components/events/WhiteboardPanel.js` + integración en `AgoraLiveRoom.js`: toggle "Pizarra" del host (oculto sin credenciales), montaje Fastboard en área principal (vídeo del host a tile reducido, audio ininterrumpido) y desmontaje al desactivar.
- [ ] 10.6 QA pizarra: host dibuja/añade imagen y los asistentes lo ven en tiempo real; reactivación conserva el contenido; en meeting, "todos escriben" funciona.

## 11. Documentación

- [x] 11.1 `CLAUDE.md`: actualizar Technology Stack (Streaming: LiveKit + Agora por evento), grupo de variables de entorno Agora y nota del patrón de bifurcación por proveedor.
- [x] 11.2 Documentar en `api/.env.example` los pasos de consola Agora (resumen del design D11: App ID/Certificate, Co-host authentication, RESTful, Whiteboard opcional).
