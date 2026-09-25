# initial-js-budget

## Purpose

Qué interfaz se descarga bajo demanda en lugar de viajar en el JavaScript inicial de todas las páginas —la cesta, los modales del layout y Sentry Session Replay—, cómo se precarga cuando es probable que se use, qué comportamiento debe conservar (transiciones de entrada, orden Revolut pendiente, captura de errores) y cómo se mide el presupuesto.

> Capa afectada: `client/hooks/useOnDemandComponent.js`, `client/lib/idle.js`, `client/components/Navbar.js`, `client/components/LazyAuthorModal.js`, `client/components/NewsletterBanner.js`, `client/instrumentation-client.js`, `client/lib/sentryReplay.js`.

## Requirements

### Requirement: La interfaz que solo existe tras una interacción no viaja en el bundle inicial

Los siguientes componentes SHALL descargarse con un `import()` dinámico a través de `client/hooks/useOnDemandComponent.js` y NO SHALL renderizarse —ni, por tanto, pedir su chunk— hasta que el visitante los abra por primera vez. El hook SHALL montarlos cerrados y abrirlos en el fotograma siguiente, de modo que su transición de entrada se reproduzca igual que cuando se montaban al cargar la página:

- `ShoppingCartDrawer`, montado por `client/components/Navbar.js`.
- `AuthorModal`, a través de un único envoltorio `client/components/LazyAuthorModal.js` que usan todos sus consumidores.
- `NewsletterSubscribeModal`, montado por `client/components/NewsletterBanner.js`.

Tras la primera apertura cada componente SHALL permanecer montado, de modo que su animación de cierre y su estado interno se comporten como antes del cambio.

#### Scenario: Visita a la galería sin abrir nada
- **WHEN** se carga `/galeria` y no se abre la cesta, ni una biografía, ni el formulario de newsletter
- **THEN** ninguno de los chunks que referencia el HTML contiene el código de Stripe Elements, del paso de envío de la cesta ni de DOMPurify
- **AND** no se descarga ningún chunk de esos componentes

#### Scenario: Apertura de la cesta
- **WHEN** el visitante pulsa el icono de la cesta
- **THEN** la cesta se abre con su animación de entrada
- **AND** a partir de ahí se comporta exactamente igual que antes del cambio: pasos, dirección, envío, pago con Stripe

#### Scenario: Apertura desde otra página
- **WHEN** `/pago-fallido` o `/pago-cancelado` disparan el evento `open-cart-drawer`
- **THEN** la cesta se carga si hacía falta y se abre

#### Scenario: Biografía de un artista
- **WHEN** el visitante abre la biografía de un artista desde la rejilla, una ficha o un evento
- **THEN** el modal se abre y muestra la biografía saneada igual que antes

### Requirement: La cesta se precarga cuando es probable que se abra

`Navbar` SHALL iniciar la descarga del chunk de la cesta, sin montarla, cuando el puntero entra en el botón de la cesta, cuando recibe el foco o un `touchstart`, y en reposo (`requestIdleCallback` con respaldo) si la cesta contiene artículos.

#### Scenario: Visitante con artículos en la cesta
- **WHEN** se carga cualquier página con la cesta no vacía
- **THEN** el chunk de la cesta se descarga en reposo tras la carga
- **AND** abrirla no espera a ninguna descarga

#### Scenario: Toque en móvil
- **WHEN** el visitante toca el icono de la cesta con la cesta vacía y sin precarga previa
- **THEN** la descarga empieza en el `touchstart`, antes del `click`

### Requirement: Una orden Revolut pendiente se sigue reconciliando al cargar

Si `sessionStorage` contiene una orden Revolut pendiente (clave `REVOLUT_ORDER_STORAGE_KEY`, definida una sola vez en `client/lib/constants.js`), `Navbar` SHALL montar la cesta cerrada en reposo tras la carga, de modo que su efecto de montaje restaure la orden o la cancele si la cesta cambió, igual que antes del cambio.

#### Scenario: Vuelta tras una orden Revolut con la cesta modificada
- **WHEN** existe una orden Revolut pendiente y el contenido de la cesta ya no coincide con su instantánea
- **THEN** la orden obsoleta se cancela sin que el visitante tenga que abrir la cesta

### Requirement: Sentry Session Replay se registra fuera de la ruta crítica

`client/instrumentation-client.js` NO SHALL incluir la integración de Replay en `Sentry.init`. SHALL añadirla con `Sentry.addIntegration` tras el evento `load` y en reposo, importándola de un módulo propio que reexporta únicamente `replayIntegration` (`client/lib/sentryReplay.js`), para que el chunk diferido no contenga el resto del SDK. Los ratios de muestreo de Replay SHALL seguir declarados en `Sentry.init`. La inicialización, la captura de errores, el tracing y `onRouterTransitionStart` SHALL seguir activos desde el primer instante. El cableado SHALL ser idéntico en desarrollo, staging y producción.

#### Scenario: Chunks iniciales
- **WHEN** se inspeccionan los chunks que referencia el HTML de producción de `/galeria`
- **THEN** ninguno contiene rrweb
- **AND** rrweb llega en un chunk asíncrono pedido después del evento `load`
- **AND** ese chunk no contiene integraciones de Sentry que la aplicación no usa (feedback, replay de canvas)

#### Scenario: Error tras la carga en producción
- **WHEN** se produce un error no capturado después de que Replay se haya registrado
- **THEN** el evento llega a Sentry con su grabación, según `replaysOnErrorSampleRate`

#### Scenario: Error antes del registro
- **WHEN** se produce un error antes del evento `load`
- **THEN** el evento llega a Sentry igual que hoy, sin grabación

### Requirement: El presupuesto se mide, no se supone

Antes y después del cambio SHALL registrarse, para el HTML de producción de `/galeria`, `/` y `/galeria/p/[slug]`, la suma de los tamaños comprimidos de los scripts que referencia. El resultado SHALL anotarse en `tasks.md`.

#### Scenario: Comparación tras el cambio
- **WHEN** se compila la versión nueva
- **THEN** el JavaScript inicial de `/galeria` es menor que la línea base de ~408 KB gzip
- **AND** se identifica con el analizador de Turbopack qué ocupa el resto
