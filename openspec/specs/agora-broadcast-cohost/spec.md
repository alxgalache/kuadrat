# agora-broadcast-cohost

## Purpose

El admin como co-presentador de los eventos Agora `broadcast`: la elegibilidad, derivada de `event_attendees.is_staff` y del rol de admin vigente; el token de publicación con la marca `coHost`; los controles restringidos (micrófono, cámara, altavoces y disposición de cámaras); la presencia del co-presentador en la sala Socket.IO autenticada; la protección del staff frente a la moderación; la disposición compartida `stage_layout`, que solo él dirige; y la regla de que solo el host del evento obtiene identidad de host.

> Capa afectada: backend (`api/`) y frontend (`client/`). **Sin cambios de esquema de BD**: el co-presentador se deriva de columnas existentes (`event_attendees.is_staff`, `users.role`). Si alguna tarea derivada llegara a necesitar una columna, SOLO vía `api/config/database.js`.

## Requirements
### Requirement: Elegibilidad del co-presentador

El sistema SHALL considerar **co-presentador** de un evento a un asistente que cumpla a la vez las cuatro condiciones siguientes:

1. `events.provider = 'agora'`
2. `events.interaction_mode = 'broadcast'`
3. `event_attendees.is_staff = 1`
4. existe hoy un usuario en `users` con el mismo email y `role = 'admin'`

La comprobación SHALL vivir en **un único** predicado de `api/services/eventService.js`, consumido por `getViewerToken`, `renewToken` (`api/controllers/eventController.js`) y por `join_event_room` (`api/socket/eventSocket.js`). No SHALL existir una segunda copia de la condición en línea.

La condición 4 existe porque la sesión de asistente del admin vive en `localStorage` y no caduca con su rol: sin ella, alguien que dejó de ser admin conservaría el permiso de publicar en cualquier stream.

#### Scenario: Admin en un evento stream de Agora
- **WHEN** un admin entra con «Entrar como administrador» en un evento `provider='agora'`, `interaction_mode='broadcast'`
- **THEN** el predicado lo reconoce como co-presentador

#### Scenario: Antiguo admin con la sesión guardada
- **WHEN** un asistente `is_staff = 1` presenta su sesión, pero su usuario ya no tiene `role = 'admin'`
- **THEN** el predicado NO lo reconoce como co-presentador
- **AND** recibe el trato de un asistente normal del evento, conservando únicamente la exención de pago que ya tenía

#### Scenario: Asistente ordinario
- **WHEN** un asistente con `is_staff = 0` solicita token en un evento stream
- **THEN** nunca es co-presentador, sea cual sea su estado

#### Scenario: Evento en modo reunión
- **WHEN** el admin entra en un evento Agora `meeting`
- **THEN** no es co-presentador y conserva el comportamiento actual de ese modo

### Requirement: Token de publicación del co-presentador

Para un co-presentador, `POST /api/events/:id/token` y `POST /api/events/:id/renew-token` SHALL emitir un `rtcToken` con rol `publisher`:

- para el uid estable que asigna `agoraService.ensureAttendeeUid`, nunca `HOST_UID` (1) ni `HOST_SCREEN_UID` (2)
- añadiendo `coHost: true` a la respuesta

Para cualquier otro asistente, la respuesta SHALL incluir `coHost: false`, y el rol SHALL seguir las reglas existentes. Todas las demás validaciones (evento activo, sala disponible, bans por email e IP, exención de pago del staff) SHALL aplicarse sin cambios.

#### Scenario: Primer token del co-presentador
- **WHEN** el admin co-presentador solicita token de un evento stream activo
- **THEN** recibe `role` de publicación, su uid de asistente (≥ 101) y `coHost: true`
- **AND** su estado pasa a `joined`, igual que cualquier asistente

#### Scenario: Renovación sin perder el rol
- **WHEN** el SDK dispara `token-privilege-will-expire` en el cliente del co-presentador
- **THEN** `renew-token` con sus credenciales de asistente devuelve de nuevo un token `publisher` con `coHost: true`

#### Scenario: Ban por IP también al co-presentador
- **WHEN** la IP del admin figura en `event_bans` para ese evento
- **THEN** la solicitud de token se rechaza con 403, igual que para cualquier asistente

### Requirement: Controles del co-presentador en la sala

`client/app/live/[slug]/EventDetail.js` SHALL propagar `coHost` desde la respuesta del token hasta `AgoraLiveRoom`. Con `coHost = true` y `interactionMode = 'broadcast'`, la sala SHALL:

