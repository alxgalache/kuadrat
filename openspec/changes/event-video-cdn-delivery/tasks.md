## 1. Esquema y configuración

- [x] 1.1 Añadir `video_url_av1 TEXT` e `is_test INTEGER NOT NULL DEFAULT 0` al `CREATE TABLE events` de `api/config/database.js`, y sus dos `safeAlter` junto a los de `recording_enabled`. Los comentarios no pueden acabar línea en punto y coma ni llevar barras invertidas.
- [x] 1.2 Añadir el bloque `config.eventVideoCdn` a `api/config/env.js` con `EVENT_VIDEO_CDN_URL`, `EVENT_VIDEO_CF_KEY_PAIR_ID` y `EVENT_VIDEO_CF_PRIVATE_KEY_B64`:
  - todas o ninguna, y con una configuración parcial el arranque sale con la lista de las que faltan;
  - el origen debe ser `https://` y sin ruta;
  - la clave, decodificada de base64, debe pasar `crypto.createPrivateKey` y ser RSA;
  - exponer `enabled`, `origin`, `keyPairId` y el `KeyObject`.
- [x] 1.3 Documentar las tres variables en `api/.env.example` (qué son, que no son una credencial de AWS y cómo generar el base64). En `api/.env.test` dejarlas vacías y comentadas: los tests inyectan su propia clave.

## 2. Firma y clasificación (API)

- [x] 2.1 Crear `api/utils/cloudfrontSigner.js`:
  - `signUrl(url, { expiresAt })` con política personalizada, `Resource` igual a la URL exacta, RSA-SHA256, los reemplazos `+ = /` → `- _ ~` y los parámetros `Policy`, `Signature`, `Key-Pair-Id` y `Hash-Algorithm=SHA256`, respetando una query previa;
  - `isConfigured()` y `__configureForTests()`.
- [x] 2.2 Crear `api/utils/eventVideoSources.js`:
  - la constante `EVENT_VIDEO_CDN_PREFIX = '/eventos-video/'`;
  - `classifyVideoUrl(value)` → `uploaded | protected | external | invalid`;
  - `videoTokenExpiry(event, now)` con la fórmula del diseño;
  - `validateVideoUrls(current, incoming)`, que valida solo los campos presentes que cambian y devuelve `{ code, message }` o `null` con los códigos `EVENT_VIDEO_*`.
- [x] 2.3 Tests `api/tests/cloudfrontSigner.test.js`:
  - generar un par RSA en el test;
  - verificar la firma con la clave pública y que la política decodificada tiene el `Resource` exacto sin comodines y el `DateLessThan` pedido;
  - comprobar los reemplazos de caracteres y la URL con query previa.
- [x] 2.4 Tests de `eventVideoSources`:
  - la matriz de clasificación con firma configurada y sin ella;
  - los cuatro rechazos, AV1 sin MP4 y `uploaded:` en AV1;
  - no validar un valor que no cambia;
  - la caducidad en los tres casos (a mitad del pase, tras el final previsto y el tope de 6 h).

## 3. Escritura y lectura de eventos (API)

- [x] 3.1 Añadir `video_url_av1` e `is_test` a `createEventSchema` y `updateEventSchema`. `is_test` acepta booleano, `0` o `1`, igual que los flags de host.
- [x] 3.2 En `eventAdminController.createEvent` y `updateEvent`:
  - desestructurar o propagar las dos columnas, con `toFlag(is_test)`;
  - llamar a `validateVideoUrls` sobre el estado resultante y responder 400 con el código en `title` y el texto en `message`.
- [x] 3.3 Añadir las dos columnas al `INSERT` de `eventService.createEvent` y a `allowedFields` de `updateEvent`.
- [x] 3.4 `eventService.getEventsByDateRange`: añadir `AND e.is_test = 0`.
- [x] 3.5 `eventController.toPublicEvent`: quitar `video_url` y `video_url_av1` y añadir `has_video`. Aplica a `getEvents` y `getEventBySlug`.
- [x] 3.6 `eventController.getVideoToken`:
  - aceptar solo `status = 'active'`;
  - modo `uploaded` → `{ mode: 'uploaded', vtoken, filename }`, sin cambios;
  - modo URL → `{ mode: 'url', sources: { mp4, av1 }, expiresAt }`, firmando las `protected`;
  - 503 `EVENT_VIDEO_SIGNING_UNAVAILABLE` si hay una `protected` sin firma configurada;
  - registrar la emisión con `logger.info` sin la URL.
- [x] 3.7 `marketingEmailService.buildEvent`: devolver `null` si `event.is_test`, con un log de depuración. Exportar `buildEvent` para los tests.
- [x] 3.8 Tests `api/tests/eventVideoDelivery.test.js`:
  - las respuestas públicas (ficha y calendario) sin URLs y con `has_video`;
  - `video-token` en `active` con fuentes firmadas y verificables, en `finished` con 400, sin pago con 403, sin credenciales con 403, externa sin firmar, protegida sin firma con 503 y `uploaded` sin cambios;
  - el recorrido de escritura de `video_url_av1` e `is_test` por los cuatro sitios (Zod en los dos esquemas, `INSERT` y `allowedFields`), como `eventHostFlags.test.js`.
- [x] 3.9 Tests `api/tests/eventTestMode.test.js`:
  - `buildEvent` devuelve `null` para un evento de prueba `scheduled` y un anuncio para el mismo evento sin la marca;
  - `getEventsByDateRange` excluye las pruebas;
  - `getEventBySlug` las devuelve.
