## 1. Hora del evento (`api/utils/eventTime.js`)

- [x] 1.1 Crear `api/utils/eventTime.js` con `EVENT_TIME_ZONE = 'Europe/Madrid'` y un comentario que explique por qué existe: `event_datetime` es hora de pared sin zona y el contenedor corre en UTC.
- [x] 1.2 Implementar `wallTimeToUtc(value)`:
  - acepta `AAAA-MM-DDTHH:mm`, `…:ss` y `AAAA-MM-DD HH:mm:ss`;
  - respeta `Z` y los desfases explícitos;
  - convierte con `Intl.DateTimeFormat` en dos pasadas: salto de primavera hacia delante, hora repetida de otoño en la primera aparición;
  - devuelve `null` ante cualquier valor ilegible, sin lanzar.
- [x] 1.3 Implementar `eventStartUtc(event)`, `eventEndUtc(event)` (inicio + `duration_minutes`, 60 si falta) y `formatEventDateTimeEs(event)`, que da «martes, 20 de octubre de 2026, 19:00» con `timeZone: EVENT_TIME_ZONE` y `hourCycle: 'h23'`.
- [x] 1.4 Crear `api/tests/eventTime.test.js` con los escenarios de la spec `event-calendar-links`: invierno, verano, `2026-03-29T02:30`, `2026-10-25T02:30`, `Z` explícita, valores ilegibles y la misma salida con `TZ` igual a `UTC`, `Europe/Madrid`, `America/Los_Angeles` y `Asia/Tokyo`, con la misma técnica que `passwordChangeInvalidation.test.js`. También la fecha formateada.

## 2. Enlaces y `.ics` (`api/utils/eventCalendar.js`)

- [x] 2.1 Crear `api/utils/eventCalendar.js` con `eventPageUrl(event)` (`${config.clientUrl}/live/${slug}`) y `buildCalendarEvent(event)`, que devuelve `{ title: '<título> · 140d', start, end, pageUrl, descriptionLines }`, o `null` si no hay inicio válido.
- [x] 2.2 Implementar `googleCalendarUrl(event)`: `https://calendar.google.com/calendar/render?action=TEMPLATE` con `text`, `dates` en UTC (`AAAAMMDDTHHMMSSZ/…Z`), `details` (líneas unidas con `\n`) y `location` (URL de la ficha).
- [x] 2.3 Implementar `outlookCalendarUrl(event)`: `https://outlook.live.com/calendar/deeplink/compose` con `path=/calendar/action/compose`, `rru=addevent`, `subject`, `startdt` y `enddt` en UTC con `Z` (`AAAA-MM-DDTHH:MM:SSZ`), `body` en HTML (líneas escapadas unidas con `<br>`, la URL como `<a>`) y `location`.
- [x] 2.4 Implementar `icsUrl(event)` (`${config.siteApiBaseUrl}/api/events/${id}/calendar.ics`) y `buildIcs(event, { now })`, que genera:
  - `VCALENDAR` con `VERSION:2.0`, `PRODID:-//140d Galería de Arte//Eventos//ES`, `CALSCALE:GREGORIAN` y `METHOD:PUBLISH`;
  - `VEVENT` con `UID:event-<id>@140d.art`, `DTSTAMP`, `DTSTART` y `DTEND` en UTC, `SUMMARY`, `DESCRIPTION`, `LOCATION` y `URL`;
  - `VALARM` `DISPLAY` con `TRIGGER:-PT15M`;
  - texto escapado (`\\`, `\;`, `\,`, `\n`), líneas en CRLF y plegado a 75 octetos sin partir un carácter UTF-8.
- [x] 2.5 Crear `api/tests/eventCalendar.test.js`:
  - forma de cada URL (prefijo, `action=TEMPLATE`, `rru=addevent`, fechas exactas, sin `+` ni `%2B` en las fechas de Outlook);
  - los tres destinos con el mismo título, inicio, fin y URL;
  - la contraseña `ABC234` en ningún destino;
  - ningún destino con `video_url`, `video_url_av1` ni `recording_enabled`;
  - plegado (ninguna línea de más de 75 octetos con un título largo con acentos y emojis) y escape (comas, punto y coma, saltos), comprobados desplegando el fichero;
  - `null` cuando el inicio es ilegible.

