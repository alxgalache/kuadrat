## ADDED Requirements

### Requirement: Fuentes de vídeo de un evento pregrabado

Un evento `format = 'video'` SHALL guardar dos fuentes:

- `video_url`: el MP4 H.264. Es obligatorio para que haya reproducción.
- `video_url_av1`: una versión AV1 opcional del mismo vídeo.

`video_url` SHALL admitir una URL `https://` o el valor `uploaded:<fichero>` del modo «Subir archivo». `video_url_av1` SHALL admitir solo una URL `https://`. Las dos columnas SHALL escribirse en la creación y en la edición a través de los dos esquemas Zod, del `INSERT` de `eventService.createEvent` y de `allowedFields` de `eventService.updateEvent`.

#### Scenario: Crear un evento con las dos versiones
- **WHEN** el admin crea un evento de vídeo con `video_url = https://cdn.140d.art/eventos-video/lynda/lynda_h264.mp4` y `video_url_av1 = https://cdn.140d.art/eventos-video/lynda/lynda_av1.mp4`
- **THEN** el evento guarda ambos valores y la lectura de admin los devuelve tal cual

#### Scenario: AV1 sin MP4
- **WHEN** el estado resultante de crear o editar un evento tiene `video_url_av1` y no tiene `video_url`
- **THEN** la API responde 400 con `title = EVENT_VIDEO_AV1_REQUIRES_MP4` y no guarda nada

#### Scenario: Fichero subido en el campo AV1
- **WHEN** el admin envía `video_url_av1 = uploaded:event-123.mp4`
- **THEN** la API responde 400 con `title = EVENT_VIDEO_URL_INVALID`

### Requirement: Clasificación y validación de las URLs de vídeo

La API SHALL clasificar cada URL de vídeo con una única función:

- `protected`: el origen coincide con `EVENT_VIDEO_CDN_URL` y la ruta empieza por `/eventos-video/`.
- `external`: cualquier otra URL `https://`.
- `uploaded`: el valor empieza por `uploaded:`.
- `invalid`: todo lo demás.

Al crear o editar, la API SHALL validar solo los campos presentes cuyo valor difiere del guardado, y SHALL rechazar con 400 y un código máquina en `title`:

- `EVENT_VIDEO_URL_INVALID`: una URL `invalid`.
- `EVENT_VIDEO_URL_UNPROTECTED`: una URL del origen del CDN protegido fuera de `/eventos-video/`.
- `EVENT_VIDEO_SIGNING_UNAVAILABLE`: una URL con ruta `/eventos-video/` cuando el servidor no tiene configurada la firma.

#### Scenario: URL del CDN fuera de la carpeta protegida
- **GIVEN** la firma está configurada con `EVENT_VIDEO_CDN_URL = https://cdn.140d.art`
- **WHEN** el admin guarda `video_url = https://cdn.140d.art/stories/concierto.mp4`
- **THEN** la API responde 400 con `title = EVENT_VIDEO_URL_UNPROTECTED`

#### Scenario: Carpeta protegida sin firma configurada
- **GIVEN** el servidor no tiene las variables `EVENT_VIDEO_*`
- **WHEN** el admin guarda `video_url = https://cdn.140d.art/eventos-video/lynda/lynda_h264.mp4`
- **THEN** la API responde 400 con `title = EVENT_VIDEO_SIGNING_UNAVAILABLE`

#### Scenario: Editar un evento antiguo sin tocar su URL
- **GIVEN** un evento guardado con `video_url = http://ejemplo.com/v.mp4`
- **WHEN** el admin edita solo el título y el formulario reenvía la misma `video_url`
- **THEN** la API no valida esa URL y guarda el cambio de título

#### Scenario: URL de otro host
- **WHEN** el admin guarda `video_url = https://otro-host.example/v.mp4`
- **THEN** la API la acepta como externa, sin firma

### Requirement: Configuración de la firma de CloudFront

La API SHALL leer `EVENT_VIDEO_CDN_URL`, `EVENT_VIDEO_CF_KEY_PAIR_ID` y `EVENT_VIDEO_CF_PRIVATE_KEY_B64` (PEM RSA en base64) desde `config/env.js`. La firma SHALL quedar desactivada si falta las tres. El arranque SHALL fallar con un mensaje que nombre el problema cuando:

