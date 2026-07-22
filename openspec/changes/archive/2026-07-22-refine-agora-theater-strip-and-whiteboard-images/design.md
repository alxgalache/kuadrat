# Design: refine-agora-theater-strip-and-whiteboard-images

## Context

Tres cambios Agora en vuelo (`add-agora-streaming-provider` → `refine-agora-live-ux` → `refine-agora-fullscreen-and-grid`) han sido verificados manualmente en dispositivos reales. Estado actual del código:

- `TheaterStrip` (`AgoraLiveRoom.js`) pagina con la constante `THEATER_STRIP_PAGE = 5` y renderiza `flex justify-center` sin scroll. En un iPhone (~390px) 5 tiles de 64px + gaps + 2 flechas ≈ 460px: el contenido desborda por ambos lados y las flechas quedan recortadas fuera de pantalla. En un monitor panorámico, 5 tiles ocupan una fracción mínima del ancho.
- El diálogo "Evento finalizado" es un `ConfirmDialog` (`z-50`) en `EventDetail.js`, disparado por `eventEnded` de `useEventSocket`. El overlay del teatro es `fixed inset-0 z-[60]` y además puede tener fullscreen nativo sobre su wrapper (`TheaterShell`): el diálogo queda tapado (z-index) o directamente fuera del subárbol fullscreen (invisible). `AgoraLiveRoom` hoy no recibe ninguna señal de fin de evento.
- `WhiteboardPanel` monta Fastboard con `mount(app, el, { config })`; los writers reciben la UI completa de fastboard-ui, cuyo botón de apps expone las apps Netless por defecto ("Code" = editor Monaco colaborativo, "Countdown" = temporizador). Fastboard web expone `app.insertImage(url)` (confirmado en docs de Agora: *Display files using Fastboard → Insert Images*); la imagen insertada es un elemento del lienzo, seleccionable y movible con la herramienta selector nativa. El servidor de Netless NO aloja la imagen: cada cliente la descarga de la URL, que debe ser accesible públicamente y estable durante la vida de la sala.
- Patrón de imágenes existente (`s3-media-storage`): multer memoryStorage (10MB, PNG/JPG/WEBP) → `s3Service.uploadFile('prefix/basename')` o disco `uploads/prefix/` → servido vía endpoint API público (`GET /api/art/images/:basename`).

## Goals / Non-Goals

**Goals:**
- Banda del teatro que aprovecha el ancho real de cada pantalla manteniendo el tamaño de tile actual, con flechas siempre visibles (corrige iPhone).
- Participantes en teatro reciben el aviso de fin de evento igual que en la vista normal.
- Host y writers insertan imágenes en la pizarra (upload + URL externa); todos las ven y los writers las mueven.
- Panel de apps de fastboard-ui oculto.

**Non-Goals:**
- No se toca `EventLiveRoom.js` (LiveKit) ni el flujo de fin de evento del lado servidor.
- No hay galería/biblioteca de imágenes persistente por evento ni gestión de borrado individual desde la UI (la pizarra ya permite borrar el elemento con el selector + tecla borrar de fastboard).
- No se cambia el esquema de BD (las imágenes de pizarra no se registran en tablas; son ficheros con UUID bajo un prefijo propio).
- El bug global de viewport en iOS Safari y el doble-check de normas en `EventAccessModal` se corrigen fuera de este cambio (fixes directos, sin impacto de spec).

## Decisions

### D1. Capacidad de la banda por medición del contenedor (no media queries)

`TheaterStrip` mide el ancho disponible con un `ResizeObserver` sobre su contenedor y calcula `visibleCount = clamp(1, floor((ancho − reserva flechas − padding) / (tileW + gap)), n)`. `tileW` se deriva del breakpoint actual (64px < 640px de viewport, 96px desde `sm:`), los mismos tamaños que hoy. La reserva de flechas solo se descuenta cuando `n > visibleCount` (hay paginación). El paso de las flechas es `visibleCount`, conservando la rotación modular en bucle. Al cambiar el ancho (rotación de dispositivo, resize, ocultar banda y reabrirla) se recalcula; si `visibleCount` crece y la ventana actual queda corta, simplemente muestra más tiles desde el mismo `start`.

*Alternativa considerada*: banda con scroll horizontal (`overflow-x-auto` + snap). Descartada porque el requisito en vuelo define paginación con flechas y bucle endless, y el scroll nativo dentro de un overlay fullscreen en iOS tiene conflictos de gesto (pinch/pan del propio Safari). La medición corrige además el desborde de raíz, que el scroll solo enmascararía.

### D2. Señal de fin de evento por prop, no segundo listener

`EventDetail` ya recibe `event_ended` vía `useEventSocket` (socket público del evento). Se pasa `eventEnded` como prop a `AgoraLiveRoom`, que la propaga a `BroadcastArea`/`MeetingArea`; un efecto cierra el teatro (`setTheaterOpen(false)`) cuando `eventEnded && theaterOpen`. La salida de fullscreen nativo ya la maneja el cleanup de `TheaterShell` (`document.exitFullscreen()` best-effort). El `ConfirmDialog` de `EventDetail` no cambia: al cerrarse el overlay y el fullscreen, vuelve a ser visible.