## 3. Endpoint `GET /api/events/:id/calendar.ics`

- [x] 3.1 Añadir `getEventCalendarIcs` en `api/controllers/eventController.js`:
  - `getEventById`;
  - 404 (`ApiError`) si no existe, si su `status` no es `scheduled` ni `active`, o si `buildIcs` devuelve `null`;
  - si no, `res.type('text/calendar; charset=utf-8')`, `Content-Disposition: attachment; filename="<slug>.ics"` y `res.send(ics)`.

  Es la excepción razonada a `sendSuccess()`: la respuesta no es JSON.
- [x] 3.2 Registrar la ruta en `api/routes/eventRoutes.js` con `cacheControl({ maxAge: 300, etag: false })`, junto a las demás rutas `/:id/...`. Comprobar que `/:slug` no la captura.
- [x] 3.3 Crear `api/tests/eventCalendarIcs.test.js` (con `tests/helpers/app.js`):
  - 200 con las cabeceras de la spec para `scheduled`, `active` y un evento `is_test`;
  - 404 para `draft`, `finished`, `cancelled` y un id inexistente;
  - el cuerpo refleja una hora cambiada después de crear el evento;
  - el cuerpo no contiene `video_url` ni `video_url_av1`.

## 4. Iconos del email (cliente, solo recursos estáticos)

- [x] 4.1 Descargar los tres iconos de las fuentes oficiales de `design.md` (decisión 8) a un directorio vacío del scratchpad.
- [x] 4.2 Convertirlos con Python y PIL (`python3 -I`) a PNG cuadrados de 56 × 56 con fondo transparente. El de Apple (148 × 144) se rellena a cuadrado sin deformarlo, y ninguno se recolorea ni se recorta.
- [x] 4.3 Guardarlos como `client/public/email/calendar/google-calendar-v1.png`, `outlook-v1.png` y `apple-calendar-v1.png`. Comprobarlos a la vista y que pesan pocos KB.

## 5. Email de confirmación

- [x] 5.1 Cambiar la firma de `sendEventConfirmationEmail` (`api/services/emailService.js`) a `{ email, firstName, event, accessPassword, amountPaid }`, y escapar `firstName` y `event.title` con `escapeForEmail` en el HTML. El asunto, `Registro confirmado - <título>`, sigue en texto plano.
- [x] 5.2 Añadir la línea de fecha y hora con `formatEventDateTimeEs` y la etiqueta «(hora peninsular española)». Se omite si el inicio es ilegible.
- [x] 5.3 Añadir la sección de acceso tras el recuadro de la contraseña:
  - «Cuando empiece el evento, podrás acceder desde este enlace:»;
  - botón negro «Ir al evento» a `eventPageUrl(event)`;
  - la URL visible;
  - «Si entras desde otro dispositivo o navegador, pulsa «Acceder con contraseña» en la página del evento e introduce tu email y la contraseña de arriba.»
- [x] 5.4 Añadir la fila de calendario (decisión 8 de `design.md`):
  - texto previo;
  - tabla de tres celdas al 33 % con espaciadores, en el orden Google Calendar, Outlook, Apple;
  - cada tarjeta enlazada (`target="_blank"`) con el icono de `${config.clientUrl}/email/calendar/…-v1.png` (`width="28" height="28" alt=""`) sobre el nombre en texto;
  - la línea sobre el `.ics`.

  Se omite entera si `buildCalendarEvent` devuelve `null`. Las rutas de los iconos van en una constante con nombre junto a la plantilla.
- [x] 5.5 Actualizar los dos llamadores de `api/controllers/eventController.js` (`verifyEmail` y `confirmPayment`) para pasar `event` en vez de `eventTitle`.
- [x] 5.6 Crear `api/tests/eventConfirmationEmail.test.js`. Usa la bandeja simulada (`__getOutbox`/`__clearOutbox`) y llama a la función directamente y a través de `verify-email`. Comprueba:
  - la fecha formateada;
  - el botón y la URL `/live/<slug>`;
  - el texto de «Acceder con contraseña»;
  - los tres `href` en orden;
  - los tres `<img>` versionados;
  - el nombre `<b>Ana</b>` escapado;
  - ningún `href` con la contraseña;
  - con `event_datetime` ilegible, el email sale sin fecha ni fila, con la contraseña y la sección de acceso.
