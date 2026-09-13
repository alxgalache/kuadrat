## MODIFIED Requirements

### Requirement: Controles del co-presentador en la sala

`client/app/live/[slug]/EventDetail.js` SHALL propagar `coHost` desde la respuesta del token hasta `AgoraLiveRoom`. Con `coHost = true` y `interactionMode = 'broadcast'`, la sala SHALL:

- Unirse con rol de cliente `host` de Agora (publicador) y con el micrófono y la cámara **apagados**.
- Mostrar **exclusivamente** estos controles de medios:
  - interruptor de micrófono con su selector de dispositivo
  - interruptor de cámara con su selector de dispositivo
  - selector de altavoces, solo si el navegador expone salidas de audio
  - conmutador de disposición de cámaras
- NO mostrar: pantalla compartida, pizarra, «Todos escriben», efectos de fondo, selector de calidad, «Finalizar stream» ni el botón de levantar la mano.
- Ofrecer, fuera de esa lista de controles de medios y por ser admin, el menú «Expulsar del chat» sobre los mensajes del chat, con las condiciones de `event-chat-admin-moderation`. No altera la escena ni la emisión.
- Obtener estado y acciones de `client/hooks/useHostMediaControls.js`, instanciado **una sola vez** en `AgoraLiveRoom` como hoy, con una presentación propia y restringida. No SHALL crearse una segunda copia de la lógica de dispositivos.
- Crear la cámara con `AGORA_CAMERA_ENCODER_HOST` (1280 × 720, 16:9), sin selector de calidad, y reafirmar ese perfil tras cambiar de cámara.
- Crear el micrófono con `encoderConfig: AGORA_MIC_ENCODER_HOST` **omitiendo** las claves `AEC`, `ANS` y `AGC`, de modo que actúe el procesado del navegador. El co-presentador oye al host por sus altavoces, y es su cancelación de eco la que evita devolver esa voz al canal.
- Mantener la pantalla encendida con `useScreenWakeLock` mientras el evento no haya terminado, igual que en la vista del host: quien emite no debe quedarse sin pantalla a mitad de la entrevista.

Los textos SHALL estar en es-ES y vivir en `client/lib/constants.js`.

#### Scenario: El admin entra en la entrevista
- **WHEN** el admin co-presentador entra en la sala de un evento stream activo
- **THEN** ve los controles de micrófono, cámara, dispositivos y disposición, todos apagados
- **AND** no ve «Pantalla», «Pizarra», «Efectos», «Calidad», «Finalizar stream» ni «Levantar mano»

#### Scenario: El admin expulsa del chat durante la entrevista
- **WHEN** el admin co-presentador usa «Expulsar del chat» sobre el mensaje de un asistente
- **THEN** el asistente queda expulsado del chat
- **AND** la emisión y la escena no cambian

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

### Requirement: Protección del staff frente a la moderación

El servidor SHALL rechazar con **400**, sin efectos secundarios, cualquier acción de moderación cuyo objetivo sea un asistente `is_staff = 1`:

- promover y degradar: `resolveAgoraAttendee` en `api/controllers/eventController.js`, que cubre los endpoints del host y del admin
- `POST /api/events/:id/participants/:identity/ban-from-chat`, tanto si lo llama el host como un admin
- `POST /api/events/:id/participants/:identity/report-spam`

«Sin efectos secundarios» significa:

- no se escribe `speaker_granted`
- no se crea ni se retira ninguna *kicking rule* de Agora
- no se marca `chat_banned`
- no se inserta nada en `event_bans`
- no se emite ninguna señal de socket

La protección aplica a todo staff, no solo al co-presentador.

En el cliente, la casilla del co-presentador en la rejilla de participantes NO SHALL tener acción de clic para nadie. En el chat, el menú «Expulsar del chat» NO SHALL ofrecerse sobre los mensajes de **ningún miembro del staff**, sea el co-presentador de un stream o el admin en una reunión. Se identifican por los campos `coHost` y `staff` de la presencia (ver `event-chat-admin-moderation`).

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

#### Scenario: Sin menú sobre el admin en una reunión
- **WHEN** el admin escribe en el chat de un evento Agora `meeting`
- **THEN** ni el host ni otro admin ven el menú «Expulsar del chat» sobre ese mensaje
