## Context

Hoy el acceso a un evento de `/live` sigue `enforce-verification-gates` (`.claude/rules/events/verification-gates.md`):

```
CHOOSE ─▶ REGISTER (nombre, apellido, email, casilla) ─▶ POST /register ─▶ { attendeeId }
       ─▶ POST /send-verification (código de 6 dígitos al buzón)
       ─▶ VERIFY_EMAIL ─▶ POST /verify-email ─▶ verifyEmailCode: UPDATE condicional
            email_verified = 1 + token + guarda de aforo
       ─▶ SUCCESS (contraseña) o PAYMENT
```

Lo que no se puede romper:

- **La credencial nace en `verifyEmailCode`, en el mismo `UPDATE` que pone `email_verified = 1`**, con la guarda de aforo (`SEAT_HOLDER_CONDITION`).
- `/register` no emite nada.
- `getAttendeeByAccessToken` es la única consulta sobre `access_token_hash`.

El objetivo es que Google o Microsoft sustituyan al buzón, que es la prueba, sin abrir un segundo camino hacia la credencial.

Restricciones del proyecto:
- simplicidad ante todo (sin SDK ni piezas que mantener);
- todo el texto en es-ES en `client/lib/constants.js`;
- tema claro;
- sin runner de tests en `client/`;
- tests de la API sin red;
- la CSP de `client/next.config.js`.

Decisiones del usuario (28/10/2026):

- Proveedores: Google y Microsoft. Apple queda fuera por coste.
- Microsoft: **solo cuentas personales**.
- La casilla de aceptación va en el paso de métodos.
- En los navegadores internos, la salida al navegador real ocurre **al pulsar la tarjeta de Google**, no al pulsar «Acceder».
- Las tarjetas usan la tipografía del sitio (Inter).

## Goals / Non-Goals

**Goals:**
- Registrarse con dos toques (tarjeta → cuenta) sin ir al buzón, en el móvil y en el escritorio.
- La misma seguridad que el código: la plaza, el token y la contraseña solo existen tras una prueba de propiedad del buzón, comprobada en el servidor.
- Cumplir literalmente el texto informativo: de la cuenta solo se guardan el nombre y el email.
- Que la tarjeta de Google funcione también para quien llega desde Instagram o Facebook, sin ocultarla.
- Activar o desactivar cada proveedor solo con una variable de entorno.

**Non-Goals:** ver `proposal.md`. Los principales:
- Apple;
- cuentas de empresa de Microsoft;
- sorteos y subastas;
- cuentas de usuario de 140d;
- fusionar asistentes con emails distintos.

## Flujo completo

```
 navegador (140d.art)                  API (api.140d.art)                     proveedor
 ────────────────────                  ──────────────────                     ─────────
 METHOD: casilla ✓, «Continuar con Google»
   └─ location.assign ─▶ GET /api/events/:id/identity/google/start
                          · evento existe y admite registros
                          · state = <eventId>.<aleatorio>, nonce = aleatorio
                          · Set-Cookie ev_idp_flow (JWT firmado: state, nonce, evento,
                            proveedor; 10 min; HttpOnly; Secure; SameSite=None)
                          └─ 302 ───────────────────────────────────────▶ /authorize
                                                                            elige cuenta
                                                                            (y consiente)
                          POST /api/events/identity/google/callback ◀── form_post
                          (id_token, state)                              (id_token, state)
                          · cookie válida y state igual          (si no: SESSION_LOST)
                          · firma (JWKS), iss, aud, exp, nonce   (si no: FAILED)
                          · isAuthoritativeEmail                 (si no: EMAIL_UNTRUSTED)
                          · evento abierto y aviso de aforo      (si no: CLOSED o FULL)
                          · registerAttendee (buscar o crear, sin credencial)
                          · issueProviderProof: hash de la prueba en
                            verification_code_hash, 10 min; nombres si sin verificar
                          · Set-Cookie ev_idp_result = <attendeeId>.<prueba>
                            (HttpOnly; Secure; SameSite=Lax; 10 min); borra ev_idp_flow
   ◀──────────────────── 303 /live/<slug>#acceso
 EventDetail: lee #acceso, lo quita (replaceState) y abre el modal en COMPLETING
   └─ fetch credentials:'include' ─▶ POST /api/events/:id/identity/complete
                          · lee y borra ev_idp_result
                          · verifyEmailCode(evento, asistente, prueba)  ← el MISMO UPDATE
                          · rama de éxito compartida con verify-email:
                            IP, contraseña reutilizada o nueva, email de confirmación
   ◀──── { attendeeId, accessToken, paymentRequired, accessPassword?, firstName,
           lastName, email }
 SUCCESS (o PAYMENT) ─ storeSession como hoy
```

