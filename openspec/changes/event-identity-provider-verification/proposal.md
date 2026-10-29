## Why

Para registrarse en un evento de `/live`, el asistente escribe nombre, apellido y email, va a su buzón, copia un código de 6 dígitos y vuelve a escribirlo. Es el paso más pesado del acceso, y falla si el correo tarda, se filtra como spam o el asistente está en el navegador interno de Instagram y no sabe volver. Google y Microsoft ya han comprobado que esa persona es la dueña de su buzón de Gmail u Outlook: si son los dueños del buzón, su respuesta puede sustituir al código sin rebajar la seguridad de `enforce-verification-gates`.

## What Changes

- **Nuevo paso «Elige cómo confirmar tu email»** en `EventAccessModal`, entre «Registrarme en el evento» y el formulario actual. Muestra tres tarjetas del mismo tamaño: «Continuar con Google», «Continuar con Microsoft» y «Recibir un código por email». Las dos primeras siguen las guías de marca oficiales. Un texto informa de que la cuenta solo se usa para confirmar el email, de que de ella se guardan el nombre y el email y nada más, y de que no se crea ninguna cuenta.
- **La casilla de aceptación de normas y privacidad pasa a ese paso** y vale para los tres métodos. El formulario de email deja de tenerla.
- **Verificación con Google o Microsoft por redirección de página completa** (OpenID Connect, `id_token` con `form_post`). Sin SDK ni script de terceros, sin secretos de cliente, sin dependencias nuevas y sin cambios de CSP. El servidor comprueba la firma del token con las claves públicas del proveedor.
- **El proveedor solo sustituye al buzón cuando es su dueño.**
  - Google: `@gmail.com`, o una cuenta de Google Workspace (`hd`) con `email_verified`.
  - Microsoft: solo cuentas personales, y con un email de Outlook, Hotmail, Live o MSN.

  Cualquier otro email (una cuenta de Google creada con una dirección de Yahoo, por ejemplo) pasa al código por email, con un aviso.
- **La credencial sigue naciendo en un solo sitio.** Al volver del proveedor, el servidor deja una prueba de un solo uso en los campos del código actual. El cliente la canjea con el mismo `UPDATE` condicional de `verifyEmailCode`, que pone `email_verified = 1`, emite el token y aplica la guarda de aforo. Pago, contraseña, email de confirmación y sesión no cambian.
- **Ningún secreto viaja en una URL.** La prueba va en una cookie `HttpOnly` de 10 minutos en el dominio de la API. Así queda fuera del historial, de Sentry Replay, del píxel de Meta y del `Referer`.
- **Navegadores internos de las apps (Instagram, Facebook, Messenger, Threads, TikTok, LinkedIn).** Google bloquea el inicio de sesión dentro de ellos. La tarjeta de Google no se oculta: abre el navegador real con el enlace de salida de cada app y plataforma, y la verificación entera ocurre allí. Si la app no lo permite, la tarjeta explica cómo abrir el navegador y ofrece «Copiar enlace». Microsoft y el código por email siguen funcionando dentro de la app.
- **Nueva sección de la política de privacidad**, «Registro en eventos en directo», con qué se recibe de Google o Microsoft, qué se guarda y qué no.
- **Sentry de la API** deja de enviar cookies y cuerpo de las rutas nuevas (`sendDefaultPii: true` los enviaría).
- **Apple queda fuera** de esta versión (exige el Apple Developer Program de pago).

## Capabilities

### New Capabilities
- `event-identity-provider-verification`: verificación del email con Google o Microsoft en el servidor. Cubre la lista de proveedores activos, el inicio y la vuelta del flujo, la verificación del `id_token`, la regla de confianza del email, la prueba de un solo uso y su canje, los datos que se guardan y los que no, las cookies, los códigos de error, la configuración y Sentry.
- `event-verification-methods`: el paso de métodos del modal. Cubre las tarjetas y su marca, el texto informativo, la casilla de aceptación, la vuelta desde el proveedor (`#acceso`, `#acceso-error`, `#acceder`), los pasos nuevos del modal y los textos legales.
- `event-in-app-browser-escape`: detección del navegador interno de una app y salida al navegador real desde la tarjeta de Google, con las instrucciones de respaldo.

