## Context

### Estado actual de la sala

`EventDetail.js` monta la sala dentro de `mx-auto max-w-7xl px-4 py-4`, con una cabecera propia (título, «En directo», asistentes). Todo ello va debajo de la `Navbar` global (`p-6`, ~72 px) y encima del `Footer`.

`AgoraLiveRoom.js` (1912 líneas) resuelve dos árboles de escritorio:

- **`broadcast`**
  - Columna izquierda: escena, rejilla de promovidos, rejilla de tiles de iniciales (`flex-wrap`), controles de host o co-presentador, barra oscura del conmutador de consola y botón de mano.
  - A la derecha, chat lateral con su altura copiada por `ResizeObserver` de la columna izquierda.
- **`meeting`**
  - Recuadro destacado, rejilla `grid-cols-5` de cuadrados en todos los tamaños y controles.
  - Chat a `h-[60vh]` por debajo de `lg`.

Por debajo de `lg` (1024 px) todo eso ya se apila, pero **como una página que hace scroll**, y ahí nacen los defectos de la propuesta.

El pase de vídeo (`format='video'`) usa `EventVideoPlayer`, con controles en `group-hover`, y `VideoChatPanel`, con `height: calc(56.25vw * 0.6)`. El `scrollIntoView` de ese chat desplaza también la página, el mismo defecto que `ChatPanel` de Agora ya corrigió.

La expulsión del chat ya existe:

- **Servidor:** `POST /api/events/:id/participants/:identity/ban-from-chat` (`eventController.banFromChat`) comprueba `req.user.id === event.host_user_id || req.user.role === 'admin'`, rechaza a cualquier staff con 400 (`assertNotStaffTarget`) y bifurca por proveedor.
- **Cliente:** los dos `ChatPanel` (Agora y LiveKit) sólo pintan el menú con `isHost`.

### Presupuesto de alto (vertical)

Valores aproximados del área visible con la interfaz del navegador desplegada; se verifican con `window.visualViewport`. Dimensiones de este diseño:

- barra superior: 44 px
- fila de participantes: 60 px
- fila de controles: 52 px
- campo de escribir: 56 px
- escena: ancho × 9/16
- cuadrado de cámara: 13 % del alto, más 16 px de relleno de fila

| Dispositivo (navegador) | Área visible | Escena | Chat: asistente stream | Chat: asistente reunión | Chat: host stream |
|---|---|---|---|---|---|
| iPhone SE 3 (Safari) | 375 × ~550 | 211 | ~179 px | ~99 px | ~127 px |
| Galaxy A (Samsung Internet) | 360 × ~640 | 203 | ~277 px | ~186 px | ~225 px |
| iPhone 15 (Safari) | 393 × ~660 | 221 | ~279 px | ~185 px | ~227 px |
| Pixel 7 (Chrome) | 412 × ~790 | 232 | ~398 px | ~287 px | ~346 px |

El peor caso, una reunión en un iPhone SE, deja ~4 líneas de chat. Es aceptable porque al escribir se ocultan las filas (D12). En horizontal el alto útil cae a **~330–340 px** en cualquiera de ellos, y por eso la disposición horizontal no apila (D13).

### Restricciones heredadas que no se pueden romper

- **La pizarra no puede cambiar de posición en el árbol de React.** Moverla destruye y rejoinea la sala de fastboard, y se pierde la sesión con permiso de escritura (`TheaterShell`, `BroadcastArea`).
- **Una pista de Agora se reproduce en un contenedor a la vez.** Desmontar un `AgoraVideo` llama a `track.stop()`: montar y desmontar es barato, pintar la misma pista dos veces no funciona.
- **`useHostMediaControls` se instancia una sola vez**, por encima de toda presentación.
- **Nada del árbol SSR lee `localStorage` ni `matchMedia` en un inicializador de `useState`.** Las salas son `dynamic({ ssr: false })`, pero `EventDetail` sí se renderiza en el servidor.
- **No hay runner de tests en `client/` ni iPhone físico** para verificar.

## Goals / Non-Goals

**Goals:**