Los errores del inicio y de la vuelta nunca responden JSON en el navegador. Son siempre una redirección a `/live/<slug>#acceso-error=<CÓDIGO>`, que el modal traduce con `ACCESS_VERIFICATION_ERRORS`.

## Decisions

### D1. El proveedor sustituye al buzón, no al flujo

Se reutiliza `verifyEmailCode` en lugar de escribir un «verificar por proveedor» paralelo. La vuelta del proveedor hace dos cosas:

- escribe una **prueba aleatoria de un solo uso** (`emailOtp.generateOpaqueToken()`), con su SHA-256 en `verification_code_hash`, caducidad de 10 min (`OTP_TTL_MS`) y `verification_attempts = 0`;
- deja la prueba en la cookie `ev_idp_result`.

`/identity/complete` la canjea con `verifyEmailCode(eventId, attendeeId, prueba)`, sin tocar esa función.

Ventajas:

- **El `UPDATE` condicional sigue siendo el único sitio donde nace un token.** Hereda la guarda de aforo, la exención de quien ya está verificado, la detección de una prueba ya consumida y el reemplazo del token de otro dispositivo.
- Sin esquema nuevo.

Efectos aceptados:
- La prueba reemplaza un código enviado por email que siguiera pendiente, y viceversa. Siempre vale lo último que se pidió.
- `verification_sent_at` no se toca: la espera de 30 s entre envíos sigue midiendo solo los emails.

*Alternativas descartadas:*
- **Emitir el token en la vuelta del proveedor.** Crearía un segundo lugar donde nace la credencial, con su propia copia de la guarda de aforo. Es el patrón que `enforce-verification-gates` eliminó.
- **Un JWT firmado con «email verificado» en vez de una fila con hash.** Exigiría una función nueva de verificación sin código. Además, no sería de un solo uso sin guardar algo en la base de datos.

### D2. Redirección a página completa, `id_token` con `form_post`, sin SDK ni secretos

```
response_type=id_token  response_mode=form_post  scope=openid email profile
nonce=<aleatorio>  state=<eventId>.<aleatorio>  prompt=select_account
```

- **Sin popups.** Los bloquean los navegadores internos y algunos móviles. **Sin SDK**: el botón de Google Identity Services es un iframe de Google, cuyo clic no pasa por nuestro código (ver D10). Además exigiría `accounts.google.com` en `script-src` y `frame-src`. MSAL.js pesa unos 300 KB.
- **`form_post`.** El `id_token` llega en el cuerpo de un POST y no en la URL, así que no lo registran `pino-http`, nginx ni el historial. `app.js` ya monta `express.urlencoded`.
- **Sin secreto de cliente.** Con `id_token` no hay intercambio de código, y cada proveedor se activa con un identificador público. Un secreto de Microsoft caduca como mucho a los 24 meses: sería una alarma operativa más.
- Ambos discovery publican `form_post` e `id_token` (Microsoft exige marcar «ID tokens» en el registro de la app).
- **Plan B, si la prueba previa (tarea 0) muestra que Google no acepta `id_token` con `form_post` en un cliente Web:** flujo de código con `client_secret` solo para Google. El código llega por `form_post`, la API lo canjea en `oauth2.googleapis.com/token` y se añade `GOOGLE_OIDC_CLIENT_SECRET`. El resto del diseño no cambia.

*Alternativa descartada:* el flujo de código con PKCE para los dos. Es la recomendación general para aplicaciones que necesitan tokens de acceso. Aquí solo hace falta la identidad, una vez, y añadiría un intercambio y un secreto (Google exige secreto también con PKCE en clientes Web).

