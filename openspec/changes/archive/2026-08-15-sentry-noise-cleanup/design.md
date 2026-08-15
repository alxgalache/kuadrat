## Context

### Estado actual del cableado de Sentry

Hay **cuatro puntos de inicialización** independientes, ninguno de los cuales distingue hoy entre desarrollo y producción:

| Fichero | Runtime | Gating actual |
|---|---|---|
| `api/instrument.js` | Express (Node) | `if (process.env.NODE_ENV !== 'test')` |
| `client/instrumentation-client.js` | Browser | ninguno |
| `client/sentry.server.config.js` | Next.js `nodejs` | ninguno |
| `client/sentry.edge.config.js` | Next.js `edge` | ninguno |

Dos proyectos distintos en Sentry, con DSN hardcodeados: `140d-api` y `140d-client`. Los tres ficheros del cliente llevan `tracesSampleRate: 1` y `enableLogs: true`; `instrumentation-client.js` añade `replayIntegration()` con `replaysSessionSampleRate: 0.1`.

`api/config/env.js` ya declara un bloque `config.sentry` con `tracesSampleRate` y `profilesSampleRate`, pero **nadie lo consume**: `instrument.js` lee `process.env` directamente. Es configuración muerta hoy.

### Por qué los cinco issues de desarrollo no son defectos

| Issue | Error | Evidencia |
|---|---|---|
| `140D-CLIENT-1N` | `hideOnMobile is not defined` | La variable existe en `client/components/AuthorModal.js:29`. El stacktrace es íntegramente `applyUpdate` → `performReactRefresh` → `scheduleRefresh`: estado transitorio de Fast Refresh. |
| `140D-CLIENT-1Q` | `IS_PROD is not defined` | `app/layout.js:160` mostraba `{IS_PROD && (`. Ese bloque (Plausible) se eliminó en `e2516b3`; hoy `IS_PROD` no aparece en `layout.js`. Módulo servido a medio recargar. |
| `140D-API-28` | `isFileDatabaseUrl is not defined` | Definida en `api/config/env.js:111`, usada en la 128. Nodemon reinició sobre el fichero a medio guardar. |
| `140D-API-29` | `Sentry is not defined` | `api/app.js:220` hoy hace `require('@sentry/node').setupExpressErrorHandler(app)`. Capturado durante la propia refactorización a `require` diferido. |
| `140D-API-26` | `SyntaxError: missing ) after argument list` | Falla en `wrapSafe`, es decir al **compilar** el módulo. Un fichero guardado a mitad de escritura, 14 veces en tres semanas. |

El patrón es unívoco: son fotografías del editor, no del sistema. Ninguno es reproducible ni accionable.

### El caso de staging

`GET /api/stories/videos` llama a `s3Service.listFiles('stories/')`, que invoca `getClient()`, que lanza si `config.aws.s3Bucket` está vacío. El error viaja por `next(error)` hasta el `errorHandler` global y de ahí a Sentry: 1.414 eventos desde abril. Preproducción es self-hosted, sin IMDS ni credenciales AWS — una decisión ya tomada y documentada. El cliente (`client/lib/api.js`, `fetchStoryVideos`) ya devuelve `[]` ante cualquier respuesta no-OK, así que **el 500 no cambia nada visible**: sólo genera ruido.

### Restricciones

- Sin TypeScript. Sin dependencias nuevas.
- `NODE_ENV=test` es intocable: la exclusión total de `@sentry/node` bajo test es estructural (la instrumentación global vía require-hook sobrevive al registro de módulos por fichero de Jest y rompe suites ajenas). No puede degradarse a `enabled: false`.
- El criterio del proyecto para activar funcionalidad es **configuración presente**, nunca `NODE_ENV === 'production'` — mismo criterio que `config.useS3` y `config.backup.enabled`.
- `next build` fuerza `NODE_ENV=production` y lo inlinea, por lo que `NODE_ENV` no distingue preprod de prod en el bundle del cliente. Para esta capacidad **no importa**: sólo necesitamos distinguir *desarrollo* del resto, y `next dev` sí deja `NODE_ENV=development`.

## Goals / Non-Goals

**Goals:**

- Que el entorno de desarrollo deje de emitir eventos y session replays a Sentry, en los cuatro puntos de init.
- Que staging y producción sigan reportando exactamente igual que hoy.
- Que el endpoint `/api/stories/videos` distinga "S3 no configurado" (estado esperado, 200 vacío) de "S3 roto" (incidente, 500).
- Dejar un escape hatch explícito y documentado para reactivar Sentry en local a voluntad.
- Alinear los sample rates con valores razonables de producción, configurables por entorno.

**Non-Goals:**

- **No** se toca el camino de `NODE_ENV=test`. Sigue siendo exclusión por `require` condicional.
- **No** se configuran credenciales AWS en staging. Los story videos seguirán sin verse en preproducción, por diseño.
- **No** se mueven los DSN a variables de entorno. Están hardcodeados hoy y un DSN no es un secreto (es una clave pública de ingesta); cambiarlo es ortogonal a este trabajo y ampliaría la superficie sin beneficio.
- **No** se añaden filtros `beforeSend` / `ignoreErrors` para ruido de HMR. Es la alternativa que se descartó explícitamente (ver Decisión 1).
- **No** se unifican los dos proyectos de Sentry (`140d-api` / `140d-client`).