- En un móvil en vertical, sala **sin scroll de documento** y con todo dentro del área visible, sea cual sea el navegador, la posición de la barra de direcciones, el teclado o las áreas seguras.
- Objetivos táctiles de **≥ 44 px** para toda acción, y ninguna información que sólo exista en `title`.
- Que host y co-presentador operen su emisión desde el móvil con la misma lógica que en escritorio.
- Que girar, redimensionar o abrir el teclado **no remonte la escena, no corte la emisión y no desconecte la pizarra**.
- **Escritorio byte a byte igual** por encima del umbral, salvo el autodesplazamiento del chat y el menú de expulsión del admin.
- Que el admin pueda expulsar del chat exactamente como el host, sin abrir ningún permiso nuevo en el servidor.

**Non-Goals:** los de la propuesta: LiveKit en móvil, la página previa, el rediseño de escritorio, dejar de suscribir las cámaras fuera de pantalla, la expulsión desde el panel de admin, PiP y la barra de la pizarra.

## Decisions

### D1. Un solo árbol: la disposición la deciden clases y `grid-area`, nunca un componente distinto

`AgoraLiveRoom` pasa a tener como raíz `LiveRoomShell`, montado siempre:

- **en escritorio,** su `className` es `contents`, así que desaparece del layout y la vista queda como hoy;
- **en compacto,** es un `fixed` con `display: grid`.

Los envoltorios intermedios (la columna `videoAreaRef` y el de `BroadcastArea`, que ya usa `contents`) pasan también a `contents` en compacto. Así escena, bloque de filas y chat son ítems directos de la rejilla y se colocan con `grid-template-areas`:

```
vertical:    "top" "stage" "rows" "chat"          (filas: auto auto auto 1fr)
horizontal:  "stage rows" "stage chat"            (columnas: 1fr panel)
```

Los hijos que sólo existen en una disposición se escriben como huecos `{cond && <X />}`. React reconcilia por posición contando los huecos, así que no desplazan el índice de `TheaterShell`.

- **Descartado — un `MobileAgoraRoom` aparte.** Cruzar el umbral (girar una tablet de 768 a 1024 px, redimensionar la ventana) desmontaría la escena y rejoinearía fastboard, y duplicaría el cableado de sockets, pistas y pizarra.
- **Descartado — variantes `screens` de Tailwind más JS.** Serían dos consultas decidiendo lo mismo, que pueden divergir. JS es imprescindible (monta u omite hojas, filas y observadores), así que la única fuente es JS.
- **Coste asumido.** Un elemento `display: contents` no tiene caja, y su `ResizeObserver` mide 0. La sincronía de altura del chat se aplica sólo fuera de compacto. Los envoltorios son `div` sin rol, para no perder semántica accesible.

### D2. Un criterio, en `constants.js`, leído con `useSyncExternalStore`

```js
LIVE_ROOM_COMPACT_QUERY   = '(max-width: 1023.98px), (max-height: 499.98px)'
LIVE_ROOM_LANDSCAPE_QUERY = '(min-aspect-ratio: 11/10)'   // evaluada solo dentro de compacto
```

`client/hooks/useCompactRoomLayout.js` devuelve `{ compact, landscape }` con `useSyncExternalStore`. El valor de servidor es `false`, así que la hidratación de `EventDetail` siempre coincide.

- **1024 px** es el `lg` en el que la vista actual ya pasa a dos columnas, así que no se introduce un umbral nuevo. **500 px de alto** captura el móvil horizontal y las ventanas bajas.
- **Proporción 11/10 para el horizontal.** En la tabla de Context, apilar deja menos de ~180 px de chat en cuanto el ancho supera 1,1 veces el alto.
- **Congelado mientras se escribe.** Los navegadores que redimensionan el viewport de layout con el teclado cambian el resultado de las consultas al abrirlo. Con el campo del chat enfocado, el hook retiene el último valor y aplica el pendiente en `focusout`.

### D3. Contenedor fijo por encima de la navbar, no una ruta sin layout

