## 0. Configuración externa y pruebas previas (operador, antes de escribir código)

- [x] 0.1 Configurar Google en preproducción con `guias/01-google-cloud.md`:
  - pantalla de consentimiento publicada («In production»);
  - ámbitos `openid`, `email` y `profile`;
  - cliente Web «140d — preproducción y local» con las URIs de vuelta de preproducción y local, y además `https://oidcdebugger.com/debug` de forma temporal.

  Anotar el identificador de cliente.
- [x] 0.2 Registrar la app de Microsoft con `guias/02-microsoft-entra.md`:
  - «Personal Microsoft accounts only»;
  - «ID tokens» activado;
  - claims opcionales `email`, `given_name` y `family_name`;
  - sin `User.Read`;
  - las mismas URIs, también con `oidcdebugger.com` temporal.

  Anotar el identificador de la aplicación.
- [x] 0.3 Prueba previa con `oidcdebugger.com` (guía 01 §6 y guía 02 §7), y apuntar el resultado en `design.md` («Open Questions»):
  - que Google acepta `response_type=id_token` con `response_mode=form_post`, y qué claims trae con una cuenta Gmail, una de Workspace y una creada con un email ajeno;
  - que una cuenta Outlook personal trae `email`, `given_name` y `family_name`, y que una cuenta profesional es rechazada por la autoridad `consumers`.

  **Si Google no acepta `id_token` con `form_post`, aplicar el plan B de D2 (flujo de código con secreto, solo en Google) y actualizar design, specs y tareas antes de seguir.**
- [x] 0.4 ~~Probar los enlaces de salida de Instagram y Facebook con `inappdebugger.com`, y Microsoft dentro de las apps.~~ **Aplazada por decisión del usuario (29/10/2026):** se prueba en preproducción con la funcionalidad completa, en la tarea 12.3 (bloque C de la guía 04). Se implementa con lo investigado (design D10).
- [x] 0.5 Descargar los recursos oficiales y abrir la «G» SVG en Safari para iOS (`signin-assets.zip` de Google y la descarga de la guía de marca de Microsoft, guía 01 §7 y guía 02 §8). Decidir entre el SVG y el PNG a 2x.
- [x] 0.6 Quitar `https://oidcdebugger.com/debug` de las URIs de vuelta de los dos proveedores.

## 1. Configuración de la API

- [x] 1.1 `api/config/env.js`: crear `config.eventIdentity`, con:
  - `google.clientId` (`GOOGLE_OIDC_CLIENT_ID`, opcional, con el sufijo `.apps.googleusercontent.com` obligatorio si está definido);
  - `microsoft.clientId` (`MICROSOFT_OIDC_CLIENT_ID`, opcional, GUID obligatorio si está definido);
  - `callbackBaseUrl` (`IDENTITY_CALLBACK_BASE_URL`, opcional, `SITE_API_BASE_URL` por defecto, sin barra final).

  Un formato inválido lanza al arrancar y nombra la variable.
- [x] 1.2 `api/.env.example`: documentar las tres variables (qué son, que no son secretas, dónde se obtienen y su valor en local: `IDENTITY_CALLBACK_BASE_URL=http://localhost:3001`). En `api/.env.test`, identificadores ficticios con formato válido (`test-client.apps.googleusercontent.com` y un GUID inventado).
- [x] 1.3 Comprobar que cada `docker-compose*.yml` entrega al servicio `api` las variables del `.env` (`env_file`) y que no hace falta tocar ningún Dockerfile: ninguna es `NEXT_PUBLIC_*`. **Resultado:** el fichero cambia por entorno (`api/.env` en producción, `api/.env.staging` en preproducción y `api/.env.local` en el Docker local), y está anotado en la guía 03.

## 2. Módulo de proveedores (API)

- [x] 2.1 Crear `api/services/identityProviders.js` con la tabla de los dos proveedores (URL de autorización, `iss` aceptados, URI del JWKS, parámetros) y `enabledProviders()` en orden fijo (`google`, `microsoft`).
- [x] 2.2 `buildAuthorizeUrl(provider, { state, nonce })`, con los parámetros de D2 y la `redirect_uri` de `config.eventIdentity.callbackBaseUrl`.
- [x] 2.3 `verifyIdToken(provider, idToken, expectedNonce)`, según D12:
  - `kid` del JWKS → `crypto.createPublicKey({ format: 'jwk' })` → `jwt.verify` con `RS256`, `aud`, `iss` y 60 s de tolerancia;
  - `nonce` comparado con `safeEqual`;
  - `tid` de cuentas personales en Microsoft.
