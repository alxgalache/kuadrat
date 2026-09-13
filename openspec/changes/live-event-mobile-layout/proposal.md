# Vista móvil de las salas en directo (y expulsión del chat por el admin)

## Why

Las salas en directo están maquetadas para escritorio y en un móvil se comportan como una página web larga, no como una aplicación. En vertical se apilan la navbar global, el título del evento, la escena, una rejilla de participantes que envuelve en varias líneas, los controles, un botón de mano suelto y un chat cuya altura copia la del bloque de vídeo. La página hace scroll y eso trae varios problemas:

- la barra del navegador aparece y desaparece, y el layout salta;
- el campo del chat queda bajo el pliegue y el teclado lo tapa;
- tirar hacia abajo recarga la página y saca al usuario del directo;
- los menús de moderación y de dispositivos están pensados para ratón (`title` como única pista, iconos de 14 px, desplegables `top-full` que se abren fuera de la pantalla) y no se pueden usar con el dedo.

El modo `meeting` fija además en su spec «filas de 5 tiles cuadrados en todos los tamaños, móvil incluido»: con 16 cámaras, en un móvil son cuatro filas de recuadros de ~70 px con el chat debajo a `60vh`. En los pases de vídeo pregrabado los controles sólo aparecen con `hover`, que no existe en una pantalla táctil, y el chat mide `calc(56.25vw * 0.6)`.

El público llega a los eventos desde enlaces que se abren en el móvil, y hoy esa es la peor experiencia de la sala.

Por petición del operador, el cambio incluye además una corrección ajena al móvil. **El admin que entra en un evento no puede expulsar a nadie del chat, aunque la API ya se lo permite**: el menú del mensaje sólo se pinta para el host.

## What Changes

### Disposición compacta (nueva, sin flag)

- **Cuándo se activa.** Por debajo de **1024 px de ancho o 500 px de alto**, la sala de un evento Agora (`broadcast` y `meeting`) y la de un pase de vídeo pasan a una **disposición compacta tipo aplicación**: un contenedor que ocupa exactamente el área visible, sin scroll de documento. **Por encima del umbral no cambia nada.**
- **Estructura en vertical**, de arriba abajo:
  - barra superior con el logo de 140d, «EN DIRECTO» y el número de conectados;
  - escena a sangre en 16:9;
  - las filas propias del modo;
  - chat con scroll interno y el campo de escribir siempre abajo.
- **Altura real y no teórica.** El contenedor se dimensiona con `window.visualViewport`, así que absorbe:
  - la barra de direcciones arriba o abajo (Chrome Android permite las dos) y su aparición y desaparición;
  - el teclado virtual en iOS y en Android;
  - la multiventana y las rotaciones.
- **Áreas seguras.** Mientras la sala está montada se activa `viewport-fit=cover` y se aplican márgenes `env(safe-area-inset-*)`, para que nada quede bajo la isla dinámica o el notch, el indicador de inicio de iPhone o la barra de gestos de Android. El resto del sitio no cambia. Como no hay un iPhone físico, se verifica tras implementar en un iPhone real en la nube (ver `design.md`, «Verificación en iPhone sin dispositivo»).
- **Stream (`broadcast`).** Debajo de la escena, una sola fila con los cuadrados de los participantes y scroll horizontal propio. El botón de levantar la mano va **fijo a la izquierda** de esa fila, fuera del scroll, con el mismo tamaño y radio que los cuadrados.
- **Reunión (`meeting`).** La escena muestra al host, su pantalla o la pizarra. Debajo, una fila horizontal de **cámaras cuadradas 1:1** dimensionadas en función del alto disponible. Después, una fila mínima de controles con botones de icono de 44 px.
- **Host y co-presentador.** La misma vista que la audiencia, con una fila de controles de icono (micrófono, cámara, pantalla, pizarra, «Finalizar»). Todo lo secundario va a una **hoja inferior «Más»**: fuentes, altavoz, calidad, efectos, «Todos escriben», disposición de cámaras y acceso a la consola móvil existente.
- **Horizontal.** Primero el vídeo:
  - la escena encaja al alto y el chat pasa a un panel lateral que se muestra y oculta;
  - unos controles superpuestos (indicador, mano, chat) se ocultan solos a los 3 s;
  - el panel está oculto por defecto para quien sólo mira y visible para quien emite.
- **Tocar en vez de pasar el ratón.** Tocar un participante, un mensaje o una cámara abre una hoja con el nombre y las acciones que correspondan al rol. Sustituye al clic directo, a los menús de tres puntos y a la información que sólo estaba en `title`.

