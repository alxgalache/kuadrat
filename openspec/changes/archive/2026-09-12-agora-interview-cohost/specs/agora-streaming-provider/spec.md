# agora-streaming-provider

> Capa afectada: backend (`api/`) y frontend (`client/`). **Sin cambios de esquema de BD.** Endpoint nuevo `POST /api/events/:id/screen-token` con `authenticate` y validador Zod en `api/validators/eventSchemas.js`.

## MODIFIED Requirements

### Requirement: Emisión de tokens RTC Agora por rol y estado
Para eventos `provider='agora'` activos, `POST /api/events/:id/token` y `POST /api/events/:id/host-token` SHALL mantener todas las validaciones actuales (evento activo, credenciales de asistente, pago en eventos de pago, bans por email/IP, host autenticado) y devolver `{ provider:'agora', appId, channel, uid, rtcToken, interactionMode }`. La respuesta de `/token` SHALL incluir además `coHost` (booleano). Los tokens SHALL generarse en `api/services/agoraService.js` con el paquete `agora-token` (AccessToken2, TTL 4 h).

Roles:
- **Host** → `RtcRole.PUBLISHER` con uid reservado 1 (`HOST_UID`).
- **Asistente en `broadcast`** → `PUBLISHER` si `speaker_granted = 1` **o si es co-presentador** (ver `agora-broadcast-cohost`); `SUBSCRIBER` en cualquier otro caso.
- **Asistente en `meeting`** → `PUBLISHER`.
- **Pantalla compartida del host** → `PUBLISHER` con el uid reservado 2 (`HOST_SCREEN_UID`), solo en el endpoint de token de pantalla.

Los uids 1 y 2 SHALL quedar reservados al host y no asignarse nunca a un asistente. El `agora_uid` del asistente SHALL asignarse de forma estable en su primer token (secuencial por evento, ≥ 101, persistido en `event_attendees.agora_uid`). El asistente SHALL pasar a estado `joined` igual que hoy. Los eventos `provider='livekit'` SHALL seguir devolviendo `{ token, roomName, livekitUrl }` sin ningún cambio.

#### Scenario: Token de asistente en broadcast
- **WHEN** un asistente con acceso válido solicita token de un evento Agora `broadcast` activo
- **THEN** recibe `appId`, `channel='event-{id}'`, su `uid` estable, un `rtcToken` con rol SUBSCRIBER y `coHost: false`
- **AND** su estado pasa a `joined`

#### Scenario: Token de co-presentador en broadcast
- **WHEN** el admin co-presentador solicita token de un evento Agora `broadcast` activo
- **THEN** recibe un `rtcToken` con rol PUBLISHER para su uid de asistente (≥ 101) y `coHost: true`

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
El sistema SHALL exponer `POST /api/events/:id/renew-token` (validador Zod en `api/validators/eventSchemas.js`), que acepta las mismas credenciales de asistente que `/token` o el JWT **del host del evento**. Re-evalúa el estado vigente —`speaker_granted`, condición de co-presentador, bans, evento activo— y devuelve un `rtcToken` fresco con el rol que corresponda. La respuesta de la rama de asistente SHALL incluir `coHost`.

La rama JWT SHALL exigir `decoded.id === event.host_user_id`. Un JWT de admin que no es el host SHALL recibir 403: hasta este cambio recibía un token `HOST_UID`.

El cliente SHALL invocar la renovación al recibir `token-privilege-will-expire` del SDK y tras ser promovido o degradado.

#### Scenario: Renovación tras promoción
- **WHEN** un asistente promovido (`speaker_granted=1`) llama a `renew-token`
- **THEN** recibe un token PUBLISHER para el mismo `uid` y canal

#### Scenario: Renovación del co-presentador
- **WHEN** el admin co-presentador llama a `renew-token` con sus credenciales de asistente
- **THEN** recibe un token PUBLISHER para su mismo `uid` y `coHost: true`

