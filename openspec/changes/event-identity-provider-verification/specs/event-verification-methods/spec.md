> Capas afectadas:
> - nuevos `client/components/EventVerificationMethods.js`, `client/lib/eventAccessFragment.js` y `client/public/brand/proveedores/`;
> - `client/components/EventAccessModal.js` (fases `METHOD` y `COMPLETING`), `client/app/live/[slug]/EventDetail.js` (fragmento de vuelta), `client/lib/api.js` (`eventsAPI.identityProviders`, `eventsAPI.identityStartUrl` y `eventsAPI.completeIdentity`), `client/lib/constants.js` (todos los textos) y `client/app/legal/politica-de-privacidad/page.js`.
>
> Sin cambios de contexto ni de hooks compartidos. El cliente no tiene runner de tests: todo se verifica a mano con la guía 04.

## ADDED Requirements

### Requirement: Paso de métodos tras «Registrarme en el evento»

`EventAccessModal` SHALL tener una fase `METHOD`, titulada «Registro», entre `CHOOSE` y `REGISTER`. Pulsar «Registrarme en el evento» SHALL llevar siempre a `METHOD`, aunque no haya ningún proveedor activo.

`METHOD` SHALL mostrar, en este orden:

1. El enlace «Volver», que lleva a `CHOOSE`, arriba, como en los demás pasos del modal.
2. En eventos de pago, la línea del precio.
3. «Elige cómo confirmar tu email:».
4. Una tarjeta por proveedor activo, en el orden de `GET /api/events/identity/providers`, y siempre al final la tarjeta «Recibir un código por email».
5. El texto informativo.
6. La casilla de aceptación, y bajo ella el error, si lo hay.

El modal SHALL pedir los proveedores al abrirse y guardarlos en memoria durante la vida de la página. Mientras llegan, SHALL mostrar un indicador de carga en el lugar de las tarjetas de proveedor; si la petición falla, solo la tarjeta de email.

#### Scenario: Ambos proveedores activos
- **WHEN** alguien pulsa «Registrarme en el evento» con Google y Microsoft activos
- **THEN** ve, de arriba abajo, «Continuar con Google», «Continuar con Microsoft» y «Recibir un código por email», el texto informativo y la casilla

#### Scenario: Ningún proveedor activo
- **WHEN** no hay ningún proveedor configurado
- **THEN** el paso de métodos muestra solo la tarjeta de email y la casilla, y no muestra el texto informativo

#### Scenario: Elegir el código por email
- **WHEN** alguien acepta la casilla y pulsa «Recibir un código por email»
- **THEN** pasa a `REGISTER`, cuyo formulario ya no tiene casilla y cuyo «Volver» lleva a `METHOD` con la casilla aún marcada

### Requirement: Tarjetas según las guías de marca de cada proveedor

Las tres tarjetas SHALL tener el mismo ancho (completo), el mismo alto (44 px) y la misma tipografía (Inter, la del sitio, `text-sm font-semibold`), con el logotipo de 20 px a la izquierda del texto, 12 px de margen interior y 12 px entre logotipo y texto.

- **Google:** fondo `#FFFFFF`, borde de 1 px `#747775`, texto `#1F1F1F`, «Continuar con Google» y la «G» oficial vigente del paquete `signin-assets.zip` de Google, sin modificar, sin recolorear y nunca en monocromo.
- **Microsoft:** fondo `#FFFFFF`, borde de 1 px `#8C8C8C`, texto `#5E5E5E`, «Continuar con Microsoft» y el logotipo oficial de cuatro cuadrados (`#F25022`, `#7FBA00`, `#00A4EF`, `#FFB900`), sin modificar.
- **Email:** el estilo del botón secundario del modal (`bg-white`, `ring-1 ring-inset ring-gray-300`, `text-gray-900`), «Recibir un código por email» y el `EnvelopeIcon` de Heroicons.

Los logotipos SHALL servirse desde `client/public/brand/proveedores/` con un nombre versionado:

- `google-g-v1.png`: recorte de 80×80 px del icono oficial a 4x, solo la «G»;
- `microsoft-v1.svg`: el símbolo oficial sin cambios.

Ambos salen de los originales de `docs/verificacion-proveedores/recursos/`, y SHALL pintarse con `alt=""` y `aria-hidden="true"`. Ninguna tarjeta SHALL ser más grande, más oscura ni más destacada que otra.

