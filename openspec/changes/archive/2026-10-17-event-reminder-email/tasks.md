## 1. Esquema (riesgo alto: infraestructura compartida)

- [x] 1.1 En `api/config/database.js`, añadir a `CREATE TABLE event_attendees`:
  - `confirmed_at DATETIME`;
  - `reminder_sent_at DATETIME`;
  - `reminder_attempts INTEGER NOT NULL DEFAULT 0`.

  Comentario: para qué sirve cada una y que `confirmed_at` nulo cuenta como «antes». Ninguna línea de comentario puede acabar en punto y coma ni llevar barra invertida.
- [x] 1.2 Añadir los tres `safeAlter('ALTER TABLE event_attendees ADD COLUMN …')` junto a los de `event_attendees`, sin rellenar datos.
- [x] 1.3 Ejecutar `api/tests/dbDump.test.js`.

## 2. Hora y piezas compartidas

- [x] 2.1 `api/utils/eventTime.js`: añadir `formatEventWhenEs(event)` → «el jueves 22 de octubre a las 19:00». Se compone con `formatToParts`, en `EVENT_TIME_ZONE`, porque `Intl` pone una coma tras el día de la semana. Devuelve `null` si la fecha es ilegible. Añadir los casos a `api/tests/eventTime.test.js`, con horario de verano y de invierno y otra `TZ` del proceso.
- [x] 2.2 Crear el módulo con nombre de la URL pública de la imagen de un evento, `eventCoverImageUrl(event)` en `api/utils/eventCoverImage.js`, con la lógica de `absoluteUrl` de `marketingEmailService`. Hacer que `buildEvent` lo use, y añadir un test de las tres formas: absoluta, relativa con CDN y relativa sin CDN.

## 3. Datos (`api/services/eventService.js`)

- [x] 3.1 `setAttendeePassword`: añadir `confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP)` al mismo `UPDATE`, con un comentario sobre por qué es la primera emisión.
- [x] 3.2 `listReminderRecipients(eventId, cutoffSql)`: `SEAT_HOLDER_CONDITION`, `access_password IS NOT NULL`, `reminder_sent_at IS NULL`, `reminder_attempts < 3` y `(confirmed_at IS NULL OR confirmed_at < ?)`. Selecciona solo las columnas necesarias. Comentario sobre la decisión de `is_staff`.
- [x] 3.3 `claimReminder(attendeeId)` (`UPDATE` guardado, devuelve si cambió) y `releaseReminder(attendeeId)`.
- [x] 3.4 `updateEvent`: si `event_datetime` llega y difiere del actual, poner a cero `reminder_sent_at` y `reminder_attempts` de sus asistentes en un `createBatch` junto al `UPDATE` del evento.

## 4. Email (`api/services/emailService.js`)

- [x] 4.1 Implementar `sendEventReminderEmail({ email, firstName, event, accessPassword })` reproduciendo `openspec/changes/event-reminder-email/email-preview.html`:
  - asunto con `formatEventWhenEs`;
  - imagen con `eventCoverImageUrl`, sin bloque si falta;
  - `eventAccessSection` y `eventCalendarRow` reutilizados;
  - `escapeForEmail` en nombre y título.

  Devuelve `{ success }` como la confirmación. Si la cabecera y el pie de la confirmación se extraen para compartirlos, la confirmación debe seguir produciendo el mismo HTML.
- [x] 4.2 Exportarla en `module.exports` y en `api/services/email/index.js` si reexporta por nombre.

## 5. Servicio y planificador

- [x] 5.1 Crear `api/services/eventReminderService.js` con:
  - `EVENT_REMINDER_LEAD_HOURS = 48` y `EVENT_REMINDER_SEND_INTERVAL_MS = 600`;
  - `isReminderDue(event, now)`, pura: `inicio − 48 h <= now < inicio`, y falsa sin inicio legible;
  - `sendDueReminders({ now, sendIntervalMs })`, que lee los eventos `scheduled`, filtra con `isReminderDue` y, por evento:
    - obtiene los destinatarios con el corte de `confirmed_at` en formato SQLite;
    - excluye con `requiresPayment` e `isEmailBanned` y deduplica por email normalizado;
    - por destinatario: reclama, envía y libera si falla, con espera entre envíos;
    - registra los recuentos.

  Un `try/catch` por evento y por destinatario.