- [x] 3.10 Ejecutar la batería completa (`docker compose exec api npm test`); `testEnvironmentIsolation` en verde.

## 4. Guarda en el borde

- [x] 4.1 Crear `deploy/cloudfront/event-video-guard.js` (runtime `cloudfront-js-2.0`): 403 si `sec-fetch-dest` es `document`, `iframe`, `frame`, `embed` u `object`, y dejar pasar todo lo demás, incluida la ausencia de la cabecera. Con un comentario de cabecera que remita a `docs/eventos-video/03-configurar-aws.md`.
- [x] 4.2 Verificar la función en la consola de CloudFront (pestaña *Test*) con los cuatro eventos de prueba de `docs/eventos-video/03-configurar-aws.md` (`document` → 403; `video`, sin cabecera y `iframe` → lo esperado). No hay test de Jest a propósito: el contenedor `api` solo monta `api/` y ningún test puede leer `deploy/`, el mismo punto ciego que el cliente.

## 5. Cliente: reproducción

- [x] 5.1 Añadir a `client/lib/constants.js`: `EVENT_VIDEO_AV1_CONTENT_TYPE` (`video/mp4; codecs="av01.0.08M.10"`), las dimensiones, el bitrate y los fps de la sonda, el tiempo máximo de la sonda (1500 ms), el límite de recuperación (3 en 10 min) y los textos de los errores `EVENT_VIDEO_*`.
- [x] 5.2 Crear `client/lib/eventVideoSource.js` con `pickVideoSource({ mp4, av1 })`: `decodingInfo` con tiempo máximo, AV1 solo si `supported && powerEfficient` y MP4 en cualquier otro caso.
- [x] 5.3 `EventDetail.js`:
  - pedir `/video-token` para todo evento de vídeo con `has_video` y acceso (no solo `uploaded:`);
  - construir la URL del modo `uploaded` como hoy y elegir la fuente con `pickVideoSource` en el modo URL;
  - implementar la recuperación: de AV1 a MP4, y después un token nuevo con límite;
  - quitar las lecturas de `event.video_url`.
- [x] 5.4 `EventVideoPlayer.js`:
  - prop `onFatalError`, llamada al agotar los reintentos o ante `MEDIA_ERR_DECODE`, en lugar de fijar el error definitivo;
  - añadir `controlsList`, `disablePictureInPicture`, `disableRemotePlayback` y `onContextMenu` con `preventDefault`;
  - comprobar en la consola que React 19 no emite avisos con esos atributos.
- [x] 5.5 `live/[slug]/page.js`: `robots: { index: false, follow: false }` y sin JSON-LD `Event` cuando `event.is_test`.

## 6. Cliente: panel de admin

- [x] 6.1 `admin/espacios/nuevo/page.js`:
  - en el modo «URL del vídeo», dos campos: «URL del vídeo (MP4 H.264) *» y «URL de la versión AV1 (opcional)»;
  - aviso «Este vídeo no estará protegido» cuando la URL no es del CDN protegido;
  - casilla «Evento de prueba» con su explicación;
  - enviar `video_url_av1` e `is_test`.
- [x] 6.2 `admin/espacios/[id]/page.js`:
  - los mismos campos, cargados desde el evento;
  - confirmación al desmarcar «Evento de prueba» con el evento `scheduled`, con `ConfirmDialog`;
  - insignia «Prueba» en el detalle.
- [x] 6.3 `admin/espacios/page.js`: insignia «Prueba» junto al estado.
- [x] 6.4 Mostrar los errores `EVENT_VIDEO_*` con sus textos de `constants.js`.
- [x] 6.5 `npm run lint` y compilación de producción del cliente (`docker compose exec -e NODE_ENV=production client npm run build`).

## 7. Documentación

- [x] 7.1 Revisar que `docs/eventos-video/00…05` coinciden con lo implementado: nombres de variables, prefijo, códigos de error, textos del formulario y la constante `av01.0.08M.10`, que el script `scripts/video/optimizar-video.mjs` (ya entregado) verifica en cada AV1.
- [x] 7.2 Añadir a `CLAUDE.md` una sección «Vídeo pregrabado por CloudFront (`event-video-cdn-delivery`)» con las reglas que sostienen el diseño:
  - el prefijo como marcador de protección;
  - la firma por pase;
  - las URLs fuera de la API pública;
  - un par de claves por entorno;
  - `is_test` en `buildEvent` y en `getEventsByDateRange`;
  - el límite honesto de la protección;
  - el proceso de codificación: `scripts/video/optimizar-video.mjs` y sus tres reglas medidas (etiquetar el color con `setparams`, la misma etiqueta en las dos entradas del VMAF, la PSNR de luma como vigilante del color).
- [x] 7.3 Añadir `EVENT_VIDEO_*` al apartado de variables de entorno de `CLAUDE.md`.

## 8. Operación (manual, la hace el operador: no es tarea de implementación)

- [x] 8.1 Configurar AWS según `docs/eventos-video/03-configurar-aws.md`: claves, *key group*, función, *behavior* y verificación del 403.
- [ ] 8.2 Poner las variables en `api/.env.staging` (Mac mini) y en `api/.env` de producción (`05-entornos-y-pruebas.md`).
- [ ] 8.3 Probar en preproducción con la lista de comprobación de `05`.
- [ ] 8.4 Desplegar producción con `./deploy/deploy.sh` y hacer el ensayo con un evento marcado como prueba.
- [ ] 8.5 Codificar el vídeo definitivo (`01` y `02`), subirlo a `eventos-video/` y crear el evento real.
