## 1. Contraseña de preproducción revocable

- [x] 1.1 `api/routes/testAccessRoutes.js`: `verify` devuelve un token firmado con la huella de la contraseña (comparación en tiempo constante); nuevo `POST /check`; 404 con la puerta desactivada.
- [x] 1.2 Tests `api/tests/testAccessGate.test.js`: token válido, cambio de contraseña (401), token manipulado y caducado (401), puerta desactivada (404).
- [x] 1.3 Cliente: `testAccessAPI.check` con `skipAuthHandling`, y `TestAccessGate` con la clave `test_access_token`, comprobación en cada carga, borrado del indicador antiguo y fallo cerrado.

## 2. Horario del pase y duración del vídeo

- [x] 2.1 `events.video_duration_seconds REAL` en el `CREATE TABLE` y con `safeAlter`.
- [x] 2.2 `api/utils/mp4Duration.js`: recorrido de cajas de primer nivel hasta `moov` y lectura de `mvhd` (versiones 0 y 1) sobre `readRange`.
- [x] 2.3 `api/services/videoDurationService.js`: transportes CDN firmado, externo y disco; exigir el 206; 5 s por lectura; transporte de red que lanza bajo test y se puede inyectar; `refreshVideoDuration(eventId)` escribe la columna.
- [x] 2.4 `api/utils/videoPass.js`: `passEndsAt`, `chatClosesAt` y `CHAT_GRACE_MS`; `videoTokenExpiry` pasa a usarlos.
- [x] 2.5 Medir al crear o editar (si cambia `video_url`), al subir el archivo y al iniciar el pase (si falta), sin bloquear.
- [x] 2.6 `toPublicEvent` añade `video_ends_at` y `chat_closes_at`; `getVideoToken` rechaza tras el cierre.
- [x] 2.7 `api/scheduler/videoPassScheduler.js` (cada 15 s, sin solapes): `endEvent` + `broadcastEventEnded` para los pases vencidos; arrancarlo desde `server.js`.
- [x] 2.8 Tests: lector de `mvhd` (versiones 0 y 1, índice al principio y al final), servicio con transporte inyectado (206, 200 abortado, error), horario del pase y rechazo de `/video-token` tras el cierre.

## 3. Sala autenticada para los pases de vídeo

- [x] 3.1 `eventSocket.authenticateJoin`: admitir `format='video'` y rechazar tras `chat_closes_at`; eliminar el manejador público `chat_message`.
- [x] 3.2 Tests: entrada de un asistente verificado en un pase de vídeo, rechazo sin credencial, rechazo tras el cierre, mensaje con el nombre del servidor y ausencia del manejador `chat_message`.
- [x] 3.3 `useEventSocket`: retirar el chat.
- [x] 3.4 `EventDetail`: `useEventRoomSocket` en el pase de vídeo; sala solo con `joined`; «Comprobando acceso…»; `onJoinDenied` (asistente: borrar la sesión; host: `hostRejected`); `VideoChatPanel` con los mensajes de la sala.
- [x] 3.5 `validateStoredSession`: transitorio solo sin estado, 5xx o 429; el resto borra la sesión con aviso genérico.

## 4. Cierre del pase en el cliente

- [x] 4.1 Aviso informativo con cuenta atrás en el panel del chat (desde el fin del vídeo o `video_ends_at` hasta `chat_closes_at`) y textos en `lib/constants.js`.
- [x] 4.2 Al llegar a cero, o con `event_ended` estando en la sala de vídeo: desmontar la sala y abrir el modal «Evento finalizado» (mismo título, botón y recarga; mensaje propio del pase).
- [x] 4.3 Lint y compilación de producción del cliente.

## 5. Cierre

- [x] 5.1 Batería completa de la API (`testEnvironmentIsolation` en verde).
- [x] 5.2 `CLAUDE.md`: reglas de la puerta de preproducción, de la sala del pase de vídeo y de su cierre.
- [x] 5.3 Lista de pruebas manuales en `docs/eventos-video/05-entornos-y-pruebas.md` (cierre del pase, visitante sin acceso, contraseña de preproducción).
