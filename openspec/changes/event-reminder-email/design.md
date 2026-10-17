## Context

**El email de confirmación.** `sendEventConfirmationEmail` (`api/services/emailService.js`) se envía al emitirse la contraseña de acceso:

- en `verifyEmail`, para los eventos gratuitos y para el reacceso;
- en `confirmPayment`, para los de pago.

Lleva la fecha (`formatEventDateTimeEs`), la contraseña, «Ir al evento» con instrucciones y la fila de calendario (`eventAccessSection`, `eventCalendarRow`). La contraseña se guarda en claro en `event_attendees.access_password` y solo se crea una vez: `setAttendeePassword` se llama únicamente si la fila aún no la tiene.

**Asistentes.** `SEAT_HOLDER_CONDITION` (verificado, no staff, `registered|paid|joined`) define quién ocupa plaza. `requiresPayment(event, attendee)` es el único predicado de pago pendiente, y `isEmailBanned` el de expulsión. Las filas sin verificar no han demostrado ser dueñas del email: escribirles sería enviar correo a direcciones inventadas. `created_at` es el registro, no la confirmación: en un evento de pago, entre los dos pueden pasar días.

**Envío.** Todo email pasa por `sendMail`, que usa Resend o SMTP según `EMAIL_PROVIDER` y que bajo test escribe en una bandeja en memoria. No hay espaciado ni cola: cada llamada es una petición a Resend, y Resend limita las peticiones por segundo de la cuenta.

**Hora.** `event_datetime` es hora de pared de Madrid sin zona, y solo `eventTime.js` la convierte (invariante de `CLAUDE.md`).

**Imagen del evento.** `marketingEmailService.buildEvent` calcula su URL pública en línea (`absoluteUrl(event.cover_image_url)`: absoluta tal cual, o relativa al CDN o a la API).

## Goals / Non-Goals

**Goals:**

- Un recordatorio por asistente confirmado, 48 h antes, con lo necesario para entrar.
- Ningún email que no corresponda: eventos que no van a ocurrir, ya ocurridos o cambiados de fecha, personas sin registro confirmado o recién confirmadas, duplicados.
- Que una caída de la API o de Resend retrase el recordatorio, pero no lo pierda ni lo duplique.

**Non-Goals:** los de la propuesta.

## Decisions

### 1. Planificador propio sobre la BD, no envíos programados en Resend

**Decisión:** un planificador cada 5 minutos decide en el momento quién recibe el recordatorio y genera el email con los datos vigentes.

**Alternativas investigadas:**

- **Programar el email en Resend al confirmar el registro** (`scheduledAt` de la API de envío).
  - El contenido se congela al registrarse: un cambio de fecha dejaría en camino un recordatorio con la hora vieja.
  - Una cancelación o un aplazamiento exigirían guardar el id de cada email programado y cancelarlo o reprogramarlo uno a uno (`PATCH /emails/{id}`), con una llamada externa por asistente que también puede fallar. Un email cancelado no se puede volver a programar.
  - No existe con `EMAIL_PROVIDER=smtp`.
  - Resend solo admite programar con 30 días de antelación como máximo. Un registro hecho antes de los 32 días previos al evento tendría que guardarse en otra parte y programarse después, y eso ya es un planificador propio.
  - La bandeja simulada de los tests no puede comprobar algo que ocurre en otro sistema.
- **Broadcasts de Resend** a un segmento de asistentes. Es la tubería de marketing (temas, bajas, consentimiento), y no admite una contraseña distinta por destinatario.
- **Una tabla genérica `scheduled_emails`** con una fila por envío futuro. Es una cola más que mantener (crear, cancelar, reprogramar) para un único tipo de mensaje. Con dos columnas en `event_attendees` se obtiene lo mismo, junto al dato del que depende.
- **Un marcador por evento (`events.reminder_sent_at`).** Si el proceso cae a mitad de un envío masivo, no se sabe a quién ya se escribió: o se repite a todos o se pierde al resto. El marcador por asistente resuelve las dos cosas.

### 2. La ventana `[inicio − 48 h, inicio)` y el estado `scheduled`