### Añadido por el análisis (no estaba en la petición)

- **Teclado virtual.** Mientras se escribe se ocultan la barra y las filas, y la escena se reduce a la mitad del alto que queda, de modo que siguen visibles el vídeo, los últimos mensajes y el campo. El campo usa 16 px, porque iOS amplía la página con cualquier `<input>` menor y esa ampliación rompe el contenedor fijo. Enviar no cierra el teclado.
- **Gestos que sacan del directo.** Se anulan:
  - tirar para recargar (`overscroll-behavior` en el documento);
  - el deslizamiento horizontal al final de la fila de participantes, que en Chrome Android navega hacia atrás;
  - el doble toque que amplía (`touch-action: manipulation`).
- **Autodesplazamiento del chat.** Hoy salta al último mensaje con cada mensaje nuevo, lo que en un chat activo impide leer hacia atrás con el dedo. Ahora sólo sigue al final si el usuario ya estaba abajo y, si no, ofrece «Mensajes nuevos». Aplica también en escritorio, porque es el mismo componente.
- **La pantalla del asistente se apaga a mitad de charla.** El vídeo remoto de Agora se reproduce en elementos `<video>` silenciados, y no se puede contar con que el navegador mantenga la pantalla encendida por ellos. `useScreenWakeLock` se amplía a los asistentes **mientras hay algo que ver**: vídeo en escena, pizarra o pase de vídeo reproduciéndose. **Revierte una decisión documentada**, confirmado por el operador el 13/09/2026: la exclusión se justificaba en que «un asistente no opera nada», pero ver vídeo es precisamente cuando la pantalla tiene que seguir encendida.
- **Quien emite desde un móvil en vertical publica vídeo vertical.** La orientación de captura queda fijada al activar la cámara la primera vez, así que en vertical se avisa de girar el móvil antes de encenderla.
- **Pantalla completa.** El teatro intenta bloquear la orientación en horizontal en Android. En iPhone, donde no existe la pantalla completa de elementos, el pase de vídeo usa el reproductor nativo y **se resincroniza al salir**: ese reproductor permite pausar y la corrección de deriva ignora los vídeos pausados.
- **Controles del pase de vídeo en táctil.** Un toque los muestra y se ocultan a los 3 s. Se quita el volumen en dispositivos sin `hover`, porque iOS ignora `video.volume`.

### Expulsión del chat por el admin (añadido a petición del operador)

- **Qué se amplía.** El admin que está en la sala de un evento dispone sobre los mensajes del chat del **mismo menú «Expulsar del chat» que el host**, con la misma acción y el mismo efecto. Aplica a Agora `broadcast` (como co-presentador), a Agora `meeting` y a LiveKit, porque la acción del host existe en los tres. El chat del pase de vídeo no tiene moderación ni para el host, y sigue igual.
- **La acción manual del host es la expulsión del chat.** El participante sigue viendo el directo pero no puede escribir. La expulsión automática por *flood* es otra cosa: además registra el ban por email e IP. Al admin se le da exactamente la acción manual.
- **La API ya lo permitía y no cambia de contrato.** `ban-from-chat` acepta al host o a un usuario con rol `admin`, tomado de la fila de `users` en cada petición. Sólo se corrige el texto del 403, que decía «Solo el host puede expulsar del chat», y se añade una traza con quién expulsó.
- **El menú no se ofrece** sobre mensajes propios, del host ni del **staff**. Hoy el cliente sólo protege al co-presentador (`coHost`, que sólo existe en `broadcast`), así que en una reunión el host veía el menú sobre el admin y el servidor respondía 400. La presencia de la sala pasa a exponer `staff` para cerrar ese hueco.

## Capabilities

### New Capabilities

- `live-event-mobile-layout`: disposición compacta de las salas en directo Agora y de los pases de vídeo. Cubre:
  - criterio de activación, contenedor a viewport visible y áreas seguras;
  - barra superior y escena;
  - fila de participantes con la mano y fila de cámaras de reunión;
  - fila de controles y hojas inferiores;
  - chat con su campo abajo, su autodesplazamiento y el teclado;
  - disposición horizontal y pase de vídeo en táctil;
  - orientación del teatro y aviso de orientación a quien emite;
  - conservación del estado al cambiar de disposición.
- `event-chat-admin-moderation`: menú «Expulsar del chat» para el admin en las salas Agora y LiveKit, autorización y traza del endpoint, e identificación del staff en la presencia para no ofrecer el menú sobre sus mensajes.

