## ADDED Requirements

### Requirement: La tabla auction_buyers incluye columna DNI
El sistema SHALL incluir una columna `dni TEXT` en la tabla `auction_buyers` de la base de datos. La columna MUST ser nullable para mantener retrocompatibilidad con registros existentes.

#### Scenario: Nuevo buyer se registra con DNI
- **WHEN** un nuevo buyer se registra en una subasta proporcionando un DNI válido
- **THEN** el valor del DNI se almacena en la columna `dni` de `auction_buyers` normalizado a mayúsculas

#### Scenario: Buyers existentes sin DNI siguen siendo válidos
- **WHEN** existen registros de `auction_buyers` previos a este cambio
- **THEN** su columna `dni` es NULL y el sistema no genera errores

### Requirement: Tabla de verificaciones de email para subastas
El sistema SHALL disponer de una tabla `auction_email_verifications` con campos: id (TEXT PK), email (TEXT NOT NULL), auction_id (TEXT NOT NULL, FK a auctions), code (TEXT NOT NULL), attempts (INTEGER DEFAULT 0), expires_at (DATETIME NOT NULL), verified (INTEGER DEFAULT 0), ip_address (TEXT), created_at (DATETIME DEFAULT CURRENT_TIMESTAMP).

#### Scenario: Se crea un registro de verificación de email
- **WHEN** se invoca el endpoint `send-verification` para una subasta
- **THEN** se crea un registro en `auction_email_verifications` con un código de 6 dígitos y expiración a 10 minutos

### Requirement: Endpoint send-verification para subastas
El sistema SHALL exponer `POST /api/auctions/:id/send-verification` que recibe `{ email, dni }` en el body. Este endpoint MUST:
1. Validar el formato del DNI/NIE con el algoritmo NIF español.
2. Comprobar la unicidad del email para esa subasta (permitir re-entrada si el buyer no ha completado el registro).
3. Comprobar la unicidad del DNI para esa subasta (permitir re-entrada si el buyer no ha completado el registro).
4. Generar un código OTP de 6 dígitos, almacenarlo en `auction_email_verifications`, y enviarlo al email proporcionado.

#### Scenario: Envío exitoso de verificación
- **WHEN** se envía `send-verification` con email y DNI válidos y no duplicados
- **THEN** el sistema responde con `{ success: true }` y el email recibe un código de 6 dígitos

#### Scenario: DNI con formato inválido
- **WHEN** se envía `send-verification` con un DNI que no cumple el algoritmo NIF español
- **THEN** el sistema responde con error 400 "El DNI/NIE introducido no es válido"

#### Scenario: Email duplicado con participación completada
- **WHEN** se envía `send-verification` con un email que ya está registrado para esa subasta y tiene pago autorizado
- **THEN** el sistema responde con error 409 "Este email ya está registrado en esta subasta"

#### Scenario: DNI duplicado con participación completada
- **WHEN** se envía `send-verification` con un DNI que ya está registrado para esa subasta y tiene pago autorizado
- **THEN** el sistema responde con error 409 "Este DNI ya está registrado en esta subasta"

#### Scenario: Email o DNI de buyer que no completó registro
- **WHEN** se envía `send-verification` con un email o DNI existente pero cuyo buyer no tiene pago autorizado
- **THEN** el sistema permite la verificación y envía el código OTP

### Requirement: Endpoint verify-email para subastas
El sistema SHALL exponer `POST /api/auctions/:id/verify-email` que recibe `{ email, code }` en el body. Este endpoint MUST verificar el código OTP contra `auction_email_verifications` y marcar el registro como verificado si es correcto.

#### Scenario: Código OTP correcto
- **WHEN** se envía un código OTP que coincide con el almacenado y no ha expirado
- **THEN** el sistema responde con `{ success: true }` y marca la verificación como completada

#### Scenario: Código OTP incorrecto
- **WHEN** se envía un código OTP que no coincide
- **THEN** el sistema responde con error 400 "Código de verificación incorrecto" e incrementa el contador de intentos

#### Scenario: Código OTP expirado
- **WHEN** se envía un código OTP cuyo registro ha superado `expires_at`
- **THEN** el sistema responde con error 400 "El código ha expirado, solicita uno nuevo"

#### Scenario: Máximo de intentos excedido
- **WHEN** se han realizado 5 o más intentos fallidos para un código
- **THEN** el sistema responde con error 429 "Demasiados intentos, solicita un nuevo código"