- [x] 5.2 Crear `api/scheduler/eventReminderScheduler.js`: `cron.schedule('*/5 * * * *')` con el indicador `running`. Debe registrar su arranque.
- [x] 5.3 Arrancarlo en `api/server.js` con su comentario.
- [x] 5.4 Activación por configuración (Decisión 9 del diseño), con `config.events.reminderSchedulerEnabled` en `api/config/env.js`, que es `EVENT_REMINDERS_ENABLED` y además nunca bajo test. Documentarla en `api/.env.example` y pedirla a propósito en `api/.env.test`. El planificador no arranca sin ella. Test del rechazo en `eventReminder.test.js`.

## 6. Tests (Jest)

- [x] 6.1 Crear `api/tests/eventReminder.test.js` con `isReminderDue`: los escenarios de la spec (apertura de la ventana, antes, en medio, en el inicio y después) en hora de verano y de invierno.
- [x] 6.2 `sendDueReminders` contra la BD de test, con `sendIntervalMs: 0` y la bandeja simulada:
  - envía a un confirmado antiguo y a uno con `confirmed_at` nulo;
  - no envía a quien no está verificado, a quien confirmó dentro de las 48 h, a quien tiene un pago pendiente, al staff, a un expulsado ni a un `cancelled`;
  - un solo email para dos filas con el mismo email.
- [x] 6.3 Estados del evento: `draft`, `active`, `finished`, `cancelled` y un `scheduled` con el inicio pasado no envían nada.
- [x] 6.4 Una sola vez: dos `sendDueReminders` concurrentes dejan un email por asistente, y una pasada posterior no envía nada.
- [x] 6.5 Fallos, con el envío forzado a fallar mediante `jest.spyOn(emailService, 'sendEventReminderEmail')` (`sendMail` es interno al módulo y no se puede interceptar):
  - liberación y reintento en la pasada siguiente (`reminder_attempts = 2`);
  - abandono tras tres fallos;
  - un destinatario que falla no impide los demás.
- [x] 6.6 Rearme: tras enviar, `updateEvent` con otra fecha deja los marcadores a cero y una pasada dentro de la nueva ventana vuelve a enviar. `updateEvent` sin cambio de fecha no los toca.
- [x] 6.7 `confirmed_at`: se estampa en la primera verificación y no cambia en un reacceso (`verifyEmail` dos veces).
- [x] 6.8 Contenido: asunto exacto, fecha, contraseña, `/live/<slug>`, tres botones de calendario, nombre escapado, sin bloque de imagen cuando falta y sin `video_url` ni `recording_enabled`. Ningún `href` lleva la contraseña.
- [x] 6.9 Suite completa (`npm test` en `api/`), incluida `testEnvironmentIsolation.test.js`.

## 7. Verificación manual (preproducción)

- [x] 7.1 Crear un evento de prueba a 48 h y 10 minutos vista, registrarse con un buzón propio y comprobar que el recordatorio llega en la primera pasada tras abrirse la ventana.
- [x] 7.2 Revisar el email en Gmail web, Gmail Android, Apple Mail iOS y Outlook: imagen, fecha, contraseña, botón y fila de calendario.
- [x] 7.3 Aplazar el evento un día y comprobar que el recordatorio vuelve a llegar 48 h antes de la nueva fecha.

## 8. Conocimiento del proyecto

- [x] 8.1 Crear `.claude/rules/events/reminder-email.md` con `paths:` a `api/services/eventReminderService.js`, `api/scheduler/eventReminderScheduler.js`, `api/utils/eventCoverImage.js` y `api/tests/eventReminder.test.js`. Contenido:
  - por qué un planificador y no `scheduledAt` de Resend;
  - la ventana;
  - `confirmed_at` y por qué no `created_at`;
  - reclamo y liberación «como mucho una vez»;
  - el rearme;
  - el espaciado y por qué no la API de lotes.
- [x] 8.2 Añadir la línea al índice «Eventos» de `CLAUDE.md` y el planificador a la lista `scheduler/` de «Architecture». En `.claude/rules/events/confirmation-calendar-links.md`, quitar «Emails de recordatorio» de lo que no existe y remitir a la regla nueva.
- [x] 8.3 Guía corta para el operador, `docs/eventos-recordatorio.md`: cuándo sale, a quién, qué pasa al aplazar o cancelar, y cómo comprobar en los logs cuántos se enviaron.
- [x] 8.4 Ejecutar `node scripts/check-claude-rules.mjs`.
