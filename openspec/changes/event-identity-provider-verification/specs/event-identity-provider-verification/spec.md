> Capas afectadas:
> - **API:** `api/services/identityProviders.js` (nuevo), `api/controllers/eventIdentityController.js` (nuevo), `api/services/eventService.js` (`issueProviderProof`), `api/controllers/eventController.js` (rama de éxito compartida de `verifyEmail`), `api/routes/eventRoutes.js`, `api/validators/eventSchemas.js`, `api/config/env.js` e `api/instrument.js`.
> - Usa `validate()`, `sensitiveLimiter`, `cacheControl()`, `ApiError` y `sendSuccess()`, salvo en las redirecciones.
> - **Sin cambios de esquema:** se reutilizan columnas existentes de `event_attendees`, y `api/config/database.js` no se toca.

## ADDED Requirements

### Requirement: Proveedores activos por configuración

Cada proveedor SHALL activarse solo con su identificador público de cliente: `GOOGLE_OIDC_CLIENT_ID` y `MICROSOFT_OIDC_CLIENT_ID`, leídos en `api/config/env.js` como `config.eventIdentity`. Un identificador con formato inválido SHALL impedir el arranque:

- Google exige el sufijo `.apps.googleusercontent.com`;
- Microsoft, un GUID.

`IDENTITY_CALLBACK_BASE_URL` SHALL ser opcional, con `SITE_API_BASE_URL` por defecto, y las URIs de vuelta SHALL ser `<base>/api/events/identity/<proveedor>/callback`.

`GET /api/events/identity/providers` SHALL responder `{ providers }`, con los proveedores activos en orden fijo (`google`, `microsoft`), y SHALL llevar `cacheControl` de 5 minutos.

#### Scenario: Solo Google configurado
- **WHEN** `GOOGLE_OIDC_CLIENT_ID` está definido y `MICROSOFT_OIDC_CLIENT_ID` no
- **THEN** `GET /api/events/identity/providers` responde `{ providers: ['google'] }`

#### Scenario: Identificador mal escrito
- **WHEN** `MICROSOFT_OIDC_CLIENT_ID` no es un GUID
- **THEN** la API no arranca y el error nombra la variable

#### Scenario: Proveedor desactivado
- **WHEN** se llama a `GET /api/events/:id/identity/microsoft/start` sin `MICROSOFT_OIDC_CLIENT_ID`
- **THEN** la API redirige a la ficha del evento con `#acceso-error=IDENTITY_FAILED` y no fija ninguna cookie

### Requirement: Inicio del flujo

`GET /api/events/:id/identity/:provider/start` SHALL comprobar que el evento existe y que su `status` no es `finished` ni `cancelled`. Después SHALL generar con `crypto` un `state` (`<eventId>.<32 bytes aleatorios>`) y un `nonce` (32 bytes aleatorios), y fijar la cookie `ev_idp_flow`:

- un JWT HS256 firmado con `JWT_SECRET`, con audiencia `event-identity-flow`, `state`, `nonce`, `eventId` y `provider`;
- `HttpOnly; Secure; SameSite=None; Path=/api/events/identity; Max-Age=600`.

Por último SHALL redirigir con 302 a la URL de autorización del proveedor con `client_id`, `redirect_uri`, `response_type=id_token`, `response_mode=form_post`, `scope=openid email profile`, `nonce`, `state` y `prompt=select_account`.

- **Google** SHALL usar `https://accounts.google.com/o/oauth2/v2/auth`.
- **Microsoft** SHALL usar `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize`: solo cuentas personales.

#### Scenario: Inicio con Google
- **WHEN** se llama a `GET /api/events/<id>/identity/google/start` para un evento programado
- **THEN** la respuesta es 302 a `accounts.google.com` con `response_mode=form_post` y la `redirect_uri` de Google
- **AND** fija `ev_idp_flow` con `SameSite=None` y `HttpOnly`
- **AND** el `nonce` de la URL coincide con el del JWT de la cookie

