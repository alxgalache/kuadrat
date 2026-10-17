# Recordatorio de eventos 48 horas antes

Guía operativa del email «Tu evento se acerca» que reciben los asistentes de un evento de `/live`. Decisiones y motivos: `openspec/changes/event-reminder-email` (archivado al terminar). Requisitos: `openspec/specs/event-reminder-email`.

---

## 1. Activarlo

El envío solo funciona donde la variable está activada, en el `api/.env` del servidor:

```
EVENT_REMINDERS_ENABLED=true
```

- **Producción y staging:** activada. Tras cambiarla, reinicia el contenedor de la API.
- **Local:** **no la actives.** La API local apunta a la base de datos de preproducción y al proveedor de email real: escribiría a los asistentes de preproducción. Si alguna vez la activas para una prueba, no habrá duplicados con el staging (cada envío se reserva antes de salir), pero los emails saldrán desde tu máquina.
- **Tests:** siempre apagada, diga lo que diga el fichero.

Al arrancar, el log dice `[eventReminderScheduler] Event reminders scheduled every 5 min` o `… EVENT_REMINDERS_ENABLED not set — scheduler not started`.

**Para detener los envíos sin desplegar:** quita la variable y reinicia la API.

---

## 2. Cuándo sale

- **Momento:** a partir de 48 horas antes de la fecha y la hora del evento (hora peninsular española), en la primera pasada del planificador, que corre cada 5 minutos.
- **Solo eventos programados:** nada para borradores, cancelados, eventos ya iniciados o terminados.
- **Tras una caída:** si la API estuvo caída al cumplirse las 48 h, el recordatorio sale en cuanto vuelve, siempre antes de que empiece el evento. El texto no dice «en 48 horas»: da la fecha.

## 3. A quién

A cada asistente con el registro **confirmado**: email verificado y contraseña emitida. En los eventos de pago, solo quien ha pagado.

No lo reciben:

- quien no verificó su email;
- quien debe el pago;
- quien está expulsado del evento;
- el admin con acceso de staff;
- **quien confirmó en las últimas 48 h**, porque su confirmación ya lleva la fecha y la contraseña.

Cada dirección lo recibe una sola vez por evento.

## 4. Qué pasa si…

| Situación | Resultado |
|---|---|
| Aplazas el evento después de enviado el recordatorio | Vuelve a salir 48 h antes de la nueva fecha, con la fecha nueva |
| Guardas el evento sin cambiar la fecha | No se reenvía nada |
| Cancelas el evento | No sale ninguno más. No hay email de cancelación |
| Inicias el evento antes de hora | No sale ninguno más |
| Resend falla con un asistente | Se reintenta en la pasada siguiente, hasta 3 intentos |

## 5. Comprobarlo en los logs

Cada evento con envíos deja una línea:

```
[eventReminder] Reminders sent  { eventId, sent, failed, gaveUp }
```

- `sent`: enviados en esa pasada.
- `failed`: fallos que se reintentarán.
- `gaveUp`: asistentes abandonados tras el tercer fallo, con su propia línea de error.

Los logs no llevan emails ni contraseñas, solo ids.

Para ver en la base de datos a quién se envió, mira `event_attendees.reminder_sent_at` (instante del envío) y `reminder_attempts` de las filas del evento.

## 6. Cambiar el texto o el diseño

El email es `sendEventReminderEmail` en `api/services/emailService.js`. Comparte cabecera, pie y recuadro de contraseña con «Registro confirmado» (`eventEmailDocument`, `eventPasswordBox`): un cambio ahí afecta a los dos. La referencia visual aprobada es `email-preview.html`, en la carpeta del cambio.
