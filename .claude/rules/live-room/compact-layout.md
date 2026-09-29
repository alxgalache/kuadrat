---
paths:
  - "client/components/{AgoraLiveRoom,EventLiveRoom,EventVideoPlayer}.js"
  - "client/components/events/{LiveRoomShell,LiveRoomSheet,LiveRoomTopBar,LeaveEvent,MeetingGrid,CompactCameraRow,CompactControls,CompactHostControls,CompactParticipantRow,LandscapeStageChrome,ParticipantTile}.js"
  - "client/hooks/{useCompactRoomLayout,useLiveRoomViewport,useLiveRoomDocument,useChatAutoScroll,useSpeakerActivity,useAutoHideChrome,useScreenWakeLock}.js"
  - "client/lib/{meetingGrid,liveRoomFocus}.js"
  - "client/app/live/**"
---

## Vista compacta de las salas en directo (`live-event-mobile-layout`)

Por debajo de **1024 px de ancho o 500 px de alto**, la sala de un evento Agora (`broadcast` y `meeting`) y la de un pase de vídeo (`format='video'`) pasan a una disposición tipo aplicación:

- barra superior con el logo, «EN DIRECTO» y los conectados;
- escena a sangre;
- filas del modo (participantes con la mano fija a la izquierda, o cámaras cuadradas de reunión) y fila de controles de icono;
- chat con scroll interno y el campo abajo;
- en horizontal, primero el vídeo, con panel lateral y controles superpuestos que se ocultan solos.

Por encima del umbral la vista de escritorio no cambia. **LiveKit queda fuera** por decisión (13/09/2026). Ver `openspec/changes/archive/2026-09-16-live-event-mobile-layout`.

* **Un solo árbol en todas las disposiciones.** `LiveRoomShell` es siempre el mismo `div`: `contents` en escritorio y un `fixed` con rejilla en compacto. Los envoltorios intermedios de la sala también pasan a `contents`, y escena, filas y chat se colocan con `grid-area` (`roomCell`, `stageFrame`). Lo que solo existe en una disposición se escribe como hueco `{cond && <X />}`. **Nunca un componente distinto por disposición:** girar una tablet de 768 a 1024 px desmontaría la escena, y mover la pizarra en el árbol rejoinea fastboard. `MeetingSelfControls` tampoco se desmonta al cambiar de disposición, porque es dueño de sus hooks de dispositivos y efectos.
* **Un criterio, una lectura.** `LIVE_ROOM_COMPACT_QUERY` y `LIVE_ROOM_LANDSCAPE_QUERY` viven en `client/lib/constants.js` y solo las lee `useCompactRoomLayout`, con `useSyncExternalStore` y valor de servidor `false`, porque `EventDetail` se renderiza en servidor. Mientras el campo del chat (`[data-chat-composer]`) tiene el foco, la disposición se congela: con `resizes-content` el teclado cambiaría el resultado bajo los dedos de quien escribe.
* **Altura desde `visualViewport`, sin estado de React.** `useLiveRoomViewport` escribe `--room-h`/`--room-top` y `data-keyboard="open"` directamente en el nodo. `100dvh` no absorbe el teclado ni en Safari ni en Chrome Android (que desde la 108 solo redimensiona el viewport visual). Teclado abierto = campo enfocado **y** alto por debajo del 75 % del máximo de la orientación; al abrirse se ocultan la barra y las filas (`group-data-[keyboard=open]/live-room:hidden`) y la escena se encoge sola por su tope del 50 % del alto.
* **Nunca `transform` en el contenedor:** convertiría en relativos a él a sus descendientes `fixed` (teatro, consola, «Activar audio»). Va con `top`. Está a `z-40`, por debajo de lo global a `z-50` («Evento finalizado», cookies, notificaciones).
* **`data-live-room` y `viewport-fit=cover` existen solo con la sala compacta montada** (`useLiveRoomDocument`) y se restauran al salir. El atributo bloquea el scroll y el `overscroll-behavior` del documento: en Chrome Android tirar hacia abajo recargaba la página y expulsaba de la sala. `viewport-fit` se cambia en caliente a propósito, porque la navegación de cliente del App Router también lo hace en caliente. Si iOS no lo aplicara, el fallo es cosmético (franjas en horizontal, nada tapado). Todo borde que toca el contenedor lleva `env(safe-area-inset-*)`, incluidos teatro y consola.
* **El campo del chat mide 16 px en compacto** (iOS amplía la página con menos y la ampliación persiste) y **el botón de enviar no roba el foco** (`preventDefault` en `pointerdown`/`mousedown`), para que el teclado siga abierto. Es la última fila de la rejilla, no un `position: fixed` propio. El autodesplazamiento (`useChatAutoScroll`) solo sigue al final si el usuario ya estaba abajo o el mensaje es suyo; si no, «Mensajes nuevos». Aplica también en escritorio.
* **Toda la interfaz secundaria son hojas hijas del contenedor** (`LiveRoomSheet`): nunca un portal a `document.body`, la misma regla que la consola. Tocar un participante, una cámara o un mensaje abre su hoja: nunca actúa directamente, porque en una fila que se desliza un toque impreciso daba la palabra a otra persona.
* **En reunión compacta todos ven la escena destacada, host incluido,** y la fila de cámaras solo monta `AgoraVideo` en los cuadrados visibles (`IntersectionObserver`). **No** reduce lo que se recibe ni lo que factura Agora: dejar de suscribir las cámaras fuera de pantalla está anotado como cambio futuro.
* **Pase de vídeo en táctil.**
  * Un toque muestra los controles y el volumen desaparece con `(hover: none)`, porque iOS ignora `video.volume`.
  * En iPhone, sin pantalla completa de elementos, se usa el reproductor nativo; al salir (`webkitendfullscreen`) se resincroniza y se reanuda, porque la corrección de deriva ignora los vídeos pausados.
  * El teatro y el reproductor bloquean la orientación en horizontal tras resolverse la pantalla completa, que es cuando Android lo concede.
