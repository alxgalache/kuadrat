# agora-streaming-provider — Delta Spec

> Capa afectada: backend (`api/`) y frontend (`client/`). Cambia el esquema de BD: SOLO vía `api/config/database.js` (actualizar `CREATE TABLE` + `safeAlter`, nunca bloques `ALTER TABLE` sueltos).

## ADDED Requirements

### Requirement: Selección de proveedor de streaming por evento
El sistema SHALL permitir al admin elegir el proveedor de streaming (`livekit` | `agora`) al crear o editar un evento de formato `live`, con valor por defecto `livekit`. La columna `events.provider` SHALL definirse en `api/config/database.js` (`CREATE TABLE` + `safeAlter`) con `CHECK(provider IN ('livekit','agora'))`. Los validadores `createEventSchema` y `updateEventSchema` de `api/validators/eventSchemas.js` SHALL aceptar `provider` como enum Zod. Los eventos con `provider='livekit'` SHALL conservar exactamente el comportamiento actual en todos los flujos.

#### Scenario: Creación de evento con proveedor Agora
- **WHEN** el admin crea un evento `format='live'` con `provider='agora'` desde `client/app/admin/espacios/nuevo/page.js`
- **THEN** `POST /api/admin/events` persiste `provider='agora'`
- **AND** la respuesta incluye el evento con su proveedor

#### Scenario: Valor por defecto retrocompatible
- **WHEN** se crea un evento sin indicar `provider` (o existe un evento previo al cambio)
- **THEN** el evento queda con `provider='livekit'` y se comporta exactamente igual que hoy

#### Scenario: Proveedor inválido rechazado
- **WHEN** llega `provider='zoom'` al endpoint admin
- **THEN** la validación Zod (middleware `validate()`) responde 400 sin tocar la BD

### Requirement: Modo de interacción por evento (solo Agora)
El sistema SHALL soportar `events.interaction_mode` (`broadcast` | `meeting`, defecto `broadcast`, `CHECK` en BD). `broadcast` SHALL replicar la experiencia LiveKit actual; `meeting` SHALL habilitar el grid de cámaras con auto-control por participante. La validación SHALL exigir: `interaction_mode='meeting'` solo con `provider='agora'`, y en ese caso `max_attendees` obligatorio y ≤ 16 (límite técnico de Agora: 17 emisores de vídeo simultáneos). Para eventos LiveKit el campo SHALL ignorarse.

#### Scenario: Evento taller en modo meeting
- **WHEN** el admin crea un evento `provider='agora'`, `interaction_mode='meeting'`, `max_attendees=12`
- **THEN** el evento se persiste y la sala usará el layout de grid de cámaras

#### Scenario: Meeting sin aforo válido rechazado
- **WHEN** el admin envía `interaction_mode='meeting'` sin `max_attendees` o con `max_attendees=30`
- **THEN** la API responde 400 con mensaje es-ES indicando el aforo máximo de 16

#### Scenario: Meeting con LiveKit rechazado
- **WHEN** el admin envía `provider='livekit'` con `interaction_mode='meeting'`
- **THEN** la API responde 400 (el modo meeting requiere proveedor Agora)

### Requirement: Formulario admin con selección de proveedor y modo
La página `client/app/admin/espacios/nuevo/page.js` (y la edición en `[id]/page.js`) SHALL mostrar, en la sección "Formato" y solo cuando `format='live'`: un select "Proveedor de streaming" (LiveKit | Agora, defecto LiveKit) y, cuando `provider='agora'`, un select "Modo de interacción" ("Stream (mano levantada)" | "Reunión (cámaras)"). Con `meeting` seleccionado, el campo de aforo SHALL marcarse obligatorio con ayuda contextual del límite. Todos los textos SHALL estar en es-ES y usar los bloques Tailwind existentes del formulario.

#### Scenario: Selects condicionales visibles
- **WHEN** el admin elige formato "En directo" y proveedor "Agora"
- **THEN** aparece el select de modo de interacción con defecto "Stream (mano levantada)"
- **AND** al elegir "Reunión (cámaras)" el aforo pasa a ser obligatorio (máx. 16)

#### Scenario: Formato vídeo oculta el proveedor
- **WHEN** el admin elige formato "Vídeo pregrabado"
- **THEN** no se muestran ni proveedor ni modo de interacción (el pase de vídeo es agnóstico al proveedor)