`LayoutWrapper` decide por `pathname`, y `/live/[slug]` es también la página previa, que sí lleva navbar. Lo que decide es el estado de la sala. El contenedor es `fixed` y cubre `Navbar`, `Footer` y `NewsletterBanner` sin tocarlos.

- **`z-40`:** por encima de la página y del diálogo móvil de la navbar (`z-10`), y **por debajo** de lo global a `z-50`: `ConfirmDialog` «Evento finalizado», `Notification`, `BannerNotification`, `CookieBanner` y el overlay «Activar audio».
- **Teatro y consola quedan dentro de su contexto de apilamiento.** `fixed` con `z-index` crea contexto, así que el teatro y la consola (`z-[60]`) quedan dentro del contenedor: en compacto los avisos globales se ven por encima de ellos, que para «Evento finalizado» es lo deseable.
- **Nunca `transform` en el contenedor.** Convertiría en relativos a él a los descendientes `fixed`. El desplazamiento se aplica con `top`.
- **Aceptado:** en la primera visita el banner de cookies tapa el campo del chat hasta decidir.

### D4. Altura desde `visualViewport`, escrita como variables CSS y no como estado

`100dvh` absorbe las barras del navegador pero **no el teclado**: ni Safari ni Chrome Android (que desde la versión 108 redimensiona sólo el viewport visual) encogen el viewport de layout. `interactive-widget=resizes-content` sí lo encoge, pero Safari lo ignora y es global.

`client/hooks/useLiveRoomViewport.js` escucha `resize` y `scroll` de `visualViewport`, agrupados por `requestAnimationFrame`, y escribe con `style.setProperty` sobre el nodo del contenedor:

```css
top:    var(--room-top, 0px);      /* visualViewport.offsetTop */
height: var(--room-h, 100dvh);     /* visualViewport.height */
```

No pasa por estado de React: la animación del teclado dispara decenas de eventos y la sala es un árbol grande. Con el documento sin scroll (D5), la barra de Chrome no se retrae nunca, esté arriba o abajo.

### D5. Documento bloqueado con un atributo en `<html>`

Mientras el contenedor compacto está montado, un efecto pone `data-live-room` en `<html>` y lo retira en la limpieza. `globals.css` aplica con él:

```css
html[data-live-room], html[data-live-room] body { overflow: hidden; overscroll-behavior: none; }
```

Tres motivos:

1. `html` lleva `overflow-y: scroll` global.
2. En Chrome Android el sobre-desplazamiento del documento es *pull-to-refresh*, que expulsa de la sala y, a quien emite, le corta la emisión.
3. En iOS el rebote se encadena al documento.

Es el mismo patrón que `data-cookie-consent`.

### D6. `viewport-fit=cover` sólo mientras la sala compacta está montada

- **Sin `cover`,** Safari en horizontal encoge el viewport lejos de la isla dinámica y rellena los laterales con el fondo de `html`: franjas blancas junto a una escena negra.
- **Con `cover` global,** todas las demás páginas se meterían bajo el notch.

`client/hooks/useLiveRoomDocument.js`, el mismo de D5, añade `viewport-fit=cover` al `content` de `<meta name="viewport">` y restaura la cadena original al desmontar.

**Márgenes `env(safe-area-inset-*)`**, siempre con `max()` frente al margen propio:

- superior de la barra;
- inferior del campo de escribir (salvo con teclado) y de las hojas;
- en horizontal, izquierdo de la columna de la escena (fondo negro, la franja se funde) y derecho del panel;
- controles y banda del teatro;
- bordes de la consola y de «Solo vídeo».

**Decisión final (13/09/2026, sin iPhone para verificar antes): se mantiene el cambio en caliente** frente a la alternativa de exportar `viewport` desde el segmento `app/live/[slug]`:

1. **La alternativa no da más determinismo.** En el App Router, una navegación de cliente desde `/live` también actualiza `<meta name="viewport">` en caliente, así que exportarlo desde el segmento dependería igualmente de que WebKit reprocese la etiqueta al cambiar su `content`, en todas las entradas que no sean una carga completa.
2. **La alternativa extiende el problema.** Llevaría `cover` a la página previa, cuya navbar y cuyo contenido tendrían que ganar márgenes laterales para no quedar bajo la isla. El cambio en caliente se limita a la sala.
3. **El fallo sería cosmético.** Si iOS no aplicara el cambio, las inserciones valdrían 0 y se verían las franjas blancas de hoy en horizontal. Ningún control quedaría tapado, porque sin `cover` el propio Safari aparta el contenido.

Se verifica tras implementar en un iPhone real en la nube (sección «Verificación en iPhone sin dispositivo»).

### D7. Barra superior: logo, «EN DIRECTO» y conectados

- 44 px más la inserción superior.
- `BrandLogo` a `h-5`, **sin enlace**: salir cuesta una reconexión y, a quien emite, cortar la emisión.
- A la derecha, punto rojo, «EN DIRECTO» y el número de la presencia (el mismo que la cabecera del chat de escritorio), con `aria-label` «N conectados».
- **Sin título:** no tiene ninguna acción asociada y ya está en la pestaña.
- **Pase de vídeo sin número:** no hay presencia.
- Se oculta en horizontal y con el teclado abierto.

### D8. Fila de participantes del stream

```
┌───────────────────────────────────────┐ ← env(safe-area-inset-top)
│ 140d                  ● EN DIRECTO 23 │ 44
├───────────────────────────────────────┤
│            ESCENA 16:9                │ ancho × 9/16, ≤ 50 % del alto
├──────┬────────────────────────────────┤
│[mano]│ [H] [A] [M] [J] [L] [R] [T] [… │ 60 — scroll horizontal
├──────┴────────────────────────────────┤
│ Ana   hola!                           │ chat: 1fr, scroll interno
│                   [ Mensajes nuevos ] │
├───────────────────────────────────────┤
│ [ Escribe un mensaje…         ] [ > ] │ 56 + env(safe-area-inset-bottom)
└───────────────────────────────────────┘
```

- **Tiles de 44 × 44 px** frente a los 56 de escritorio; insignias de **16 px** con iconos de 10 px. Se conserva la proporción tile/insignia de 0,36. Mismos colores, estados, anillos y **una sola función de orden**, compartida con escritorio.
- **Mano de 44 × 44 px** con el mismo radio, **fuera** del contenedor con scroll y separada por un filete: si se desplazara con la fila, quien quiere pedir la palabra tendría que volver al principio. Paleta de escritorio (blanco con `ring-gray-300`; ámbar al levantarla).
- **Fila de 60 px** con `py-2`, porque `overflow-x: auto` recorta también el eje Y y las insignias sobresalen 4 px.
- **Sin nombres bajo los tiles.** Una etiqueta de 14 px llevaría la fila a 78 px, un 30 % más de alto quitado al chat. El nombre va en `aria-label` y en la hoja.
- **`overscroll-behavior-x: contain`.** En Chrome Android, el sobre-desplazamiento horizontal al final de un contenedor dispara la navegación atrás.
- **Tocar abre la hoja del participante** en lugar de ejecutar la acción. En una fila que se desplaza con el dedo, un toque impreciso daba la palabra a otra persona.
- **Promovidos con vídeo** (raro): fila propia de 16:9 y 64 px de alto encima, sólo si los hay.

### D9. Reunión: escena destacada para todos y fila de cámaras cuadradas

```
│ 140d                   ● EN DIRECTO 9 │
│        HOST · PANTALLA · PIZARRA 16:9 │
│ [cam][cam][cam][cam][…                │ clamp(64px, 13 % del alto, 104px)
│ [mic] [cam]                     [···] │ 52
│ chat…                                 │
│ [ Escribe un mensaje…         ] [ > ] │
```