- [x] 2.4 Caché del JWKS en memoria (según `max-age`, entre 5 min y 24 h; recarga por `kid` desconocido como mucho una vez por minuto), `fetch` con tiempo máximo de 5 s, y `__setFetchForTests` y `__resetForTests`. El transporte por defecto lanza bajo `NODE_ENV=test`.
- [x] 2.5 `isAuthoritativeEmail(provider, claims)` (D4) con la lista explícita de dominios de consumo de Microsoft, y `namesFromClaims(claims)` (D6), las dos exportadas para los tests.
- [x] 2.6 Lectura de cookies sin dependencias: `parseCookies(header)` en `api/utils/cookies.js`. La escritura usa `res.cookie` y `res.clearCookie` de Express.

## 3. Servicio de eventos (API)

- [x] 3.1 `eventService.issueProviderProof(eventId, attendeeId, { first_name, last_name })`, con un único `UPDATE`:
  - hash de la prueba en `verification_code_hash`;
  - caducidad de 10 min (`OTP_TTL_MS`) y `verification_attempts = 0`;
  - nombres solo con `CASE WHEN email_verified = 1`;
  - sin tocar `verification_sent_at` ni `access_token_hash`.

  Devuelve la prueba en claro. Sin filtro de `is_staff`, igual que `verifyEmailCode` (D13).
- [x] 3.2 Confirmar que `access_token_hash` sigue apareciendo solo en `eventService.js`: el test de `eventRegistrationVerification.test.js` debe seguir verde.

## 4. Validadores (API)

- [x] 4.1 `api/validators/eventSchemas.js`:
  - `identityStartSchema` (`params`: `id` y `provider` ∈ `google|microsoft`);
  - `identityCallbackSchema` (`params.provider`; `body`: `state`, `id_token` opcional, `error` y `error_description` opcionales, `.strip()`);
  - `identityCompleteSchema` (`params.id`).

  `verifyEmailSchema` no cambia: sigue exigiendo 6 caracteres.
- [x] 4.2 La validación de `start` y `callback` **no puede responder JSON**. Validar dentro del controlador, o con un `validate()` cuyo fallo redirija con `IDENTITY_FAILED`. Elegir una y documentarla en el controlador.

## 5. Controladores (API)

- [x] 5.1 **[Riesgo alto: toca `verify-email`, la vía de acceso actual]** `api/controllers/eventController.js`: extraer la rama de éxito de `verifyEmail` (IP, pago pendiente, contraseña reutilizada o nueva, email de confirmación y respuesta) a una función exportada y compartida. Añadir `firstName`, `lastName` y `email` a la respuesta. Los tests actuales de `verify-email` deben pasar sin cambios.
- [x] 5.2 Crear `api/controllers/eventIdentityController.js`:
  - `providers`: `sendSuccess` con `{ providers }`.
  - `start`: comprobaciones, `state`, `nonce` y cookie `ev_idp_flow` (D3), y 302.
  - `callback`: en el orden de la spec, captura de toda excepción y siempre un 303. Primero error del proveedor, cookie y `state`, token, regla de confianza, evento abierto y aviso de aforo; después `registerAttendee` (IP solo en una fila nueva), `issueProviderProof` y cookie `ev_idp_result`. Borra `ev_idp_flow` siempre.
  - `complete`: lee y borra `ev_idp_result`, llama a `verifyEmailCode`, traduce los motivos a `IDENTITY_PROOF_INVALID` o `EVENT_FULL` y llama a la rama compartida de 5.1.
- [x] 5.3 Logs `{ eventId, attendeeId, provider, outcome }` en cada salida de `callback` y `complete`, nunca el email ni los claims.

## 6. Rutas y Sentry (API)

- [x] 6.1 `api/routes/eventRoutes.js`, declaradas antes de `GET /:slug`:
  - `GET /identity/providers`, con `cacheControl` de 5 min;
  - `GET /:id/identity/:provider/start`;
  - `POST /identity/:provider/callback`;
  - `POST /:id/identity/complete`, con `sensitiveLimiter`.

  Comprobar que no chocan con `/:id/video/:filename` ni con `/:id/calendar.ics`.
- [x] 6.2 Crear `api/utils/sentryIdentityScrub.js` (función pura), y llamarla en `beforeSend` y `beforeSendTransaction` de `api/instrument.js`.
- [x] 6.3 Confirmar que `redactUrl.js` no necesita cambios (ningún secreto en el path ni en la consulta) y que `helmet` y `userAgentFilter` no interfieren con la redirección ni con el `form_post`.

## 7. Tests de la API (sin red)

