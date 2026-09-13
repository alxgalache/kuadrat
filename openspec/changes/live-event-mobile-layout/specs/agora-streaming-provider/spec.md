## MODIFIED Requirements

### Requirement: Sala en directo Agora — modo broadcast con paridad LiveKit
`client/components/AgoraLiveRoom.js` (nuevo, import dinámico `ssr:false`; `EventDetail.js` selecciona componente por `event.provider`) SHALL replicar en modo `broadcast` la UI/UX de `EventLiveRoom.js`: layout de dos columnas con chat lateral de altura sincronizada al área de vídeo; área de vídeo del host 16:9 negra con "Esperando al host..." (viewer) / "Tu vista de presentador" (host); grid de cámaras de promovidos; grid de tiles de iniciales con los mismos estados, colores, badges de micro, orden (host primero, mano levantada priorizada, local al final con "(Tu)") y acciones por clic; controles de host (toggles Micrófono/Cámara/Pantalla + selectores de dispositivos + "Finalizar stream" con `ConfirmDialog`); botón de mano para viewers; pantalla completa para viewers; contador "N conectados". La lógica RTC SHALL encapsularse en `client/hooks/useAgoraRoom.js` y la de sala en `client/hooks/useEventRoomSocket.js`; los umbrales/constantes compartidos SHALL vivir en `client/lib/constants.js`. Todos los textos SHALL ser los es-ES actuales.

Esta paridad SHALL aplicarse a la **disposición de escritorio**. En la **disposición compacta** definida por `live-event-mobile-layout`, la sala SHALL conservar los mismos estados, colores, badges, orden y textos, pero con la presentación de esa capacidad:
- una fila horizontal de tiles con el botón de mano fijo a la izquierda;
- las acciones sobre un tile a través de su hoja, en lugar del clic directo;
- los controles de host en la fila compacta;
- el chat bajo la escena, con su campo de escribir abajo.

`EventLiveRoom.js` NO SHALL cambiar en ninguna disposición.

#### Scenario: Viewer entra a un broadcast Agora activo
- **WHEN** un asistente con acceso entra a `/live/{slug}` de un evento Agora broadcast activo desde un navegador de escritorio
- **THEN** ve el mismo layout que en un evento LiveKit: vídeo del host, tiles de participantes, botón de mano y chat lateral funcional

#### Scenario: Viewer entra desde un móvil
- **WHEN** el mismo asistente entra desde un móvil en vertical
- **THEN** ve la disposición compacta: barra superior, escena, fila de participantes con la mano a la izquierda y chat con el campo abajo
- **AND** los tiles muestran los mismos estados, colores y orden que en escritorio

#### Scenario: Selección de componente por proveedor
- **WHEN** `EventDetail.js` recibe un evento activo `provider='agora'` y credenciales del endpoint de token
- **THEN** monta `AgoraLiveRoom` con `{appId, channel, uid, rtcToken, interactionMode, isHost, eventId}`
- **AND** con `provider='livekit'` monta `EventLiveRoom` exactamente como hoy

### Requirement: Sala en directo Agora — modo meeting (grid de cámaras)
Con `interaction_mode='meeting'`, la disposición de cámaras SHALL depender del rol del espectador y de la disposición de la sala (escritorio o compacta, según `live-event-mobile-layout`).

**Disposición de escritorio.**
- **Asistentes (no host):** el **host (o su pantalla compartida) SHALL mostrarse en un recuadro destacado a todo el ancho** del contenedor (grande, `aspect-video`) y el resto de participantes **debajo, en un grid en filas de 5 tiles cuadrados** (5 columnas y relación de aspecto 1:1).
- **Host:** cuando NO comparte pantalla ni pizarra, todas las cámaras (incluida la suya, **la primera y del mismo tamaño** que las demás) SHALL mostrarse en ese mismo grid de filas de 5 tiles cuadrados, sin recuadro destacado. Cuando el host comparte pantalla o activa la pizarra, esta SHALL ocupar el recuadro destacado a todo el ancho con los participantes debajo.
- **Chat lateral** (mismo `ChatPanel` por Socket.IO): SHALL ocupar **siempre toda la altura disponible de la página**. La columna de medios SHALL hacer scroll interno y el chat NO SHALL cambiar de altura al compartir pantalla ni al aumentar el número de participantes.

**Disposición compacta.** Todos los roles, host incluido, SHALL ver:
- el recuadro destacado 16:9: la pizarra o la pantalla compartida si están activas; si no, la cámara del host (la propia, para el host) o su avatar;
- debajo, la fila horizontal de cámaras cuadradas 1:1 y la fila de controles compacta definidas en `live-event-mobile-layout`;
- el chat, en el alto restante bajo los controles, con scroll interno.