El planificador lee solo los eventos `scheduled` (`idx_events_status`) y filtra la ventana en JS con `eventStartUtc`, por la misma razón que el inicio automático: la hora de Madrid no se puede expresar en SQL sin copiar las reglas del cambio de horario.

- **Sin límite inferior más estrecho.** Si la API estuvo caída al abrirse la ventana, el recordatorio sale en cuanto vuelve. Uno recibido 30 horas antes sigue siendo útil, y su texto no dice «en 48 horas»: da la fecha.
- **El límite superior es el inicio.** Además, un evento iniciado (manualmente o por `event-auto-start`) deja de estar `scheduled`. Así nunca sale un recordatorio de algo que ya ha empezado.

### 3. Quién: confirmados antes del momento del recordatorio, por `confirmed_at`

La regla es «recibe el recordatorio quien ya tenía su confirmación cuando tocaba enviarlo». Evita dos emails seguidos a quien acaba de registrarse y no deja fuera a nadie que se registrara antes.

**Por qué `confirmed_at` nuevo** y no un dato existente:

- **`created_at`** marca el registro, no la confirmación. En un evento de pago, quien se registró hace una semana y paga 47 h antes recibiría la confirmación y el recordatorio con minutos de diferencia.
- **`verification_sent_at`** cambia en cada reacceso desde otro dispositivo, y excluiría a quien lleva semanas registrado.

**Dónde se estampa:** `setAttendeePassword`, porque la primera emisión de la contraseña es exactamente el momento en que se envía la confirmación, en los dos caminos. Con `COALESCE` no cambia en los reaccesos.

**Filas anteriores al despliegue:** tienen `confirmed_at` nulo y cuentan como confirmadas antes. Si un evento cae dentro de las 48 h siguientes al despliegue, sus asistentes reciben el recordatorio en la primera pasada, que es lo deseable.

Los demás filtros reutilizan los predicados existentes, sin copiarlos: `SEAT_HOLDER_CONDITION` en SQL, `requiresPayment` e `isEmailBanned` en el servicio. `access_password IS NOT NULL` asegura que hay contraseña que poner en el email. El staff queda fuera a conciencia, como pide el invariante sobre `is_staff`.

### 4. Reclamar antes de enviar; liberar si falla; tres intentos

**Decisión:** el reclamo es un `UPDATE` guardado que estampa `reminder_sent_at` y suma un intento. Solo quien lo gana envía.

- **Fallo de Resend** (límite de peticiones o red): se libera el reclamo y se reintenta a los 5 minutos.
- **Fallo persistente:** tras tres intentos se abandona, con un `logger.error` sin datos personales.
- **Caída del proceso entre el reclamo y el envío:** ese asistente se pierde. Es la elección deliberada de «como mucho una vez»: un recordatorio perdido se nota menos que uno duplicado a todo un evento, que es lo que daría «al menos una vez» si el proceso se reinicia a mitad de una pasada.

### 5. El cambio de fecha rearma

Si el admin aplaza un evento después de enviado el recordatorio, este señalaba la fecha antigua y los asistentes no recibirían nada antes de la nueva. `updateEvent` pone a cero los marcadores cuando cambia `event_datetime`, en la misma operación que el `UPDATE` del evento (`createBatch`).

No es un «aviso de cambio»: es el mismo recordatorio, que sale 48 h antes de la nueva fecha con la fecha nueva. Un adelanto que deje el evento dentro de las próximas 48 h lo hace salir en la pasada siguiente, con la fecha correcta.

### 6. Espaciado y `sendMail`

**Decisión:** envíos secuenciales con 600 ms entre uno y otro, por debajo del límite por segundo de Resend. Un evento de 500 asistentes tarda unos 5 minutos, y el indicador `running` impide solapar pasadas: la siguiente continúa con quien quede.

La API de lotes de Resend no pasaría por `sendMail`, que es la única vía de envío y la que los tests anulan (`testEnvironmentIsolation`). Saltársela por rendimiento rompería esa garantía.

### 7. Contenido: las piezas de la confirmación y un módulo para la imagen