- **El host también ve la escena destacada en compacto:** su cámara, o su pantalla o pizarra. En escritorio conserva la rejilla de iguales. Dieciséis cuadrados iguales en vertical obligan a elegir entre recuadros diminutos y quedarse sin chat.
- **1:1.** Los asistentes publican en 16:9, pero un móvil en vertical publica 9:16. El recorte centrado a cuadrado conserva caras en ambos casos.
- **Tamaño `clamp(64px, calc(var(--room-h) * 0.13), 104px)`:** 72 px en un SE, 86 en un iPhone 15, 103 en un Pixel 7.
- **Sólo los visibles montan vídeo.** Un `IntersectionObserver` con la fila como raíz y un cuadrado de margen decide cuáles montan `AgoraVideo`; el resto muestra el avatar. Mismo criterio que `TheaterStrip`. **No** reduce lo que se recibe ni lo que factura Agora (cambio futuro anotado).
- **Tocar un cuadrado abre la hoja:** nombre y, para el host, «Silenciar micrófono».

### D10. Controles: fila de iconos y hoja «Más», con una sola lógica

```
host stream:      [mic] [cam] [pant] [piz]   [···]   [Finalizar]
co-presentador:   [mic] [cam]                [···]
reunión:          [mic] [cam]                [···]
asistente stream: sin fila (la mano va en la fila de participantes)
```

- **Botones de icono de 44 × 44 px** con `aria-label`, `aria-pressed` y `touch-action: manipulation`. **Apagado en rojo**, la convención de Meet. El `ToggleSwitch` con etiqueta de texto no cabe cuatro veces en 360 px.
- **«Pantalla» sólo aparece en la fila si `screenShareSupported`.** En la hoja se muestra deshabilitada con «No disponible en este navegador», como en la consola. Mismo trato para «Altavoz» («La gestiona el sistema»).
- **«Finalizar»:** botón de texto rojo a la derecha, con confirmación.

| Rol | Hoja «Más» |
|---|---|
| Host | Micrófono · Cámara · Altavoz · Pantalla (si no soportada) · Calidad (si `selectVideoQuality`) · Efectos (si `supported`) · Todos escriben (reunión con pizarra) · Vista del host (si `allow_mobile_host_console`) |
| Co-presentador | Micrófono · Cámara · Altavoz · Disposición de cámaras (bloqueada con aviso si hay contenido) |
| Asistente de reunión | Micrófono · Cámara · Altavoz · Efectos (si `supported`) |

- **Las hojas son hijas del contenedor, nunca un portal a `body`.** Es la misma regla que la consola.
- **`LiveRoomSheet`:**
  - `absolute inset-0` con fondo y panel inferior de alto máximo del 70 %;
  - `role="dialog"` y `aria-modal`;
  - foco dentro al abrir y devuelto al cerrar;
  - cierre con Escape, con el fondo y con «Cerrar».
- **Reutilización y no copia:**
  - las fuentes usan `MobileDevicePicker`;
  - `ConsoleConfirm` sale de `HostConsole` a `InlineConfirm.js`;
  - las opciones de `VideoEffectsMenu` salen a `VideoEffectsOptions.js`.
- **Estado y acciones:** del **mismo** `useHostMediaControls` para host y co-presentador. `MeetingSelfControls` conserva sus hooks y decide dentro de sí qué presentación pinta.

### D11. Chat: campo de 16 px, teclado que no se cierra y autodesplazamiento pegajoso

El `ChatPanel` de Agora y `VideoChatPanel` consumen `chat/ChatComposer.js` y `hooks/useChatAutoScroll.js`.

- **16 px en compacto.** Safari en iOS amplía la página al enfocar un `<input>` de menos de 16 px, y la ampliación persiste.
- **El botón de enviar no roba el foco** (`onPointerDown={e => e.preventDefault()}`). Si lo robara, el teclado se cerraría y el contenedor volvería a crecer. `enterKeyHint="send"`.
- **Autodesplazamiento:** sólo si el usuario está a ≤ 48 px del final o el mensaje es propio. Si no, aparece «Mensajes nuevos». Aplica en todos los tamaños.
- **Moderación:** el `⋯` de cada mensaje tiene 32 × 32 px en compacto y abre la hoja «Expulsar del chat». Un desplegable dentro de `overflow-y-auto` queda recortado en los últimos mensajes. Quién lo ve se decide en D18.
- **El campo es la última fila de la rejilla,** no un `position: fixed` propio: un `fixed` con el teclado de iOS se coloca respecto al viewport de layout y queda detrás del teclado.