- Unirse con rol de cliente `host` de Agora (publicador) y con el micrófono y la cámara **apagados**.
- Mostrar **exclusivamente** estos controles:
  - interruptor de micrófono con su selector de dispositivo
  - interruptor de cámara con su selector de dispositivo
  - selector de altavoces, solo si el navegador expone salidas de audio
  - conmutador de disposición de cámaras
- NO mostrar: pantalla compartida, pizarra, «Todos escriben», efectos de fondo, selector de calidad, «Finalizar stream» ni el botón de levantar la mano.
- Obtener estado y acciones de `client/hooks/useHostMediaControls.js`, instanciado **una sola vez** en `AgoraLiveRoom` como hoy, con una presentación propia y restringida. No SHALL crearse una segunda copia de la lógica de dispositivos.
- Crear la cámara con `AGORA_CAMERA_ENCODER_HOST` (1280 × 720, 16:9), sin selector de calidad, y reafirmar ese perfil tras cambiar de cámara.
- Crear el micrófono con `encoderConfig: AGORA_MIC_ENCODER_HOST` **omitiendo** las claves `AEC`, `ANS` y `AGC`, de modo que actúe el procesado del navegador. El co-presentador oye al host por sus altavoces, y es su cancelación de eco la que evita devolver esa voz al canal.
- Mantener la pantalla encendida con `useScreenWakeLock` mientras el evento no haya terminado, igual que en la vista del host: quien emite no debe quedarse sin pantalla a mitad de la entrevista.

Los textos SHALL estar en es-ES y vivir en `client/lib/constants.js`.

#### Scenario: El admin entra en la entrevista
- **WHEN** el admin co-presentador entra en la sala de un evento stream activo
- **THEN** ve los controles de micrófono, cámara, dispositivos y disposición, todos apagados
- **AND** no ve «Pantalla», «Pizarra», «Efectos», «Calidad», «Finalizar stream» ni «Levantar mano»

#### Scenario: El admin enciende la cámara
- **WHEN** el admin activa su cámara
- **THEN** la pista se publica a 1280 × 720 en 16:9 y todos los participantes pasan a ver la escena de dos cámaras (ver `agora-broadcast-stage`)

#### Scenario: Cambio de cámara del admin en caliente
- **WHEN** el admin selecciona otra cámara durante la emisión
- **THEN** el vídeo continúa publicado sin recargar y conserva la relación 16:9

#### Scenario: El host no pierde nada
- **WHEN** hay un co-presentador en la sala
- **THEN** los controles del host son exactamente los actuales

#### Scenario: Espectadores sin cambios
- **WHEN** un asistente ordinario está en un evento con co-presentador
- **THEN** no dispone de controles de cámara ni de micrófono propios y sigue levantando la mano como hoy

### Requirement: Presencia del co-presentador

En `join_event_room`, la rama de asistente de `api/socket/eventSocket.js` SHALL añadir `coHost` a la entrada de presencia, evaluado con el predicado de elegibilidad. Para un co-presentador:

- SHALL fijar `speaker: true` en la presencia, **sin** escribir `event_attendees.speaker_granted`.
- `hand_raise` SHALL ignorarse.
- La detección automática de spam NO SHALL aplicarse, igual que no se aplica al host: su efecto incluye banear email e IP del evento.

`publicPresence` SHALL exponer `coHost`.

La comprobación de pago de `authenticateJoin` SHALL aplicar la misma exención de staff que `requiresPayment` en el controlador, en lugar de su copia actual sin exención.

#### Scenario: Presencia visible
- **WHEN** el co-presentador entra en la sala socket
- **THEN** todos los clientes reciben su entrada con `coHost: true` y `speaker: true`

#### Scenario: Muchos mensajes seguidos del entrevistador
- **WHEN** el co-presentador envía más de 10 mensajes en 10 segundos
- **THEN** los mensajes se difunden y no se crea ningún ban de chat, email ni IP

#### Scenario: Admin en un evento de pago
- **WHEN** el socket del admin se une a la sala de un evento de pago con su asistente aún en estado `registered`
- **THEN** la unión se acepta, como ya aceptan los endpoints de token

### Requirement: Protección del staff frente a la moderación

El servidor SHALL rechazar con **400**, sin efectos secundarios, cualquier acción de moderación cuyo objetivo sea un asistente `is_staff = 1`:

