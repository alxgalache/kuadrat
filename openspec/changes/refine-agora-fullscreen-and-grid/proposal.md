# Proposal: refine-agora-fullscreen-and-grid

## Why

Tras las pruebas reales de los eventos Agora (`add-agora-streaming-provider` + `refine-agora-live-ux`), la experiencia de visualización se queda corta en tres puntos: (1) en `meeting` los asistentes no pueden maximizar la cámara del host (solo la pantalla compartida) y el fullscreen actual es un fullscreen nativo "a secas" sin contexto del resto de la sala; (2) el grid de cámaras de `meeting` en escritorio (filas de 3, tiles 16:9) desaprovecha el espacio con grupos grandes (hasta 16); y (3) los cursores de la pizarra muestran identidades internas (`host-55`, `viewer-12`) en lugar de los nombres reales, lo que resulta confuso en sesiones colaborativas.

## What Changes

- **Modo "teatro" (pantalla completa con banda de participantes)** en la sala Agora, sustituyendo al fullscreen nativo simple actual:
  - Disponible en `meeting` sobre el recuadro destacado del host (cámara, pantalla compartida o pizarra) y en `broadcast` sobre el vídeo del host (cámara o pantalla) y la pizarra.
  - Overlay a pantalla completa con el medio del host arriba y una **banda inferior de participantes** paginada **de 5 en 5** con flechas de rotación en bucle (endless) y botón para ocultar/mostrar la banda.
  - En `meeting` la banda muestra tiles de cámara; en `broadcast` muestra los tiles avatar+micro de la vista normal.
  - La pizarra en fullscreen mantiene la **interactividad de escritura**: el host siempre puede escribir, y los asistentes también cuando "Todos escriben" está activo (meeting).
- **Grid de cámaras `meeting` a 5 columnas con tiles cuadrados (1:1)** en todos los tamaños de pantalla, con recorte centrado del vídeo (`fit: 'cover'`, equivalente a `object-fit: cover`), en sustitución de las filas de 3 (2 en móvil) con tiles 16:9.
- **Nombres reales en los cursores de la pizarra**: `WhiteboardPanel` pasa `joinRoom.userPayload = { nickName }` a `createFastboard` con el nombre de presencia del usuario, de modo que el cursor en vivo muestre el nombre real en lugar del `memberId` (`host-55` / `viewer-nn`).

Sin cambios de backend, de base de datos ni de los eventos LiveKit. El fullscreen de LiveKit (`EventLiveRoom`) no se toca.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `agora-streaming-provider`: el requisito de pantalla completa (introducido por `add-agora-streaming-provider` y refinado por `refine-agora-live-ux`, ambos sin archivar) pasa de "fullscreen nativo del recuadro del host" a "modo teatro" con banda inferior de participantes paginada, en `meeting` (cámara/pantalla/pizarra) y `broadcast` (cámara/pantalla/pizarra). El requisito del grid `meeting` cambia de filas de 3 tiles 16:9 a filas de 5 tiles cuadrados 1:1 con recorte centrado.
- `agora-whiteboard`: nuevo requisito de nombres reales en los cursores en vivo (`userPayload.nickName`); el requisito de montaje se amplía con la visualización en modo teatro conservando la escritura según rol.

> Nota de orden: este cambio parte de los requisitos en vuelo de `add-agora-streaming-provider` y `refine-agora-live-ux`; debe archivarse **después** de ambos.

## Impact

- `client/components/AgoraLiveRoom.js` — nuevo modo teatro (overlay + banda paginada), botones de fullscreen en meeting (cámara/pizarra además de pantalla) y broadcast (pizarra además de vídeo), grid meeting a 5 columnas cuadradas, paso del nombre real al `WhiteboardPanel`.
- `client/components/events/WhiteboardPanel.js` — prop `displayName` → `joinRoom.userPayload.nickName`.
- Posible extracción de subcomponentes del modo teatro (banda, paginación) si el tamaño del archivo lo aconseja.
- Sin cambios en `api/`, en `EventLiveRoom.js` (LiveKit) ni en variables de entorno.
