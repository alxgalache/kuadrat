## 1. Columna del evento y camino de escritura

- [x] 1.1 Añadir `host_echo_cancellation INTEGER NOT NULL DEFAULT 0` al `CREATE TABLE events` de `api/config/database.js`, con un comentario que explique que solo aplica a `provider='agora'` + `interaction_mode='broadcast'` y que `0` significa **sin** procesado 3A, es decir la ruta de captura buena
- [x] 1.2 Añadir el `safeAlter('ALTER TABLE events ADD COLUMN host_echo_cancellation INTEGER NOT NULL DEFAULT 0')` junto a los de `allow_mobile_host_console` / `allow_host_video_quality` (las bases existentes no se recrean)
- [x] 1.3 Aceptar el campo como booleano opcional en `createEventSchema` y `updateEventSchema` de `api/validators/eventSchemas.js`, con la misma forma `z.union([...])` que los dos flags existentes
- [x] 1.4 Normalizarlo con `toFlag` en las **dos** ramas de `api/controllers/eventAdminController.js` (create y update)
- [x] 1.5 Añadirlo a la lista de columnas del `INSERT` de `eventService.createEvent` y al array `allowedFields` de `eventService.updateEvent` — omitir cualquiera de los dos deja la casilla guardando en silencio nada
- [x] 1.6 Verificar que no hace falta tocar el camino de lectura: `getEventBySlug` hace `SELECT e.*`
- [x] 1.7 Extender `api/tests/eventHostFlags.test.js` con el flag nuevo, recorriendo los mismos casos que ya cubre para los otros dos y afirmando los cuatro puntos de escritura por nombre

## 2. Checkbox en el panel de admin

- [x] 2.1 Añadir el checkbox «El host escuchará a los invitados por altavoz» en `client/app/admin/espacios/nuevo/page.js`, visible solo con `format='live'` + `provider='agora'` + `interaction_mode='broadcast'`
- [x] 2.2 Texto de ayuda en es-ES que diga **cuándo** marcarlo y **qué cuesta**: solo si se va a dar la palabra a participantes y el host no usa auriculares; activa la cancelación de eco, que degrada notablemente la calidad del sonido del host
- [x] 2.3 Lo mismo en `client/app/admin/espacios/[id]/page.js`, cargando el valor actual del evento en el estado del formulario
- [x] 2.4 Comprobar que al cambiar el proveedor o el modo de interacción a una combinación no soportada el campo deja de enviarse

## 3. Configuración de la pista de micrófono

- [x] 3.1 Añadir `AGORA_MIC_ENCODER_HOST = 'high_quality'` a `client/lib/constants.js`, junto a `AGORA_CAMERA_ENCODER_HOST`, con un comentario que explique (a) que sin `encoderConfig` el SDK **no** aplica `music_standard` pese a lo que dice su documentación, sino que deja Opus sin declarar, y (b) que `AEC: false` en Android no quita un filtro sino que cambia el *input preset* del sistema, y con él el enrutado del USB
- [x] 3.2 Añadir el parámetro `micTrackConfig` a `client/hooks/useAgoraRoom.js`, documentado en el JSDoc del hook como ya lo está `cameraEncoderConfig`
- [x] 3.3 Pasarlo a `AgoraRTC.createMicrophoneAudioTrack` fusionándolo con `microphoneId`, sin cambiar la creación perezosa ni el `setEnabled(false)` del apagado
- [x] 3.4 Componer el objeto en `client/components/AgoraLiveRoom.js` junto a `cameraEncoderConfig`: `undefined` si no es host; si lo es, `encoderConfig` siempre y las tres claves 3A a `false` **solo** cuando `host_echo_cancellation` sea 0
- [x] 3.5 Verificar que con el flag a 1 el objeto **omite** `AEC`/`ANS`/`AGC` en lugar de pasarlas a `true` — pasar `ANS: true` explícitamente añade `googHighpassFilter` en Chrome, que hoy no se activa
- [x] 3.6 Propagar `host_echo_cancellation` desde el evento hasta `AgoraLiveRoom` a través de `client/app/live/[slug]/EventDetail.js`
- [x] 3.7 Comprobar por regresión que las pistas de asistentes y de participantes promocionados se siguen creando sin configuración alguna

## 4. Verificación en dispositivo (obligatoria antes de cerrar)

- [ ] 4.1 Receptor inalámbrico en modo **Mono** y conectado por USB-C al Pixel 9 Pro
- [ ] 4.2 Con `chrome://inspect` desde un portátil, abrir `chrome://webrtc-internals` de la pestaña del evento y confirmar que el bitrate de audio sube respecto a una retransmisión anterior
- [ ] 4.3 Confirmar en `getSettings()` de la pista que el dispositivo activo es el receptor y **no** el micrófono interno del teléfono — es el fallo silencioso que este cambio persigue
- [ ] 4.4 Evento de prueba con un segundo cliente escuchando, comparando a oído con una grabación anterior
- [ ] 4.5 Probar el camino contrario: evento con la casilla marcada, dar la palabra a un participante con el host en altavoz, y comprobar que no hay eco
- [ ] 4.6 Comprobar que cambiar de micrófono en caliente no interrumpe la emisión ni altera el perfil
- [ ] 4.7 Regresión en `interaction_mode='meeting'`: sin cambios de comportamiento ni en el host ni en los asistentes

## 5. Documentación

- [x] 5.1 Añadir a `CLAUDE.md` una sección sobre el audio de las salas Agora, con el mismo criterio que la de la relación de aspecto de la cámara: el defecto del SDK, el *input preset* de Android, por qué `AEC: false` es la palanca decisiva y no una preferencia, y por qué el estéreo está descartado
- [x] 5.2 Dejar escrito como procedimiento operativo que el receptor va en modo **Mono**, con uno y con dos transmisores, y que con un solo transmisor el modo Stereo deja un canal en silencio y cuesta nivel al mezclar a mono
- [x] 5.3 Dejar escrito que el retorno de audio al host debe ir por auricular siempre que se vaya a dar la palabra, y que la casilla es la salida de emergencia cuando eso no es posible
