# host-screen-wake-lock

## ADDED Requirements

### Requirement: La pantalla no se apaga mientras el host retransmite

El sistema SHALL solicitar un bloqueo de pantalla (`navigator.wakeLock.request('screen')`) mientras un usuario está en la vista de host de un evento en directo, de forma que el dispositivo no aplique su tiempo de espera de pantalla durante la retransmisión. El bloqueo SHALL liberarse al abandonar la vista, al finalizar el evento o al desmontarse el componente.

El bloqueo SHALL adquirirse **con independencia de `events.allow_mobile_host_console`** y en **ambos proveedores** (Agora y LiveKit): que la pantalla se apague a mitad de un evento es un defecto de la vista de host, no una carencia de la consola móvil, y atarlo al flag dejaría el defecto abierto en cualquier evento sin la casilla marcada.

El bloqueo NO SHALL solicitarse para los asistentes, que no operan nada y cuyo consumo de batería no debe verse afectado.

#### Scenario: Host retransmitiendo desde el móvil

- **WHEN** el host entra en la sala en directo desde un navegador compatible sobre HTTPS
- **THEN** se adquiere el bloqueo de pantalla
- **AND** la pantalla no se apaga por inactividad mientras dura la retransmisión

#### Scenario: Evento LiveKit sin consola móvil

- **WHEN** el host de un evento `provider='livekit'` entra en la sala
- **THEN** el bloqueo se adquiere igualmente

#### Scenario: Asistente

- **WHEN** un asistente entra en la misma sala
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
