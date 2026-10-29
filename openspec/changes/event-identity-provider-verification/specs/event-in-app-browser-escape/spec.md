> Capas afectadas: `client/lib/inAppBrowser.js` (nuevo, único lugar con la lógica de detección y salida), `client/components/EventVerificationMethods.js` y `client/lib/constants.js` (instrucciones por app). Solo frontend.
>
> Sin runner de tests en el cliente: se verifica en dispositivos reales con la matriz de la guía 04.

## ADDED Requirements

### Requirement: Detección del navegador interno de una app

`detectInAppBrowser(userAgent)` en `client/lib/inAppBrowser.js` SHALL devolver `{ app, platform }` o `null`. `platform` SHALL ser `ios` (`iPhone`, `iPad` o `iPod`) o `android`. `app` se decide por los tokens del user agent:

- `instagram`: `Instagram`;
- `messenger`: `MessengerForiOS` u `Orca-Android`;
- `facebook`: `FBAN`, `FBAV`, `FB_IAB` o `FBIOS`, salvo que sea Messenger;
- `threads`: `Barcelona`;
- `tiktok`: `musical_ly`, `BytedanceWebview` o `TikTok`;
- `linkedin`: `LinkedInApp`;
- `android-webview`: `; wv)` en Android sin ninguno de los anteriores.

Ningún otro módulo SHALL repetir estas comprobaciones.

#### Scenario: Instagram en iPhone
- **WHEN** el user agent contiene `iPhone` e `Instagram 426.0`
- **THEN** devuelve `{ app: 'instagram', platform: 'ios' }`

#### Scenario: Safari normal
- **WHEN** el user agent es el de Safari para iOS sin tokens de app
- **THEN** devuelve `null`

### Requirement: La tarjeta de Google sale al navegador real dentro de una app

Dentro de un navegador interno detectado, la tarjeta «Continuar con Google» SHALL seguir visible e idéntica. Al pulsarla con la casilla aceptada, en lugar de navegar dentro de la app, SHALL abrir en el navegador real **la URL de inicio de la API** (`eventsAPI.identityStartUrl`), con el enlace que devuelva `externalBrowserUrl(url, detected)`:

- **Android**, cualquier app detectada: `intent://<host><ruta y consulta>#Intent;scheme=https;end`, sin paquete, para que lo abra el navegador por defecto. **Sin `S.browser_fallback_url`:** si la app no resolviera el intent, ese respaldo cargaría la URL de inicio dentro de la propia vista web, que es justo la pantalla de bloqueo de Google. Sin respaldo, a los 2 s aparecen las instrucciones;
- **iOS Instagram:** `instagram://extbrowser/?url=<url codificada>`;
- **iOS Facebook, Messenger, Threads y LinkedIn:** `x-safari-https://<host><ruta y consulta>`, abierto con `window.open`;
- **iOS TikTok o cualquier otra app:** ninguno (`null`).

El enlace SHALL dispararse dentro del mismo manejador del toque, sin `await` previo, porque las apps solo lo aceptan como gesto del usuario.

Las tarjetas de Microsoft y de email SHALL comportarse igual dentro y fuera de las apps.

#### Scenario: Instagram en Android
- **WHEN** alguien en Instagram para Android acepta la casilla y pulsa «Continuar con Google»
- **THEN** se abre su navegador por defecto en la URL de inicio, y el registro termina en ese navegador con el modal en `SUCCESS`

#### Scenario: Facebook en iPhone
- **WHEN** alguien en Facebook para iOS pulsa «Continuar con Google»
- **THEN** Facebook pregunta si abrir Safari y, al aceptar, la verificación ocurre en Safari

#### Scenario: Microsoft dentro de Instagram
- **WHEN** alguien en Instagram pulsa «Continuar con Microsoft»
- **THEN** la verificación ocurre dentro de Instagram, sin salir de la app

### Requirement: Instrucciones de respaldo cuando la app no deja salir

Tras disparar el enlace de salida, la tarjeta SHALL mostrar «Abriendo tu navegador…». Después:

- si la página pasa a oculta (`visibilitychange`, `pagehide` o `blur`), SHALL mostrar bajo las tarjetas «Continúa en tu navegador. Cuando termines, el acceso quedará allí.»;
- si a los 2 s sigue visible, o si `externalBrowserUrl` devolvió `null`, SHALL mostrar las instrucciones de esa app.

Las instrucciones SHALL incluir:
- el texto de la app, en `client/lib/constants.js`: Instagram, «Toca ⋯ arriba a la derecha y elige «Abrir en el navegador externo»»; Facebook, Messenger y Threads, «Toca ⋯ y elige «Abrir en el navegador»»; y un texto genérico para las demás;
- el botón «Copiar enlace», que copia `<origen del cliente>/live/<slug>#acceder` con `navigator.clipboard.writeText` y, si falla, lo muestra seleccionado en un campo de solo lectura;
- «También puedes continuar aquí con Microsoft o con un código por email», nombrando solo los métodos activos.

#### Scenario: TikTok en iPhone
- **WHEN** alguien en TikTok para iOS pulsa «Continuar con Google»
- **THEN** ve directamente las instrucciones y «Copiar enlace», sin un intento de salida

#### Scenario: El enlace de salida no hace nada
- **WHEN** Instagram para iOS ignora `instagram://extbrowser/` y la página sigue visible 2 s después
- **THEN** aparecen las instrucciones de Instagram y «Copiar enlace»

#### Scenario: Pegar el enlace copiado en el navegador
- **WHEN** alguien pega el enlace copiado en Safari
- **THEN** se abre la ficha con el modal en el paso de métodos, con la casilla sin marcar