### D12. Teclado virtual: foco y alto a la vez, compactado por CSS

«Teclado abierto» exige las dos condiciones: campo del chat enfocado **y** `visualViewport.height < 0,75 ×` el máximo observado desde el último cambio de orientación.

- **Sólo foco** plegaría las filas con un teclado físico.
- **Sólo alto** confundiría la barra de Safari retrayéndose en horizontal.

El hook de D4 pone `data-keyboard="open"` en el contenedor.

- `group-data-[keyboard=open]:hidden` oculta la barra superior y las filas.
- El campo pierde el margen de área segura.
- La escena **no se oculta**: su tope del 50 % la encoge sola.

En un iPhone 15 en vertical quedan ~330 px: escena de 165, ~110 px de mensajes y el campo. Al perder el foco, `window.scrollTo(0, 0)`.

### D13. Horizontal: primero el vídeo, panel lateral y controles que se ocultan

```
┌──────────────────────────────────────────┬─────────────────┐
│ ● EN DIRECTO 23             [chat] [ ⛶ ] │ [mano]│[H][A][… │
│            ESCENA (encaja 16:9)          │ chat…           │
│ [mano]                                   │ [Escribe…] [ > ]│
└──────────────────────────────────────────┴─────────────────┘
        columna 1fr, fondo negro              panel clamp(260px, 36vw, 380px)
```

- **Escena encajada en ambos ejes** con unidades de contenedor: `container-type: size` y `width: min(100cqw, 100cqh * 16 / 9)`. `object-fit: contain` no sirve, porque los recuadros de esquina y el botón de teatro se posicionan respecto al marco 16:9.
- **Panel oculto por defecto para quien sólo mira.** En un iPhone 15 horizontal, abrir el panel reduce el vídeo un 30 %. **Visible por defecto para quien emite**, porque sus controles viven ahí. No se persiste.
- **Controles superpuestos** (`useAutoHideChrome`, compartido con el reproductor):
  - indicador y conectados arriba a la izquierda;
  - conmutador del panel en el **mismo grupo** que el botón de teatro;
  - mano abajo a la izquierda.

  Se ocultan a los 3 s. No se ocultan con la pizarra en escena, porque ahí un toque pertenece al lienzo.

### D14. Pase de vídeo: controles por toque y pantalla completa que resincroniza

- **Controles.** `group-hover` no se dispara en táctil, así que un toque alterna la barra (silenciar y pantalla completa), que se oculta a los 3 s. El volumen se omite con `(hover: none)` por CSS: es modalidad de entrada, no disposición. iOS ignora `video.volume`.
- **Pantalla completa.**
  - Con `requestFullscreen` sobre el contenedor: se pide y, al resolverse, se intenta `screen.orientation.lock('landscape')`.
  - Sin ella (iPhone) y con `video.webkitEnterFullscreen`: se usa el reproductor nativo.
- **Resincronización al salir del reproductor nativo.** El reproductor nativo permite pausar y la corrección de deriva ignora los vídeos pausados. En `webkitendfullscreen`, se recoloca en la posición del servidor y se llama a `play()`.

### D15. El bloqueo de pantalla se amplía al asistente que está viendo

**Confirmado por el operador el 13/09/2026.**

La spec `host-screen-wake-lock` excluía a los asistentes porque «no operan nada». En móvil, quien ve una charla sin tocar la pantalla la ve apagarse: Agora pinta el vídeo remoto en `<video>` silenciados, y no se puede contar con que el navegador mantenga la pantalla encendida por ellos.

La condición es **«hay algo que ver»**:

- **Sala Agora:** vídeo remoto o contenido en escena, con el evento sin terminar.
- **Pase de vídeo:** desde el `seeked` inicial hasta el final o el error.

Aplica en cualquier disposición. El navegador lo suelta al ocultar la pestaña. Se reutiliza `useScreenWakeLock` sin cambios de lógica.

### D16. Aviso de orientación para quien emite en vertical

