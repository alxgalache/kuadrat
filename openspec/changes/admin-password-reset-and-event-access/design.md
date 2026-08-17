## Context

Dos cambios independientes que comparten un mismo hilo: el administrador necesita poder actuar sobre cuentas ajenas sin suplantarlas.

**Estado actual — contraseñas.** Existe un flujo de alta completo y funcional: `POST /api/admin/authors` genera un `password_setup_token` (32 bytes hex, **en claro** en `users.password_setup_token`), lo envía con `sendPasswordSetupEmail` y el artista lo consume en `/user-activation/[token]`, que llama a `GET /api/auth/validate-setup-token/:token` y `POST /api/auth/set-password`. Existe también `POST /api/admin/authors/:id/resend-invitation`, que regenera el token. Los tres puntos de entrada comprueban lo mismo antes de dejar pasar:

```js
if (user.password_hash && user.password_hash.length > 0) {
  throw new ApiError(400, 'La contraseña ya ha sido configurada para esta cuenta', ...)
}
```

Esa comprobación aparece en `authController.js:151` (validate), `authController.js:212` (set) y `authorRoutes.js:269` (resend). Es la barrera que impide que un enlace de alta filtrado reabra una cuenta en producción, y **no se toca**.

El artista autenticado sí puede cambiar su contraseña: `PUT /api/seller/profile/password` (`api/routes/sellerRoutes.js:48`), que exige `currentPassword` y lo verifica con `bcrypt.compare`. Es exactamente lo que un artista que no conoce su contraseña actual no puede usar.

**Estado actual — eventos.** `EventDetail.js` decide qué mostrar con dos banderas: `hasAccess` (hay sesión de asistente en `localStorage`, clave `event_attendee_{eventId}`) e `isHost` (`user.id === event.host_user_id`). Sin ninguna de las dos, el único camino es el botón "Acceder", que abre `EventAccessModal` con sus seis fases (CHOOSE → REGISTER → VERIFY_EMAIL → PAYMENT → SUCCESS, o CHOOSE → VERIFY_PASSWORD). En el servidor, `getViewerToken` (`eventController.js:239`) exige `attendeeId` + `accessToken`, resuelve el asistente por hash del token (`eventService.getAttendeeByAccessToken`) y, si `access_type === 'paid'`, exige `status IN ('paid','joined')`.

Hay ya una incoherencia en el código: `renewToken` (`eventController.js:481`) acepta `decoded.role === 'admin'` en su rama de host — el administrador puede renovar un token de host que por `getHostToken` (`:355`, que exige `req.user.id === event.host_user_id`) nunca ha podido obtener. Es código muerto hoy.

## Goals / Non-Goals

**Goals:**
- Que el administrador pueda disparar, por artista o para todos a la vez, un enlace caducable de un solo uso con el que el artista fija una contraseña nueva sin conocer la anterior.
- Que el administrador nunca vea ni pueda fijar la contraseña resultante.
- Que un cambio de contraseña expulse de verdad a las sesiones abiertas con la contraseña antigua.
- Que el administrador entre a cualquier evento Live sin registrarse ni pagar, como participante normal.
- Que esa entrada no contamine contadores públicos, liquidaciones ni facturación.

**Non-Goals:**
- **No** se añade "he olvidado mi contraseña" autoservicio para artistas. El disparador es siempre el administrador. Un endpoint público de recuperación es una superficie de enumeración de emails que no hace falta abrir para resolver esto.
- **No** se toca el flujo de activación existente ni sus columnas. Convive intacto.
- **No** se da al administrador rol de host en los eventos (publicar vídeo, moderar, terminar el evento). Entra como espectador. Convertir al administrador en co-host es otra funcionalidad.
- **No** se unifican los dos botones del panel de autores. "Reenviar" (cuenta pendiente) y "Restablecer contraseña" (cuenta activada) son estados excluyentes y siguen siéndolo.
- **No** se cambia `JWT_EXPIRES_IN` ni se introduce una lista de revocación de tokens.

## Decisions

### 1. Mecanismo de restablecimiento separado del de activación, con token hasheado

Se añaden a `users` columnas propias: `password_reset_token_hash`, `password_reset_token_expires`. **No** se reutilizan `password_setup_token` / `password_setup_token_expires`.

*Por qué separado:* reutilizarlas obligaría a relajar la comprobación de `password_hash` no vacío en `validateSetupToken` y `setPassword`, que es justo lo que protege el alta. Un enlace de alta antiguo, filtrado en un buzón, volvería a ser válido contra una cuenta viva. Además `is_activated` en el panel se deriva de `password_hash` (`authorRoutes.js:181`) y `resend-invitation` se apoya en la misma señal; tocarla arrastraría los tres sitios.

