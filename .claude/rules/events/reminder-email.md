---
paths:
  - "api/services/eventReminderService.js"
  - "api/scheduler/eventReminderScheduler.js"
  - "api/utils/eventCoverImage.js"
  - "api/tests/{eventReminder,eventCoverImage}.test.js"
---

## Recordatorio 48 h antes de un evento (`event-reminder-email`)

Email «Tu evento se acerca» a cada asistente con registro confirmado, 48 h antes de `event_datetime`, en cualquier evento de `/live`: directos y pases de vídeo, gratuitos y de pago, también de prueba. Lleva la imagen, la fecha, la contraseña, «Ir al evento» y la fila de calendario. El diseño aprobado está en `openspec/changes/archive/*-event-reminder-email/email-preview.html`. Guía para el operador: `docs/eventos-recordatorio.md`.

* **Un planificador propio, no envíos programados de Resend** (`scheduledAt`).
  * Un email programado al registrarse congela la fecha de ese momento: un aplazamiento dejaría en camino la hora vieja.
  * Cancelar o reprogramar exige guardar un id por asistente y llamar a Resend uno a uno, y un email cancelado ya no se puede volver a programar.
  * Resend solo programa con 30 días de antelación como máximo, y con SMTP no existe.
  * El planificador decide en cada pasada (5 min) con la BD tal como está y genera el email con los datos vigentes.
* **Ventana `[inicio − 48 h, inicio)` y estado `scheduled`.**
  * El inicio sale de `eventStartUtc` (hora de Madrid). Por eso se leen los eventos `scheduled` por índice y la ventana se filtra en JS.
  * Una pasada tras una caída sigue enviando, y el texto da la fecha, nunca «en 48 horas».
  * Un evento iniciado deja de ser `scheduled`, y con él se acaban los recordatorios.
* **Destinatarios: confirmados antes del momento del recordatorio.**
  * `SEAT_HOLDER_CONDITION` (y con él el staff fuera, a conciencia) y `access_password IS NOT NULL`.
  * En el servicio, `requiresPayment` e `isEmailBanned`: los predicados existentes, nunca copiados en SQL.
  * Un solo email por dirección normalizada. Una segunda fila con la misma dirección se **reclama sin enviar**: si no, en la pasada siguiente sería la «primera» y repetiría.
* **`confirmed_at`, y no `created_at`.**
  * Se estampa en `setAttendeePassword`, la primera emisión de la contraseña, que es justo cuando sale la confirmación por los dos caminos (`verifyEmail` y `confirmPayment`). `COALESCE` lo protege.
  * `created_at` es el registro: en un evento de pago, quien paga 47 h antes recibiría confirmación y recordatorio seguidos.
  * `verification_sent_at` cambia en cada reacceso.
  * `NULL` (filas anteriores al cambio) cuenta como «antes».
* **Como mucho una vez.**
  * `claimReminder` es un `UPDATE … WHERE reminder_sent_at IS NULL AND reminder_attempts < 3` que suma un intento, y solo quien cambia la fila envía. Así, dos pasadas concurrentes (o local y staging sobre la misma base) no duplican.
  * Si el envío falla, `releaseReminder` lo deja para la pasada siguiente, y el tercer fallo lo abandona con un `logger.error`.
  * Una caída entre el reclamo y el envío pierde ese recordatorio. Es deliberado: repetir el de todo un evento al reiniciar sería peor.
* **Un cambio de fecha rearma.** `updateEvent` pone a cero `reminder_sent_at` y `reminder_attempts` en el mismo `createBatch` que el `UPDATE` del evento, si el **instante** cambia (`eventStartUtc`). Comparar cadenas rearmaría con cada guardado, porque el formulario de admin reenvía la fecha reformateada.
* **Espaciado de 600 ms y siempre por `sendMail`.** Así se queda por debajo del límite por segundo de Resend. La API de lotes saltaría `sendMail`, que es lo que la suite anula (`testEnvironmentIsolation`). Un evento grande ocupa varias pasadas, y `running` impide solaparlas.
* **`EVENT_REMINDERS_ENABLED`, apagada por defecto y siempre bajo test.**
  * La API local (con `nodemon`) apunta a preproducción y al email real: con el planificador siempre activo, la máquina de quien desarrolla escribiría a los asistentes de preproducción. Se descubrió al implementar.
  * Mismo criterio que `DB_BACKUP_ENABLED`: por configuración, nunca por `NODE_ENV`.
  * `.env.test` la pide a propósito, y `eventReminder.test.js` comprueba el rechazo.
  * Producción y staging la ponen a `true` en su `api/.env`.
* **El email comparte esqueleto con la confirmación.** `eventEmailDocument` (cabecera con logo, contenido, pie con nota opcional) y `eventPasswordBox` viven en `emailService.js`, y la confirmación se extrajo sin cambiar un byte, comprobado con un hash de su HTML. La URL de la imagen es `eventCoverImageUrl` (`api/utils/eventCoverImage.js`), compartida con el anuncio de eventos. El asunto usa `formatEventWhenEs` («el jueves 22 de octubre a las 19:00»): `Intl` pone una coma tras el día de la semana.
* **Mensaje de servicio, no comercial:** sin enlace de baja, y el pie explica por qué se recibe. La contraseña nunca va en un `href`, y la consulta de eventos no lee `video_url`, `video_url_av1` ni `recording_enabled`.
* **Punto ciego conocido:** cómo se ve en cada cliente de correo solo se comprueba a mano (`tasks.md` §7). El servidor está cubierto por `eventReminder.test.js`, que también comprueba que los guardas fallan cuando se rompen.
