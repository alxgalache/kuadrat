## Why

Hoy un evento de `/live` solo empieza cuando el admin pulsa «Iniciar» en `/admin/espacios`. Si el admin no está delante a la hora programada, los asistentes esperan ante una ficha que no arranca, aunque el host ya esté listo. Las subastas y los sorteos ya empiezan solos a su hora (`auctionScheduler`). Los eventos deben hacer lo mismo, ejecutando exactamente lo que hace el botón.

## What Changes

- **Un solo camino de inicio.** La lógica de `eventAdminController.startEvent` se mueve a un servicio, `api/services/eventStartService.js` (`startEvent`), sin cambiar nada de lo que hace:
  - mide la duración del vídeo si falta;
  - crea la sala de LiveKit, o fija el canal de Agora o `video_started_at`;
  - pasa el evento a `active`;
  - emite `event_started`;
  - dispara la grabación.

  El botón «Iniciar» y el inicio automático llaman a la misma función, y lo que se añada al inicio en el futuro (la portada «Inicio» de `agora-stage-covers`) llega a los dos.
- **Transición atómica.** El paso a `active` se hace con `UPDATE … WHERE status = 'scheduled'`. Si el admin pulsa «Iniciar» en el mismo instante en que actúa el planificador, el evento se inicia una sola vez: un `event_started`, una grabación. El perdedor no hace nada más, y el botón responde como hoy ante un evento que ya no está programado.
- **Inicio automático de todo evento programado** (decisión del operador: sin casilla). `api/scheduler/eventStartScheduler.js` comprueba cada 30 s los eventos `scheduled`. Inicia los que tienen la hora actual dentro de su propio intervalo: desde `event_datetime` hasta `event_datetime + duration_minutes`.
  - La hora se interpreta como hora de pared de Madrid, solo con `api/utils/eventTime.js` (invariante de `CLAUDE.md`).
  - Un evento olvidado del pasado nunca se inicia, tampoco al desplegar.
  - Un borrador o un evento cancelado, nunca.
  - Vale para todos: LiveKit y Agora, `broadcast` y `meeting`, directos y pases de vídeo, y eventos de prueba.
- **«Iniciar» sigue sirviendo** para empezar antes de la hora. Para retrasar un evento se cambia su hora.
- **Un fallo no se queda callado.** Si el inicio automático falla (hoy solo puede fallar la creación de la sala de LiveKit o la BD), el evento sigue `scheduled` y se reintenta en cada pasada mientras dure su intervalo. Si a los 2 minutos de la hora todavía no ha arrancado, se avisa una vez por tres canales (log, Sentry y email a `BUSINESS_EMAIL`), como las alertas de grabación.
- **El panel lo dice.** Junto a la fecha del formulario de evento: «A esta hora el evento se iniciará automáticamente. Puedes iniciarlo antes con «Iniciar» en el listado».

## Capabilities

### New Capabilities

- `event-auto-start`: inicio de un evento de `/live`. Cubre el camino único compartido por el botón y el planificador, la transición atómica, qué eventos se inician solos y cuándo, el tratamiento de los fallos con su alerta, y el aviso en el formulario de admin.

### Modified Capabilities

Ninguna. El endpoint `POST /api/admin/events/:id/start` conserva su contrato y su comportamiento (`agora-streaming-provider`): solo cambia dónde vive la lógica.

## Impact

- **Capas:** backend; en el frontend, solo una línea de texto en el formulario de admin.
- **API:**
  - servicio nuevo `api/services/eventStartService.js`: `startEvent`, `startDueEvents` y el predicado `isAutoStartDue`;
  - planificador nuevo `api/scheduler/eventStartScheduler.js`, arrancado en `api/server.js`;
  - `api/controllers/eventAdminController.js`: `startEvent` delega en el servicio;
  - `api/services/eventService.js`: `startEvent` con transición guardada que informa de si cambió la fila;
  - `api/services/emailService.js`: email de alerta.
- **Cliente:** `client/app/admin/espacios/[id]/page.js` y `client/app/admin/espacios/nuevo/page.js` (texto junto a la fecha), con el texto en `client/lib/constants.js`.
- **Configuración:** `EVENT_AUTO_START_ENABLED`, apagada por defecto y siempre apagada bajo test. Hay que ponerla a `true` en el `api/.env` de producción y del staging, pero no en local, que apunta a preproducción (decisión tomada al implementar; ver la Decisión 8 del diseño).
- **Esquema de BD:** ninguno.
- **Dependencias:** ninguna. `node-cron` ya está.
- **Lecturas de Turso:** una consulta cada 30 s, solo sobre filas `scheduled`, por el índice `idx_events_status`. Con diez eventos programados son ~29.000 filas al día, frente a los 2.500 millones al mes del plan.
- **Tests (Jest):**
  - el predicado con horas de invierno y de verano;
  - los límites del intervalo;
  - los estados excluidos;
  - la carrera manual contra automático;
  - el fallo de LiveKit con reintento y alerta única;
  - los pases de vídeo;
  - el endpoint manual sin cambios.
- **Despliegue:** API y cliente juntos. Al arrancar, el planificador inicia en su primera pasada los eventos que estén dentro de su intervalo.

## Non-goals

- Una casilla por evento para desactivar el inicio automático.
- Finalizar automáticamente los eventos en directo. Los pases de vídeo ya se cierran solos (`videoPassScheduler`).
- Iniciar antes de la hora, por ejemplo abrir la sala 10 minutos antes.
- Avisar al host de que su evento ha empezado.
- Retrasar el arranque de la grabación hasta que entre el host (ver los riesgos del diseño).
