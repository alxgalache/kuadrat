## Why

Las cuentas de los artistas se crearon antes del lanzamiento con contraseñas elegidas por el administrador, que él sigue conociendo. Con la galería ya en producción, cada artista debe pasar a una contraseña que solo él conozca, y el administrador necesita poder iniciar ese proceso sin llegar a ver ni fijar la contraseña resultante.

El flujo de activación que ya existe (`password_setup_token` → `/user-activation/[token]`) **no sirve** para esto: `authController.validateSetupToken` y `authController.setPassword` rechazan explícitamente toda cuenta cuyo `password_hash` no esté vacío (`api/controllers/authController.js:151` y `:212`). Ese rechazo es correcto y debe seguir existiendo — es lo que impide que un enlace de alta reabra una cuenta ya viva —, así que el restablecimiento necesita su propio mecanismo.

En paralelo, el administrador tampoco puede entrar hoy a un evento de la sección Live sin registrarse como un asistente más: `eventController.getViewerToken` exige `attendeeId` + `accessToken` de un registro real (`api/controllers/eventController.js:257`) y en eventos de pago exige además `status IN ('paid','joined')` (`:264`). No tiene sentido que el dueño de la plataforma pague por entrar a un evento organizado desde su propio panel.

## What Changes

### Restablecimiento de contraseña iniciado por el administrador

- Nueva acción de administrador que envía al artista un enlace de un solo uso para **fijar una contraseña nueva sin conocer la anterior**. El enlace viaja al email que el artista tiene en ese momento en `users.email`.
- El enlace caduca a las **24 horas** (más corto que las 48 h del alta: la cuenta ya está viva en producción) y queda invalidado en el primer uso.
- Mecanismo **independiente** del token de activación: columnas propias en `users`, y el token se guarda **hasheado** (SHA-256), de forma que un volcado de la base de datos no permita tomar ninguna cuenta. El token en claro solo existe dentro del email.
- Dos entradas en el panel: botón por artista y una acción de **envío masivo** a todos los artistas ya activados, pensada para la migración inicial.
- Nueva página pública `/restablecer-password/[token]`, gemela de `/user-activation/[token]` pero sin campo de contraseña anterior.
- Email nuevo (`sendPasswordResetEmail`) con la plantilla exacta de `api/services/emailService.js`, y aviso posterior al artista cuando su contraseña efectivamente cambia (`sendPasswordChangedEmail`).
- **BREAKING (para sesiones abiertas):** cambiar la contraseña — por este flujo o por el ya existente `PUT /api/seller/profile/password` — **invalida todos los JWT emitidos antes del cambio**. Nueva columna `users.password_changed_at` comprobada en la estrategia JWT de Passport. Sin esto, quien conociera la contraseña antigua y tuviera sesión abierta seguiría dentro hasta 7 días (`JWT_EXPIRES_IN`), que es exactamente el riesgo que motiva el cambio.

### Acceso directo del administrador a eventos

- Nuevo endpoint autenticado y restringido a `role === 'admin'` que crea (o reutiliza) la fila de asistente del administrador en el evento y le devuelve `{ attendeeId, accessToken }`, **saltándose el registro, la verificación por OTP y el pago**.
- El administrador entra **como un participante más**, no como host: recibe token de espectador (`subscriber` en Agora broadcast), sin controles de moderación de host y sin ocupar el `HOST_UID`.
- Nueva columna `event_attendees.is_staff`. El asistente-administrador queda excluido del contador público de asistentes, del abono al wallet del host y del detalle de liquidación del artista — hoy una fila `status='joined'` con `amount_paid = 0` generaría una línea de 0 € en el payout del artista (`api/controllers/stripeConnectPayoutsController.js:249`) y en su listado de ingresos (`api/routes/sellerRoutes.js:462`).
- La página del evento muestra al administrador un botón directo "Entrar como administrador" en lugar del modal de registro.

## Capabilities

### New Capabilities
- `admin-password-reset`: acción de administrador que envía a un artista (o a todos) un enlace caducable de un solo uso para fijar una contraseña nueva sin conocer la anterior, la página pública que consume ese enlace, y los emails asociados.
- `session-invalidation-on-password-change`: todo cambio de contraseña marca `users.password_changed_at` y la estrategia JWT rechaza los tokens emitidos con anterioridad, en todos los flujos que escriben `password_hash`.
- `admin-event-access`: acceso del administrador a cualquier evento de la sección Live como participante, sin registro ni pago, y marcado como staff a efectos de contadores y liquidaciones.

### Modified Capabilities
- `seller-profile`: `PUT /api/seller/profile/password` pasa a sellar `password_changed_at`, con lo que el mensaje que ya muestra hoy ("Inicia sesión de nuevo") deja de ser una recomendación y pasa a ser el comportamiento real del servidor.

## Impact

**Base de datos** (`api/config/database.js`, todo dentro de los `CREATE TABLE`, sin `ALTER TABLE`):
- `users`: `password_reset_token_hash`, `password_reset_token_expires`, `password_changed_at`.
- `event_attendees`: `is_staff`.
- Índice nuevo sobre `users(password_reset_token_hash)`.

**API:**
- `api/config/passport.js` — la estrategia JWT compara `jwtPayload.iat` contra `password_changed_at`.
- `api/controllers/authController.js` — validación y consumo del token de restablecimiento.
- `api/routes/authRoutes.js` — dos rutas públicas nuevas, con `sensitiveLimiter`.
- `api/routes/admin/authorRoutes.js` — envío individual y masivo.
- `api/routes/sellerRoutes.js` — el cambio de contraseña existente sella `password_changed_at`.
- `api/controllers/eventController.js` + `api/routes/eventRoutes.js` — endpoint de acceso de administrador.
- `api/services/eventService.js` — alta de asistente staff; `getAttendeeCount` excluye staff.
- `api/scheduler/eventCreditScheduler.js`, `api/controllers/stripeConnectPayoutsController.js`, `api/routes/sellerRoutes.js`, `api/services/invoiceService.js` — excluyen `is_staff = 1`.
- `api/services/emailService.js` — `sendPasswordResetEmail`, `sendPasswordChangedEmail`.
- `api/validators/` — esquemas Zod para las rutas nuevas.

**Cliente:**
- Página nueva `client/app/restablecer-password/[token]/page.js`.
- `client/app/admin/autores/page.js` y `client/app/admin/authors/[id]/page.js` — botones de envío.
- `client/app/live/[slug]/EventDetail.js` — atajo del administrador.
- `client/lib/api.js` — métodos nuevos en `authAPI`, `adminAPI.authors` y `eventsAPI`.

**Sin impacto en:** proveedor de pagos, Sendcloud, subastas, sorteos, catálogo. No se añaden variables de entorno ni dependencias nuevas.
