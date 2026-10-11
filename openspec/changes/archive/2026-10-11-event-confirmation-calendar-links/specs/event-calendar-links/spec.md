## ADDED Requirements

### Requirement: Interpretación horaria de event_datetime

`events.event_datetime` SHALL interpretarse como hora de pared de `Europe/Madrid` cuando no lleva zona (`2026-10-20T19:00`, `2026-10-20T19:00:00` o `2026-10-20 19:00:00`). Un valor con `Z` o con desfase explícito SHALL respetarse tal cual. La conversión a un instante UTC SHALL vivir en un único módulo, `api/utils/eventTime.js`, y SHALL dar el mismo resultado sea cual sea la zona horaria del proceso. El fin del evento SHALL ser el inicio más `duration_minutes` (60 si falta).

En los cambios de horario:

- una hora que no existe (el salto de primavera) SHALL desplazarse hacia delante la duración del salto;
- una hora que existe dos veces (la vuelta de otoño) SHALL resolverse con la primera aparición, en horario de verano.

Un valor que no se puede interpretar SHALL dar `null`, nunca una excepción.

#### Scenario: Evento en horario de invierno
- **WHEN** `event_datetime` vale `2026-12-10T19:00`
- **THEN** el inicio SHALL ser `2026-12-10T18:00:00Z`

#### Scenario: Evento en horario de verano
- **WHEN** `event_datetime` vale `2026-07-10T19:00`
- **THEN** el inicio SHALL ser `2026-07-10T17:00:00Z`

#### Scenario: Independiente de la zona del proceso
- **WHEN** se convierte `2026-07-10T19:00` con `TZ` igual a `UTC`, `Europe/Madrid`, `America/Los_Angeles` o `Asia/Tokyo`
- **THEN** el inicio SHALL ser `2026-07-10T17:00:00Z` en los cuatro casos

#### Scenario: Hora inexistente en el salto de primavera
- **WHEN** `event_datetime` vale `2026-03-29T02:30`
- **THEN** el inicio SHALL ser `2026-03-29T01:30:00Z`, es decir, las 03:30 hora de verano

#### Scenario: Hora repetida en la vuelta de otoño
- **WHEN** `event_datetime` vale `2026-10-25T02:30`
- **THEN** el inicio SHALL ser `2026-10-25T00:30:00Z`, la primera aparición

#### Scenario: Valor con zona explícita
- **WHEN** `event_datetime` vale `2026-07-10T17:00:00Z`
- **THEN** el inicio SHALL ser `2026-07-10T17:00:00Z`

#### Scenario: Valor ilegible
- **WHEN** `event_datetime` es nulo o no es una fecha válida
- **THEN** la conversión SHALL devolver `null` sin lanzar

### Requirement: Contenido del evento de calendario

Los tres destinos (Google Calendar, Outlook y el `.ics`) SHALL describir el mismo evento, construido en `api/utils/eventCalendar.js` a partir de la fila del evento:

- título `«<título del evento> · 140d»`;
- inicio y fin según el requisito de interpretación horaria;
- como ubicación, la URL de la ficha del evento, `<CLIENT_URL>/live/<slug>`;
- como descripción, la URL de la ficha y la indicación de que, desde otro dispositivo o navegador, se entra con «Acceder con contraseña» en la ficha, con el email y la contraseña del email de confirmación. El botón de la ficha que abre el acceso dice «Registrarse» antes del inicio y «Acceder» durante el evento, así que el texto nombra solo el botón del modal, que no cambia.

El evento de calendario SHALL NOT contener la contraseña de acceso, el token de acceso ni ningún dato del asistente. Tampoco SHALL contener `video_url`, `video_url_av1` ni `recording_enabled`.

#### Scenario: Sin contraseña en ningún destino
- **WHEN** se construyen los tres destinos para un asistente con contraseña `ABC234`
- **THEN** ni la URL de Google, ni la de Outlook, ni el cuerpo del `.ics` SHALL contener `ABC234`
- **AND** la descripción SHALL remitir al email de confirmación para la contraseña

#### Scenario: Sin campos privados del evento
- **WHEN** el evento tiene `video_url`, `video_url_av1` y `recording_enabled = 1`
- **THEN** ninguno de los tres destinos SHALL contener esos valores

#### Scenario: Mismo evento en los tres destinos
- **WHEN** se construyen los tres destinos para un evento
- **THEN** los tres SHALL llevar el mismo título, el mismo inicio, el mismo fin y la misma URL de la ficha

### Requirement: Enlace de Google Calendar

El enlace de Google Calendar SHALL ser `https://calendar.google.com/calendar/render?action=TEMPLATE`, con `text`, `dates`, `details` y `location`. `dates` SHALL ir en UTC, como `AAAAMMDDTHHMMSSZ/AAAAMMDDTHHMMSSZ`. El email SHALL enlazar a esa URL directamente, sin ninguna redirección de 140d en medio: en iOS, una redirección impide que el sistema abra la app.

#### Scenario: Formato del enlace
- **WHEN** se construye el enlace para un evento el `2026-12-10T19:00` de 90 minutos
- **THEN** la URL SHALL empezar por `https://calendar.google.com/calendar/render?`
- **AND** SHALL llevar `action=TEMPLATE`
- **AND** SHALL llevar `dates=20261210T180000Z/20261210T193000Z`

#### Scenario: Android con la app de Google Calendar
- **WHEN** un asistente pulsa el botón en un Android con la app de Google Calendar instalada
- **THEN** el sistema SHALL abrir la app en el formulario de nuevo evento, con los datos rellenos

