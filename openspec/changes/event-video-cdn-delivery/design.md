## Context

Un evento `format = 'video'` es hoy un pase sincronizado:

- Al pulsar «Iniciar», el admin fija `video_started_at = now()`.
- Cada espectador calcula `ahora − video_started_at` con el desfase de reloj de `serverNow`, busca esa posición y reproduce.
- Cada 10 s el reproductor corrige la deriva y, tras un *buffering*, salta a la posición esperada.
- Solo hay controles de volumen y de pantalla completa.

El origen del vídeo tiene dos modos:

| Modo | `video_url` | Entrega | Protección |
|---|---|---|---|
| Subir archivo | `uploaded:<fichero>` | Express (`fs.createReadStream`) con Range, tras `POST /video-token` (HMAC, 2 h) | Sí |
| URL | `https://…` | `<video src>` directo | **Ninguna**: la URL sale en `GET /api/events` y `/api/events/:slug` |

La infraestructura de medios ya existe y se ha comprobado desde fuera:

- `cdn.140d.art` es una distribución de CloudFront delante del bucket de medios.
- El bucket tiene «Bloquear todo el acceso público» activado: `GET` directo a S3 → 403, `GET` por el CDN → 200. CloudFront lee con OAC.
- El nombre no tiene registro AAAA; se sirve solo por IPv4.
- **Política del bucket revisada el 28/09/2026, sin cambios necesarios:**
  - es la plantilla OAC de la consola (`cloudfront.amazonaws.com` + `AWS:SourceArn` de la distribución `E3AXP7BKPD0P8K`);
  - solo concede `s3:GetObject` (sin `ListBucket`), por eso un objeto inexistente responde 403;
  - las ACL están desactivadas (propietario impuesto).
  - El CORS del bucket es irrelevante para este cambio: el `<video>` no usa `crossorigin`, y el *behavior* nuevo, sin política de solicitud al origen, no reenvía `Origin`.
  - El *behavior* nuevo usa el mismo origen y el mismo OAC, así que la política ya lo cubre.

Restricciones:

- **Filosofía de mínima complejidad.** HLS descartado de forma definitiva.
- **Preproducción** (Mac mini) no tiene credenciales de AWS ni IMDS, por decisión.
- **Producción** es una `t4g.medium` con red base de 256 Mb/s.
- `client/` no tiene runner de tests.

Decisiones ya tomadas con el usuario: propuesta «A reforzada», dos campos de URL (MP4 siempre, AV1 casi siempre) y campo «Evento de prueba» que además oculta el evento del público.

## Goals / Non-Goals

**Goals:**
- Servir el vídeo desde CloudFront sin que pase por la EC2.
- Que solo pueda obtener una URL válida quien tiene acceso, y solo durante el pase.
- Que ninguna URL de vídeo aparezca en respuestas públicas.
- Ofrecer AV1 donde el dispositivo lo decodifica eficientemente, con MP4 como red de seguridad.
- Que preproducción y producción usen exactamente el mismo mecanismo.
- Poder ensayar en producción sin comunicar nada a los suscriptores y sin exponer el evento al público.
- Poner el listón alto frente al usuario casual: abrir la URL en una pestaña, «Guardar vídeo como», PiP.

**Non-Goals:**
- Impedir que un usuario técnico descargue el MP4 durante el pase con «Copiar como cURL» o un gestor de descargas. No es posible con MP4 progresivo; está documentado en `docs/eventos-video/04-alcance-de-la-proteccion.md`.
- Impedir la grabación de pantalla. Imposible en general.
- DRM, HLS/DASH, bitrate adaptativo y limitación temporal de bytes en el borde. Considerados y rechazados.
- Subir el vídeo a S3 desde la aplicación. Se sube a mano desde la consola, como los vídeos de `stories/`.
- Cambiar el modo «Subir archivo», que se conserva sin cambios y sin uso, incluido su vtoken de 2 h.
- Arrancar el pase automáticamente a la hora del evento.

## Decisions

### 1. «Protegido» se reconoce por prefijo, no con una opción nueva

El admin pega la URL del CDN tal cual (`https://cdn.140d.art/eventos-video/<evento>/<fichero>.mp4`). No hay una tercera opción «archivo del CDN».

- Es protegida toda URL cuyo **origen** coincide con `EVENT_VIDEO_CDN_URL` **y** cuya ruta empieza por `/eventos-video/`.
- El prefijo es una constante de la API. En CloudFront corresponde al *behavior* `eventos-video/*` con acceso restringido.
- Una sola función, `classifyVideoUrl()` en `api/utils/eventVideoSources.js`, devuelve `'uploaded' | 'protected' | 'external' | 'invalid'`. La consumen la validación al guardar y el endpoint de token.

*Alternativa descartada:* un esquema propio (`cdn:<clave>`). El usuario lo descartó, y además obligaba a traducir entre lo que el admin ve en S3 y lo que guarda.

