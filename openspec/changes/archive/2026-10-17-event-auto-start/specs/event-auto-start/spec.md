## ADDED Requirements

### Requirement: Un solo camino de inicio

Iniciar un evento SHALL hacerse siempre con `startEvent(eventId, { eventSocket, source })` de `api/services/eventStartService.js`, donde `source` es `'manual'` o `'auto'`. `POST /api/admin/events/:id/start` (`eventAdminController.startEvent`) y el planificador SHALL llamar a esa función, y ninguno SHALL repetir sus pasos.

La función SHALL ejecutar, en este orden, lo que hoy hace el controlador:

1. Cargar el evento: si no existe, el resultado es `not_found`; si su `status` no es `scheduled`, `not_scheduled`.
2. Según el formato y el proveedor:
   - **pase de vídeo** (`format='video'`): medir la duración si hay `video_url` y falta `video_duration_seconds` (`videoDurationService.refreshVideoDurationSafely`), y usar `video_started_at` igual al instante actual;
   - **Agora:** `agora_channel_name = 'event-<id>'`;
   - **LiveKit:** crear la sala `event-<id>` con `max_attendees`. Si falla, el resultado es `room_failed`, sin cambiar el evento.
3. Pasar el evento a `active` con la transición atómica.
4. Emitir `event_started` con `eventSocket.broadcastEventStarted`.
5. Disparar la reconciliación de la grabación (`agoraRecordingService.triggerReconcile`) sin esperarla.

Cualquier operación que se añada al inicio SHALL añadirse a esta función. El endpoint SHALL conservar su contrato:

| Resultado | Respuesta |
|---|---|
| `started` | 200 con el evento |
| `not_found` | 404 |
| `not_scheduled` | 400 «Solo se pueden iniciar eventos programados» |
| `room_failed` | 500 «No se pudo crear la sala de streaming» |

#### Scenario: Inicio manual de un evento Agora
- **WHEN** el admin pulsa «Iniciar» en un evento Agora programado
- **THEN** el evento queda `active` con `agora_channel_name = 'event-<id>'`
- **AND** los clientes de la ficha reciben `event_started` y la grabación se reconcilia sin esperar a Agora

#### Scenario: Inicio manual de un evento que ya no está programado
- **WHEN** el admin pulsa «Iniciar» en un evento `active`
- **THEN** la respuesta es 400 «Solo se pueden iniciar eventos programados» y no se emite nada

#### Scenario: Fallo de la sala de LiveKit
- **WHEN** falla la creación de la sala de un evento LiveKit
- **THEN** el resultado es `room_failed` y el evento sigue `scheduled`

### Requirement: Transición atómica a active

`eventService.startEvent` SHALL actualizar el evento con `UPDATE events SET status = 'active', … WHERE id = ? AND status = 'scheduled'` y SHALL informar de si la fila cambió. Si no cambió, porque otro camino lo inició o lo canceló entre la lectura y la escritura, `eventStartService.startEvent` SHALL devolver `not_scheduled` sin emitir `event_started` ni disparar la grabación.

#### Scenario: Botón y planificador a la vez
- **WHEN** el admin pulsa «Iniciar» en el mismo instante en que el planificador inicia el evento
- **THEN** el evento pasa a `active` una sola vez
- **AND** se emite un único `event_started` y se dispara una única reconciliación desde el inicio

#### Scenario: Cancelado entre la lectura y la escritura
- **WHEN** el evento pasa a `cancelled` después de que el planificador lo lea y antes de su `UPDATE`
- **THEN** el evento sigue `cancelled`

### Requirement: Inicio automático a la hora programada

`api/scheduler/eventStartScheduler.js` SHALL ejecutar `startDueEvents({ eventSocket })` de `eventStartService` cada 30 segundos, sin solapar pasadas. SHALL arrancarse solo desde `api/server.js`, que los tests nunca importan.

SHALL arrancar solo si `config.events.autoStartSchedulerEnabled` es cierto, lo que exige `EVENT_AUTO_START_ENABLED=true`. Es falso por defecto y SHALL ser falso siempre con `NODE_ENV=test`, diga lo que diga el fichero de entorno. El motivo: la API local apunta a la base de datos de preproducción, y no debe iniciar sus eventos desde la máquina de quien desarrolla. Producción y staging lo activan en su `api/.env`.

En cada pasada, `startDueEvents` SHALL leer los eventos con `status = 'scheduled'` y llamar a `startEvent(id, { eventSocket, source: 'auto' })` para cada uno que cumpla `isAutoStartDue(event, now)`. Ese predicado es puro y exportado, y es cierto si y solo si `eventStartUtc(event) <= now < eventEndUtc(event)`, ambos de `api/utils/eventTime.js`. Así:

