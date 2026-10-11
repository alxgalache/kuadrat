## Context

**El email.** `sendEventConfirmationEmail` (`api/services/emailService.js`) recibe `{ email, firstName, eventTitle, accessPassword, amountPaid }`. Lo llaman dos puntos de `api/controllers/eventController.js`:

- `verifyEmail`, en los eventos gratuitos y en el reacceso por código;
- `confirmPayment`, en los de pago. Una reconfirmación con el mismo PaymentIntent no reenvía el email.

Hoy el HTML interpola `firstName` y `eventTitle` sin escapar. No lleva ni fecha ni enlace.

**La hora del evento.** `events.event_datetime` se guarda tal como sale del `<input type="datetime-local">` del admin: hora de pared sin zona («2026-08-21T19:52»), que la ficha muestra tal cual. Para un enlace de calendario hace falta un instante absoluto, y el contenedor de la API corre en UTC. El comentario de `finalEnLocal` en `client/app/live/[slug]/page.js` documenta el fallo que produce mezclar los dos marcos: dos horas de desfase en agosto.

**El slug.** `updateEvent` lo regenera, con sufijo aleatorio, en cada cambio de título, y `GET /api/events/:slug` busca solo por slug.

**Imágenes del email.** El logo se sirve desde `LOGO_URL` (`https://cdn.140d.art/140d.png`). Una imagen externa es lo más fiable en Gmail, según el comentario de `getLogoSrc`.

**Resend.** El seguimiento de clics está desactivado (confirmado por el operador), así que los enlaces llegan al usuario tal cual.

**Investigación sobre cada destino.** Resumen de lo comprobado el 2026-10-11:

- **Google Calendar.** `https://calendar.google.com/.well-known/assetlinks.json` delega `handle_all_urls` en `com.google.android.calendar`. El `apple-app-site-association` de `calendar.google.com` declara para `EQHXZ8M8AV.com.google.calendar` (la app de la App Store) las rutas `/calendar/render`, `/calendar/r/*`, `/calendar/eventedit` y `/calendar/event`. La referencia comunitaria `InteractionDesignFoundation/add-event-to-calendar-docs` (verificada el 2026-08-19) aporta dos datos:
  - `render?action=TEMPLATE` es la forma que llega al editor en Android;
  - `eventedit` abre la app sin empezar a crear el evento.
- **Outlook.** El AASA de `outlook.live.com` y de `outlook.office.com` solo declara rutas `/mail/.../applink/...`, ninguna de calendario. Hay hilos de Microsoft Q&A y Tech Community sobre los otros caminos:
  - `ms-outlook://events/new` (sin documentar) abre la app sin rellenar el formulario;
  - el enlace web siempre abre el navegador;
  - `outlook.office.com/calendar/0/deeplink/compose` entraba en un bucle de inicio de sesión en junio de 2025, mientras que `outlook.live.com/calendar/0/deeplink/compose` funcionaba;
  - un desfase positivo (`+11:00`) llega como espacio y Outlook descarta las horas.
- **iOS y redirecciones.** En foros de desarrolladores de Apple, Auth0 y Adjust consta que un enlace universal tras una redirección HTTP se abre en el navegador, no en la app (iOS 17+).
- **`.ics` en iPhone.** Servido como `text/calendar`, Safari ofrece añadirlo a Calendario. Hay informes de que el navegador interno de Gmail para iOS y Chrome para iOS no lo hacen.

## Goals / Non-Goals

**Goals:**

- Que el asistente tenga en el email la fecha, la hora y el enlace al evento, y sepa cómo entrar desde otro dispositivo.
- Añadir el evento al calendario con un toque, con la mejor experiencia que permita cada dispositivo, sin pedirle nada que no haga falta.
- Una vía de respaldo universal (`.ics`) para todo lo que no cubren Google y Outlook.
- Una sola interpretación de `event_datetime` en el servidor, independiente de la zona del contenedor.
- Que los enlaces ya enviados sigan funcionando aunque se corrija el título del evento.

**Non-Goals:**