*Por qué hasheado (SHA-256, no bcrypt):* el token de alta se guarda en claro, y eso significa que quien lea la tabla `users` puede tomar cualquier cuenta pendiente. Aquí el listón es más alto: hablamos de cuentas de artistas ya activas en producción, y la base de datos se vuelca a diario a S3 (`dbDumpService.js`). Guardando solo `sha256(token)` un volcado no vale para nada. SHA-256 y no bcrypt porque el token ya son 256 bits de entropía criptográfica: no hay diccionario que atacar y no se necesita coste de derivación. Es el mismo criterio que ya sigue `event_attendees.access_token_hash` (`eventService.hashAccessToken`).

*Alternativa descartada — tabla `password_reset_tokens` aparte:* permitiría varios tokens vivos y un historial auditable, pero un artista solo necesita un enlace válido a la vez y el volumen es de decenas de filas al año. Dos columnas en `users` dan la invariante "un enlace vivo por cuenta" gratis: emitir uno nuevo pisa el anterior.

*Caducidad:* 24 h, constante local `RESET_TOKEN_EXPIRATION_MS` en `authorRoutes.js`, independiente de `TOKEN_EXPIRATION_MS` (48 h) del alta. Son ventanas distintas porque el riesgo es distinto, y acoplarlas haría que cambiar una moviera la otra sin querer.

*Consumo:* el `UPDATE` que escribe `password_hash` limpia el token en la misma sentencia y va condicionado por el hash, de forma que dos peticiones simultáneas con el mismo enlace no puedan fijar dos contraseñas distintas:

```sql
UPDATE users
   SET password_hash = ?, password_changed_at = ?,
       password_reset_token_hash = NULL, password_reset_token_expires = NULL
 WHERE id = ? AND password_reset_token_hash = ?
```

`rowsAffected = 0` significa que el enlace ya se gastó → 404, no 500.

### 2. La caducidad se comprueba en SQL, no en JavaScript

`WHERE password_reset_token_hash = ? AND password_reset_token_expires > CURRENT_TIMESTAMP`. El flujo de alta lo hace en JS (`new Date(...)` + `Date.now()`, `authController.js:145`), lo que depende de que el `DATETIME` almacenado sea interpretable por el constructor `Date` de Node — cierto para los ISO strings que escribe `authorRoutes.js`, pero frágil frente al `CURRENT_TIMESTAMP` de SQLite (`YYYY-MM-DD HH:MM:SS`, sin zona, que `Date` interpreta como hora **local**). Comparando dentro de SQLite ambos lados hablan el mismo dialecto. Se escribirá `password_reset_token_expires` con el mismo formato que produce `CURRENT_TIMESTAMP` (UTC).

Consecuencia deliberada: un enlace caducado y uno inexistente se vuelven indistinguibles en la consulta. Se resuelve con una segunda consulta **solo cuando la primera no encuentra nada**, para poder devolver 410 ("caducado", con instrucción de pedir otro al administrador) en vez de 404. La distinción importa: es la diferencia entre "escribe al administrador" y "este enlace nunca existió".

### 3. `password_changed_at` en `users`, comprobado en la estrategia JWT

Los JWT son apátridas y viven 7 días (`JWT_EXPIRES_IN`). Sin nada más, un artista puede cambiar su contraseña y quien tuviera sesión abierta con la antigua sigue dentro una semana — precisamente el escenario que motiva esta migración.

`api/config/passport.js` ya carga el usuario completo (`SELECT * FROM users WHERE id = ?`) en cada petición autenticada, así que la comprobación no añade ninguna consulta:

```js
if (user.password_changed_at) {
  const changedAtSec = Math.floor(new Date(user.password_changed_at + 'Z').getTime() / 1000);
  if (jwtPayload.iat < changedAtSec) return done(null, false);
}
```

Se compara en **segundos** porque `iat` es en segundos. El estricto `<` (y no `<=`) es lo que evita expulsar al usuario que inicia sesión dentro del mismo segundo en que cambió su contraseña.

*Todos los caminos que escriben `password_hash` deben sellar la columna*, o el mecanismo tiene agujeros según por dónde se entre. Son tres: el restablecimiento nuevo, `PUT /api/seller/profile/password` y el `setPassword` del alta. En el alta la columna se escribe por consistencia aunque no pueda haber sesiones previas (`password_hash` estaba vacío). Un test de regresión hará grep sobre `controllers/`, `routes/` y `services/` y fallará si algún `UPDATE users ... SET password_hash` no toca `password_changed_at` en la misma sentencia — mismo patrón que `api/tests/editionInventory.test.js` con `is_sold` / `editions_sold`.

