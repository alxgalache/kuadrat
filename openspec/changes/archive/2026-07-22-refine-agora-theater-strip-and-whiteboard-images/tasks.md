# Tasks: refine-agora-theater-strip-and-whiteboard-images

## 1. Banda del teatro con capacidad dinámica

- [x] 1.1 `client/components/AgoraLiveRoom.js` (`TheaterStrip`): sustituir `THEATER_STRIP_PAGE` fijo por capacidad calculada — `ResizeObserver` sobre el contenedor de la banda; `visibleCount = clamp(1, floor((ancho − reserva flechas − padding) / (tileW + gap)), n)` con `tileW` según breakpoint (64px < 640px, 96px desde sm) y reserva de flechas solo cuando hay paginación (`n > visibleCount`); documentar junto a las constantes que deben ir a la par con las clases `w-16`/`sm:w-24`.
- [x] 1.2 `client/components/AgoraLiveRoom.js` (`TheaterStrip`): paginación con paso = `visibleCount` conservando la rotación modular en bucle; flechas visibles solo si `n > visibleCount`; recálculo en resize/rotación sin perder `start`; solo la ventana visible montada.

## 2. Cierre del teatro al finalizar el evento

- [x] 2.1 `client/app/live/[slug]/EventDetail.js`: pasar `eventEnded` (de `useEventSocket`) como prop a `AgoraLiveRoom`.
- [x] 2.2 `client/components/AgoraLiveRoom.js`: propagar la prop a `BroadcastArea`/`MeetingArea`; efecto que cierra el teatro (`setTheaterOpen(false)`) cuando llega el fin de evento con el teatro abierto (el cleanup de `TheaterShell` ya sale del fullscreen nativo best-effort). Verificar que el `ConfirmDialog` "Evento finalizado" queda visible.

## 3. Backend — imágenes de pizarra

- [x] 3.1 `api/validators/eventSchemas.js`: schema `whiteboardImageSchema` (params id + body opcional attendeeId/accessToken, multipart).
- [x] 3.2 `api/controllers/eventController.js`: `uploadWhiteboardImage` — validar evento activo + pizarra activa + autorización (host JWT o attendeeId/accessToken) + rol writer efectivo (host siempre; asistente solo con `everyoneWrites` en meeting); almacenar buffer con nombre UUID bajo prefijo `whiteboard/` vía `s3Service` con fallback a disco `uploads/whiteboard/` (patrón s3-media-storage); responder `{ url }` absoluta con `sendCreated`/`sendSuccess`.
- [x] 3.3 `api/controllers/eventController.js` + `api/routes/eventRoutes.js`: `GET /api/events/whiteboard-images/:basename` público con `cacheControl()` (mismo esquema de servido S3/local que `GET /api/art/images/:basename`); `POST /api/events/:id/whiteboard-image` con multer memoryStorage (PNG/JPG/WEBP, 10MB) + `validate()`.
- [x] 3.4 `client/lib/api.js`: `eventsAPI.uploadWhiteboardImage(eventId, file, attendeeId, accessToken)` (FormData).

## 4. Frontend — inserción de imágenes y panel de apps

- [x] 4.1 `client/components/events/WhiteboardPanel.js`: guardar la instancia fastboard en un ref; en `mount()` de writers añadir `toolbar: { apps: { enable: false } }` (readers sin cambios).
- [x] 4.2 `client/components/events/WhiteboardPanel.js`: control "Insertar imagen" superpuesto (visible solo con `writable`) con dos acciones: subir fichero (input file → `eventsAPI.uploadWhiteboardImage` → `app.insertImage(url)`) y pegar URL externa (campo de texto, validación http/https → `app.insertImage(url)`); estados de carga y errores en es-ES.
- [x] 4.3 `client/components/AgoraLiveRoom.js`: pasar a `WhiteboardPanel` las props necesarias para la subida (eventId, credenciales de asistente) — el flag writer ya existe (`writable`).

## 5. Verificación

- [x] 5.1 Banda dinámica: en monitor panorámico la banda llena el ancho (más de 5 tiles si caben); en iPhone vertical tiles + flechas quedan íntegramente en pantalla y la paginación en bucle funciona en ambos sentidos; al rotar el dispositivo se recalcula la capacidad; sin flechas cuando todos caben; ocultar/mostrar banda conserva la posición.
- [x] 5.2 Fin de evento en teatro: host finaliza con un participante en teatro (con y sin fullscreen nativo, iPhone incluido) → el teatro se cierra y aparece el diálogo "Evento finalizado" con "Aceptar"; participantes en vista normal sin regresión.
- [x] 5.3 Imágenes: host sube JPG/PNG/WEBP desde dispositivo y aparece para todos; asistente writer (Todos escriben) sube e inserta por URL; reader las ve sin poder manipular ni insertar; writer mueve/redimensiona con el selector y se propaga; fichero >10MB o tipo inválido rechazado con error es-ES; subida de asistente sin writer → 403.
- [x] 5.4 Panel de apps: writers ven la toolbar sin el botón de apps (sin Code/Countdown); readers sin toolbar como antes; el resto de la toolbar intacta.
- [x] 5.5 Regresión: pizarra en teatro sigue sin remontarse al entrar/salir; cursores con nombres reales intactos; evento LiveKit de control sin cambios.
- [x] 5.6 `openspec validate refine-agora-theater-strip-and-whiteboard-images` sin errores.
