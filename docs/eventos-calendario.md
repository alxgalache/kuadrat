# Email de confirmación de eventos: enlace y calendario

Guía operativa del email «Registro confirmado» de los eventos de `/live`: qué lleva, qué hace cada botón de calendario en cada dispositivo, cómo comprobarlo y qué tocar si algo deja de funcionar. Decisiones y motivos: `openspec/changes/archive/2026-10-11-event-confirmation-calendar-links`. Requisitos vigentes: `openspec/specs/event-calendar-links`, `openspec/specs/event-slug-stability` y el email de confirmación en `openspec/specs/event-password-access`.

---

## 1. Qué lleva el email

Por orden:

1. Saludo y título del evento.
2. **Fecha y hora** en hora peninsular española, por ejemplo «martes, 20 de octubre de 2026, 19:00».
3. Importe pagado, si el evento es de pago.
4. La **contraseña de acceso**, en el recuadro amarillo.
5. **Acceso al evento:**
   - el botón «Ir al evento», que lleva a `https://140d.art/live/<slug>` (la dirección no se muestra en texto);
   - cómo entrar desde otro dispositivo: «Acceder con contraseña» en la página del evento, con el email y la contraseña.
6. **Añadir al calendario:** tres botones en una fila (Google Calendar, Outlook y Apple) y una línea que explica que «Apple» descarga un `.ics`.

Si la fecha del evento no se puede interpretar, el email sale igualmente, sin la fecha y sin la fila de calendario.

**La contraseña nunca va al calendario.** El evento del calendario lleva el enlace y remite al email de confirmación para la contraseña. Los enlaces de Google y Outlook pasan por sus servidores, y un calendario se comparte y se sincroniza.

**El enlace no se rompe al corregir el título.** El slug solo cambia mientras el evento está en borrador. Una vez publicado, cambiar el título no cambia `/live/<slug>`.

---

## 2. Qué hace cada botón en cada dispositivo

Quien decide si se abre una app es el sistema operativo, no la web: es el único que sabe qué apps hay instaladas.

| Dispositivo y cliente | Google Calendar | Outlook | Apple (`.ics`) |
|---|---|---|---|
| Android con la app de Google Calendar | Se abre la app con el evento relleno | Outlook en la web, en el navegador | Se descarga; Android ofrece las apps que lo abren (Samsung Calendar y otras) |
| Android sin la app | Google Calendar en el navegador, relleno | Igual | Igual |
| iPhone con la app de Google Calendar (Apple Mail, Safari) | Se abre la app | Outlook en la web, en Safari | Hoja «Añadir a Calendario» |
| iPhone, Gmail con su navegador interno | Google Calendar en la web, dentro de Gmail | Outlook en la web | Puede no mostrar la hoja: abrir el enlace en Safari |
| Windows | Google Calendar en la web | Outlook.com en la web | Se descarga y lo abre Outlook (clásico o nuevo) |
| macOS | Web | Web | Se descarga y lo abre Calendario |
| Linux | Web | Web | Se descarga y lo abre la app de calendario que haya |

Notas:

- **Outlook en el móvil siempre abre la web.** Microsoft no ofrece un enlace que abra su app con el evento relleno. El evento se guarda en la cuenta y aparece después en la app.
- **El botón de Outlook es para cuentas personales** (Outlook.com y Hotmail). Con una cuenta de trabajo de Microsoft 365 o con Outlook de escritorio, la vía es el botón «Apple» (`.ics`), y la línea bajo los botones lo dice.
- **Gmail en iPhone:** en la configuración de Gmail (aplicaciones predeterminadas), elegir Safari para abrir los enlaces web hace que el botón de Google abra la app y que el `.ics` muestre la hoja de Calendario.
- **El `.ics` se genera al pulsar**, así que refleja la hora vigente del evento. Los enlaces de Google y Outlook llevan los datos del momento en que se envió el email.

---

## 3. Requisitos que no viven en el código

