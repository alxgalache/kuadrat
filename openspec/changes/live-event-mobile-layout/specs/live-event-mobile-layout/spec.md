## ADDED Requirements

### Requirement: Activación de la disposición compacta

La sala en directo de un evento `provider='agora'` (modos `broadcast` y `meeting`), renderizada por `client/components/AgoraLiveRoom.js`, y la vista de un evento `format='video'` activo, renderizada por `client/app/live/[slug]/EventDetail.js`, SHALL usar la **disposición compacta** cuando el viewport cumpla `LIVE_ROOM_COMPACT_QUERY` (`(max-width: 1023.98px), (max-height: 499.98px)`). Dentro de ella SHALL usar la **disposición horizontal** cuando además cumpla `LIVE_ROOM_LANDSCAPE_QUERY` (`(min-aspect-ratio: 11/10)`), y la **vertical** en otro caso.

Ambas consultas SHALL vivir en `client/lib/constants.js` y leerse únicamente a través de `client/hooks/useCompactRoomLayout.js`, que SHALL usar `useSyncExternalStore` con valor de servidor `false`. Ningún otro fichero SHALL repetir el criterio, ni en CSS ni en JS.

Mientras el campo de escribir del chat tenga el foco, el resultado SHALL congelarse: un cambio de las consultas se aplicará al perder el foco.

Fuera de la disposición compacta, la sala SHALL renderizarse exactamente como antes de este cambio. La sala LiveKit (`client/components/EventLiveRoom.js`) y la página previa o posterior al evento NO SHALL cambiar en ningún tamaño.

Todos los textos SHALL estar en es-ES en `LIVE_ROOM_COPY`, y todos los umbrales, proporciones y tiempos en `client/lib/constants.js`.

#### Scenario: Móvil en vertical

- **WHEN** un asistente entra en un evento Agora activo desde un móvil de 390 px de ancho en vertical
- **THEN** la sala se muestra en disposición compacta vertical

#### Scenario: Móvil girado

- **WHEN** ese asistente gira el móvil a horizontal
- **THEN** la sala pasa a la disposición horizontal sin recargar

#### Scenario: Escritorio

- **WHEN** un usuario abre la sala en una ventana de 1280 × 800 px
- **THEN** la vista es idéntica a la anterior al cambio: cabecera, escena, rejilla de participantes y chat lateral

#### Scenario: Tablet

- **WHEN** una tablet de 768 × 1024 px abre la sala en vertical
- **THEN** usa la disposición compacta vertical
- **AND** girada a 1024 × 768 px usa la vista de escritorio

#### Scenario: Evento LiveKit en móvil

- **WHEN** un asistente abre desde un móvil un evento activo con `provider='livekit'`
- **THEN** ve la sala LiveKit exactamente como antes de este cambio

#### Scenario: El teclado cambia el viewport mientras se escribe

- **WHEN** el campo del chat tiene el foco y el navegador reduce el viewport de layout lo bastante como para cambiar el resultado de las consultas
- **THEN** la disposición no cambia mientras dura el foco
- **AND** al perder el foco se aplica la disposición que corresponda

### Requirement: Contenedor de la sala a viewport completo

En disposición compacta, la sala SHALL renderizarse dentro de un contenedor `position: fixed` que cubra el viewport visible (`client/components/events/LiveRoomShell.js`), por encima de la navbar, el pie y el banner de newsletter.

- **Apilamiento:** `z-index` 40. Por debajo de los elementos globales de `z-50` (el `ConfirmDialog` «Evento finalizado», las notificaciones, el banner de cookies y el overlay «Activar audio»).
- **Desplazamiento:** el contenedor NO SHALL usar `transform`, para no alterar la referencia de sus descendientes `position: fixed`.
- **Bloqueo del documento:** mientras el contenedor compacto esté montado, el documento NO SHALL poder desplazarse. El contenedor SHALL poner el atributo `data-live-room` en `<html>`, y `client/app/globals.css` SHALL aplicar con él `overflow: hidden` y `overscroll-behavior: none` a `html` y a `body`. El atributo SHALL retirarse al desmontar la sala, al salir de la disposición compacta y al abandonar la página.
- **Cabecera de escritorio:** la de `EventDetail.js` (título, «En directo», número de asistentes) NO SHALL renderizarse en disposición compacta.