### Requirement: Configuración de entorno Agora centralizada
`api/config/env.js` SHALL exponer el grupo `config.agora` con `appId` (`AGORA_APP_ID`), `appCertificate` (`AGORA_APP_CERTIFICATE`), `customerId` (`AGORA_CUSTOMER_ID`) y `customerSecret` (`AGORA_CUSTOMER_SECRET`) como opcionales (mismo patrón que `config.livekit`). Ningún módulo SHALL leer `process.env` directamente. `api/services/agoraService.js` SHALL lanzar un error claro si se invoca sin credenciales configuradas. No SHALL añadirse ninguna variable `NEXT_PUBLIC_*`: el `appId` viaja al cliente en la respuesta de los endpoints de token.

#### Scenario: Uso sin configurar
- **WHEN** el admin inicia un evento Agora sin `AGORA_APP_ID` configurado
- **THEN** la API responde con error controlado (patrón `ApiError` + `errorHandler`) y un log Pino descriptivo, sin caída del proceso

### Requirement: Emisión de tokens RTC Agora por rol y estado
Para eventos `provider='agora'` activos, `POST /api/events/:id/token` y `POST /api/events/:id/host-token` SHALL mantener todas las validaciones actuales (evento activo, credenciales de asistente, pago en eventos de pago, bans por email/IP, host autenticado) y devolver `{ provider:'agora', appId, channel, uid, rtcToken, interactionMode }`. Los tokens SHALL generarse en `api/services/agoraService.js` con el paquete `agora-token` (AccessToken2, TTL 4 h): host → `RtcRole.PUBLISHER` y uid reservado 1; asistente en `broadcast` → `SUBSCRIBER` si `speaker_granted=0`, `PUBLISHER` si `speaker_granted=1`; asistente en `meeting` → `PUBLISHER`. El `agora_uid` del asistente SHALL asignarse de forma estable en su primer token (secuencial por evento, ≥ 101, persistido en `event_attendees.agora_uid`). El asistente SHALL pasar a estado `joined` igual que hoy. Los eventos `provider='livekit'` SHALL seguir devolviendo `{ token, roomName, livekitUrl }` sin ningún cambio.

#### Scenario: Token de asistente en broadcast
- **WHEN** un asistente con acceso válido solicita token de un evento Agora `broadcast` activo
- **THEN** recibe `appId`, `channel='event-{id}'`, su `uid` estable y un `rtcToken` con rol SUBSCRIBER
- **AND** su estado pasa a `joined`

#### Scenario: Token de host
- **WHEN** el host autenticado (JWT) solicita `host-token` de su evento Agora activo
- **THEN** recibe un `rtcToken` PUBLISHER con `uid=1`

#### Scenario: Asistente chat-banned recibe token igualmente
- **WHEN** un asistente con `chat_banned=1` solicita token
- **THEN** recibe token de su rol normal (el chat se bloquea en el servidor Socket.IO, no en el token RTC)

#### Scenario: Evento LiveKit intacto
- **WHEN** un asistente solicita token de un evento `provider='livekit'`
- **THEN** la respuesta y el flujo son byte-a-byte los actuales (LiveKit)

### Requirement: Renovación de token Agora
El sistema SHALL exponer `POST /api/events/:id/renew-token` (validador Zod nuevo en `api/validators/eventSchemas.js`, mismas credenciales que `/token` o JWT de host) que re-evalúa el estado vigente (`speaker_granted`, bans, evento activo) y devuelve un `rtcToken` fresco con el rol que corresponda. El cliente SHALL invocarlo al recibir `token-privilege-will-expire` del SDK y tras ser promovido o degradado.

#### Scenario: Renovación tras promoción
- **WHEN** un asistente promovido (`speaker_granted=1`) llama a `renew-token`
- **THEN** recibe un token PUBLISHER para el mismo `uid` y canal

#### Scenario: Renovación denegada tras finalizar
- **WHEN** un cliente pide renovación de un evento ya `finished`
- **THEN** la API responde 400 y el cliente abandona la sala