### Requirement: Validación Zod para endpoints de verificación de subastas
El sistema SHALL definir schemas Zod (`sendVerificationSchema` y `verifyEmailSchema`) en `api/validators/auctionSchemas.js` para validar los bodies de los endpoints `send-verification` y `verify-email`.

#### Scenario: Body de send-verification válido
- **WHEN** se envía `{ email: "test@test.com", dni: "12345678Z" }`
- **THEN** la validación pasa correctamente

#### Scenario: Body de send-verification sin email
- **WHEN** se envía `{ dni: "12345678Z" }` sin campo email
- **THEN** la validación falla con error 400

### Requirement: Rate limiting en endpoints de verificación
Los endpoints `send-verification` y `verify-email` de subastas SHALL estar protegidos con `sensitiveLimiter`.

#### Scenario: Muchas solicitudes de verificación en poco tiempo
- **WHEN** un cliente envía más solicitudes de las permitidas por `sensitiveLimiter`
- **THEN** el sistema responde con error 429

### Requirement: Endpoint register-buyer acepta campo DNI
El endpoint `POST /api/auctions/:id/register-buyer` SHALL aceptar un campo `dni` en el body y almacenarlo en `auction_buyers.dni`.

#### Scenario: Registro de buyer con DNI
- **WHEN** se envía `register-buyer` con `{ firstName, lastName, email, dni, ... }`
- **THEN** el buyer creado en `auction_buyers` tiene el campo `dni` con el valor proporcionado normalizado a mayúsculas

### Requirement: BidModal paso 2 replica el formulario de DrawParticipationModal
El paso 2 (Datos personales) del BidModal SHALL presentar la misma estructura y lógica que el paso 2 del DrawParticipationModal:

1. Campos Nombre y Apellidos en grid de 2 columnas.
2. Campo Email.
3. Campo DNI/NIE con validación inline del algoritmo NIF español (clase `uppercase`, maxLength 9, placeholder "12345678Z").
4. Botón "Continuar" que ejecuta `send-verification` (validando unicidad de email y DNI y enviando OTP).
5. Tras envío exitoso, muestra formulario de código de verificación (6 dígitos numéricos, tracking-widest, centrado).
6. Botón "Verificar código" que ejecuta `verify-email`.
7. Botón "Reenviar código" visible tras 30 segundos de espera.
8. Tras verificación exitosa, avanza al paso 3 (Delivery).

#### Scenario: Formulario de datos personales muestra todos los campos
- **WHEN** el usuario está en el paso 2 del BidModal
- **THEN** se muestran los campos Nombre, Apellidos, Email y DNI/NIE

#### Scenario: Validación inline del DNI
- **WHEN** el usuario introduce un DNI con formato incorrecto (9 caracteres)
- **THEN** se muestra el mensaje "El DNI/NIE introducido no es válido" debajo del campo

#### Scenario: Botón Continuar deshabilitado sin datos completos
- **WHEN** alguno de los campos (nombre, apellidos, email, DNI) está vacío o el DNI es inválido
- **THEN** el botón "Continuar" está deshabilitado (disabled, opacity-50)

#### Scenario: Flujo OTP completo
- **WHEN** el usuario rellena todos los campos correctamente y pulsa "Continuar"
- **THEN** se envía la petición `send-verification`, se muestra el formulario de OTP, y tras verificar correctamente el código, se avanza al paso de dirección de envío

#### Scenario: Error de email duplicado
- **WHEN** el endpoint `send-verification` responde con error 409 por email duplicado
- **THEN** se muestra el mensaje de error "Este email ya está registrado en esta subasta"

#### Scenario: Error de DNI duplicado
- **WHEN** el endpoint `send-verification` responde con error 409 por DNI duplicado
- **THEN** se muestra el mensaje de error "Este DNI ya está registrado en esta subasta"

### Requirement: API client incluye métodos de verificación para subastas
El módulo de auctions en `client/lib/api.js` SHALL incluir los métodos `sendVerification(auctionId, email, dni)` y `verifyEmail(auctionId, email, code)`.

#### Scenario: Llamada a sendVerification
- **WHEN** el frontend invoca `auctionsAPI.sendVerification(auctionId, email, dni)`
- **THEN** se realiza un POST a `/api/auctions/:id/send-verification` con `{ email, dni }`

#### Scenario: Llamada a verifyEmail
- **WHEN** el frontend invoca `auctionsAPI.verifyEmail(auctionId, email, code)`
- **THEN** se realiza un POST a `/api/auctions/:id/verify-email` con `{ email, code }`
