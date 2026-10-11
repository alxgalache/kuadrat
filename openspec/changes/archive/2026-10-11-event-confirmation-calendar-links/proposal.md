## Why

El email «Registro confirmado» de un evento de `/live` solo lleva el título y la contraseña de acceso: ni la fecha, ni la hora, ni el enlace al evento. Cuando el evento va a empezar, el asistente tiene que buscar la web y localizar el evento por su cuenta. Además, nada le ayuda a recordarlo: el evento no está en su calendario, que es lo que de verdad avisa en el momento justo.

Hay un segundo fallo que haría inútil cualquier enlace del email: `updateEvent` regenera el slug cada vez que cambia el título (`generateSlug` le añade un sufijo aleatorio). Si el admin corrige el título después de abrir el registro, `/live/<slug>` deja de existir y todos los enlaces enviados dan 404, también el CTA del anuncio de eventos.

## What Changes

- **El email de confirmación incluye la fecha y la hora** del evento, en hora peninsular española, y el **enlace a la ficha del evento** (`/live/<slug>`):
  - un botón «Ir al evento», sin la dirección en texto;
  - una línea que explica cómo entrar desde otro dispositivo: «Acceder con contraseña» en la ficha, con el email y la contraseña del mismo mensaje.
- **Una fila de tres botones para añadir el evento al calendario**: Google Calendar, Outlook y Apple. Cada uno lleva el icono oficial de la aplicación, y la fila va precedida de un texto que explica para qué sirve. Cada botón lleva título, inicio y fin, enlace e instrucciones de acceso:
  - **Google Calendar**: enlace directo `calendar.google.com/calendar/render?action=TEMPLATE`. En Android e iOS, la app de Google Calendar declara esa ruta como suya (`assetlinks.json` y `apple-app-site-association` de `calendar.google.com`). Así, si la app está instalada, el sistema operativo la abre con el formulario relleno, y si no, se abre la web. Debe ser un enlace directo: una redirección intermedia impide que iOS abra la app.
  - **Outlook**: enlace directo al formulario de Outlook en la web (`outlook.live.com/calendar/deeplink/compose`), con las horas en UTC. Las apps móviles de Outlook no declaran rutas de calendario y no existe un esquema documentado que abra su formulario relleno, así que el destino fiable es la web, y el evento se sincroniza después con la app.
  - **Apple**: un fichero `.ics` servido por un endpoint nuevo y público, `GET /api/events/:id/calendar.ics`. En iPhone, Safari muestra la hoja «Añadir al calendario». En Mac abre Calendario, y en Windows lo abre Outlook. Una línea bajo la fila indica que ese archivo también vale para Outlook de escritorio y la mayoría de calendarios: es la vía de respaldo general, incluidas las cuentas de trabajo de Microsoft 365.
- **La contraseña nunca viaja al calendario.** La descripción del evento remite al email de confirmación. Los enlaces de Google y Outlook pasan por servidores de terceros, y un calendario se comparte y se sincroniza.
- **La hora del evento tiene una sola interpretación.** `events.event_datetime` es hora de pared de `Europe/Madrid` sin zona. Un módulo con nombre la convierte en un instante UTC, con los cambios de horario resueltos, y lo usan el email, los tres enlaces y el `.ics`.
- **El slug queda fijo al publicar.** `updateEvent` solo lo regenera mientras el evento está en `draft`.
- **Se escapan `firstName` y `eventTitle` en el HTML del email.** Hoy se interpolan sin escapar, y el nombre lo escribe el propio asistente al registrarse.

## Capabilities

### New Capabilities

- `event-calendar-links`: enlaces para añadir un evento de `/live` a Google Calendar, Outlook y Apple Calendar. Cubre la interpretación horaria de `event_datetime`, el contenido del evento de calendario (sin contraseña), el endpoint público `.ics` y qué eventos sirve.
- `event-slug-stability`: el slug de un evento no cambia una vez publicado, de modo que los enlaces ya enviados por email siguen funcionando.

### Modified Capabilities

- `event-password-access`: el requisito «Send event confirmation email with password» pasa a exigir la fecha y la hora, el enlace al evento con las instrucciones de acceso desde otro dispositivo, la fila de botones de calendario y el escape de los datos del asistente y del evento.

## Impact

- **API:**
  - `api/services/emailService.js` (`sendEventConfirmationEmail`, que recibe el evento entero en vez de solo el título);
  - los dos llamadores en `api/controllers/eventController.js` (`verifyEmail` y `confirmPayment`);
  - `api/services/eventService.js` (`updateEvent`, slug).
  - Utilidades nuevas: `api/utils/eventTime.js` (hora de pared de Madrid → UTC) y `api/utils/eventCalendar.js` (enlaces de Google y Outlook, URL del `.ics` y generación del fichero).
  - Ruta nueva: `GET /api/events/:id/calendar.ics`.
- **Cliente:** solo recursos estáticos. Tres iconos PNG versionados en `client/public/email/calendar/`, servidos desde `CLIENT_URL` como el logo de los emails. Ningún cambio de interfaz.
- **Sin cambios de esquema ni de dependencias:** la conversión horaria usa `Intl`, nativo de Node 20.
- **Despliegue:** API y cliente juntos, como siempre: el email empieza a referenciar los iconos que publica el cliente.
- **Tests (Jest):** conversión horaria con los cambios de horario y con distintas zonas del proceso, construcción de los enlaces y del `.ics`, el endpoint, el contenido del email en la bandeja simulada (`__getOutbox`) y la estabilidad del slug.
- **Verificación manual:** `client/` no tiene runner y el comportamiento depende de cada dispositivo. Hay una matriz de pruebas en dispositivos reales: Android, iPhone, escritorio con Windows, macOS y Linux, y los clientes Gmail, Apple Mail y Outlook.
- **Documentación:** una regla nueva en `.claude/rules/events/`, una línea en «Invariantes transversales» de `CLAUDE.md` (hora de pared de Madrid) y una guía para el operador en `docs/`.