#### Scenario: Admin no host con JWT
- **WHEN** un admin que no es el host del evento llama a `renew-token` solo con su JWT
- **THEN** la API responde 403 y no emite ningún token para `HOST_UID`

#### Scenario: Renovación denegada tras finalizar
- **WHEN** un cliente pide renovación de un evento ya `finished`
- **THEN** la API responde 400 y el cliente abandona la sala

### Requirement: Compartir pantalla del host (Agora)
El toggle «Pantalla» del host SHALL comportarse según el modo de interacción.

**`interaction_mode='broadcast'` — pantalla y cámara a la vez.** Un cliente de Agora solo puede publicar una pista de vídeo: `publish()` lanza `CAN_NOT_PUBLISH_MULTIPLE_VIDEO_TRACKS` en `agora-rtc-sdk-ng@4.24.6`. Por eso la pantalla SHALL publicarse desde un **segundo cliente RTC** (`mode: 'live'`, rol `host`) unido al mismo canal con el uid `HOST_SCREEN_UID` (2).

- **Token:** su token SHALL obtenerse de `POST /api/events/:id/screen-token`, que:
  - exige JWT del host del evento (`req.user.id === event.host_user_id`) y responde 403 a cualquier otro usuario, admin incluido
  - exige un evento Agora `broadcast` activo con canal, y responde 400 en `meeting`, en LiveKit o con el evento inactivo
  - devuelve `{ uid: 2, rtcToken }` con rol PUBLISHER
- **Pista de pantalla:** SHALL crearse sin audio, como hoy, con un perfil que no supere 1792 × 1008. El perfil SHALL definirse en `client/lib/constants.js`: deja sitio a las cámaras de la esquina dentro de la banda Full HD (ver `agora-broadcast-stage`).
- **Cámara:** la cámara del host SHALL **permanecer publicada** en el cliente principal mientras se comparte.
- **Suscripciones:** el cliente principal del host NO SHALL suscribirse a los tracks del uid 2, porque pinta su pantalla desde la pista local. El segundo cliente NO SHALL suscribirse a nada.
- **Fin:** al desactivar, sea por el toggle o por «Dejar de compartir» del navegador (evento `track-ended`), SHALL despublicarse la pista, cerrarla y abandonar el canal con el segundo cliente. Lo mismo SHALL ocurrir al desmontar la sala.
- **Renovación:** ante `token-privilege-will-expire` del segundo cliente, SHALL pedirse de nuevo `screen-token` y renovarse.

**`interaction_mode='meeting'` — intercambio en un solo cliente (sin cambios).** Al activar, se crea el track con `AgoraRTC.createScreenVideoTrack()`, se des-publica la cámara y se publica la pantalla. Al desactivar (toggle o `track-ended`), se vuelve a publicar la cámara si estaba activa. Los asistentes ven la pantalla en el recuadro destacado del host.

#### Scenario: Presentación con cámara en un evento stream
- **WHEN** el host activa «Pantalla» con la cámara encendida en un evento `broadcast`
- **THEN** los asistentes reciben la pantalla (uid 2) y la cámara del host (uid 1) a la vez, compuestas según `agora-broadcast-stage`

#### Scenario: Dejar de compartir desde el navegador
- **WHEN** el host detiene la compartición desde el aviso del navegador
- **THEN** el segundo cliente abandona el canal, la pantalla desaparece para todos y la cámara del host, que nunca dejó de publicarse, vuelve a ocupar la escena

#### Scenario: El host no descarga su propia pantalla
- **WHEN** el host comparte pantalla
- **THEN** su cliente principal no se suscribe al vídeo del uid 2 y su vista usa la pista local

#### Scenario: Token de pantalla solo para el host
- **WHEN** un admin que no es el host llama a `POST /api/events/:id/screen-token`
- **THEN** la API responde 403

#### Scenario: Meeting conserva el intercambio
- **WHEN** el host de un evento `meeting` comparte pantalla con la cámara encendida
- **THEN** la cámara se des-publica y la pantalla ocupa el recuadro destacado, exactamente como antes de este cambio
