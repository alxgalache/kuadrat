# host-screen-wake-lock

## Purpose

Mantener encendida la pantalla del dispositivo mientras un usuario está en la vista de host de un evento en directo, mediante la Screen Wake Lock API. Corrige un defecto observado retransmitiendo desde el móvil: la pantalla se bloqueaba a mitad de evento siguiendo el tiempo de espera del sistema, dejando al host sin acceso a los controles. Aplica a **ambos proveedores** (Agora y LiveKit) y es **independiente** de cualquier flag por evento, porque es la corrección de un defecto de la vista de host y no una función opcional.

> Capa afectada: solo frontend (`client/hooks/useScreenWakeLock.js`, montado en `client/components/AgoraLiveRoom.js` y `client/components/EventLiveRoom.js`). Sin cambios en `api/`, en la BD, en variables de entorno ni en el CSP.

## Requirements

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

### Requirement: Recuperación del bloqueo al volver de segundo plano

El navegador libera el bloqueo de pantalla cuando el documento deja de ser visible. El sistema SHALL volver a solicitarlo cuando el documento vuelve a ser visible y el host sigue en la vista, de modo que atender una notificación o cambiar de aplicación no deje la pantalla desprotegida durante el resto del evento.

#### Scenario: El host cambia de aplicación y vuelve

- **WHEN** el host pasa el navegador a segundo plano y después vuelve a la pestaña del evento
- **THEN** el bloqueo de pantalla se vuelve a adquirir automáticamente

#### Scenario: El host vuelve después de que el evento haya terminado

- **WHEN** el documento vuelve a ser visible pero el host ya no está en una vista de host en directo
- **THEN** no se solicita ningún bloqueo nuevo

### Requirement: Degradación silenciosa donde el bloqueo no está disponible

La adquisición del bloqueo SHALL detectarse por capacidad y SHALL fallar en silencio —sin mensaje al usuario y sin error en Sentry— cuando la API no exista, cuando el contexto no sea seguro o cuando el navegador rechace la petición. Es una mejora sobre el comportamiento actual, no un requisito de funcionamiento: un aviso permanente en la interfaz de retransmisión sería más ruido que valor, y el usuario conserva el ajuste de «tiempo de pantalla encendida» del sistema como alternativa.

#### Scenario: Navegador sin soporte

- **WHEN** el host usa un navegador sin `navigator.wakeLock`
- **THEN** la vista funciona con normalidad y no aparece ningún error

#### Scenario: Contexto no seguro

- **WHEN** la página se sirve sobre HTTP sin ser `localhost` y la petición es rechazada
- **THEN** el rechazo se captura y la vista sigue operativa

#### Scenario: Rechazo del navegador en tiempo de ejecución

- **WHEN** el navegador deniega la petición por estado de bajo consumo del dispositivo
- **THEN** el fallo se ignora y no se reintenta en bucle

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
