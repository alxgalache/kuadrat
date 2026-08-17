## 1. Esquema de base de datos

- [x] 1.1 En `api/config/database.js`, añadir al `CREATE TABLE users` las columnas `password_reset_token_hash TEXT DEFAULT NULL`, `password_reset_token_expires DATETIME DEFAULT NULL` y `password_changed_at DATETIME DEFAULT NULL`, junto a las de `password_setup_token`
- [x] 1.2 En el mismo fichero, añadir al `CREATE TABLE event_attendees` la columna `is_staff INTEGER NOT NULL DEFAULT 0`, con un comentario que recuerde filtrarla en toda consulta de contadores o liquidación
- [x] 1.3 Añadir las cuatro líneas `safeAlter` correspondientes al bloque de migraciones (las tablas ya existen en producción, así que el `CREATE TABLE` por sí solo no las crearía allí)
- [x] 1.4 Añadir `CREATE INDEX IF NOT EXISTS idx_users_password_reset_token_hash ON users(password_reset_token_hash)` junto al índice existente de `password_setup_token`
- [x] 1.5 Arrancar la api en local y verificar que las cuatro columnas existen (`PRAGMA table_info`) y que un segundo arranque no falla

## 2. Invalidación de sesiones

- [x] 2.1 En `api/config/passport.js`, dentro de la estrategia JWT y sin añadir consultas, rechazar el token cuando `user.password_changed_at` existe y `jwtPayload.iat < floor(Date.parse(password_changed_at + 'Z') / 1000)`; comparación estricta y normalización a UTC explícita
- [x] 2.2 En `api/routes/sellerRoutes.js:48` (`PUT /profile/password`), escribir `password_changed_at = CURRENT_TIMESTAMP` en la misma sentencia que `password_hash`
- [x] 2.3 En `api/controllers/authController.js` (`setPassword`, flujo de alta), añadir `password_changed_at = CURRENT_TIMESTAMP` a la sentencia que fija la contraseña
- [x] 2.4 Crear `api/tests/passwordChangeInvalidation.test.js`: JWT anterior al cambio → 401; JWT posterior → 200; JWT del mismo segundo → 200; `password_changed_at` NULL → 200
- [x] 2.5 Añadir a ese test un caso que fuerce `process.env.TZ` a una zona distinta de UTC y compruebe que el veredicto no cambia
- [x] 2.6 Crear el test de regresión que recorre `api/controllers/`, `api/routes/` y `api/services/` y falla si algún `UPDATE users` que asigna `password_hash` no asigna `password_changed_at` (mismo patrón que `api/tests/editionInventory.test.js`)

## 3. API — restablecimiento de contraseña

- [x] 3.1 En `api/services/emailService.js`, añadir `sendPasswordResetEmail({ email, fullName, token, expiresIn })` clonando la estructura HTML, estilos, logo y footer de `sendPasswordSetupEmail`, apuntando a `${CLIENT_URL}/restablecer-password/<token>`; devolver `{ success: false }` en error, nunca lanzar
- [x] 3.2 Añadir `sendPasswordChangedEmail({ email, fullName })` con la misma plantilla, avisando del cambio e indicando contactar con la galería si no fue el artista
- [x] 3.3 Exportar ambas en `module.exports` de `emailService.js`
- [x] 3.4 En `api/controllers/authController.js`, añadir el helper de hash del token (`sha256`) y las constantes de los códigos de error `RESET_TOKEN_INVALID`, `RESET_TOKEN_EXPIRED`, `RESET_PASSWORD_WEAK`
- [x] 3.5 Implementar `validateResetToken` (`GET /api/auth/validate-reset-token/:token`): caducidad comprobada en SQL, segunda consulta solo si la primera no devuelve nada para distinguir 410 de 404, respuesta con `full_name` únicamente
- [x] 3.6 Implementar `resetPassword` (`POST /api/auth/reset-password`): reutilizar `validatePassword`, comprobar coincidencia, y escribir con el `UPDATE` condicionado por `password_reset_token_hash` que fija `password_hash` + `password_changed_at` y limpia las dos columnas del token; `rowsAffected = 0` → 404
- [x] 3.7 Disparar `sendPasswordChangedEmail` sin bloquear la respuesta (`.catch` a `logger.warn`) y **no** devolver JWT ni usuario
- [x] 3.8 Crear `api/validators/passwordResetSchemas.js` con el esquema Zod de `POST /api/auth/reset-password`
- [x] 3.9 Registrar ambas rutas en `api/routes/authRoutes.js` con `sensitiveLimiter` y `validate()`, y exportar los nuevos controladores
- [x] 3.10 En `api/routes/sellerRoutes.js`, disparar también `sendPasswordChangedEmail` tras un cambio propio correcto

