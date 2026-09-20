## MODIFIED Requirements

### Requirement: Presencia en tiempo real de participantes
La presencia de la sala Socket.IO SHALL ser la fuente de verdad del grid de participantes y del contador "N conectados" en eventos Agora (la audiencia que no publica es invisible en el canal RTC). Cada entrada SHALL incluir `{ identity, name, isHost, agoraUid, handRaised, handRaisedAt, speaker, chatBanned }` y el servidor SHALL emitir `presence_joined`/`presence_left`/`presence_updated` ante cambios.

`handRaisedAt` SHALL ser el instante (epoch ms del **servidor**) en que esa identidad levantó la mano, o `null` sin mano levantada. Es lo que permite ordenar las manos como una cola de turno (ver `broadcast-participant-row`); el cliente solo lo compara y nunca lo pinta, así que no lleva formato ni zona horaria. Sellarlo en el cliente NO SHALL hacerse: quien entra tarde, o el host que recarga la página, no puede saber quién levantó antes y sellaría a todos con el mismo instante.

Al reconectar la misma identidad (refresco, segunda pestaña), el servidor NO SHALL sobrescribir `handRaised` ni `handRaisedAt`: la mano y su puesto en la cola sobreviven al refresco.

Un cliente que reciba entradas sin `handRaisedAt` (api anterior a este cambio) SHALL degradar a orden de llegada dentro del escalón de manos, sin errores.

#### Scenario: Audiencia visible sin publicar
- **WHEN** un asistente entra a un evento Agora broadcast sin publicar nada
- **THEN** todos los clientes muestran su tile de inicial con su nombre y el contador se incrementa

#### Scenario: Salida limpia
- **WHEN** el socket de un asistente se desconecta
- **THEN** el servidor emite `presence_left` y su tile desaparece del grid

#### Scenario: La mano sobrevive a un refresco
- **WHEN** un asistente con la mano levantada recarga la página y vuelve a entrar con la misma identidad
- **THEN** su presencia conserva `handRaised` y el mismo `handRaisedAt`
- **AND** no adelanta ni retrocede puestos en la cola de manos

### Requirement: Levantar la mano en eventos Agora broadcast
Los asistentes no promovidos SHALL disponer del botón "Levantar mano"/"Bajar mano" actual; el estado SHALL viajar por Socket.IO (`hand_raise {raised}`), reflejarse en la presencia y en los tiles de todos (icono ámbar, orden priorizado según `broadcast-participant-row`). Al promover, el servidor SHALL limpiar la mano levantada (paridad con el borrado del atributo en LiveKit) **y su instante**.

El servidor SHALL sellar `handRaisedAt` **solo en la transición de no levantada a levantada**. Un segundo `hand_raise {raised: true}` de una identidad que ya la tiene levantada (doble toque, reconexión de la pestaña) NO SHALL cambiar el sello, o mandaría al final de la cola a quien lleva más tiempo esperando.

Al bajar la mano, `handRaisedAt` SHALL volver a `null`.

#### Scenario: Mano levantada visible para el host
- **WHEN** un asistente pulsa "Levantar mano"
- **THEN** su tile muestra el icono ámbar y se ordena antes que los no solicitantes en la vista del host

#### Scenario: Mano limpiada al promover
- **WHEN** el host promueve a un asistente con la mano levantada
- **THEN** la presencia limpia `handRaised` y `handRaisedAt`, y el icono desaparece para todos

#### Scenario: Orden de la cola de manos
- **WHEN** tres asistentes levantan la mano en orden A, B y C
- **THEN** sus entradas de presencia llevan `handRaisedAt` crecientes en ese orden

#### Scenario: Levantar la mano dos veces seguidas
- **WHEN** un asistente que ya tiene la mano levantada emite otra vez `hand_raise {raised: true}`
- **THEN** su `handRaisedAt` no cambia

#### Scenario: Bajar la mano
- **WHEN** un asistente pulsa "Bajar mano"
- **THEN** su presencia queda con `handRaised: false` y `handRaisedAt: null`

### Requirement: Sala en directo Agora — modo broadcast con paridad LiveKit
`client/components/AgoraLiveRoom.js` (nuevo, import dinámico `ssr:false`; `EventDetail.js` selecciona componente por `event.provider`) SHALL replicar en modo `broadcast` la UI/UX de `EventLiveRoom.js`: layout de dos columnas con chat lateral de altura sincronizada al área de vídeo; área de vídeo del host 16:9 negra con "Esperando al host..." (viewer) / "Tu vista de presentador" (host); grid de cámaras de promovidos; cuadrados de iniciales con los mismos estados, colores, badges de micro y acciones por clic; controles de host (toggles Micrófono/Cámara/Pantalla + selectores de dispositivos + "Finalizar stream" con `ConfirmDialog`); botón de mano para viewers; pantalla completa para viewers; contador "N conectados". La lógica RTC SHALL encapsularse en `client/hooks/useAgoraRoom.js` y la de sala en `client/hooks/useEventRoomSocket.js`; los umbrales/constantes compartidos SHALL vivir en `client/lib/constants.js`. Todos los textos SHALL ser los es-ES actuales.

La **disposición de los cuadrados y su orden** ya no forman parte de esta paridad: los define `broadcast-participant-row` (una sola fila, con capacidad medida en escritorio y tope en compacto, recuadro de resto y orden por prioridad). La paridad de estados, colores, insignias y textos se conserva.

Esta paridad SHALL aplicarse a la **disposición de escritorio**. En la **disposición compacta** definida por `live-event-mobile-layout`, la sala SHALL conservar los mismos estados, colores, badges y textos, pero con la presentación de esa capacidad:
- una fila horizontal de cuadrados con el botón de mano fijo a la izquierda;
- las acciones sobre un cuadrado a través de su hoja, en lugar del clic directo;
- los controles de host en la fila compacta;
- el chat bajo la escena, con su campo de escribir abajo.

`EventLiveRoom.js` NO SHALL cambiar en ninguna disposición.

#### Scenario: Viewer entra a un broadcast Agora activo
- **WHEN** un asistente con acceso entra a `/live/{slug}` de un evento Agora broadcast activo desde un navegador de escritorio
- **THEN** ve el mismo layout que en un evento LiveKit: vídeo del host, fila de participantes, botón de mano y chat lateral funcional

#### Scenario: Viewer entra desde un móvil
- **WHEN** el mismo asistente entra desde un móvil en vertical
- **THEN** ve la disposición compacta: barra superior, escena, fila de participantes con la mano a la izquierda y chat con el campo abajo
- **AND** los cuadrados muestran los mismos estados y colores que en escritorio

#### Scenario: Selección de componente por proveedor
- **WHEN** `EventDetail.js` recibe un evento activo `provider='agora'` y credenciales del endpoint de token
- **THEN** monta `AgoraLiveRoom` con `{appId, channel, uid, rtcToken, interactionMode, isHost, eventId}`
- **AND** con `provider='livekit'` monta `EventLiveRoom` exactamente como hoy

#### Scenario: Un evento LiveKit conserva su rejilla
- **WHEN** un host abre un evento activo con `provider='livekit'`
- **THEN** ve la rejilla de participantes multifila de siempre, sin recuadro de resto ni orden por prioridad
