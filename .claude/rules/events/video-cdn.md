---
paths:
  - "api/utils/{cloudfrontSigner,eventVideoSources}.js"
  - "api/controllers/{eventController,eventAdminController}.js"
  - "api/services/{eventService,marketingEmailService}.js"
  - "client/lib/eventVideoSource.js"
  - "client/components/EventVideoPlayer.js"
  - "client/app/live/**"
  - "client/app/admin/espacios/**"
  - "deploy/cloudfront/**"
  - "scripts/video/**"
  - "docs/eventos-video/**"
  - "api/tests/{cloudfrontSigner,eventVideoSources,eventVideoDelivery,eventTestMode}.test.js"
---

## Vídeo pregrabado por CloudFront (`event-video-cdn-delivery`)

Un evento `format = 'video'` se sirve desde `cdn.140d.art` con **URLs firmadas de CloudFront**, nunca desde la EC2. El pase no cambia: la posición sale de `video_started_at` más el desfase de reloj, sin pausa ni avance. Guías operativas en `docs/eventos-video/` (índice en su `README.md`).

* **La carpeta es la marca de protección.** Una URL en el origen `EVENT_VIDEO_CDN_URL` bajo `/eventos-video/` es `protected`: el *behavior* `eventos-video/*` de la distribución solo la sirve con firma. Una sola función, `classifyVideoUrl` (`api/utils/eventVideoSources.js`), decide `uploaded | protected | external | invalid`. Sin firma configurada, **cualquier** ruta `/eventos-video/` cuenta como `protected`: entregarla sin firmar daría un 403 de CloudFront delante del público.
* **Validación al guardar, solo de lo que cambia** (`validateVideoUrls`, en el controlador porque depende de la configuración). Los códigos van en `title` y sus textos en `EVENT_VIDEO_ERRORS`:
  * `EVENT_VIDEO_URL_UNPROTECTED`: URL del CDN fuera de la carpeta;
  * `EVENT_VIDEO_SIGNING_UNAVAILABLE`: carpeta protegida en un servidor sin claves;
  * `EVENT_VIDEO_AV1_REQUIRES_MP4`;
  * `EVENT_VIDEO_URL_INVALID`.

  Validar solo lo que cambia es lo que mantiene editable un evento antiguo con una URL `http://`.
* **Las URLs no salen nunca en la API pública.** `toPublicEvent` quita `video_url` y `video_url_av1` y añade `has_video`. Antes `video_url` viajaba en la ficha y en el calendario: cualquiera veía o descargaba el vídeo sin registrarse. Las fuentes solo llegan por `POST /api/events/:id/video-token`, con el evento `active` y a quien tiene acceso (asistente verificado que no debe el pago, o host/admin). Sin firma configurada, 503 y nunca una URL sin firmar. El modo «Subir archivo» (`uploaded:`, vtoken de 2 h) sigue igual y sin uso.
* **La firma dura lo que el pase**: `min(ahora + 6 h, max(ahora + 15 min, inicio + duration_minutes + 30 min))`, con política personalizada, `Resource` exacto y RSA-SHA256.
  * CloudFront comprueba la firma en **cada** petición Range (búsqueda, corrección de deriva, tras un corte), así que debe cubrir el pase entero.
  * Una firma corta no impide descargar: una descarga empezada antes de caducar termina igualmente.
  * Si `duration_minutes` se queda corto, el cliente pide fuentes nuevas solo.
* **`crypto` nativo, sin SDK** (`api/utils/cloudfrontSigner.js`). `@aws-sdk/cloudfront-signer` no existe en la versión fijada del resto del SDK. El formato es idéntico byte a byte al de `openssl dgst -sha256 -sign`, que es la orden con la que la guía 03 verifica AWS antes de que corra ningún código.
* **Un par de claves por entorno, las dos en el grupo `eventos-video`.** Firmar es local, sin credenciales de AWS ni IMDS, y por eso **preproducción también firma**: usa el mismo CDN y el mismo archivo del bucket de producción, que es el único origen de la distribución. Un vídeo subido a otro bucket no existe para el CDN.
* **AV1 solo con decodificación por hardware.** `pickVideoSource` (`client/lib/eventVideoSource.js`) exige `mediaCapabilities.decodingInfo` → `supported && powerEfficient`, y cae al MP4 si no responde en 1,5 s. Nada de `<source>` en orden: elegiría AV1 decodificado por software, y en el pase cada tirón es un salto adelante.
  * La cadena `av01.0.08M.10` (Main, nivel 4.0, 10 bits) es la que produce el script de codificación, que verifica ese nivel en cada archivo.
  * Recuperación en `EventDetail`: firma a punto de caducar → fuentes nuevas con el mismo códec; fallo del AV1 → MP4 en el mismo instante; fallo del MP4 → fuentes nuevas, como mucho 3 en 10 min. Después, el error.
* **Refuerzo del reproductor:** `controlsList="nodownload …"`, sin menú contextual, `disablePictureInPicture` y `disableRemotePlayback`. El PiP no era solo estética: su ventana tiene un botón de pausa y la corrección de deriva ignora un vídeo pausado.
* **Guarda en el borde**, versionada en `deploy/cloudfront/event-video-guard.js`: 403 si `Sec-Fetch-Dest` es una navegación. Se despliega a mano desde la consola; cambiar el fichero no la cambia en CloudFront.
* **El límite, dicho sin rodeos:** un asistente técnico puede descargar el MP4 durante el pase («Copiar como cURL»). Solo el DRM lo evitaría, y se descartó por simplicidad junto con HLS. Detalle en `docs/eventos-video/04-alcance-de-la-proteccion.md`.
* **«Evento de prueba» (`events.is_test`), dos puntos de lectura:**
  * `marketingEmailService.buildEvent` devuelve `null`. Es el único constructor del anuncio de eventos, así que cubre la creación y la edición.
  * `eventService.getEventsByDateRange` los excluye, y con él desaparecen de `/live` y del sitemap.

  `getEventBySlug` **no** filtra (el enlace directo de quien prueba tiene que funcionar), y la página lleva `noindex` y no declara JSON-LD. Desmarcar la casilla en un evento programado pide confirmación, porque ese guardado envía el anuncio.
* **Codificación: `node scripts/video/optimizar-video.mjs <video>`** genera el `_h264.mp4`, el `_av1.mp4` y un informe junto al original, eligiendo el CRF con VMAF. Tres reglas medidas, que no se tocan sin volver a medir:
  * **Etiquetar el color con `setparams`**, nunca con `-colorspace`/`-color_*` como opciones de salida: con un original sin etiquetar, esas opciones convierten los colores (22 dB de PSNR).
  * **La misma etiqueta en las dos entradas del VMAF**: si no, ffmpeg convierte una antes de comparar y el resultado sale falso.
  * **La PSNR de luma como vigilante del color**: VMAF puntuaba 100 un vídeo con el color alterado.
* **Punto ciego conocido:** `client/` sigue sin runner de tests. La selección de fuente, la recuperación, el formulario y la confirmación se verifican a mano con la lista de `docs/eventos-video/05-entornos-y-pruebas.md`. El servidor está cubierto por `cloudfrontSigner`, `eventVideoSources`, `eventVideoDelivery` y `eventTestMode`.