- promover y degradar: `resolveAgoraAttendee` en `api/controllers/eventController.js`, que cubre los endpoints del host y del admin
- `POST /api/events/:id/participants/:identity/ban-from-chat`
- `POST /api/events/:id/participants/:identity/report-spam`

«Sin efectos secundarios» significa:

- no se escribe `speaker_granted`
- no se crea ni se retira ninguna *kicking rule* de Agora
- no se marca `chat_banned`
- no se inserta nada en `event_bans`
- no se emite ninguna señal de socket

La protección aplica a todo staff, no solo al co-presentador.

En el cliente, la casilla del co-presentador en la rejilla de participantes NO SHALL tener acción de clic para nadie. En el chat, el menú «Expulsar del chat» NO SHALL ofrecerse sobre sus mensajes.

#### Scenario: El host pulsa la casilla del entrevistador
- **WHEN** el host hace clic en la casilla del co-presentador en la rejilla de participantes
- **THEN** no ocurre nada y el co-presentador sigue publicando

#### Scenario: Degradación forzada por API
- **WHEN** se llama a `POST /api/events/:id/participants/viewer-{staffAttendeeId}/demote` con el JWT del host
- **THEN** la API responde 400
- **AND** no se crea ninguna *kicking rule* ni cambia `speaker_granted`

#### Scenario: Reporte de spam contra el admin
- **WHEN** un asistente reporta como spam al admin
- **THEN** la API responde 400 y no se inserta ninguna fila en `event_bans`

### Requirement: Disposición de cámaras controlada por el co-presentador

La sala socket SHALL mantener por evento, en memoria, una disposición de escena con los valores `'split'` (dividida, por defecto) y `'pip'` (recuadro), con el mismo ciclo de vida que el estado de la pizarra.

- **Cambio:** el evento `stage_layout { mode }` SHALL aceptarse solo desde una entrada de presencia con `coHost: true` y un valor válido. Cualquier otro emisor o valor SHALL ignorarse en silencio. Al aceptarlo, el servidor SHALL difundir `stage_layout { mode }` a toda la sala.
- **Entrada tarde:** la respuesta de `join_event_room` SHALL incluir `stageLayout`.
- **Fin del evento:** `broadcastEventEnded` SHALL descartar el valor.
- **Cliente:**
  - `client/hooks/useEventRoomSocket.js` SHALL exponer `stageLayout` y una acción para emitirlo.
  - El co-presentador SHALL disponer del conmutador «Dividida» / «Recuadro», que refleja el valor compartido.
  - El conmutador SHALL mostrarse deshabilitado, con una indicación es-ES, mientras haya pantalla compartida o pizarra activas.

#### Scenario: El admin cambia a recuadro
- **WHEN** con las dos cámaras encendidas el admin pulsa «Recuadro»
- **THEN** el host, el admin y todos los asistentes pasan a ver al host a pantalla completa y al admin en la esquina, sin recargar

#### Scenario: Asistente que entra tarde
- **WHEN** un asistente entra en la sala con la disposición en `'pip'`
- **THEN** su respuesta de unión trae `stageLayout: 'pip'` y ve directamente la escena en recuadro

#### Scenario: Emisor no autorizado
- **WHEN** el host o un asistente ordinario emiten `stage_layout`
- **THEN** el servidor lo ignora y nadie cambia de disposición

#### Scenario: Conmutador bloqueado con pantalla compartida
- **WHEN** el host comparte pantalla
- **THEN** el conmutador del admin aparece deshabilitado y conserva la disposición elegida para cuando termine

#### Scenario: Nuevo evento, disposición por defecto
- **WHEN** un evento termina y más tarde empieza otro
- **THEN** la sala del nuevo evento arranca en `'split'`

### Requirement: Solo el host del evento obtiene identidad de host

La rama de JWT de `join_event_room` SHALL aceptar como host **únicamente** a `decoded.id === event.host_user_id`. Un JWT de admin que no es el host SHALL recibir `room_join_denied` en lugar de una entrada con `isHost: true` y `agoraUid: 1`. La escena identifica al host por su presencia, y dos entradas de host la corromperían.

#### Scenario: Admin no host intenta unirse como host
- **WHEN** un cliente emite `join_event_room` con `hostToken` de un admin que no es el host del evento
- **THEN** recibe `room_join_denied` y no aparece ninguna entrada de host adicional

#### Scenario: Admin que es el host
- **WHEN** el admin es el `host_user_id` del evento y se une con su JWT
- **THEN** entra como host exactamente igual que hoy
