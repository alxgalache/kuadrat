# event-reminder-email Specification

## Purpose

Definir el email de recordatorio que reciben los asistentes de un evento de `/live` 48 horas antes de su celebración: ventana de envío, destinatarios, corte por el momento de la confirmación, envío como mucho una vez con reintentos acotados, rearme cuando cambia la fecha, contenido del mensaje y el planificador que lo envía.

## Requirements

### Requirement: Ventana del recordatorio

El recordatorio de un evento SHALL enviarse solo mientras el evento tenga `status = 'scheduled'` y la hora actual esté en `[inicio − 48 h, inicio)`, con el inicio calculado por `eventStartUtc` de `api/utils/eventTime.js`. `event_datetime` NO SHALL compararse en SQL ni con `new Date()` sobre la cadena. Un `event_datetime` ilegible NO SHALL producir recordatorios.

Aplica a cualquier evento de la tabla `events`: `format` `live` o `video`, cualquier `provider` e `interaction_mode`, gratuito o de pago, y también con `is_test = 1`. La antelación SHALL ser una constante con nombre (`EVENT_REMINDER_LEAD_HOURS = 48`) en `api/services/eventReminderService.js`.

#### Scenario: Justo al abrirse la ventana
- **WHEN** un evento programado para `2026-10-22T19:00` (17:00 UTC) se evalúa a las `2026-10-20T17:00:30Z`
- **THEN** sus asistentes reciben el recordatorio

#### Scenario: Antes de la ventana
- **WHEN** ese evento se evalúa a las `2026-10-20T16:59:59Z`
- **THEN** no se envía nada

#### Scenario: La API estaba caída al abrirse la ventana
- **WHEN** la primera pasada tras abrirse la ventana ocurre a las `2026-10-21T09:00:00Z`
- **THEN** los asistentes reciben el recordatorio en esa pasada

#### Scenario: Evento ya iniciado
- **WHEN** el evento está `active`, aunque su hora no haya llegado porque se inició antes
- **THEN** no se envía nada

#### Scenario: Evento pasado, cancelado o en borrador
- **WHEN** el evento está `finished`, `cancelled` o `draft`, o su inicio ya pasó
- **THEN** no se envía nada

### Requirement: Destinatarios del recordatorio

Los destinatarios de un evento SHALL salir de una única función de `api/services/eventService.js`, que reutiliza `SEAT_HOLDER_CONDITION` (verificado, `is_staff = 0`, `status IN ('registered','paid','joined')`) y añade:

- `access_password IS NOT NULL`: se emitió la contraseña, y con ella el email de confirmación;
- `reminder_sent_at IS NULL` y `reminder_attempts < 3`;
- `confirmed_at IS NULL OR confirmed_at < <inicio − 48 h>`, en el formato de `CURRENT_TIMESTAMP` de SQLite.

Además SHALL excluirse en el servicio, con los predicados que ya existen:

- quien tenga un pago pendiente según `requiresPayment(event, attendee)`;
- quien esté expulsado del evento según `isEmailBanned(eventId, email)`.

SHALL enviarse un solo recordatorio por dirección de email normalizada y evento.

El staff (`is_staff = 1`) se excluye a conciencia: el admin entra por su propio camino y no ocupa plaza.

#### Scenario: Asistente confirmado hace una semana
- **WHEN** un asistente verificado de un evento gratuito tiene contraseña y `confirmed_at` de hace siete días
- **THEN** recibe el recordatorio

#### Scenario: Confirmado dentro de las 48 h
- **WHEN** un asistente confirma su registro 30 horas antes del inicio
- **THEN** no recibe el recordatorio: le basta su confirmación

#### Scenario: Registro sin verificar
- **WHEN** una fila tiene `email_verified = 0`
- **THEN** no recibe nada

#### Scenario: Evento de pago sin pagar
- **WHEN** en un evento de pago un asistente verificado no ha pagado
- **THEN** no recibe el recordatorio