#### Scenario: Prominencia
- **WHEN** se muestran las tres tarjetas
- **THEN** tienen el mismo tamaño y peso tipográfico, y ninguna usa un fondo oscuro

#### Scenario: Logotipo de Google en una pantalla de alta densidad
- **WHEN** se abre el paso de métodos en un iPhone (pantalla 3x) o dentro de la vista web de Instagram
- **THEN** la «G» se ve nítida, con su degradado oficial y sin restos del marco del botón

### Requirement: Texto informativo de la verificación con proveedor

Con algún proveedor activo, bajo las tarjetas SHALL mostrarse el texto de `client/lib/constants.js`, que nombra solo a los proveedores activos. Con los dos:

«Solo usamos tu cuenta de Google o Microsoft para confirmar tu email. De ella guardamos tu nombre y tu email, y nada más: no creamos ninguna cuenta en 140d.»

Con Microsoft activo, SHALL añadirse «Con Microsoft, solo cuentas personales (Outlook, Hotmail o Live).»

#### Scenario: Solo Google activo
- **WHEN** solo Google está activo
- **THEN** el texto dice «Solo usamos tu cuenta de Google…» y no menciona Microsoft

### Requirement: La casilla de aceptación se valida al elegir cualquier método

La casilla «Acepto las normas y términos para la participación en eventos en directo y la política de privacidad», con sus dos enlaces, SHALL estar en `METHOD` y no en `REGISTER`. Pulsar cualquier tarjeta sin marcarla SHALL mostrar «Debes aceptar las normas de participación» sin cambiar de fase ni navegar.

#### Scenario: Google sin aceptar
- **WHEN** alguien pulsa «Continuar con Google» sin marcar la casilla
- **THEN** ve el error, y el navegador no sale de la página

### Requirement: Inicio desde una tarjeta de proveedor

Fuera de un navegador interno de una app, pulsar una tarjeta de proveedor con la casilla marcada SHALL navegar la página entera (`window.location.assign`) a `eventsAPI.identityStartUrl(event.id, provider)`, que es `<NEXT_PUBLIC_API_URL>/events/<id>/identity/<provider>/start`. Mientras tanto, esa tarjeta SHALL mostrar «Redirigiendo…» y el resto SHALL quedar deshabilitadas.

Si la página vuelve desde la caché del navegador (`pageshow` con `persisted`), las tarjetas SHALL volver a su estado normal.

#### Scenario: Volver atrás desde Google
- **WHEN** alguien pulsa Google, llega a la pantalla de Google y pulsa «atrás» en el navegador
- **THEN** ve el paso de métodos con las tarjetas habilitadas

### Requirement: Vuelta del proveedor por el fragmento de la URL

`client/lib/eventAccessFragment.js` SHALL ser el único lector de los fragmentos `#acceso`, `#acceso-error=<CÓDIGO>` y `#acceder`, y SHALL quitarlos con `history.replaceState` en cuanto los lee. `EventDetail` SHALL leerlos al montarse:

- `#acceso`: abre el modal en `COMPLETING` y llama a `eventsAPI.completeIdentity(event.id)`, que es `POST /events/:id/identity/complete` con `credentials: 'include'` y `skipAuthHandling`;
- `#acceso-error=<CÓDIGO>`: abre el modal en `METHOD` con el texto del código. Con `IDENTITY_EMAIL_UNTRUSTED` lo abre en `REGISTER`, con el texto como aviso. Un código desconocido se muestra como `IDENTITY_FAILED`;
- `#acceder`: abre el modal en `METHOD`, salvo que la sesión guardada ya esté concedida.

Tras `#acceso` o `#acceso-error`, la casilla SHALL contar como aceptada, porque el flujo solo empieza desde una tarjeta con la casilla marcada. Por eso `METHOD` la muestra marcada. Tras `#acceder`, SHALL mostrarse sin marcar.

Ningún fragmento SHALL contener un secreto.

#### Scenario: Vuelta correcta de Google en un evento gratuito
- **WHEN** el navegador llega a `/live/<slug>#acceso` con la cookie de la prueba
- **THEN** la URL queda en `/live/<slug>` sin fragmento
- **AND** el modal muestra «Confirmando tu acceso…» y después `SUCCESS`, con la contraseña y «Te has registrado como <email>»
- **AND** la sesión queda guardada como con el código

