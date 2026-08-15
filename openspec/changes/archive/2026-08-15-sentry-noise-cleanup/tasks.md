## 1. Backend — gating de Sentry

- [x] 1.1 En `api/config/env.js`, añadir al bloque `sentry` el flag de habilitación: `enabled` = `nodeEnv !== 'test' && (nodeEnv !== 'development' || optionalBool('SENTRY_ENABLE_DEV', false))`. Comentar que la autoridad real es `instrument.js` y por qué el criterio está duplicado (ver design.md, Decisión 3).
- [x] 1.2 En `api/instrument.js`, mantener el `if (process.env.NODE_ENV !== 'test')` que envuelve el `require`/`init` (exclusión estructural, intocable) y añadir dentro de `Sentry.init()` la opción `enabled`, calculada leyendo `process.env` directamente. Documentar en un comentario por qué no se importa `config/env.js` desde aquí.
- [x] 1.3 Verificar a mano que el arranque con `NODE_ENV=development` **no** emite el warning `express is not instrumented` — confirma que `setupExpressErrorHandler` sigue operando sobre un SDK inicializado (design.md, Decisión 2).

## 2. Frontend — gating de Sentry en los tres runtimes

- [x] 2.1 Crear un módulo compartido (p. ej. `client/lib/sentryEnv.js`) que exporte `SENTRY_ENABLED` y `SENTRY_TRACES_SAMPLE_RATE`, aplicando el criterio de dev + escape hatch `NEXT_PUBLIC_SENTRY_ENABLE_DEV`. Evita triplicar la lógica en los tres ficheros de config.
- [x] 2.2 En `client/instrumentation-client.js`, pasar `enabled` y `tracesSampleRate` desde ese módulo. Mantener `replayIntegration()` y sus dos sample rates sin cambios.
- [x] 2.3 En `client/sentry.server.config.js`, aplicar lo mismo.
- [x] 2.4 En `client/sentry.edge.config.js`, aplicar lo mismo.
- [x] 2.5 Confirmar que `client/instrumentation.js` (el `register()` y el `onRequestError`) **no** necesita cambios: el cableado se mantiene y sólo el transporte queda desactivado.

## 3. Backend — degradación elegante de story videos

- [x] 3.1 En `api/routes/storiesRoutes.js`, insertar la guarda por `config.useS3` antes de llamar a `s3Service.listFiles('stories/')`: devolver `sendSuccess(res, { videos: [] })` con un `logger.warn` que indique que S3 no está configurado. No usar `try/catch` para esto (design.md, Decisión 6).
- [x] 3.2 Verificar que `api/services/s3Service.js` queda **sin tocar**: `getClient()` debe seguir lanzando cuando falta el bucket, porque otras rutas (subida de imágenes, backups) dependen de ese fallo ruidoso.
- [x] 3.3 Confirmar que `fetchStoryVideos` en `client/lib/api.js` no requiere cambios (ya devuelve `[]` ante `!res.ok` y ante excepción).

## 4. Tests

- [x] 4.1 Añadir un test que recorra la matriz de entornos (`test`, `development`, `development` + `SENTRY_ENABLE_DEV=true`, `staging`, `production`) y afirme el valor esperado de `config.sentry.enabled`.
- [x] 4.2 Añadir un test que afirme que el criterio de `config.sentry.enabled` y el de `instrument.js` coinciden para esa misma matriz, para que la duplicación deliberada no se desincronice (design.md, riesgo de divergencia).
- [x] 4.3 Añadir un test de integración de `GET /api/stories/videos` que, con `config.useS3` falso, espere `200` y `{ videos: [] }` sin que se instancie el cliente de S3.
- [x] 4.4 Añadir el caso complementario: con bucket configurado y `s3Service.listFiles` mockeado para rechazar, esperar `500`.
- [x] 4.5 Ejecutar la suite completa (`npm test` desde `api/`) y confirmar que `tests/testEnvironmentIsolation.test.js` sigue en verde — es la garantía de que el camino de test no se ha alterado.

## 5. Documentación de variables de entorno

- [x] 5.1 Documentar `SENTRY_ENABLE_DEV` en `api/.env.example`, junto a las `SENTRY_*` existentes, indicando que sólo tiene efecto bajo `NODE_ENV=development`.
- [x] 5.2 Documentar `NEXT_PUBLIC_SENTRY_ENABLE_DEV` en `client/.env.example` y en el `.env.example` raíz, con el comentario de por qué **no** se añade a `client/Dockerfile.staging` / `client/Dockerfile.prod` ni a los compose (design.md, Decisión 4).
- [x] 5.3 Documentar `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` en `client/.env.example` y en el `.env.example` raíz. Si se decide poder ajustarlo en staging/prod, aplicar el ritual completo de cuatro sitios que exige `CLAUDE.md`; si no, dejar constancia de que se queda en el default.
- [x] 5.4 Actualizar la sección "Environment Variables" de `CLAUDE.md`: nuevo grupo Sentry con el criterio de habilitación por entorno, el escape hatch, y la nota de que los story videos no se sirven en preproducción por decisión.

## 6. Verificación en entornos

- [x] 6.1 Local: arrancar la stack, provocar un error en cliente y en API, confirmar que aparecen en consola/logs y que **no** llega ningún evento nuevo a Sentry.
- [x] 6.2 Local: repetir con `SENTRY_ENABLE_DEV=true` + `NEXT_PUBLIC_SENTRY_ENABLE_DEV=true` y confirmar que los eventos **sí** llegan, con `environment: development`.
- [x] 6.3 Staging: tras desplegar, `curl https://api.pre.140d.art/api/stories/videos` debe devolver `200 {"videos":[]}`; confirmar que `140D-API-1J` deja de recibir eventos nuevos.
- [x] 6.4 Staging/producción: provocar (o esperar) un error real y confirmar que sigue llegando a Sentry con el `environment` correcto — el gating no debe haber afectado a estos entornos.

## 7. Higiene en Sentry (manual, tras verificar)

- [x] 7.1 Resolver `140D-CLIENT-1N`, `140D-CLIENT-1Q`, `140D-API-28`, `140D-API-29` y `140D-API-26` como no-defectos, dejando en cada una una nota indicando que son artefactos de HMR / reinicio de nodemon sobre ficheros a medio guardar, y que el entorno de desarrollo ya no reporta.
- [x] 7.2 Resolver `140D-API-1J` una vez confirmado en 6.3 que no recibe eventos nuevos.
- [x] 7.3 Opcional: revisar si hay alertas configuradas que incluyan `environment: development` y ajustarlas, ahora que ese entorno queda mudo.