#### Scenario: Sin scroll de página

- **WHEN** un asistente en vertical desliza el dedo verticalmente sobre la escena o sobre la fila de participantes
- **THEN** nada se desplaza y la barra de direcciones del navegador no se oculta ni reaparece

#### Scenario: Tirar hacia abajo no recarga

- **WHEN** en Chrome para Android el asistente, con la lista del chat en su primer mensaje, tira hacia abajo
- **THEN** la página no se recarga y el asistente sigue en la sala

#### Scenario: Evento finalizado

- **WHEN** el host finaliza el evento con un asistente en disposición compacta
- **THEN** el diálogo «Evento finalizado» se muestra por encima de la sala

#### Scenario: El documento recupera el scroll al salir

- **WHEN** el asistente sale de la sala (expulsión, fin del evento o navegación)
- **THEN** `<html>` ya no tiene `data-live-room` y la página siguiente se desplaza con normalidad

### Requirement: Altura ajustada al área visible real

El contenedor compacto SHALL dimensionarse con `window.visualViewport`. `client/hooks/useLiveRoomViewport.js` SHALL escribir su alto y su `offsetTop` como las propiedades CSS `--room-h` y `--room-top` directamente sobre el nodo del contenedor, sin pasar por estado de React. Las actualizaciones SHALL agruparse por fotograma, en respuesta a `resize` y `scroll` de `visualViewport`.

Antes de la primera medición, o sin `visualViewport`, el alto SHALL ser `100dvh`, con `100vh` como respaldo para motores sin unidades dinámicas.

El resultado SHALL mantener todo el contenedor dentro del área visible:

- con la barra de direcciones arriba o abajo;
- al mostrarse u ocultarse las barras del navegador;
- con el teclado virtual abierto en iOS y en Android;
- en multiventana;
- tras una rotación.

#### Scenario: Barra de direcciones abajo en Chrome para Android

- **WHEN** un asistente con la barra de direcciones configurada abajo entra en la sala
- **THEN** el campo de escribir del chat queda completo e inmediatamente encima de la barra del navegador

#### Scenario: Rotación

- **WHEN** el asistente gira el dispositivo durante la emisión
- **THEN** el contenedor se ajusta al nuevo área visible sin recargar y sin scroll de página

#### Scenario: Teclado en iOS

- **WHEN** un asistente en Safari para iOS toca el campo del chat y aparece el teclado
- **THEN** el campo queda inmediatamente encima del teclado, visible y sin quedar tapado

### Requirement: Áreas seguras

Mientras el contenedor compacto esté montado, la etiqueta `<meta name="viewport">` SHALL incluir `viewport-fit=cover`. Al desmontarse, SHALL restaurarse el contenido original exacto de la etiqueta.

Los bordes siguientes SHALL aplicar `env(safe-area-inset-*)`, combinado con `max()` con su margen propio:

- el superior de la barra superior;
- el inferior del campo de escribir, salvo con el teclado abierto;
- el inferior de las hojas;
- en disposición horizontal, el izquierdo de la columna de la escena y el derecho del panel lateral;
- los controles y la banda del teatro;
- los bordes de la consola móvil del host y de su vista «Solo vídeo».

Ningún control interactivo ni texto SHALL quedar bajo el notch, la isla dinámica, el indicador de inicio de iOS ni la barra de navegación de Android.

#### Scenario: iPhone con isla dinámica en horizontal

- **WHEN** un asistente gira a horizontal un iPhone con isla dinámica
- **THEN** ningún control ni texto de la sala queda bajo la isla
- **AND** la franja junto a la escena se ve negra, continuación de su fondo

#### Scenario: Sitio añadido a la pantalla de inicio

- **WHEN** el asistente abre la sala desde el icono de la pantalla de inicio en un iPhone
- **THEN** el campo de escribir queda por encima del indicador de inicio

#### Scenario: El resto del sitio no cambia

- **WHEN** el asistente sale de la sala y navega a la galería
- **THEN** la etiqueta viewport vuelve a su contenido original, sin `viewport-fit=cover`

### Requirement: Barra superior