- [x] 7.1 Crear `api/tests/eventIdentityVerification.test.js`, con `tests/helpers/app.js` y `tests/helpers/eventAttendees.js`, un par RSA generado en el test y el JWKS inyectado con `__setFetchForTests`. Inicio:
  - `providers` según la configuración;
  - `start` con el 302, los parámetros, la autoridad `consumers`, la cookie y `EVENT_CLOSED`.
- [x] 7.2 Vuelta, rechazos:
  - sin cookie o con `state` distinto → `IDENTITY_SESSION_LOST`;
  - firma, `aud`, `iss`, `exp`, `nonce` o `tid` incorrectos → `IDENTITY_FAILED`;
  - `access_denied` → `IDENTITY_CANCELLED`;
  - cada caso de `isAuthoritativeEmail` de la spec → aceptado o `IDENTITY_EMAIL_UNTRUSTED`;
  - aforo lleno → `EVENT_FULL`, sin fila;
  - en todos los rechazos, ni filas nuevas ni cambios.
- [x] 7.3 Vuelta, éxito:
  - fila nueva sin credencial con la prueba en hash, la IP y la cookie `ev_idp_result`;
  - fila sin verificar → nombres sustituidos;
  - fila verificada → nombres intactos;
  - apellido vacío.
- [x] 7.4 Canje:
  - gratuito → token, contraseña y un email en `__getOutbox()`;
  - de pago → `paymentRequired: true` sin contraseña;
  - segundo canje → `IDENTITY_PROOF_INVALID`;
  - lleno entre la vuelta y el canje → `EVENT_FULL`;
  - asistente verificado → token nuevo y misma contraseña;
  - la prueba como `code` de `verify-email` → 400.
- [x] 7.5 Que la respuesta de `verify-email` trae `firstName`, `lastName` y `email`, y que `sentryIdentityScrub` borra cookies, cuerpo y cabecera `cookie` solo en URLs con `/identity/`.
- [x] 7.6 `npm test` completo en `api/`, con `testEnvironmentIsolation.test.js` y `dbDump.test.js` en verde.

## 8. Cliente: recursos, textos y API

- [x] 8.1 Crear en `client/public/brand/proveedores/`, a partir de `docs/verificacion-proveedores/recursos/` (ver su `README.md`):
  - `google-g-v1.png`: el recorte central de 80×80 px de `google-light-square-icon@4x.png`, solo la «G», sin el marco y sin alterar sus píxeles;
  - `microsoft-v1.svg`: copia exacta de `ms-symbollockup_mssymbol_19.svg`.

  Comprobar el recorte abriéndolo: la «G» completa, centrada y sin restos del borde gris.
- [x] 8.2 `client/lib/constants.js`:
  - textos del paso de métodos: intro, tarjetas, «Redirigiendo…», texto informativo por proveedores activos y línea de Microsoft;
  - «Confirmando tu acceso…», «Te has registrado como…» y «Pagarás como…»;
  - instrucciones por app, «Copiar enlace», «Continúa en tu navegador…» y los códigos nuevos de `ACCESS_VERIFICATION_ERRORS`.
- [x] 8.3 `client/lib/api.js`:
  - `eventsAPI.identityProviders()`;
  - `eventsAPI.identityStartUrl(eventId, provider)`, que es pura y devuelve la URL absoluta con `API_URL`;
  - `eventsAPI.completeIdentity(eventId)`, con `credentials: 'include'` y `skipAuthHandling`.

## 9. Cliente: módulos y componentes

- [x] 9.1 Crear `client/lib/inAppBrowser.js` con `detectInAppBrowser(userAgent)` y `externalBrowserUrl(url, detected)`, según `event-in-app-browser-escape`. Es el único lugar con los tokens de las apps; `instrumentation-client.js` conserva su filtro de Sentry, que es otro asunto.
- [x] 9.2 Crear `client/lib/eventAccessFragment.js`: `readAccessFragment()` → `{ kind: 'complete' } | { kind: 'error', code } | { kind: 'open' } | null`, que quita el fragmento con `history.replaceState`.
- [x] 9.3 Crear `client/components/EventVerificationMethods.js` con:
  - las tarjetas, la marca de D8, el texto informativo y la casilla;
  - la validación de la casilla, el inicio y «Redirigiendo…», y el `pageshow` de la caché;
  - en un navegador interno, la tarjeta de Google con salida, la detección de visibilidad a 2 s, las instrucciones y «Copiar enlace» con su campo de respaldo.
