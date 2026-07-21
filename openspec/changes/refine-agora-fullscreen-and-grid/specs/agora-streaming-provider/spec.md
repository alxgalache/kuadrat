# agora-streaming-provider — Delta Spec (refine-agora-fullscreen-and-grid)

> Refina los requisitos en vuelo de `add-agora-streaming-provider` y `refine-agora-live-ux` (ambos sin archivar). Solo frontend (`AgoraLiveRoom.js`). Los eventos LiveKit y el resto de la sala Agora (promoción, moderación, chat, presencia) NO cambian. Requiere archivarse **después** de ambos cambios padres.

## MODIFIED Requirements

### Requirement: Sala en directo Agora — modo meeting (grid de cámaras)
Con `interaction_mode='meeting'`, la disposición de cámaras SHALL depender del rol del espectador. Para los **asistentes** (no host), el **host (o su pantalla compartida) SHALL mostrarse en un recuadro destacado a todo el ancho** del contenedor (grande, `aspect-video`) y el resto de participantes **debajo, en un grid en filas de 5 tiles cuadrados** (5 columnas y relación de aspecto 1:1 en TODOS los tamaños de pantalla, móvil incluido). El vídeo de cada tile SHALL recortarse centrado para llenar el cuadrado manteniendo su relación de aspecto (`fit: 'cover'`, equivalente a `object-fit: cover` de CSS): se asume la pérdida de los laterales (o franjas superior/inferior) de la imagen de la webcam. Para el **host**, cuando NO comparte pantalla ni pizarra, todas las cámaras (incluida la suya, **la primera y del mismo tamaño** que las demás) SHALL mostrarse en ese mismo grid de filas de 5 tiles cuadrados, sin recuadro destacado; cuando el host comparte pantalla o activa la pizarra, esta SHALL ocupar el recuadro destacado a todo el ancho con los participantes debajo. Cada tile SHALL mostrar: vídeo de cámara (o avatar de inicial si está apagada), nombre, badge de estado de micro y anillo de "hablando"; el tile propio SHALL marcarse "(Tu)". TODOS los participantes SHALL entrar como PUBLISHER con **micrófono muteado y cámara apagada por defecto**, y disponer en la barra inferior de controles propios: activar/silenciar micrófono, encender/apagar cámara y selectores de dispositivo. El host SHALL disponer además de compartir pantalla (se muestra en el recuadro destacado del host), silenciar a un participante (`force_mute`), expulsar del chat y "Finalizar evento". El **chat lateral** (mismo `ChatPanel` por Socket.IO) SHALL ocupar **siempre toda la altura disponible de la página**: la columna de medios SHALL hacer scroll interno y el chat NO SHALL cambiar de altura al compartir pantalla ni al aumentar el número de participantes. No SHALL mostrarse el botón de levantar la mano (todos pueden hablar).

#### Scenario: Taller con cámaras (host destacado + filas de 5 cuadradas)
- **WHEN** 8 asistentes entran a un evento Agora meeting activo
- **THEN** el host se muestra en un recuadro grande a todo el ancho y los participantes aparecen debajo en filas de 5 tiles cuadrados 1:1 (avatar si su cámara está apagada), muteados por defecto
- **AND** el vídeo de cada tile se ve recortado centrado, sin deformarse

#### Scenario: Grid cuadrado también en móvil
- **WHEN** un asistente abre el mismo meeting desde un dispositivo móvil
- **THEN** los tiles de participantes se organizan igualmente en filas de 5 recuadros cuadrados 1:1

#### Scenario: Host modera un micrófono abierto
- **WHEN** el host silencia a un participante con ruido de fondo
- **THEN** el micrófono del participante queda muteado para todos y este puede volver a activarlo cuando lo necesite

#### Scenario: Pantalla compartida en meeting
- **WHEN** el host comparte pantalla en un meeting
- **THEN** la pantalla ocupa el recuadro destacado del host a todo el ancho y los participantes permanecen debajo en filas de 5 tiles cuadrados
- **AND** la altura del chat lateral no cambia

#### Scenario: Chat a altura completa con muchos participantes
- **WHEN** el número de participantes crece hasta requerir scroll en la zona de cámaras
- **THEN** la columna de cámaras hace scroll interno y el chat lateral mantiene toda la altura disponible de la página (no se estira ni se encoge)