- se inician todos los eventos programados, sin casilla, de cualquier proveedor, modo y formato, también los de prueba (`is_test`);
- un evento cuyo intervalo ya terminó NO SHALL iniciarse nunca;
- un `event_datetime` ilegible NO SHALL iniciarse;
- los eventos `draft`, `active`, `finished` y `cancelled` NO SHALL leerse.

`event_datetime` NO SHALL compararse en SQL ni con `new Date()` sobre la cadena: es hora de pared de `Europe/Madrid` sin zona.

Cada inicio automático SHALL registrarse con `logger.info` con el id, la hora programada en UTC, el instante real y el retraso.

#### Scenario: Evento de verano a su hora
- **WHEN** un evento programado con `event_datetime = '2026-07-10T19:00'` y 60 minutos se evalúa a las `2026-07-10T17:00:10Z`
- **THEN** `isAutoStartDue` es cierto y el evento se inicia

#### Scenario: La hora de pared no se lee como UTC
- **WHEN** ese mismo evento, que dura de 17:00 a 18:00 UTC, se evalúa a las `2026-07-10T19:00:10Z`
- **THEN** `isAutoStartDue` es falso: leer la hora como UTC lo habría iniciado dos horas tarde

#### Scenario: Antes de la hora
- **WHEN** el evento se evalúa a las `2026-07-10T16:59:59Z`
- **THEN** no se inicia

#### Scenario: Evento olvidado del pasado al desplegar
- **WHEN** la API arranca con un evento `scheduled` cuyo intervalo terminó ayer
- **THEN** el evento sigue `scheduled` y no se emite nada

#### Scenario: Borrador a su hora
- **WHEN** un evento `draft` llega a su hora
- **THEN** no se inicia

#### Scenario: Pase de vídeo
- **WHEN** un pase de vídeo programado llega a su hora
- **THEN** se inicia con `video_started_at` igual al instante de la pasada, como al pulsar «Iniciar»

#### Scenario: API local sin la variable
- **WHEN** la API arranca sin `EVENT_AUTO_START_ENABLED`
- **THEN** el planificador no arranca y ningún evento se inicia solo

#### Scenario: Pedido bajo test
- **WHEN** la suite se ejecuta con `.env.test`, que define `EVENT_AUTO_START_ENABLED=true` a propósito
- **THEN** `config.events.autoStartSchedulerEnabled` es falso

### Requirement: Fallo del inicio automático

Si `startEvent` falla para un evento en una pasada, ya sea con `room_failed` o con una excepción, el error SHALL registrarse y la pasada SHALL seguir con los demás eventos. El evento SHALL seguir `scheduled` y reintentarse en las pasadas siguientes mientras `isAutoStartDue` sea cierto.

Si un evento sigue sin iniciarse por un fallo cuando han pasado 2 minutos desde su hora, el sistema SHALL avisar **una sola vez por evento** por tres canales:

- `logger.error`;
- Sentry, cargado de forma diferida y nunca bajo test;
- un email a `BUSINESS_EMAIL` con el título del evento, la hora, el error ya limpio y la indicación de pulsar «Iniciar» en `/admin/espacios`.

El email SHALL pasar por `sendMail`. Bajo test, la duplicidad se comprueba en la bandeja simulada (`__getOutbox`).

#### Scenario: Fallo pasajero
- **WHEN** la sala de LiveKit falla en la primera pasada y se crea en la siguiente, antes de 2 minutos
- **THEN** el evento se inicia y no se envía ninguna alerta

#### Scenario: Fallo persistente
- **WHEN** la creación de la sala sigue fallando a los 2 minutos de la hora y en las pasadas siguientes
- **THEN** se envía exactamente un email de alerta para ese evento

#### Scenario: Un fallo no bloquea a los demás
- **WHEN** dos eventos vencen en la misma pasada y el primero falla
- **THEN** el segundo se inicia

### Requirement: Aviso del inicio automático en el panel

El formulario de creación y edición de eventos (`client/app/admin/espacios/nuevo/page.js` y `client/app/admin/espacios/[id]/page.js`) SHALL mostrar bajo el campo de fecha y hora: «A esta hora el evento se iniciará automáticamente. Puedes iniciarlo antes con «Iniciar» en el listado.» El texto SHALL vivir en `client/lib/constants.js`.

#### Scenario: Crear un evento
- **WHEN** el admin abre el formulario de un evento nuevo
- **THEN** ve el aviso del inicio automático bajo la fecha y la hora