- Enlace mágico que entre al evento sin contraseña: pondría un secreto en una URL reenviable y en los logs.
- Notificar a los asistentes cuando un evento cambia de hora o se cancela.
- Emails de recordatorio.
- Botones de calendario en la ficha web o en la fase SUCCESS de `EventAccessModal`. Sería fácil sobre este diseño, pero los enlaces tendrían que llegar desde la API para no copiar los constructores en el cliente.
- Yahoo, Office 365 como botón propio y otros calendarios con botón propio.
- Adjuntar el `.ics` al email.
- Corregir `fmtDateTime` del anuncio de eventos (`marketingEmailService`), que depende de la zona del contenedor. Podrá usar el módulo nuevo en otro cambio.

## Decisions

### 1. La lógica por dispositivo la ejecuta el sistema operativo, no un redireccionador nuestro

**Decisión:** los botones de Google y Outlook enlazan directamente a `calendar.google.com` y a `outlook.live.com`.

Quien decide si se abre una app es Android (App Links verificados) o iOS (enlaces universales), y es el único que sabe si la app está instalada. Un redireccionador nuestro que leyera el `User-Agent` no puede saberlo. Además, en iOS rompería justo el caso que más importa: tras una redirección, el enlace universal de Google Calendar se abre en Safari en vez de en la app.

Comportamiento esperado:

| Dispositivo y cliente | Google Calendar | Outlook | Apple (`.ics`) |
|---|---|---|---|
| Android con la app de Google Calendar (app de Gmail, Chrome) | App Link verificado: se abre la app con el formulario de nuevo evento relleno | Navegador: Outlook en la web, con inicio de sesión si no hay sesión | Descarga; Android ofrece las apps que abren `text/calendar` (Samsung Calendar y otras). La app de Google Calendar puede no importarlo |
| Android sin la app | Google Calendar en el navegador, formulario relleno | Igual | Igual |
| iPhone con la app de Google Calendar (Apple Mail, Safari, Gmail que abre en Safari) | Enlace universal: se abre la app | Safari: Outlook en la web | Safari: hoja «Añadir a Calendario» |
| iPhone, Gmail con su navegador interno | Probablemente Google Calendar en la web, dentro de Gmail: el navegador interno no sigue enlaces universales | Outlook en la web | Puede no mostrar la hoja: limitación conocida, abrirlo en Safari |
| iPhone sin la app de Google | Google Calendar en la web móvil | Outlook en la web | Hoja «Añadir a Calendario» |
| Windows | Google Calendar en la web | Outlook.com en la web | Descarga: lo abre Outlook clásico o el nuevo Outlook, el gestor de `.ics` por defecto desde que Windows retiró Correo y Calendario |
| macOS | Web | Web | Descarga: lo abre Calendario, u Outlook para Mac si es el predeterminado |
| Linux | Web | Web | Descarga: lo abre Thunderbird, GNOME Calendar o el gestor que haya |

El ejemplo que pidió el operador («en Android, abrir la app de Google Calendar») lo cumple el propio Android, sin código nuestro.

**Alternativas descartadas:**

- **Redireccionador por `User-Agent`** (`/api/events/:id/calendar/google`): rompe los enlaces universales en iOS, no sabe qué apps hay instaladas y añade una ruta y un analizador de agentes que mantener. Su única ventaja, que los datos estén siempre al día, la cubre el `.ics` (decisión 6).
- **URL `intent://` de Android** con `ACTION_INSERT`: los clientes de correo filtran los esquemas que no son `http(s)`, y Chrome solo lanza actividades `BROWSABLE`, que el editor de eventos no declara. Además sobra, porque el App Link ya lleva a la app.
- **`ms-outlook://events/new`:** sin documentar, abre la app sin rellenar el formulario según los informes, y también lo filtran los clientes de correo.

### 2. Outlook: formulario web de `outlook.live.com`, en UTC

**Decisión:** un solo botón de Outlook a `https://outlook.live.com/calendar/deeplink/compose?path=/calendar/action/compose&rru=addevent&…`, con `startdt` y `enddt` en UTC con `Z`.

- **`live.com` y no `office.com`:** es la variante verificada en 2026, y la de `office.com` daba un bucle de inicio de sesión en 2025. Cubre las cuentas personales (Outlook.com y Hotmail), que son las del público general de la galería.
- **Las cuentas de trabajo de Microsoft 365** y Outlook de escritorio quedan cubiertos por el `.ics`, y la línea bajo los botones lo dice.
- **UTC con `Z`** esquiva el fallo del `+` y no depende de la zona del usuario: Outlook pinta el evento en la suya.