#### Scenario: Sin la app instalada o en escritorio
- **WHEN** un asistente pulsa el botón en un escritorio, o en un móvil sin la app de Google Calendar
- **THEN** SHALL abrirse Google Calendar en el navegador, con el formulario de nuevo evento relleno

### Requirement: Enlace de Outlook

El enlace de Outlook SHALL ser `https://outlook.live.com/calendar/deeplink/compose`, con `path=/calendar/action/compose`, `rru=addevent`, `subject`, `startdt`, `enddt`, `body` y `location`. `startdt` y `enddt` SHALL ir en UTC con `Z` (`AAAA-MM-DDTHH:MM:SSZ`) y nunca con un desfase `+HH:MM`, porque Outlook decodifica el `+` como un espacio y descarta las horas.

#### Scenario: Formato del enlace
- **WHEN** se construye el enlace para un evento el `2026-07-10T19:00` de 60 minutos
- **THEN** la URL SHALL empezar por `https://outlook.live.com/calendar/deeplink/compose?`
- **AND** SHALL llevar `rru=addevent` y `path=/calendar/action/compose` codificados
- **AND** `startdt` SHALL valer `2026-07-10T17:00:00Z` y `enddt` `2026-07-10T18:00:00Z`
- **AND** la URL SHALL NOT contener `%2B` ni `+` en las fechas

#### Scenario: Cuenta personal de Outlook
- **WHEN** un asistente con sesión en Outlook.com pulsa el botón, en cualquier dispositivo
- **THEN** SHALL abrirse el formulario de nuevo evento de Outlook en la web, con los datos rellenos

### Requirement: Fichero .ics del evento

La API SHALL servir `GET /api/events/:id/calendar.ics`, público y sin autenticación, para los eventos en estado `scheduled` o `active`, también los de prueba (`is_test`). SHALL responder 404 a un evento en `draft`, `finished` o `cancelled`, y a un id inexistente. El fichero SHALL generarse con los datos del evento en el momento de la petición.

La respuesta SHALL llevar:

- `Content-Type: text/calendar; charset=utf-8`;
- `Content-Disposition: attachment; filename="<slug>.ics"`;
- una cabecera `Cache-Control` pública de cinco minutos como máximo.

El fichero SHALL cumplir RFC 5545: líneas terminadas en CRLF, plegadas a 75 octetos sin partir un carácter UTF-8, y texto escapado (`\\`, `\;`, `\,`, `\n`). SHALL contener:

- un `VCALENDAR` con `VERSION:2.0`, `PRODID`, `CALSCALE:GREGORIAN` y `METHOD:PUBLISH`;
- un `VEVENT` con `UID:event-<id>@140d.art`, `DTSTAMP`, `DTSTART` y `DTEND` en UTC, `SUMMARY`, `DESCRIPTION`, `LOCATION` y `URL`;
- un `VALARM` de tipo `DISPLAY` 15 minutos antes del inicio.

#### Scenario: Evento programado
- **WHEN** alguien pide `GET /api/events/<id>/calendar.ics` de un evento `scheduled`
- **THEN** la API SHALL responder 200 con `Content-Type: text/calendar; charset=utf-8`
- **AND** el cuerpo SHALL contener `UID:event-<id>@140d.art` y el `DTSTART` del evento en UTC

#### Scenario: Evento no público o inexistente
- **WHEN** alguien pide el `.ics` de un evento en `draft`, `finished` o `cancelled`, o de un id inexistente
- **THEN** la API SHALL responder 404

#### Scenario: Datos actualizados
- **WHEN** el admin cambia la hora de un evento después de enviarse el email de confirmación
- **THEN** el `.ics` pedido después SHALL llevar la hora nueva

#### Scenario: Plegado y escape
- **WHEN** el título del evento tiene comas, punto y coma, acentos y más de 75 octetos
- **THEN** cada línea del fichero SHALL medir 75 octetos o menos, sin contar el CRLF
- **AND** el texto desplegado SHALL ser el título original, con los caracteres especiales escapados

#### Scenario: iPhone
- **WHEN** un asistente pulsa el botón «Apple» en un iPhone y el enlace se abre en Safari
- **THEN** iOS SHALL mostrar la hoja para añadir el evento a Calendario

### Requirement: Fila de botones de calendario en el email

El email de confirmación SHALL mostrar, precedida de un texto que explica para qué sirve, una fila de tres botones en este orden: Google Calendar, Outlook y Apple. Enlazan, respectivamente, al enlace de Google Calendar, al de Outlook y al `.ics` del evento.

- Los tres botones SHALL ir en una sola fila, maquetada con una tabla para que ningún cliente de correo la parta en varias líneas.
- Cada botón SHALL mostrar el icono oficial de su aplicación sobre su nombre. El icono SHALL ser un PNG servido desde `<CLIENT_URL>/email/calendar/`, con versión en el nombre del fichero (`-v1`): un icono publicado nunca se sobrescribe.
- El nombre del botón SHALL ser texto, para que la fila siga siendo comprensible con las imágenes bloqueadas.
- Bajo la fila, una línea SHALL indicar que el botón «Apple» descarga el evento en un archivo `.ics` que también abren Outlook de escritorio y la mayoría de calendarios.

#### Scenario: Fila completa
- **WHEN** se envía el email de confirmación de un evento con fecha válida
- **THEN** el HTML SHALL contener los tres enlaces en el orden Google Calendar, Outlook, Apple, dentro de una misma fila de tabla
- **AND** cada botón SHALL contener su nombre en texto y un `<img>` con su icono versionado

#### Scenario: Imágenes bloqueadas
- **WHEN** el cliente de correo bloquea las imágenes externas
- **THEN** los tres botones SHALL seguir mostrando su nombre y SHALL seguir siendo enlaces