#### Scenario: Admin con acceso de staff
- **WHEN** el admin tiene una fila `is_staff = 1` en el evento
- **THEN** no recibe el recordatorio

#### Scenario: Expulsado
- **WHEN** el email del asistente está en `event_bans` para ese evento
- **THEN** no recibe el recordatorio

#### Scenario: Asistente registrado antes del cambio
- **WHEN** una fila confirmada antes de desplegar este cambio tiene `confirmed_at` nulo
- **THEN** cuenta como confirmada antes de la ventana y recibe el recordatorio

### Requirement: Momento de la confirmación

`event_attendees.confirmed_at` SHALL estamparse en la **primera** emisión de la contraseña de acceso: en el mismo `UPDATE` de `setAttendeePassword`, con `confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP)`. Volver a verificar desde otro dispositivo reutiliza la contraseña y NO SHALL cambiarlo.

#### Scenario: Primera confirmación
- **WHEN** un asistente de un evento gratuito verifica su email por primera vez
- **THEN** su fila queda con `confirmed_at` igual al instante de la verificación

#### Scenario: Recuperación desde otro dispositivo
- **WHEN** ese asistente vuelve a verificar días después
- **THEN** su `confirmed_at` no cambia

### Requirement: Envío una sola vez con reintentos acotados

Antes de enviar, el servicio SHALL reclamar al destinatario con `UPDATE event_attendees SET reminder_sent_at = CURRENT_TIMESTAMP, reminder_attempts = reminder_attempts + 1 WHERE id = ? AND reminder_sent_at IS NULL AND reminder_attempts < 3`, y SHALL enviar solo si la fila cambió.

Si `sendEventReminderEmail` falla, SHALL liberar el reclamo (`reminder_sent_at = NULL`) para reintentar en la pasada siguiente. Tras el tercer intento fallido, el asistente NO SHALL volver a intentarse, y el fallo SHALL registrarse con `logger.error` sin la contraseña.

Los envíos de una pasada SHALL ser secuenciales y espaciados por `EVENT_REMINDER_SEND_INTERVAL_MS` (600 ms, inyectable en los tests).

#### Scenario: Dos pasadas concurrentes
- **WHEN** dos ejecuciones del envío tratan a la vez el mismo evento
- **THEN** cada asistente recibe exactamente un recordatorio

#### Scenario: Fallo pasajero
- **WHEN** el primer envío a un asistente falla y el siguiente funciona
- **THEN** el asistente recibe un recordatorio y su fila queda con `reminder_sent_at` y `reminder_attempts = 2`

#### Scenario: Fallo persistente
- **WHEN** el envío a un asistente falla tres veces
- **THEN** no se vuelve a intentar en las pasadas siguientes

### Requirement: Rearme por cambio de fecha

Cuando `updateEvent` cambie el valor de `event_datetime`, SHALL poner `reminder_sent_at = NULL` y `reminder_attempts = 0` en todos los asistentes del evento, dentro de la misma operación. El recordatorio vuelve a salir 48 h antes de la nueva fecha, con el corte de `confirmed_at` calculado sobre ella. Guardar el evento sin cambiar `event_datetime` NO SHALL rearmar nada.

#### Scenario: Evento aplazado una semana
- **WHEN** el recordatorio ya salió y el admin aplaza el evento siete días
- **THEN** los asistentes vuelven a recibirlo 48 h antes de la nueva fecha, con la fecha nueva

#### Scenario: Edición sin cambio de fecha
- **WHEN** el admin corrige la descripción de un evento con recordatorios ya enviados
- **THEN** nadie recibe otro recordatorio

### Requirement: Contenido del email de recordatorio

`sendEventReminderEmail({ email, firstName, event, accessPassword })` de `api/services/emailService.js` SHALL enviar por `sendMail`, con el remitente y la estructura de «Registro confirmado»: cabecera con el logo, bloque principal y pie. El email SHALL reproducir el ejemplo aprobado (`email-preview.html` de este cambio) con:

