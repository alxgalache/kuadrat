---
paths:
  - "api/services/identityProviders.js"
  - "api/controllers/eventIdentityController.js"
  - "api/utils/{cookies,sentryIdentityScrub}.js"
  - "api/instrument.js"
  - "api/tests/eventIdentityVerification.test.js"
  - "client/lib/{inAppBrowser,eventAccessFragment}.js"
  - "client/components/{EventVerificationMethods,EventAccessModal}.js"
  - "client/public/brand/proveedores/**"
  - "docs/verificacion-proveedores/**"
---

## Acceso a eventos con Google o Microsoft (`event-identity-provider-verification`)

En el registro de un evento de `/live`, el paso «Elige cómo confirmar tu email» ofrece «Continuar con Google», «Continuar con Microsoft» y «Recibir un código por email». La casilla de normas y privacidad vive en ese paso y vale para los tres métodos. Guías del operador: `docs/verificacion-proveedores/`.

* **El proveedor sustituye al buzón, nunca al flujo.** La vuelta (`POST /api/events/identity/:provider/callback`) **no emite credencial**:
  * busca o crea la fila como `/register` (IP solo en una fila nueva) y escribe una prueba aleatoria de un solo uso en `verification_code_hash`, la columna del código, con 10 min (`issueProviderProof`);
  * `POST /:id/identity/complete` la canjea con `verifyEmailCode`, el mismo `UPDATE` condicional del código, con su guarda de aforo;
  * después, `respondEmailVerified`, la rama de éxito que comparte con `/verify-email`.

  Emitir el token en la vuelta crearía un segundo sitio donde nace la credencial, con su propia copia del aforo. Es lo que `enforce-verification-gates` eliminó (`.claude/rules/events/verification-gates.md`). `verify-email` sigue exigiendo 6 caracteres: la prueba solo se canjea desde su cookie.
* **El proveedor solo vale cuando es el dueño del buzón** (`isAuthoritativeEmail`, un solo predicado):
  * **Google:** `email_verified` y, además, `@gmail.com` o `hd` (Workspace). Es la regla literal de Google: para cualquier otro email «Google is not authoritative», y `email_verified` solo dice que se verificó una vez.
  * **Microsoft:** cuenta personal (`tid` del inquilino `consumers`) y un dominio de la lista `MICROSOFT_CONSUMER_DOMAINS` (Outlook, Hotmail, Live, MSN). Microsoft no emite `email_verified`.

  Lo demás devuelve `IDENTITY_EMAIL_UNTRUSTED` y cae al formulario del código. **No es prudencia de más:** verificar el email de un asistente que ya existe le emite un token nuevo (expulsa su sesión) y **devuelve su contraseña**; en uno de pago, da el acceso que pagó otro. Ampliar la lista de Microsoft es añadir una línea, y un dominio que falte solo cae al código.
* **Solo cuentas personales de Microsoft, por decisión.** La autoridad es `consumers`, el registro de la app es «Personal Microsoft accounts only» y la API comprueba `tid` igualmente. El `email` de una cuenta profesional lo escribe un administrador y no prueba nada: es el fallo conocido como nOAuth.
* **`id_token` + `form_post`, sin SDK ni secretos.** Redirección de página completa: los popups mueren en los navegadores de las apps, y el botón de Google Identity Services es un iframe cuyo clic no pasa por nuestro código. Cada proveedor se activa solo con su identificador **público** (`GOOGLE_OIDC_CLIENT_ID`, `MICROSOFT_OIDC_CLIENT_ID`). La firma se comprueba con `jsonwebtoken` y `crypto.createPublicKey({ format: 'jwk' })`, sin dependencias, con el JWKS en memoria. **Plan B, solo si Google dejara de aceptar `id_token` con `form_post`:** flujo de código con `GOOGLE_OIDC_CLIENT_SECRET` y canje en `oauth2.googleapis.com/token`. El resto no cambia.
* **Ningún secreto en una URL. Dos cookies `HttpOnly` de 10 min en el dominio de la API:**
  * `ev_idp_flow`: JWT firmado con `state` y `nonce`. `SameSite=None`, porque el `form_post` es un POST entre sitios.
  * `ev_idp_result`: `<attendeeId>.<prueba>`. `SameSite=Lax`, porque `140d.art` y `api.140d.art` son el mismo sitio, y el cliente la envía con `credentials: 'include'`.

  La primera idea, `#acceso=<prueba>` en la URL, habría llegado a Sentry Replay, al píxel de Meta y al historial. Los fragmentos que quedan (`#acceso`, `#acceso-error=<CÓDIGO>`, `#acceder`) no llevan nada secreto. Los lee **solo** `client/lib/eventAccessFragment.js`, que los quita con `replaceState`. Si un entorno sirviera cliente y API en dominios registrables distintos, el canje fallaría.