El grid de 5 columnas NO SHALL usarse en esta disposición.

**En ambas disposiciones.**
- El vídeo de cada tile SHALL recortarse centrado para llenar el cuadrado manteniendo su relación de aspecto (`fit: 'cover'`, equivalente a `object-fit: cover` de CSS): se asume la pérdida de los laterales (o franjas superior/inferior) de la imagen de la webcam.
- Cada tile SHALL mostrar: vídeo de cámara (o avatar de inicial si está apagada), nombre, badge de estado de micro y anillo de "hablando". El tile propio SHALL marcarse "(Tu)".
- TODOS los participantes SHALL entrar como PUBLISHER con **micrófono muteado y cámara apagada por defecto**, y disponer de controles propios: activar/silenciar micrófono, encender/apagar cámara y selectores de dispositivo.
- El host SHALL disponer además de: compartir pantalla (se muestra en el recuadro destacado del host), silenciar a un participante (`force_mute`), expulsar del chat y "Finalizar evento".
- No SHALL mostrarse el botón de levantar la mano (todos pueden hablar).

#### Scenario: Taller con cámaras (host destacado + filas de 5 cuadradas)
- **WHEN** 8 asistentes entran a un evento Agora meeting activo desde escritorio
- **THEN** el host se muestra en un recuadro grande a todo el ancho y los participantes aparecen debajo en filas de 5 tiles cuadrados 1:1 (avatar si su cámara está apagada), muteados por defecto
- **AND** el vídeo de cada tile se ve recortado centrado, sin deformarse

#### Scenario: Fila de cámaras en móvil
- **WHEN** un asistente abre el mismo meeting desde un móvil en vertical
- **THEN** el host se muestra en el recuadro destacado 16:9 y los participantes en una fila horizontal de recuadros cuadrados 1:1 que se desliza con el dedo
- **AND** no se muestra el grid de 5 columnas

#### Scenario: Host en móvil sin pantalla ni pizarra
- **WHEN** el host de un meeting abre la sala desde un móvil en vertical sin compartir pantalla ni pizarra
- **THEN** ve su propia cámara en el recuadro destacado y a los participantes en la fila de cámaras

#### Scenario: Host modera un micrófono abierto
- **WHEN** el host silencia a un participante con ruido de fondo
- **THEN** el micrófono del participante queda muteado para todos y este puede volver a activarlo cuando lo necesite

#### Scenario: Pantalla compartida en meeting
- **WHEN** el host comparte pantalla en un meeting visto desde escritorio
- **THEN** la pantalla ocupa el recuadro destacado del host a todo el ancho y los participantes permanecen debajo en filas de 5 tiles cuadrados
- **AND** la altura del chat lateral no cambia

#### Scenario: Chat a altura completa con muchos participantes
- **WHEN** en escritorio el número de participantes crece hasta requerir scroll en la zona de cámaras
- **THEN** la columna de cámaras hace scroll interno y el chat lateral mantiene toda la altura disponible de la página (no se estira ni se encoge)

#### Scenario: Vista del host — grid de tiles iguales
- **WHEN** en escritorio el host de un meeting no comparte pantalla ni tiene la pizarra activa
- **THEN** ve todas las cámaras (incluida la suya, la primera y del mismo tamaño que las demás) en el grid de filas de 5 tiles cuadrados, sin recuadro destacado
- **AND** al compartir pantalla o activar la pizarra, esta pasa al recuadro destacado a todo el ancho y los participantes quedan debajo

#### Scenario: Enviar un mensaje en el chat no desplaza la página
- **WHEN** cualquier participante o el host escribe un mensaje en el chat y pulsa Enter
- **THEN** solo se desplaza el interior del chat hasta el último mensaje; la página/vista no se desplaza ni salta

### Requirement: Selector de dispositivos del host (Agora)
El host de un evento Agora SHALL disponer del mismo selector de dispositivos que la spec `host-device-selector`: chevrons junto a Micrófono/Cámara, "Altavoces" solo selector, sin selector en Pantalla; mismo dropdown, cierre por clic-fuera/Escape, dispositivo activo con check y hot-plug.

La lógica SHALL implementarse en `client/hooks/useAgoraDevices.js` sobre `AgoraRTC.getMicrophones()/getCameras()/getPlaybackDevices()`, `track.setDevice()`, `audioTrack.setPlaybackDevice()` y los callbacks `onMicrophoneChanged`/`onCameraChanged`/`onPlaybackDeviceChanged`. El dropdown presentacional SHALL extraerse a `client/components/events/DeviceDropdown.js` y reutilizarse desde el `DeviceSelector` LiveKit actual sin alterar su lógica (tarea de riesgo: tocar componente estable).