- **El seguimiento de clics de Resend debe seguir desactivado** en el dominio. Si se activa, cada enlace pasa por una redirección de Resend y, en iPhone, el botón de Google deja de abrir la app de Google Calendar, porque iOS no abre apps tras una redirección.
- **La ruta `GET /api/events/:id/calendar.ics` no se retira nunca.** Los emails enviados la enlazan para siempre: retirarla deja sin servicio el botón «Apple» de todos ellos.
- **Los iconos se sirven desde el cliente** (`client/public/email/calendar/`), así que el email depende de que `CLIENT_URL` sea público. Lo es en preproducción y producción. En desarrollo, `localhost` no se ve desde un buzón real.

---

## 4. Comprobar que los enlaces siguen funcionando

Google y Microsoft no documentan oficialmente estos enlaces, y pueden cambiarlos sin aviso. Si alguien informa de que un botón abre un formulario vacío:

1. Registrarse en un evento de prueba (casilla «Evento de prueba») con un buzón propio.
2. Copiar el enlace del botón y abrirlo en el escritorio:
   - **Google:** debe abrir «Nuevo evento» con título, fecha y hora rellenos. La forma es `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=AAAAMMDDTHHMMSSZ/…Z&details=…&location=…`.
   - **Outlook:** debe abrir el formulario con asunto, inicio y fin. La forma es `https://outlook.live.com/calendar/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=…&startdt=AAAA-MM-DDTHH:MM:SSZ&enddt=…`.
3. Si ha cambiado el formato, se corrige en un solo sitio: `api/utils/eventCalendar.js`. La referencia comunitaria más mantenida es `github.com/InteractionDesignFoundation/add-event-to-calendar-docs`.
4. **Las horas van siempre en UTC con `Z`.** Nunca con desfase `+02:00`: Outlook convierte el `+` en un espacio y descarta las horas.

---

## 5. Sustituir un icono

Los iconos son los oficiales de cada aplicación, sin modificar, como PNG de 56 × 56 que se muestran a 28 × 28:

| Fichero | Origen |
|---|---|
| `google-calendar-v1.png` | `fonts.gstatic.com/s/i/productlogos/calendar_2020q4/v13/web-96dp/logo_calendar_2020q4_color_2x_web_96dp.png` |
| `outlook-v1.png` | `res-1.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/png/outlook_96x1.png` |
| `apple-calendar-v1.png` | `www.apple.com/v/icloud/ak/images/overview/icon_calendar__dd9ecztq7hg2_large_2x.png` (148 × 144, rellenado a cuadrado) |

Para cambiar uno (por ejemplo, si Microsoft termina de sustituir el icono de Outlook):

1. Publicarlo con **otro nombre** (`outlook-v2.png`) en `client/public/email/calendar/`. **Nunca sobrescribir el anterior**: los emails ya enviados lo siguen pidiendo.
2. Cambiar la ruta en `EVENT_CALENDAR_ICONS` (`api/services/emailService.js`).
3. Desplegar API y cliente juntos.

---

## 6. Resultados de la verificación en dispositivos

Rellenar al probar en preproducción (sección 8 de `tasks.md` del cambio archivado). Si un resultado contradice la tabla del apartado 2, corregirla.

| Prueba | Resultado | Fecha |
|---|---|---|
| Android con la app de Google Calendar: botón de Google | Pendiente | |
| iPhone con la app de Google Calendar, desde Apple Mail: botón de Google | Pendiente | |
| Escritorio: botón de Google | Pendiente | |
| Outlook (cuenta personal), en escritorio y en un móvil | Pendiente | |
| iPhone, Safari: botón «Apple» (`attachment`) | Pendiente | |
| macOS / Windows: botón «Apple» | Pendiente | |
| Android: botón «Apple», qué app lo abre | Pendiente | |
| Aviso de 15 minutos del `.ics` en Apple Calendar | Pendiente | |
| Retitular un evento publicado: el enlace del email sigue abriendo la ficha | Pendiente | |
| Email en Gmail web y móvil, Apple Mail y Outlook de escritorio, con imágenes activadas y bloqueadas | Pendiente | |