La orientación de captura queda fijada al activar la cámara por primera vez. En compacto vertical:

- **Host y co-presentador con la cámara apagada:** una línea sobre la fila de controles, «Gira el móvil antes de activar la cámara para emitir en horizontal».
- **Con la cámara encendida:** la etiqueta «Emitiendo en vertical», sólo en su vista. No pide recargar a mitad de evento.
- **Asistente de reunión:** sin aviso, porque su cuadrado recorta bien.

### D17. Constantes y textos

Todo número y texto va a `client/lib/constants.js`:

- las dos consultas;
- `LIVE_ROOM_STAGE_MAX_HEIGHT_RATIO = 0.5`, `LIVE_ROOM_KEYBOARD_SHRINK_RATIO = 0.75`, `LIVE_ROOM_CHROME_HIDE_MS = 3000` y `LIVE_ROOM_CHAT_STICK_THRESHOLD_PX = 48`;
- las dimensiones de la fila de cámaras y del panel;
- `LIVE_ROOM_COPY`.

El overlay de audio pasa de «Haz clic para activar el audio» a «Activar el audio».

### D18. Expulsión del chat por el admin

**No hace falta ningún permiso nuevo en el servidor.** `banFromChat` ya autoriza a `req.user.id === event.host_user_id || req.user.role === 'admin'`. `req.user` es la fila de `users` que passport carga en cada petición, así que el rol es el **actual**: un admin degradado a mitad de evento recibe 403 aunque su JWT diga lo contrario. El defecto está sólo en el cliente.

- **Quién ve el menú:** `canModerateChat = isHost || isAdmin`.
  - `isAdmin` sale de `useAuth()` en `EventDetail` (`user?.role === 'admin'`) y llega como prop a `AgoraLiveRoom` y `EventLiveRoom`. No se deriva de la sesión de asistente del admin, que es idéntica a la de cualquier asistente.
  - La petición ya lleva el JWT del admin: `apiRequest` añade la sesión guardada.
- **Sobre qué mensajes no aparece:**
  - los propios (`msg.identity === selfIdentity` en Agora, `msg.from.isLocal` en LiveKit);
  - los del host (`host-*`);
  - los de cualquier staff.
- **El staff pasa a estar en la presencia.** El cliente sólo protegía `coHost`, que existe en `broadcast`. En una reunión el admin es staff pero no co-presentador, así que el host veía el menú sobre él y el servidor contestaba 400. `publicPresence` añade `staff` (`is_staff = 1`), también en la reconexión, y el conjunto protegido pasa a ser `coHost || staff`. Revela quién es de la galería, lo mismo que ya revelaba `coHost` en una entrevista.
- **LiveKit incluido.** La acción del host existe allí y el endpoint ya bifurca por proveedor. Es una condición en `EventLiveRoom.js` y no se toca nada más de ese componente.
- **El admin que además es host** se comporta como host: la condición es la misma.
- **Traza.** Desde que dos roles pueden expulsar, `banFromChat` registra con `logger.info` `{ eventId, identity, actorUserId, actorRole }`. `actorRole` vale `'host'` si quien expulsa es el host, aunque sea también admin; si no, `'admin'`. No se escribe en BD.
- **Texto del 403:** «Solo el host o un administrador pueden expulsar del chat».
- **Fuera:** el botón en el panel de admin del evento, deshacer una expulsión (tampoco existe para el host) y el chat del pase de vídeo (sin moderación para nadie).

## Verificación en iPhone sin dispositivo

Las emulaciones de escritorio (Chrome DevTools, Responsively, Polypane) no reproducen la isla dinámica, el teclado virtual ni la barra de Safari. Hace falta WebKit sobre iOS. Por orden de preferencia:

1. **BrowserStack Live — recomendado.**
   - iPhones reales en la nube, con la isla dinámica en los modelos que la tienen.
   - Safari real, rotación de dispositivo y teclado del propio iPhone.
   - Acceso a sitios privados o de staging (BrowserStack Local), además de los públicos.
   - Prueba gratuita sin tarjeta de unos 30 minutos de Live; el plan más barato ronda los 19 $/mes (100 min). Suficiente para una sesión de verificación bien preparada.
