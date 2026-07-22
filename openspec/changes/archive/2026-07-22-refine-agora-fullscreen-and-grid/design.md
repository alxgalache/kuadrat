# Design: refine-agora-fullscreen-and-grid

## Context

`AgoraLiveRoom.js` tiene hoy dos usos de pantalla completa, ambos con la Fullscreen API nativa sobre un único `<div>` (helper `enterFullscreen` + `FullscreenButton`):

- `broadcast`: botón para viewers sobre el recuadro del vídeo del host (paridad LiveKit).
- `meeting`: botón solo cuando el host comparte pantalla.

No hay fullscreen para la cámara del host en meeting ni para la pizarra, y el fullscreen actual no muestra al resto de participantes. El grid meeting es `grid grid-cols-2 md:grid-cols-3` con tiles `aspect-video`. La pizarra se monta con `createFastboard({ joinRoom: { uid, uuid, roomToken, isWritable } })` sin `userPayload`, por lo que el cursor en vivo muestra el `memberId` (identity `host-55` / `viewer-nn`); verificado en `@netless/window-manager` que el nombre del cursor se resuelve como `payload.nickName || payload.cursorName || memberId`.

Restricciones técnicas relevantes:

- Un track de vídeo Agora solo puede reproducirse en un contenedor a la vez (`track.play(el)` re-ancla el `<video>`); `fit: 'cover'` equivale a `object-fit: cover` (recorte centrado) según `VideoPlayerConfig`.
- Si el elemento React de la pizarra cambia de posición en el árbol, React lo desmonta y `WhiteboardPanel` destruye/recrea la sala fastboard (flicker + rejoin). Debe evitarse al entrar/salir del modo teatro.
- iOS Safari no soporta `requestFullscreen()` sobre elementos arbitrarios (solo `<video>.webkitEnterFullscreen`, que no puede contener la banda).

## Goals / Non-Goals

**Goals:**

- Modo "teatro": destacado del host (cámara/pantalla/pizarra) a pantalla completa + banda inferior de participantes paginada de 5 en 5 (bucle), ocultable, en `meeting` y `broadcast`.
- Pizarra interactiva en teatro: el host escribe siempre; los asistentes escriben cuando su rol es writer ("Todos escriben" en meeting).
- Grid meeting: filas de 5 tiles cuadrados 1:1 (recorte centrado) en todos los breakpoints.
- Cursores de pizarra con nombre real vía `userPayload.nickName`.

**Non-Goals:**

- Sin cambios en `EventLiveRoom.js` (LiveKit) ni en backend/API/BD/env.
- Sin cambios en la lógica de promoción/moderación/chat/presencia.
- No se persigue fullscreen nativo en iOS (el overlay ocupa el viewport; el chrome del navegador queda visible).

## Decisions

### D1 — Modo teatro = overlay controlado por estado + fullscreen nativo best-effort

El teatro es estado React (`theaterOpen`), no un efecto CSS de `:fullscreen`. Al activarse, un **wrapper de teatro** pasa a `fixed inset-0 z-[60] bg-black flex flex-col` y contiene: el destacado (flex-1), la banda inferior y los botones (cerrar, ocultar/mostrar banda). Sobre ese wrapper se solicita además `requestFullscreen()` como mejora progresiva (escritorio/Android ocultan el chrome; iOS ignora y queda el overlay). Salida por botón X, tecla Escape (listener propio, porque sin fullscreen nativo Escape no dispara nada) y `fullscreenchange` (si el usuario sale del fullscreen nativo, se cierra el teatro para no dejar estados divergentes).

*Alternativa descartada:* solo Fullscreen API + CSS `:fullscreen` — no permite reestructurar el DOM (banda paginada, botones) ni funciona en iOS.

### D2 — El wrapper de teatro envuelve SIEMPRE al destacado (sin remontar la pizarra)

El wrapper de teatro existe siempre en el árbol como contenedor del recuadro destacado (en `MeetingArea` y en `BroadcastArea`); en modo normal es un `<div>` transparente sin clases de posicionamiento. Entrar al teatro solo cambia sus clases y renderiza la banda dentro de él. Así:

- La pizarra (`whiteboardElement`) nunca cambia de posición en el árbol → no se desmonta → la sala fastboard, su toolbar y la escritura (según `isWritable`) sobreviven intactas al entrar/salir.
- El fullscreen nativo puede pedirse sobre el wrapper e incluir la banda (que es su hija).
- Para cámara/pantalla no hay requisito de no-remontaje, pero se benefician del mismo código.

*Alternativa descartada:* portal/overlay separado que "traslada" el destacado — remonta la pizarra (rejoin visible) y duplicaría contenedores de track.

### D3 — En teatro, el layout normal de tiles NO se renderiza