### 2. Validación al guardar, en el controlador y solo sobre valores que cambian

La validación depende de la configuración, así que vive en el controlador, como `validateProviderBusinessRules`. Zod se limita a la forma.

- **Solo se valida lo que cambia.** Se validan los campos presentes cuyo valor difiere del guardado. El formulario de edición reenvía todo el objeto, y un evento antiguo con una URL `http://` no debe volverse ineditable.
- **Rechazos, con código máquina en `title`** (mismo patrón que `SHIPPING_*`):
  - `EVENT_VIDEO_URL_INVALID`: la URL no es `https://` o no se puede interpretar.
  - `EVENT_VIDEO_URL_UNPROTECTED`: la URL está en el CDN protegido pero fuera de `eventos-video/`, así que sería pública.
  - `EVENT_VIDEO_SIGNING_UNAVAILABLE`: la ruta es `/eventos-video/…` y el servidor no tiene configurada la firma. Sin esto, se guardaría y fallaría el día del evento.
  - `EVENT_VIDEO_AV1_REQUIRES_MP4`: hay AV1 sin MP4 en el estado resultante. También se rechaza `uploaded:` en `video_url_av1`.
- **Una URL de otro host se acepta como externa**, sin firma. El formulario avisa: «Este vídeo no estará protegido».

### 3. URLs firmadas con política personalizada, SHA-256 y `crypto` nativo

- **Formato.** `api/utils/cloudfrontSigner.js` construye la política `{"Statement":[{"Resource":"<url>","Condition":{"DateLessThan":{"AWS:EpochTime":<exp>}}}]}`. La firma es `crypto.sign('sha256', policy, privateKey)`, codificada en base64 con los tres reemplazos de CloudFront (`+→-`, `=→_`, `/→~`). Se añaden `Policy`, `Signature`, `Key-Pair-Id` y `Hash-Algorithm=SHA256`.
- **`Resource` es la URL exacta del objeto**, sin comodín. Una firma no sirve para otro fichero.
- **Sin dependencia nueva.** `@aws-sdk/cloudfront-signer` no está publicado en la versión `3.1024.0` que fija el resto del SDK. Mezclar versiones duplicaría `@smithy/*`, y la firma son unas veinte líneas verificables en test con la clave pública.
- **Solo RSA 2048.** CloudFront admite también ECDSA P-256, pero no se documenta ni se soporta: una sola forma de hacerlo. El arranque comprueba `asymmetricKeyType === 'rsa'`.

*Alternativa descartada:* URLs prefirmadas de S3. Se firman con las credenciales temporales del rol de la instancia y mueren cuando estas rotan. Además preproducción no tiene rol, y se perdería la caché del borde.

### 4. Configuración por entorno: tres variables, todas o ninguna

- **Variables:** `EVENT_VIDEO_CDN_URL` (solo el origen, `https://`, sin ruta), `EVENT_VIDEO_CF_KEY_PAIR_ID` y `EVENT_VIDEO_CF_PRIVATE_KEY_B64` (el PEM en base64, en una línea).
- **Base64 porque** el `env_file` de Docker Compose no es fiable con valores de varias líneas, y un PEM con `\n` escapados se rompe en silencio.
- **Configuración parcial, origen inválido o clave ilegible → el arranque falla**, igual que `config.recording`.
- **Un par de claves por entorno**, con las dos claves públicas en el mismo *key group* (admite cinco). Si se revoca la de preproducción, producción no se entera. La de producción nunca sale de la EC2.
- **No contradice «ninguna credencial de AWS en un `.env`».** No es una credencial de AWS: no puede llamar a ninguna API, solo firmar URLs de ese *key group*. Es la misma excepción razonada que la llave S3 de Agora.
- **Preproducción funciona** porque firmar es local. Usa el mismo `EVENT_VIDEO_CDN_URL` (el CDN de producción) y el mismo objeto en S3; solo cambia el par de claves.
- **Bajo `NODE_ENV=test`** las variables quedan vacías en `.env.test`, y los tests inyectan una clave generada en tiempo de ejecución con `__configureForTests()`. `.env.test` no lleva ningún PEM.

### 5. La firma dura lo que dura el pase

`expiresAt = min(now + 6 h, max(now + 15 min, video_started_at + duration_minutes + 30 min))`

- **CloudFront comprueba la firma en cada petición nueva.** El MP4 progresivo hace una petición Range en cada búsqueda, en cada corrección de deriva y tras cada *buffering*, así que la firma debe cubrir todo el pase o el vídeo moriría a mitad.
- **Una firma corta no impide descargar.** Una descarga iniciada antes de caducar termina igualmente. Por eso no se busca brevedad: se busca que el enlace no sirva después del pase.
- **Si el vídeo dura más que `duration_minutes`**, lo resuelve la recuperación del cliente (decisión 8).