## Decisions

### Decisión 1 — Apagar el transporte en desarrollo, no filtrar el ruido

**Elegido:** desactivar el envío cuando `NODE_ENV=development`.

**Alternativa descartada:** mantener el envío y añadir `beforeSend` / `ignoreErrors` que descarten errores de HMR y arranques fallidos.

**Razón:** el filtro sería frágil y perpetuo. Los cinco errores observados no comparten un patrón estable — dos son `ReferenceError` con nombres arbitrarios de variables del propio código, uno es un `SyntaxError` de compilación, y sus stacktraces atraviesan chunks de Turbopack cuyos nombres cambian en cada build. Cualquier regex que los cubriera acabaría descartando también errores reales con la misma forma. Y aunque el filtro funcionase, seguiría consumiendo cuota de replays de sesiones en `localhost`. En desarrollo la superficie de error ya es superior a la de Sentry: consola del navegador, overlay de Next.js y `docker compose logs`. Sentry no añade nada que no esté ya delante del desarrollador.

### Decisión 2 — `enabled: false`, no `dsn: undefined` ni omitir `init()`

**Elegido:** pasar `enabled` a `Sentry.init()` en los cuatro puntos, manteniendo el resto del cableado intacto.

**Alternativas descartadas:**
- *Omitir la llamada a `init()` en dev* — dejaría el SDK sin inicializar y las llamadas a `setupExpressErrorHandler` emitirían el warning `express is not instrumented`; además `captureRequestError` y `captureRouterTransitionStart` operarían sobre un cliente inexistente. Crearía divergencia estructural entre entornos: un fallo de cableado sólo se detectaría en producción.
- *`dsn: undefined`* — funciona, pero es implícito. `enabled: false` declara la intención.

**Matiz importante:** `enabled: false` es correcto para *desarrollo* pero **no** para test, donde el problema no es el envío sino la instrumentación global que `init()` instala igualmente (carrier versionado en `globalThis.__SENTRY__` + require-hooks de OpenTelemetry). Por eso el camino de test se mantiene como está: `if (process.env.NODE_ENV !== 'test')` alrededor del `require`/`init` completo. Los dos gatings **coexisten y no se colapsan en uno**:

```
NODE_ENV=test        → no se importa Sentry en absoluto   (estructural)
NODE_ENV=development → se importa e inicializa, enabled:false  (ruido)
resto                → se importa e inicializa, enabled:true
```

### Decisión 3 — `instrument.js` lee `process.env` directamente, no `config/env.js`

`api/instrument.js` se carga en la **primera línea** de `api/app.js`, antes que ningún otro módulo, precisamente porque la auto-instrumentación de OpenTelemetry necesita parchear `require` antes de que se cargue Express, el driver de la base de datos, etc. Requerir `config/env.js` desde ahí cargaría toda la validación de entorno (y sus `process.exit`) por delante de `Sentry.init()`, anulando esa garantía.

Por tanto `instrument.js` sigue leyendo `process.env` directamente y haciendo su propio `require('dotenv').config()`. Se replicará el mismo criterio de habilitación en `config.sentry.enabled` para que el resto de la aplicación (y los tests) puedan **consultarlo**, pero la autoridad es `instrument.js`. Esta duplicación es deliberada y debe quedar comentada en ambos ficheros para que nadie "arregle" la aparente redundancia.

### Decisión 4 — Escape hatch: `SENTRY_ENABLE_DEV` (backend) y `NEXT_PUBLIC_SENTRY_ENABLE_DEV` (cliente)

Parseado como `=== 'true'` (fail-safe hacia el silencio: ausente, vacío o cualquier otro valor → desactivado). Es el mismo estilo de parseo que `optionalBool` en `config/env.js`.

**El del cliente no necesita el ritual de cuatro sitios de los `NEXT_PUBLIC_*`.** Ese ritual (`.env.example` raíz + `client/.env.example` + los dos `Dockerfile.staging`/`Dockerfile.prod` + los dos compose) existe porque los `NEXT_PUBLIC_*` se inlinean durante `next build`. Pero esta variable **sólo tiene efecto cuando `NODE_ENV=development`**, es decir bajo `next dev`, donde no hay build y las variables se leen en runtime. Añadirla a los Dockerfiles de staging/prod sería código muerto que sugiere, falsamente, que se puede activar Sentry-dev en esos entornos. Se documenta únicamente en `client/.env.example` y en el `.env` raíz, con un comentario que explique por qué no está en los Dockerfiles.

### Decisión 5 — Sample rates: bajar el `1` del cliente y hacerlo configurable

Los tres ficheros de Next.js llevan `tracesSampleRate: 1` — el valor que genera el scaffolding de Sentry, no una decisión. Muestrear el 100% de las transacciones en producción consume cuota rápidamente. Se alinea con el backend (`SENTRY_TRACES_SAMPLE_RATE`, default `0.1`) usando `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` con el mismo default.

