## 1. Esquema y utilidades compartidas

- [x] 1.1 `api/config/database.js`, en el `CREATE TABLE` y con `safeAlter`, sin backfill:
  - `event_attendees.verification_attempts INTEGER NOT NULL DEFAULT 0` y `event_attendees.verification_sent_at DATETIME`;
  - `token_hash TEXT` y `verified_at DATETIME` en `draw_email_verifications` y en `auction_email_verifications`.

  Ningún comentario `--` puede terminar en punto y coma ni llevar barra invertida.
- [x] 1.2 Índice único parcial `idx_event_attendees_stripe_pi ON event_attendees(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL`.
- [x] 1.3 Crear `api/utils/emailOtp.js`:
  - `generateOtpCode()` (`crypto.randomInt(100000, 1000000)`) y `generateAccessPassword()` (alfabeto actual, 6 caracteres, `crypto.randomInt`);
  - `generateOpaqueToken()`, `sha256()` y `safeEqual()` (`timingSafeEqual`, `false` si las longitudes difieren);
  - `normalizeEmail()`;
  - las constantes `OTP_TTL_MS`, `OTP_RESEND_COOLDOWN_SECONDS`, `VERIFICATION_TOKEN_TTL_MINUTES` y `EVENT_OTP_MAX_ATTEMPTS`.
- [x] 1.4 Sustituir los generadores de `eventService.js` (código y contraseña), `drawService.js` (código) y `auctionService.js` (código y contraseña de puja) por los de `emailOtp.js`, y borrar las copias locales.

## 2. Eventos: la credencial nace en la verificación (API)

- [x] 2.1 `eventService.registerAttendee`: normalizar el email, insertar con `access_token_hash = NULL` y devolver `{ attendee, isExisting }` sin token. La fila existente no se modifica.
- [x] 2.2 `eventController.registerAttendee`:
  - responder solo `{ attendeeId }`, con la misma forma para email nuevo y existente;
  - omitir el control de aforo si el email ya tiene fila verificada;
  - rechazar con 409 `EVENT_FULL` en otro caso.
- [x] 2.3 `getAttendeeByAccessToken`: añadir `AND (email_verified = 1 OR is_staff = 1)`.
- [x] 2.4 `getAttendeeCount`: contar solo `email_verified = 1` (además de las condiciones actuales).
- [x] 2.5 `sendVerificationCode`:
  - espera de 30 s sobre `verification_sent_at` (400 `OTP_RESEND_TOO_SOON` desde el controlador);
  - escribir `verification_sent_at` y poner `verification_attempts = 0`;
  - el código sale de `emailOtp`.
- [x] 2.6 `verifyEmailCode`, según D4:
  - tope de 5 intentos (`OTP_TOO_MANY_ATTEMPTS`); los fallos incrementan `verification_attempts` (`OTP_INVALID`); caducidad (`OTP_EXPIRED`);
  - comparación con `safeEqual`;
  - un único `UPDATE` condicional que verifica, emite el token y comprueba el aforo;
  - con `rowsAffected = 0`, releer la fila para distinguir `EVENT_FULL` de un código ya consumido.
- [x] 2.7 `eventController.verifyEmail`:
  - responder `{ attendeeId, accessToken, paymentRequired, accessPassword? }`;
  - en gratuitos, reutilizar `access_password` si existe (generarla si no) y enviar el email de confirmación;
  - en pago no pagado, sin contraseña y con `paymentRequired: true`.
- [x] 2.8 `setAttendeePassword` deja de poner `email_verified = 1`: solo la verificación y el admin lo escriben. Revisar que `confirm-payment` no dependa de ese efecto secundario.
- [x] 2.9 `verifyAttendeePassword`: normalizar el email antes de buscar.
- [x] 2.10 `eventRoutes.js`:
  - `sensitiveLimiter` en `/register`;
  - `validate()` con `registerAttendeeSchema` (email con formato válido y recorte de espacios), `createPaymentSchema`, `confirmPaymentSchema` y `getViewerTokenSchema`;
  - comprobar que ningún campo que envía el cliente desaparece por `.strip()`.

## 3. Eventos: sesión, pago y panel (API)

