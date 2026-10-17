---
paths:
  - "api/services/eventStartService.js"
  - "api/scheduler/eventStartScheduler.js"
  - "api/tests/eventAutoStart.test.js"
---

## Inicio de los eventos: un solo camino y el inicio automático (`event-auto-start`)

Todo evento de `/live` programado empieza solo a su hora, haciendo exactamente lo que hace «Iniciar» en `/admin/espacios`, que sigue sirviendo para empezar antes. Guía para el operador: `docs/eventos-inicio-automatico.md`.

* **Un solo camino: `eventStartService.startEvent`.** Lo llaman el controlador (`POST /api/admin/events/:id/start`, que solo traduce el resultado a 200/400/404/500 con los textos de siempre) y el planificador. Los pasos, en orden:
  * duración del vídeo si falta y `video_started_at`;
  * canal de Agora o sala de LiveKit;
  * transición;
  * `event_started`;
  * `triggerReconcile` sin esperar.

  Un paso nuevo del inicio, como la portada «Inicio» de `agora-stage-covers`, va aquí, y así llega a los dos. Copiarlo en el planificador sería la deriva que documenta `zoneResolver`.
* **Transición guardada.** `eventService.startEvent` hace `UPDATE … WHERE id = ? AND status = 'scheduled'` y devuelve `{ changed, event }`. Solo quien cambia la fila emite y reconcilia, así que botón y planificador a la vez dan un único `event_started`.
  * Antes, la comprobación de estado y el `UPDATE` estaban separados por una lectura, y dos pulsaciones podían emitir dos veces.
  * Repetir los pasos previos no hace daño: medir el vídeo escribe lo mismo, y la sala de LiveKit se llama siempre `event-<id>`.
  * Si LiveKit falla, se vuelve a leer el estado: si otro camino ya lo inició, el resultado es `not_scheduled` y no hay alerta.
* **Ventana = el intervalo del propio evento**, `[event_datetime, event_datetime + duration_minutes)`, con 60 minutos si falta la duración.
  * Sin límite superior, el primer despliegue iniciaría todos los eventos olvidados en `scheduled`.
  * Una gracia fija sería arbitraria: una charla de 3 h aún merece arrancarse con 40 minutos de retraso, y una de 30 no.
  * Borradores, cancelados y fechas ilegibles nunca se inician.
* **La hora de Madrid se filtra en JS.** Se leen los `scheduled` por `idx_events_status` (`listScheduledEvents`, compartida con el recordatorio) y se aplica `isAutoStartDue` con `eventTime.js`. Compararla en SQL con un instante UTC iniciaría el evento una o dos horas tarde.
* **Cada 30 s, sin solapar pasadas** (`running`), como subastas y grabación.
* **Alerta a los 2 minutos.** Un `room_failed` o una excepción se registran y se reintentan en la pasada siguiente. Si el evento sigue sin arrancar 2 minutos después de su hora, se avisa **una vez** por evento (`Set` en memoria) por log, Sentry y email a `BUSINESS_EMAIL` (`sendEventAutoStartAlertEmail`). Un fallo pasajero que se resuelve en 30 s no merece un email; uno de 2 minutos significa público esperando. Tras un reinicio puede repetirse una vez.
* **`EVENT_AUTO_START_ENABLED`, apagada por defecto y siempre bajo test.** La API local apunta a la base de preproducción, y con el planificador siempre activo iniciaría sus eventos desde la máquina de quien desarrolla, antes incluso de desplegar el staging. Es la misma regla que el recordatorio, aunque `auctionScheduler` y `videoPassScheduler` sí corren en local. `.env.test` la pide a propósito y el test comprueba el rechazo. Producción y staging la ponen a `true`. Olvidarla en producción es visible e inocuo: se vuelve a pulsar «Iniciar».
* **Interacciones conocidas:**
  * **Grabación:** arranca con el evento, no con el host. Si el host llega más de 30 minutos tarde, `maxIdleTime` cierra la tarea; el reconciliador la marca `interrupted`, avisa y la reanuda, gastando un intento. El techo de 180 min cuenta desde el inicio.
  * **LiveKit:** `emptyTimeout` es de 30 min (`livekitService.createRoom`): una sala vacía se borra, y LiveKit la recrea sola al entrar alguien, sin `maxParticipants`.
  * **Fin:** un evento que nadie finaliza queda `active`, igual que con el inicio manual.
* **Punto ciego conocido:** el comportamiento real (la ficha que entra sola en la sala, el pase que empieza en el segundo 0) se comprueba a mano en preproducción (`tasks.md` §6). El servidor está cubierto por `eventAutoStart.test.js`, que también falla si se quita la guarda de la transición o si el intervalo incluye su final.
* **Test intermitente ajeno a este cambio:** `zoneResolverReadCost.test.js` seguido de `buyerVerificationBinding.test.js` deja a veces la base de test bloqueada (`SQLITE_BUSY` en el `beforeAll` del segundo). Se reproduce con solo esos dos ficheros, aproximadamente una vez de cada cuatro.