### D3. Dos cookies cortas en el dominio de la API, ningún secreto en la URL

| Cookie | Contenido | Atributos | Para qué |
|---|---|---|---|
| `ev_idp_flow` | JWT HS256 firmado con `JWT_SECRET` y audiencia `event-identity-flow`: `state`, `nonce`, `eventId`, `provider` | `HttpOnly; Secure; SameSite=None; Path=/api/events/identity; Max-Age=600` | Ata el flujo al navegador que lo empezó (CSRF de login) y guarda el `nonce` |
| `ev_idp_result` | `<attendeeId>.<prueba>` | `HttpOnly; Secure; SameSite=Lax; Path=/api/events; Max-Age=600` | Lleva la prueba al canje sin pasar por la URL |

- **Por qué `SameSite=None` en `ev_idp_flow`:** la vuelta es un POST entre sitios (de `accounts.google.com` a `api.140d.art`). Con `Lax`, el navegador no enviaría la cookie.
- **Por qué basta `Lax` en `ev_idp_result`:** `140d.art` y `api.140d.art` son el **mismo sitio** (mismo dominio registrable), igual que `localhost:3000` y `localhost:3001` en local. Un `fetch` con `credentials: 'include'` la envía, y la CORS de `app.js` ya tiene `credentials: true` con el origen `CLIENT_URL`. Si un entorno sirviera el cliente y la API en dominios registrables distintos, el canje fallaría: la tarea 9 lo comprueba en preproducción.
- **Por qué no `#acceso=<id>.<prueba>` en la URL.** Era la primera idea, pero la URL completa con su fragmento llega a Sentry Replay (`sendDefaultPii: true`), al píxel de Meta (`dl`) y al historial antes de que un `replaceState` la limpie. La prueba vale 10 minutos y entrega acceso y contraseña: no puede viajar así.
- El `state` lleva el id del evento en claro **solo para saber adónde redirigir un error** cuando la cookie se ha perdido. Nunca se usa para decidir nada: el evento del flujo sale de la cookie firmada.
- La API no tiene `cookie-parser`. La lectura es una función de diez líneas sobre `req.headers.cookie`, y la escritura usa `res.cookie` y `res.clearCookie` de Express.
- `Secure` siempre, también en local. Chrome y Firefox lo aceptan en `http://localhost`, pero Safari no: en local se prueba con Chrome o Firefox.

### D4. Regla de confianza: el proveedor solo sustituye al buzón cuando es su dueño

Es un único predicado con nombre, `isAuthoritativeEmail(provider, claims)`, en `api/services/identityProviders.js`.

- **Google.** Acepta el email si `email_verified === true` y además se cumple una de estas dos condiciones:
  - el email termina en `@gmail.com`;
  - el token trae `hd` (cuenta de Google Workspace).

  Es literalmente la regla de la documentación de Google: «When `email` does not contain a `@gmail.com` suffix and `hd` is absent, Google is not authoritative… `email_verified` can also be true as Google initially verified the user when the Google account was created, however ownership of the third party email account may have since changed».
- **Microsoft.** Acepta el email si el token es de una cuenta personal (`tid` = `9188040d-6c67-4c5b-b112-36a304b66dad`, el inquilino `consumers`) y su dominio está en una lista explícita de dominios de consumo de Microsoft:
  - `outlook.com`, `outlook.es`, `hotmail.com`, `hotmail.es`, `live.com`, `live.es` y `msn.com`;
  - las variantes europeas y latinoamericanas más comunes.

  Una cuenta personal creada con un Gmail o un email de empresa pasa al código.
- **En cualquier otro caso, o sin claim `email`** (una cuenta de Microsoft creada con un teléfono), la vuelta redirige con `IDENTITY_EMAIL_UNTRUSTED`. El modal abre el formulario de email con un aviso.

