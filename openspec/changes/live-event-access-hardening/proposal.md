## Why

En la prueba en preproducción del primer pase de vídeo, una persona externa detectó tres fallos. Ninguno es de `event-video-cdn-delivery`, pero dos afectan igual a producción:

1. **La contraseña del sitio de preproducción no se revoca al cambiarla.** `TestAccessGate` guarda en `localStorage` un simple `'true'` durante 30 días, sin relación con la contraseña con la que se obtuvo. Un navegador que entró con la contraseña anterior sigue entrando.
2. **La sala de un pase de vídeo se abre sin que el servidor confirme el acceso.** La página decide con estado del navegador:
   - el objeto `user` de `localStorage`, que puede estar caducado (`isHost`);
   - un control de sesión que concede el acceso ante cualquier error que no reconoce.

   Además, **el chat de los pases de vídeo no tiene autenticación**: cualquiera que abra la página puede leerlo y escribir en él con el nombre que quiera, y sin sesión aparece «Anónimo». El vídeo sí estaba protegido por el servidor, y por eso esa persona se quedó en «Cargando vídeo...».
3. **Cuando termina el vídeo, el chat queda abierto indefinidamente.** Se quiere un cierre ordenado: 5 minutos de chat con una cuenta atrás visible y, después, el mismo final que cuando se finaliza un evento, para todos.

## What Changes

- **Contraseña de preproducción revocable.**
  - `POST /api/test-access/verify` devuelve un token firmado que lleva una huella de la contraseña vigente. La huella es un HMAC con `JWT_SECRET`, así que ni revela la contraseña ni se puede fabricar sin el secreto.
  - Un endpoint nuevo, `POST /api/test-access/check`, valida el token en cada carga.
  - Si la contraseña ha cambiado, la huella no coincide y se vuelve a pedir.
  - El indicador antiguo (`test_access_granted`) deja de valer y se borra.
- **Sala del pase de vídeo confirmada por el servidor.**
  - La sala de un evento `format='video'` solo se pinta tras entrar en la **sala autenticada de Socket.IO** (`join_event_room`), que valida en el servidor la credencial de asistente (verificado, sin pago pendiente, no expulsado) o el JWT del host. Hasta entonces se muestra «Comprobando acceso…».
  - Un rechazo borra la sesión guardada (asistente) o descarta el `user` caducado (host), y vuelve a la ficha con «Acceder».
  - `authenticateJoin` admite los eventos de vídeo, que antes excluía.
- **BREAKING (socket). Chat autenticado en los pases de vídeo.**
  - El chat pasa a `event_chat_message` de la sala autenticada: el nombre lo pone el servidor, y se aplican la expulsión del chat y el antispam.
  - Se elimina el manejador público `chat_message`, que difundía los mensajes a todo el que abría la página.
  - API y cliente se despliegan juntos.
- **Control de sesión más estricto.** Solo un fallo de red, un 5xx o un 429 mantienen el comportamiento optimista. Cualquier otro rechazo del servidor borra la sesión.
- **Cierre del pase: 5 minutos de chat y final para todos.**
  - Nueva columna `events.video_duration_seconds`. La API la mide leyendo la cabecera `mvhd` del MP4:
    - con una petición Range firmada si el vídeo está en el CDN;
    - en disco si es un archivo subido;
    - por HTTP si es una URL externa.

    Lo hace al guardar el evento y, si falta, al iniciarlo. Sin duración medida, cae a `duration_minutes`.
  - La ficha pública expone `video_ends_at` y `chat_closes_at` (fin del vídeo + 5 min), iguales para todos.
  - Al terminar el vídeo, el panel del chat muestra un aviso informativo con una cuenta atrás en directo hasta `chat_closes_at`.
  - Al llegar a cero, la sala se cierra y se muestra el mismo modal «Evento finalizado» que cuando se finaliza un evento, con el mismo botón y comportamiento.
  - Un scheduler nuevo (cada 15 s) finaliza en el servidor los pases cuyo `chat_closes_at` ha pasado, igual que el botón «Finalizar»: estado `finished`, `finished_at`, `event_ended`. Desde ese momento nadie obtiene vídeo ni entra en la sala.
  - La finalización manual de un pase de vídeo muestra ahora ese mismo modal a quien está en la sala; antes solo recargaba.
  - La firma de las URLs de vídeo caduca a partir del fin real del vídeo cuando se conoce la duración.

## Capabilities

### New Capabilities
- `preprod-access-gate`: la contraseña de acceso a preproducción, revocable al cambiarla.
- `video-event-room`: acceso confirmado por el servidor, chat autenticado y cierre temporizado de la sala de un pase de vídeo.

### Modified Capabilities
<!-- ninguna con spec vigente -->

## Impact

- **Base de datos:** `events.video_duration_seconds REAL` en el `CREATE TABLE` y con `safeAlter`, sin backfill.
- **API:**
  - `routes/testAccessRoutes.js`.
  - `socket/eventSocket.js`: `authenticateJoin` admite vídeo, se retira `chat_message` y se rechaza la entrada tras el cierre.
  - `controllers/eventController.js`: `toPublicEvent` y `getVideoToken`.
  - `controllers/eventAdminController.js`: medir la duración al guardar, al iniciar y al subir.
  - `utils/videoPass.js` y `utils/mp4Duration.js` (nuevos), `services/videoDurationService.js` (nuevo) y `scheduler/videoPassScheduler.js` (nuevo, arrancado desde `server.js`).
- **Cliente:**
  - `components/TestAccessGate.js` y `lib/api.js`.
  - `app/live/[slug]/EventDetail.js`: sala confirmada, chat autenticado, aviso con cuenta atrás y modal.
  - `hooks/useEventSocket.js`: sin chat.
  - `lib/constants.js`.
- **Tests:** token de acceso a preproducción, lector de `mvhd`, horario del pase, sala autenticada para vídeo y ausencia del manejador público de chat.