## 4. API — acciones de administrador

- [x] 4.1 En `api/routes/admin/authorRoutes.js`, añadir `RESET_TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000` y un helper que genere el token, calcule la caducidad en formato UTC compatible con `CURRENT_TIMESTAMP` y guarde solo el hash
- [x] 4.2 Implementar `POST /:id/send-password-reset`: 404 si no es `role = 'seller'`, 400 si `password_hash` está vacío, emitir token, enviar email, responder sin el token
- [x] 4.3 Implementar `POST /send-password-reset-all` **antes** de las rutas `/:id` en el router (si no, `send-password-reset-all` se resolvería como un `:id`); recorrer los sellers activados en serie, contabilizar `{ sent, failed, total }` y devolver los emails fallidos; responder 200 aunque haya fallos
- [x] 4.4 Verificar que ninguna respuesta ni ninguna línea de log contiene el token en claro
- [x] 4.5 Crear `api/tests/adminPasswordReset.test.js`: envío individual escribe solo el hash; artista sin activar rechazado; segundo envío invalida el primer enlace; enlace válido fija la contraseña; reutilización devuelve 404; enlace caducado devuelve 410; contraseña débil devuelve 400 y deja el token vivo; no-admin recibe 401
- [x] 4.6 Añadir a ese test la comprobación de que el flujo de alta (`validate-setup-token` / `set-password`) sigue rechazando una cuenta ya configurada tras emitir un token de restablecimiento

## 5. API — acceso del administrador a eventos

- [x] 5.1 En `api/services/eventService.js`, añadir `createOrGetStaffAttendee(eventId, { email, fullName })`: busca por `(event_id, email)`, crea si falta con `is_staff = 1`, `email_verified = 1`, `status = 'registered'`, y en ambos casos regenera `access_token_hash` devolviendo el token en claro
- [x] 5.2 En el mismo fichero, añadir `AND is_staff = 0` a `getAttendeeCount`
- [x] 5.3 Exportar `createOrGetStaffAttendee` y verificar que `listAttendees` **no** filtra staff (el panel de administración debe verlo)
- [x] 5.4 En `api/controllers/eventController.js`, implementar `getAdminAccess` (`POST /api/events/:id/admin-access`): exige `req.user.role === 'admin'`, 404 si el evento no existe, devuelve `{ attendeeId, accessToken }`
- [x] 5.5 Registrar la ruta en `api/routes/eventRoutes.js` con `authenticate`
- [x] 5.6 En `getViewerToken`, `renewToken`, `getWhiteboardToken` y `getVideoToken`, saltar la comprobación `status IN ('paid','joined')` cuando `attendee.is_staff === 1`, dejando intactas las de evento activo, sala disponible y baneos
- [x] 5.7 Verificar que `getHostToken` sigue exigiendo `req.user.id === event.host_user_id` y que el administrador recibe uid de asistente, nunca `HOST_UID`
- [x] 5.8 En `api/scheduler/eventCreditScheduler.js`, añadir `AND is_staff = 0` a `loadUncreditedAttendees`
- [x] 5.9 En `api/controllers/stripeConnectPayoutsController.js:249` y `api/routes/sellerRoutes.js:462`, excluir `is_staff = 1`
- [x] 5.10 En `api/services/invoiceService.js` (`generateEventAttendeeInvoice`), rechazar con 400 un asistente con `is_staff = 1` antes de asignar número de factura
- [x] 5.12 Arreglar `api/routes/sellerRoutes.js:491`, que mapea el UUID de texto `events.id` con `Number()` y devuelve `id: null` en todas las filas de `/api/seller/paid-events` (el cliente monta `<tr key={null}>`). Defecto preexistente, encontrado al escribir 5.11 y aprobado para arreglar en este cambio
- [x] 5.11 Crear `api/tests/adminEventAccess.test.js`: admin entra en evento de pago sin pagar; no-admin recibe 403; sin JWT recibe 401; dos llamadas reutilizan la fila; el contador público excluye al staff; el scheduler de crédito no genera línea; la factura se rechaza; el baneo por email/IP sigue aplicando al staff