### Requirement: Enforcement server-side de publicación
Con la función **Co-host authentication** activada en el proyecto de la consola Agora, un cliente con token SUBSCRIBER SHALL NOT poder publicar audio ni vídeo aunque manipule el cliente (equivalente real del `canPublish:false` de LiveKit). La degradación SHALL reforzarse además con una kicking rule REST (`POST https://api.agora.io/dev/v1/kicking-rule`, Basic Auth `customerId:customerSecret`, privilegios `publish_audio`+`publish_video`, duración 1440 min) gestionada por `agoraService`, que SHALL retirarse al re-promover.

#### Scenario: Cliente manipulado no publica
- **WHEN** un asistente con token SUBSCRIBER fuerza `setClientRole('host')` y `publish()` desde la consola del navegador
- **THEN** el canal Agora rechaza la publicación y el resto de participantes no recibe ningún track suyo

#### Scenario: Regla de bloqueo al degradar
- **WHEN** el host degrada a un participante promovido
- **THEN** `agoraService` crea la kicking rule de publicación para su `uid` y guarda el `ruleId`
- **AND** al re-promoverlo la regla se elimina antes de emitir el nuevo token PUBLISHER

### Requirement: Ciclo de vida de evento Agora
`POST /api/admin/events/:id/start` SHALL, en la rama `provider='agora'`, fijar `agora_channel_name='event-{id}'` y `status='active'` sin llamadas externas (los canales Agora son implícitos), y emitir el broadcast Socket.IO `event_started` actual. `POST /api/events/:id/end` (host) y `/api/admin/events/:id/end` SHALL, en la rama Agora, marcar `finished` + `finished_at` y emitir `event_ended` sin intento de borrado de sala. Las ramas LiveKit SHALL permanecer intactas (creación/borrado de sala LiveKit).

#### Scenario: Inicio de evento Agora
- **WHEN** el admin inicia un evento Agora programado
- **THEN** el evento queda `active` con `agora_channel_name` fijado y los clientes en la página reciben `event_started`

#### Scenario: Fin de stream por el host
- **WHEN** el host confirma "Finalizar stream" en un evento Agora
- **THEN** el evento pasa a `finished` (con `finished_at` estampado una sola vez) y todos los clientes reciben `event_ended`, muestran el modal "Evento finalizado" y abandonan el canal RTC

### Requirement: Sala Socket.IO autenticada para eventos Agora
`api/socket/eventSocket.js` SHALL añadir la sala `event-room-{eventId}` con `join_event_room` autenticado: asistentes con `{attendeeId, accessToken}` (revalidando acceso, pago, bans email/IP y evento Agora activo, reutilizando `eventService`) y host/admin con JWT. El join SHALL responder con la presencia completa y la identidad propia, o `room_join_denied` en caso de rechazo. La sala pública actual `event-{eventId}` (start/end y chat de pases de vídeo) SHALL permanecer sin cambios.

#### Scenario: Join válido de asistente
- **WHEN** un asistente con sesión válida emite `join_event_room`
- **THEN** entra en la sala, recibe la lista de presencia y el resto recibe `presence_joined` con su identidad y nombre

#### Scenario: Join rechazado por ban
- **WHEN** un asistente cuyo email o IP está en `event_bans` intenta `join_event_room`
- **THEN** recibe `room_join_denied` y no entra en la sala

### Requirement: Presencia en tiempo real de participantes
La presencia de la sala Socket.IO SHALL ser la fuente de verdad del grid de participantes y del contador "N conectados" en eventos Agora (la audiencia que no publica es invisible en el canal RTC). Cada entrada SHALL incluir `{ identity, name, isHost, agoraUid, handRaised, speaker, chatBanned }` y el servidor SHALL emitir `presence_joined`/`presence_left`/`presence_updated` ante cambios.

#### Scenario: Audiencia visible sin publicar
- **WHEN** un asistente entra a un evento Agora broadcast sin publicar nada
- **THEN** todos los clientes muestran su tile de inicial con su nombre y el contador se incrementa

#### Scenario: Salida limpia
- **WHEN** el socket de un asistente se desconecta
- **THEN** el servidor emite `presence_left` y su tile desaparece del grid

### Requirement: Chat de eventos Agora con enforcement en servidor
El chat de eventos Agora SHALL ir por la sala Socket.IO autenticada: `event_chat_message { text }` → el servidor SHALL descartar mensajes de identidades con `chat_banned=1` (consultando `eventService.isAttendeeChatBanned`) y difundir `{ identity, name, message, timestamp }` al resto. No SHALL entregarse historial a quien se une tarde (paridad con el chat LiveKit). El `ChatPanel` del cliente SHALL conservar la UI actual (mensajes, input, autoscroll, "Sin mensajes todavía", menú de tres puntos del host, aviso es-ES al expulsado).

