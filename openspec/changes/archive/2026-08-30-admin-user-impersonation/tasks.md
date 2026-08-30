## 1. Esquema de base de datos

- [x] 1.1 **[ALTO RIESGO — esquema compartido]** Añadir `CREATE TABLE IF NOT EXISTS impersonation_sessions` en `api/config/database.js`: `id` (PK autoincrement), `admin_user_id` y `target_user_id` (FK a `users`), `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `expires_at` DATETIME NOT NULL, `ended_at` DATETIME NULL, `ended_reason` TEXT NULL CHECK(`ended_reason` IN ('manual','expired')), `ip_address` TEXT NULL. Comentario en el `CREATE TABLE` explicando que las filas nunca se borran ni se sobrescriben y que `ended_at` NULL significa sesión abandonada, no sesión activa.
- [x] 1.2 Añadir los índices `idx_impersonation_admin` sobre `admin_user_id` e `idx_impersonation_target` sobre `target_user_id`, junto al resto de índices del fichero.
- [x] 1.3 Verificar que un arranque en limpio (`docker compose exec api npm test`, que recrea el esquema desde `initializeDatabase()`) crea la tabla sin errores y que un segundo arranque es idempotente.

## 2. Backend — emisión y verificación del token

- [x] 2.1 **[ALTO RIESGO — infraestructura de auth compartida]** En `api/config/passport.js`, poblar `req.impersonator = { id, email, sessionId }` cuando `jwtPayload.act` exista, mediante el segundo argumento de `done()`/`req` según corresponda a la estrategia. Un token sin `act` debe producir exactamente el mismo `req.user` que hoy y dejar `req.impersonator` como `undefined`. No tocar la comprobación de `isJwtIssuedBeforePasswordChange`, que sigue aplicándose contra el usuario objetivo.
- [x] 2.2 Crear `api/controllers/impersonationController.js` con la constante local `IMPERSONATION_TTL_MINUTES = 60` (con comentario explicando por qué NO se lee `JWT_EXPIRES_IN`) y los códigos máquina `IMPERSONATION_TARGET_FORBIDDEN`, `IMPERSONATION_TARGET_NOT_ACTIVATED`, `IMPERSONATION_NOT_ACTIVE`, `IMPERSONATION_ACTOR_INVALID`, `IMPERSONATION_ACTION_BLOCKED`, siguiendo el patrón de `RESET_ERRORS` en `authController.js`.
- [x] 2.3 Implementar `startImpersonation` en ese controlador: carga el objetivo, rechaza 404 / 403 `IMPERSONATION_TARGET_FORBIDDEN` (rol admin o uno mismo) / 400 `IMPERSONATION_TARGET_NOT_ACTIVATED` (`password_hash` vacío), inserta la fila de auditoría, firma el JWT con `{ id, email, role }` del objetivo más `act: { id, email, iat, sid }` del admin y `expiresIn` de 60 minutos, y responde con `sendSuccess()`. Nunca debe devolver ni registrar `password_hash`, `password_setup_token` ni `password_reset_token_hash`.
- [x] 2.4 Implementar `stopImpersonation`: 400 `IMPERSONATION_NOT_ACTIVE` si no hay `req.impersonator`; carga el admin de `act.id` y responde 403 `IMPERSONATION_ACTOR_INVALID` si ya no existe, ya no es `role='admin'`, o si `isJwtIssuedBeforePasswordChange(act.iat, admin.password_changed_at)` es cierto; cierra la fila de auditoría (`ended_at`, `ended_reason='manual'`) y firma un JWT de admin con el `JWT_EXPIRES_IN` estándar y sin claim `act`.
- [x] 2.5 Extraer a `api/utils/` (o reutilizar el helper existente si ya lo hay) el hash HMAC-SHA256 de IP con `IP_HASH_SALT`, el mismo tratamiento que usa `verification_events`, y aplicarlo al escribir `impersonation_sessions.ip_address`.
- [x] 2.6 Emitir `logger.info` con `{ adminUserId, targetUserId, sessionId }` tanto al iniciar como al terminar. Ninguna línea de log puede contener el token.

## 3. Backend — rutas y guardas

- [x] 3.1 Crear `api/routes/admin/impersonationRoutes.js` con `POST /:userId/start` y montarlo en `api/routes/admin/index.js` como `router.use('/impersonation', ...)`, de modo que hereda `authenticate` + `adminAuth` del índice.
- [x] 3.2 Añadir el esquema Zod de validación del parámetro `userId` en `api/validators/` y aplicarlo con `validate()` en la ruta, siguiendo el patrón del resto de rutas admin.
- [x] 3.3 Declarar `POST /impersonation/stop` en `api/routes/authRoutes.js` con `authenticate` (nunca `adminAuth`: llega con un token de seller) y `sensitiveLimiter`. Añadir un comentario explicando por qué esta ruta no puede vivir bajo `routes/admin/`.
- [x] 3.4 **[ALTO RIESGO — middleware compartido]** Añadir `blockWhileImpersonating` a `api/middleware/authorization.js`: rechaza con `ApiError(403, ..., 'IMPERSONATION_ACTION_BLOCKED')` cuando `req.impersonator` está definido, y no hace nada en caso contrario. Exportarlo desde el módulo.
- [x] 3.5 Aplicar `blockWhileImpersonating` **únicamente** a `PUT /profile/password` en `api/routes/sellerRoutes.js`, con un comentario que recoja las dos razones (toma de control permanente + autoinvalidación del token vía `password_changed_at`).
- [x] 3.6 En `api/app.js`, incluir el id del impersonador en el serializador `req` de `pino-http` cuando exista, de forma que toda petición hecha bajo impersonation nombre a su actor real. No alterar la salida de las peticiones normales.

## 4. Backend — tests

- [x] 4.1 Crear `api/tests/impersonation.test.js` cubriendo el arranque: éxito con seller activado (token emitido, `act` presente, expiración a 60 min, fila de auditoría con `ended_at` NULL, fila de `users` intacta), 403 sobre otro admin, 403 sobre uno mismo, 400 sobre cuenta sin activar, 401 para seller y para petición anónima.
- [x] 4.2 Tests del cierre: éxito (token de admin sin `act`, fila cerrada con `ended_reason='manual'`), 400 `IMPERSONATION_NOT_ACTIVE` con token normal, 403 `IMPERSONATION_ACTOR_INVALID` con admin degradado o borrado, y 403 cuando `act.iat` es anterior al `password_changed_at` del admin.
- [x] 4.3 Test de paridad: `GET /api/seller/products` con token de impersonation devuelve exactamente lo mismo que con el token propio del artista, y `GET` de cualquier ruta `/api/admin/*` con ese token devuelve 401.
- [x] 4.4 Test de no regresión sobre `passport.js`: un token emitido por `POST /api/auth/login` deja `req.impersonator` como `undefined` y resuelve `req.user` igual que antes del cambio.
- [x] 4.5 Test de la guarda: `PUT /api/seller/profile/password` con token de impersonation devuelve 403 `IMPERSONATION_ACTION_BLOCKED` y deja `password_hash` y `password_changed_at` sin tocar; con el token propio del artista sigue funcionando.
- [x] 4.6 Test estructural que falle si `blockWhileImpersonating` aparece aplicado a alguna ruta distinta de `PUT /profile/password`, o si algún fichero de `controllers/`, `routes/` o `services/` registra el token de impersonation en un log — mismo papel que `editionInventory.test.js` y `sendcloudAuth.test.js`.

## 5. Frontend — cliente de API y contexto

- [x] 5.1 Añadir a `client/lib/constants.js` la clave de `localStorage` del marcador de impersonation y los textos es-ES: aviso de la barra de navegación, textos del menú "Acciones", copia de los dos diálogos de confirmación (impersonar y contraseña) y el mapa `IMPERSONATION_ERRORS` con los códigos máquina del backend, siguiendo el patrón de `PASSWORD_RESET_ERRORS`.
- [x] 5.2 Añadir `authAPI.startImpersonation(userId)` y `authAPI.stopImpersonation()` en `client/lib/api.js`, que escriben `token`, `user` y el marcador de impersonation en `localStorage`.
- [x] 5.3 Extender el manejador global de 401 de `client/lib/api.js` para que borre también el marcador de impersonation junto a `token` y `user`.
- [x] 5.4 **[ALTO RIESGO — contexto compartido]** En `client/contexts/AuthContext.js`, exponer `impersonation` (null fuera de una sesión), `startImpersonation` y `stopImpersonation`. El marcador debe leerse dentro del `useEffect` de montaje, nunca en un inicializador de `useState`, por la restricción de hidratación que documenta `CLAUDE.md` para todo proveedor de `app/layout.js`. Ningún consumidor existente puede ver cambiar la forma de los valores que ya recibía.
- [x] 5.5 Verificar explícitamente que el token del admin no se escribe en `localStorage`, `sessionStorage` ni en ninguna cookie durante la impersonation.
- [x] 5.6 **[ALTO RIESGO — cliente de API compartido]** Parsear el cuerpo de la respuesta de forma defensiva en `apiRequest` (`client/lib/api.js`). Descubierto al verificar la caducidad: passport responde a un JWT inválido o caducado con un `Unauthorized` en texto plano, y `await response.json()` lanzaba **antes** del bloque `if (!response.ok)`, de modo que el manejador global de 401 nunca llegaba a ejecutarse y la sesión caducada se quedaba en `localStorage`. Defecto preexistente, pero el requisito «Impersonation token expires» depende de ese manejador. Una respuesta 2xx con cuerpo no parseable debe seguir lanzando igual que antes.

## 6. Frontend — barra de navegación

- [x] 6.1 En `client/components/Navbar.js`, renderizar el control de salida a la derecha del carrito cuando `impersonation` no sea null, identificando al artista impersonado. Usar un icono de `@heroicons/react/24/outline` coherente con los existentes.
- [x] 6.2 Añadir la misma acción al menú móvil (`DialogPanel`), donde la barra de escritorio no está disponible.
- [x] 6.3 Cablear la acción a `stopImpersonation`, navegando a `/admin/autores` al terminar; si el backend responde `IMPERSONATION_ACTOR_INVALID`, limpiar la sesión por completo y llevar al login.
- [x] 6.4 Comprobar que sin impersonation activa la barra de navegación se renderiza exactamente igual que antes del cambio, tanto autenticado como anónimo.

## 7. Frontend — pantalla de autores

- [x] 7.1 En `client/app/admin/autores/page.js`, sustituir la fila de botones de cada tarjeta por un único botón "Acciones" que abre un `Menu` de Headless UI. Artista activado: "Ver", "Editar", "Contraseña", "Impersonar". Artista pendiente: "Ver" y "Reenviar".
- [x] 7.2 Añadir el diálogo de confirmación de "Contraseña" reutilizando `client/components/ConfirmDialog.js`, nombrando al artista y advirtiendo de que cualquier enlace enviado anteriormente dejará de funcionar. La petición solo se emite tras confirmar.
- [x] 7.3 Añadir el diálogo de confirmación de "Impersonar", nombrando al artista y declarando el límite de 60 minutos; al confirmar, llamar a `startImpersonation` y navegar a `/galeria`.
- [x] 7.4 Mostrar los errores del backend a través de `showApiError`, traduciendo los códigos máquina con el mapa de `constants.js`.

## 8. Verificación de extremo a extremo

- [x] 8.1 En local, impersonar a un artista y recorrer sus pantallas (`/seller/profile`, `/seller/products`, `/seller/pedidos`, `/orders`), comprobando que muestran sus datos y que la barra de navegación presenta el menú de vendedor, no el de administrador.
- [x] 8.2 Comprobar que durante la impersonation ninguna ruta `/admin/*` es accesible y que `AuthGuard` redirige como lo haría con un vendedor real.
- [x] 8.3 Recargar la página y reabrir la pestaña a mitad de sesión: la impersonation sigue activa y el control de salida sigue visible.
- [x] 8.4 Terminar la impersonation y comprobar que vuelven el rol, el menú y las pantallas de administrador, y que la fila de `impersonation_sessions` queda cerrada con `ended_reason='manual'`.
- [x] 8.5 Forzar la caducidad (token de prueba con TTL corto) y comprobar que la aplicación limpia la sesión y aterriza deslogueada en la home, sin quedarse afirmando una impersonation inexistente.
- [x] 8.6 Ejecutar la suite completa del backend (`docker compose exec api npm test`) y confirmar que `testEnvironmentIsolation.test.js`, `passwordChangeInvalidation.test.js` y `adminPasswordReset.test.js` siguen en verde.
- [x] 8.7 Ejecutar `docker compose exec -e NODE_ENV=production client npm run build` y confirmar que la compilación de producción pasa y que ninguna ruta cambia de estático a dinámico en la tabla de rutas.