- **Asunto:** `Recordatorio: «<título>» es <cuándo>`, donde `<cuándo>` es, por ejemplo, «el jueves 22 de octubre a las 19:00», en hora de Madrid, generado en `api/utils/eventTime.js`.
- **Encabezado** «Tu evento se acerca», saludo con el nombre y la frase «Te recordamos que tienes plaza en **<título>**.»
- **La imagen del evento** (`cover_image_url`), con la URL pública del módulo compartido con el anuncio de eventos, y sin bloque si no hay imagen.
- **Fecha y hora** con `formatEventDateTimeEs` y «(hora peninsular española)».
- **Un texto de recordatorio** que invita a entrar unos minutos antes.
- **La contraseña de acceso**, en el mismo recuadro que en la confirmación.
- **El botón «Ir al evento»** con las instrucciones para otro dispositivo, y la fila de calendario, reutilizando `eventAccessSection` y `eventCalendarRow`.
- **El pie:** «Recibes este email porque te registraste en este evento.» y el aviso de derechos.

El nombre y el título SHALL escaparse con `escapeForEmail`. Ningún `href` SHALL contener la contraseña. El email NO SHALL contener `video_url`, `video_url_av1` ni `recording_enabled`. Si `event_datetime` es ilegible no hay ventana, así que no se envía.

#### Scenario: Recordatorio en la bandeja simulada
- **WHEN** se envía el recordatorio de «Charla con Lorca» del `2026-10-22T19:00` a Ana con la contraseña `ABC234`
- **THEN** la bandeja simulada tiene un mensaje con asunto «Recordatorio: «Charla con Lorca» es el jueves 22 de octubre a las 19:00»
- **AND** el HTML contiene «jueves, 22 de octubre de 2026, 19:00», `ABC234`, el enlace `/live/<slug>` y los tres botones de calendario

#### Scenario: Nombre con HTML
- **WHEN** el nombre del asistente es `<b>Ana</b>`
- **THEN** el HTML lo muestra escapado

#### Scenario: Evento sin imagen
- **WHEN** el evento no tiene `cover_image_url`
- **THEN** el email sale sin bloque de imagen

### Requirement: Planificador de recordatorios

`api/scheduler/eventReminderScheduler.js` SHALL ejecutar `sendDueReminders({ now })` de `api/services/eventReminderService.js` cada 5 minutos, sin solapar pasadas, y SHALL arrancarse solo desde `api/server.js`.

SHALL arrancar solo si `config.events.reminderSchedulerEnabled` es cierto, lo que exige `EVENT_REMINDERS_ENABLED=true`. Es falso por defecto y SHALL ser falso siempre con `NODE_ENV=test`, diga lo que diga el fichero de entorno. Se activa por configuración, nunca por una comprobación de `NODE_ENV`, igual que los backups. El motivo: la API local apunta a la base de datos de preproducción y al proveedor de email real, y no debe escribir por su cuenta a los asistentes de preproducción. Producción y staging lo activan en su `api/.env`.

En cada pasada, `sendDueReminders` SHALL:

1. leer los eventos con `status = 'scheduled'`;
2. quedarse con los que estén dentro de su ventana;
3. para cada uno, obtener los destinatarios y enviarles el recordatorio.

Un error con un evento o con un destinatario NO SHALL detener la pasada. Cada evento tratado SHALL registrar con `logger.info` cuántos recordatorios se enviaron y cuántos fallaron, nunca las direcciones.

#### Scenario: Error en un evento
- **WHEN** en una pasada falla la consulta de destinatarios de un evento
- **THEN** los demás eventos de la pasada reciben sus recordatorios

#### Scenario: API local sin la variable
- **WHEN** la API arranca sin `EVENT_REMINDERS_ENABLED`
- **THEN** el planificador no arranca y no se envía ningún recordatorio

#### Scenario: Pedido bajo test
- **WHEN** la suite se ejecuta con `.env.test`, que define `EVENT_REMINDERS_ENABLED=true` a propósito
- **THEN** `config.events.reminderSchedulerEnabled` es falso