**Alternativas descartadas:**

- Dos botones (Outlook.com y Microsoft 365): el operador pidió un botón de Outlook, y el `.ics` ya resuelve las cuentas de trabajo.
- Servir el `.ics` al pulsar «Outlook» en Windows: obligaría a leer el `User-Agent` (decisión 1) y, a quien usa Outlook.com en el navegador, le abriría una app sin sesión.

### 3. Apple: un `.ics` servido por la API

**Decisión:** el botón «Apple» enlaza a `GET <SITE_API_BASE_URL>/api/events/:id/calendar.ics`, público.

Es el formato estándar y el único que lleva a Apple Calendar. También es la vía universal: Outlook de escritorio, Thunderbird, Samsung Calendar…

- **Identificado por `id`, no por slug.** El id es estable, y un UUID no es adivinable aunque el endpoint sea público.
- **Solo `scheduled` y `active`:** un borrador no se expone por id, y un evento cancelado o terminado no se añade.
- **`Content-Disposition: attachment`** con el slug como nombre de fichero.
- **`Cache-Control: public, max-age=300`**, para que un cambio de hora se vea en minutos.

La respuesta no es JSON y es la excepción razonada a `sendSuccess()`: `res.type('text/calendar').send(...)`.

**Contenido del `.ics`:**

- `UID:event-<id>@140d.art` estable: si alguien lo importa dos veces, Calendario puede reconocer el mismo evento.
- `METHOD:PUBLISH`, no `REQUEST`, porque no es una invitación con organizador y respuestas.
- Un `VALARM` de 15 minutos: avisa justo cuando hace falta el enlace. Google (`erem`) y Outlook (`reminder`) no aplican avisos desde la URL según la referencia comunitaria, y usan el aviso por defecto del usuario.

**Alternativas descartadas:**

- **Adjuntar el `.ics` al email:** Gmail lo presenta como una invitación o un adjunto suelto, sube la puntuación de spam y congela los datos.
- **`href` con `data:text/calendar`:** Gmail filtra `data:` en los enlaces.
- **`webcal://`:** crea una suscripción a un calendario, no añade un evento, y su esquema también se filtra.

### 4. Todo en UTC; la zona solo existe en un módulo

**Decisión:** `api/utils/eventTime.js` es la única pieza que sabe que `event_datetime` es hora de pared de `Europe/Madrid` (`EVENT_TIME_ZONE`). Expone:

- `eventStartUtc(event)` y `eventEndUtc(event)`, que devuelven un `Date` o `null`;
- `formatEventDateTimeEs(event)`, para la línea del email: «martes, 20 de octubre de 2026, 19:00».

**Método de conversión, con `Intl` nativo:**

1. Se toma el instante candidato como si la hora de pared fuera UTC.
2. Se mide el desfase de Madrid en ese instante con `Intl.DateTimeFormat(…, { timeZone })`.
3. Se resta, y se repite una vez para cubrir el cambio de horario.

Esta resolución equivale a la desambiguación `compatible` de Temporal: una hora inexistente avanza la duración del salto, y una hora repetida toma la primera aparición. Un valor con `Z` o desfase explícito se respeta. Lo ilegible da `null` y el email sale sin fecha ni calendario: el email de confirmación nunca debe fallar por esto.

Los tres destinos van en UTC, sin `ctz` y sin `VTIMEZONE`. Cada calendario lo pinta en la zona de su usuario, y un asistente en Canarias o en el extranjero ve su hora correcta. En el texto del email, la etiqueta «(hora peninsular española)» evita la ambigüedad.

**Alternativas descartadas:**

- **`luxon` o `date-fns-tz`:** una dependencia nueva para una función.
- **`TZ=Europe/Madrid` en el contenedor:** una dependencia silenciosa del entorno, justo la clase de fallo que describe `finalEnLocal`.
- **`ctz=Europe/Madrid` y `TZID`:** obligan a incluir un `VTIMEZONE` en el `.ics` para los clientes estrictos, y no aportan nada.

### 5. Un constructor para los tres destinos

**Decisión:** `api/utils/eventCalendar.js` construye, a partir de la fila del evento, un objeto `{ title, start, end, pageUrl, descriptionLines }`, y de él salen:

- `googleCalendarUrl`;
- `outlookCalendarUrl`;
- `icsUrl`, la URL del endpoint;
- `buildIcs`, el texto del fichero.

Formato de cada pieza:

- **Título:** `«<título> · 140d»`.
- **Ubicación:** la URL de la ficha. Es lo que los calendarios enseñan en la agenda y en la notificación, y en un evento en línea es el «dónde».
- **Descripción:** en Google, texto con saltos de línea; en Outlook, HTML con `<br>` y un enlace, porque su `body` se interpreta como HTML; en el `.ics`, texto escapado.

La URL de la ficha (`<CLIENT_URL>/live/<slug>`) sale del mismo módulo para el botón «Ir al evento», de modo que el enlace del email y el del calendario no pueden divergir.

### 6. Datos congelados en Google y Outlook, vivos en el `.ics`

Los enlaces de Google y Outlook llevan los datos en la URL, fijados al enviarse el email: es el precio del enlace directo (decisión 1). El `.ics` se genera en cada petición. Si un evento cambia de hora después de registrarse alguien, el email, Google y Outlook muestran la hora antigua. Avisar de ese cambio es otro problema (non-goal), y hoy tampoco existe.

### 7. La contraseña no viaja al calendario

Decisión del operador. La descripción remite al email de confirmación. Una contraseña en la URL de Google o de Outlook pasaría por sus servidores y por el historial del navegador, y quedaría en cualquier calendario compartido o sincronizado. Un test comprueba que ningún `href` del email contiene la contraseña.

### 8. Presentación de los botones

**Decisión:** tres celdas de una tabla con `width="33%"`, separadas por celdas espaciadoras: así la fila nunca se parte, ni en Outlook de escritorio, que usa el motor de Word. Cada celda es una «tarjeta» enlazada:

- fondo blanco, borde `1px solid #dadce0` y radio de 8 px;
- icono oficial de 28 × 28 px centrado sobre el nombre;
- nombre en 13 px, peso 500 y color `#3c4043`.

Es la presentación habitual de «Añadir al calendario» (Luma, Calendly, Eventbrite): un contenedor neutro que no altera los colores de ninguna marca, porque las tres prohíben modificar sus iconos. El icono sobre el nombre, y no a su lado, cabe en tres columnas cuando el cliente de correo encoge el email de 600 px en un móvil.

- **Nombres:** «Google Calendar», «Outlook», «Apple».
- **Texto previo:** «Añade el evento a tu calendario y tendrás el enlace a mano cuando empiece:».
- **Línea posterior**, gris y pequeña: «Con «Apple» descargas el evento en un archivo .ics, que también abren Outlook de escritorio y la mayoría de calendarios.»
- **Botón «Ir al evento»:** usa el estilo de botón negro que ya tienen los emails (`#111827`).

**Iconos:** PNG a doble resolución (56 × 56), descargados una vez de las fuentes oficiales y versionados en `client/public/email/calendar/`:

| Fichero | Fuente oficial |
|---|---|
| `google-calendar-v1.png` | `fonts.gstatic.com/s/i/productlogos/calendar_2020q4/v13/web-96dp/logo_calendar_2020q4_color_2x_web_96dp.png` |
| `outlook-v1.png` | CDN Fluent de Microsoft, `res-1.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/png/outlook_96x1.png`. Es el mismo icono que sirve hoy el favicon de `outlook.live.com` |
| `apple-calendar-v1.png` | `www.apple.com/v/icloud/ak/images/overview/icon_calendar__dd9ecztq7hg2_large_2x.png`, 148 × 144, que se rellena a cuadrado sin deformarlo |

Los `<img>` llevan `alt=""` porque el nombre en texto ya los describe. Con las imágenes bloqueadas (Outlook de escritorio por defecto), la fila sigue funcionando.

**Alternativas descartadas:**

- **Enlazar en caliente los CDN de Google, Microsoft y Apple:** pueden cambiar o desaparecer, y cada apertura del email les avisaría.
- **Adjuntos CID:** algunos clientes los listan como adjuntos y engordan cada email.
- **SVG:** Gmail no lo pinta.
- **Subirlos a `cdn.140d.art` como el logo:** exige un paso manual en S3. En el repositorio quedan revisados, versionados y desplegados con el cliente.

### 9. Slug fijo al publicar