*Efecto colateral aceptado:* el artista que cambia su contraseña desde su propio perfil queda desconectado en esa misma pestaña. El cliente ya anuncia hoy "Tu contraseña ha sido actualizada. Inicia sesión de nuevo." (`openspec/specs/seller-profile/spec.md:65`), así que el mensaje deja de ser un consejo y pasa a describir la realidad.

*Alternativa descartada — invalidar solo en el restablecimiento:* dejaría `PUT /api/seller/profile/password` como puerta trasera: cambiar la contraseña sin cerrar sesiones no protege de nada si el atacante ya está dentro.

### 4. El restablecimiento no inicia sesión automáticamente

`setPassword` (alta) devuelve un JWT y entra directo. El restablecimiento **no**: responde 200 y la página redirige a la pantalla de acceso.

Son situaciones distintas. En el alta, quien abre el enlace es por definición quien recibe el email y no tiene forma de entrar de otro modo. En un restablecimiento la cuenta ya existe y puede estar en disputa; devolver una sesión convertiría el acceso al buzón en acceso inmediato sin un solo dato más. Forzar el inicio de sesión también hace que el artista teclee la contraseña nueva una tercera vez, que es cuando se aprende. Y encaja con la decisión 3: la sesión que se emitiera aquí sería la única superviviente de un `password_changed_at` recién estampado, una excepción que habría que razonar.

### 5. Envío masivo: síncrono, secuencial y solo a cuentas activadas

`POST /api/admin/authors/send-password-reset-all` recorre los `role = 'seller'` con `password_hash` no vacío, genera un token por cada uno y envía los emails **en serie**, devolviendo `{ sent, failed, total }` y la lista de emails fallidos.

*Por qué solo activados:* un artista con `password_hash` vacío no tiene contraseña que restablecer; lo suyo es "Reenviar invitación". Mezclarlos le mandaría dos emails contradictorios.

*Por qué en serie y no `Promise.all`:* son decenas de destinatarios, el proveedor SMTP tiene límites de ritmo y un fallo parcial debe ser legible artista por artista. `Promise.all` además abortaría al primer rechazo dejando a la mitad de los artistas con token nuevo emitido y sin email — el peor estado posible, porque el token viejo ya no vale.

*Idempotencia:* volver a lanzarlo regenera todos los tokens y **invalida los enlaces anteriores**. Es el comportamiento correcto (un enlace vivo por cuenta) pero hay que anunciarlo en el diálogo de confirmación, porque un doble clic deja inservibles los enlaces que los artistas ya tuvieran abiertos.

*Sin transacción:* enviar un email no es reversible, así que envolver el lote en `createBatch()` daría una falsa sensación de atomicidad. Cada artista se resuelve por su cuenta y se contabiliza.

### 6. Acceso del administrador a eventos: una fila de asistente real, no un camino paralelo

`POST /api/events/:id/admin-access` (autenticado, `role === 'admin'`) busca o crea la fila del administrador en `event_attendees` con su `users.email` y su `full_name`, la marca `is_staff = 1`, emite un `accessToken` nuevo y lo devuelve. El cliente lo guarda en `event_attendee_{eventId}`, exactamente igual que si viniera del modal.

*Por qué así y no un bypass en `getViewerToken`:* la identidad de asistente es la moneda de todo lo que viene después. `getViewerToken` la usa para el UID de Agora (`ensureAttendeeUid`), para el rol publisher/subscriber, para `updateAttendeeStatus`, y `renewToken`, `getWhiteboardToken`, `getVideoToken`, `report-spam` y la sala autenticada de Socket.IO la vuelven a pedir. Un administrador sin fila de asistente tendría que llevar una excepción a cada uno de esos ocho puntos, y cada excepción es un sitio donde el comportamiento puede divergir. Con una fila real hay **un solo** punto nuevo y todo lo demás funciona sin enterarse.

*Un token nuevo en cada llamada* (se sobrescribe `access_token_hash`), igual que hace `verifyAttendeePassword` para los asistentes que vuelven. Evita tener que leer un token que solo existe hasheado.

*Estado:* se crea con `status = 'registered'` y `email_verified = 1` (la identidad ya está probada por el JWT). En eventos de pago, la comprobación `status IN ('paid','joined')` de `getViewerToken` se salta cuando `attendee.is_staff === 1`. Se prefiere esto a escribir `status = 'paid'` con `amount_paid = 0`: un estado "pagado" que no corresponde a ningún cobro es una mentira en la tabla, y la tabla la leen la facturación y las liquidaciones.

