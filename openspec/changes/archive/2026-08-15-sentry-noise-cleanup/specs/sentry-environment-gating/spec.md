## ADDED Requirements

### Requirement: Sentry no envía eventos desde el entorno de desarrollo
El sistema SHALL suprimir el envío de eventos a Sentry (errores, trazas, perfiles, logs y session replays) cuando el entorno de ejecución es desarrollo, tanto en el backend Express como en los tres runtimes de Next.js (browser, node y edge). El SDK SHALL permanecer cableado — importado e inicializado — de modo que las APIs de Sentry (`captureException`, `startSpan`, `setupExpressErrorHandler`, `captureRequestError`, `captureRouterTransitionStart`) sigan siendo invocables sin lanzar, y sólo el transporte quede desactivado.

#### Scenario: Error no capturado en el backend en desarrollo
- **WHEN** el proceso de la API corre con `NODE_ENV=development` y se produce una excepción no capturada
- **THEN** el error SHALL registrarse en el logger de Pino y NO SHALL enviarse ningún evento a Sentry

#### Scenario: Error en el navegador en desarrollo
- **WHEN** el cliente Next.js corre en desarrollo y se produce un error en el navegador (incluidos los emitidos por Fast Refresh / HMR durante el ciclo editar-guardar)
- **THEN** el error SHALL aparecer en la consola del navegador y en el overlay de error de Next.js, y NO SHALL enviarse ningún evento ni session replay a Sentry

#### Scenario: Error en el render de servidor de Next.js en desarrollo
- **WHEN** el runtime `nodejs` o `edge` de Next.js corre en desarrollo y `onRequestError` recibe un error de render
- **THEN** la llamada a `captureRequestError` SHALL completarse sin lanzar y NO SHALL enviarse ningún evento a Sentry

#### Scenario: El cableado del SDK sigue presente en desarrollo
- **WHEN** la aplicación arranca en desarrollo
- **THEN** `instrument.js` SHALL haberse cargado, `setupExpressErrorHandler` SHALL haberse registrado sobre la app de Express, y el arranque NO SHALL emitir el warning `express is not instrumented`

### Requirement: Sentry envía eventos desde staging y producción
El sistema SHALL enviar eventos a Sentry en cualquier entorno distinto de desarrollo y de test, etiquetándolos con el valor de `NODE_ENV` como `environment`. La habilitación NO SHALL depender de una comprobación `NODE_ENV === 'production'`, de modo que `staging` quede cubierto sin configuración adicional.

#### Scenario: Error en staging
- **WHEN** la API corre con `NODE_ENV=staging` y se produce un error no manejado
- **THEN** el evento SHALL enviarse a Sentry con el tag `environment: staging`

#### Scenario: Error en producción
- **WHEN** la API o el cliente corren con `NODE_ENV=production` y se produce un error no manejado
- **THEN** el evento SHALL enviarse a Sentry con el tag `environment: production`

### Requirement: Escape hatch para reactivar Sentry en desarrollo
El sistema SHALL exponer una variable de entorno `SENTRY_ENABLE_DEV` que, con el valor literal `true`, reactive el envío de eventos a Sentry en el entorno de desarrollo. Cualquier otro valor, así como su ausencia, SHALL dejar el envío desactivado (fail-safe hacia el silencio). El escape hatch NO SHALL tener efecto bajo `NODE_ENV=test`.

#### Scenario: Escape hatch activado en desarrollo
- **WHEN** la aplicación corre con `NODE_ENV=development` y `SENTRY_ENABLE_DEV=true`
- **THEN** los eventos SHALL enviarse a Sentry con el tag `environment: development`

#### Scenario: Escape hatch ausente o con otro valor
- **WHEN** la aplicación corre en desarrollo y `SENTRY_ENABLE_DEV` está ausente, vacía, o tiene un valor distinto de `true`
- **THEN** NO SHALL enviarse ningún evento a Sentry

#### Scenario: Escape hatch ignorado bajo test
- **WHEN** el proceso corre con `NODE_ENV=test` y `SENTRY_ENABLE_DEV=true`
- **THEN** `@sentry/node` NO SHALL importarse ni inicializarse, y NO SHALL enviarse ningún evento

### Requirement: Sentry permanece completamente ausente bajo NODE_ENV=test
El sistema SHALL seguir excluyendo Sentry por completo del proceso de test: `api/instrument.js` no SHALL invocar `Sentry.init()` y `api/app.js` no SHALL requerir `@sentry/node` para registrar el error handler de Express. La razón es estructural y no de ruido: importar `@sentry/node` instala instrumentación global de OpenTelemetry vía require-hook que sobrevive al registro de módulos por fichero de Jest y rompe suites no relacionadas.

#### Scenario: Suite de tests sin instrumentación de Sentry
- **WHEN** se ejecuta la suite de tests del backend con `NODE_ENV=test`
- **THEN** `@sentry/node` NO SHALL aparecer en la caché de módulos requeridos y `globalThis.__SENTRY__` NO SHALL existir

#### Scenario: El gating por entorno no reintroduce Sentry en test
- **WHEN** se aplica el gating de desarrollo descrito en esta capacidad
- **THEN** el camino de test SHALL seguir siendo una exclusión por `require` condicional, y NO SHALL sustituirse por un `enabled: false` en `Sentry.init()`

### Requirement: Los sample rates de trazas y replays se ajustan por entorno
El sistema SHALL permitir configurar los ratios de muestreo de trazas, perfiles y session replays mediante variables de entorno, con valores por defecto adecuados a producción en lugar de estar fijados a `1` en el código. Los ratios del cliente Next.js SHALL ser coherentes entre los tres runtimes.

#### Scenario: Ratio de trazas por defecto en producción
- **WHEN** la aplicación arranca en producción sin `SENTRY_TRACES_SAMPLE_RATE` definida
- **THEN** el ratio de muestreo de trazas SHALL ser un valor de producción documentado, no `1`

#### Scenario: Ratio de trazas sobreescrito por entorno
- **WHEN** se define `SENTRY_TRACES_SAMPLE_RATE` con un valor numérico válido
- **THEN** el SDK SHALL usar ese valor
