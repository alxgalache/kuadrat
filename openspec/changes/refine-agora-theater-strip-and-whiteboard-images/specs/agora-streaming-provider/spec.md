# agora-streaming-provider — Delta Spec (refine-agora-theater-strip-and-whiteboard-images)

> Refina los requisitos en vuelo de `refine-agora-fullscreen-and-grid` (sin archivar), que a su vez parte de `add-agora-streaming-provider` y `refine-agora-live-ux`. Solo frontend (`AgoraLiveRoom.js` + prop desde `EventDetail.js`). Los eventos LiveKit no cambian. Requiere archivarse **después** de los tres cambios padres.

## MODIFIED Requirements

### Requirement: Modo teatro (pantalla completa con banda de participantes)
La sala Agora SHALL ofrecer un modo "teatro" que muestre a pantalla completa el medio destacado del host —cámara, pantalla compartida o pizarra— con una **banda inferior de tiles de los demás participantes** (host excluido). El teatro SHALL implementarse como overlay a viewport completo controlado por estado (`fixed inset-0`), solicitando además el fullscreen nativo del navegador sobre el propio overlay como mejora progresiva (en iOS Safari, donde no existe fullscreen de elementos, el overlay SHALL funcionar igualmente ocupando el viewport). Mientras el teatro está abierto, los tiles del layout normal NO SHALL renderizarse (un track de vídeo Agora solo puede reproducirse en un contenedor); el audio y el socket de la sala SHALL permanecer intactos. La salida SHALL ser posible con un botón de cierre visible, con la tecla Escape y al abandonar el fullscreen nativo; al salir, la sala SHALL volver al layout anterior sin recargar.

Puntos de entrada: en `meeting`, los asistentes SHALL disponer del botón de teatro sobre el recuadro destacado del host siempre que este muestre contenido (cámara, pantalla o pizarra); el host SHALL disponer de él cuando su destacado exista (pantalla compartida o pizarra). En `broadcast`, los viewers SHALL disponer del botón sobre el vídeo del host (cámara o pantalla) y sobre la pizarra cuando esté activa; el host SHALL disponer de él sobre la pizarra.

**Fin del evento durante el teatro**: cuando el evento finaliza (señal `event_ended` recibida por socket), la sala Agora SHALL cerrar automáticamente el modo teatro —overlay y fullscreen nativo si sigue activo— de forma que el diálogo "Evento finalizado" que muestra la página del evento quede visible para el participante, igual que para quienes están en la vista normal.

#### Scenario: Asistente maximiza la cámara del host (meeting)
- **WHEN** un asistente de un meeting pulsa el botón de teatro sobre el recuadro destacado del host que muestra su cámara
- **THEN** la cámara del host ocupa la pantalla con la banda de participantes en la parte inferior
- **AND** al pulsar el botón de cierre o Escape, la sala vuelve al layout anterior sin recargar

#### Scenario: Asistente maximiza la pantalla compartida (meeting)
- **WHEN** el host comparte pantalla y un asistente activa el teatro
- **THEN** la pantalla compartida ocupa el área destacada del teatro con la banda inferior de participantes

#### Scenario: Teatro en broadcast con banda de avatares
- **WHEN** un viewer de un broadcast activa el teatro sobre el vídeo del host
- **THEN** el vídeo del host ocupa la pantalla y la banda inferior muestra los tiles avatar+micro de los participantes con los mismos estados (inicial, badge de micrófono, mano levantada) que la vista normal

#### Scenario: El audio no se interrumpe al entrar o salir del teatro
- **WHEN** un participante entra y sale del modo teatro mientras el host y otros participantes hablan
- **THEN** el audio de la sala continúa sin cortes y el chat sigue recibiendo mensajes

#### Scenario: El host finaliza el evento con participantes en teatro
- **WHEN** el host finaliza el evento mientras un participante tiene el modo teatro abierto (con o sin fullscreen nativo)
- **THEN** el teatro del participante se cierra automáticamente (overlay y fullscreen nativo incluidos)
- **AND** el participante ve el diálogo "Evento finalizado" con el botón "Aceptar", igual que los participantes en vista normal

