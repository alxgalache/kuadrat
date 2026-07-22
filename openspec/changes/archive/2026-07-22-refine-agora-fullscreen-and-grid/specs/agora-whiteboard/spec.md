# agora-whiteboard — Delta Spec (refine-agora-fullscreen-and-grid)

> Refina la capability en vuelo introducida por `add-agora-streaming-provider` y refinada por `refine-agora-live-ux` (ambos sin archivar). Solo frontend. Requiere archivarse **después** de ambos cambios padres.

## ADDED Requirements

### Requirement: Nombres reales en los cursores en vivo de la pizarra
Los cursores en vivo de la pizarra SHALL mostrar el **nombre real** del usuario (el mismo nombre de la presencia del evento) en lugar de la identity interna (`host-<id>` / `viewer-<n>`). Para ello, `WhiteboardPanel` SHALL unir la sala pasando `joinRoom.userPayload = { nickName: <nombre> }` a `createFastboard` (el cursor de `@netless/window-manager` resuelve su etiqueta como `payload.nickName || payload.cursorName || memberId`). El `uid`/token de la sala NO SHALL cambiar (el `userPayload` es informativo). Si el nombre no está disponible, el comportamiento SHALL degradar al actual (etiqueta = memberId).

#### Scenario: El asistente ve el nombre del host en el cursor
- **WHEN** el host dibuja en la pizarra activa
- **THEN** los asistentes ven junto al cursor del host su nombre real, no `host-<id>`

#### Scenario: Cursores de participantes con "Todos escriben"
- **WHEN** en un meeting con "Todos escriben" activo varios participantes mueven el cursor sobre la pizarra
- **THEN** cada cursor muestra el nombre real del participante correspondiente, no `viewer-<n>`

### Requirement: Pizarra en modo teatro con interactividad completa
Cuando la pizarra se visualiza en el modo teatro de la sala Agora, la instancia fastboard NO SHALL remontarse al entrar ni al salir del teatro (el contenedor de la pizarra conserva su posición en el árbol de componentes; solo cambia su posicionamiento CSS). En teatro, el **host SHALL poder seguir escribiendo y usando la toolbar** con normalidad, y los **asistentes con rol writer** (meeting con "Todos escriben") SHALL poder escribir igualmente; los asistentes con rol reader SHALL seguir en solo lectura. El cambio del flag "Todos escriben" durante el teatro SHALL comportarse como en la vista normal (remontaje por credenciales/rol nuevos, con el contenido persistido en el servidor).

#### Scenario: El host escribe en la pizarra a pantalla completa
- **WHEN** el host activa el teatro sobre la pizarra y usa las herramientas de dibujo
- **THEN** puede dibujar con normalidad y los trazos llegan a los asistentes en tiempo real
- **AND** al salir del teatro la pizarra continúa en la vista normal sin recargarse ni perder el estado de la sesión

#### Scenario: Asistente writer escribe en teatro
- **WHEN** en un meeting con "Todos escriben" activo un asistente entra al teatro de la pizarra y dibuja
- **THEN** sus trazos se propagan a todos, igual que en la vista normal

#### Scenario: Asistente reader en teatro sigue en solo lectura
- **WHEN** un asistente con rol reader (broadcast, o meeting sin "Todos escriben") entra al teatro de la pizarra
- **THEN** ve el lienzo y los trazos en tiempo real sin toolbar de edición y no puede dibujar