#### Scenario: Inicio con Microsoft
- **WHEN** se inicia el flujo de Microsoft
- **THEN** la URL de autorización usa la autoridad `consumers`

#### Scenario: Evento finalizado
- **WHEN** se inicia el flujo para un evento `finished`
- **THEN** la API redirige a la ficha con `#acceso-error=EVENT_CLOSED`

#### Scenario: Evento inexistente
- **WHEN** se inicia el flujo con un id que no existe
- **THEN** la API redirige a `<CLIENT_URL>/live`

### Requirement: Verificación del id_token en la vuelta

`POST /api/events/identity/:provider/callback` SHALL aceptar el `form_post` del proveedor. En este orden, SHALL:

1. Si el cuerpo trae `error`, redirigir con `IDENTITY_CANCELLED` cuando sea `access_denied`, y con `IDENTITY_FAILED` en cualquier otro caso.
2. Leer `ev_idp_flow`, comprobar su firma, su audiencia y su caducidad, que su proveedor coincide con el de la ruta y que su `state` es igual (con `safeEqual`) al del cuerpo. Si algo falla, redirigir con `IDENTITY_SESSION_LOST`.
3. Verificar el `id_token`:
   - la firma RS256 con la clave del JWKS del proveedor cuyo `kid` coincide;
   - `aud` = el identificador del cliente;
   - `iss`: `https://accounts.google.com` o `accounts.google.com` en Google, y `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0` en Microsoft;
   - `exp`, con 60 s de tolerancia;
   - `nonce` igual al de la cookie;
   - en Microsoft, `tid` = `9188040d-6c67-4c5b-b112-36a304b66dad`.

   Cualquier fallo, o un JWKS inalcanzable, SHALL redirigir con `IDENTITY_FAILED`.
4. Borrar `ev_idp_flow` en todos los casos.

El JWKS SHALL guardarse en memoria según su `Cache-Control: max-age`, entre 5 minutos y 24 horas. Un `kid` desconocido SHALL forzar una recarga, como mucho una por minuto y proveedor. La petición SHALL tener un tiempo máximo de 5 s. Solo se SHALL aceptar `RS256`.

#### Scenario: Token firmado con otra clave
- **WHEN** la vuelta recibe un `id_token` con un `kid` del JWKS pero firmado con otra clave
- **THEN** redirige con `IDENTITY_FAILED` y no crea ni modifica ninguna fila

#### Scenario: Token de otra aplicación
- **WHEN** el `aud` del `id_token` es otro identificador de cliente
- **THEN** redirige con `IDENTITY_FAILED`

#### Scenario: Vuelta sin la cookie del flujo
- **WHEN** llega una vuelta válida en un navegador que no tiene `ev_idp_flow` (la caducó o la bloqueó)
- **THEN** redirige a la ficha del evento indicado en `state` con `#acceso-error=IDENTITY_SESSION_LOST`

#### Scenario: Nonce reutilizado
- **WHEN** se presenta en la vuelta un `id_token` cuyo `nonce` no es el de la cookie actual
- **THEN** redirige con `IDENTITY_FAILED`

#### Scenario: El usuario cancela en Google
- **WHEN** el proveedor devuelve `error=access_denied`
- **THEN** la API redirige con `#acceso-error=IDENTITY_CANCELLED`

#### Scenario: Cuenta profesional en Microsoft
- **WHEN** llega un token de Microsoft con un `tid` distinto del de cuentas personales
- **THEN** redirige con `IDENTITY_FAILED`

### Requirement: El proveedor solo sustituye al buzón cuando es su dueño

Un único predicado, `isAuthoritativeEmail(provider, claims)` en `api/services/identityProviders.js`, SHALL decidir si el email del token se acepta como verificado:

- **Google:** `email_verified === true` y, además, el email termina en `@gmail.com` o el token trae el claim `hd`;
- **Microsoft:** cuenta personal (el `tid` de arriba), y el dominio del email está en la lista explícita de dominios de consumo de Microsoft del mismo módulo. La lista SHALL incluir al menos `outlook.com`, `outlook.es`, `hotmail.com`, `hotmail.es`, `live.com`, `live.es` y `msn.com`.