- `sendEventReminderEmail` reutiliza `eventAccessSection`, `eventCalendarRow`, la cabecera y el pie de la confirmación. No copia su HTML: si una cambia, cambian las dos.
- **La URL de la imagen del evento** pasa a un módulo con nombre que usan el anuncio y el recordatorio. Dos copias del cálculo divergirían el día que cambie el CDN.
- **El asunto** lleva la fecha («el jueves 22 de octubre a las 19:00»), porque es lo primero que se lee en la bandeja. `Intl` en es-ES pone una coma tras el día de la semana («jueves, 22 de octubre»), así que se compone con `formatToParts` en `eventTime.js`, el único sitio que formatea esta hora.
- **La contraseña va incluida** (decisión del operador). Es el email que el asistente abrirá justo antes del evento, y va al mismo buzón que ya la recibió. Nunca va en un `href`, como en la confirmación.
- **Es un mensaje de servicio, no comercial:** recuerda un registro que hizo el usuario. Por eso no lleva enlace de baja, y el pie dice por qué lo recibe. El seguimiento de clics de Resend sigue desactivado (regla de los enlaces de calendario).

### 8. Cada 5 minutos

El recordatorio sale como mucho 5 minutos después de abrirse su ventana, y una pasada sin eventos en ventana cuesta una consulta por índice. Más frecuencia no aporta nada a un aviso de 48 h.

### 9. Activación por configuración: `EVENT_REMINDERS_ENABLED` (decisión del operador, tomada al implementar)

**El problema apareció durante la implementación.** La API local corre con `nodemon`, apunta a la base de datos de preproducción y al proveedor de email real. Con el planificador siempre activo, la máquina de quien desarrolla enviaría recordatorios reales a los asistentes de preproducción sin que nadie hiciera nada. El reclamo evita duplicados con el staging, pero no evita que el envío salga del proceso local. Los demás planificadores que actúan en local (`videoPassScheduler`) cambian datos, pero no escriben a personas.

**Decisión:** el planificador solo arranca con `EVENT_REMINDERS_ENABLED=true`. Es falso por defecto y forzado a falso bajo test, con el mismo criterio que `DB_BACKUP_ENABLED`: se activa por configuración, nunca por `NODE_ENV`. `.env.test` lo pide a propósito para que la prueba de que se rechaza signifique algo. Producción y staging lo activan en su `api/.env`, que llega al contenedor por `env_file`, así que no hay que tocar ningún fichero de compose. Si una API local lo activara, compartiría la base con el staging sin enviar dos veces, porque cada envío se reclama.

## Risks / Trade-offs

- **[Caída entre el reclamo y el envío]** → Ese asistente no recibe el recordatorio (Decisión 4). El log del reclamo y la ausencia del envío permiten verlo.
- **[Límite de Resend con otros envíos a la vez]** → Un 429 libera el reclamo y se reintenta a los 5 minutos. Con tres intentos y 600 ms de espaciado, perderlo exige tres fallos seguidos.
- **[Un evento con miles de asistentes]** → Varias pasadas de 5 minutos. El primer asistente lo recibe a su hora y el último un rato después. Aceptable para un aviso de 48 h.
- **[Reloj o zona]** → Toda la aritmética está en `eventTime.js`, probada con distintas `TZ`.
- **[Datos personales en logs]** → Solo ids y recuentos, nunca emails ni contraseñas.
- **[El HTML aprobado y el implementado divergen]** → `email-preview.html` queda en el cambio como referencia, y un test comprueba textos y piezas clave en la bandeja simulada.

## Migration Plan

1. Añadir `EVENT_REMINDERS_ENABLED=true` al `api/.env` del servidor de producción y al del staging.
2. Desplegar la API: `initializeDatabase()` añade las tres columnas con `safeAlter`.
3. La primera pasada envía los recordatorios de los eventos que ya están dentro de su ventana, a todos sus asistentes confirmados (con `confirmed_at` nulo). Revisar antes qué eventos hay en las próximas 48 h.
4. **Vuelta atrás:** quitar la variable y reiniciar para detener los envíos sin desplegar; o revertir el código. Las columnas quedan sin efecto.

La base de datos de preproducción ya tiene las tres columnas: la API local, con `nodemon`, ejecutó `initializeDatabase()` al guardar el esquema durante la implementación. Son aditivas y sin uso hasta el despliegue.

## Open Questions

Ninguna. El diseño, la estructura y los textos del email esperan la validación del operador sobre `email-preview.html`.