**Decisión:** en `updateEvent`, la regeneración se condiciona a `current.status === 'draft'`. Mientras es borrador no hay emails ni calendarios con su URL. Una vez publicado, lo que vale es que los enlaces enviados (confirmación, anuncio, calendarios) sigan funcionando. A cambio, el slug conserva las palabras del título anterior, un coste menor en SEO.

**Alternativa descartada:** una tabla de slugs antiguos con redirección. Es correcta, pero son más piezas para un caso que la condición resuelve.

### 10. Firma del email

**Decisión:** `sendEventConfirmationEmail({ email, firstName, event, accessPassword, amountPaid })`. Los dos llamadores ya tienen la fila del evento. Recibir el evento entero evita una lista creciente de campos sueltos (título, slug, fecha, duración, id). `firstName` y `event.title` pasan por `escapeForEmail`, y el asunto, que es texto plano, sigue sin escapar.

## Risks / Trade-offs

- **[Google o Microsoft cambian sus formatos sin documentar]** → Los enlaces dejan de rellenar el formulario sin dar ningún error. Mitigación:
  - los dos formatos viven en una sola función cada uno, con tests de forma;
  - la guía del operador incluye cómo reverificarlos;
  - el `.ics`, estándar, sigue funcionando.
- **[Gmail para iOS con su navegador interno]** → No sigue enlaces universales, y el `.ics` puede no mostrar la hoja de Calendario. Mitigación: Gmail permite elegir Safari como navegador, y la guía lo documenta. Google Calendar en la web sigue funcionando dentro de Gmail si hay sesión.
- **[Android y `.ics`]** → La app de Google Calendar puede no importar un `.ics`. Mitigación: en Android, el botón natural es el de Google, que abre la app. El `.ics` lo abren Samsung Calendar y otras.
- **[Cuenta de trabajo en `outlook.live.com`]** → Le pedirá una cuenta personal. Mitigación: la línea bajo la fila dirige al `.ics`, que abre Outlook de escritorio.
- **[Usuarios de la app móvil de Outlook]** → Terminan en la web y pueden tener que iniciar sesión. El evento se sincroniza después con la app. No hay una alternativa documentada.
- **[Alguien activa el seguimiento de clics de Resend]** → Cada enlace pasaría por una redirección y, en iOS, la app de Google Calendar dejaría de abrirse. Mitigación: queda escrito en la regla nueva y en la guía.
- **[Cambio de hora o cancelación tras el registro]** → Google y Outlook conservan la hora antigua, y el `.ics` responde 404 a un evento cancelado. Mitigación: ninguna en este cambio (non-goal).
- **[Uso de marcas de terceros]** → Uso referencial e inalterado de los iconos, como hacen los widgets habituales. Si Microsoft termina de sustituir el icono de Outlook (rediseño de los iconos de Microsoft 365 anunciado en 2025), se publica `outlook-v2.png` y se cambia la referencia, sin sobrescribir el anterior.
- **[Iconos desde `CLIENT_URL`]** → En desarrollo, `localhost` no se ve desde un buzón real. Bajo test no sale ningún email, y en preproducción y producción el dominio es público.
- **[Retirar el endpoint `.ics`]** → Los emails ya enviados lo enlazan para siempre. Un rollback del cambio debe mantener la ruta, o los botones «Apple» de esos emails darían 404.

## Migration Plan

1. Desplegar API y cliente juntos con `./deploy/deploy.sh`: el email empieza a referenciar los iconos del cliente y el endpoint de la API. No hay cambios de esquema ni datos que migrar.
2. Verificar en preproducción con la matriz de dispositivos de `tasks.md`: registrarse en un evento de prueba (`is_test`) y probar cada botón en cada dispositivo.
3. **Rollback:** revertir el commit. La única consecuencia es la del último riesgo: si se revierte, conviene mantener la ruta `.ics` aunque se retire el resto.

## Open Questions

- Sin decisiones pendientes. Lo que solo puede confirmarse en dispositivos reales queda en la verificación manual de `tasks.md`: el editor relleno en las apps de Google Calendar en Android e iOS, la hoja de Calendario con `attachment` en Safari y el comportamiento del `.ics` en Android. Si Safari no mostrara la hoja con `attachment`, se cambia a `inline`, que también admite `filename`.
