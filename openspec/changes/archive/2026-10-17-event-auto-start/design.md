## Context

**Qué hace hoy «Iniciar».** `POST /api/admin/events/:id/start` llama a `eventAdminController.startEvent`, que:

1. carga el evento y exige `status = 'scheduled'` (400 si no);
2. según el tipo de evento:
   - **pase de vídeo:** mide la duración si falta y usa `video_started_at = now`;
   - **Agora:** fija `agora_channel_name = 'event-<id>'`, sin llamadas externas;
   - **LiveKit:** crea la sala con `maxParticipants` (500 si falla);
3. ejecuta `eventService.startEvent`, que hace un `UPDATE events SET status = 'active', … WHERE id = ?` **sin guarda de estado**;
4. emite `event_started` a la sala pública `event-<id>`, que la ficha convierte en la entrada a la sala;
5. dispara `agoraRecordingService.triggerReconcile` sin esperarlo.

**Planificadores existentes.** `auctionScheduler` inicia subastas y sorteos cada 30 s comparando `start_datetime <= now` en SQL. Esas columnas guardan instantes ISO. `videoPassScheduler` (15 s) cierra los pases con `closeExpiredVideoPasses`, que es el modelo a seguir: un servicio con `now` inyectable y un planificador mínimo. Todos arrancan desde `server.js`.

**La hora del evento.** `events.event_datetime` es hora de pared de `Europe/Madrid` sin zona, y el contenedor corre en UTC. Solo `api/utils/eventTime.js` la convierte (`eventStartUtc`, `eventEndUtc`); es un invariante de `CLAUDE.md`. Compararla en SQL con un instante UTC equivaldría a iniciar el evento una o dos horas tarde.

**Lecturas de Turso.** Tras el incidente de octubre, toda consulta periódica debe acotar las filas que lee. `idx_events_status` existe.

## Goals / Non-Goals

**Goals:**

- Que un evento programado empiece a su hora sin nadie en el panel, haciendo exactamente lo que hace el botón.
- Que nunca empiece algo que no debe: borradores, cancelados o eventos del pasado.
- Que botón y planificador no puedan iniciar dos veces el mismo evento.
- Que un fallo llegue al operador.

**Non-Goals:** los de la propuesta: casilla por evento, fin automático de los directos, apertura anticipada y aviso al host.

## Decisions

### 1. Extraer el inicio a un servicio, no llamar al endpoint ni copiarlo

**Decisión:** `api/services/eventStartService.js` exporta `startEvent(eventId, { eventSocket, source })`, que devuelve `{ result: 'started' | 'not_found' | 'not_scheduled' | 'room_failed', event }`. El controlador solo traduce el resultado a la respuesta HTTP, que es la misma que hoy.

**Alternativas:**

- **Que el planificador haga una petición HTTP a su propia API.** Necesitaría un JWT de admin dentro del proceso y pasaría por los limitadores de tasa.
- **Copiar los pasos en el planificador.** Son dos verdades que divergen: es el error que documenta `zoneResolver`. La portada «Inicio» (`agora-stage-covers`) es el primer paso nuevo que llegaría a uno solo de los dos.

`eventSocket` se pasa como argumento (en el controlador, `req.app.get('eventSocket')`; en el planificador, `app.get('eventSocket')`). Así el servicio sigue siendo importable sin efectos y se puede probar con un objeto falso.

### 2. Transición guardada: `WHERE status = 'scheduled'`

**Decisión:** `eventService.startEvent` añade la guarda y devuelve `rowsAffected`. Solo quien cambia la fila emite `event_started` y reconcilia.

Hoy la comprobación de estado del controlador y el `UPDATE` están separados por una lectura. Dos pulsaciones casi simultáneas ya podían emitir dos `event_started`, y el planificador hace mucho más probable esa carrera.

Los efectos previos a la transición son inocuos si se repiten:

- **Medir la duración del vídeo** dos veces escribe el mismo valor.
- **La sala de LiveKit** lleva siempre el nombre `event-<id>`. El servidor de LiveKit devuelve la sala existente ante un `CreateRoom` repetido. La documentación pública no lo dice: solo dice que crear es opcional, porque la sala se crea sola cuando entra el primer participante. Si un `CreateRoom` repetido devolviera error, el perdedor de la carrera obtendría `room_failed` sobre un evento que el ganador ya inició: ese caso responde 400 o se registra, nunca vuelve a emitir.

Por eso el perdedor no necesita deshacer nada.

### 3. El intervalo del propio evento como ventana

**Decisión:** se inicia solo si `start <= now < start + duration_minutes`.

**Alternativas:**

- **`start <= now` sin límite.** El primer despliegue iniciaría todos los eventos olvidados en `scheduled`, y una API caída durante días los iniciaría al volver.
- **Una gracia fija (15 o 30 min).** Es arbitraria: para una charla de 3 horas, un retraso de 40 minutos aún merece arrancarla; para una de 30, no.

El final del propio evento es el límite natural: después, iniciarlo no tiene sentido. `eventEndUtc` ya usa 60 minutos cuando `duration_minutes` falta.

### 4. Leer los programados y filtrar en JS