En la **disposición compacta** de `live-event-mobile-layout`, la selección de fuente NO SHALL usar el dropdown. SHALL hacerse desde la hoja «Más», con la lista de filas grandes de `client/components/events/MobileDevicePicker.js`, sobre los mismos datos y las mismas funciones de cambio, con el dispositivo activo marcado.

#### Scenario: Cambio de micrófono en caliente
- **WHEN** el host de un evento Agora selecciona otro micrófono en el dropdown
- **THEN** el track de audio publicado cambia de dispositivo sin recargar y el stream continúa para los asistentes

#### Scenario: Cambio de micrófono desde el móvil
- **WHEN** el host en disposición compacta abre «Más», toca «Micrófono» y elige otro dispositivo
- **THEN** el track de audio publicado cambia de dispositivo sin recargar y la lista marca el nuevo como activo

#### Scenario: Altavoces no soportados
- **WHEN** el navegador no expone dispositivos `audiooutput`
- **THEN** el control "Altavoces" no se renderiza en la vista de escritorio (degradación igual a la actual)
- **AND** en la hoja «Más» de la disposición compacta aparece deshabilitado con el motivo

### Requirement: Chat de eventos Agora con enforcement en servidor
El chat de eventos Agora SHALL ir por la sala Socket.IO autenticada: `event_chat_message { text }` → el servidor SHALL descartar mensajes de identidades con `chat_banned=1` (consultando `eventService.isAttendeeChatBanned`) y difundir `{ identity, name, message, timestamp }` al resto. No SHALL entregarse historial a quien se une tarde (paridad con el chat LiveKit).

El `ChatPanel` del cliente SHALL conservar la UI actual: mensajes, input, "Sin mensajes todavía", menú de tres puntos del host **y del admin** (ver `event-chat-admin-moderation`) y aviso es-ES al expulsado. El autodesplazamiento SHALL seguir el requisito «Autodesplazamiento del chat» de `live-event-mobile-layout`: la lista solo sigue al último mensaje si el usuario ya estaba al final o el mensaje es propio, y en otro caso ofrece «Mensajes nuevos».

#### Scenario: Mensaje difundido
- **WHEN** un asistente sin ban envía un mensaje
- **THEN** todos los participantes de la sala lo ven con su nombre en el chat lateral

#### Scenario: Mensaje de expulsado descartado
- **WHEN** un asistente con `chat_banned=1` emite `event_chat_message`
- **THEN** el servidor no lo difunde a nadie
- **AND** el cliente del expulsado muestra el aviso "Has sido expulsado del chat por comportamiento inapropiado."

#### Scenario: Leer mensajes antiguos mientras llegan nuevos
- **WHEN** un participante ha subido en el chat y llega un mensaje de otra persona
- **THEN** su posición de lectura no cambia y aparece «Mensajes nuevos»

### Requirement: Moderación de chat y anti-spam en eventos Agora
La expulsión del chat SHALL reutilizar los endpoints actuales con rama Agora:
- `POST /api/events/:id/participants/:identity/ban-from-chat`, para el host **o un usuario con rol `admin`**, con la autorización definida en `event-chat-admin-moderation`;
- `report-spam`.

La rama Agora SHALL persistir `chat_banned` (y en spam, además `event_bans` por email+IP) y emitir `chat_banned {identity}` por Socket.IO.

La detección de spam SHALL ejecutarse en el servidor del chat con los mismos umbrales actuales (más de 10 mensajes en 10 s, constantes compartidas), aplicando el mismo efecto que `report-spam`.

#### Scenario: Host expulsa del chat desde un mensaje
- **WHEN** el host usa "Expulsar del chat" en el menú de un mensaje
- **THEN** el asistente queda `chat_banned` en BD, sus mensajes dejan de difundirse y su cliente muestra el estado de expulsado

#### Scenario: Admin expulsa del chat desde un mensaje
- **WHEN** un admin que está en la sala usa "Expulsar del chat" en el menú de un mensaje de un asistente
- **THEN** el efecto es el mismo que cuando lo hace el host

#### Scenario: Spam auto-detectado en servidor
- **WHEN** una identidad supera 10 mensajes en 10 segundos
- **THEN** el servidor la chat-banea, registra el ban email+IP en `event_bans` y deja de difundir sus mensajes