#### Scenario: Mensaje difundido
- **WHEN** un asistente sin ban envía un mensaje
- **THEN** todos los participantes de la sala lo ven con su nombre en el chat lateral

#### Scenario: Mensaje de expulsado descartado
- **WHEN** un asistente con `chat_banned=1` emite `event_chat_message`
- **THEN** el servidor no lo difunde a nadie
- **AND** el cliente del expulsado muestra el aviso "Has sido expulsado del chat por comportamiento inapropiado."

### Requirement: Moderación de chat y anti-spam en eventos Agora
La expulsión del chat SHALL reutilizar los endpoints actuales (`POST /api/events/:id/participants/:identity/ban-from-chat` para el host y `report-spam`) con rama Agora: persistir `chat_banned` (y en spam, además `event_bans` por email+IP) y emitir `chat_banned {identity}` por Socket.IO. La detección de spam SHALL ejecutarse en el servidor del chat con los mismos umbrales actuales (más de 10 mensajes en 10 s, constantes compartidas), aplicando el mismo efecto que `report-spam`.

#### Scenario: Host expulsa del chat desde un mensaje
- **WHEN** el host usa "Expulsar del chat" en el menú de un mensaje
- **THEN** el asistente queda `chat_banned` en BD, sus mensajes dejan de difundirse y su cliente muestra el estado de expulsado

#### Scenario: Spam auto-detectado en servidor
- **WHEN** una identidad supera 10 mensajes en 10 segundos
- **THEN** el servidor la chat-banea, registra el ban email+IP en `event_bans` y deja de difundir sus mensajes

### Requirement: Levantar la mano en eventos Agora broadcast
Los asistentes no promovidos SHALL disponer del botón "Levantar mano"/"Bajar mano" actual; el estado SHALL viajar por Socket.IO (`hand_raise {raised}`), reflejarse en la presencia y en los tiles de todos (icono ámbar, orden priorizado en la vista del host). Al promover, el servidor SHALL limpiar la mano levantada (paridad con el borrado del atributo en LiveKit).

#### Scenario: Mano levantada visible para el host
- **WHEN** un asistente pulsa "Levantar mano"
- **THEN** su tile muestra el icono ámbar y se ordena antes que los no solicitantes en la vista del host

#### Scenario: Mano limpiada al promover
- **WHEN** el host promueve a un asistente con la mano levantada
- **THEN** la presencia limpia `handRaised` y el icono desaparece para todos

### Requirement: Promoción y degradación de participantes (Agora broadcast)
Los endpoints actuales `POST /api/events/:id/participants/:identity/promote|demote` (host) y sus equivalentes admin SHALL bifurcar por proveedor. Rama Agora — promote: `speaker_granted=1`, retirada de kicking rule si existe, emisión de `promoted {identity}`; el cliente objetivo SHALL pedir `renew-token`, hacer `setClientRole('host')`, publicar y activar el micrófono automáticamente (paridad). Demote: `speaker_granted=0`, kicking rule de publicación, `demoted {identity}`; el cliente SHALL des-publicar y volver a `audience`, mostrando los mismos estados visuales actuales (verde/rojo). La interacción del host SHALL ser idéntica: clic en tile para dar/quitar la palabra.

#### Scenario: Flujo completo de palabra concedida
- **WHEN** el host hace clic en el tile ámbar de un asistente con la mano levantada
- **THEN** el asistente recibe `promoted`, obtiene token PUBLISHER, publica su micrófono activado y su tile pasa a verde para todos

#### Scenario: Palabra retirada
- **WHEN** el host hace clic en el tile verde de un promovido
- **THEN** el asistente recibe `demoted`, des-publica, vuelve a audiencia y su tile pasa a rojo

#### Scenario: Autoservicio de silencio del promovido
- **WHEN** un asistente promovido con micro activo hace clic en su propio tile "(Tu)"
- **THEN** su micrófono local se mutea (sin perder la promoción)