En disposición compacta vertical, el contenedor SHALL mostrar una barra superior de 44 px (`client/components/events/LiveRoomTopBar.js`) con:

- a la izquierda, el logo (`BrandLogo`), **sin enlace**;
- a la derecha, el indicador «EN DIRECTO» con un punto rojo;
- en las salas Agora, el número de conectados de la presencia de la sala (el mismo que muestra la cabecera del chat de escritorio), con etiqueta accesible «N conectados».

En la vista de un evento `format='video'` la barra NO SHALL mostrar número. La barra NO SHALL mostrar el título del evento ni otros controles. SHALL ocultarse en disposición horizontal y con el teclado abierto.

#### Scenario: Asistente en un stream

- **WHEN** un asistente entra en un stream Agora con 23 personas conectadas
- **THEN** la barra muestra el logo, «EN DIRECTO» y «23»

#### Scenario: El logo no saca de la sala

- **WHEN** el asistente toca el logo
- **THEN** no hay navegación y sigue en la sala

#### Scenario: Pase de vídeo

- **WHEN** un asistente con acceso entra en un evento de vídeo activo desde el móvil
- **THEN** la barra muestra el logo y «EN DIRECTO», sin número

### Requirement: Escena en disposición vertical

En disposición compacta vertical, la escena (`BroadcastStage` en `broadcast`, el recuadro destacado en `meeting` o `EventVideoPlayer` en el pase de vídeo) SHALL:

- ocupar todo el ancho del contenedor, sin esquinas redondeadas ni borde;
- conservar su marco 16:9;
- no superar `LIVE_ROOM_STAGE_MAX_HEIGHT_RATIO` (0,5) del alto del contenedor.

Cuando ese tope limite el alto, el marco 16:9 SHALL centrarse sobre fondo negro. Los recuadros de esquina, el botón de teatro y cualquier otro elemento superpuesto SHALL seguir posicionándose respecto al marco 16:9.

#### Scenario: Móvil en vertical

- **WHEN** un asistente mira un stream en un móvil de 393 px de ancho
- **THEN** la escena mide 393 × 221 px, a sangre

#### Scenario: El alto disponible se reduce

- **WHEN** el alto del contenedor se reduce hasta que el 16:9 a todo el ancho superaría la mitad del alto
- **THEN** la escena mide la mitad del alto, con su marco 16:9 centrado sobre fondo negro
- **AND** el recuadro de esquina sigue anclado a la esquina inferior derecha del vídeo, no del fondo

### Requirement: Fila de participantes con el botón de levantar la mano

En modo `broadcast` y disposición compacta, debajo de la escena, la sala SHALL mostrar una única fila de 60 px de alto:

- **Botón de mano (asistentes).** Para el asistente, que no es host ni co-presentador, la fila SHALL empezar por un botón de 44 × 44 px con el icono de mano y el mismo radio que los cuadrados. El botón SHALL quedar fijo a la izquierda, **fuera** del desplazamiento, separado de los cuadrados por un filete. Sus estados y colores SHALL ser los del botón de escritorio, y su etiqueta accesible «Levantar mano» o «Bajar mano».
- **Cuadrados de participantes.** A continuación, cuadrados de 44 × 44 px con:
  - la inicial, los colores y los anillos de escritorio;
  - las insignias de micrófono y de mano a 16 px, sin recortar;
  - el mismo orden que en escritorio: host primero para la audiencia, mano levantada priorizada y el propio al final con «(Tu)».
- **Desplazamiento.** Los cuadrados SHALL desplazarse horizontalmente dentro de la fila, sin barra de scroll visible y con `overscroll-behavior-x: contain`.
- **Nombres.** Los cuadrados NO SHALL llevar el nombre debajo. Cada uno SHALL exponerlo como etiqueta accesible.
- **Tocar.** Tocar un cuadrado SHALL abrir la hoja del participante (requisito «Hojas de la sala»). NO SHALL ejecutar directamente ninguna acción.
- **Host y co-presentador.** Para ellos la fila SHALL empezar directamente por los cuadrados, sin botón de mano.
- **Promovidos con vídeo.** Si hay asistentes promovidos publicando vídeo, SHALL mostrarse encima una fila propia de recuadros 16:9 de 64 px de alto, con desplazamiento horizontal. Sin ellos, esa fila no existe.