Por qué esta regla y no `email_verified` o `xms_edov` a secas: **una verificación aceptada por error no da solo una plaza**. Verificar el email de un asistente que ya existe le emite un token nuevo (expulsa su sesión) y **devuelve su contraseña en SUCCESS**; en un evento de pago, da acceso a lo que pagó otro. El código por email prueba el control *actual* del buzón; un email «verificado una vez» por un tercero no lo prueba. Con esta regla, el proveedor responde por un buzón que él mismo aloja, y lo demás vuelve al código. Encaja además con lo que pidió el usuario («cuentas personales, Outlook o Hotmail»).

Ampliar la lista de Microsoft es añadir una línea. Una cuenta de un dominio que falte cae al código, así que nunca abre un agujero.

### D5. Microsoft: solo cuentas personales, con la autoridad `consumers`

- **Registro de la app:** «Personal Microsoft accounts only» (`signInAudience = PersonalMicrosoftAccount`).
- **URL de autorización:** `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize`.
- **`iss` esperado**, fijo: `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`.
- **JWKS:** `https://login.microsoftonline.com/consumers/discovery/v2.0/keys`.
- Una cuenta profesional ni siquiera llega a la vuelta: Microsoft muestra su propio aviso («usa una cuenta personal»). Aun así, la API comprueba `tid` para no depender de la configuración del registro.
- **Datos de la cuenta:** `email`, `given_name` y `family_name` se piden como claims opcionales del ID token (guía 02). `name` llega con el ámbito `profile`.

### D6. Nombres: del proveedor, y nunca sobre una fila ya verificada

`namesFromClaims(claims)` (una sola función) decide los nombres:

- **nombre:** `given_name`; si falta, la primera palabra de `name`; si tampoco, la parte local del email;
- **apellido:** `family_name`; si falta, el resto de `name`; si tampoco, una cadena vacía (`last_name` es `NOT NULL`, no «no vacío»).

Ambos se recortan a 120 caracteres, el mismo tope que `registerAttendeeSchema`.

- **Fila nueva:** `registerAttendee` la crea con esos nombres.
- **Fila existente sin verificar:** quizá la creó otra persona escribiendo este email. `issueProviderProof` le pone los nombres del proveedor, en la misma sentencia que escribe la prueba, porque el proveedor acaba de probar el buzón.
- **Fila ya verificada:** conserva los suyos (`CASE WHEN email_verified = 1 THEN first_name ELSE ? END`).

### D7. De la cuenta solo se guardan nombre y email

No se guarda:
- `sub` ni ningún identificador del proveedor;
- foto (`picture` llega con `profile` y se descarta);
- tokens;
- el proveedor usado.

El texto informativo lo promete y la política de privacidad lo detalla.

Consecuencias aceptadas:

- **No hay métricas por método en la base de datos.** Los logs registran `{ eventId, attendeeId, provider, outcome }`, nunca el email ni los claims.
- **La identidad es el email**, como en el código. Por eso dos métodos con emails distintos son dos asistentes (ver «Risks»).
- **Lo que la API guarda por la conexión, no por la cuenta**, sigue como hoy: la IP, para las expulsiones, solo en una fila nueva y al verificar. El texto lo respeta diciendo «*de ella* guardamos».

### D8. Pantalla de métodos siempre visible, y con la casilla

`PHASE.METHOD` aparece tras «Registrarme en el evento», **siempre**, aunque no haya ningún proveedor activo (solo la tarjeta de email). Así la casilla vive en un único sitio: dos ubicaciones condicionales serían dos textos legales que mantener.

- Los proveedores activos vienen de `GET /api/events/identity/providers`, que el modal pide al abrirse (como `prefetchStripe`) y guarda en memoria durante la vida de la página. Con un fallo de la petición, solo aparece el email.
- **Orden: Google, Microsoft, email.** Las tres tarjetas tienen el mismo ancho, alto, tipografía y peso. Google exige que su botón sea «al menos igual de visible» que los demás, y lo es.
- **Marca:**
  - **Google**, tema claro: fondo `#FFFFFF`, borde 1 px `#747775`, texto `#1F1F1F` y la «G» oficial de 2025 sin alterar;
  - **Microsoft**, tema claro: fondo `#FFFFFF`, borde 1 px `#8C8C8C`, texto `#5E5E5E` y el logotipo oficial de cuatro cuadrados;
  - **email**: el estilo de botón secundario del modal (`ring-gray-300`, `text-gray-900`) con el `EnvelopeIcon` de Heroicons.

  Las tres: 44 px de alto, 12 px de margen interior, 12 px entre logotipo y texto, logotipo de 20 px e Inter `text-sm font-semibold`.