### Requirement: Silenciado forzado por el admin (Agora)
`POST /api/admin/events/:id/participants/:identity/mute` SHALL, en la rama Agora, emitir `force_mute {identity}` por Socket.IO; el cliente objetivo SHALL silenciar su micrófono local inmediatamente. (Enforcement duro disponible vía degradación; diferencia documentada en design R4.)

#### Scenario: Admin silencia a un promovido
- **WHEN** el admin pulsa silenciar sobre un participante en el panel
- **THEN** el micrófono del participante queda muteado y su badge pasa a rojo en todos los clientes

### Requirement: Sala en directo Agora — modo broadcast con paridad LiveKit
`client/components/AgoraLiveRoom.js` (nuevo, import dinámico `ssr:false`; `EventDetail.js` selecciona componente por `event.provider`) SHALL replicar en modo `broadcast` la UI/UX de `EventLiveRoom.js`: layout de dos columnas con chat lateral de altura sincronizada al área de vídeo; área de vídeo del host 16:9 negra con "Esperando al host..." (viewer) / "Tu vista de presentador" (host); grid de cámaras de promovidos; grid de tiles de iniciales con los mismos estados, colores, badges de micro, orden (host primero, mano levantada priorizada, local al final con "(Tu)") y acciones por clic; controles de host (toggles Micrófono/Cámara/Pantalla + selectores de dispositivos + "Finalizar stream" con `ConfirmDialog`); botón de mano para viewers; pantalla completa para viewers; contador "N conectados". La lógica RTC SHALL encapsularse en `client/hooks/useAgoraRoom.js` y la de sala en `client/hooks/useEventRoomSocket.js`; los umbrales/constantes compartidos SHALL vivir en `client/lib/constants.js`. Todos los textos SHALL ser los es-ES actuales.

#### Scenario: Viewer entra a un broadcast Agora activo
- **WHEN** un asistente con acceso entra a `/live/{slug}` de un evento Agora broadcast activo
- **THEN** ve el mismo layout que en un evento LiveKit: vídeo del host, tiles de participantes, botón de mano y chat lateral funcional

#### Scenario: Selección de componente por proveedor
- **WHEN** `EventDetail.js` recibe un evento activo `provider='agora'` y credenciales del endpoint de token
- **THEN** monta `AgoraLiveRoom` con `{appId, channel, uid, rtcToken, interactionMode, isHost, eventId}`
- **AND** con `provider='livekit'` monta `EventLiveRoom` exactamente como hoy

### Requirement: Indicador de "hablando" y activación de audio (Agora)
La sala Agora SHALL habilitar `client.enableAudioVolumeIndicator()` y usar el evento `volume-indicator` (nivel > umbral definido en `client/lib/constants.js`) para el anillo verde pulsante del área del host y de los tiles (paridad visual con `useIsSpeaking`). Ante `AgoraRTC.onAutoplayFailed`, la sala SHALL mostrar el mismo overlay modal "Activar audio" actual y reanudar la reproducción de los tracks remotos tras el clic.

#### Scenario: Anillo al hablar el host
- **WHEN** el host habla con el micro activo
- **THEN** su contenedor de vídeo muestra el anillo verde pulsante mientras el nivel supera el umbral

#### Scenario: Autoplay bloqueado
- **WHEN** el navegador bloquea la reproducción automática de audio
- **THEN** aparece el overlay "Activar audio" y, tras el clic, el audio del evento se oye con normalidad

### Requirement: Selector de dispositivos del host (Agora)
El host de un evento Agora SHALL disponer del mismo selector de dispositivos que la spec `host-device-selector` (chevrons junto a Micrófono/Cámara, "Altavoces" solo selector, sin selector en Pantalla; mismo dropdown, cierre por clic-fuera/Escape, dispositivo activo con check, hot-plug). La lógica SHALL implementarse en `client/hooks/useAgoraDevices.js` sobre `AgoraRTC.getMicrophones()/getCameras()/getPlaybackDevices()`, `track.setDevice()`, `audioTrack.setPlaybackDevice()` y los callbacks `onMicrophoneChanged`/`onCameraChanged`/`onPlaybackDeviceChanged`. El dropdown presentacional SHALL extraerse a `client/components/events/DeviceDropdown.js` y reutilizarse desde el `DeviceSelector` LiveKit actual sin alterar su lógica (tarea de riesgo: tocar componente estable).

