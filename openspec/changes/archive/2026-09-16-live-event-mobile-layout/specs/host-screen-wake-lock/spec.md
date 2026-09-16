## MODIFIED Requirements

### Requirement: La pantalla no se apaga mientras el host retransmite

El sistema SHALL solicitar un bloqueo de pantalla (`navigator.wakeLock.request('screen')`) mientras un usuario está en la vista de host de un evento en directo, de forma que el dispositivo no aplique su tiempo de espera de pantalla durante la retransmisión. El bloqueo SHALL liberarse al abandonar la vista, al finalizar el evento o al desmontarse el componente.

El bloqueo SHALL adquirirse **con independencia de `events.allow_mobile_host_console`** y en **ambos proveedores** (Agora y LiveKit). Que la pantalla se apague a mitad de un evento es un defecto de la vista de host, no una carencia de la consola móvil, y atarlo al flag dejaría el defecto abierto en cualquier evento sin la casilla marcada.

Para los asistentes, el bloqueo NO SHALL solicitarse mientras no haya nada que ver (sala esperando al host, escena sin vídeo ni contenido, evento LiveKit). Cuando sí lo hay, rige el requisito «La pantalla no se apaga mientras un asistente está viendo el evento». Esta frontera sustituye a la exclusión total anterior, que se justificaba en que un asistente no opera nada: ver vídeo es precisamente el caso en que la pantalla tiene que seguir encendida.

#### Scenario: Host retransmitiendo desde el móvil

- **WHEN** el host entra en la sala en directo desde un navegador compatible sobre HTTPS
- **THEN** se adquiere el bloqueo de pantalla
- **AND** la pantalla no se apaga por inactividad mientras dura la retransmisión

#### Scenario: Evento LiveKit sin consola móvil

- **WHEN** el host de un evento `provider='livekit'` entra en la sala
- **THEN** el bloqueo se adquiere igualmente

#### Scenario: Asistente sin nada que ver

- **WHEN** un asistente entra en una sala Agora mientras la escena muestra «Esperando al host...»
- **THEN** no se solicita ningún bloqueo de pantalla

#### Scenario: Salida de la sala

- **WHEN** el host abandona la página o el evento finaliza
- **THEN** el bloqueo se libera y el dispositivo recupera su comportamiento normal

## ADDED Requirements

### Requirement: La pantalla no se apaga mientras un asistente está viendo el evento

El sistema SHALL solicitar el bloqueo de pantalla con `client/hooks/useScreenWakeLock.js`, sin una segunda implementación, para quien no es host ni co-presentador:

- **Sala Agora** (`client/components/AgoraLiveRoom.js`), en `broadcast` y en `meeting`: mientras la escena, o el recuadro destacado en `meeting`, muestre vídeo remoto o contenido (cámara del host, pantalla compartida del host, cámara de un co-presentador o pizarra) y el evento no haya terminado.
- **Pase de vídeo** (`format='video'`): mientras el reproductor esté reproduciendo, desde que termina la colocación inicial en la posición común hasta que el vídeo termina o falla.

El bloqueo SHALL liberarse en cuanto deje de haber algo que ver, al terminar el evento y al abandonar la sala. SHALL aplicarse en cualquier disposición, de escritorio o compacta. NO SHALL aplicarse a los asistentes de salas LiveKit, que quedan fuera de este cambio.

El motivo es que la sala Agora pinta el vídeo remoto en elementos `<video>` silenciados, con el audio aparte, y no se puede contar con que el navegador mantenga la pantalla encendida por ellos: un asistente que ve una charla sin tocar el móvil la ve apagarse. Las reglas de recuperación al volver de segundo plano y de degradación silenciosa SHALL aplicarse igual que para el host.

#### Scenario: Asistente viendo al host

- **WHEN** un asistente mira desde el móvil un stream con la cámara del host en escena y no toca la pantalla
- **THEN** se adquiere el bloqueo y la pantalla no se apaga por inactividad

#### Scenario: El host apaga la cámara sin contenido en escena

- **WHEN** el host apaga su cámara y no hay pantalla compartida, co-presentador con cámara ni pizarra
- **THEN** el bloqueo del asistente se libera

#### Scenario: Pase de vídeo reproduciéndose

- **WHEN** un asistente con acceso ve un evento de vídeo que ya se está reproduciendo
- **THEN** se adquiere el bloqueo de pantalla
- **AND** al terminar el vídeo el bloqueo se libera

#### Scenario: Vuelta de segundo plano

- **WHEN** un asistente viendo el evento cambia de aplicación y vuelve a la pestaña con vídeo en escena
- **THEN** el bloqueo se vuelve a adquirir automáticamente

#### Scenario: Asistente de un evento LiveKit

- **WHEN** un asistente mira un evento `provider='livekit'`
- **THEN** no se solicita ningún bloqueo de pantalla
