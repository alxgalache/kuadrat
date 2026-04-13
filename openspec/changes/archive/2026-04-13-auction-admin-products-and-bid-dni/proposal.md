## Why

El listado de subastas del panel de administración (`/admin/subastas`) muestra siempre "0" en la columna "Productos" porque el endpoint `GET /api/admin/auctions` no incluye el conteo de productos asociados a cada subasta. Además, el formulario de puja (BidModal) carece del campo DNI/NIE y la verificación de email por OTP que sí existen en el modal de participación en sorteos (DrawParticipationModal), lo que impide recopilar datos fiscales necesarios y verificar la identidad del pujador.

## What Changes

- **Endpoint admin de subastas**: Modificar la query de `listAuctions` en `auctionService.js` para incluir un campo `product_count` que sume los productos de las tablas `auction_arts` y `auction_others` para cada subasta.
- **Esquema de base de datos**: Añadir columna `dni` a la tabla `auction_buyers` en `api/config/database.js`.
- **Tabla de verificaciones de email**: Crear tabla `auction_email_verifications` en `api/config/database.js` (análoga a `draw_email_verifications`).
- **Endpoints de verificación de subastas**: Crear `POST /api/auctions/:id/send-verification` y `POST /api/auctions/:id/verify-email` en el backend, replicando la lógica de `drawController.sendVerification` y `drawController.verifyEmail` adaptada a subastas.
- **Servicio de subastas**: Añadir funciones `checkEmailUniqueness`, `checkDniUniqueness`, `hasBuyerCompletedRegistration`, `createEmailVerification`, `verifyEmailCode` y `validateDNI` en `auctionService.js`.
- **Validadores**: Crear schemas Zod para `sendVerificationSchema` y `verifyEmailSchema` en `api/validators/auctionSchemas.js`.
- **BidModal paso 2**: Reemplazar el formulario actual de datos personales por uno idéntico al paso 2 de `DrawParticipationModal`, incluyendo:
  - Campo DNI/NIE con validación inline del algoritmo NIF español
  - Flujo OTP: enviar código de verificación al email, verificar código, reenviar código
  - Validación de unicidad de email y DNI por subasta (vía el endpoint `send-verification`)
  - Layout en grid de 2 columnas para nombre/apellidos
- **API client**: Añadir funciones `sendVerification` y `verifyEmail` en el módulo de auctions del API client (`client/lib/api.js`).

## Capabilities

### New Capabilities
- `auction-admin-product-count`: Incluir conteo de productos en la respuesta del endpoint admin de listado de subastas.
- `auction-bid-dni-verification`: Añadir campo DNI/NIE y flujo de verificación de email por OTP en el modal de puja de subastas, replicando la lógica del modal de sorteos.

### Modified Capabilities

## Impact

- **Backend**: `api/config/database.js` (schema), `api/services/auctionService.js`, `api/controllers/auctionController.js`, `api/routes/auctionRoutes.js`, `api/validators/auctionSchemas.js` (nuevo), `api/services/emailService.js` (template de email de verificación de subasta).
- **Frontend**: `client/components/BidModal.js` (paso 2 refactorizado), `client/lib/api.js` (nuevos métodos API).
- **Base de datos**: Nueva columna `dni` en `auction_buyers`, nueva tabla `auction_email_verifications`.
- **Sin breaking changes**: Los datos de auction_buyers existentes tendrán `dni` como NULL, y el endpoint admin es aditivo.