* **`start` y `callback` nunca responden JSON:** son navegaciones de primer nivel. Validan con `safeParse` dentro del controlador, capturan toda excepción y siempre redirigen a la ficha con el código.
* **Sentry de la API envía cookies y cuerpo** (`sendDefaultPii: true`). `scrubIdentityRequest` (`api/utils/sentryIdentityScrub.js`, función pura y probada) los borra en `beforeSend` y `beforeSendTransaction` para toda URL con `/identity/`. Si no, un fallo enviaría el `id_token`, con nombre y email, y la prueba.
* **Del proveedor solo se guardan nombre y email.** Ni `sub`, ni foto, ni tokens, ni qué proveedor se usó: el texto informativo del modal y la política de privacidad (`#registro-en-eventos`) lo prometen así. Por eso no hay métricas por método en la base de datos, solo en los logs, sin email.
  * Una fila **sin verificar** toma los nombres del proveedor (alguien pudo crearla escribiendo ese email); una verificada conserva los suyos.
  * Sin apellido, `last_name` queda `''`.
* **Navegadores de las apps** (`client/lib/inAppBrowser.js`, único lugar con los tokens de user agent):
  * **Google bloquea su inicio de sesión dentro de ellos** (`disallowed_useragent`). La tarjeta no se oculta: abre **nuestra URL de inicio** en el navegador real, y el flujo entero ocurre allí.
  * **Enlaces de salida:** Android, `intent://…#Intent;scheme=https;end`; iOS Instagram, `instagram://extbrowser/`; iOS Facebook, Messenger, Threads y LinkedIn, `x-safari-https://` con `window.open`.
  * **Sin `S.browser_fallback_url`:** cargaría la URL dentro de la vista web, que es la pantalla de bloqueo de Google.
  * **Si a los 2 s la página sigue visible**, aparecen las instrucciones y «Copiar enlace» (copia `/live/<slug>#acceder`).
  * Microsoft y el código funcionan dentro de la app. Los enlaces no son oficiales y Meta los cambia: el bloque C de la guía 04 se repite tras actualizaciones grandes.
* **Marca:** colores y logotipos oficiales del tema claro, tres tarjetas del mismo tamaño y peso. Google exige que la suya sea al menos igual de visible.
  * La «G» es un PNG recortado del icono oficial a 4x: el SVG usa `foreignObject` y filtros.
  * Los originales están en `docs/verificacion-proveedores/recursos/`.
  * Un logotipo nuevo se publica como `-v2`, nunca sobrescribiendo.
* **Mismo email = mismo asistente, como con el código.** Con Gmail un día y Outlook otro, son dos filas, dos plazas y, en pago, dos cobros. El pago muestra «Pagarás como <email>».
* **Punto ciego conocido:** `client/` no tiene runner de tests. El modal, la vuelta y la salida de las apps se verifican a mano con `docs/verificacion-proveedores/04-pruebas-manuales.md`. El servidor está cubierto por `eventIdentityVerification.test.js`, que firma sus tokens con una clave RSA local e inyecta el JWKS: sin red.
