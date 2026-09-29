## Why

Los eventos de vídeo pregrabado (`events.format = 'video'`) no sirven para el primer caso real: una actuación musical de 34 min (1,2–2 GB optimizada) para el público registrado.

- **«Subir archivo» no sirve.** Admite como máximo 500 MB, y además cada byte saldría de la EC2 a través de Node (0,75 vCPU). 50 espectadores a 6 Mb/s son 300 Mb/s, por encima de la red base de la `t4g.medium` (256 Mb/s), y el sitio entero se frenaría durante el evento.
- **«URL del vídeo» funciona, pero sin protección.** Técnicamente reproduce un MP4 de `cdn.140d.art`, pero `video_url` sale en `GET /api/events/:slug` y en el calendario público. Cualquiera, sin registrarse, puede ver o descargar el vídeo antes, durante o después del pase, saltándose la sincronía.
- **No hay forma de ofrecer AV1.** Con un solo `src`, un AV1 dejaría sin vídeo a los dispositivos que no lo decodifican.
- **Probar en producción avisaría a toda la newsletter.** Crear o programar un evento de prueba envía el anuncio de Resend a todos los suscriptores del topic de eventos.

## What Changes

- **Entrega protegida por CloudFront.** Las URLs de vídeo que apuntan al CDN configurado, bajo el prefijo `eventos-video/`, se sirven como **URLs firmadas de CloudFront** (política personalizada, SHA-256), emitidas solo por `POST /api/events/:id/video-token`.
  - Solo reciben una URL los asistentes verificados, que hayan pagado si el evento es de pago, o el host/admin, y solo mientras el evento está `active`.
  - La firma caduca al final previsto del pase más un margen.
  - La clave privada de firma vive en el `.env` de cada entorno, con un par de claves distinto en producción y en preproducción, ambos en el mismo *key group*. Firmar es criptografía local: no necesita credenciales de AWS, así que preproducción funciona igual que producción.
- **BREAKING (API pública).** `GET /api/events` y `GET /api/events/:slug` dejan de devolver `video_url` y `video_url_av1`, y pasan a devolver `has_video`. El cliente obtiene las fuentes siempre por `/video-token`. **API y cliente se despliegan juntos.**
- **Nueva columna `events.video_url_av1`** (nula): una versión AV1 opcional del mismo vídeo. En el formulario de admin, «URL del vídeo» pasa a ser dos campos: «URL del vídeo (MP4 H.264)» y «URL de la versión AV1 (opcional)».
  - El reproductor usa el AV1 solo cuando el dispositivo lo decodifica por hardware (`mediaCapabilities.decodingInfo` → `supported && powerEfficient`).
  - Si no, o si el AV1 falla en reproducción, pasa al MP4 en el mismo instante del pase.
- **Validación de URLs al guardar.**
  - Una URL del CDN protegido fuera de `eventos-video/` se rechaza, porque sería pública.
  - Una URL bajo `eventos-video/` se rechaza si el servidor no tiene configurada la firma.
  - El AV1 exige el MP4.
- **Reproductor reforzado.** Sin menú contextual, sin picture-in-picture (desde la ventana de PiP se podía pausar), sin reproducción remota y con `controlsList="nodownload"`.
  - Si la URL caduca o se rechaza a mitad del pase, pide un token nuevo y retoma en la posición del reloj.
- **Guarda en el borde (en AWS, sin código de la app).** Una CloudFront Function versionada en `deploy/cloudfront/` rechaza las navegaciones directas a los vídeos (`Sec-Fetch-Dest: document`), para que copiar la URL en una pestaña no dé un reproductor con descarga.
- **Campo «Evento de prueba»** (`events.is_test`), al crear y al editar:
  - Un evento de prueba **nunca** dispara el anuncio de marketing (newsletter/topic de eventos), ni al crearlo ni al editarlo.
  - No aparece en `/live`, el calendario ni el sitemap, y su página lleva `noindex`. Solo se llega a él por enlace directo.
  - Desmarcarlo en un evento programado pide confirmación, porque en ese momento se enviaría el anuncio.
- «Subir archivo» se mantiene tal cual; no se usará.
- **Documentación operativa** en `docs/eventos-video/`: optimizar el vídeo en Ubuntu, generar y comparar el AV1, configurar AWS paso a paso, alcance de la protección, y variables, entornos y pruebas.

## Capabilities

### New Capabilities
- `event-video-cdn-delivery`: cómo se definen, validan, protegen y entregan las fuentes de vídeo de un evento pregrabado (URLs firmadas de CloudFront, privacidad de las URLs, versión AV1 con fallback, reproductor reforzado y recuperación ante una firma caducada).
- `event-test-mode`: eventos marcados como prueba (sin comunicaciones de marketing, fuera de los listados públicos, del sitemap y de la indexación).

### Modified Capabilities
- `live-event-announcement`: el anuncio automático excluye los eventos marcados como prueba, también cuando uno se edita estando en `scheduled`.

## Impact

- **Base de datos:** `events.video_url_av1 TEXT` y `events.is_test INTEGER NOT NULL DEFAULT 0`, en el `CREATE TABLE` y con `safeAlter`, sin backfill.
- **API:**
  - `config/env.js`: nuevo bloque `eventVideoCdn`; una configuración parcial o una clave ilegible hace fallar el arranque.
  - Nueva utilidad de firma de CloudFront con `crypto` nativo, sin dependencia nueva.
  - `eventController`: `toPublicEvent` y `getVideoToken`.
  - `eventService`: escritura de las dos columnas y exclusión de las pruebas en `getEventsByDateRange`.
  - Validadores de eventos.
  - `marketingEmailService.buildEvent`.
- **Cliente:**
  - `EventDetail` y `EventVideoPlayer`: selección AV1/MP4, refuerzo y recuperación.
  - Formularios de admin de crear y editar (dos campos de URL y la casilla de prueba), y la insignia «Prueba» en el listado de admin.
  - `live/[slug]/page.js` (`noindex`).
  - Constantes en `lib/constants.js`.
- **AWS (manual, lo hace el operador):**
  - Dos pares de claves y un *key group*.
  - Un *behavior* `eventos-video/*` con acceso restringido en la distribución de `cdn.140d.art`.
  - La CloudFront Function de guarda.
  - Subir los vídeos a mano al bucket de medios.
- **Entornos:** tres variables nuevas en `api/.env` de producción y en `api/.env.staging` (Mac mini). Sin variables `NEXT_PUBLIC_*` nuevas y sin cambios de CSP (`media-src` ya admite `https:`).
- **Tests:** privacidad de la respuesta pública, emisión y verificación de firmas, validación de URLs, recorrido de escritura de las columnas, exclusión de las pruebas en listados y anuncio, y configuración parcial.
