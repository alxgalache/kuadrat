## Context

Tres fallos detectados en preproducción, descritos en `proposal.md`. El vídeo del pase ya estaba protegido en el servidor (`/video-token` exige una credencial válida y firma la URL). El problema estaba en lo que la página decide sola con datos del navegador, y en un canal de chat que nunca comprobó a nadie.

## Goals / Non-Goals

**Goals:**
- Que cambiar la contraseña de preproducción expulse a todos los navegadores.
- Que la sala de un pase de vídeo solo se muestre tras una confirmación del servidor, y que el chat tenga la misma autenticación que el resto de la sala.
- Un cierre del pase igual para todos y aplicado en el servidor.

**Non-Goals:**
- Convertir la puerta de preproducción en una barrera de seguridad real. La API sigue siendo pública en ese entorno; la puerta solo oculta la web.
- Tocar el chat de LiveKit (canal de datos propio) o el de Agora (que ya usa la sala autenticada).
- Guardar historial de chat.

## Decisions

### 1. Puerta de preproducción: token con huella de la contraseña

- `verify` responde `{ token }` con el formato `base64url(JSON{ fp, exp }) + '.' + base64url(HMAC-SHA256(JWT_SECRET, payload))`.
  - `fp` son los primeros 32 hex de `HMAC-SHA256(JWT_SECRET, 'test-access:' + password)`.
  - `exp` es a 30 días, lo mismo que antes.
- `check` recalcula la huella con la contraseña actual y compara con `timingSafeEqual`. Cambiar `TEST_ACCESS_PASSWORD` cambia la huella y todos los tokens mueren a la vez. Cambiar `JWT_SECRET` también los invalida.
- La comparación de la contraseña en `verify` pasa a tiempo constante.
- Cliente:
  - clave nueva `test_access_token`; se borra la antigua `test_access_granted`;
  - `check` en cada carga completa, sin navegación de cliente porque el layout no se remonta;
  - un 401 o 404 borra el token y pide la contraseña;
  - un fallo de red también la pide: se falla cerrado, porque es un entorno de pruebas y la alternativa sería reabrir justo lo que se quiere cerrar.
- **Sin cookie ni middleware**: con una cookie `HttpOnly` y un middleware de Next la puerta protegería el HTML en el servidor, pero es otra pieza en el camino de cada petición. No se pide aquí.

### 2. La sala del pase de vídeo espera al servidor

- **La confirmación es la entrada en la sala autenticada** (`join_event_room`). Es la misma validación que `/token` y `/video-token`: `getAttendeeByAccessToken`, `requiresPayment` y los baneos de email e IP, o el JWT verificado del host. El chat necesita esa sala de todos modos, así que no hace falta un endpoint nuevo.
- `EventDetail` usa `useEventRoomSocket` cuando el evento es de vídeo y está activo, y hay sesión o `isHost` local.
  - Solo pinta la sala con `joined === true`; mientras tanto, «Comprobando acceso…».
  - Con `onJoinDenied`: si el intento era de asistente, borra la sesión y muestra el aviso; si era de host, marca `hostRejected` y cae al flujo de asistente. Ese es el caso del `user` caducado en `localStorage`.
- **`authenticateJoin` admite `format='video'`** con cualquier proveedor. Lo que devuelve para vídeo no usa `agoraUid` ni el escenario, pero la presencia y el chat funcionan igual.
- **Chat:** `VideoChatPanel` pasa a `sendChatMessage` y a los mensajes de la sala autenticada (`{ identity, name, message }`). El manejador público `chat_message` se elimina del servidor y del hook `useEventSocket`: dejarlo sería mantener abierto el canal sin autenticar.
- **Control de sesión:** un error se trata como transitorio solo si no tiene estado (red), o si es un 5xx o un 429. Cualquier otro 4xx es definitivo: borra la sesión con un aviso genérico. Antes, por ejemplo, un 404 abría la sala.

### 3. Cierre del pase: horario común, aplicado en el servidor