2. **TestMu AI (antes LambdaTest).** Mismo tipo de servicio: iPhones reales, túnel para staging y 100 minutos gratuitos de por vida. Buena alternativa si se agota la prueba de BrowserStack.
3. **Appetize.io.** Simulador de iOS en el navegador, con 30 min/mes gratis. El simulador usa el WebKit real y emula las áreas seguras, pero no es un dispositivo: sirve para disposición, no para teclado ni rendimiento.

**Preparación:**

- Usar la URL pública de preproducción. `TestAccessGate` pedirá su contraseña en el dispositivo remoto.
- Tener ya activo un evento Agora de prueba, con el host conectado desde otro navegador, para no gastar minutos montándolo.

**Qué comprobar en el iPhone:**

1. **Vertical.** No hay scroll de página; al tocar el campo del chat no hay ampliación, el campo queda justo encima del teclado y tras enviar el teclado sigue abierto.
2. **Horizontal en un modelo con isla dinámica.** Ningún control ni texto bajo la isla, y la franja de ese lado es negra (confirma D6). Si la franja es blanca pero nada queda tapado, iOS no aplicó el cambio en caliente: es cosmético y se anota.
3. **Pase de vídeo.** Pantalla completa, pausa en el reproductor nativo y salida: vuelve sincronizado.

## Risks / Trade-offs

- **[iOS no aplica en caliente el cambio de `viewport-fit`]** → la sala funciona igual y en horizontal se ven las franjas de hoy, sin controles tapados (D6). Se comprueba en BrowserStack Live.
- **[Heurística de teclado con teclados flotantes o divididos en iPad]** → las filas no se pliegan, pero el campo sigue encima del teclado gracias a `--room-h`.
- **[`display: contents`]** → sin caja no hay medidas. Sincronía de altura sólo en escritorio y envoltorios sin rol.
- **[Teatro y consola dentro del contexto `z-40`]** → en compacto los avisos globales `z-50` se ven por encima. En pantalla completa nativa no se nota.
- **[15 cámaras en un móvil]** → se reciben y facturan todas. Cambio futuro anotado.
- **[Reversión de la exclusión del bloqueo]** → acotada a «hay algo que ver» y liberada al ocultar la pestaña.
- **[Admin con el rol retirado a mitad de evento]** → el `user` de `localStorage` sigue diciendo `admin`, así que ve el menú, pero el servidor responde 403 porque lee el rol de la BD. No expulsa a nadie.
- **[`staff` en la presencia]** → los asistentes pueden saber quién es de la galería, como ya ocurría con `coHost` en `broadcast`.
- **[`EventLiveRoom.js` fuera del resto del cambio]** → se toca una sola condición, con verificación manual propia.
- **[`AgoraLiveRoom.js` ya tiene 1912 líneas]** → las presentaciones nuevas viven en `client/components/events/`.
- **[Sin runner de tests en `client/`]** → verificación manual con matriz explícita. La moderación del admin tiene tests de API y de socket.

## Migration Plan

1. Desplegar api y cliente juntos con `./deploy/deploy.sh`. El campo `staff` de la presencia es aditivo: un cliente antiguo lo ignora y uno nuevo sin él protege sólo `coHost`, como hoy.
2. Sin flag ni migración de datos.
3. Reversión: revertir el commit y redesplegar.

## Open Questions

1. **¿iOS aplica en caliente `viewport-fit`?** No bloquea: la decisión está tomada (D6) y el fallo es cosmético. Se verifica en BrowserStack Live.
2. **¿Chrome Android rota los fotogramas de una pista de cámara ya creada al girar el móvil?** Si lo hiciera, el texto del aviso de D16 cambia.
3. **Dejar de suscribir el vídeo de las cámaras fuera de la fila en `meeting`:** anotado como cambio futuro (13/09/2026).
4. **¿Chrome ya mantiene la pantalla encendida con el vídeo de Agora?** Si fuera así, D15 es redundante pero inocuo.