- solo hay una o dos de las tres;
- `EVENT_VIDEO_CDN_URL` no es un origen `https://` sin ruta;
- la clave no se puede interpretar o no es RSA.

#### Scenario: Configuración parcial
- **WHEN** la API arranca con `EVENT_VIDEO_CF_KEY_PAIR_ID` definida y sin `EVENT_VIDEO_CF_PRIVATE_KEY_B64`
- **THEN** el proceso termina con un error que lista las variables que faltan

#### Scenario: Sin configuración
- **WHEN** la API arranca sin ninguna de las tres variables
- **THEN** arranca con la firma desactivada

### Requirement: URLs firmadas que caducan con el pase

Para una fuente `protected`, la API SHALL devolver una URL firmada de CloudFront:

- política personalizada cuyo `Resource` es la URL exacta del objeto;
- firma RSA-SHA256 con `Hash-Algorithm=SHA256`;
- parámetros `Policy`, `Signature` y `Key-Pair-Id`.

La caducidad SHALL ser `min(ahora + 6 h, max(ahora + 15 min, video_started_at + duration_minutes + 30 min))`. La firma SHALL verificarse con la clave pública correspondiente.

#### Scenario: Firma verificable y limitada a un objeto
- **WHEN** la API firma `https://cdn.140d.art/eventos-video/lynda/lynda_h264.mp4`
- **THEN** la URL contiene `Policy`, `Signature`, `Key-Pair-Id` y `Hash-Algorithm=SHA256`
- **AND** la política decodificada tiene como `Resource` exactamente esa URL, sin comodines
- **AND** la firma se verifica con la clave pública del par usado

#### Scenario: Caducidad al final previsto del pase
- **GIVEN** un evento de 40 minutos iniciado hace 10 minutos
- **WHEN** un asistente pide las fuentes
- **THEN** `DateLessThan` es el inicio más 70 minutos (40 del pase más 30 de margen)

#### Scenario: Asistente que llega después del final previsto
- **GIVEN** un evento de 40 minutos iniciado hace 80 minutos y todavía `active`
- **WHEN** un asistente pide las fuentes
- **THEN** `DateLessThan` es ahora más 15 minutos

### Requirement: Entrega de las fuentes solo durante el pase y solo a quien tiene acceso

`POST /api/events/:id/video-token` SHALL responder solo para eventos `format = 'video'` en estado `active`, y solo a:

- un asistente cuya credencial resuelve `getAttendeeByAccessToken` y que no requiere pago; o
- el host o un admin autenticados por JWT.

Respuestas:

- URLs: `{ mode: 'url', sources: { mp4, av1 }, expiresAt }`, con las fuentes `protected` firmadas, las `external` sin cambios y `av1` a `null` si no existe.
- Modo `uploaded`: SHALL conservar `{ mode: 'uploaded', vtoken, filename }`.
- Fuente `protected` sin firma configurada: 503 con `title = EVENT_VIDEO_SIGNING_UNAVAILABLE`, nunca una URL sin firmar.

El registro de la emisión SHALL incluir evento, sujeto, modo y si hubo firma, y nunca la URL.

#### Scenario: Asistente verificado con el evento activo
- **WHEN** un asistente verificado de un evento gratuito `active` pide las fuentes
- **THEN** recibe 200 con `sources.mp4` y `sources.av1` firmadas y `expiresAt`

#### Scenario: Evento finalizado
- **WHEN** alguien pide las fuentes de un evento en estado `finished`
- **THEN** la API responde 400 y no devuelve ninguna URL

#### Scenario: Asistente sin pagar en un evento de pago
- **WHEN** un asistente verificado que no ha pagado pide las fuentes de un evento de pago
- **THEN** la API responde 403

#### Scenario: Sin credenciales
- **WHEN** una petición sin credencial de asistente ni JWT pide las fuentes
- **THEN** la API responde 403

### Requirement: Las respuestas públicas no revelan las URLs de vídeo

`GET /api/events` y `GET /api/events/:slug` SHALL omitir `video_url` y `video_url_av1`, y SHALL incluir `has_video` (verdadero si el evento tiene `video_url`). Las respuestas de admin SHALL seguir devolviendo ambas columnas.

