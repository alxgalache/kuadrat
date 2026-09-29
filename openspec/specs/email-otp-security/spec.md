# email-otp-security Specification

## Purpose
TBD - created by archiving change enforce-verification-gates. Update Purpose after archive.

## Requirements
### Requirement: Generación con CSPRNG

Los códigos de verificación por email de eventos, sorteos y subastas, la contraseña de acceso a eventos y la contraseña de puja de subastas SHALL generarse con `crypto.randomInt` desde un único módulo, `api/utils/emailOtp.js`. Los códigos SHALL conservar su formato actual: seis dígitos, de 100000 a 999999. Las contraseñas SHALL conservar su alfabeto actual: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, de 6 caracteres.

#### Scenario: Ningún generador usa Math.random
- **WHEN** se ejecuta la batería de tests
- **THEN** un test de regresión falla si `Math.random` aparece en `eventService.js`, `drawService.js`, `auctionService.js` o `api/utils/emailOtp.js`

### Requirement: Comparación en tiempo constante

La comparación de un código o token de verificación con su valor almacenado SHALL hacerse con `crypto.timingSafeEqual` sobre buffers de igual longitud. La función SHALL devolver `false` sin lanzar excepciones cuando las longitudes difieren.

#### Scenario: Código de longitud distinta
- **WHEN** se compara un código de 5 caracteres con uno almacenado de 6
- **THEN** la comparación devuelve `false`

### Requirement: Espera mínima entre reenvíos aplicada por el servidor

`send-verification` de eventos, sorteos y subastas SHALL rechazar un nuevo envío cuando el anterior, para la misma fila de asistente o el mismo par email + sorteo o subasta, se hizo hace menos de `OTP_RESEND_COOLDOWN_SECONDS` (30 s), comparado en SQL contra una marca `CURRENT_TIMESTAMP`. El rechazo SHALL ser un 400 con título `OTP_RESEND_TOO_SOON`, no un 429: el cliente trata cualquier 429 como el aviso global de límite de peticiones. El código anterior sigue siendo válido.

#### Scenario: Reenvío inmediato
- **WHEN** se llama a `send-verification` dos veces en 10 s para el mismo asistente
- **THEN** la segunda llamada responde 400 `OTP_RESEND_TOO_SOON` y no envía otro email

#### Scenario: Reenvío tras la espera
- **WHEN** se llama a `send-verification` 31 s después del envío anterior
- **THEN** se genera y se envía un código nuevo, y el anterior deja de valer

### Requirement: Tope de intentos en eventos

La verificación del código de eventos SHALL contar los intentos fallidos en `event_attendees.verification_attempts`. Con 5 intentos fallidos, SHALL rechazar cualquier código, también el correcto, con 400 y título `OTP_TOO_MANY_ATTEMPTS` y mensaje «Demasiados intentos. Solicita un nuevo código». Un nuevo envío SHALL poner el contador a 0. Sorteos y subastas conservan sus topes actuales: 3 y 5.

#### Scenario: Quinto intento fallido
- **WHEN** un asistente falla el código 5 veces y después introduce el correcto
- **THEN** el sistema responde 400 `OTP_TOO_MANY_ATTEMPTS` y la fila sigue sin verificar

#### Scenario: Reenvío tras agotar los intentos
- **WHEN** tras agotar los intentos el asistente pide un código nuevo e introduce el correcto
- **THEN** la verificación se completa