## 6. Cliente — restablecimiento de contraseña

- [x] 6.1 En `client/lib/constants.js`, añadir el mapa de textos es-ES para `RESET_TOKEN_INVALID`, `RESET_TOKEN_EXPIRED` y `RESET_PASSWORD_WEAK`
- [x] 6.2 En `client/lib/api.js`, añadir `authAPI.validateResetToken(token)` y `authAPI.resetPassword(token, password, confirmPassword)` con `skipAuthHandling: true`, sin guardar nada en `localStorage`
- [x] 6.3 Añadir `adminAPI.authors.sendPasswordReset(id)` y `adminAPI.authors.sendPasswordResetAll()`
- [x] 6.4 Crear `client/app/restablecer-password/[token]/page.js` partiendo de `client/app/user-activation/[token]/page.js`: mismo medidor de fuerza y misma lista de requisitos, **sin** campo de contraseña anterior, resolviendo los errores por código y no por texto
- [x] 6.5 En el estado de éxito, no guardar JWT y dirigir al inicio de sesión en vez de a la portada

## 7. Cliente — panel de administración

- [x] 7.1 En `client/app/admin/autores/page.js`, añadir a las tarjetas de artistas con `is_activated` la acción "Restablecer contraseña" (donde hoy va "Editar" solo para pendientes se muestra "Reenviar"), sin quitar el acceso a "Editar"
- [x] 7.2 Añadir en la cabecera el botón "Enviar a todos" con `ConfirmDialog` que advierta explícitamente de que los enlaces enviados anteriormente dejarán de funcionar
- [x] 7.3 Mostrar el resultado del envío masivo con `useNotification`, incluyendo enviados, fallidos y la lista de emails fallidos
- [x] 7.4 Añadir la acción individual también en la ficha `client/app/admin/authors/[id]/page.js`

## 8. Cliente — acceso del administrador al evento

- [x] 8.1 En `client/lib/api.js`, añadir `eventsAPI.getAdminAccess(eventId)`
- [x] 8.2 En `client/app/live/[slug]/EventDetail.js`, calcular `canUseAdminShortcut` (`user?.role === 'admin' && !isHost && !hasAccess`) y renderizar "Entrar como administrador" en lugar del botón "Acceder"
- [x] 8.3 Implementar el manejador: llamar al endpoint, escribir la sesión en `localStorage` bajo `event_attendee_{eventId}` con la misma forma que produce `EventAccessModal`, y activar `hasAccess` para que el resto del flujo (auto-conexión, chat, token de vídeo) siga sin cambios
- [x] 8.4 Verificar que el atajo aparece igual en eventos gratuitos y de pago, y en formatos `live` y `video`
- [x] 8.5 Verificar que el administrador entra sin controles de host y que un visitante anónimo, comprador o vendedor nunca ve el botón

## 9. Verificación y despliegue

- [x] 9.1 Ejecutar `npm test` en `api/` y comprobar que pasa la suite completa, incluida `testEnvironmentIsolation.test.js`
- [x] 9.2 Prueba manual del restablecimiento de punta a punta con un artista de prueba: botón → email → enlace → contraseña nueva → inicio de sesión correcto → la sesión antigua devuelve 401
- [x] 9.3 Prueba manual del acceso del administrador en un evento de pago activo: entra sin pagar, aparece en la lista de asistentes del panel con `is_staff = 1`, no suma en el contador público
- [x] 9.4 Revisar el aspecto de los dos emails nuevos en un cliente de correo real, comparándolos con el email de alta
- [x] 9.5 Desplegar api y cliente juntos con `./deploy/deploy.sh` (el email apunta a una ruta del cliente: desplegar solo la api dejaría los enlaces en 404)
- [x] 9.6 Tras el despliegue, confirmar que ninguna sesión existente se ha caído (`password_changed_at` NULL en todas las filas) antes de lanzar el envío masivo
- [x] 9.7 Lanzar el envío masivo y reenviar individualmente a los artistas que aparezcan en la lista de fallidos
- [x] 9.8 Actualizar `CLAUDE.md` con una sección sobre la invalidación de sesiones (`password_changed_at` se escribe siempre junto a `password_hash`) y sobre `event_attendees.is_staff` y las cinco consultas que deben excluirlo
