## MODIFIED Requirements

### Requirement: Endpoint verify-email para subastas
El sistema SHALL exponer `POST /api/auctions/:id/verify-email` que recibe `{ email, code }` en el body. Este endpoint MUST verificar el código OTP contra `auction_email_verifications`, comparándolo en tiempo constante, y marcar el registro como verificado si es correcto. Una verificación correcta SHALL devolver un `verificationToken`: 32 bytes aleatorios, de los que solo se guarda el SHA-256, en `auction_email_verifications.token_hash`, junto a `verified_at`. Es la única prueba que acepta `register-buyer` y vale 60 minutos desde `verified_at`.

#### Scenario: Código OTP correcto
- **WHEN** se envía un código OTP que coincide con el almacenado y no ha expirado
- **THEN** el sistema responde con `{ success: true, verificationToken }`, marca la verificación como completada y guarda el hash del token y `verified_at`

#### Scenario: Código OTP incorrecto
- **WHEN** se envía un código OTP que no coincide
- **THEN** el sistema responde con error 400 "Código de verificación incorrecto" e incrementa el contador de intentos

#### Scenario: Código OTP expirado
- **WHEN** se envía un código OTP cuyo registro ha superado `expires_at`
- **THEN** el sistema responde con error 400 "El código ha expirado, solicita uno nuevo"

#### Scenario: Máximo de intentos excedido
- **WHEN** se han realizado 5 o más intentos fallidos para un código
- **THEN** el sistema responde con error 429 "Demasiados intentos, solicita un nuevo código"

### Requirement: Endpoint register-buyer acepta campo DNI
El endpoint `POST /api/auctions/:id/register-buyer` SHALL exigir un `verificationToken` devuelto por `verify-email` para la misma subasta, con 60 minutos de antigüedad como máximo, y cuyo email coincida con el del body una vez normalizado. SHALL aceptar un campo `dni` en el body y almacenarlo en `auction_buyers.dni`. Solo tras esa prueba puede devolver un comprador ya existente con ese email, incluida su `bid_password`.

#### Scenario: Registro de buyer con DNI
- **WHEN** se envía `register-buyer` con `{ firstName, lastName, email, dni, verificationToken, ... }` y el token es válido
- **THEN** el buyer creado en `auction_buyers` tiene el campo `dni` con el valor proporcionado normalizado a mayúsculas y el email normalizado a minúsculas

#### Scenario: Registro con el email de otro comprador sin verificar
- **WHEN** se envía `register-buyer` con el email de un comprador existente y sin `verificationToken` válido para ese email y esa subasta
- **THEN** el sistema responde 403 con título `VERIFICATION_REQUIRED`
- **AND** la respuesta no contiene el `id` ni la `bid_password` de ese comprador

### Requirement: Rate limiting en endpoints de verificación
Los endpoints `send-verification`, `verify-email` y `verify-buyer` de subastas SHALL estar protegidos con `sensitiveLimiter`. `send-verification` SHALL rechazar además un reenvío para el mismo email y la misma subasta con menos de 30 s de diferencia (400 `OTP_RESEND_TOO_SOON`).

#### Scenario: Muchas solicitudes de verificación en poco tiempo
- **WHEN** un cliente envía más solicitudes de las permitidas por `sensitiveLimiter`
- **THEN** el sistema responde con error 429

#### Scenario: Prueba masiva de contraseñas de puja
- **WHEN** un cliente envía a `verify-buyer` más solicitudes de las permitidas por `sensitiveLimiter`
- **THEN** el sistema responde con error 429

## ADDED Requirements

### Requirement: Validación Zod en los endpoints públicos de subastas
`register-buyer`, `verify-buyer`, `setup-payment`, `confirm-payment` y `bid` SHALL validarse con sus esquemas Zod de `api/validators/auctionSchemas.js`, aplicados con `validate()` en `api/routes/auctionRoutes.js`. `registerBuyerSchema` SHALL exigir `verificationToken` y un email con formato válido. Las búsquedas por email SHALL comparar `LOWER(email)` con el email normalizado, para no dejar fuera a compradores registrados antes de este cambio con mayúsculas.

#### Scenario: Puja sin importe
- **WHEN** se llama a `POST /api/auctions/:id/bid` sin `amount`
- **THEN** el sistema responde 400 desde la validación, sin llegar al controlador

#### Scenario: Comprador heredado con mayúsculas en el email
- **WHEN** un comprador registrado antes de este cambio como `Ana@Ejemplo.com` entra con `verify-buyer` usando `ana@ejemplo.com` y su contraseña
- **THEN** la verificación se completa
