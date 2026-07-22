# Tasks: refine-agora-fullscreen-and-grid

## 1. Grid meeting 5 columnas cuadradas

- [x] 1.1 `client/components/AgoraLiveRoom.js` (`MeetingArea`): grid de participantes a `grid-cols-5` en todos los breakpoints (sustituye `grid-cols-2 md:grid-cols-3`).
- [x] 1.2 `client/components/AgoraLiveRoom.js` (`MeetingTile`): tile a `aspect-square` (sustituye `aspect-video`); mantener `fit: 'cover'` (recorte centrado); reducir avatar/nombre si hace falta para tiles pequeños en móvil.

## 2. Modo teatro — infraestructura

- [x] 2.1 **[ALTO RIESGO]** `client/components/AgoraLiveRoom.js`: componente `TheaterOverlay` (o equivalente integrado): wrapper SIEMPRE presente alrededor del destacado que, con `theaterOpen`, pasa a `fixed inset-0 z-[60] bg-black flex flex-col` y renderiza dentro: destacado (`flex-1 min-h-0`), banda inferior y botones (cerrar ✕, ocultar/mostrar banda). El destacado (incluida la pizarra) NO cambia de posición en el árbol React (sin remontaje de fastboard).
- [x] 2.2 `client/components/AgoraLiveRoom.js`: al abrir el teatro, `requestFullscreen()` best-effort sobre el wrapper (ignorar rechazo, p. ej. iOS); efecto de conciliación: `fullscreenchange` (salida nativa → cierra teatro), tecla Escape (cierra teatro; útil sin fullscreen nativo), y al cerrar el teatro `document.exitFullscreen()` si sigue activo.
- [x] 2.3 `client/components/AgoraLiveRoom.js`: mientras `theaterOpen`, NO renderizar los tiles del layout normal (grid meeting / grid avatares broadcast / grid de promovidos) — render condicional exclusivo para que cada track de vídeo tenga un único contenedor; el chat lateral queda montado (tapado por el overlay).

## 3. Banda de participantes paginada

- [x] 3.1 `client/components/AgoraLiveRoom.js`: componente `TheaterStrip`: entradas = participantes sin el host; estado `stripStart`; ventana visible `entries[(stripStart + i) % n]` (i = 0..4); flechas ⟵/⟶ (± 5 módulo n) visibles solo si `n > 5`; botón ocultar/mostrar banda (`stripVisible`, conserva `stripStart`); solo la ventana visible montada.
- [x] 3.2 `client/components/AgoraLiveRoom.js`: tiles de banda para `meeting`: variante compacta cuadrada del tile de cámara (vídeo `fit:'cover'` o avatar inicial, nombre corto, badge micro, anillo hablando; sin menú de moderación).
- [x] 3.3 `client/components/AgoraLiveRoom.js`: tiles de banda para `broadcast`: reutilizar el tile avatar+micro de `AgoraParticipantTile` en modo solo-estado (sin acciones de click) con mano levantada/badges como en la vista normal.

## 4. Puntos de entrada del teatro

- [x] 4.1 `client/components/AgoraLiveRoom.js` (`MeetingArea`): botón de teatro sobre el destacado para asistentes siempre que haya contenido (cámara del host, pantalla o pizarra) — sustituye la condición `hostScreenSharing`; para el host, cuando su destacado existe (pantalla o pizarra).
- [x] 4.2 `client/components/AgoraLiveRoom.js` (`BroadcastArea`): el botón actual del vídeo del host (viewers) abre el teatro en lugar del fullscreen nativo; añadir botón de teatro sobre el recuadro de la pizarra (host y viewers) cuando esté activa.
- [x] 4.3 `client/components/AgoraLiveRoom.js`: retirar el uso del helper nativo `enterFullscreen`/`FullscreenButton` en los puntos sustituidos (eliminar código muerto si queda sin usos). `EventLiveRoom.js` (LiveKit) intacto.

## 5. Nombres reales en cursores de pizarra

- [x] 5.1 `client/components/events/WhiteboardPanel.js`: nueva prop `displayName`; si no está vacía, `joinRoom.userPayload = { nickName: displayName }` en `createFastboard`; añadir a las deps del efecto.
- [x] 5.2 `client/components/AgoraLiveRoom.js`: pasar `displayName={selfPresence?.name}` al montar `WhiteboardPanel` (host y asistentes; la presencia incluye el nombre real de ambos).

## 6. Verificación

- [x] 6.1 Verificar grid meeting: escritorio y móvil muestran filas de 5 tiles cuadrados 1:1 con recorte centrado; avatar cuando la cámara está apagada; broadcast sin cambios de grid.
- [x] 6.2 Verificar teatro meeting (asistente): cámara del host, pantalla compartida y pizarra maximizables; banda con tiles de cámara; con >5 participantes las flechas rotan en bucle de 5 en 5 en ambos sentidos; botón ocultar/mostrar banda; salida con ✕, Escape y fullscreen nativo; al salir el layout vuelve sin recargar y sin cortes de audio.
- [x] 6.3 Verificar teatro broadcast (viewer): vídeo del host y pizarra maximizables; banda con tiles avatar+micro (estados como la vista normal).
- [x] 6.4 Verificar pizarra en teatro: el host dibuja con toolbar completa; asistente writer ("Todos escriben") dibuja; asistente reader en solo lectura; entrar/salir del teatro no remonta la pizarra (sin "Cargando pizarra..." ni rejoin).
- [x] 6.5 Verificar cursores: host y participantes ven nombres reales junto a los cursores (no `host-55`/`viewer-nn`); sin nombre disponible degrada al comportamiento actual.
- [x] 6.6 Regresión: evento LiveKit de control idéntico a antes; broadcast Agora sin pizarra ni teatro se comporta como antes (hand raise, promoción, chat).
- [x] 6.7 `openspec validate refine-agora-fullscreen-and-grid` sin errores.