Sin claim `email`, o si el predicado es falso, la vuelta SHALL redirigir con `IDENTITY_EMAIL_UNTRUSTED` sin crear ni modificar ninguna fila. El email SHALL normalizarse con `normalizeEmail` antes de evaluarlo y de usarlo.

#### Scenario: Gmail verificado
- **WHEN** Google devuelve `email = ana@gmail.com` y `email_verified = true`
- **THEN** el email se acepta

#### Scenario: Cuenta de Google con email de otro proveedor
- **WHEN** Google devuelve `email = ana@yahoo.es`, `email_verified = true` y sin `hd`
- **THEN** la API redirige con `IDENTITY_EMAIL_UNTRUSTED`

#### Scenario: Google Workspace
- **WHEN** Google devuelve `email = ana@estudio.es`, `email_verified = true` y `hd = estudio.es`
- **THEN** el email se acepta

#### Scenario: Gmail sin verificar
- **WHEN** Google devuelve `email = ana@gmail.com` y `email_verified = false`
- **THEN** la API redirige con `IDENTITY_EMAIL_UNTRUSTED`

#### Scenario: Outlook personal
- **WHEN** Microsoft devuelve una cuenta personal con `email = ana@outlook.es`
- **THEN** el email se acepta

#### Scenario: Cuenta personal de Microsoft creada con un Gmail
- **WHEN** Microsoft devuelve una cuenta personal con `email = ana@gmail.com`
- **THEN** la API redirige con `IDENTITY_EMAIL_UNTRUSTED`

#### Scenario: Cuenta de Microsoft sin email
- **WHEN** el token de Microsoft no trae `email` (cuenta creada con un teléfono)
- **THEN** la API redirige con `IDENTITY_EMAIL_UNTRUSTED`

### Requirement: La vuelta no emite credencial

Con el email aceptado, la vuelta SHALL comprobar que el evento sigue sin estar `finished` ni `cancelled` (si no, `EVENT_CLOSED`). Después SHALL aplicar el mismo aviso temprano de aforo que `/register`:

- si el email no tiene ya una fila verificada y el recuento de `getAttendeeCount` alcanza `max_attendees`, `EVENT_FULL`.

Superadas esas comprobaciones, SHALL:

1. Buscar o crear la fila con `eventService.registerAttendee`, con los nombres de `namesFromClaims`. Una fila nueva SHALL nacer con `email_verified = 0` y `access_token_hash = NULL`, y SHALL guardar la IP de la petición (como `/register`, solo en una fila nueva).
2. Llamar a `eventService.issueProviderProof`, que en una sola sentencia `UPDATE` SHALL:
   - guardar el SHA-256 de una prueba aleatoria de 32 bytes en `verification_code_hash`;
   - fijar `verification_code_expires_at` a ahora + 10 minutos y `verification_attempts = 0`;
   - sustituir `first_name` y `last_name` por los del proveedor **solo si** la fila tiene `email_verified = 0`.
3. Fijar la cookie `ev_idp_result` = `<attendeeId>.<prueba>`, con `HttpOnly; Secure; SameSite=Lax; Path=/api/events; Max-Age=600`.
4. Redirigir con 303 a `<CLIENT_URL>/live/<slug>#acceso`, con el `slug` leído de la base de datos.

La vuelta SHALL NOT escribir `email_verified`, `access_token_hash`, `access_password` ni `verification_sent_at`.

`namesFromClaims(claims)` SHALL tomar:
- el nombre de `given_name`; si falta, la primera palabra de `name`; si tampoco, la parte local del email;
- el apellido de `family_name`; si falta, el resto de `name`; si tampoco, una cadena vacía.

Ambos se SHALL recortar a 120 caracteres.