- **Textos:** «Continuar con Google», «Continuar con Microsoft» y «Recibir un código por email».
- **Logotipos** en `client/public/brand/proveedores/` con versión en el nombre (`google-g-v1.png`, `microsoft-v1.svg`), por el invariante de caché inmutable. Se pintan con `<img>`, `alt=""` y `aria-hidden`, porque el texto ya nombra al proveedor. Los originales oficiales y su procedencia están en `docs/verificacion-proveedores/recursos/`.
  - **La «G» es un PNG:** el recorte central de 80×80 px del icono oficial a 4x, nítido hasta en pantallas 4x. El SVG oficial se vio bien en Safari para iOS (tarea 0.5), pero dibuja el degradado con un `foreignObject` y 49 filtros de desenfoque. El PNG no depende de cómo pinte eso cada vista web de las apps.
  - Son la excepción consciente a «solo las obras son imágenes»: las guías de marca exigen el logotipo.

### D9. La vuelta: `#acceso`, `#acceso-error` y `#acceder`

`client/lib/eventAccessFragment.js` es el único lector. Interpreta el fragmento y lo quita con `history.replaceState` antes de nada más.

| Fragmento | Qué hace `EventDetail` |
|---|---|
| `#acceso` | Abre el modal en `COMPLETING` («Confirmando tu acceso…») y llama a `identity/complete` |
| `#acceso-error=<CÓDIGO>` | Abre el modal en `METHOD` con el mensaje. Con `IDENTITY_EMAIL_UNTRUSTED`, en `REGISTER` con el aviso. Un código desconocido se trata como `IDENTITY_FAILED` |
| `#acceder` | Abre el modal en `METHOD`, salvo que la sesión ya esté concedida. Es el enlace de «Copiar enlace» (D10) |

- **`COMPLETING`:**
  - en un evento gratuito, termina en `SUCCESS`, con «Te has registrado como <email>» y la contraseña;
  - en uno de pago, en `PAYMENT`, con «Pagarás como <email>».

  La respuesta de la API trae `firstName`, `lastName` y `email`, porque el modal no los conoce en este camino. La rama de éxito compartida los devuelve también a `verify-email` (campos nuevos que nadie rompe).
- **Volver atrás desde el proveedor:** si el navegador restaura la página desde la caché (`pageshow` con `persisted`), la tarjeta pulsada deja de mostrar «Redirigiendo…».

### D10. Navegadores internos: la tarjeta de Google sale al navegador real

Google responde `403 disallowed_useragent` dentro de las vistas web de las apps. La tarjeta no se oculta. Dentro de una app detectada, su enlace de salida apunta a **nuestra URL de inicio** (`/identity/google/start`), y el flujo entero (cookie, Google y vuelta) ocurre en el navegador real:

```
toque en «Continuar con Google» (casilla ✓) dentro de una app
  ├─ Android (cualquier app detectada o «; wv)»):
  │    intent://<host><ruta>#Intent;scheme=https;end   (sin browser_fallback_url: lo
  │    cargaría la propia vista web, que es la pantalla de bloqueo de Google)
  ├─ iOS Instagram:           instagram://extbrowser/?url=<url codificada>
  ├─ iOS Facebook, Messenger, Threads, LinkedIn:  window.open('x-safari-https://<host><ruta>')
  └─ iOS TikTok u otra app sin salida conocida:  instrucciones directamente
tras el toque:
  ├─ la página pasa a oculta (visibilitychange/pagehide/blur) → «Continúa en tu navegador»
  └─ a los 2 s sigue visible → instrucciones de la app («⋯ → Abrir en el navegador externo»),
     «Copiar enlace» (https://140d.art/live/<slug>#acceder) y «También puedes continuar
     aquí con Microsoft o con un código por email»
```

