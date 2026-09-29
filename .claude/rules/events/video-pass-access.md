---
paths:
  - "api/utils/{videoPass,mp4Duration}.js"
  - "api/services/{videoDurationService,videoPassService,eventService}.js"
  - "api/scheduler/videoPassScheduler.js"
  - "api/socket/eventSocket.js"
  - "api/controllers/eventController.js"
  - "api/routes/testAccessRoutes.js"
  - "client/hooks/{useEventSocket,useEventRoomSocket}.js"
  - "client/components/{EventVideoPlayer,TestAccessGate}.js"
  - "client/app/live/**"
  - "api/tests/{testAccessGate,videoPassClosing,videoPassRoom}.test.js"
---

## Acceso y cierre de la sala del pase de vídeo (`live-event-access-hardening`)

Tres fallos encontrados por una persona externa en preproducción. El segundo afectaba igual a producción.

* **La sala de un pase de vídeo solo se pinta tras entrar en la sala autenticada de Socket.IO** (`join_event_room`), que revalida en el servidor la credencial de asistente (verificado, sin pago pendiente, no expulsado) o el JWT del host.
  * Antes bastaba con el estado del navegador: el objeto `user` de `localStorage`, que no se valida al cargar y puede estar caducado, daba `isHost`; y el control de sesión concedía acceso ante cualquier error. Así, alguien nunca registrado veía la sala y el chat, aunque el vídeo se quedaba en «Cargando vídeo...» porque `/video-token` sí lo rechazaba.
  * `authenticateJoin` admite `format='video'`. Mientras no llega el ACK se muestra «Comprobando acceso…».
  * Un rechazo definitivo (`VIDEO_ROOM_DEFINITIVE_DENIALS`) borra la sesión, o marca `hostRejected` si era el camino del host.
* **El chat de los pases de vídeo va por la sala autenticada** (`event_chat_message`): el nombre lo pone el servidor, y se aplican la expulsión del chat y el antispam.
  * **No existe manejador público `chat_message`**: difundía cualquier nombre y texto a todo el que tuviera la página abierta. Un test comprueba que no vuelve.
  * `useEventSocket` solo lleva `event_started` y `event_ended`.
* **Control de sesión:** solo un fallo de red, un 5xx o un 429 mantienen el acceso optimista. Cualquier otro rechazo borra la sesión.
* **Cierre del pase, un solo horario** (`api/utils/videoPass.js`): fin del pase = `video_started_at` + `video_duration_seconds` (o `duration_minutes` si falta); cierre = fin + 5 min (`CHAT_GRACE_MS`). Lo leen:
  * `toPublicEvent`, que publica `video_ends_at` y `chat_closes_at`;
  * `authenticateJoin` y `/video-token`, que rechazan tras el cierre (`EVENT_PASS_CLOSED`);
  * `videoTokenExpiry`;
  * `videoPassScheduler`, cada 15 s, que llama a `endEvent` y `broadcastEventEnded`, igual que «Finalizar».

  El cliente muestra un aviso informativo con cuenta atrás en el panel del chat y, al llegar a cero o con `event_ended`, el modal «Evento finalizado» a todos los que están en la sala, host incluido.
* **La duración la mide la API**, leyendo `mvhd` con peticiones Range (`utils/mp4Duration.js`, `services/videoDurationService.js`): firmada para el CDN, directa para una URL externa, o en disco para un archivo subido.
  * Mide al guardar si cambia `video_url`, al subir, y al iniciar si falta. Es de mejor esfuerzo y nunca bloquea: un fallo deja `NULL`.
  * Un 200 a una petición Range se aborta, para no descargar el archivo.
  * Bajo test la red lanza, y el transporte se inyecta con `__setFetchForTests`.
  * Comprobado con los MP4 reales: coincide con `ffprobe` en 3 lecturas.
* **El scheduler actúa sobre la base de datos configurada, y en local es la de preproducción**, como el resto de schedulers: al arrancar la API en local se finalizan los pases vencidos de preproducción.
* **Contraseña de preproducción revocable** (`WEB_APP_HIDDEN`).
  * `verify` devuelve un token con la huella HMAC (`JWT_SECRET`) de la contraseña vigente, y `check` lo revalida en cada carga completa. Cambiar `TEST_ACCESS_PASSWORD` expulsa a todos los navegadores.
  * La clave antigua `test_access_granted` (un `'true'` de 30 días) se borra al verla.
  * Sigue siendo una cortina: la API de preproducción es pública.
* **Punto ciego conocido:** `client/` sigue sin runner de tests. La sala confirmada, la cuenta atrás y el modal se verifican a mano (`docs/eventos-video/05-entornos-y-pruebas.md`). El servidor está cubierto por `testAccessGate`, `videoPassClosing` y `videoPassRoom`.
