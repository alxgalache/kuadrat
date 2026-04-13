## Context

El panel de administración de subastas (`/admin/subastas`) muestra un listado de subastas con columnas de nombre, fechas, estado y "Productos". El frontend espera un campo `product_count` en cada objeto de subasta, pero el endpoint `GET /api/admin/auctions` ejecuta un simple `SELECT * FROM auctions` sin joins, por lo que `product_count` es siempre `undefined` (renderizado como `0`).

Por otro lado, el flujo de puja (BidModal) solo recoge nombre, apellidos y email. El modal de sorteos (DrawParticipationModal) implementa un paso 2 más completo que incluye DNI/NIE con validación NIF española, verificación de unicidad de email y DNI por sorteo, y un flujo OTP de verificación de email. El objetivo es replicar esta misma lógica en el BidModal para subastas.

Actualmente, las subastas no disponen de:
- Columna `dni` en la tabla `auction_buyers`
- Tabla de verificaciones de email (`auction_email_verifications`)
- Endpoints `send-verification` ni `verify-email`
- Funciones de servicio para verificar unicidad de email/DNI por subasta

## Goals / Non-Goals

**Goals:**
- El endpoint admin de listado de subastas incluye `product_count` (suma de `auction_arts` + `auction_others`) para cada subasta.
- El paso 2 del BidModal recoge DNI/NIE, lo valida con el algoritmo NIF español, verifica unicidad de email y DNI por subasta, y completa un flujo OTP antes de avanzar.
- La base de datos soporta almacenar DNI en `auction_buyers` y verificaciones de email en `auction_email_verifications`.
- Los nuevos endpoints están protegidos con rate limiting (`sensitiveLimiter`) y validación Zod.

**Non-Goals:**
- No se modifica el flujo de compradores recurrentes (`verify-buyer` con bid_password).
- No se añade verificación de email retroactiva a subastas ya existentes.
- No se modifica la lógica de pujas (`placeBid`) ni la autorización de pago.
- No se añade DNI al flujo de verificación de compradores recurrentes (solo al registro inicial).

## Decisions

### 1. Product count vía subqueries en la query de listado

**Decisión**: Usar subqueries `(SELECT COUNT(*) FROM auction_arts WHERE auction_id = a.id) + (SELECT COUNT(*) FROM auction_others WHERE auction_id = a.id) AS product_count` en la query de `listAuctions`.

**Alternativa considerada**: JOIN con GROUP BY. Descartada porque complica la query y puede producir duplicados si se añaden más joins en el futuro. Las subqueries son simples y el volumen de subastas es bajo (decenas, no miles).

### 2. Replicar la estructura de `draw_email_verifications` para subastas

**Decisión**: Crear `auction_email_verifications` con la misma estructura que `draw_email_verifications` (id, email, auction_id, code, attempts, expires_at, verified, ip_address, created_at).

**Razonamiento**: Mantiene consistencia con el patrón existente. No reutilizamos la tabla de draws porque cada dominio (sorteos, subastas) gestiona su ciclo de vida de verificación de forma independiente.

### 3. Replicar funciones de servicio en `auctionService.js`

**Decisión**: Crear `checkEmailUniqueness`, `checkDniUniqueness`, `hasBuyerCompletedRegistration`, `createEmailVerification`, `verifyEmailCode` y `validateDNI` directamente en `auctionService.js`, adaptadas de las funciones equivalentes en `drawService.js`.

**Alternativa considerada**: Extraer a un módulo compartido (`utils/identityVerification.js`). Descartada porque la lógica de "participación completada" difiere entre sorteos y subastas (draw_participations vs auction_authorised_payment_data + auction_bids), y la duplicación es mínima y contenida.

### 4. `hasBuyerCompletedRegistration` para subastas

**Decisión**: Considerar que un buyer ha "completado el registro" en una subasta cuando existe un registro en `auction_buyers` con ese email o DNI Y además tiene payment data en `auction_authorised_payment_data`. Esto es análogo a `hasBuyerCompletedParticipation` en draws (que verifica `draw_participations`).

**Razonamiento**: Un buyer que solo se registró pero no completó el pago de autorización puede reintentar el proceso. Solo si tiene el pago completado se bloquea el re-registro.

### 5. Columna `dni` como TEXT nullable en `auction_buyers`

**Decisión**: Añadir `dni TEXT` (nullable) a la tabla `auction_buyers`. Los registros existentes tendrán `dni = NULL`.

**Razonamiento**: Mantener retrocompatibilidad. La columna se convierte en obligatoria a nivel de aplicación (validación Zod + frontend), pero el schema permite NULL para datos históricos.

### 6. Enviar DNI en el `register-buyer` de subastas

**Decisión**: Modificar el endpoint `POST /api/auctions/:id/register-buyer` para aceptar y almacenar el campo `dni`. El INSERT y la query de existencia se actualizan para incluir `dni`.

### 7. Template de email de verificación de subasta

**Decisión**: Reutilizar la función `sendDrawVerificationEmail` renombrada/generalizada o crear una nueva `sendAuctionVerificationEmail` en `emailService.js` con la misma estructura pero referenciando "subasta" en lugar de "sorteo".

## Risks / Trade-offs

- **[Migración de datos]**: Subastas existentes con buyers sin DNI seguirán funcionando porque `dni` es nullable en DB. → Sin mitigación necesaria; es solo para nuevos registros.
- **[Duplicación de lógica]**: Las funciones de verificación son similares entre draws y auctions. → Aceptamos la duplicación por simplicidad y porque la lógica de "completado" difiere. Se puede refactorizar en el futuro si se añade un tercer flujo.
- **[Performance de subqueries]**: Las subqueries de conteo en `listAuctions` ejecutan una query por subasta. → Aceptable porque el número de subastas es bajo. Si crece, se puede añadir un índice o campo calculado.