- **Un solo módulo, `client/lib/inAppBrowser.js`**, con dos funciones: `detectInAppBrowser(userAgent)` → `{ app, platform } | null` y `externalBrowserUrl(url, detected)` → `string | null`.
  - Detecta por tokens del user agent: `Instagram`; `FBAN`, `FBAV`, `FB_IAB` y `FBIOS` (Facebook); `MessengerForiOS` y `Orca-Android`; `Barcelona` (Threads); `musical_ly`, `BytedanceWebview` y `TikTok`; `LinkedInApp`; y `; wv)` como vista web genérica de Android.
  - Microsoft y el código por email no lo usan.
- **«Copiar enlace» copia la ficha con `#acceder`, no la URL de la API.** Quien la pega en el navegador ve el paso de métodos y vuelve a aceptar la casilla.
  - Usa `navigator.clipboard.writeText`.
  - Si falla (algunas vistas web), muestra el enlace en un campo de solo lectura seleccionado.
- **La sesión queda en el navegador real**, que es también donde se abren los enlaces del email de confirmación. Quien vuelve a la app ve «Acceder» y puede entrar con la contraseña del email.
- Los enlaces de salida no están documentados y Meta los cambia: la matriz manual (guía 04) se repite tras cada actualización importante de Instagram o Facebook. Las instrucciones son la red de seguridad.

*Alternativa descartada:* salir al navegador al pulsar «Acceder», para todo el mundo. Obligaría a salir también a quien elige Microsoft o el código, que funcionan dentro de la app. Además, en Instagram para iOS, la salida menos fiable, muchos verían las instrucciones antes que los métodos.

### D11. Configuración: un identificador público por proveedor

- **`config.eventIdentity`:**
  - `google.clientId` (`GOOGLE_OIDC_CLIENT_ID`);
  - `microsoft.clientId` (`MICROSOFT_OIDC_CLIENT_ID`);
  - `callbackBaseUrl` (`IDENTITY_CALLBACK_BASE_URL`, por defecto `SITE_API_BASE_URL`).
- **Un proveedor está activo si y solo si su identificador está definido.** No hay estados a medias.
- **Un formato inválido impide arrancar:** Google exige el sufijo `.apps.googleusercontent.com`, y Microsoft, un GUID.
- **Por qué hace falta `IDENTITY_CALLBACK_BASE_URL`:** `SITE_API_BASE_URL` vale `https://api.pre.140d.art` por defecto, también en local, porque alimenta los enlaces de los emails. Con él, la vuelta de una prueba local iría a preproducción. En local, la variable vale `http://localhost:3001`.
- **URIs de vuelta**, fijas por proveedor y registradas tal cual en cada consola (no admiten comodines): `<base>/api/events/identity/google/callback` y `<base>/api/events/identity/microsoft/callback`.
- **La vuelta al cliente** usa `CLIENT_URL` y el `slug` leído de la base de datos, nunca un parámetro de la petición. No hay redirección abierta.
- **Ninguna `NEXT_PUBLIC_*`:** el cliente conoce los proveedores por la API y construye la URL de inicio con su `NEXT_PUBLIC_API_URL`. **Ningún cambio de CSP:** todo es navegación de primer nivel.

### D12. Verificar el `id_token` sin dependencias nuevas

- `jwt.decode(token, { complete: true })` para leer el `kid`. Después, la clave con ese `kid` del JWKS, convertida con `crypto.createPublicKey({ key: jwk, format: 'jwk' })`.
- `jwt.verify` con:
  - `algorithms: ['RS256']` (nunca `none` ni HS);
  - `audience` = el identificador del cliente;
  - `issuer` = `https://accounts.google.com` o `accounts.google.com` en Google, y el `iss` fijo de `consumers` en Microsoft;
  - `clockTolerance: 60`.

  Después se compara el `nonce` con el de la cookie mediante `safeEqual`.
- **El JWKS se guarda en memoria por proveedor**, con la duración de su `Cache-Control: max-age`, entre 5 minutos y 24 horas.
  - Un `kid` desconocido fuerza una recarga, como mucho una vez por minuto: así se tolera la rotación de claves.
  - La petición usa `fetch` de Node con un tiempo máximo de 5 s.
  - Si falla, la vuelta responde `IDENTITY_FAILED`, y el código por email sigue disponible.