**Decisión:** `SELECT … FROM events WHERE status = 'scheduled'` usa `idx_events_status` y lee solo las filas programadas. El intervalo se filtra con `isAutoStartDue`.

No hay forma correcta de expresar la hora de Madrid en SQLite sin duplicar en SQL las reglas del cambio de horario, que ya resuelve `eventTime.js`. El coste es de unas 2.880 consultas al día por evento programado, despreciable frente al plan. No se hace ninguna consulta por evento salvo para los que vencen.

### 5. Cada 30 segundos, sin solapar pasadas

Es la misma cadencia que subastas y grabación. El evento empieza como mucho 30 s después de su hora, y con `agora-stage-covers` el público ve «Empezamos en breve» desde el primer instante. Un indicador `running` impide que una sala de LiveKit lenta acumule pasadas, como en `recordingScheduler` y `videoPassScheduler`.

### 6. Sin casilla (decisión del operador)

Es la opción con menos piezas: ni columna, ni campo en el formulario, ni las cuatro plazas de un flag nuevo. Para empezar antes está «Iniciar»; para retrasar, se cambia la hora; para que no empiece, se cancela o se deja en borrador. El aviso del formulario lo hace explícito.

### 7. Alerta a los 2 minutos, una vez por evento

**Decisión:** si una pasada falla y han pasado 2 minutos desde la hora, se alerta por tres canales (log, Sentry y email a `BUSINESS_EMAIL`), con deduplicación en memoria por id de evento.

Un fallo pasajero de LiveKit que se resuelve en la pasada siguiente no merece un email. Uno que dura 2 minutos significa que el público ya está esperando. Un reinicio de la API podría repetir la alerta una vez, y es aceptable.

El patrón es el de `raiseAlert` de la grabación. Unificar las alertas operativas en un módulo común queda fuera de este cambio: tocaría la grabación y los backups.

### 8. Activación por configuración: `EVENT_AUTO_START_ENABLED` (decisión del operador, tomada al implementar)

La API local corre con `nodemon` y apunta a la base de datos de preproducción. Sin una puerta, en cuanto el código llegara a la máquina de quien desarrolla, empezaría a iniciar los eventos de preproducción a su hora, antes incluso de desplegar el staging. Tampoco ayuda que alguien esté probando en preproducción con eventos programados que no quiere iniciar. `auctionScheduler` y `videoPassScheduler` sí corren en local. Aun así, se eligió la misma regla que el recordatorio (`event-reminder-email`): ningún planificador nuevo actúa sobre preproducción desde una máquina de desarrollo.

**Decisión:** el planificador solo arranca con `EVENT_AUTO_START_ENABLED=true`. Es falso por defecto y forzado a falso bajo test, y `.env.test` lo pide a propósito para que el test del rechazo signifique algo. Producción y staging lo activan en su `api/.env`, que llega por `env_file`. Si se olvida en producción, el fallo es visible y no hace daño: los eventos no arrancan solos y hay que pulsar «Iniciar», como antes. Dos procesos con la variable sobre la misma base no inician dos veces: la transición está guardada.

## Risks / Trade-offs

- **[La grabación arranca al iniciar el evento, no cuando entra el host]** → Pasa lo mismo hoy si el admin pulsa «Iniciar» antes de tiempo, pero ahora el inicio es puntual aunque el host llegue tarde.
  - Si el host tarda más de 30 minutos, Agora cierra la tarea por inactividad (`maxIdleTime: 1800`). El reconciliador la marca `interrupted`, avisa y la reanuda, consumiendo uno de los 10 intentos.
  - El techo de 180 minutos cuenta desde el inicio.

  Se documenta. Retrasar la grabación hasta el primer publicador es otro cambio.
- **[LiveKit cierra una sala vacía a los 30 minutos (`emptyTimeout` de `livekitService.createRoom`)]** → Si nadie entra en ese tiempo, LiveKit la borra. Al entrar el primer participante después, la crea de nuevo, según su documentación, pero sin `maxParticipants`. Afecta solo a los eventos LiveKit sin nadie en la sala durante media hora. Se documenta.
- **[Carrera con `room_failed`]** → `startEvent` vuelve a leer el estado cuando la sala falla. Si el evento ya está `active`, devuelve `not_scheduled`, y nunca una alerta.
- **[Un evento que nadie finaliza queda `active`]** → No cambia respecto al inicio manual. El techo de grabación lo acota. El fin automático es un no-objetivo.
- **[Despliegue con un evento dentro de su intervalo que el admin no quería iniciar]** → La primera pasada lo inicia. La guía del operador pide revisar `/admin/espacios` antes de desplegar.
- **[Reloj del servidor]** → Los planificadores ya dependen de él. La EC2 sincroniza por NTP.

## Migration Plan

1. Añadir `EVENT_AUTO_START_ENABLED=true` al `api/.env` del servidor de producción y al del staging.
2. Desplegar API y cliente juntos. No hay cambios de esquema.
3. En la primera pasada se inician los eventos que estén dentro de su intervalo: revisar el listado antes de desplegar.
4. **Vuelta atrás:** quitar la variable y reiniciar para detenerlo sin desplegar; o revertir el código. Los eventos vuelven a requerir «Iniciar». No quedan datos que limpiar.

## Open Questions

Ninguna.