## REMOVED Requirements

### Requirement: Banda de participantes del teatro — paginación de 5 en 5 con bucle
**Reason**: La ventana fija de 5 tiles desaprovecha el ancho en pantallas panorámicas y desborda en móviles (en iPhone las flechas quedan recortadas fuera del viewport, dejando al usuario sin paginación). Sustituido por la banda de capacidad dinámica según el ancho disponible.
**Migration**: El comportamiento queda cubierto por el requisito "Banda de participantes del teatro — capacidad dinámica con bucle": misma banda, mismos tamaños de tile, misma rotación en bucle y botón de ocultar/mostrar, pero con el número de tiles visibles calculado según el ancho de la pantalla.

## ADDED Requirements

### Requirement: Banda de participantes del teatro — capacidad dinámica con bucle
La banda inferior del teatro SHALL mostrar los participantes (host excluido) en ventanas cuyo tamaño SHALL calcularse dinámicamente según el ancho disponible del viewport: caben tantos tiles como permita el ancho, descontando el espacio de las flechas de paginación cuando procedan, de modo que **tiles y flechas queden siempre íntegramente dentro de la pantalla** en cualquier dispositivo, resolución y orientación. Los tamaños de tile SHALL ser los actuales (compacto en móvil, mayor en escritorio); el tamaño de tile NO SHALL reducirse para encajar más recuadros. Cuando el total de participantes no supera la capacidad visible, SHALL mostrarse todos sin flechas. Cuando la supera, SHALL mostrarse flechas a ambos lados que avanzan/retroceden la ventana **en bloques del tamaño visible, en bucle** (rotación endless módulo el total). La capacidad SHALL recalcularse al cambiar el tamaño o la orientación de la pantalla. En `meeting` los tiles de la banda SHALL ser tiles de cámara cuadrados compactos (vídeo recortado centrado o avatar de inicial, nombre, badge de micro y anillo de "hablando"); en `broadcast` SHALL ser los tiles avatar+micrófono de la vista normal. La banda SHALL poder ocultarse y volver a mostrarse con un botón dedicado; oculta, el medio destacado SHALL ganar toda la altura. Solo los tiles de la ventana visible SHALL estar montados (coste de decodificación acotado a los vídeos visibles).

#### Scenario: Monitor panorámico aprovecha el ancho
- **WHEN** un participante abre el teatro en un monitor de escritorio panorámico con 14 participantes además del host
- **THEN** la banda muestra tantos tiles como caben en el ancho de la pantalla (más de 5 si caben), con las flechas visibles a ambos lados

#### Scenario: iPhone en vertical — flechas siempre visibles
- **WHEN** un participante abre el teatro desde un iPhone en orientación vertical con 10 participantes además del host
- **THEN** la banda muestra solo los tiles que caben en el ancho junto con las dos flechas, todos íntegramente dentro de la pantalla
- **AND** las flechas permiten recorrer al resto de participantes en bucle

#### Scenario: Rotación de dispositivo recalcula la capacidad
- **WHEN** un participante en teatro gira su móvil de vertical a horizontal
- **THEN** la banda recalcula cuántos tiles caben y muestra más recuadros aprovechando el nuevo ancho, conservando la rotación en bucle

#### Scenario: Pocos participantes, sin flechas
- **WHEN** el evento tiene participantes que caben todos en el ancho visible de la banda
- **THEN** se muestran todos los tiles y no se muestran las flechas de paginación

#### Scenario: Ocultar y mostrar la banda
- **WHEN** un usuario en teatro pulsa el botón de ocultar la banda
- **THEN** la banda desaparece y el medio destacado ocupa toda la altura de la pantalla
- **AND** al pulsarlo de nuevo, la banda reaparece en la misma posición de paginación