- **La duración real del vídeo la mide la API**, leyendo `mvhd` (escala de tiempo y duración, versión 0 o 1) con un lector de cajas MP4 sobre una función `readRange(start, length)`. Recorre las cajas de primer nivel hasta `moov`, así que sirve con el índice al principio o al final. Tres transportes:
  - **CDN protegido:** URL firmada a 2 minutos y `Range: bytes=a-b`. Se exige un 206; ante un 200 se aborta, para no descargar el archivo entero.
  - **URL externa:** igual, sin firma.
  - **Archivo subido:** `fs.read` sobre `uploads/events`.

  Tiempo máximo de 5 s por lectura; cualquier fallo deja la columna en `NULL`. Bajo `NODE_ENV=test` el transporte de red lanza siempre y los tests inyectan uno propio.
- **Cuándo se mide:** al crear o editar cuando cambia `video_url`, al subir un archivo, y al iniciar el pase si sigue en `NULL`. La medición es de mejor esfuerzo: nunca bloquea el guardado ni el inicio. De paso, una medición correcta demuestra que la URL firmada funciona.
- **`utils/videoPass.js`** es la única fuente de los tiempos:
  - `passEndsAt(event)` = `video_started_at` + (`video_duration_seconds` ?? `duration_minutes·60`);
  - `chatClosesAt(event)` = `passEndsAt` + 5 min.

  La consumen `toPublicEvent` (publica `video_ends_at` y `chat_closes_at` en ISO), el scheduler, `authenticateJoin`, `getVideoToken` y `videoTokenExpiry`. Los dos últimos rechazan tras `chat_closes_at`, aunque el scheduler aún no haya pasado.
- **`videoPassScheduler`**, cada 15 s y sin pasadas solapadas:
  - Para cada evento de vídeo activo con `chat_closes_at` vencido, llama a `eventService.endEvent` y a `broadcastEventEnded`, lo mismo que el botón «Finalizar» para un evento de vídeo.
  - Es idempotente con una finalización manual simultánea (`finished_at` con `COALESCE`).
  - Se arranca solo desde `server.js`, que los tests no importan.
- **Cliente:**
  - El aviso de cierre aparece cuando el reproductor informa de que el vídeo ha terminado **o** cuando el reloj sincronizado pasa de `video_ends_at`. Va arriba del panel del chat, con estilo de alerta informativa y la cuenta atrás hasta `chat_closes_at`.
  - Al llegar a cero, la sala se desmonta, con lo que el socket de la sala se desconecta, y se abre el modal «Evento finalizado».
  - El `event_ended` del socket (el scheduler o una finalización manual) abre el mismo modal a quien estaba en la sala de vídeo. Hasta ahora eso solo ocurría en las salas en directo.
- **Texto del modal:** mismo componente, título «Evento finalizado», botón «Aceptar» y recarga. El mensaje del directo («El anfitrión ha finalizado el stream…») sería falso en un pase de vídeo, así que ahí dice que el evento ha finalizado.

## Risks / Trade-offs

- **La medición falla (URL mal escrita, vídeo aún no subido)** → Se cae a `duration_minutes`, que suele llevar margen, así que el chat queda abierto algo más. Se registra un `warn`, y se vuelve a intentar al iniciar el pase.
- **Relojes desincronizados** → El cliente usa `serverTimeOffset`, igual que la sincronía del pase. El servidor finaliza como mucho 15 s después de `chat_closes_at`, y mientras tanto ya rechaza la entrada en la sala y el vídeo.
- **Despliegue desacoplado** → Un cliente antiguo emitiría `chat_message`, que ya no existe: su chat no funcionaría. API y cliente se despliegan juntos (`deploy.sh`), igual que en el cambio anterior.
- **La puerta de preproducción no protege la API** → Riesgo aceptado y documentado: sigue siendo una cortina, ahora revocable.

## Migration Plan

Desplegar API y cliente juntos. La columna nueva es aditiva. Los navegadores de preproducción volverán a pedir la contraseña una vez, porque el indicador antiguo ya no vale. Los eventos de vídeo ya creados miden su duración al iniciarse, o se editan para medirla antes.