- **Bajo test, la red lanza por defecto.** El transporte se inyecta con `__setFetchForTests` (el patrón de `videoDurationService`). Los tests firman sus propios tokens con un par RSA generado al vuelo.

### D13. Rutas, límites, validación y registros

| Ruta | Limitador | Validación (Zod) | Respuesta |
|---|---|---|---|
| `GET /api/events/identity/providers` | general | — | `{ providers: ['google','microsoft'] }`, con `cacheControl` de 5 min |
| `GET /api/events/:id/identity/:provider/start` | general | `params`: `provider` ∈ activos | 302 al proveedor, o 303 a `#acceso-error` |
| `POST /api/events/identity/:provider/callback` | general | `body`: `state`, `id_token?`, `error?` (`.strip()`) | **siempre** 303 al cliente, nunca JSON |
| `POST /api/events/:id/identity/complete` | `sensitiveLimiter` | `params` | JSON como `verify-email`, o 4xx con código en `title` |

- **Sin secretos en el path:** `redactUrl.js` no cambia.
- **La vuelta captura toda excepción** y la convierte en una redirección. Un error nunca llega al manejador global, que respondería JSON en una página en blanco.
- **Sentry de la API envía cookies y cuerpo** (`sendDefaultPii: true` en `api/instrument.js`). `beforeSend` y `beforeSendTransaction` borran `request.cookies`, `request.data` y la cabecera `cookie` de los eventos cuya URL contiene `/identity/`. Si no, un fallo, o una traza muestreada, enviaría el `id_token`, con nombre y email, y la prueba. La limpieza es una función pura en `api/utils/sentryIdentityScrub.js`, porque bajo test Sentry no se inicializa y solo así tiene test.
- **Un fallo en la vuelta no deja una fila a medias:** la búsqueda o creación y la prueba se hacen después de todas las comprobaciones.
- **Decisión sobre `is_staff`** (`.claude/rules/events/admin-access.md`):
  - la búsqueda o creación usa `getAttendeeByEmail`, igual que `/register`, sin filtrar `is_staff`;
  - la sentencia de la prueba tampoco filtra, igual que `verifyEmailCode`.

  Un admin que se verifique con Google en un evento donde ya tiene fila del staff se comporta exactamente como si usara el código.

## Risks / Trade-offs