#### Scenario: Muchos participantes

- **WHEN** hay 30 participantes y el asistente desliza la fila
- **THEN** los cuadrados se desplazan y el botón de mano sigue visible a la izquierda

#### Scenario: Levantar la mano

- **WHEN** el asistente toca el botón de mano
- **THEN** el botón cambia a su estado ámbar y el host ve la mano levantada en su cuadrado

#### Scenario: El final de la fila no navega atrás

- **WHEN** en Chrome para Android el asistente sigue deslizando la fila más allá de su último cuadrado
- **THEN** el navegador no inicia la navegación hacia atrás

#### Scenario: El host no da la palabra por error

- **WHEN** el host toca el cuadrado de un asistente
- **THEN** se abre la hoja de ese participante con su nombre y «Dar la palabra»
- **AND** el asistente no ha sido promovido hasta que el host pulsa esa acción

### Requirement: Fila de cámaras de la reunión

En modo `meeting` y disposición compacta, **todos los roles, host incluido,** SHALL ver el recuadro destacado 16:9. Su contenido SHALL ser, por orden de prioridad:

1. la pizarra, si está activa;
2. la pantalla compartida del host;
3. la cámara del host (la propia, para el host) o el avatar con su inicial.

Debajo SHALL mostrarse una fila de cámaras **cuadradas 1:1** con los demás participantes (host excluido, el propio incluido y marcado «(Tu)»):

- **Tamaño:** `clamp(64px, 13 % del alto del contenedor, 104px)`.
- **Desplazamiento:** horizontal, con `overscroll-behavior-x: contain`.
- **Contenido de cada cuadrado:** vídeo recortado centrado (`fit: 'cover'`), nombre, insignia de micrófono y anillo de «hablando», como en escritorio.
- **Vídeo sólo en los visibles:** únicamente los cuadrados dentro del área visible de la fila, más un cuadrado de margen, SHALL montar `AgoraVideo`. El resto SHALL mostrar el avatar con la inicial.
- **Tocar:** tocar un cuadrado SHALL abrir la hoja del participante.

La rejilla de 5 columnas de escritorio no cambia.

#### Scenario: Reunión con 15 asistentes

- **WHEN** un asistente abre una reunión con 15 participantes desde un móvil en vertical
- **THEN** ve al host destacado arriba y a los participantes en una fila de cámaras cuadradas que se desliza horizontalmente

#### Scenario: Cámaras fuera de la fila visible

- **WHEN** la fila tiene más cámaras de las que caben en el ancho
- **THEN** los cuadrados fuera del área visible, más allá del margen de un cuadrado, no contienen ningún elemento de vídeo
- **AND** al deslizarlos hasta el área visible pasan a mostrar su vídeo

#### Scenario: El host en el móvil

- **WHEN** el host de una reunión, sin pantalla ni pizarra, está en disposición compacta
- **THEN** ve su propia cámara en el recuadro destacado y a los participantes en la fila

#### Scenario: El host silencia a un participante

- **WHEN** el host toca el cuadrado de un participante y pulsa «Silenciar micrófono» en la hoja
- **THEN** el micrófono de ese participante queda silenciado para todos

### Requirement: Fila de controles compacta

En disposición compacta, quien tenga controles propios SHALL disponer de una única fila de 52 px, debajo de la fila de participantes o de cámaras, con botones de icono de 44 × 44 px. Cada botón SHALL llevar `aria-label` en es-ES, `aria-pressed` cuando alterne y `touch-action: manipulation`.

| Rol | Botones |
|---|---|
| Asistente de reunión | Micrófono, Cámara, «Más» |
| Host (`broadcast` y `meeting`) | Micrófono; Cámara; Pantalla, solo si `screenShareSupported`; Pizarra, solo si la pizarra está disponible; «Más»; y fijo a la derecha, fuera del desplazamiento de los iconos, un botón rojo «Finalizar» con etiqueta accesible «Finalizar stream» o «Finalizar evento» |
| Co-presentador | Micrófono, Cámara, «Más» |
| Asistente de `broadcast` | Sin fila de controles |

