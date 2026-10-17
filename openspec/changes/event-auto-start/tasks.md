## 1. Transición atómica

- [x] 1.1 `api/services/eventService.js` → `startEvent`: añadir `AND status = 'scheduled'` al `UPDATE` y devolver `{ changed: rowsAffected === 1, event }`. Comentario: el planificador y el botón compiten por esta fila.
- [x] 1.2 Revisar los llamadores de `eventService.startEvent` (hoy solo `eventAdminController`) para el nuevo valor de retorno.

## 2. Servicio de inicio (`api/services/eventStartService.js`)

- [x] 2.1 Crear el módulo con un comentario de cabecera: es el único camino de inicio, lo comparten el botón y el planificador, y cualquier paso nuevo del inicio va aquí.
- [x] 2.2 Implementar `startEvent(eventId, { eventSocket = null, source = 'manual' })` moviendo, sin cambiarlos, los pasos de `eventAdminController.startEvent`:
  - duración del vídeo y `video_started_at`;
  - canal Agora;
  - sala LiveKit, con `room_failed` y una relectura del estado;
  - transición guardada;
  - `broadcastEventStarted`;
  - `triggerReconcile`.

  Devuelve `{ result, event }`. Si `agora-stage-covers` ya está aplicado, su `setStageCover(id, 'inicio')` se mueve aquí, entre la transición y `broadcastEventStarted`.
- [x] 2.3 Implementar y exportar `isAutoStartDue(event, now)`, puro: `eventStartUtc(event) <= now < eventEndUtc(event)`, y falso si cualquiera de los dos es `null`.
- [x] 2.4 Implementar `startDueEvents({ eventSocket, now = Date.now() })`:
  - lee `SELECT id, event_datetime, duration_minutes, title FROM events WHERE status = 'scheduled'`;
  - filtra con `isAutoStartDue`;
  - llama a `startEvent(id, { eventSocket, source: 'auto' })` dentro de un `try/catch` por evento;
  - registra cada inicio con `logger.info` (id, hora programada en UTC, instante y retraso);
  - devuelve los ids iniciados.
- [x] 2.5 Alerta de fallo persistente, dentro del módulo:
  - un `Set` en memoria por id de evento;
  - si el resultado es `room_failed` o salta una excepción y `now >= inicio + 2 min`, avisa una vez con `logger.error`, Sentry (con `require('../instrument.js')` diferido y nunca bajo test) y `emailService.sendEventAutoStartAlertEmail`.

  El patrón es el de `raiseAlert` en `agoraRecordingService`.
- [x] 2.6 `api/services/emailService.js`: añadir `sendEventAutoStartAlertEmail({ eventTitle, eventId, scheduledAt, detail })` a `BUSINESS_EMAIL`, por `sendMail`, con la indicación de pulsar «Iniciar» en `/admin/espacios`. Escapar el título con `escapeForEmail`.

## 3. Controlador y planificador

- [x] 3.1 `api/controllers/eventAdminController.js` → `startEvent`: delegar en `eventStartService.startEvent(req.params.id, { eventSocket: req.app.get('eventSocket'), source: 'manual' })` y traducir `result` a 200, 404, 400 o 500, con los mismos `title` y `message` de hoy. Quitar del controlador los imports que dejen de usarse.
- [x] 3.2 Crear `api/scheduler/eventStartScheduler.js`: `cron.schedule('*/30 * * * * *')`, con el indicador `running` y `app.get('eventSocket')` leído en cada pasada. Debe registrar su arranque, igual que `videoPassScheduler`.
- [x] 3.3 Arrancarlo en `api/server.js` junto a los demás planificadores, con su comentario.
- [x] 3.4 Activación por configuración (Decisión 8 del diseño), con `config.events.autoStartSchedulerEnabled` en `api/config/env.js`, que es `EVENT_AUTO_START_ENABLED` y además nunca bajo test. Documentarla en `api/.env.example` y pedirla a propósito en `api/.env.test`. El planificador no arranca sin ella. Test del rechazo en `eventAutoStart.test.js`.

## 4. Tests (Jest)

