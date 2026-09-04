# agora-streaming-provider

## ADDED Requirements

### Requirement: Relación de aspecto panorámica del vídeo de cámara

Toda pista de cámara de una sala Agora SHALL crearse con un `encoderConfig` **explícito y 16:9**. El SDK aplica `480p_1` (640 × 480, es decir **4:3**) cuando no se le indica ninguno, de modo que omitirlo publica vídeo casi cuadrado en cualquier dispositivo y toda la interfaz —cuyos mosaicos son `aspect-video`— lo muestra con bandas.

El perfil SHALL elegirse por rol: el host emite en 720p (su vídeo es el del evento y puede verse a pantalla completa) y los demás participantes en 360p (son mosaicos pequeños y el modo `meeting` admite 17 emisores simultáneos, así que darles alta resolución multiplica el enlace de subida sin efecto visible). Ambos valores SHALL vivir en `client/lib/constants.js`.

El perfil SHALL reaplicarse tras cambiar de cámara con `setDevice`: la pista sobrevive al cambio, pero el dispositivo se vuelve a abrir y cada cámara ofrece modos de captura distintos.

#### Scenario: Cámara trasera de un móvil

- **WHEN** el host activa la cámara y selecciona la trasera de su teléfono
- **THEN** la pista publicada es 16:9
- **AND** tanto la previsualización del host como la vista de los participantes remotos muestran vídeo panorámico

#### Scenario: Cambio de cámara en caliente

- **WHEN** el host cambia de la cámara frontal a la trasera durante la retransmisión
- **THEN** el perfil de codificación 16:9 se reaplica sobre la pista
- **AND** la relación de aspecto no cambia al cambiar de dispositivo

#### Scenario: Asistente de una reunión

- **WHEN** un asistente publica su cámara en modo `meeting`
- **THEN** lo hace con el perfil de participante, también 16:9, y no con el del host

#### Scenario: Cámara que no alcanza la resolución pedida

- **WHEN** la cámara no puede entregar exactamente la resolución del perfil
- **THEN** la pista se crea igualmente con el modo más próximo, sin error

### Requirement: La elección de resolución la concede el admin por evento

El sistema SHALL disponer de la columna `events.allow_host_video_quality` (INTEGER, `NOT NULL DEFAULT 0`), definida en `api/config/database.js` en el `CREATE TABLE` y en su `safeAlter`, aceptada como booleano opcional por `createEventSchema` y `updateEventSchema`, incluida en el `INSERT` de `eventService.createEvent` y en `allowedFields` de `eventService.updateEvent`. SHALL exponerse como checkbox en los formularios de creación y edición de cualquier evento `format='live'` con `provider='agora'`, en las dos modalidades de interacción.

Es una palanca de **coste**: Agora factura por asistente según la resolución agregada que recibe y 1080p cruza a la banda Full HD, 2,25 veces el precio del minuto-asistente. Con el flag a 0 la emisión del host SHALL quedar fija en el perfil por defecto de 720p.

#### Scenario: Evento sin la casilla marcada

- **WHEN** el host retransmite un evento con `allow_host_video_quality = 0`
- **THEN** emite en 720p y no dispone de ningún control para cambiarlo

#### Scenario: Preferencia guardada que el evento no permite

- **WHEN** un host que eligió 1080p en su dispositivo entra en un evento con el flag a 0
- **THEN** la emisión es de 720p, ignorando la preferencia guardada

#### Scenario: Evento existente anterior al cambio

- **WHEN** se consulta un evento creado antes de este cambio
- **THEN** `allow_host_video_quality` vale `0` y el host emite en 720p