#### Scenario: Primera verificación con Google
- **WHEN** una vuelta válida llega para un email sin fila en el evento
- **THEN** se crea una fila con los nombres de Google, `email_verified = 0` y `access_token_hash = NULL`
- **AND** `verification_code_hash` contiene el hash de la prueba
- **AND** la respuesta es 303 a `/live/<slug>#acceso`, con la cookie `ev_idp_result` y sin ningún secreto en la URL

#### Scenario: Fila sin verificar creada por otra persona
- **WHEN** existe una fila sin verificar con ese email y los nombres «Pepe Falso», y la vuelta trae «Ana García»
- **THEN** la fila pasa a llamarse «Ana García» y conserva su `id`

#### Scenario: Asistente ya verificado
- **WHEN** la vuelta llega para un email con fila verificada
- **THEN** la fila conserva sus nombres y su plaza, y recibe una prueba nueva

#### Scenario: Evento lleno
- **WHEN** el evento ha alcanzado `max_attendees` verificados y el email no tiene fila verificada
- **THEN** la API redirige con `#acceso-error=EVENT_FULL` y no crea ninguna fila

#### Scenario: Google sin apellido
- **WHEN** el token trae `given_name = "Ana"` y ni `family_name` ni más palabras en `name`
- **THEN** la fila se crea con `first_name = "Ana"` y `last_name = ""`

### Requirement: Canje de la prueba con la misma verificación que el código

`POST /api/events/:id/identity/complete` SHALL leer y borrar `ev_idp_result`, y canjear la prueba con `eventService.verifyEmailCode(eventId, attendeeId, prueba)`, sin una ruta paralela. Así, la credencial SHALL nacer en el mismo `UPDATE` condicional que con el código: `email_verified = 1`, token nuevo, prueba borrada y guarda de aforo.

Si tiene éxito, SHALL ejecutar la misma rama que `verify-email`, extraída a una función compartida en `api/controllers/eventController.js`:

- actualizar la IP;
- con pago pendiente, `paymentRequired: true` sin contraseña;
- si no, reutilizar `access_password` o generarla, enviar el email de confirmación y devolver `accessPassword`.

La respuesta de los dos endpoints SHALL incluir `firstName`, `lastName` y `email` de la fila.

Los fallos SHALL responder:
- sin cookie, o con los motivos `ATTENDEE_NOT_FOUND`, `OTP_NOT_PENDING`, `OTP_EXPIRED`, `OTP_TOO_MANY_ATTEMPTS` u `OTP_INVALID`: 400 con `title` `IDENTITY_PROOF_INVALID`;
- con el aforo lleno: 409 `EVENT_FULL`.

La ruta SHALL usar `sensitiveLimiter`. `verify-email` SHALL seguir aceptando solo códigos de 6 caracteres: la prueba no se puede canjear por ese endpoint.

#### Scenario: Canje en un evento gratuito
- **WHEN** el navegador que volvió de Google llama a `identity/complete` con `credentials: 'include'`
- **THEN** la fila queda con `email_verified = 1` y un `access_token_hash` nuevo
- **AND** la respuesta trae `accessToken`, `paymentRequired: false`, `accessPassword`, `firstName`, `lastName` y `email`
- **AND** el email de confirmación sale una vez

#### Scenario: Canje en un evento de pago
- **WHEN** se canjea la prueba en un evento de pago no pagado
- **THEN** la respuesta trae `accessToken`, `paymentRequired: true` y ninguna contraseña

#### Scenario: Prueba usada dos veces
- **WHEN** se repite la llamada con la misma prueba, reenviando la cookie a mano
- **THEN** la segunda responde 400 `IDENTITY_PROOF_INVALID`

#### Scenario: El evento se llenó entre la vuelta y el canje
- **WHEN** la última plaza la ocupa otra persona entre la vuelta y el canje
- **THEN** el canje responde 409 `EVENT_FULL` y la fila sigue sin verificar

#### Scenario: La prueba por la ruta del código
- **WHEN** se envía la prueba como `code` a `POST /verify-email`
- **THEN** la validación responde 400 y no se verifica nada

