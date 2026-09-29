## Why

El código de verificación por email es decorativo en los tres flujos que lo piden: eventos, sorteos y subastas. En los tres, el servidor marca «verificado» en una columna que ningún control lee, y la credencial (el token de acceso al evento, el `id` del comprador) se entrega **antes** de la prueba. Consecuencias en producción:

- **Eventos.** `POST /register` devuelve el token de acceso en el primer paso. Con él, cualquiera entra a un evento gratuito sin verificar el email: basta un `curl`, sin navegador. En el cliente se ve como «Ya tienes acceso» al recargar en el paso del código.
- **Subastas.** `register-buyer` con el email de otra persona devuelve su `id` y su `bid_password`, y `/bid` solo pide ese `id`: se puede **pujar en nombre de otro comprador**, con cargo a su tarjeta guardada.
- **Pagos.** `confirm-payment` de eventos acepta **cualquier** PaymentIntent completado de la cuenta y registra `event.price` como cobrado. Un pago de 5 € desbloquea cualquier evento de pago y alimenta la cartera del host con dinero que nunca entró. En sorteos y subastas, `confirm-payment` acepta un SetupIntent sin tarjeta y habilita pujas e inscripciones sin método de pago.

Además, «Ya tienes acceso» se deduce solo de que haya algo en `localStorage`. Una sesión que el servidor ya no acepta (se entró desde otro dispositivo o hubo una expulsión) deja al asistente en un callejón sin salida: el botón «Acceder» no se pinta y «Conectar al directo» falla sin avisar.

## What Changes

- **BREAKING (API y cliente se despliegan juntos).** `POST /api/events/:id/register` deja de devolver `accessToken`. El token se emite en `POST /verify-email`, que es la prueba de propiedad del email.
- La búsqueda por token de asistente solo encuentra filas verificadas (o del staff). Los siete controles que aceptan credenciales de asistente lo heredan, y los tokens ya emitidos a filas sin verificar dejan de valer.
- El aforo y el contador público solo cuentan asistentes verificados. El aforo se vuelve a comprobar, de forma atómica, al verificar: si el evento se ha llenado entre el registro y la verificación, se responde «Aforo completo» aunque el código sea correcto.
- `POST /pay` exige email verificado.
- `confirm-payment` de eventos vincula el PaymentIntent a evento, asistente, importe y divisa, rechaza reutilizarlo y registra lo realmente cobrado.
- `confirm-payment` de sorteos y subastas exige un SetupIntent completado, con método de pago y vinculado a ese comprador y a ese sorteo o subasta. El cliente de Stripe se toma del SetupIntent, no del cuerpo de la petición.
- **BREAKING.** En sorteos y subastas, `verify-email` devuelve un `verificationToken` de un solo uso lógico y caducidad corta. `register-buyer` lo exige, así que ya no devuelve el comprador de otro email.
- Todo endpoint que recibe un `buyerId` comprueba que pertenece al sorteo o subasta de la ruta. Las pujas y las inscripciones exigen un método de pago real.
- Códigos de verificación y contraseñas generados con `crypto`. Tope de intentos para el código de eventos y espera mínima de 30 s entre reenvíos, aplicada en el servidor, en los tres flujos.
- Nuevo `POST /api/events/:id/session`: el cliente valida la sesión guardada antes de decir «Ya tienes acceso». Si el servidor la rechaza, la borra y explica el motivo.
- Validación Zod y limitador en los endpoints públicos de eventos y subastas que no los tenían (los esquemas ya existían y no estaban aplicados).
- Panel de admin: las filas sin verificar se muestran con la etiqueta «Sin verificar» y no cuentan en «Registrados (N)».
- Una contraseña de evento incorrecta ya no cierra la sesión del usuario ni lo redirige a la portada.

## Capabilities

### New Capabilities
- `event-access-verification-gate`: el acceso a un evento exige email verificado en el servidor. Cubre la emisión del token, la búsqueda de credenciales, el aforo, el contador, el pago y el panel de admin.
- `event-session-validation`: validación de la sesión guardada contra el servidor, motivos de rechazo y salida del callejón sin salida en la ficha del evento.
- `payment-confirmation-binding`: vinculación de PaymentIntent (eventos) y SetupIntent (sorteos y subastas) a quien confirma, y pertenencia del comprador a la ruta.
- `email-otp-security`: generación con CSPRNG, comparación en tiempo constante, tope de intentos y espera entre reenvíos, compartidos por los tres flujos.

### Modified Capabilities
- `event-email-verification`: verificar el código emite la credencial y comprueba el aforo; un email ya registrado se recupera verificando otra vez.
- `event-password-access`: la sesión guardada ya no concede acceso por sí sola, y un error de contraseña no dispara el manejo global de 401.
- `draw-anti-fraud`: `verify-email` devuelve un `verificationToken`.
- `draw-participation`: `register-buyer` exige el `verificationToken`; el cliente de Stripe sale del SetupIntent.
- `auction-bid-dni-verification`: `verify-email` devuelve un `verificationToken`, `register-buyer` lo exige, y se aplican Zod y limitador a los endpoints públicos de subastas.

## Impact

- **API:** `api/services/eventService.js`, `drawService.js`, `auctionService.js`; `api/controllers/eventController.js`, `drawController.js`, `auctionController.js`, `eventAdminController.js`; `api/socket/eventSocket.js`; `api/routes/eventRoutes.js`, `drawRoutes.js`, `auctionRoutes.js`; `api/validators/eventSchemas.js`, `drawSchemas.js`, `auctionSchemas.js`; nuevo `api/utils/emailOtp.js`.
- **Esquema** (`api/config/database.js`, `CREATE TABLE` + `safeAlter`, sin backfill):
  - `event_attendees.verification_attempts` y `event_attendees.verification_sent_at`;
  - `draw_email_verifications.token_hash` / `verified_at`, y lo mismo en `auction_email_verifications`;
  - índice único parcial sobre `event_attendees.stripe_payment_intent_id`.
- **Cliente:**
  - `client/components/EventAccessModal.js`, `client/app/live/[slug]/EventDetail.js`;
  - `client/components/DrawParticipationModal.js`, `client/components/BidModal.js`;
  - `client/app/admin/espacios/[id]/page.js`, `client/lib/api.js`, `client/lib/constants.js`.
- **Despliegue:** API y cliente juntos (`./deploy/deploy.sh`). Quien tenga el modal abierto durante el despliegue termina el registro sin sesión guardada y entra con la contraseña del email de confirmación.
- **Datos existentes:** sin migración. Las filas sin verificar dejan de dar acceso y de contar en el aforo en cuanto se despliega. Quien entró por el fallo tendrá que registrarse de nuevo.
- **Sin cambios:** facturación, abonos al host, transferencias, LiveKit/Agora (roles, escena, grabación).