#### Scenario: Email que Google no gestiona
- **WHEN** el navegador llega con `#acceso-error=IDENTITY_EMAIL_UNTRUSTED`
- **THEN** el modal abre el formulario de email con el aviso de que se enviará un código

#### Scenario: Recarga tras la vuelta
- **WHEN** el asistente recarga la página después de completar la vuelta
- **THEN** el modal no se vuelve a abrir, porque el fragmento ya no está

### Requirement: Fase COMPLETING y email visible al terminar

La fase `COMPLETING` SHALL mostrar «Confirmando tu acceso…» con un indicador de carga, y al responder `identity/complete` SHALL:

- con `paymentRequired: false`, guardar la sesión (`storeSession` con `attendeeId`, `accessToken`, `firstName` y `lastName` de la respuesta), llamar a `onAccessGranted` y pasar a `SUCCESS`;
- con `paymentRequired: true`, guardar el token en memoria y pasar a `PAYMENT` como hoy, mostrando «Pagarás como <email>»;
- con un error, pasar a `METHOD` con el texto de su código.

`SUCCESS` SHALL mostrar «Te has registrado como <email>» cuando conoce el email, en los dos caminos.

#### Scenario: Evento de pago con Microsoft
- **WHEN** la vuelta de Microsoft se canjea en un evento de pago
- **THEN** el modal muestra el pago con «Pagarás como ana@outlook.es», y no guarda la sesión hasta que el pago se confirma

#### Scenario: Prueba caducada
- **WHEN** alguien abre la URL con `#acceso` más de 10 minutos después
- **THEN** el modal muestra el paso de métodos con «La verificación ha caducado o ya se usó. Vuelve a elegir un método.»

### Requirement: Textos de los errores de verificación con proveedor

`ACCESS_VERIFICATION_ERRORS` en `client/lib/constants.js` SHALL tener texto es-ES para cada código nuevo:

- `IDENTITY_CANCELLED`: «Has cancelado el acceso. Elige otro método o vuelve a intentarlo.»
- `IDENTITY_SESSION_LOST`: «Tu navegador no conservó la verificación. Vuelve a intentarlo o recibe un código por email.»
- `IDENTITY_FAILED`: «No hemos podido confirmar tu cuenta. Vuelve a intentarlo o recibe un código por email.»
- `IDENTITY_EMAIL_UNTRUSTED`: «Tu cuenta usa un email que gestiona otro proveedor. Para confirmarlo te enviaremos un código: completa tus datos.»
- `IDENTITY_PROOF_INVALID`: «La verificación ha caducado o ya se usó. Vuelve a elegir un método.»
- `EVENT_CLOSED`: «El evento ya no acepta registros.»

`EVENT_FULL` conserva su texto.

#### Scenario: Cancelar en Microsoft
- **WHEN** el asistente cancela en la pantalla de Microsoft
- **THEN** vuelve al paso de métodos con «Has cancelado el acceso. Elige otro método o vuelve a intentarlo.»

### Requirement: Política de privacidad del registro en eventos

`client/app/legal/politica-de-privacidad/page.js` SHALL tener un apartado «Registro en eventos en directo», con el ancla `#registro-en-eventos` y antes del de grabación, que diga:

- **qué datos se guardan al registrarse:** nombre y apellidos, email, la IP desde la que se verifica (para aplicar expulsiones), la contraseña de acceso y, en eventos de pago, la referencia del pago;
- **los dos modos de verificar el email:** el código y la cuenta de Google o Microsoft;
- **qué se recibe del proveedor:** un token con el nombre, el email, un identificador interno de la cuenta y, en Google, la foto de perfil. Solo se usa para confirmar el email: se guardan el nombre y el email, el resto se descarta, y no se guarda ni el identificador, ni la foto, ni el token, ni qué proveedor se usó;
- **que no se crea ninguna cuenta**, y que el proveedor sabe que esa cuenta se ha usado para acceder a 140d, conforme a su propia política;
- **las dos cookies técnicas de la verificación:** en el dominio de la API, durante 10 minutos, exentas de consentimiento.

Los apartados siguientes SHALL renumerarse, y ningún texto del sitio SHALL citar un número de apartado que haya cambiado.

#### Scenario: Consulta desde el paso de métodos
- **WHEN** alguien sigue el enlace «política de privacidad» de la casilla
- **THEN** encuentra el apartado «Registro en eventos en directo» con lo que se guarda de su cuenta de Google o Microsoft