- [x] 3.1 `POST /api/events/:id/session` con un esquema Zod nuevo. Resultados: 200 `{ access: 'granted' }`, o 403 con `SESSION_INVALID`, `SESSION_REPLACED`, `SESSION_UNVERIFIED`, `SESSION_BANNED` o `SESSION_PAYMENT_REQUIRED`, en el orden de la spec. La segunda consulta (sin filtro de verificación) solo se lanza cuando falla la primera. Sin escrituras y nunca 401.
- [x] 3.2 `createPayment`: 404 si la fila no es del evento; 403 `EMAIL_NOT_VERIFIED` si no está verificada.
- [x] 3.3 `confirmPayment`, según D6:
  - pertenencia al evento y `email_verified`;
  - `status`, `metadata.type`, `event_id` y `attendee_id`, `amount` y `currency`;
  - `amount_paid` a partir de `amount_received`;
  - idempotencia con el mismo PaymentIntent (200 con la contraseña existente, sin email);
  - 409 `PAYMENT_ALREADY_USED`, tanto por la comprobación previa como por la violación del índice único.
- [x] 3.4 Confirmar que los siete puntos de entrada (`token`, `renew-token`, `whiteboard-token`, subida a la pizarra, `video-token`, `report-spam` y la sala de `eventSocket.js`) autentican solo mediante `getAttendeeByAccessToken`. Ninguno puede consultar `access_token_hash` directamente.

## 4. Sorteos y subastas: pagos y pertenencia (API)

- [x] 4.1 `drawController.setupPayment` / `confirmPayment` y `auctionController.setupPayment` / `confirmPayment`: 404 si el comprador no pertenece al `:id` de la ruta.
- [x] 4.2 `confirmPayment` de sorteos y subastas, según D7:
  - `status = 'succeeded'` y `payment_method` no nulo (`SETUP_NOT_SUCCEEDED`);
  - metadatos del comprador y del sorteo o subasta (`SETUP_MISMATCH`);
  - guardar `setupIntent.customer` e ignorar `customerId` del cuerpo.
- [x] 4.3 `drawService.enterDraw`: comprobar `buyer.draw_id === drawId`, y exigir `stripe_payment_method_id` no nulo en los datos de pago.
- [x] 4.4 `auctionController.placeBid`: exigir `stripe_payment_method_id` no nulo. `verifyBuyer` calcula `hasPaymentMethod` con el mismo criterio.

## 5. Sorteos y subastas: prueba de verificación (API)

- [x] 5.1 `createEmailVerification` (sorteos y subastas):
  - normalizar el email;
  - espera de 30 s sobre el `created_at` de la verificación anterior del mismo email y sorteo o subasta (400 `OTP_RESEND_TOO_SOON`);
  - el `DELETE` previo sigue invalidando el código y el token anteriores.
- [x] 5.2 `verifyEmailCode` (sorteos y subastas):
  - comparación con `safeEqual`;
  - al acertar, generar el token opaco y guardar `token_hash` y `verified_at = CURRENT_TIMESTAMP`;
  - devolverlo al controlador, que responde `{ success, verificationToken }`.
- [x] 5.3 Función de servicio que resuelve un `verificationToken` frente a `(draw_id|auction_id, sha256(token), verified = 1, datetime(verified_at) > datetime('now', '-60 minutes'))`, y devuelve el email de la verificación o `null`.
- [x] 5.4 `register-buyer` de sorteos y subastas:
  - exigir el token y que su email coincida con el del cuerpo una vez normalizado (403 `VERIFICATION_REQUIRED`) antes de `createOrGet*Buyer`;
  - guardar el email normalizado;
  - buscar el comprador existente con `LOWER(email)`.
- [x] 5.5 `auctionService.verifyBidPassword` y el resto de búsquedas de compradores por email: comparar `LOWER(email)` con el email normalizado.
- [x] 5.6 `auctionRoutes.js`:
  - `validate()` con los esquemas existentes en `register-buyer`, `verify-buyer`, `setup-payment`, `confirm-payment` y `bid`;
  - `sensitiveLimiter` en `verify-buyer`;
  - `registerBuyerSchema` y el de sorteos aceptan `verificationToken` y validan el formato del email;
  - contrastar cada esquema con el `buyerData` real de `BidModal` y usar `.nullish()` donde el cliente envíe `null`.