#### Scenario: Ficha pública de un evento con vídeo protegido
- **WHEN** cualquiera pide `GET /api/events/<slug>` de un evento de vídeo
- **THEN** la respuesta no contiene `video_url` ni `video_url_av1` y contiene `has_video: true`

#### Scenario: Calendario público
- **WHEN** cualquiera pide `GET /api/events?from=…&to=…`
- **THEN** ningún evento de la respuesta contiene `video_url` ni `video_url_av1`

### Requirement: Selección de fuente AV1 con red de seguridad MP4

El cliente SHALL pedir las fuentes a `/video-token` para todo evento de vídeo con `has_video` y acceso. SHALL elegir AV1 solo si existe `sources.av1` y `navigator.mediaCapabilities.decodingInfo` para `video/mp4; codecs="av01.0.08M.10"` a 1920×1080 y 25 fps devuelve `supported && powerEfficient` en menos de 1,5 s. En cualquier otro caso SHALL usar `sources.mp4`.

#### Scenario: Dispositivo con decodificación AV1 por hardware
- **WHEN** `decodingInfo` responde `{ supported: true, powerEfficient: true }`
- **THEN** el reproductor carga `sources.av1`

#### Scenario: Decodificación solo por software
- **WHEN** `decodingInfo` responde `{ supported: true, powerEfficient: false }`
- **THEN** el reproductor carga `sources.mp4`

#### Scenario: Evento sin versión AV1
- **WHEN** `sources.av1` es `null`
- **THEN** el reproductor carga `sources.mp4` sin consultar `decodingInfo`

### Requirement: Recuperación ante un fallo de la fuente

Cuando el reproductor agote sus reintentos o reciba un error de decodificación, SHALL notificarlo al componente padre en lugar de mostrar el error definitivo. El padre SHALL:

- pasar de AV1 a MP4 si la fuente era AV1;
- pedir fuentes nuevas, como máximo 3 veces en 10 minutos, si la fuente era MP4.

Solo entonces SHALL mostrarse «No se pudo reproducir el vídeo». Cada cambio de fuente SHALL retomar la reproducción en la posición calculada por el reloj del pase.

#### Scenario: AV1 que falla al decodificar
- **WHEN** la fuente AV1 produce `MEDIA_ERR_DECODE`
- **THEN** el reproductor pasa a `sources.mp4` y retoma en la posición del pase

#### Scenario: Firma caducada a mitad del pase
- **WHEN** la fuente MP4 empieza a fallar porque la firma caducó
- **THEN** el cliente pide fuentes nuevas y retoma en la posición del pase sin intervención del usuario

### Requirement: Reproductor sin vías de descarga ni de pausa

El `<video>` del pase SHALL llevar:

- `controlsList="nodownload noremoteplayback noplaybackrate"`;
- `disablePictureInPicture`;
- `disableRemotePlayback`.

Su contenedor SHALL anular el menú contextual. Todo ello sin cambiar los controles propios existentes (volumen y pantalla completa).

#### Scenario: Clic derecho sobre el vídeo
- **WHEN** el espectador hace clic derecho sobre el vídeo
- **THEN** no aparece el menú contextual del navegador, y con él «Guardar vídeo como»

#### Scenario: Picture-in-picture
- **WHEN** el espectador busca la opción de picture-in-picture del navegador
- **THEN** no está disponible, así que no hay ventana flotante con botón de pausa

### Requirement: Guarda de navegación en el borde

El repositorio SHALL versionar en `deploy/cloudfront/event-video-guard.js` una CloudFront Function (runtime `cloudfront-js-2.0`, evento *viewer request*) para el *behavior* `eventos-video/*`:

- SHALL responder 403 cuando `Sec-Fetch-Dest` sea `document`, `iframe`, `frame`, `embed` u `object`;
- SHALL dejar pasar cualquier otro valor, o la ausencia de la cabecera.

#### Scenario: Pegar la URL firmada en la barra de direcciones
- **WHEN** un navegador pide el vídeo con `Sec-Fetch-Dest: document`
- **THEN** CloudFront responde 403 aunque la firma sea válida

#### Scenario: Reproducción desde la página del evento
- **WHEN** el `<video>` de la página pide el vídeo con `Sec-Fetch-Dest: video`
- **THEN** la función deja pasar la petición y CloudFront valida la firma
