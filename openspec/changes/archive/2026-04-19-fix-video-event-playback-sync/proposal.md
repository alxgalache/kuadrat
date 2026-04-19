## Why

Los eventos en la sección "Live" con formato `video` (vídeo pregrabado en modo "cine online") deben reproducirse en la misma posición para todos los espectadores, calculada a partir de `events.video_started_at` (instante en que el admin pulsó "Iniciar"). Ejemplo: si el admin inició a 22:30:00 y un usuario entra a 22:41:44, el vídeo debe empezar a reproducirse desde el minuto 11:44 sin saltos perceptibles.

Hoy no funciona correctamente. El usuario ve **primero unos segundos desde la posición 0** y luego el vídeo **da un salto** a la posición correcta. Adicionalmente, en Chrome el vídeo suele permanecer **pausado hasta que se pulsa el botón unmute**, momento en el que empieza a sonar desde el inicio antes de saltar. La experiencia rompe la sensación de "pase en directo".

La causa raíz está en `client/components/EventVideoPlayer.js`:

1. El `useEffect` que corrige la posición (`EventVideoPlayer.js:40-57`) asigna `video.currentTime = elapsed` e inmediatamente llama `video.play()` **sin esperar al evento `seeked`**. El navegador reproduce los bytes ya bufereados en posición 0 mientras se resuelve el Range request para la posición objetivo.
2. El `<video>` se muestra con `opacity: 1` desde el principio, por lo que el usuario percibe visualmente el fragmento de la posición 0.
3. `getElapsedSeconds()` usa `Date.now()` sin corregir el desfase reloj cliente↔servidor, por lo que dos usuarios con relojes distintos ven el vídeo en posiciones distintas.
4. `toggleMute` hace `play()` sin re-seekar, así que cualquier drift acumulado durante el período silenciado persiste al desmutear.
5. La corrección periódica de drift se ejecuta cada 30s, ventana demasiado grande para un usuario que sufre buffering.

Este problema afecta tanto a vídeos subidos al backend propio (`/uploads/events/*.mp4` servidos con `Cache-Control: no-store` y soporte de Range) como a vídeos en el CDN de S3 (p. ej. `https://cdn.140d.art/guias/guia_basica.mp4`). El comportamiento es idéntico: es un fallo de secuenciación en el cliente, no del servidor.

## What Changes

### Backend — Reloj de servidor en respuesta del evento

- **Modificar `api/controllers/eventController.js::getEventBySlug`** para incluir `serverNow: new Date().toISOString()` en el JSON de respuesta. El cliente usará este valor para calcular un `serverTimeOffset` y eliminar el desfase reloj cliente↔servidor.
- **No cambiar** `fetchEvent` en `client/lib/serverApi.js` (SSR de metadata Open Graph) — ese flujo no necesita el reloj; solo lo necesita el cliente para reproducción.

### Frontend — Reescritura de la sincronización en `EventVideoPlayer`

El fichero `client/components/EventVideoPlayer.js` se reescribe para seguir el flujo "seek → wait seeked → play → mostrar":

1. **Estado `seekReady`** (nuevo). Se pone `true` únicamente cuando el navegador emite el evento `seeked` después del seek inicial.
2. **Nueva prop `serverTimeOffset`** (milisegundos). `getElapsedSeconds()` pasa a usar `Date.now() + serverTimeOffset` como "ahora" para calcular la posición.
3. **Secuencia correcta al `loadedmetadata`**: primero registrar listener `seeked` (one-shot), después asignar `currentTime = elapsed`, y dentro del handler de `seeked` llamar a `play()` y marcar `setSeekReady(true)`.
4. **Video oculto hasta estar listo**: el elemento `<video>` se renderiza con `style={{ opacity: seekReady ? 1 : 0 }}`. Mientras tanto sigue el spinner existente "Cargando vídeo...".
5. **Reset al cambiar `videoUrl`**: un `useEffect` observa `safeVideoUrl` y, cuando cambia, resetea `videoReady`, `seekReady`, `videoError` y `retryCount`. De forma implícita al cambiar `<video src>` el navegador carga desde cero.
6. **Re-seek al desmutear**: en `toggleMute`, si se pasa de muted→unmuted, recalcular `expected = getElapsedSeconds()` y si `|expected - video.currentTime| > 1s` reasignar `video.currentTime = expected` **antes** de `play()`. Así se absorbe cualquier drift acumulado durante la pausa silenciosa.
7. **Modo cine estricto** (decisión del usuario — opción a): la corrección de drift periódica pasa de 30s/umbral 2s a **cada 10s con umbral 2s**, y además escucha el evento `waiting` (buffering): cuando el navegador vuelve a `playing` tras un `waiting`, se re-seekea al tiempo del servidor. El usuario pierde los segundos que hayan transcurrido durante el buffering — comportamiento cine.
8. **Mantener la lógica de fin de vídeo**: si `elapsed >= video.duration` al cargar, se sigue mostrando el estado "El vídeo ha finalizado". Sin cambios en este flujo.