## 6. Cliente: eventos

- [x] 6.1 `client/lib/api.js`:
  - `eventsAPI.checkSession(eventId, attendeeId, accessToken)`;
  - `verifyPassword` con `skipAuthHandling: true`;
  - `auctionsAPI.registerBuyer` / `drawsAPI.registerBuyer` envían `verificationToken`;
  - `confirmPayment` de sorteos y subastas deja de enviar `customerId`.
- [x] 6.2 `client/lib/constants.js`: `SESSION_REJECTION_MESSAGES` (los cinco códigos) y los textos de `EVENT_FULL`, `OTP_RESEND_TOO_SOON`, `OTP_TOO_MANY_ATTEMPTS` y `VERIFICATION_REQUIRED`. Centralizar la clave `event_attendee_` y los helpers `getStoredSession` / `storeSession` / `clearStoredSession`, que hoy están duplicados en `EventAccessModal`, `EventDetail`, `AgoraLiveRoom` y `EventLiveRoom`.
- [x] 6.3 `EventAccessModal`:
  - no guardar la sesión tras `register`;
  - eliminar el atajo `isExisting && ['paid','joined']`, de modo que todo email pase por VERIFY_EMAIL;
  - tratar `OTP_RESEND_TOO_SOON` al registrarse como «el código anterior sigue valiendo»;
  - tras `verify-email`: con `paymentRequired: false`, guardar la sesión y pasar a SUCCESS; con `true`, guardar el token en memoria y pasar a PAYMENT;
  - tras `confirm-payment`, guardar la sesión;
  - mostrar `EVENT_FULL` como «Aforo completo».
- [x] 6.4 `EventDetail`:
  - validar la sesión guardada con `checkSession` antes de `hasAccess`, con estado neutro mientras tanto;
  - si hay rechazo, borrar la sesión, mostrar el motivo sobre «Acceder» y reabrir el flujo;
  - si hay fallo transitorio, conservar la sesión.
- [x] 6.5 `EventDetail.connectAsViewer`: ante un 403, revalidar con `checkSession` y aplicar el mismo tratamiento, en lugar de limitarse a `console.error`.
- [x] 6.6 Enlace «¿No eres tú? Acceder con otros datos» bajo «Ya tienes acceso»: borra la sesión y abre el modal en CHOOSE. Oculto para el host y para `role === 'admin'`.
- [x] 6.7 `admin/espacios/[id]/page.js`:
  - etiqueta «Sin verificar» según la spec, sustituyendo a «Registrado» o sumándose a `joined`/`paid`;
  - la cabecera «Registrados (N)» cuenta verificados que no sean del staff, y añade «· M sin verificar» si hay filas sin verificar.

## 7. Cliente: sorteos y subastas

- [x] 7.1 `DrawParticipationModal`:
  - guardar en estado el `verificationToken` de `verify-email` y enviarlo en `registerBuyer`;
  - ante `VERIFICATION_REQUIRED` (token caducado), volver al paso PERSONAL con el mensaje;
  - mostrar `OTP_RESEND_TOO_SOON`.
- [x] 7.2 `BidModal`: lo mismo, en las dos llamadas a `registerBuyer`. El camino de «Acceder con contraseña de puja» no cambia, salvo que `hasPaymentMethod: false` lleve a PAYMENT.

## 8. Tests (api)

- [x] 8.1 Helper `api/tests/helpers/eventAttendees.js` con `createVerifiedAttendee(eventId, data)` → `{ attendee, accessToken }`, que recorre el camino real a nivel de servicio: `registerAttendee` + `sendVerificationCode` + `verifyEmailCode`, con el código que devuelve el propio servicio. El recorrido por HTTP, leyendo el código del buzón (`__getOutbox`), lo cubre la suite de 8.2. Migrar las cinco suites que dependen de `registerAttendee` devolviendo token:
  - `adminEventAccess`;
  - `agoraBroadcastCohost`;
  - `eventSocketCohost`;
  - `eventChatAdminModeration`;
  - `eventHandRaiseOrder`.
