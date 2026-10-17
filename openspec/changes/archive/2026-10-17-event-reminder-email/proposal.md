## Why

Entre el registro en un evento de `/live` y su celebración pueden pasar semanas, y lo único que recibe el asistente es el email de confirmación del momento del registro. Quien se registró con antelación olvida la fecha o no encuentra el enlace y la contraseña: la plaza ocupada no se convierte en asistencia. Un recordatorio 48 horas antes, con el nombre, la imagen, la fecha y la hora del evento y lo necesario para entrar, cierra ese hueco.

## What Changes

- **Email «Recordatorio»** para los asistentes con registro confirmado, 48 h antes de `event_datetime`, en cualquier tipo de evento: directos y pases de vídeo, LiveKit y Agora, gratuitos y de pago, y eventos de prueba. Mismo diseño, mismo remitente y mismo camino de envío (`sendMail`) que «Registro confirmado». Lleva:
  - el nombre y la imagen del evento;
  - la fecha y la hora en hora peninsular española;
  - un texto de recordatorio;
  - la contraseña de acceso del asistente (decisión del operador);
  - el botón «Ir al evento», con las instrucciones para entrar desde otro dispositivo;
  - la fila para añadirlo al calendario.

  Asunto: «Recordatorio: «<título>» es el jueves 22 de octubre a las 19:00».
- **Destinatarios: quien ya recibió su confirmación antes del momento del recordatorio.** Verificado, no staff, `registered|paid|joined`, con contraseña emitida, sin pago pendiente y sin expulsión del evento. Un solo email por dirección.
  - Quien confirma en las últimas 48 h no lo recibe: su confirmación ya lleva la fecha y la contraseña, y dos emails seguidos se leen como spam.
  - Para saberlo, `event_attendees.confirmed_at` registra la **primera** emisión de la contraseña.
- **Nunca un email que no corresponde:**
  - solo con el evento `scheduled` y la hora actual entre 48 h antes del inicio y el inicio;
  - la hora se interpreta con `api/utils/eventTime.js` (hora de Madrid);
  - nada para borradores, cancelados, eventos ya iniciados o terminados, ni con la hora pasada;
  - el contenido se genera en el momento del envío, así que la fecha que muestra es siempre la vigente.
- **Exactamente una vez por asistente.** `event_attendees.reminder_sent_at` se reclama con un `UPDATE … WHERE reminder_sent_at IS NULL` antes de enviar. Si el envío falla, se libera y se reintenta en la pasada siguiente, hasta 3 intentos (`reminder_attempts`).
- **Si cambia la fecha, el recordatorio se rearma.** `updateEvent` limpia `reminder_sent_at` y `reminder_attempts` de los asistentes cuando cambia `event_datetime`, y el recordatorio vuelve a salir 48 h antes de la nueva fecha.
- **Planificador `api/scheduler/eventReminderScheduler.js`**, cada 5 minutos y sin solapar pasadas. Los envíos van espaciados para no superar el límite de Resend.

## Capabilities

### New Capabilities

- `event-reminder-email`: recordatorio por email 48 h antes de un evento de `/live`. Cubre la ventana, los destinatarios, el momento de confirmación, el envío una sola vez con reintentos acotados, el rearme por cambio de fecha, el contenido del email y el planificador.

### Modified Capabilities

Ninguna. «Registro confirmado» (`event-password-access`) no cambia. La única novedad en su camino es que la primera emisión de la contraseña estampa `confirmed_at`, que es un detalle de implementación.

## Impact

- **Capas:** solo backend. El email usa los recursos estáticos que el cliente ya publica: el logo y los iconos de calendario.
- **API:**
  - servicio nuevo `api/services/eventReminderService.js`;
  - planificador nuevo `api/scheduler/eventReminderScheduler.js`, arrancado en `api/server.js`;
  - `api/services/eventService.js`: consulta de destinatarios, reclamo y liberación, `confirmed_at` en `setAttendeePassword` y rearme en `updateEvent`;
  - `api/services/emailService.js`: `sendEventReminderEmail`, que reutiliza las piezas del email de confirmación;
  - `api/utils/eventTime.js`: formato «el jueves 22 de octubre a las 19:00»;
  - módulo con nombre para la URL pública de la imagen del evento, que hoy calcula en línea `marketingEmailService`, y que pasan a usar los dos.
- **Esquema de BD:** tres columnas en `event_attendees`, en el `CREATE TABLE` y con `safeAlter`, sin rellenar datos:
  - `confirmed_at DATETIME`;
  - `reminder_sent_at DATETIME`;
  - `reminder_attempts INTEGER NOT NULL DEFAULT 0`.

  Solo en `api/config/database.js`. Las filas anteriores tienen `confirmed_at` nulo, que cuenta como «confirmado antes»: quien ya estaba registrado recibe su recordatorio.
- **Configuración:** `EVENT_REMINDERS_ENABLED`, apagada por defecto y siempre apagada bajo test. Hay que ponerla a `true` en el `api/.env` de producción y del staging, pero no en local, que apunta a preproducción con el email real (decisión tomada al implementar; ver la Decisión 9 del diseño).
- **Dependencias:** ninguna nueva.
- **Correo:** un email por asistente y evento. Los envíos se espacian (600 ms) para quedar por debajo del límite por segundo de Resend. Es un mensaje de servicio ligado al registro que hizo el usuario, no publicidad: no requiere consentimiento de marketing.
- **Lecturas de Turso:**
  - una consulta de eventos `scheduled` cada 5 minutos, por índice;
  - una consulta de asistentes por evento dentro de su ventana de 48 h, por `idx_event_attendees_event`.

  Del orden de cientos de miles de filas al mes por evento, frente a 2.500 millones del plan.
- **Tests (Jest):**
  - ventana y estados;
  - destinatarios: verificación, staff, pago pendiente, expulsión, duplicados y corte por `confirmed_at`;
  - una sola vez con dos pasadas concurrentes;
  - fallo con reintento y tope;
  - rearme por cambio de fecha;
  - contenido del email en la bandeja simulada (escape, contraseña, sin `video_url`).
- **Validación del diseño:** `email-preview.html` en la carpeta del cambio es el ejemplo aprobado por el operador, y la implementación debe reproducirlo.

## Non-goals

- Otros recordatorios (24 h, 1 h, «empieza ahora») o un plazo configurable por evento.
- Avisar de un cambio de fecha o de una cancelación con un email propio. El rearme solo asegura que el recordatorio lleva la fecha nueva.
- Recordatorios de subastas y sorteos.
- Un enlace de baja: es un mensaje de servicio de un registro concreto.
- Usar Broadcasts o la API de lotes de Resend: todo pasa por `sendMail`, que es la única vía de envío y la que se anula en los tests.