`replaysSessionSampleRate` (0.1) y `replaysOnErrorSampleRate` (1.0) se mantienen: son valores ya deliberados y, con el gating de dev, dejan de grabar sesiones de `localhost`.

`enableLogs: true` se mantiene. Con `enabled: false` en dev no emite nada.

### Decisión 6 — Guarda en la ruta, no en el servicio

**Elegido:** comprobar `config.useS3` en `api/routes/storiesRoutes.js` y devolver `{ videos: [] }` antes de llamar a `s3Service`.

**Alternativa descartada:** hacer que `s3Service.listFiles()` devuelva `[]` en lugar de lanzar cuando no hay bucket.

**Razón:** `getClient()` es compartido por todas las operaciones de S3 — subida de imágenes de producto, backups de base de datos, media de eventos. Que "no configurado" se convierta en un silencio a nivel de servicio haría que una subida de imagen fallase **en silencio** en lugar de ruidosamente. El lanzamiento en `getClient()` es correcto; lo que es específico es que el listado de story videos sea **opcional**. Esa decisión pertenece a quien conoce la criticidad del dato, es decir a la ruta.

La guarda usa `config.useS3` (el flag que ya existe), no un `try/catch` alrededor de la llamada: un `catch` genérico volvería a colapsar "no configurado" con "roto", que es exactamente la distinción que este cambio introduce.

## Risks / Trade-offs

**[Se pierde señal real de errores en desarrollo]** → Aceptado y de bajo impacto: en local el desarrollador tiene la consola, el overlay de Next.js y los logs del contenedor delante en tiempo real. Además el escape hatch permite recuperarla en un comando. El riesgo inverso — un panel lleno de ruido donde un incidente real de producción pasa desapercibido — es el que estamos pagando hoy.

**[Un fallo del propio cableado de Sentry deja de detectarse en local]** → Mitigado por la Decisión 2: el SDK se sigue inicializando y todo el cableado (`setupExpressErrorHandler`, `onRequestError`, `onRouterTransitionStart`) se sigue ejecutando; sólo el transporte queda mudo. Un `TypeError` por una API mal usada seguiría apareciendo en la consola local.

**[Los story videos siguen sin verse en staging, ahora en silencio]** → Aceptado explícitamente. Era ya el comportamiento visible (el cliente devolvía `[]`); lo único que cambia es que deja de generar un 500. Se documenta en `CLAUDE.md` para que nadie lo diagnostique como una regresión dentro de seis meses.

**[Un despliegue de producción sin `AWS_S3_BUCKET` dejaría de avisar]** → Riesgo real pero acotado a esta ruta. Mitigación: emitir un `logger.warn` (una vez por petición, ya cubierto por el cache control de una hora) cuando se sirve la respuesta vacía por falta de configuración. El aviso queda en logs, que es donde corresponde un problema de configuración, no en el bug tracker.

**[Divergencia entre `config.sentry.enabled` e `instrument.js`]** → La duplicación de la Decisión 3 es necesaria pero puede desincronizarse. Mitigación: un test en `api/tests/` que afirme que ambos criterios coinciden para la matriz de entornos (`test` / `development` / `development + SENTRY_ENABLE_DEV` / `staging` / `production`), más comentarios cruzados en ambos ficheros.

**[Cambiar `tracesSampleRate` de 1 a 0.1 reduce datos de rendimiento del cliente]** → Intencionado. Si en algún momento se quiere el 100% en preproducción, basta con `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1` en el compose de staging — que sí requiere el ritual de cuatro sitios, por ser una variable con efecto en build.

## Migration Plan

1. **Despliegue de código.** Los cambios son puramente de configuración en tiempo de arranque; no hay migración de datos ni de esquema.
2. **Sin cambios de variables obligatorios.** `SENTRY_ENABLE_DEV` es opcional y sólo relevante en local. `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` es opcional y tiene default.
3. **Verificación en local:** arrancar la stack, provocar un error, confirmar que aparece en consola y **no** en Sentry. Repetir con `SENTRY_ENABLE_DEV=true` y confirmar lo contrario.
4. **Verificación en staging:** `curl https://api.pre.140d.art/api/stories/videos` debe devolver `200 {"videos":[]}`. Confirmar que `140D-API-1J` deja de recibir eventos nuevos.
5. **Cierre de issues en Sentry** (paso manual, tras confirmar 3 y 4): resolver los seis, con nota de causa.

**Rollback:** revertir el commit. No hay estado persistido que deshacer.

## Open Questions

- ¿Se quiere en algún momento que los story videos se sirvan en preproducción? Hoy la respuesta es no (sin credenciales AWS en un host self-hosted). Si cambiase, la guarda de `config.useS3` no estorba: basta con configurar el bucket.
- ¿Merece la pena mover los DSN a variables de entorno? Fuera de alcance aquí, pero es la limpieza natural siguiente si se decide separar proyectos de Sentry por entorno en lugar de usar el tag `environment`.
