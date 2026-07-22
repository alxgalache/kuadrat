# Proposal: refine-agora-theater-strip-and-whiteboard-images

## Why

La verificación manual en dispositivos reales de los cambios en vuelo `add-agora-streaming-provider`, `refine-agora-live-ux` y `refine-agora-fullscreen-and-grid` ha destapado tres carencias: (1) la banda inferior del modo teatro pagina con un número fijo de 5 tiles, que desaprovecha el ancho en monitores panorámicos y **desborda en móviles** (en iPhone las flechas quedan recortadas fuera de pantalla, dejando al usuario sin forma de desplazarse entre participantes); (2) cuando el host finaliza el evento, los participantes que están en modo teatro no ven el diálogo "Evento finalizado" (el overlay `z-[60]` tapa el `ConfirmDialog` `z-50` y el fullscreen nativo oculta todo lo externo a su subárbol DOM) y se quedan atrapados en la pantalla completa; y (3) la pizarra solo permite dibujar — falta poder añadir, mostrar y mover imágenes (caso de uso central para una galería de arte), mientras que el panel de apps de fastboard-ui ofrece "Code" y "Countdown", apps de Netless irrelevantes para nuestro caso.

## What Changes

- **Banda del teatro con capacidad dinámica**: el número de tiles visibles en la banda inferior del modo teatro deja de ser fijo (5) y pasa a calcularse según el ancho disponible del viewport (medido con `ResizeObserver`), manteniendo los tamaños de tile actuales (64px móvil / 96px escritorio). Las flechas de paginación, cuando procedan, quedan siempre dentro de la pantalla; la paginación avanza/retrocede en bloques del tamaño visible, conservando la rotación en bucle. Esto corrige de raíz el recorte de las flechas en iPhone.
- **Cierre del teatro al finalizar el evento**: al recibir `event_ended` por socket, la sala Agora cierra el modo teatro (estado del overlay + `document.exitFullscreen()` best-effort) antes de que `EventDetail` muestre el diálogo "Evento finalizado", de modo que los participantes en teatro reciban el mismo aviso que los demás.
- **Imágenes en la pizarra**: el host y los asistentes con rol writer ("Todos escriben") pueden insertar imágenes en la pizarra vía `app.insertImage()` de Fastboard, desde dos orígenes: subida desde el dispositivo (nuevo endpoint backend con nombre UUID, almacenamiento S3/local según el patrón existente y servido públicamente) y pegado de una URL externa. Las imágenes insertadas son elementos del lienzo: visibles para todos en tiempo real y movibles/redimensionables con la herramienta de selección nativa.
- **Panel de apps de la pizarra oculto**: se deshabilita el botón de apps de fastboard-ui (que expone "Code" y "Countdown"); la inserción de imágenes se ofrece en un control propio superpuesto a la pizarra.

Sin cambios en los eventos LiveKit ni en el esquema de base de datos. Backend: solo el nuevo endpoint de subida/servido de imágenes de pizarra.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `agora-streaming-provider`: el requisito en vuelo "Banda de participantes del teatro — paginación de 5 en 5 con bucle" (de `refine-agora-fullscreen-and-grid`, sin archivar) pasa de ventana fija de 5 a **capacidad dinámica según el ancho del viewport**; el requisito "Modo teatro" se amplía con el **cierre automático al finalizar el evento** para que el diálogo de fin de stream sea visible.
- `agora-whiteboard`: nuevos requisitos de **inserción de imágenes** (subida desde dispositivo + URL externa, para host y writers) y de **ocultación del panel de apps** de fastboard-ui.

> Nota de orden: este cambio parte de los requisitos en vuelo de los tres cambios Agora sin archivar; debe archivarse **después** de `add-agora-streaming-provider`, `refine-agora-live-ux` y `refine-agora-fullscreen-and-grid`.

## Impact

- `client/components/AgoraLiveRoom.js` — `TheaterStrip` con medición de ancho y página dinámica; cierre del teatro al recibir el fin de evento (nueva prop desde `EventDetail`).
- `client/app/live/[slug]/EventDetail.js` — pasar la señal `eventEnded` a `AgoraLiveRoom`.
- `client/components/events/WhiteboardPanel.js` — config de `mount()` para ocultar el panel de apps; control propio "Insertar imagen" (file picker + URL) que llama a `app.insertImage()`.
- `api/routes/eventRoutes.js`, `api/controllers/eventController.js`, `api/validators/eventSchemas.js` — endpoint de subida de imagen de pizarra (multer, validación de rol writer/host) y endpoint público de servido; almacenamiento vía `s3Service` con fallback a disco (patrón `s3-media-storage`).
- Sin cambios en `EventLiveRoom.js` (LiveKit), en `api/config/database.js` ni en variables de entorno.
