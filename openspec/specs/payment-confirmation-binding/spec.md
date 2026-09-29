# payment-confirmation-binding Specification

## Purpose
TBD - created by archiving change enforce-verification-gates. Update Purpose after archive.

## Requirements
### Requirement: El PaymentIntent de un evento se vincula a quien confirma

`POST /api/events/:id/confirm-payment` SHALL marcar un asistente como pagado solo si se cumplen todas estas condiciones:

1. La fila pertenece al evento de la ruta y tiene `email_verified = 1`.
2. El PaymentIntent está en `succeeded`.
3. `metadata.type = 'event'`, `metadata.event_id` es el `:id` de la ruta y `metadata.attendee_id` es el `attendeeId` del cuerpo.
4. `amount` es `Math.round(event.price * 100)` y `currency` es la divisa del evento en minúsculas.

`amount_paid` SHALL registrarse a partir de `amount_received` del PaymentIntent, no de `event.price`. Cada rechazo lleva su código en `title`:

| Condición | Respuesta |
|---|---|
| El PaymentIntent no está completado | 400 `PAYMENT_NOT_SUCCEEDED` |
| Metadatos, importe o divisa no corresponden | 400 `PAYMENT_MISMATCH` |
| El PaymentIntent ya está registrado en otra fila | 409 `PAYMENT_ALREADY_USED` |
| La fila no tiene el email verificado | 403 `EMAIL_NOT_VERIFIED` |

#### Scenario: PaymentIntent de otro evento
- **WHEN** se confirma el asistente del evento B con un PaymentIntent completado cuyo `metadata.event_id` es el evento A
- **THEN** el sistema responde 400 `PAYMENT_MISMATCH` y el asistente sigue sin pagar

#### Scenario: PaymentIntent de una compra de la tienda
- **WHEN** se confirma un asistente con un PaymentIntent completado de un pedido de productos
- **THEN** el sistema responde 400 `PAYMENT_MISMATCH`

#### Scenario: Importe menor que el precio
- **WHEN** el PaymentIntent tiene los metadatos correctos pero un `amount` distinto del precio del evento
- **THEN** el sistema responde 400 `PAYMENT_MISMATCH`

#### Scenario: Reutilizar un PaymentIntent para otro asistente
- **WHEN** un PaymentIntent ya registrado en la fila X se presenta para la fila Y
- **THEN** el sistema responde 409 `PAYMENT_ALREADY_USED`

#### Scenario: Confirmación repetida del mismo pago
- **WHEN** se confirma dos veces la misma fila con el mismo PaymentIntent (por ejemplo, un reintento tras un corte de red)
- **THEN** la segunda llamada responde 200 con la contraseña ya generada
- **AND** no genera una contraseña nueva ni envía otro email de confirmación

### Requirement: Un PaymentIntent no puede registrarse dos veces

La base de datos SHALL impedir que dos filas de `event_attendees` compartan `stripe_payment_intent_id`, mediante un índice único parcial (`WHERE stripe_payment_intent_id IS NOT NULL`) declarado en `api/config/database.js`.

#### Scenario: Escritura concurrente del mismo PaymentIntent
- **WHEN** dos confirmaciones concurrentes intentan registrar el mismo PaymentIntent en filas distintas
- **THEN** una de las dos escrituras falla por el índice único y el endpoint responde 409 `PAYMENT_ALREADY_USED`

### Requirement: El SetupIntent de sorteos y subastas se vincula al comprador

`POST /api/draws/:id/confirm-payment` y `POST /api/auctions/:id/confirm-payment` SHALL guardar los datos de pago autorizados solo si se cumplen todas estas condiciones:

1. El comprador pertenece al sorteo o subasta de la ruta.
2. El SetupIntent está en `succeeded` y tiene `payment_method`.
3. `metadata.draw_buyer_id` / `metadata.auction_buyer_id` es el comprador del cuerpo, y `metadata.draw_id` / `metadata.auction_id` es el `:id` de la ruta.

El `stripe_customer_id` guardado SHALL ser el `customer` del SetupIntent; un `customerId` en el cuerpo se ignora. Cada rechazo lleva su código en `title`:

| Condición | Respuesta |
|---|---|
| El SetupIntent no está completado o no tiene método de pago | 400 `SETUP_NOT_SUCCEEDED` |
| Los metadatos no corresponden | 400 `SETUP_MISMATCH` |

#### Scenario: SetupIntent sin completar
- **WHEN** un comprador crea un SetupIntent con `setup-payment` y llama a `confirm-payment` sin haber introducido la tarjeta
- **THEN** el sistema responde 400 `SETUP_NOT_SUCCEEDED` y no guarda datos de pago

#### Scenario: SetupIntent de otro comprador
- **WHEN** se confirma el comprador X con un SetupIntent cuyo `metadata.auction_buyer_id` es el comprador Y
- **THEN** el sistema responde 400 `SETUP_MISMATCH`

### Requirement: Un comprador solo actúa en su propio sorteo o subasta

`setup-payment`, `confirm-payment` y la inscripción (`POST /api/draws/:id/enter`) SHALL responder 404 cuando el comprador no pertenece al sorteo o subasta de la ruta (`draw_buyers.draw_id` / `auction_buyers.auction_id`).

#### Scenario: Inscribir en el sorteo B a un comprador del sorteo A
- **WHEN** se llama a `POST /api/draws/B/enter` con el `drawBuyerId` de un comprador del sorteo A
- **THEN** el sistema responde 404 y no crea ninguna participación

### Requirement: Pujar e inscribirse exigen un método de pago real

`POST /api/auctions/:id/bid` y `POST /api/draws/:id/enter` SHALL exigir que los datos de pago autorizados del comprador tengan `stripe_payment_method_id` no nulo. Una fila de datos de pago sin método (creada antes de este cambio a partir de un SetupIntent sin completar) SHALL tratarse como si no existiera.

#### Scenario: Datos de pago heredados sin tarjeta
- **WHEN** un comprador cuyos datos de pago tienen `stripe_payment_method_id = NULL` intenta pujar
- **THEN** el sistema responde 400 «Debes completar el pago de autorización antes de pujar»