*El administrador no hereda poderes de host.* `isHost` en el cliente sigue siendo `user.id === event.host_user_id`, y `getHostToken` sigue exigiendo lo mismo. En Agora broadcast el administrador entra como `subscriber`; en meeting mode como `publisher`, igual que cualquier asistente, porque ahí publica todo el mundo.

*Nota:* la rama `decoded.role !== 'admin'` de `renewToken` (`eventController.js:481`) deja de ser código muerto solo si el administrador tuviera token de host, cosa que sigue sin pasar. Se deja como está — es una decisión de otro cambio, y tocarla aquí ampliaría el alcance sin motivo.

### 7. `is_staff` excluye al administrador de cuatro consultas, y solo de esas

| Consulta | Fichero | Efecto sin el filtro |
|---|---|---|
| `getAttendeeCount` | `eventService.js:254` | El administrador suma al contador público "N asistentes" |
| `loadUncreditedAttendees` | `eventCreditScheduler.js:58` | Línea de 0 € abonada al wallet del host |
| Detalle de liquidación | `stripeConnectPayoutsController.js:249` | Línea de 0 € en el payout que ve el artista |
| Ingresos por evento del vendedor | `sellerRoutes.js:462` | Un asistente de más en su panel |

`generateEventAttendeeInvoice` (`invoiceService.js:271`) no necesita filtro: ya rechaza cualquier asistente cuyo `status` no sea `paid`/`joined`, y el administrador se queda en `registered`. Se añade de todos modos un rechazo explícito por `is_staff`, porque si algún día el administrador acabara en `joined` la factura de 0 € consumiría un número de la serie P — y los números de factura no se reciclan.

`listAttendees` (panel de administración) **no** se filtra: ahí es información útil saber que el administrador estuvo dentro.

### 8. Columnas nuevas: en el `CREATE TABLE` **y** en el bloque `safeAlter`

`api/config/database.js` es idempotente y se ejecuta en cada arranque, pero `CREATE TABLE IF NOT EXISTS` no altera una tabla que ya existe. La producción tiene las tablas creadas, así que una columna nueva declarada solo en el `CREATE TABLE` nunca aparecería allí. El patrón ya establecido en el fichero es escribirla en los dos sitios — `event_attendees.access_password` está en el `CREATE TABLE` (línea 612) y en `safeAlter` (línea 739), y son 92 líneas de `safeAlter` con la misma lógica.

Las cinco líneas nuevas:

```js
await safeAlter("ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT DEFAULT NULL");
await safeAlter("ALTER TABLE users ADD COLUMN password_reset_token_expires DATETIME DEFAULT NULL");
await safeAlter("ALTER TABLE users ADD COLUMN password_changed_at DATETIME DEFAULT NULL");
await safeAlter("ALTER TABLE event_attendees ADD COLUMN is_staff INTEGER NOT NULL DEFAULT 0");
```

Más `CREATE INDEX IF NOT EXISTS idx_users_password_reset_token_hash ON users(password_reset_token_hash)`, junto al índice ya existente de `password_setup_token`.

`password_changed_at` arranca en `NULL` para todo el mundo, y `NULL` significa "no invalides nada". Es lo que hace que desplegar esto no eche a nadie de su sesión.

### 9. Límite de ritmo y fuga de información en los endpoints públicos

Las dos rutas públicas (`GET /api/auth/validate-reset-token/:token`, `POST /api/auth/reset-password`) llevan `sensitiveLimiter`, el mismo que usan las rutas de verificación de eventos. Un token de 32 bytes no es adivinable por fuerza bruta, pero el limitador convierte el intento en ruido registrado en vez de en tráfico.

Ninguna de las dos respuestas incluye el email completo del artista: `validate-reset-token` devuelve solo `full_name`, lo justo para que la página salude por su nombre. Devolver el email convertiría un token robado en confirmación de a qué cuenta pertenece.

### 10. Códigos de error legibles por máquina, no solo textos

Siguiendo el patrón ya usado en el proyecto (`SHIPPING_ADDRESS_REQUIRED`, `CAPTCHA_UNAVAILABLE`), el `title` de los `ApiError` transporta el código y los textos es-ES viven en `client/lib/constants.js`:

- `RESET_TOKEN_INVALID` → 404, enlace inexistente o ya usado.
- `RESET_TOKEN_EXPIRED` → 410, existía pero pasó de las 24 h.
- `RESET_PASSWORD_WEAK` → 400, no cumple los requisitos.