### 6. El token solo existe con el evento `active`; la API pública ya no lleva URLs

- **`POST /api/events/:id/video-token`**:
  - Mantiene el control de acceso actual: asistente verificado vía `getAttendeeByAccessToken`, que pague con `requiresPayment`, o host/admin por JWT.
  - Deja de aceptar `finished`.
  - Respuesta nueva: `{ mode: 'url', sources: { mp4, av1 }, expiresAt }`. Lo protegido va firmado y lo externo tal cual.
  - El modo `uploaded` conserva su respuesta `{ mode: 'uploaded', vtoken, filename }`.
  - Una URL protegida sin firma configurada → 503 `EVENT_VIDEO_SIGNING_UNAVAILABLE`, nunca una URL sin firmar.
- **Registro.** Se anota cada emisión (`eventId`, sujeto, modo, protegida sí/no), **nunca** la URL.
- **`toPublicEvent`** quita `video_url` y `video_url_av1` y añade `has_video`. `is_test` se queda porque la página lo necesita en el servidor para el `noindex`.
- **Cambio incompatible:** el cliente nuevo lee `has_video` y el antiguo leía `video_url`. API y cliente se despliegan juntos (`deploy.sh` ya purga la caché de páginas de nginx).

### 7. AV1 solo si el dispositivo lo decodifica por hardware

`client/lib/eventVideoSource.js` expone `pickVideoSource({ mp4, av1 })`.

- **Criterio.** Con `av1` presente, consulta `navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: 'video/mp4; codecs="av01.0.08M.10"', width: 1920, height: 1080, bitrate, framerate: 25 } })` y elige AV1 solo si `supported && powerEfficient`.
- **Sin la API, o sin respuesta en 1,5 s → MP4.** El tiempo máximo evita que un navegador que tarda deje el reproductor en blanco.
- **Constantes** en `client/lib/constants.js`. El códec sale de la receta documentada (perfil Main, nivel 4.0, 10 bits).
- **Por qué no `<source>` en orden** (lo que proponía la respuesta original): el navegador elegiría AV1 en cuanto *puede* decodificarlo, también por software. En un portátil viejo o un móvil de gama media eso da tirones, y en este reproductor cada tirón acaba en un salto hacia delante.
- **Por qué un único `src`:** se conserva intacta la máquina de estados de `load()`, búsqueda y reintentos, que ya está especificada.

### 8. Recuperación: AV1 → MP4 → token nuevo, sin cambiar la lógica de sincronía

`EventVideoPlayer` recibe `onFatalError`. Cuando agota sus reintentos, o ante un `MEDIA_ERR_DECODE`, avisa al padre en lugar de pintar el error definitivo.

- `EventDetail` decide:
  - Si el fallo llega en el último minuto antes de `expiresAt` (la firma ha caducado o está a punto), pide fuentes nuevas conservando el códec.
  - Si no, y la fuente era AV1, pasa al MP4. Tras un `MEDIA_ERR_DECODE` no vuelve a intentar el AV1.
  - Si era el MP4, pide un token nuevo, como máximo 3 veces en 10 minutos.
  - Solo después se muestra «No se pudo reproducir el vídeo».
- Cambiar el `src` ya reinicia la sincronía (requisito «Video source change resets sync state»), y la posición sale del reloj, así que el cambio de fuente no pierde el sitio.
- El guard por ref que evita pedir tokens de más se conserva para el primer token. La recuperación va por su propia ruta con límite.

### 9. Refuerzo en el reproductor y guarda en el borde

- **`<video>`:** `controlsList="nodownload noremoteplayback noplaybackrate"`, `disablePictureInPicture` y `disableRemotePlayback`. El contenedor lleva `onContextMenu` con `preventDefault`.
  - Quitar el PiP no es solo estética: la ventana de PiP tiene su propio botón de pausa y la corrección de deriva ignora un vídeo pausado. Era un agujero en la sincronía.
- **CloudFront Function `event-video-guard`** (runtime `cloudfront-js-2.0`, en *viewer request* del behavior `eventos-video/*`), versionada en `deploy/cloudfront/event-video-guard.js`:
  - Responde 403 cuando `Sec-Fetch-Dest` es una navegación (`document`, `iframe`, `frame`, `embed`, `object`) y deja pasar todo lo demás, que sigue necesitando firma válida.
  - Lista de bloqueo y no de permitidos: si falta la cabecera (Safari anterior a 16.4, AVFoundation en iOS) se deja pasar, porque rechazarlo rompería la reproducción legítima.
  - Coste nulo en la práctica: dos millones de invocaciones gratis al mes.

*Descartado:* ligar la firma a la IP. La política de CloudFront no admite IPv6. Además la IP que ve la API y la que ve CloudFront pueden no coincidir (CGNAT, iCloud Private Relay, pasar de wifi a datos), y un token nuevo no lo arreglaría.