- [x] 4.1 Crear `api/tests/eventAutoStart.test.js` con `isAutoStartDue`:
  - el evento de verano (`2026-07-10T19:00`, 60 min) a `17:00:10Z` es cierto, a `16:59:59Z` falso, a `18:00:00Z` falso y a `19:00:10Z` falso;
  - uno de invierno con su desfase de una hora;
  - `duration_minutes` ausente usa 60;
  - `event_datetime` ilegible da falso.
- [x] 4.2 Probar `startDueEvents` contra la BD de test, con un `eventSocket` falso que registra llamadas y `jest.mock` de `livekitService` y de `agoraRecordingService.triggerReconcile`:
  - inicia un Agora vencido (`active`, canal, un `event_started`, una reconciliación);
  - no toca uno futuro, uno ya pasado, un `draft` ni uno `cancelled`;
  - un pase de vídeo vencido queda con `video_started_at`.
- [x] 4.3 Carrera: dos llamadas concurrentes a `startEvent` sobre el mismo evento dan un solo `started`, un solo `event_started` y una sola reconciliación.
- [x] 4.4 Fallos:
  - LiveKit falla y el evento sigue `scheduled`; la pasada siguiente, con LiveKit bien, lo inicia;
  - con el fallo persistente a `inicio + 2 min`, la bandeja simulada (`emailService.__getOutbox()`) tiene exactamente un email de alerta tras varias pasadas;
  - un fallo en un evento no impide iniciar otro en la misma pasada.
- [x] 4.5 Endpoint manual (`tests/helpers/app.js`, admin autenticado): 200 en un programado, 400 con el mismo texto en un `active`, y 404 en uno inexistente.
- [x] 4.6 Ejecutar la suite completa (`npm test` en `api/`).

## 5. Panel de admin

- [x] 5.1 Añadir `EVENT_AUTO_START_HINT` en `client/lib/constants.js` con el texto de la spec.
- [x] 5.2 Mostrarlo bajo el campo de fecha y hora en `client/app/admin/espacios/nuevo/page.js` y en `client/app/admin/espacios/[id]/page.js`, con el estilo de las ayudas existentes del formulario.
- [x] 5.3 `npm run lint` y `npm run build` en `client/`.

## 6. Verificación manual (preproducción)

- [ ] 6.1 Crear un evento Agora de prueba programado a 3 minutos vista. Sin tocar el panel, a su hora la ficha abierta en otro navegador entra en la sala, y el listado de admin lo muestra «En directo».
- [ ] 6.2 Repetir con un pase de vídeo: empieza desde el segundo 0 a su hora.
- [ ] 6.3 Pulsar «Iniciar» antes de la hora en otro evento: empieza en el acto y el planificador no lo vuelve a iniciar (un solo `event_started` en los logs).
- [ ] 6.4 Un evento en borrador con la hora pasada sigue en borrador.

## 7. Conocimiento del proyecto

- [x] 7.1 Crear `.claude/rules/events/auto-start.md` con `paths:` a `api/services/eventStartService.js`, `api/scheduler/eventStartScheduler.js` y `api/tests/eventAutoStart.test.js`. Contenido:
  - camino único;
  - transición guardada;
  - intervalo del propio evento y por qué;
  - filtro en JS por la hora de Madrid;
  - alerta a los 2 minutos;
  - interacción con la grabación (`maxIdleTime`) y con LiveKit (`emptyTimeout`).
- [x] 7.2 Añadir la línea de la regla al índice «Eventos» de `CLAUDE.md`. Añadir a «Invariantes transversales»: «**Iniciar un evento tiene un solo camino, `eventStartService.startEvent`**: el botón y el planificador lo comparten, y un paso nuevo del inicio va ahí.» Describir el planificador nuevo en la lista `scheduler/` de «Architecture».
- [x] 7.3 Guía corta para el operador, `docs/eventos-inicio-automatico.md`: qué se inicia y cuándo, cómo adelantarlo, retrasarlo o impedirlo, qué hacer ante el email de alerta, y revisar el listado antes de desplegar.
- [x] 7.4 Ejecutar `node scripts/check-claude-rules.mjs`.