#### Scenario: Cambio de micrófono en caliente
- **WHEN** el host de un evento Agora selecciona otro micrófono en el dropdown
- **THEN** el track de audio publicado cambia de dispositivo sin recargar y el stream continúa para los asistentes

#### Scenario: Altavoces no soportados
- **WHEN** el navegador no expone dispositivos `audiooutput`
- **THEN** el control "Altavoces" no se renderiza (degradación igual a la actual)

### Requirement: Compartir pantalla del host (Agora)
El toggle "Pantalla" del host SHALL implementar el swap en un solo cliente: al activar, crear el track con `AgoraRTC.createScreenVideoTrack()`, des-publicar la cámara y publicar la pantalla; al desactivar (toggle o "Dejar de compartir" del navegador vía evento `track-ended` del track), volver a publicar la cámara si estaba activa. Los asistentes SHALL ver la pantalla en el área principal del host (paridad visual: la UI actual muestra un único track del host con preferencia por la pantalla).

#### Scenario: Compartir y dejar de compartir
- **WHEN** el host activa "Pantalla" con la cámara encendida
- **THEN** los asistentes pasan a ver la pantalla compartida en el área principal
- **AND** al pararla desde el aviso del navegador, vuelven a ver la cámara del host sin intervención manual

### Requirement: Detección de expulsión del canal (Agora)
Si un cliente es expulsado del canal (kicking rule `join_channel` → `connection-state-change` con razón `UID_BANNED`), la sala SHALL ejecutar el mismo flujo `onKicked` actual: pantalla "Has sido expulsado del stream", limpieza de la sesión `event_attendee_{eventId}` en localStorage y redirección a la home a los 4 segundos.

#### Scenario: Cliente baneado
- **WHEN** el SDK reporta desconexión con razón `UID_BANNED`
- **THEN** el asistente ve la pantalla de expulsión es-ES y es redirigido, sin poder reconectar con la sesión borrada

### Requirement: Sala en directo Agora — modo meeting (grid de cámaras)
Con `interaction_mode='meeting'`, la sala SHALL presentar un grid responsivo de tiles grandes (1/2/3/4 columnas según número de participantes) con: vídeo de cámara (o avatar de inicial si está apagada), nombre, badge de estado de micro y anillo de "hablando"; tile propio marcado "(Tu)". TODOS los participantes SHALL entrar como PUBLISHER con **micrófono muteado y cámara apagada por defecto**, y disponer en la barra inferior de controles propios: activar/silenciar micrófono, encender/apagar cámara y selectores de dispositivo. El host SHALL disponer además de compartir pantalla (ocupa el área destacada del grid), silenciar a un participante (`force_mute`), expulsar del chat y "Finalizar evento". El chat lateral SHALL ser el mismo `ChatPanel` por Socket.IO. No SHALL mostrarse el botón de levantar la mano (todos pueden hablar).

#### Scenario: Taller con cámaras
- **WHEN** 8 asistentes entran a un evento Agora meeting activo
- **THEN** cada uno aparece en el grid (avatar si su cámara está apagada) muteado por defecto
- **AND** cualquiera puede encender su cámara y des-mutearse desde su propia barra de controles

#### Scenario: Host modera un micrófono abierto
- **WHEN** el host silencia a un participante con ruido de fondo
- **THEN** el micrófono del participante queda muteado para todos y este puede volver a activarlo cuando lo necesite

#### Scenario: Pantalla compartida en meeting
- **WHEN** el host comparte pantalla en un meeting
- **THEN** la pantalla ocupa el área destacada y los tiles de cámaras se reordenan alrededor

### Requirement: Panel admin de participantes consciente del proveedor
`GET /api/admin/events/:id/participants` SHALL, en la rama Agora, servir la lista desde la presencia Socket.IO del backend (identity, nombre, `isHost`, `speaker`, `handRaised`, `chatBanned`) manteniendo el shape que consume `client/app/admin/espacios/[id]/page.js`, con las acciones promote/demote/mute operativas contra los endpoints bifurcados. La rama LiveKit (RoomServiceClient) SHALL permanecer intacta.

#### Scenario: Admin observa una sala Agora activa
- **WHEN** el admin abre el detalle de un evento Agora activo
- **THEN** ve la lista de conectados con su estado y puede promover, degradar o silenciar desde el panel