### 10. «Evento de prueba»: una columna y tres puntos de lectura

- **Columna:** `events.is_test INTEGER NOT NULL DEFAULT 0`, en el `CREATE TABLE` y con `safeAlter`. Recorre los cuatro sitios de escritura de los flags (dos esquemas Zod, `INSERT` y `allowedFields`), cubiertos por test igual que en `eventHostFlags.test.js`.
- **Marketing:** `marketingEmailService.buildEvent` devuelve `null` si `is_test`. Es el único constructor del anuncio de eventos, así que cubre a la vez el gancho de creación y el de edición. No hay otro camino que mande un evento a la newsletter.
- **Listados:** `eventService.getEventsByDateRange` filtra `AND e.is_test = 0`. Esa función alimenta `/live` y el sitemap, que son sus dos únicos consumidores.
- **Indexación:** en `live/[slug]/page.js`, `generateMetadata` devuelve `robots: { index: false, follow: false }` y se omite el JSON-LD `Event`.
- `getEventBySlug` **no** filtra: el enlace directo tiene que funcionar para quien prueba.
- **Admin:**
  - Casilla en los formularios de crear y editar, e insignia «Prueba» en el listado y en el detalle.
  - Desmarcarla en un evento `scheduled` pide confirmación, porque ese guardado enviaría el anuncio.
- **Emails transaccionales:** el código de verificación y el acceso siguen saliendo hacia el buzón de quien prueba, porque son parte de lo que se prueba y no van a suscriptores.
- **Límite:** un evento de prueba de pago cobraría y abonaría de verdad. La guía indica probar con eventos gratuitos. No se añade lógica para ese caso.

## Risks / Trade-offs

- **Un asistente técnico descarga el MP4 durante el pase** («Copiar como cURL») → Riesgo aceptado explícitamente. Mitigado por la caducidad al acabar el pase, por la guarda de navegación y por la sesión única por asistente: verificar el email en otro dispositivo invalida la sesión anterior para pedir URLs nuevas, aunque las ya emitidas valen hasta que caducan. Documentado sin eufemismos.
- **Un *behavior* mal ordenado deja el vídeo público.** Si otro *behavior* coincide antes que `eventos-video/*` (por ejemplo `*.mp4`), el vídeo sale sin firma → La guía exige comprobar que `eventos-video/*` tiene precedencia 0. La verificación final (un `curl` sin firma debe dar 403) lo detecta.
- **Subir el vídeo antes de crear el *behavior*.** Estaría público durante ese intervalo → Orden fijado en la guía: primero el *behavior*, después la subida.
- **Sobrescribir un vídeo con el mismo nombre.** El borde sirve la versión vieja hasta 24 h → Regla: una versión nueva lleva un nombre nuevo, igual que `stories/`.
- **`duration_minutes` menor que el vídeo** → La firma caduca antes del final. Lo cubre la recuperación con token nuevo; la guía pide poner la duración real más un margen.
- **Que `mediaCapabilities` diga `powerEfficient` y aun así falle** (controladores, un AV1 codificado fuera de receta) → Paso automático a MP4 en el mismo instante del pase.
- **La clave privada de producción se filtra** → Cualquiera podría firmar URLs de `eventos-video/*`. Se rota según la guía (nueva clave en el *key group*, desplegar, retirar la vieja). El alcance es solo ese prefijo.
- **Desplegar la API sin el cliente o al revés** → El cliente viejo no encuentra `video_url` y no carga el vídeo; el nuevo con la API vieja no recibe `sources`. Se despliegan juntos con `deploy.sh`.

## Migration Plan

1. **AWS** (operador, `docs/eventos-video/03-configurar-aws.md`):
   - Crear los dos pares de claves y el *key group*.
   - Crear la función de guarda.
   - Crear el *behavior* `eventos-video/*` con acceso restringido, la función asociada y precedencia 0.
   - Verificar el 403 sin firma.
2. **Variables** en `api/.env.staging` (Mac mini) y en `api/.env` de producción. Sin ellas la API arranca igual, con la firma desactivada.
3. **Desplegar preproducción** y probar según `05-entornos-y-pruebas.md`.
4. **Desplegar producción** con `./deploy/deploy.sh`, que despliega API y cliente juntos y purga la caché.
5. **Ensayo en producción** con un evento marcado como prueba.
6. **Subir el vídeo definitivo** y crear el evento real.

**Vuelta atrás:** revertir el despliegue. Las columnas nuevas se quedan (son aditivas y con valor por defecto), y el *behavior* de CloudFront no afecta al resto del CDN.

## Open Questions

Ninguna que bloquee. La fecha y el aforo previsto del evento real solo afectan a la planificación de las pruebas, no al diseño.