- **Estado apagado:** micrófono y cámara apagados SHALL distinguirse en rojo; encendidos, en neutro.
- **Origen del estado y las acciones:** para host y co-presentador, la **única** instancia de `useHostMediaControls` de `AgoraLiveRoom`; para el asistente de reunión, la de `MeetingSelfControls`. No SHALL existir una segunda copia de esa lógica.
- **Errores:** los de dispositivo o de efecto SHALL mostrarse en una línea sobre la fila, sólo mientras existan.
- **Confirmación de «Finalizar»:** SHALL ser una confirmación propia del contenedor (`client/components/events/InlineConfirm.js`, extraída de `HostConsole`).

#### Scenario: Asistente de reunión activa el micrófono

- **WHEN** un asistente de reunión toca el botón de micrófono
- **THEN** su micrófono se activa y el botón pasa al estado encendido

#### Scenario: El host finaliza desde el móvil

- **WHEN** el host toca «Finalizar stream»
- **THEN** aparece una confirmación dentro de la sala
- **AND** al confirmar, el evento termina para todos

#### Scenario: Navegador sin compartir pantalla

- **WHEN** el host usa un navegador sin `getDisplayMedia`
- **THEN** la fila no muestra el botón de pantalla
- **AND** la hoja «Más» muestra «Pantalla» deshabilitada con el motivo

### Requirement: Hojas de la sala

Toda interfaz secundaria de la disposición compacta SHALL presentarse como hoja inferior (`client/components/events/LiveRoomSheet.js`). Cada hoja SHALL:

- ser hija del contenedor de la sala y NO un portal a `document.body`;
- tener fondo y panel anclado abajo, con alto máximo del 70 % del contenedor, desplazamiento interno y margen inferior de área segura;
- llevar `role="dialog"`, `aria-modal="true"`, título y botón «Cerrar» de 44 px;
- cerrarse al tocar el fondo y con Escape;
- mover el foco a su interior al abrirse y devolverlo al elemento que la abrió al cerrarse.

Como máximo SHALL haber una hoja abierta. Un cambio de disposición SHALL cerrarla.

Contenido:

- **«Más» del host:**
  - Micrófono, Cámara y Altavoz, con su fuente. Altavoz deshabilitado con «La gestiona el sistema» si no hay salidas.
  - Pantalla, deshabilitada con «No disponible en este navegador» cuando no está soportada.
  - Calidad, si `selectVideoQuality` existe.
  - Efectos, si están soportados.
  - «Todos escriben», en reunión con la pizarra activa.
  - «Vista del host», si el evento tiene `allow_mobile_host_console`.
- **«Más» del co-presentador:** Micrófono, Cámara, Altavoz y disposición de cámaras; esta última bloqueada con su aviso si hay contenido en escena.
- **«Más» del asistente de reunión:** Micrófono, Cámara, Altavoz y Efectos, si están soportados.
- **Participante:**
  - nombre completo y estado: host, co-presentador, hablando, silenciado o con la mano levantada;
  - las acciones del rol de quien mira: el host sobre un asistente de `broadcast`, «Dar la palabra» o «Quitar la palabra»; el host sobre un asistente de reunión, «Silenciar micrófono»; el propio participante con la palabra y el micrófono abierto, «Silenciar mi micrófono»;
  - sin acciones sobre el host ni sobre un co-presentador.
- **Mensaje de chat, para quien puede moderar el chat** (el host o un admin, ver `event-chat-admin-moderation`): nombre del remitente y «Expulsar del chat». No SHALL ofrecerse sobre mensajes propios, del host ni de ningún miembro del staff.

La elección de fuente SHALL usar la lista de filas grandes de `MobileDevicePicker`, sobre los mismos datos y funciones de cambio.

#### Scenario: El host cambia de micrófono

- **WHEN** el host abre «Más», toca «Micrófono» y elige otro dispositivo
- **THEN** la pista publicada cambia de dispositivo sin cortar la emisión y la lista marca el nuevo como activo

#### Scenario: Un asistente mira quién es un participante

- **WHEN** un asistente toca el cuadrado de otro participante
- **THEN** la hoja muestra su nombre completo y su estado, sin ninguna acción

#### Scenario: El host expulsa del chat