*Alternativa considerada*: escuchar `event_ended` también en `useEventRoomSocket` (socket autenticado de la sala). Descartada: duplicaría la fuente de verdad del mismo hecho y el orden de llegada entre los dos sockets no está garantizado; la prop reutiliza la señal exacta que dispara el diálogo.

### D3. Imágenes de pizarra: endpoint propio bajo `/api/events`, prefijo `whiteboard/`

- **Subida**: `POST /api/events/:id/whiteboard-image` (multipart, multer memoryStorage, PNG/JPG/WEBP, 10MB — mismos límites que productos). Autorización: el mismo modelo que `whiteboard-token` — host por JWT o asistente por `attendeeId + accessToken`; además el evento debe estar activo, la pizarra activa y el solicitante debe tener rol writer efectivo (host siempre; asistente solo si `everyoneWrites` en meeting). Respuesta: `{ url }` absoluta (basada en la URL pública del API), lista para `insertImage`.
- **Almacenamiento**: `s3Service.uploadFile('whiteboard/<uuid>.<ext>')` cuando hay S3; fallback a `uploads/whiteboard/` en disco (patrón `s3-media-storage`). Sin registro en BD: el fichero UUID es la única referencia, igual de inguessable que un basename de producto.
- **Servido**: `GET /api/events/whiteboard-images/:basename` público con `cacheControl()` (mismo esquema que `GET /api/art/images/:basename`). Público porque cada participante (incluidos asistentes anónimos con token de evento) debe poder cargarlo desde el lienzo, y la URL con UUID no es enumerable.
- **Dimensiones**: `insertImage(url)` sin tamaño explícito deja que Fastboard use el tamaño natural; se pasa la URL tal cual y se deja al SDK centrar/escalar (comportamiento por defecto documentado).

*Alternativa considerada*: data-URI en `insertImage` (sin backend). Descartada: el estado de la escena replicaría megabytes de base64 a todos los clientes y a la persistencia de Netless, con límites de tamaño de mensaje inciertos.

### D4. UI de inserción propia y panel de apps deshabilitado

En `mount()` se añade a la config de writers `toolbar: { apps: { enable: false } }` (los readers ya reciben `READER_UI_CONFIG` sin toolbar). El control "Insertar imagen" es un botón propio superpuesto al contenedor de la pizarra (visible solo con `writable`), con dos acciones: seleccionar fichero (input file → upload → `insertImage(url)`) y pegar URL externa (prompt de campo de texto → validación http(s) → `insertImage(url)`). `WhiteboardPanel` guarda la instancia fastboard en un ref para poder llamar a `insertImage` fuera del efecto de montaje.

*Alternativa considerada*: registrar una app Netless propia en el panel de apps. Descartada: sobre-ingeniería; el panel entero se oculta y un botón overlay cumple el requisito con la UI minimalista del proyecto.

## Risks / Trade-offs

- [La estimación de `tileW` por breakpoint podría desalinearse si se cambian las clases de tamaño de tile] → El cálculo usa constantes compartidas con las clases (`w-16`/`sm:w-24` documentadas junto a la constante); la verificación manual cubre móvil y escritorio.
- [URL externa pegada puede no cargar (CORS/hotlinking) o desaparecer con el tiempo] → Riesgo aceptado y comunicado en la UI (es una función de conveniencia); la subida desde dispositivo es la vía primaria y estable. `insertImage` no requiere CORS para mostrar (es un elemento imagen), solo para exportar snapshot, que no usamos.
- [Imágenes huérfanas en `whiteboard/` tras terminar los eventos] → Volumen bajo (eventos puntuales, cap 16 asistentes); se acepta sin job de limpieza por ahora. Si creciera, un cleanup por fecha del prefijo `whiteboard/` es trivial al ser ficheros sin filas de BD.
- [`event_ended` llega mientras el navegador está en fullscreen nativo: algunos navegadores exigen gesto de usuario para `exitFullscreen`] → `exitFullscreen()` es una API de salida (no de entrada) y no requiere gesto; el cleanup ya la llama best-effort con catch. En el peor caso el overlay se cierra igualmente y el diálogo queda visible al salir del fullscreen.
- [Un asistente writer pierde el rol (host desactiva "Todos escriben") con el diálogo de subida abierto] → El backend revalida el rol en cada subida y devuelve 403; el cliente muestra el error es-ES estándar.

## Migration Plan

Solo despliegue normal (frontend + API). Sin migraciones de datos ni variables de entorno nuevas. Rollback: revertir el commit; los ficheros `whiteboard/` existentes quedan inertes.

## Open Questions

(ninguna — origen de imágenes, roles autorizados y ocultación del panel de apps confirmados con el usuario)