### Modified Capabilities
- `event-password-access`: «Registrarme en el evento» lleva al paso de métodos y no directamente al formulario.
- `event-email-verification`: el modal también guarda la sesión tras canjear la prueba del proveedor, y el formulario de email llega desde el paso de métodos.
- `event-recording-disclosure`: la casilla que acepta normas y privacidad se muestra en el paso de métodos, antes de elegir cualquiera de ellos.

## Impact

- **Capas:** backend y frontend. **API y cliente se despliegan juntos** (`./deploy/deploy.sh`): el cliente nuevo llama a rutas nuevas, y la respuesta de `verify-email` gana campos.
- **Esquema:** sin cambios. Se reutilizan `verification_code_hash`, `verification_code_expires_at` y `verification_attempts` de `event_attendees`. No se añade ninguna columna: guardar el proveedor o su identificador contradiría el texto informativo.
- **API:**
  - nuevos `api/services/identityProviders.js` y `api/controllers/eventIdentityController.js`;
  - cambios en `api/services/eventService.js` (`issueProviderProof`), `api/controllers/eventController.js` (rama de éxito de `verifyEmail` compartida), `api/routes/eventRoutes.js` (cuatro rutas), `api/validators/eventSchemas.js`, `api/config/env.js` e `api/instrument.js`.
- **Cliente:**
  - nuevos `client/components/EventVerificationMethods.js`, `client/lib/inAppBrowser.js`, `client/lib/eventAccessFragment.js` y los logotipos oficiales en `client/public/brand/proveedores/`;
  - cambios en `client/components/EventAccessModal.js`, `client/app/live/[slug]/EventDetail.js`, `client/lib/api.js`, `client/lib/constants.js` y `client/app/legal/politica-de-privacidad/page.js`.
- **Integraciones externas nuevas:** Google Identity (OpenID Connect) y la plataforma de identidad de Microsoft (cuentas personales). Ambas son gratuitas. Hay que configurar a mano Google Cloud y Microsoft Entra (guías en `docs/verificacion-proveedores/`).
- **Variables de entorno nuevas, todas opcionales:**
  - `GOOGLE_OIDC_CLIENT_ID` y `MICROSOFT_OIDC_CLIENT_ID`: identificadores públicos, no secretos. Sin ellos, su tarjeta no aparece;
  - `IDENTITY_CALLBACK_BASE_URL`: por defecto, `SITE_API_BASE_URL`.

  Ninguna es `NEXT_PUBLIC_*`.
- **Dependencias:** ninguna. La firma se comprueba con `jsonwebtoken` (ya instalada) y `crypto` de Node.

## Non-goals

- **Apple.** Se añadirá con el mismo módulo cuando haya cuenta de pago. El diseño ya prevé su particularidad: el nombre solo llega la primera vez.
- **Cuentas profesionales o educativas de Microsoft (Entra ID).** Su `email` lo escribe un administrador y no prueba la propiedad del buzón: es el fallo conocido como nOAuth.
- **Otros emails que Google o Microsoft no gestionan.** Pasan al código por email; no se aceptan por `email_verified` ni por `xms_edov`.
- **Sorteos y subastas** (`DrawParticipationModal`, `BidModal`): siguen solo con el código.
- **Cuentas de usuario de 140d** o un «inicio de sesión con Google» para comprar. Esto solo verifica el acceso a un evento.
- **Fusionar asistentes con emails distintos.** Quien entra con Gmail un día y con Outlook otro ocupa dos plazas. Se mitiga mostrando el email verificado (ver design).
- **Guardar el método de verificación** en la base de datos, ni mostrarlo en el panel de admin. Solo se registra en los logs, sin email.
- **Garantizar la salida del navegador interno en todas las apps.** No existe una vía oficial en iOS. Lo que no salga recibe instrucciones y «Copiar enlace».