- [x] 9.4 `client/components/EventAccessModal.js`:
  - fases `METHOD` y `COMPLETING`, y «Registrarme en el evento» → `METHOD`;
  - quitar la casilla de `REGISTER`, y su «Volver» → `METHOD`;
  - prop de reanudación (`resume`), que el efecto de apertura respeta en lugar de forzar `CHOOSE`;
  - casilla marcada tras `#acceso` y `#acceso-error`;
  - `COMPLETING` → `SUCCESS` o `PAYMENT` con el email;
  - «Te has registrado como…» en `SUCCESS` y «Pagarás como…» en `PAYMENT`.
- [x] 9.5 `client/app/live/[slug]/EventDetail.js`: al montarse, `readAccessFragment()` abre el modal con la reanudación correspondiente. `#acceder` se ignora si la sesión ya está concedida.
- [ ] 9.6 Comprobar que el píxel de Meta, Plausible y Sentry Replay solo ven `/live/<slug>#acceso`, sin secretos, en la pestaña Red de una vuelta real.

## 10. Textos legales

- [x] 10.1 `client/app/legal/politica-de-privacidad/page.js`: crear el apartado «Registro en eventos en directo» (`#registro-en-eventos`) antes del de grabación, con el contenido de la spec, y renumerar los apartados. Con `grep -rn "apartado [0-9]" client/app`, comprobar que ningún texto cita un número que haya cambiado. El ancla `#grabacion-de-eventos` no cambia.

## 11. Documentación

- [x] 11.1 Mover `guias/` a `docs/verificacion-proveedores/`, junto a la carpeta `recursos/` que ya existe, con su `README.md` índice. Ajustar en la guía 01 §7 la decisión del PNG, y apuntar en la guía 04 los resultados del bloque C cuando se prueben.
- [x] 11.2 `docs/acceso-eventos.md`, §1 «El flujo del asistente»: el paso de métodos, los tres caminos y la vuelta. Enlazar `docs/verificacion-proveedores/`.

## 12. Despliegue y verificación manual

- [ ] 12.1 Preproducción: definir `GOOGLE_OIDC_CLIENT_ID` y `MICROSOFT_OIDC_CLIENT_ID` en `api/.env.staging` y desplegar API y cliente juntos (`./deploy/deploy.sh`). Comprobar `GET https://api.pre.140d.art/api/events/identity/providers`.
- [ ] 12.2 Comprobar que el cliente y la API de preproducción comparten dominio registrable. Si no, el canje con `SameSite=Lax` falla: replantear D3 antes de seguir.
- [ ] 12.3 Recorrer la matriz de `docs/verificacion-proveedores/04-pruebas-manuales.md`:
  - escritorio (Chrome, Safari y Firefox);
  - iOS Safari y Android Chrome;
  - Instagram y Facebook en iOS y Android;
  - eventos gratuitos, de pago y llenos;
  - un asistente que vuelve;
  - cancelaciones;
  - un email que el proveedor no gestiona;
  - volver atrás desde el proveedor.
- [ ] 12.4 Producción:
  - cliente OAuth de Google «140d — producción» con la URI de producción;
  - URI de producción en la app de Microsoft;
  - variables en el `.env` de producción y despliegue;
  - repetir la fila «escritorio + Gmail» y la de «Instagram iOS» de la matriz.

## 13. Conocimiento del proyecto

- [x] 13.1 Crear `.claude/rules/events/identity-providers.md` con `paths:` a todos los ficheros nuevos (`api/services/identityProviders.js`, `api/controllers/eventIdentityController.js`, `api/utils/{cookies,sentryIdentityScrub}.js`, `api/tests/eventIdentityVerification.test.js`, `client/lib/{inAppBrowser,eventAccessFragment}.js`, `client/components/EventVerificationMethods.js` y `docs/verificacion-proveedores/**`). Debe recoger el porqué no obvio:
  - el proveedor solo sustituye al buzón cuando es su dueño, y por qué no basta `email_verified`;
  - la prueba en `verification_code_hash` y el canje por `verifyEmailCode`;
  - las dos cookies y por qué no un fragmento;
  - solo cuentas personales de Microsoft;
  - la salida de la tarjeta de Google en las apps;
  - Sentry;
  - nada se guarda del proveedor;
  - el plan B de Google.

  Añadir su línea al índice de `CLAUDE.md` («Eventos: acceso, vídeo y staff»).
- [x] 13.2 `.claude/rules/events/verification-gates.md`: añadir que la vuelta del proveedor tampoco emite credencial y que su prueba se canjea por el mismo `UPDATE`, y enlazar la regla nueva.
- [x] 13.3 `.claude/rules/infra/environment-variables.md`: añadir el grupo «Verificación con proveedor en eventos», con las tres variables opcionales y el formato que impide arrancar.
- [x] 13.4 Ejecutar `node scripts/check-claude-rules.mjs` y corregir lo que señale.
