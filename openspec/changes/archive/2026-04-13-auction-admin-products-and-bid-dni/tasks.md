## 1. Base de datos

- [x] 1.1 Añadir columna `dni TEXT` a la tabla `auction_buyers` en `api/config/database.js` (dentro del CREATE TABLE existente, tras `email`)
- [x] 1.2 Crear tabla `auction_email_verifications` en `api/config/database.js` con campos: id TEXT PK, email TEXT NOT NULL, auction_id TEXT NOT NULL (FK a auctions), code TEXT NOT NULL, attempts INTEGER DEFAULT 0, expires_at DATETIME NOT NULL, verified INTEGER DEFAULT 0, ip_address TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
- [x] 1.3 Añadir índice `idx_auction_email_verif_email_auction` en (email, auction_id) sobre `auction_email_verifications`

## 2. Backend — Conteo de productos en listado admin

- [x] 2.1 Modificar `listAuctions` en `api/services/auctionService.js` para usar subqueries que calculen `product_count` como `(SELECT COUNT(*) FROM auction_arts WHERE auction_id = a.id) + (SELECT COUNT(*) FROM auction_others WHERE auction_id = a.id)`, usando alias `a` para la tabla auctions

## 3. Backend — Funciones de servicio para verificación de subastas

- [x] 3.1 Añadir función `validateDNI(dni)` en `api/services/auctionService.js` (replicar algoritmo NIF de `drawService.js`: letras DNI_LETTERS, validar formato 8 dígitos + letra y NIE X/Y/Z + 7 dígitos + letra)
- [x] 3.2 Añadir función `checkEmailUniqueness(auctionId, email)` que consulta `auction_buyers` para verificar si el email ya existe en esa subasta
- [x] 3.3 Añadir función `checkDniUniqueness(auctionId, dni)` que consulta `auction_buyers` para verificar si el DNI ya existe en esa subasta
- [x] 3.4 Añadir función `hasBuyerCompletedRegistration(auctionId, email, dni)` que verifica si un buyer con ese email o DNI tiene un registro en `auction_buyers` Y un registro en `auction_authorised_payment_data` (JOIN entre ambas tablas)
- [x] 3.5 Añadir función `createEmailVerification(email, auctionId, ipAddress)` que genera código OTP de 6 dígitos, elimina verificaciones previas para ese email+auctionId, inserta nuevo registro con expiración de 10 minutos, y retorna el código
- [x] 3.6 Añadir función `verifyEmailCode(auctionId, email, code)` que busca la verificación más reciente no expirada, valida intentos (<5), compara código, y marca como verified
- [x] 3.7 Exportar todas las nuevas funciones en el module.exports de `auctionService.js`

## 4. Backend — Validadores Zod

- [x] 4.1 Crear archivo `api/validators/auctionSchemas.js` con schemas `sendVerificationSchema` (body: email string required, dni string required) y `verifyEmailSchema` (body: email string required, code string required)
- [x] 4.2 Exportar ambos schemas desde el módulo

## 5. Backend — Controller y rutas de verificación

- [x] 5.1 Añadir función `sendVerification` en `api/controllers/auctionController.js` que: valida DNI con `auctionService.validateDNI`, comprueba unicidad de email con `checkEmailUniqueness` (si no es único, llama a `hasBuyerCompletedRegistration` → error 409 si completado), comprueba unicidad de DNI con `checkDniUniqueness` (misma lógica), genera y envía OTP
- [x] 5.2 Añadir función `verifyEmail` en `api/controllers/auctionController.js` que llama a `auctionService.verifyEmailCode` y responde success/error
- [x] 5.3 Exportar `sendVerification` y `verifyEmail` desde el controller
- [x] 5.4 Añadir rutas en `api/routes/auctionRoutes.js`: `POST /:id/send-verification` con `sensitiveLimiter` y `validate(sendVerificationSchema)`, y `POST /:id/verify-email` con `sensitiveLimiter` y `validate(verifyEmailSchema)`
- [x] 5.5 Importar `sensitiveLimiter` y `validate` y los schemas de auctionSchemas en auctionRoutes.js

## 6. Backend — Email de verificación

- [x] 6.1 Añadir función `sendAuctionVerificationEmail({ email, code })` en `api/services/emailService.js` con template HTML análogo al de `sendDrawVerificationEmail` pero referenciando "subasta" en lugar de "sorteo"

## 7. Backend — Modificar register-buyer para incluir DNI

- [x] 7.1 Modificar `registerBuyer` en `auctionController.js` para extraer `dni` del body y pasarlo a `createOrGetAuctionBuyer`
- [x] 7.2 Modificar `createOrGetAuctionBuyer` en `auctionService.js` para incluir `dni` en el INSERT y en la búsqueda de buyer existente (buscar por email AND auction_id, o por dni AND auction_id)
- [x] 7.3 Actualizar la validación del controller para requerir `dni` además de `firstName`, `lastName` y `email`

## 8. Frontend — API client

- [x] 8.1 Añadir método `sendVerification(auctionId, email, dni)` en el módulo de auctions de `client/lib/api.js` que hace POST a `/auctions/${auctionId}/send-verification` con body `{ email, dni }`
- [x] 8.2 Añadir método `verifyEmail(auctionId, email, code)` en el módulo de auctions de `client/lib/api.js` que hace POST a `/auctions/${auctionId}/verify-email` con body `{ email, code }`

## 9. Frontend — BidModal paso 2 (Datos personales)

- [x] 9.1 Añadir campo `dni` al estado `personalInfo` (valor inicial: `''`)
- [x] 9.2 Añadir estado `dniError` (string), estados `otpSent`, `otpCode`, `otpVerified`, `showResend`, y ref `resendTimerRef`
- [x] 9.3 Añadir función `validateDNI(dni)` (copiar del DrawParticipationModal: constante DNI_LETTERS, validación NIE y DNI con algoritmo NIF)
- [x] 9.4 Añadir función `handleDniChange(value)` que actualiza `personalInfo.dni`, valida formato si tiene 9+ caracteres, y actualiza `dniError`
- [x] 9.5 Añadir función `handleSendVerification` que: limpia errores, llama a `auctionsAPI.sendVerification(auction.id, email, dni)`, activa `otpSent`, inicia timer de 30s para `showResend`
- [x] 9.6 Añadir función `handleVerifyOtp` que: llama a `auctionsAPI.verifyEmail(auction.id, email, code)`, activa `otpVerified`, avanza a fase DELIVERY
- [x] 9.7 Añadir función `handleResendOtp` que: limpia error, oculta resend, limpia otpCode, llama a `handleSendVerification`
- [x] 9.8 Reemplazar el `renderPersonal()` actual por la estructura del paso 2 de DrawParticipationModal: grid 2 cols para nombre/apellidos, campo email, campo DNI/NIE con validación inline, botón Continuar → formulario OTP → verificar/reenviar
- [x] 9.9 Actualizar `canProceedPersonal` (o eliminarlo) para que la lógica de habilitación del botón esté en el JSX: disabled cuando falte algún campo, haya dniError, o validateDNI falle
- [x] 9.10 Incluir `personalInfo.dni` en la llamada a `registerBuyer` en el handler que crea el buyer (enviar `dni: personalInfo.dni.toUpperCase().trim()`)
- [x] 9.11 Limpiar estados de OTP (`otpSent`, `otpCode`, `showResend`, `otpVerified`) cuando el modal se cierra o se resetea
