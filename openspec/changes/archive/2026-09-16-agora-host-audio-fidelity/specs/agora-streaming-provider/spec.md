# agora-streaming-provider

## ADDED Requirements

### Requirement: Perfil de codificación de audio explícito para el host

Toda pista de micrófono **del host** de una sala Agora SHALL crearse con un `encoderConfig` explícito de 48 kHz, mono y 128 kbps (`high_quality`), definido como `AGORA_MIC_ENCODER_HOST` en `client/lib/constants.js` y entregado a `useAgoraRoom` por el mismo camino que `cameraEncoderConfig`.

Omitirlo no aplica el defecto documentado. El SDK guarda `_encoderConfig = {}` cuando no se le pasa configuración, y cada parámetro de Opus se escribe en el SDP bajo su propio guardián (`r.bitrate && ...`, `r.sampleRate && ...`, `r.stereo && ...`), de modo que **no se declara ninguno** y Chrome negocia Opus a su bitrate por defecto, aproximadamente 32 kbps y adaptativo hacia abajo.

Las pistas de micrófono de los asistentes y de los participantes promocionados SHALL seguir creándose sin `encoderConfig`, igual que hoy. La asimetría por rol es la misma que la capacidad ya aplica al vídeo.

El perfil **no** SHALL reaplicarse tras cambiar de micrófono con `setDevice`: a diferencia de la cámara, `setDevice` reconstruye las constraints desde las de la pista y conserva el perfil. Tampoco existe forma de hacerlo — `ILocalAudioTrack` no expone `setEncoderConfiguration`.

#### Scenario: Host retransmitiendo con equipo propio

- **WHEN** el host activa el micrófono en una sala Agora
- **THEN** la pista se publica declarando 48 kHz mono a 128 kbps
- **AND** el SDP negociado lleva `maxaveragebitrate` y `maxplaybackrate`

#### Scenario: Asistente al que se le da la palabra

- **WHEN** un participante levanta la mano y el host le habilita el audio
- **THEN** su pista se crea sin perfil explícito, exactamente como antes de este cambio

#### Scenario: Cambio de micrófono en caliente

- **WHEN** el host cambia de fuente de audio durante la retransmisión
- **THEN** el perfil y el procesado de la pista se conservan sin ninguna acción adicional
- **AND** no se recrea la pista ni se interrumpe la emisión

#### Scenario: Micrófono apagado y vuelto a encender

- **WHEN** el host silencia el micrófono y lo reactiva
- **THEN** la pista se reutiliza y el perfil sigue siendo el mismo

### Requirement: El procesado 3A del navegador se desactiva en la pista del host

La pista de micrófono del host de una sala `interaction_mode='broadcast'` SHALL crearse con `AEC: false`, `ANS: false` y `AGC: false`, salvo que el evento indique lo contrario mediante `events.host_echo_cancellation`.

En `interaction_mode='meeting'` el procesado **no** SHALL alterarse para nadie, tampoco para el host: hay hasta diecisiete emisores de audio simultáneos y el host oye a todos, de modo que quitarle la cancelación de eco acoplaría a la sala entera. El perfil de codificación del requisito anterior sí aplica en las dos modalidades — el bitrate y el procesado son ejes independientes.

En Android este ajuste no desactiva un filtro: **decide la ruta de captura**. Chromium elige `AAUDIO_INPUT_PRESET_VOICE_COMMUNICATION` cuando se pide cancelación de eco y `AAUDIO_INPUT_PRESET_GENERIC` cuando no, y el comentario del propio código señala que el segundo existe para «prioritizing USB or wired headsets over the internal phone microphone». Con el preset de comunicaciones, el sistema aplica su cadena de voz —limitada en banda— y el enrutado pasa por la selección de dispositivo de comunicaciones, que no garantiza que se use el receptor conectado por USB.

Las pistas de micrófono de asistentes y participantes promocionados SHALL conservar el procesado del navegador. Es su cancelación de eco la que impide que se oigan a sí mismos con retardo al escuchar al host por altavoz.

#### Scenario: Conferencia sin audio de participantes

- **WHEN** el host retransmite un evento `broadcast` con `host_echo_cancellation = 0`
- **THEN** su micrófono se abre por la ruta de medios del sistema
- **AND** el receptor externo conectado por USB tiene prioridad sobre el micrófono interno del dispositivo

#### Scenario: Participante promocionado en el mismo evento

- **WHEN** ese mismo evento da la palabra a un asistente
- **THEN** la pista del asistente conserva cancelación de eco, supresión de ruido y control de ganancia

#### Scenario: Host de una reunión

- **WHEN** el host publica su micrófono en un evento `interaction_mode='meeting'`
- **THEN** su pista conserva el procesado del navegador, igual que antes de este cambio
- **AND** aun así se publica con el perfil de 48 kHz mono a 128 kbps

#### Scenario: Evento existente anterior al cambio

- **WHEN** se retransmite un evento `broadcast` creado antes de este cambio
- **THEN** `host_echo_cancellation` vale `0` y el host emite sin procesado 3A

### Requirement: La cancelación de eco del host se recupera por evento

El sistema SHALL disponer de la columna `events.host_echo_cancellation` (INTEGER, `NOT NULL DEFAULT 0`), definida en `api/config/database.js` en el `CREATE TABLE` y en su `safeAlter`, aceptada como booleano opcional por `createEventSchema` y `updateEventSchema`, normalizada con `toFlag` en las dos ramas de `eventAdminController`, incluida en el `INSERT` de `eventService.createEvent` y en `allowedFields` de `eventService.updateEvent`.

SHALL exponerse como checkbox **«El host escuchará a los invitados por altavoz»** en los formularios de creación y edición, visible solo con `format='live'`, `provider='agora'` e `interaction_mode='broadcast'`. La condición es más estrecha que la de `allow_host_video_quality` porque en `interaction_mode='meeting'` el procesado no se altera para nadie.

Con el flag a `1`, la configuración de la pista SHALL **omitir** las tres claves `AEC`, `ANS` y `AGC` en lugar de pasarlas a `true`. No son equivalentes: en Chrome, pasar `ANS: true` de forma explícita añade además `googHighpassFilter`, que el camino por defecto no activa. Omitirlas reproduce el comportamiento anterior a este cambio byte a byte.

El `encoderConfig` del requisito anterior SHALL aplicarse con independencia del valor de este flag.

#### Scenario: Retransmisión interactiva con altavoces

- **WHEN** un evento tiene `host_echo_cancellation = 1` y el host activa el micrófono
- **THEN** la pista se crea sin ninguna de las tres claves de procesado
- **AND** conserva el perfil de 48 kHz mono a 128 kbps

#### Scenario: Casilla no ofrecida fuera de su ámbito

- **WHEN** el admin edita un evento LiveKit, o uno Agora con `interaction_mode='meeting'`
- **THEN** la casilla no se muestra y el campo no se envía

#### Scenario: Cambio de la casilla con la retransmisión en curso

- **WHEN** el admin marca la casilla mientras el host ya tiene el micrófono publicado
- **THEN** la emisión en curso no cambia, porque el perfil queda fijado al crear la pista
- **AND** el nuevo valor se aplica la próxima vez que se crea la pista