- **WHEN** el host toca el menú de un mensaje y pulsa «Expulsar del chat»
- **THEN** el remitente queda expulsado del chat, como desde la vista de escritorio

#### Scenario: Cierre con teclado

- **WHEN** en una ventana de escritorio estrecha la hoja está abierta y se pulsa Escape
- **THEN** la hoja se cierra y el foco vuelve al botón que la abrió

### Requirement: Chat con scroll interno y campo de escribir abajo

En disposición compacta, el chat SHALL ocupar todo el alto restante del contenedor. Sólo su lista de mensajes SHALL desplazarse, con `overscroll-behavior-y: contain`. El campo de escribir SHALL ser la última fila del contenedor, siempre visible abajo, y NO SHALL usar `position: fixed` propio. La cabecera «Chat · N conectados» NO SHALL mostrarse, porque el número está en la barra superior.

El campo (`client/components/events/chat/ChatComposer.js`, compartido por el chat de Agora y el del pase de vídeo) SHALL:

- usar `font-size` de 16 px en disposición compacta;
- declarar `enterkeyhint="send"`;
- tener un botón de enviar de icono de 44 px con `aria-label` «Enviar», que NO SHALL quitar el foco al campo, de modo que el teclado siga abierto tras enviar.

El aviso de expulsión del chat SHALL sustituir al campo como hoy.

#### Scenario: Enviar deja el teclado abierto

- **WHEN** un asistente escribe un mensaje y toca el botón de enviar
- **THEN** el mensaje se envía, el campo queda vacío y el teclado sigue abierto

#### Scenario: Sin ampliación al enfocar en iOS

- **WHEN** un asistente en Safari para iOS toca el campo del chat
- **THEN** la página no se amplía

#### Scenario: Desplazar los mensajes no mueve la sala

- **WHEN** el asistente desliza la lista de mensajes hasta su principio y sigue deslizando
- **THEN** la escena y la barra superior no se mueven

### Requirement: Autodesplazamiento del chat

En **todas** las disposiciones, escritorio incluido, y tanto en el chat de las salas Agora como en el del pase de vídeo, la lista SHALL desplazarse al último mensaje sólo si:

- el usuario está a `LIVE_ROOM_CHAT_STICK_THRESHOLD_PX` (48 px) o menos del final, o
- el mensaje nuevo es suyo.

En otro caso SHALL mostrar un botón «Mensajes nuevos» que desplaza al final y desaparece. El desplazamiento SHALL afectar sólo a la lista, nunca al documento. La lógica SHALL vivir en `client/hooks/useChatAutoScroll.js`.

#### Scenario: Leyendo mensajes antiguos

- **WHEN** un usuario ha subido en el chat y llegan mensajes nuevos
- **THEN** su posición de lectura no cambia y aparece «Mensajes nuevos»

#### Scenario: Siguiendo la conversación

- **WHEN** el usuario está al final de la lista y llega un mensaje
- **THEN** la lista muestra el nuevo mensaje

#### Scenario: Mensaje propio

- **WHEN** un usuario que había subido en el chat envía un mensaje
- **THEN** la lista baja hasta su mensaje

#### Scenario: El chat del pase de vídeo no mueve la página

- **WHEN** llega un mensaje en el chat de un evento de vídeo en escritorio
- **THEN** la página no se desplaza

### Requirement: Teclado virtual abierto

Se SHALL considerar el teclado abierto cuando se cumplan las dos condiciones:

- el campo del chat tiene el foco;
- el alto de `visualViewport` es menor que `LIVE_ROOM_KEYBOARD_SHRINK_RATIO` (0,75) por el máximo alto observado desde el último cambio de orientación.

Mientras esté abierto:

- el contenedor SHALL llevar `data-keyboard="open"`;
- la barra superior, la fila de participantes, la fila de cámaras y la fila de controles SHALL ocultarse;
- la escena SHALL seguir visible con su tope de alto;
- el campo SHALL quedar inmediatamente encima del teclado, sin margen inferior de área segura.

Al perder el foco, la disposición SHALL restaurarse y el documento volver a `scrollY = 0`. El foco sin reducción de alto (teclado físico) NO SHALL plegar nada.

