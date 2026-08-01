# Sentry noise cleanup: gating por entorno y degradación elegante de story videos

## Why

El stream de issues de Sentry ha dejado de ser señal de producción. Dos causas independientes:

1. **Desarrollo local emite errores que no son defectos.** Los cinco issues reportados en `environment: development` son artefactos del ciclo editar-guardar-recargar: cuatro de ellos (`hideOnMobile`, `IS_PROD`, `isFileDatabaseUrl`, `Sentry`) referencian identificadores que hoy existen y funcionan correctamente en el código, y sus stacktraces están íntegramente dentro de la maquinaria de HMR/Fast Refresh de Turbopack o de `wrapSafe` (nodemon reiniciando sobre un fichero a medio guardar). El quinto (`SyntaxError: missing ) after argument list`, 14 ocurrencias) es literalmente un fichero guardado a mitad de escritura. Además se están grabando **session replays de sesiones de `localhost`**, consumiendo cuota sin aportar nada: en local ya existe la mejor superficie de error posible (consola del navegador, overlay de error de Next.js, logs del contenedor).

2. **Staging emite 1.414 eventos de un fallo de configuración esperado.** `GET /api/stories/videos` lanza `AWS S3 is not configured (AWS_S3_BUCKET missing)` en cada petición porque preproducción es self-hosted y no tiene credenciales AWS (decisión ya tomada y documentada en `CLAUDE.md`). El vídeo de portada es decorativo y el cliente ya tolera la lista vacía (`fetchStoryVideos` devuelve `[]` ante cualquier fallo), así que un 500 no aporta información accionable — sólo ruido que entrena a ignorar las alertas.

El coste combinado es el mismo: cuota consumida, alertas desatendidas y un panel donde un incidente real de producción queda enterrado.

## What Changes

### Sentry: gating explícito por entorno

- Sentry deja de **enviar eventos** cuando `NODE_ENV=development`, en los cuatro puntos de inicialización que hoy existen: `api/instrument.js`, `client/instrumentation-client.js`, `client/sentry.server.config.js` y `client/sentry.edge.config.js`.
- El SDK se sigue **cableando** igual (imports, `register()`, `onRequestError`, `setupExpressErrorHandler`, `onRouterTransitionStart`): sólo se apaga el envío. La integración no se desmonta, de modo que un fallo de cableado se detecta igual y no se introduce divergencia estructural entre entornos.
- Se añade un **escape hatch** deliberado, `SENTRY_ENABLE_DEV=true`, que reactiva el envío en desarrollo para depurar la propia integración de Sentry cuando haga falta. Por defecto ausente.
- `NODE_ENV=test` se sigue tratando como hoy: Sentry no se importa siquiera en el backend, por las razones documentadas en `api/app.js` e `instrument.js`. Esta propuesta **no toca** ese camino.
- Los sample rates de trazas y replays del cliente pasan a leerse de forma coherente con el entorno en lugar de estar fijados a `1` / `0.1` en los tres ficheros de Next.

### Story videos: degradación elegante en lugar de 500

- `GET /api/stories/videos` SHALL responder `200` con `{ videos: [] }` cuando S3 no está configurado (`config.useS3 === false`), en lugar de propagar un `Error` al `errorHandler` global.
- El criterio es el mismo que ya usa el proyecto en otros puntos: **activación por configuración presente**, nunca por un `NODE_ENV === 'production'`.
- Un fallo **real** de S3 (bucket configurado pero inaccesible, credenciales inválidas, error de red) sigue siendo un 500 reportado a Sentry. La distinción es deliberada: "no configurado" es un estado esperado del entorno; "configurado y roto" es un incidente.

### Higiene de los issues existentes

- Los seis issues citados se resuelven en Sentry (los cinco de desarrollo como no-defectos, el de staging tras el fix), y se deja constancia de por qué en la propia issue.

## Capabilities

### New Capabilities
- `sentry-environment-gating`: en qué entornos Sentry envía eventos, cómo se decide, y el escape hatch para reactivarlo en desarrollo. Cubre backend (Express) y frontend (Next.js: client, server y edge runtimes).

### Modified Capabilities
- `story-videos-api`: el escenario "Error de conexión a S3" deja de ser el único camino de fallo. Se distingue entre **S3 no configurado** (200 con array vacío, sin reporte a Sentry) y **S3 configurado pero inaccesible** (500 + reporte), cambiando el comportamiento observable del endpoint.

## Impact

**Código afectado**

- `api/instrument.js` — condición de `Sentry.init()`.
- `api/config/env.js` — bloque `sentry`: nuevo flag de habilitación y su documentación.
- `api/routes/storiesRoutes.js` — guarda por `config.useS3`.
- `client/instrumentation-client.js`, `client/sentry.server.config.js`, `client/sentry.edge.config.js` — `enabled` + sample rates por entorno.
- `client/lib/env.js` — posible punto de lectura del flag en el bundle del cliente (ver `design.md`).
- `api/.env.example`, `client/.env.example`, `/.env.example` — documentación de `SENTRY_ENABLE_DEV`.
- `CLAUDE.md` — sección de variables de entorno.

**Sin impacto**

- Producción y staging siguen reportando exactamente igual (salvo la desaparición del ruido de S3 en staging).
- El suite de tests no cambia de comportamiento: `NODE_ENV=test` ya excluía Sentry por completo y esta propuesta no altera ese camino.
- El cliente (`fetchStoryVideos`) no requiere cambios: ya devuelve `[]` ante cualquier respuesta no-OK.

**Dependencias externas**

- Ninguna nueva. No se añaden paquetes ni se tocan credenciales.

**Operativa**

- El único paso manual es resolver los seis issues en Sentry tras el despliegue.
- No requiere configurar AWS en staging (decisión explícita: preproducción no tendrá credenciales AWS).