* **Salir del evento (`live-event-leave`).**
  * **Dónde está.** Todas las salas (Agora, LiveKit y vídeo) tienen «Salir del evento»: en la cabecera de escritorio, en la barra superior compacta y en los controles superpuestos en horizontal. El logo de la sala compacta es un enlace a `/` que **nunca navega sin preguntar**.
  * **Un solo proveedor.** `LeaveEventProvider` (`client/components/events/LeaveEvent.js`) se instancia en `EventDetail`. Dentro del contenedor compacto, la confirmación la pinta `LiveRoomShell`; fuera, el proveedor con `ConfirmDialog`.
  * **Salir no finaliza el evento**, ni para el host: el mensaje del host se lo advierte. La navegación es de cliente, y las limpiezas de la sala hacen el resto (canal, socket, bloqueo de pantalla, `data-live-room`).
  * **La cabecera se oculta solo con `compact && agoraCreds`:** LiveKit no tiene contenedor compacto y conserva la suya en todos los tamaños.
* **Rejilla del host en reunión** (escritorio, sin contenido destacado; `MeetingGrid` y `lib/meetingGrid.js`).
  * **Columnas:** 3, 4 o 5, la menor que no pase de 3 filas; con 16-17 recuadros, 5 columnas y 4 filas.
  * **Tamaño:** el lado que cabe a la vez en ancho y alto de la columna medida, así que no hay scroll.
  * **Bajo el recuadro destacado siguen las 5 columnas.**
* **Orden por actividad de voz en reunión.**
  * **Criterio.** Sale de `volume-indicator` (Agora informa cada 2 s): nivel sobre el umbral **y** `hasAudio`.
  * **Memoria.** `useSpeakerActivity` mantiene el puesto 6 s después de dejar de oírse. Los hablantes se ordenan por cuándo **empezaron** a hablar, porque «el último primero» intercambiaría a dos interlocutores a cada turno.
  * **Posición.** El host va fijo el primero en su rejilla, y el propio usuario no se promueve.
  * **Con CSS `order`, nunca reordenando el DOM:** los `<video>` de Agora no cambian de nodo. La banda del teatro solo se reordena mientras muestra su **primera página**. Al pasar de página congela el orden de ese instante (quien llega va al final) y al volver a la primera lo reanuda: reordenarla siempre cambiaría el contenido de las páginas sin tocar las flechas.
* **Verificación en iPhone sin dispositivo:** BrowserStack Live (iPhones reales en la nube, prueba gratuita) o TestMu AI (antes LambdaTest). Chrome DevTools no reproduce la isla dinámica, el teclado ni la barra de Safari.
* **Punto ciego conocido:** `client/` sigue sin runner de tests. La disposición compacta está verificada con lint y build; el comportamiento en dispositivo lo verifica el operador con la matriz de `tasks.md`.