#### Scenario: Escribir en vertical

- **WHEN** un asistente en un iPhone en vertical toca el campo del chat
- **THEN** ve la escena reducida, los últimos mensajes y el campo encima del teclado
- **AND** la barra superior y las filas no se muestran

#### Scenario: Teclado físico en una tablet

- **WHEN** un usuario de tablet con teclado físico enfoca el campo y el alto visible no se reduce
- **THEN** la barra superior y las filas siguen visibles

#### Scenario: Cerrar el teclado

- **WHEN** el asistente cierra el teclado
- **THEN** reaparecen la barra superior y las filas, sin desplazamiento residual del documento

### Requirement: Disposición horizontal

En disposición compacta horizontal NO SHALL mostrarse la barra superior. El contenedor SHALL tener dos columnas:

- **Columna de la escena:** fondo negro, con el marco 16:9 encajado en el ancho y en el alto disponibles mediante unidades de contenedor.
- **Panel lateral:** ancho `clamp(260px, 36vw, 380px)`, con las filas de participantes, cámaras y controles, y el chat.

**Visibilidad del panel.** El panel SHALL poder mostrarse y ocultarse:

- oculto por defecto para el asistente de `broadcast` y para el asistente de un pase de vídeo;
- visible por defecto para el host, el co-presentador y los participantes de una reunión;
- ese valor por defecto se SHALL aplicar en cada entrada en horizontal, sin persistirse.

Con el panel oculto, la escena SHALL ocupar toda la columna.

**Controles superpuestos** sobre la escena:

- arriba a la izquierda, el indicador «EN DIRECTO» y los conectados;
- arriba a la derecha, en el mismo grupo que el botón de teatro, el conmutador del panel, con `aria-expanded` y etiqueta «Mostrar chat» u «Ocultar chat»;
- abajo a la izquierda, el botón de mano para el asistente de `broadcast` mientras el panel está oculto.

Los controles superpuestos SHALL ocultarse tras `LIVE_ROOM_CHROME_HIDE_MS` (3000 ms) sin interacción y mostrarse al tocar la escena. NO SHALL ocultarse mientras la pizarra esté en escena, y la mano levantada SHALL permanecer visible.

#### Scenario: El asistente gira el móvil

- **WHEN** un asistente de un stream gira el móvil a horizontal
- **THEN** la escena ocupa todo el alto con el panel oculto

#### Scenario: Abrir el chat en horizontal

- **WHEN** el asistente toca «Mostrar chat»
- **THEN** el panel aparece a la derecha con la fila de participantes y el chat, y la escena se reduce para caber a su lado

#### Scenario: El host gira el móvil

- **WHEN** el host gira el móvil a horizontal
- **THEN** el panel lateral aparece visible con sus controles

#### Scenario: Los controles se ocultan

- **WHEN** pasan 3 s sin tocar la pantalla
- **THEN** los controles superpuestos se ocultan
- **AND** un toque sobre la escena los vuelve a mostrar

#### Scenario: Pizarra en horizontal

- **WHEN** la pizarra está en escena en disposición horizontal
- **THEN** los controles superpuestos permanecen visibles y un toque en el lienzo no los alterna

### Requirement: Pase de vídeo pregrabado en disposición compacta

Un evento `format='video'` activo con acceso SHALL usar en disposición compacta el mismo contenedor, con:

- la barra superior sin número;
- `EventVideoPlayer` como escena;
- el chat, con los requisitos del chat y del teclado;
- sin fila de participantes ni de controles.

En horizontal SHALL aplicar la disposición horizontal, con el panel oculto por defecto y sin botón de mano.

**Controles del reproductor en táctil.** En dispositivos sin `hover`:

- un toque sobre el vídeo SHALL mostrar u ocultar la barra de controles (silenciar y pantalla completa), que SHALL ocultarse sola tras 3 s;
- el control deslizante de volumen NO SHALL renderizarse, porque iOS ignora `video.volume`.

Con `hover` el comportamiento SHALL ser el actual. El aviso de sonido silenciado no cambia.

**Pantalla completa.** SHALL pedirse sobre el contenedor del reproductor y, al concederse, intentar bloquear la orientación en horizontal.