### Frontend — Cálculo del offset en `EventDetail`

- **`client/app/live/[slug]/EventDetail.js`**: en `loadEvent`, tras recibir la respuesta del `eventsAPI.getBySlug`, calcular `serverTimeOffset = new Date(data.serverNow).getTime() - Date.now()` y guardarlo en estado. Propagarlo al `EventVideoPlayer` como prop.

## Capabilities

### Modified Capabilities

- `live-events-ux-improvements`: se añaden requisitos específicos sobre reproducción sincronizada de eventos `format='video'` (seek inicial sin saltos visibles, modo cine estricto, sincronización reloj cliente↔servidor). No se alteran los requisitos existentes de streaming LiveKit ni de chat.

## Impact

- **Layer**: Frontend (mayormente) + un pequeño cambio en backend controller.
- **Files afectados — Backend**:
  - `api/controllers/eventController.js` (getEventBySlug añade `serverNow`).
- **Files afectados — Frontend**:
  - `client/components/EventVideoPlayer.js` (reescritura del bloque de sincronización, estado `seekReady`, nueva prop `serverTimeOffset`, opacity toggle, re-seek en unmute, modo cine al recuperar buffering).
  - `client/app/live/[slug]/EventDetail.js` (calcular y propagar `serverTimeOffset`).
- **DB schema**: sin cambios.
- **Dependencies**: ninguna nueva.
- **APIs externas**: ninguna. S3/CDN debe devolver `Accept-Ranges: bytes` (S3 lo hace por defecto) y CORS apropiados; si un vídeo específico no los trae, el fallo es externo y queda fuera del alcance.
- **Testing manual**:
  - Crear en pre un evento `format='video'` con un archivo subido (`uploaded:...`) y otro con URL CDN (`https://cdn.140d.art/...`).
  - Iniciar cada evento, esperar 2+ minutos y entrar como usuario en Chrome. El vídeo debe aparecer en la posición correcta sin mostrar frames de la posición 0 previa.
  - Ctrl+Shift+R debe comportarse igual (no debe haber "reseteo al principio con salto posterior").
  - Desmutear no debe reiniciar la reproducción.
  - Abrir en dos pestañas o dos navegadores — ambas reproducciones deben mantenerse dentro de ±2 segundos entre sí.
  - Simular buffering (throttle de red) — tras recuperar la conexión, el vídeo debe saltar al instante correcto (modo cine).
  - Entrar después de `event_datetime + duration_minutes` o después de que `elapsed > video.duration` — debe mostrarse "El vídeo ha finalizado".

## Non-goals

- **Sincronización sub-segundo** al estilo HLS/DASH con segmentos y manifests. Requeriría transcodificar los vídeos a HLS y un pipeline de origen-reproductor mucho más complejo. Con esta propuesta conseguimos ±1-2 s entre dispositivos, aceptado por el producto.
- **Pausa/seek manual para el usuario**. El componente no expone controles de progress-bar; los botones existentes (volumen, fullscreen) se mantienen sin cambios.
- **Recuperación perfecta tras buffering** (modo "no cine" que reanuda donde se quedó). Se elige explícitamente el modo cine estricto: al recuperar red, se salta al instante del servidor.
- **Fade-in de audio al desmutear**. Se mantiene el corte seco actual.
- **Reloj NTP round-trip estimation** sofisticado. El offset es simplemente `serverNow - clientNowAtResponse`. La latencia de red (típicamente <200 ms) queda absorbida por la tolerancia de drift.
- **Cambios en el flujo de LiveKit / streaming**. Este change solo toca la rama `event.format === 'video'`.
- **Caché en localStorage de posición de vídeo**. Se descarta: el reloj del servidor es la única fuente de verdad.
- **Cambios en `client/app/admin/espacios/[id]/page.js`** ni en el listado admin. El botón "Iniciar" ya persiste `video_started_at` correctamente; el fallo está en el lado de reproducción, no en el marcado.