#### Scenario: Asistente que vuelve desde otro dispositivo
- **WHEN** un asistente verificado se verifica con Google en otro navegador
- **THEN** recibe un token nuevo, que sustituye al anterior, y su misma contraseña

### Requirement: De la cuenta del proveedor solo se guardan nombre y email

El sistema SHALL NOT guardar en la base de datos:
- el `sub` ni ningún identificador del proveedor;
- la foto (`picture`);
- el `id_token` ni ningún otro token del proveedor;
- el proveedor usado.

No SHALL añadirse ninguna columna a `event_attendees`. Los logs SHALL registrar `{ eventId, attendeeId, provider, outcome }` y SHALL NOT registrar el email, los nombres ni los claims.

#### Scenario: Fila tras verificar con Microsoft
- **WHEN** un asistente completa la verificación con Microsoft
- **THEN** su fila solo difiere de una verificada con el código en los valores de `first_name`, `last_name` y `email`

#### Scenario: Log de la vuelta
- **WHEN** se completa una vuelta
- **THEN** la línea de log contiene el proveedor y el resultado, y no contiene el email

### Requirement: Los errores de la vuelta son siempre una redirección

`start` y `callback` SHALL responder siempre con una redirección (302 o 303) y nunca con JSON. Toda excepción SHALL capturarse en el controlador y convertirse en `IDENTITY_FAILED`, con el error en el log. El destino SHALL ser `<CLIENT_URL>/live/<slug>#acceso-error=<CÓDIGO>`, con el `slug` leído de la base de datos a partir de la cookie o, sin ella, del `eventId` del `state`. Si no se puede determinar el evento, SHALL ser `<CLIENT_URL>/live`.

Los códigos SHALL ser `IDENTITY_CANCELLED`, `IDENTITY_SESSION_LOST`, `IDENTITY_FAILED`, `IDENTITY_EMAIL_UNTRUSTED`, `EVENT_FULL` y `EVENT_CLOSED`.

#### Scenario: Excepción inesperada
- **WHEN** la base de datos falla durante la vuelta
- **THEN** el navegador recibe una redirección con `#acceso-error=IDENTITY_FAILED` y no una página con JSON

#### Scenario: state manipulado
- **WHEN** el `state` de la vuelta lleva el id de otro evento y no coincide con la cookie
- **THEN** la respuesta es `IDENTITY_SESSION_LOST` y no se crea ninguna fila en ningún evento

### Requirement: Sentry no recibe secretos ni datos de la cuenta

`api/instrument.js` SHALL, en `beforeSend` y en `beforeSendTransaction`, borrar `request.cookies`, `request.data` y la cabecera `cookie` de todo evento cuya URL contenga `/identity/`, porque `sendDefaultPii: true` los enviaría: el `id_token` con nombre y email, y la prueba en `ev_idp_result`. La limpieza SHALL ser una función pura en su propio módulo (`api/utils/sentryIdentityScrub.js`), para poder probarla aunque Sentry no se inicialice bajo test.

#### Scenario: Error durante la vuelta
- **WHEN** se captura una excepción en `POST /api/events/identity/google/callback`
- **THEN** el evento que se envía a Sentry no contiene el cuerpo del `form_post` ni las cookies

### Requirement: Los tests de la verificación no usan la red

La verificación del `id_token` SHALL obtener el JWKS mediante un transporte inyectable (`__setFetchForTests`), que bajo `NODE_ENV=test` SHALL lanzar si no se ha inyectado. `api/.env.test` SHALL definir identificadores de cliente ficticios. `api/tests/eventIdentityVerification.test.js` SHALL firmar sus tokens con un par RSA generado durante el test, sin contactar con Google ni con Microsoft.

#### Scenario: Batería de tests
- **WHEN** se ejecuta `npm test` en `api/` sin red
- **THEN** los tests de verificación con proveedor pasan sin ninguna petición a `accounts.google.com`, `www.googleapis.com` ni `login.microsoftonline.com`