- [x] 8.2 `eventRegistrationVerification.test.js`:
  - `/register` sin token y con la misma forma para email nuevo y existente;
  - un token de fila sin verificar es rechazado en `/token`, `/video-token` y la sala de Socket.IO;
  - `verify-email` emite el token;
  - un asistente que vuelve recibe token nuevo y su contraseña existente;
  - tope de intentos y espera de reenvío;
  - aforo: los registros sin verificar no cuentan; `EVENT_FULL` al verificar con el evento lleno; exención del ya verificado; dos verificaciones concurrentes por la última plaza, de las que solo gana una;
  - normalización del email.
- [x] 8.3 `eventSessionCheck.test.js`: los cinco códigos de rechazo, el 200, la ausencia de escrituras (`status` no pasa a `joined`) y que nunca se responde 401.
- [x] 8.4 `eventPaymentConfirmation.test.js`, con `stripeService` simulado con `jest.mock`:
  - PaymentIntent de otro evento, de otro asistente o de un pedido;
  - importe y divisa;
  - reutilización (409);
  - idempotencia;
  - `amount_paid` a partir de `amount_received`;
  - `/pay` sin verificar (403).
- [x] 8.5 `buyerVerificationBinding.test.js`, para sorteos y subastas:
  - `register-buyer` sin token, con token caducado, de otra subasta o de otro email (403);
  - el email de un comprador existente sin token no devuelve ni `id` ni `bid_password`;
  - SetupIntent sin completar o de otro comprador;
  - `customer` tomado del SetupIntent;
  - comprador de otro sorteo en `enter`, `setup-payment` y `confirm-payment`;
  - pujar e inscribirse sin `stripe_payment_method_id`;
  - comprador heredado con mayúsculas en `verify-buyer`.
- [x] 8.6 Tests de regresión por `grep`:
  - `access_token_hash` solo aparece en SQL de `eventService.js`;
  - no hay `Math.random` en `eventService.js`, `drawService.js`, `auctionService.js` ni `emailOtp.js`.
- [x] 8.7 `npm test` completo en verde, incluidos `testEnvironmentIsolation.test.js` y `dbDump.test.js` (columnas nuevas e índice).

## 9. Documentación

- [x] 9.1 Sección nueva en `CLAUDE.md` con las reglas que sostienen el cambio y el porqué de cada una:
  - la credencial nace en la verificación;
  - una sola búsqueda por token;
  - `email_verified` y no un `status` nuevo;
  - aforo atómico;
  - vinculación de PaymentIntent y SetupIntent;
  - `verificationToken` en sorteos y subastas;
  - `/session` nunca responde 401;
  - la espera entre reenvíos es un 400.
- [x] 9.2 Crear `docs/acceso-eventos.md` (`docs/live-events-access.md` ya no existe), siguiendo el formato de `docs/grabaciones-eventos.md`: el flujo nuevo de registro, verificación y pago, y el procedimiento para asistentes con sesión caducada (sección del design).

## 10. Verificación manual y despliegue

- [x] 10.1 Matriz manual en Chrome Android, Firefox escritorio y Safari iOS, con un email nuevo en cada prueba:
  - recargar en el paso del código muestra «Acceder»;
  - el registro completo muestra «Ya tienes acceso» tras recargar;
  - «Acceder con contraseña» en un segundo navegador hace que el primero muestre el mensaje `SESSION_REPLACED` y «Acceder»;
  - una contraseña incorrecta no expulsa a la portada;
  - el panel de admin muestra «Sin verificar».
- [x] 10.2 Sorteo y subasta de preproducción: flujo completo con el token de verificación. `register-buyer` sin token rechazado desde `curl`.
- [x] 10.3 Antes de desplegar, ejecutar contra producción la consulta de duplicados de `stripe_payment_intent_id` (debe devolver cero filas) y la de asistentes sin verificar en eventos futuros (para avisarles si se decide).
- [x] 10.4 Desplegar API y cliente juntos con `./deploy/deploy.sh`. En producción, comprobar que `/register` no devuelve `accessToken` y que recargar en el paso del código muestra «Acceder».