**Reproductor nativo de iPhone.** Si no existe pantalla completa de elementos y el vídeo expone `webkitEnterFullscreen`, SHALL usarse el reproductor nativo. Al recibir `webkitendfullscreen`, SHALL recolocarse en la posición calculada con la hora del servidor y reanudarse la reproducción si estaba en pausa.

NO SHALL añadirse controles de pausa ni de búsqueda.

#### Scenario: Controles por toque

- **WHEN** un asistente toca el vídeo en un móvil
- **THEN** aparece la barra con silenciar y pantalla completa, sin control de volumen
- **AND** desaparece a los 3 s sin interacción

#### Scenario: Pantalla completa en Android

- **WHEN** el asistente toca pantalla completa en Chrome para Android
- **THEN** el vídeo pasa a pantalla completa en horizontal

#### Scenario: Pausa en el reproductor nativo del iPhone

- **WHEN** en un iPhone el asistente entra en pantalla completa, pausa en el reproductor nativo y sale
- **THEN** el vídeo se recoloca en la posición común de todos los asistentes y sigue reproduciéndose

### Requirement: Orientación del teatro en disposición compacta

En disposición compacta, al abrir el modo teatro, la sala SHALL intentar `screen.orientation.lock('landscape')` una vez resuelta la pantalla completa nativa, y SHALL liberar la orientación al salir. Cualquier fallo de ambas llamadas SHALL ignorarse. Donde no hay pantalla completa de elementos (iPhone), el teatro SHALL seguir funcionando como superposición, como hoy.

#### Scenario: Teatro en Android

- **WHEN** un asistente en Chrome para Android abre el teatro desde la vertical
- **THEN** la escena pasa a pantalla completa en horizontal
- **AND** al salir del teatro la orientación queda libre

#### Scenario: Teatro en iPhone

- **WHEN** un asistente en un iPhone abre el teatro
- **THEN** la superposición ocupa el viewport sin errores

### Requirement: Aviso de orientación para quien emite en vertical

En disposición compacta vertical, el host (en `broadcast` y en `meeting`) y el co-presentador SHALL ver:

- con la cámara apagada, una línea sobre la fila de controles: «Gira el móvil antes de activar la cámara para emitir en horizontal»;
- con la cámara encendida, la etiqueta «Emitiendo en vertical» sobre su propia escena.

Ninguno de los dos avisos SHALL mostrarse en disposición horizontal, a los asistentes de reunión ni a la audiencia.

#### Scenario: Host en vertical antes de empezar

- **WHEN** el host entra en la sala con el móvil en vertical y la cámara apagada
- **THEN** ve el aviso para girar el móvil antes de activarla

#### Scenario: Host en horizontal

- **WHEN** el host gira el móvil a horizontal
- **THEN** no se muestra ningún aviso de orientación

#### Scenario: La audiencia no ve el aviso

- **WHEN** el host emite en vertical
- **THEN** los asistentes no ven ninguna etiqueta de orientación

### Requirement: Estado conservado al cambiar de disposición

La sala SHALL construirse como **un único árbol de React** en todas las disposiciones. Pasar de escritorio a compacta, de vertical a horizontal, abrir o cerrar el teclado, o mostrar u ocultar el panel lateral SHALL cambiar sólo clases, áreas de rejilla y elementos hermanos condicionales. Por tanto, esos cambios NO SHALL:

- desmontar `TheaterShell`, `BroadcastStage` ni la pizarra, que SHALL conservar su sesión de fastboard;
- interrumpir las pistas publicadas ni el audio remoto;
- perder mensajes del chat.

#### Scenario: Girar con la pizarra activa

- **WHEN** el host tiene la pizarra activa con permiso de escritura y gira el móvil
- **THEN** la pizarra sigue conectada y con permiso de escritura, sin volver a unirse a su sala

#### Scenario: El host gira mientras emite

- **WHEN** el host gira el móvil con la cámara y el micrófono publicados
- **THEN** los asistentes no perciben ningún corte

#### Scenario: Estrechar la ventana de escritorio

- **WHEN** un asistente estrecha la ventana del navegador por debajo de 1024 px durante el directo
- **THEN** la sala pasa a disposición compacta sin reconectar y con el historial del chat intacto