Así la página `/restablecer-password/[token]` distingue "pide otro enlace al administrador" de "este enlace ya lo usaste" sin comparar cadenas en castellano.

## Risks / Trade-offs

- **Un despliegue parcial (api sin cliente) deja la página de restablecimiento inexistente y los emails apuntando a un 404.** → El email se genera en el servidor con `CLIENT_URL`; api y cliente se despliegan juntos con `./deploy/deploy.sh`, que ya reinicia ambos contenedores. No enviar el lote masivo hasta que la ruta responda.

- **`password_changed_at` expulsa sesiones legítimas si se escribe por error.** Un `UPDATE users SET password_changed_at = CURRENT_TIMESTAMP` masivo, o un valor con desfase de zona horaria, dejaría fuera a todos los artistas a la vez. → La columna se escribe únicamente junto a `password_hash` en la misma sentencia (verificado por el test de regresión), y siempre con el mismo formato UTC que `CURRENT_TIMESTAMP`. El síntoma sería 401 en bucle, muy visible; el remedio, `UPDATE users SET password_changed_at = NULL`.

- **La comparación `iat` vs `password_changed_at` depende de que ambos hablen UTC.** SQLite guarda `CURRENT_TIMESTAMP` en UTC sin marcador de zona, y `new Date('2026-08-16 10:00:00')` en Node lo interpreta como **hora local**. En un contenedor con `TZ=Europe/Madrid` eso son dos horas de desfase — suficiente para no invalidar nada en verano, o para invalidar de más. → Se normaliza siempre añadiendo la `Z` antes de construir el `Date`. Tiene test propio con `TZ` distinto de UTC.

- **El envío masivo invalida enlaces anteriores.** Un segundo clic mientras los artistas están usando los primeros enlaces los deja todos inservibles. → Diálogo de confirmación que lo dice con todas las letras, y el contador de resultados permite reenviar solo a los fallidos.

- **Un buzón de artista comprometido equivale a la cuenta.** Es inherente a cualquier restablecimiento por email y no se resuelve dentro de esta funcionalidad. → Ventana de 24 h, un solo uso, aviso al artista cuando su contraseña cambia (`sendPasswordChangedEmail`) — que es lo que convierte un acceso silencioso en algo que la víctima detecta —, y expulsión de las sesiones previas.

- **El administrador entrando a un evento en `meeting` mode ocupa una de las 16 plazas de Agora.** El límite es físico del proveedor y `is_staff` no lo esquiva. → Se documenta; en `meeting` mode el administrador debe entrar sabiendo que gasta plaza.

- **`is_staff` hay que recordar filtrarlo en toda consulta futura sobre `event_attendees`.** Una consulta nueva que lo olvide reintroduce silenciosamente la línea de 0 €. → El test de las cuatro consultas afectadas documenta el conjunto, y un comentario en el `CREATE TABLE` señala la obligación.

- **Los tokens caducados se quedan en la tabla indefinidamente.** No hay proceso de limpieza. → Son dos columnas por fila en una tabla de decenas de filas; un token caducado ya no sirve para nada porque la comprobación es en SQL. Barrerlos sería complejidad sin ganancia.

## Migration Plan

1. Desplegar api + cliente juntos (`./deploy/deploy.sh`). Las `safeAlter` añaden las cuatro columnas al arrancar; `password_changed_at = NULL` en todas las filas, así que **ninguna sesión existente se cae**.
2. Comprobar con un solo artista de prueba: botón individual → email recibido → enlace → contraseña nueva → login correcto → la sesión antigua de ese artista devuelve 401.
3. Comprobar el acceso del administrador en un evento de pago activo: entra sin pagar, aparece en `listAttendees` con `is_staff = 1`, no suma en el contador público.
4. Lanzar el envío masivo. Revisar el recuento devuelto y reenviar individualmente a los fallidos.
5. Acompañar con un aviso previo a los artistas por otro canal, para que el email no se lea como phishing.

**Rollback:** revertir el código. Las columnas pueden quedarse (son aditivas y con `DEFAULT NULL` / `DEFAULT 0`). Si hubiera que devolver sesiones a la fuerza: `UPDATE users SET password_changed_at = NULL`. Las contraseñas ya cambiadas por artistas no se revierten — ni hace falta, que es el objetivo del cambio.

## Open Questions

Ninguna bloqueante. Resueltas con el usuario antes de redactar: caducidad de 24 h, invalidación de sesiones activada, envío masivo incluido y administrador marcado como staff.
