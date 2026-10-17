---
paths:
  - "api/utils/{eventTime,eventCalendar}.js"
  - "client/public/email/calendar/**"
  - "api/tests/{eventTime,eventCalendar,eventCalendarIcs,eventConfirmationEmail,eventSlugStability}.test.js"
---

## Email de confirmación de eventos: enlace y calendario (`event-confirmation-calendar-links`)

El email «Registro confirmado» (`sendEventConfirmationEmail`) lleva fecha, enlace a `/live/<slug>` y tres botones para añadir el evento al calendario: Google Calendar, Outlook y Apple. Guía para el operador: `docs/eventos-calendario.md`.

* **`event_datetime` es hora de pared de `Europe/Madrid` sin zona**, tal como la envía el `datetime-local` del admin, y la API corre en UTC. Solo `api/utils/eventTime.js` la convierte en un instante, con `Intl` y sin dependencias.
  * En los cambios de horario sigue la desambiguación `compatible` de Temporal: la hora inexistente de primavera avanza la duración del salto, y la repetida de otoño toma su primera aparición.
  * Lo ilegible da `null`, y el email sale sin fecha ni fila de calendario: nunca falla por esto.
  * `fmtDateTime` del anuncio de eventos (`marketingEmailService`) todavía depende de la zona del contenedor. Cuando se toque, que use este módulo.
  * `eventDateStamp` (`AAAAMMDD` en Madrid, `null` si es ilegible y nunca lanza) da también la fecha del nombre de la carpeta de las grabaciones de Agora en S3 (`.claude/rules/agora/recording.md`). Un cambio de formato o una excepción ahí afecta a las grabaciones, no solo a los emails.
* **La lógica por dispositivo la ejecuta el sistema operativo, no nosotros.** La app de Google Calendar declara `calendar.google.com/calendar/render` como suya en Android (`assetlinks.json`, `com.google.android.calendar`) y en iOS (`apple-app-site-association`, `com.google.calendar`). Si está instalada, el sistema la abre con el formulario relleno; si no, se abre la web. Por eso:
  * **El enlace de Google va directo en el email.** Un redireccionador nuestro, por ejemplo para leer el `User-Agent`, rompe el caso de iOS: tras una redirección HTTP, iOS abre Safari y no la app. Por la misma razón, **el seguimiento de clics de Resend debe seguir desactivado**.
  * **`render?action=TEMPLATE`, nunca `eventedit`**: en Android, `eventedit` abre la app sin empezar a crear el evento.
  * Se descartaron las URL `intent://` y `ms-outlook://`: los clientes de correo filtran los esquemas que no son `http(s)`, Chrome solo lanza actividades `BROWSABLE`, y `ms-outlook://events/new` abre la app sin rellenar nada.
* **Outlook: `outlook.live.com/calendar/deeplink/compose`, con las horas en UTC y `Z`.**
  * Un desfase `+02:00` llega a Outlook con el `+` convertido en espacio, y descarta las horas.
  * `office.com` daba un bucle de inicio de sesión en 2025.
  * Las apps de Outlook no declaran rutas de calendario, así que en el móvil siempre se abre la web.
  * Las cuentas de trabajo de Microsoft 365 y Outlook de escritorio van por el `.ics`, y la línea bajo los botones lo dice.
* **Apple = `GET /api/events/:id/calendar.ics`**, público y por id:
  * sirve solo eventos `scheduled` y `active`, también los de prueba; 404 para borradores, terminados, cancelados e ids inexistentes;
  * se genera en cada petición, con `max-age=300`;
  * **la ruta no se retira nunca**, ni en un rollback: los emails enviados la enlazan para siempre;
  * RFC 5545 con CRLF, plegado a 75 octetos por punto de código, `UID` estable, `METHOD:PUBLISH` (no es una invitación) y un `VALARM` de 15 minutos. Google y Outlook no aplican avisos desde la URL.
* **Un solo constructor para los tres destinos** (`buildCalendarEvent`): mismo título (`«<título> · 140d»`), inicio, fin y URL de la ficha, también la del botón «Ir al evento».
  * El `body` de Outlook es HTML (`<br>`, `<a>`) con un escape mínimo, porque `escapeHtml` convertiría cada `/` de la URL en `&#x2F;`.
  * En el email, los `href` solo escapan `&`: las URLs ya van codificadas con porcentajes.
* **La contraseña nunca va al calendario** (decisión del operador): la descripción remite al email de confirmación. Un test comprueba que ningún `href` del email la contiene.
* **Datos congelados frente a datos vivos:** los enlaces de Google y Outlook llevan los datos del momento del envío; el `.ics` refleja la hora vigente. No existe un aviso de cambio de hora. Lo más cercano es el recordatorio de 48 h (`.claude/rules/events/reminder-email.md`), que se rearma al cambiar la fecha y la lleva actualizada.
* **El esqueleto del email se comparte con el recordatorio** (`eventEmailDocument`, `eventPasswordBox` en `emailService.js`): un cambio en la cabecera, el pie o el recuadro de la contraseña afecta a los dos.
* **Slug fijo al publicar.** `updateEvent` solo lo regenera mientras el evento está en `draft`. Antes, un título corregido rompía todos los enlaces enviados, también el CTA del anuncio. `registerAttendee` admite registros en borradores; es un caso límite que se acepta.
* **Iconos oficiales sin modificar** en `client/public/email/calendar/`: 56 × 56 mostrados a 28 × 28, servidos desde `CLIENT_URL`. Una versión nueva se publica con otro nombre (`-v2`) y se cambia `EVENT_CALENDAR_ICONS`; nunca se sobrescribe. Las fuentes están en la guía.
* **Punto ciego conocido:** el comportamiento real en cada dispositivo (app abierta, formulario relleno, hoja de Calendario en Safari, qué app abre un `.ics` en Android) solo se comprueba a mano, con la tabla de resultados de la guía. Gmail para iOS con su navegador interno no abre apps ni muestra la hoja del `.ics`.
