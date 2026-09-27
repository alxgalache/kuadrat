## MODIFIED Requirements

### Requirement: Controles del co-presentador en la sala

`client/app/live/[slug]/EventDetail.js` SHALL propagar `coHost` desde la respuesta del token hasta `AgoraLiveRoom`. Con `coHost = true` y `interactionMode = 'broadcast'`, la sala SHALL:

- Unirse con rol de cliente `host` de Agora (publicador) y con el micrófono y la cámara **apagados**.
- Mostrar **exclusivamente** estos controles de medios:
  - interruptor de micrófono con su selector de dispositivo
  - interruptor de cámara con su selector de dispositivo
  - interruptor de pantalla compartida: en escritorio, como el del host; en la vista compacta, sólo si el navegador tiene `getDisplayMedia`, y si no, deshabilitado en «Más» con su motivo, igual que el del host
  - selector de altavoces, solo si el navegador expone salidas de audio
  - conmutador de disposición de cámaras
- NO mostrar: pizarra, «Todos escriben», efectos de fondo, selector de calidad, «Finalizar stream» ni el botón de levantar la mano.
- Compartir pantalla exactamente como el host de un stream (ver «Compartir pantalla del host (Agora)» en `agora-streaming-provider`): segundo cliente con el uid 2, con el audio de la pantalla si lo elige, y la cámara sin salir de antena. La pantalla de la escena es **una sola**: mientras la tiene el host, el toggle del co-presentador SHALL rechazarse con «El host está compartiendo pantalla. Podrás compartir la tuya cuando termine.», y a la inversa. Existe para que el entrevistador pueda poner en escena una pantalla con audio cuando el navegador del host no puede compartirlo.
- Ofrecer, fuera de esa lista de controles de medios y por ser admin, el menú «Expulsar del chat» sobre los mensajes del chat, con las condiciones de `event-chat-admin-moderation`. No altera la escena ni la emisión.
- Obtener estado y acciones de `client/hooks/useHostMediaControls.js`, instanciado **una sola vez** en `AgoraLiveRoom` como hoy, con una presentación propia y restringida. No SHALL crearse una segunda copia de la lógica de dispositivos ni de la de pantalla.
- Crear la cámara con `AGORA_CAMERA_ENCODER_HOST` (1280 × 720, 16:9), sin selector de calidad, y reafirmar ese perfil tras cambiar de cámara.
- Crear el micrófono con `encoderConfig: AGORA_MIC_ENCODER_HOST` **omitiendo** las claves `AEC`, `ANS` y `AGC`, de modo que actúe el procesado del navegador. El co-presentador oye al host por sus altavoces, y es su cancelación de eco la que evita devolver esa voz al canal.
- Mantener la pantalla encendida con `useScreenWakeLock` mientras el evento no haya terminado, igual que en la vista del host: quien emite no debe quedarse sin pantalla a mitad de la entrevista.

Los textos SHALL estar en es-ES y vivir en `client/lib/constants.js`.

#### Scenario: El admin entra en la entrevista
- **WHEN** el admin co-presentador entra en la sala de un evento stream activo
- **THEN** ve los controles de micrófono, cámara, pantalla, dispositivos y disposición, todos apagados
- **AND** no ve «Pizarra», «Efectos», «Calidad», «Finalizar stream» ni «Levantar mano»

#### Scenario: El admin comparte una pantalla con audio
- **WHEN** el admin activa «Pantalla» y comparte una pestaña marcando «Compartir audio de la pestaña»
- **THEN** la escena muestra su pantalla, con las cámaras en la esquina según `agora-broadcast-stage`, y todos oyen el audio de la pestaña
- **AND** su cámara sigue publicada

#### Scenario: Pantalla ocupada por el host
- **WHEN** el host comparte pantalla y el admin activa «Pantalla»
- **THEN** no se abre el selector del navegador y el admin ve el motivo

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
- **THEN** los controles del host son exactamente los actuales, y su «Pantalla» sólo se rechaza, con su motivo, mientras la comparte el co-presentador

#### Scenario: Espectadores sin cambios
- **WHEN** un asistente ordinario está en un evento con co-presentador
- **THEN** no dispone de controles de cámara ni de micrófono propios y sigue levantando la mano como hoy

### Requirement: Presencia del co-presentador

En `join_event_room`, la rama de asistente de `api/socket/eventSocket.js` SHALL añadir `coHost` a la entrada de presencia, evaluado con el predicado de elegibilidad. Para un co-presentador:

- SHALL fijar `speaker: true` en la presencia, **sin** escribir `event_attendees.speaker_granted`.
- `hand_raise` SHALL ignorarse.
- La detección automática de spam NO SHALL aplicarse, igual que no se aplica al host: su efecto incluye banear email e IP del evento.
- `screen_share` SHALL aceptarse, igual que del host: fija `screenSharing` en su entrada, se difunde con `presence_updated` y dispara la reconciliación de la grabación. De un asistente que no sea host ni co-presentador SHALL ignorarse.

`publicPresence` SHALL exponer `coHost` y `screenSharing`. El objeto que devuelve `eventSocket` SHALL exponer `getStageScreenSharer(eventId)` —la identidad del host o co-presentador con `screenSharing`, o `null`— e `isStageScreenSharing(eventId)`, las dos lecturas de la presencia sin copia: el primero lo usa `screen-token` para el 409, el segundo el diseño de la grabación.

La comprobación de pago de `authenticateJoin` SHALL aplicar la misma exención de staff que `requiresPayment` en el controlador, en lugar de su copia actual sin exención.

#### Scenario: Presencia visible
- **WHEN** el co-presentador entra en la sala socket
- **THEN** todos los clientes reciben su entrada con `coHost: true` y `speaker: true`

#### Scenario: El co-presentador comparte pantalla
- **WHEN** el co-presentador emite `screen_share { active: true }`
- **THEN** todos los clientes reciben su entrada con `screenSharing: true` y `getStageScreenSharer` devuelve su identidad

#### Scenario: Un asistente ordinario intenta marcar la pantalla
- **WHEN** un asistente que no es host ni co-presentador emite `screen_share { active: true }`
- **THEN** la presencia no cambia y no se difunde nada

#### Scenario: Muchos mensajes seguidos del entrevistador
- **WHEN** el co-presentador envía más de 10 mensajes en 10 segundos
- **THEN** los mensajes se difunden y no se crea ningún ban de chat, email ni IP

#### Scenario: Admin en un evento de pago
- **WHEN** el socket del admin se une a la sala de un evento de pago con su asistente aún en estado `registered`
- **THEN** la unión se acepta, como ya aceptan los endpoints de token