Mientras `theaterOpen`, la zona de medios normal (grid meeting / grid de avatares broadcast / tiles de promovidos) se retira del render (conditional render, no `display:none`): los tracks de cámara solo pueden reproducirse en un contenedor, y deben hacerlo en los tiles de la banda. El chat lateral queda simplemente tapado por el overlay (no se desmonta, el socket sigue vivo). Al salir, los tiles normales se re-renderizan y cada `AgoraVideo` re-reproduce su track (efecto keyed por track).

### D4 — Banda inferior: paginación por ventana de 5 con bucle

- Fuente: la misma lista que el grid normal excluyendo al host (destacado arriba). Meeting → tiles de cámara compactos cuadrados (variante reducida de `MeetingTile`: vídeo `fit:'cover'` o avatar, nombre, badge micro, anillo hablando; sin menú de moderación). Broadcast → los mismos tiles avatar+micro de `AgoraParticipantTile` (sin acciones de click; solo estado).
- Estado `stripStart` (índice base). Página visible = `entries[(stripStart + i) % n]` para `i` en `0..4`. Flechas ⟵/⟶ suman/restan 5 módulo `n`; solo se muestran si `n > 5`. Si `n ≤ 5` se muestran todos sin flechas. Si la lista encoge por debajo de `stripStart`, se reajusta con el propio módulo (no hace falta clamp adicional).
- Botón ocultar/mostrar banda (`stripVisible`): al ocultarla, los tiles se desmontan (los tracks de la banda dejan de reproducirse; el audio no se ve afectado, los tracks de audio son independientes del render) y el destacado gana toda la altura.
- Solo hay 5 tiles montados a la vez → coste de decodificación acotado con 16 participantes.

### D5 — Puntos de entrada del teatro

- `meeting` (asistentes): botón sobre el destacado siempre que haya contenido (cámara del host, pantalla o pizarra) — sustituye a la condición actual "solo pantalla compartida".
- `meeting` (host): botón solo cuando su destacado existe (pantalla o pizarra); para pizarra lo pide el usuario explícitamente (escribiendo); para su propia pantalla se mantiene el acceso actual.
- `broadcast` (viewers): el botón actual del vídeo del host abre el teatro en lugar del fullscreen nativo; con pizarra activa, botón equivalente sobre el recuadro de la pizarra.
- `broadcast` (host): botón solo sobre la pizarra (su propia cámara no lo necesita).
- El helper `enterFullscreen`/`FullscreenButton` nativo deja de usarse en Agora (queda LiveKit intacto en su fichero).

### D6 — Grid meeting 5×1:1

`grid-cols-5` en todos los breakpoints y tiles `aspect-square` (antes `grid-cols-2 md:grid-cols-3` + `aspect-video`). El recorte centrado ya lo da `fit: 'cover'` en `AgoraVideo`. Tamaños de fuente/avatar del tile se reducen si hace falta para móvil (tiles pequeños), sin cambiar estructura.

### D7 — Nombres reales en cursores de pizarra

`WhiteboardPanel` recibe `displayName` y lo pasa como `joinRoom.userPayload = { nickName: displayName }` (solo si no está vacío). `AgoraLiveRoom` lo alimenta con `selfPresence?.name` (la presencia incluye al host y a los asistentes con su nombre real). `displayName` entra en las deps del efecto de montaje (cambio de nombre → remount; en la práctica no ocurre a mitad de sesión). Sin cambios de backend: el token/uid no cambian, solo el payload informativo del member.

## Risks / Trade-offs

- **[Doble reproducción de un track al alternar teatro rápidamente]** → los contenedores normales se desmontan antes de montar la banda (render condicional exclusivo por `theaterOpen`); el cleanup de `AgoraVideo` hace `track.stop()`.
- **[iOS sin fullscreen nativo]** → el overlay `fixed inset-0` (con `100dvh` implícito por inset) cubre el viewport; se pierde solo la ocultación del chrome del navegador. Asumido.
- **[Escape/fullscreenchange desincronizados]** → un único efecto concilia: salir de fullscreen nativo cierra el teatro; cerrar el teatro llama a `document.exitFullscreen()` si procede.
- **[La pizarra en teatro con "Todos escriben"]** → el cambio de flag ya remonta `WhiteboardPanel` por `key` (creds/rol nuevos); en teatro ese remontaje es igual de aceptable (el contenido persiste en el servidor de Netless). La posición en el árbol no cambia, así que no hay remontaje extra por el teatro en sí.
- **[Tiles 1:1 recortan la imagen de la webcam]** → aceptado explícitamente por producto; los participantes pueden encuadrarse; la vista crítica es la del host.
- **[Banda con vídeos = ancho limitado en móvil]** → 5 tiles cuadrados caben con tamaño reducido (~64px); mismo patrón de tamaño que los avatares del broadcast. Si resultara ilegible, la banda puede ocultarse con su botón.

## Open Questions

(ninguna — supuestos validados con el usuario: host excluido de la banda; flechas solo con >5; pizarra en teatro también para el host manteniendo escritura; 5 columnas 1:1 también en móvil; cursores con nombre real si es viable — lo es)