- **[Emails distintos según el método → dos filas, dos plazas y, en pago, dos cobros]** → `SUCCESS` y `PAYMENT` muestran el email verificado («Te has registrado como…», «Pagarás como…»). El email de confirmación llega a ese buzón, y «Acceder con contraseña» pide ese email. Fusionar identidades queda fuera.
- **[Google: la pantalla de consentimiento en modo «Testing» solo admite 100 usuarios de prueba]** → la guía 01 la deja en Externo y «En producción». Con ámbitos no sensibles (`openid`, `email` y `profile`) no hace falta verificar los ámbitos.
- **[Google: sin verificación de marca no muestra el nombre «140d»]** → la guía 01 §3.1 la incluye: es automática y tarda minutos, y exige el dominio verificado en Search Console.
- **[La pantalla de consentimiento se comparte con el cliente de Plausible]** → al pasar de Interno a Externo, reconectar Plausible con Search Console mostrará «app no verificada» al admin. Nunca hay que dejarla en «Prueba», o el token de Plausible caducaría cada 7 días.
- **[Google borra los clientes OAuth sin uso durante meses]** → el de preproducción puede desaparecer si no se usa. La guía 01 lo avisa: la tarjeta deja de funcionar con `IDENTITY_FAILED` o con un error de Google, y basta crear otro cliente.
- **[Microsoft: el inquilino de Entra que aloja el registro, creado con una cuenta gratuita de Azure, se bloquea por inactividad si su suscripción caduca (`AADSTS5000225`)]** → la guía 02 §1 convierte la suscripción a «Pago por uso», sin recursos y con presupuesto de 1 €. Si se bloqueara, la tarjeta de Microsoft fallaría con `IDENTITY_FAILED`, y el código por email seguiría disponible.
- **[Microsoft muestra «no verificada» en el consentimiento sin verificación de editor]** → no bloquea a las cuentas personales. La guía 02 deja la verificación del dominio y del editor como paso opcional.
- **[La salida del navegador interno se rompe con una actualización de la app]** → instrucciones y «Copiar enlace» siempre disponibles. Microsoft y el email funcionan dentro de la app. La guía 04 tiene la matriz para repetirla.
- **[Navegador sin cookies o con cookies de terceros bloqueadas de forma agresiva]** → la vuelta no encuentra `ev_idp_flow` y responde `IDENTITY_SESSION_LOST`, con un mensaje que propone el código por email. Las dos cookies son de primer nivel en el momento de fijarlas, así que ITP y la protección total de Firefox no las bloquean.
- **[Caída del JWKS o del proveedor]** → `IDENTITY_FAILED` y el código por email intacto.
- **[Robo de la prueba]** → `HttpOnly`, `Secure`, 10 minutos, un solo uso y atada a la fila y al evento. No aparece en ninguna URL, log ni evento de Sentry.
- **[Lista de dominios de Microsoft incompleta]** → la cuenta cae al código, que es seguro. Ampliarla es añadir una línea.
- **[Sin tests automáticos del cliente]** → la guía 04 tiene la matriz manual de escritorio, iOS, Android y vistas web de las apps.
- **[`jsonwebtoken` y las claves JWK]** → `jwt.verify` acepta `KeyObject` desde la v9. El test con claves RSA locales lo comprueba.

## Migration Plan

1. **Antes de escribir código**, el operador configura Google y Microsoft en preproducción (guías 01 y 02) y hace las pruebas previas de la tarea 0. Si Google rechaza `id_token` con `form_post`, se aplica el plan B de D2 antes de seguir.
2. Despliegue conjunto a preproducción con las variables definidas. Matriz de la guía 04.
3. Producción: cliente OAuth de producción, variables en el `.env` de la API y `./deploy/deploy.sh`.
4. **Vuelta atrás sin desplegar:** basta borrar una variable `*_OIDC_CLIENT_ID` y reiniciar la API para que su tarjeta desaparezca. El código por email no se toca en ningún momento.

## Open Questions

Ninguna bloquea la implementación.

**Resultados de la tarea 0 (29/10/2026):**

| Pregunta | Resultado | Efecto |
|---|---|---|
| ¿Acepta Google `response_type=id_token` + `response_mode=form_post` en un cliente Web? | **Sí** (resultado A, en oidcdebugger.com) | D2 tal cual. El plan B queda descartado |
| ¿Trae Google `given_name` y `family_name` con un Gmail? | **Sí** | `namesFromClaims` tomará esos dos; la regla de reserva sigue para cuentas sin apellido |
| ¿Trae una cuenta personal de Microsoft (Outlook) `email`, `given_name` y `family_name` con los claims opcionales? | **Sí** | D5 y D6 tal cual |
| ¿Rechaza la autoridad `consumers` una cuenta profesional? | **Sin probar** (no hay cuenta a mano). Se probará en otro change | La API comprueba `tid` igualmente (D5), con test automático de un `tid` ajeno |
| ¿Se ve bien la «G» en SVG en Safari para iOS? | **Sí** | Aun así se usa el PNG (D8) |
| ¿Qué enlaces de salida funcionan en Instagram y Facebook, y deja Microsoft iniciar sesión dentro de ellas? | **Aplazado** a preproducción, con la funcionalidad completa (tarea 12.3, bloque C de la guía 04) | D10 se implementa con lo investigado. Si un enlace no funciona, las instrucciones y «Copiar enlace» cubren el caso. Se ajusta la tabla de `externalBrowserUrl` con los resultados |

El foco de las pruebas son las cuentas personales. Las profesionales de Microsoft y los casos de Workspace o de una cuenta de Google con email ajeno no son críticos: los cubren los tests automáticos de `isAuthoritativeEmail` y se probarán a mano más adelante.