#### Scenario: Vista del host — grid de tiles iguales
- **WHEN** el host de un meeting no comparte pantalla ni tiene la pizarra activa
- **THEN** ve todas las cámaras (incluida la suya, la primera y del mismo tamaño que las demás) en el grid de filas de 5 tiles cuadrados, sin recuadro destacado
- **AND** al compartir pantalla o activar la pizarra, esta pasa al recuadro destacado a todo el ancho y los participantes quedan debajo

#### Scenario: Enviar un mensaje en el chat no desplaza la página
- **WHEN** cualquier participante o el host escribe un mensaje en el chat y pulsa Enter
- **THEN** solo se desplaza el interior del chat hasta el último mensaje; la página/vista no se desplaza ni salta

## REMOVED Requirements

### Requirement: Pantalla completa de la pantalla compartida (Agora)
**Reason**: Sustituido por el modo teatro (pantalla completa con banda de participantes), que cubre todos los casos de este requisito (pantalla compartida en meeting, vídeo del host en broadcast) y los amplía (cámara del host en meeting, pizarra).
**Migration**: El botón de pantalla completa de la sala Agora pasa a abrir el modo teatro descrito en el requisito "Modo teatro (pantalla completa con banda de participantes)". El fullscreen nativo de LiveKit (`EventLiveRoom`) no se ve afectado.

## ADDED Requirements

### Requirement: Modo teatro (pantalla completa con banda de participantes)
La sala Agora SHALL ofrecer un modo "teatro" que muestre a pantalla completa el medio destacado del host —cámara, pantalla compartida o pizarra— con una **banda inferior de tiles de los demás participantes** (host excluido). El teatro SHALL implementarse como overlay a viewport completo controlado por estado (`fixed inset-0`), solicitando además el fullscreen nativo del navegador sobre el propio overlay como mejora progresiva (en iOS Safari, donde no existe fullscreen de elementos, el overlay SHALL funcionar igualmente ocupando el viewport). Mientras el teatro está abierto, los tiles del layout normal NO SHALL renderizarse (un track de vídeo Agora solo puede reproducirse en un contenedor); el audio y el socket de la sala SHALL permanecer intactos. La salida SHALL ser posible con un botón de cierre visible, con la tecla Escape y al abandonar el fullscreen nativo; al salir, la sala SHALL volver al layout anterior sin recargar.

Puntos de entrada: en `meeting`, los asistentes SHALL disponer del botón de teatro sobre el recuadro destacado del host siempre que este muestre contenido (cámara, pantalla o pizarra); el host SHALL disponer de él cuando su destacado exista (pantalla compartida o pizarra). En `broadcast`, los viewers SHALL disponer del botón sobre el vídeo del host (cámara o pantalla) y sobre la pizarra cuando esté activa; el host SHALL disponer de él sobre la pizarra.

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

### Requirement: Banda de participantes del teatro — paginación de 5 en 5 con bucle
La banda inferior del teatro SHALL mostrar los participantes (host excluido) en ventanas de **5 tiles**. Con 5 participantes o menos, SHALL mostrarse todos sin flechas. Con más de 5, SHALL mostrarse dos botones con forma de flecha a ambos lados de la banda que avanzan/retroceden la ventana **de 5 en 5 en bucle** (rotación endless módulo el total de participantes). En `meeting` los tiles de la banda SHALL ser tiles de cámara cuadrados compactos (vídeo recortado centrado o avatar de inicial, nombre, badge de micro y anillo de "hablando"); en `broadcast` SHALL ser los tiles avatar+micrófono de la vista normal. La banda SHALL poder ocultarse y volver a mostrarse con un botón dedicado; oculta, el medio destacado SHALL ganar toda la altura. Solo los tiles de la ventana visible SHALL estar montados (con hasta 16 participantes, el coste de decodificación queda acotado a 5 vídeos).

#### Scenario: Rotación en bucle con 12 participantes
- **WHEN** un meeting tiene 12 participantes además del host y un asistente en teatro pulsa la flecha derecha dos veces
- **THEN** la banda muestra primero los participantes 6–10, después los participantes 11, 12 y de nuevo 1–3 (rotación en bucle)
- **AND** la flecha izquierda recorre las mismas ventanas en sentido inverso

#### Scenario: Cinco participantes o menos, sin flechas
- **WHEN** el evento tiene 4 participantes además del host y se abre el teatro
- **THEN** la banda muestra los 4 tiles y no se muestran las flechas de paginación

#### Scenario: Ocultar y mostrar la banda
- **WHEN** un usuario en teatro pulsa el botón de ocultar la banda
- **THEN** la banda desaparece y el medio destacado ocupa toda la altura de la pantalla
- **AND** al pulsarlo de nuevo, la banda reaparece en la misma posición de paginación