### Modified Capabilities

- `agora-streaming-provider`:
  - La paridad de la sala `broadcast` con LiveKit pasa a describir la disposición de escritorio; en compacto rige la nueva capacidad.
  - La rejilla de «5 cuadrados en todos los tamaños, móvil incluido» de `meeting` pasa a ser sólo de escritorio.
  - El selector de dispositivos del host se presenta en compacto como lista táctil en la hoja «Más».
  - El chat conserva el menú del host **y del admin** y cambia su autodesplazamiento.
  - La moderación del chat se abre al admin.
- `agora-broadcast-cohost`: el co-presentador, que es siempre admin, gana el menú «Expulsar del chat» fuera de su lista cerrada de controles de medios. En el cliente, la protección del staff frente a ese menú deja de limitarse al co-presentador.
- `agora-host-mobile-console`: el modo `full` pasa a ser «la vista normal de la sala», que en pantallas pequeñas es la disposición compacta, y allí el conmutador de modo vive en la hoja «Más». La lógica de controles sigue siendo una, con una presentación más.
- `agora-virtual-background`: en compacto, «Efectos» es una entrada de la hoja «Más» en lugar de un desplegable junto a la cámara. La exclusión en móviles no cambia.
- `host-screen-wake-lock`: la exclusión de los asistentes se limita a cuando no hay nada que ver, y se añade el requisito del bloqueo para quien está viendo el evento.

## Impact

### Capas

- **Frontend (`client/`):** casi todo el cambio.
- **Backend (`api/`):** mínimo.
  - `api/socket/eventSocket.js`: campo `staff` en la presencia.
  - `api/controllers/eventController.js`: texto del 403 y traza de `banFromChat`.
  - Tests nuevos en `api/tests/`.
- **Sin cambios:** esquema de BD, endpoints, variables de entorno, variables `NEXT_PUBLIC_*` y CSP.
- **Sin dependencias nuevas:** `@headlessui/react` y `@heroicons/react` ya están instalados, y las hojas no usan portales.

### Ficheros

- **Modificados en el cliente:**
  - `client/app/live/[slug]/EventDetail.js`
  - `client/components/AgoraLiveRoom.js`
  - `client/components/EventLiveRoom.js` (**solo** la condición del menú de expulsión)
  - `client/components/events/BroadcastStage.js`, `CoHostControls.js`, `HostConsole.js`, `VideoEffectsMenu.js` y `MobileDevicePicker.js`
  - `client/components/EventVideoPlayer.js`
  - `client/hooks/useScreenWakeLock.js`
  - `client/lib/constants.js`
  - `client/app/globals.css`: global, con reglas acotadas por atributo.
- **Nuevos:** hooks de disposición, viewport, documento, autodesplazamiento del chat y controles que se ocultan solos. Componentes de contenedor, barra superior, hoja, confirmación en línea, filas compactas, barra de controles, controles superpuestos en horizontal y campo de chat compartido. Todos en `client/hooks/` y `client/components/events/`.
- **Sin tocar:**
  - la vista y el comportamiento de LiveKit, salvo la condición del menú;
  - `LayoutWrapper`, `Navbar` y el `viewport` del layout raíz;
  - la página previa y la posterior al evento.

### Despliegue y verificación

- **Despliegue:** api y cliente con `./deploy/deploy.sh`. No hay migración ni flag. La reversión es revertir el commit.
- **Verificación:** la moderación por el admin tiene tests de API y de socket. `client/` no tiene runner de tests: la vista compacta se verifica a mano. El iPhone se prueba en la nube (BrowserStack Live) y Android en dispositivo o emulación, con la matriz de `tasks.md`.

## Non-goals

- **LiveKit en móvil:** `EventLiveRoom.js` conserva su vista actual en todos los tamaños. Sólo gana el menú de expulsión para el admin.
- **La página previa y posterior al evento** (portada, precio, «Acceder»), el modal de acceso y el registro.
- **Rediseñar la vista de escritorio.**
- **Dejar de recibir el vídeo de las cámaras fuera de la fila en `meeting`** (ancho de banda y factura de Agora). Anotado como cambio futuro por el operador el 13/09/2026.
- **Expulsar del chat desde el panel de admin del evento**, deshacer una expulsión o moderar el chat del pase de vídeo.
- **Otros:**
  - imagen dentro de imagen, audio en segundo plano o aviso de instalación como aplicación;
  - adaptar la barra de la pizarra a teléfonos;
  - cambiar la consola móvil del host más allá de sus márgenes de área segura.