- [x] 5.7 Ejecutar `eventRegistrationVerification.test.js` y `eventPaymentConfirmation.test.js` y confirmar que siguen en verde: dependen de la bandeja, no de la firma.

## 6. Slug estable (riesgo: `updateEvent` es la ruta de edición de todos los eventos)

- [x] 6.1 En `updateEvent` (`api/services/eventService.js`), regenerar el slug solo si `current.status === 'draft'`, con un comentario que explique que los enlaces enviados por email y los calendarios dependen de él.
- [x] 6.2 Crear `api/tests/eventSlugStability.test.js` con los tres escenarios de la spec `event-slug-stability`: borrador retitulado, publicado retitulado (`GET /api/events/<slug anterior>` sigue devolviendo el evento con el título nuevo) y publicar y retitular en la misma edición.

## 7. Suite completa

- [x] 7.1 Ejecutar `npm test` en `api/` y confirmar la suite entera en verde, incluido `testEnvironmentIsolation.test.js`.

## 8. Verificación manual en preproducción (sin runner en el cliente, depende del dispositivo)

- [ ] 8.1 Desplegar en preproducción y registrarse en un evento de prueba (`is_test`) con un buzón real. Revisar el email en Gmail web, Gmail en Android, Gmail en iOS, Apple Mail en iPhone y Outlook de escritorio, con imágenes activadas y bloqueadas: la fila no se parte, los iconos se ven nítidos y los nombres se leen.
- [ ] 8.2 Google Calendar:
  - Android con la app: se abre la app con el formulario relleno;
  - iPhone con la app, desde Apple Mail: se abre la app;
  - escritorio: formulario web relleno a la hora correcta.
- [ ] 8.3 Outlook: con una cuenta personal, el formulario web sale relleno a la hora correcta, en escritorio y en un móvil.
- [ ] 8.4 Apple / `.ics`:
  - iPhone en Safari: hoja «Añadir a Calendario». Si no aparece con `attachment`, probar con `inline` y anotar el resultado en la guía;
  - macOS: abre Calendario;
  - Windows: abre Outlook;
  - Android: anotar qué app lo abre.
- [ ] 8.5 Comprobar que el aviso de 15 minutos del `.ics` salta en Apple Calendar y que, en los tres calendarios, el enlace de la ubicación y de la descripción lleva a la ficha.
- [ ] 8.6 Retitular el evento de prueba ya publicado y comprobar que el enlace del email sigue abriendo la ficha.

## 9. Documentación

- [x] 9.1 Escribir `docs/eventos-calendario.md`, una guía para el operador:
  - qué hace cada botón en cada dispositivo (la matriz de `design.md`);
  - cómo reverificar los formatos de Google y Outlook;
  - por qué el seguimiento de clics de Resend debe seguir desactivado;
  - cómo sustituir un icono publicando `-v2` sin sobrescribir el anterior;
  - los resultados reales de la sección 8.
- [x] 9.2 Añadir en «Invariantes transversales» de `CLAUDE.md` la línea: «`events.event_datetime` es hora de pared de `Europe/Madrid` sin zona: se convierte a un instante solo con `api/utils/eventTime.js`, nunca con `new Date()` en el servidor.» Comprobar el presupuesto de 40.000 caracteres.
- [x] 9.3 Crear `.claude/rules/events/confirmation-calendar-links.md`, con `paths:` a `api/utils/eventTime.js`, `api/utils/eventCalendar.js` y `client/public/email/calendar/**`. Debe recoger el porqué no obvio:
  - el sistema operativo decide la app y un redireccionador lo rompería en iOS;
  - `render` y no `eventedit`;
  - `outlook.live.com` en UTC con `Z`;
  - `.ics` por id con 404 fuera de `scheduled`/`active`, y la ruta no se retira mientras haya emails enviados;
  - la contraseña nunca va al calendario;
  - el seguimiento de clics de Resend debe seguir desactivado;
  - el slug queda fijo al publicar.

  Añadir su línea al índice «Eventos: acceso, vídeo y staff» de `CLAUDE.md`.
- [x] 9.4 Ejecutar `node scripts/check-claude-rules.mjs` y corregir lo que señale.
