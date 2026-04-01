## Why

La comisión del dealer (`DEALER_COMMISSION`) es actualmente un valor único que se aplica tanto a productos de tipo 'art' como 'others'. Esto impide fijar porcentajes diferenciados por tipo de producto, lo cual es necesario dado que el servicio y los márgenes son distintos para obras de arte y otros productos.

## What Changes

- **Duplicar la variable de entorno**: Reemplazar `DEALER_COMMISSION` por `DEALER_COMMISSION_ART` y `DEALER_COMMISSION_OTHERS` en el backend, y `NEXT_PUBLIC_DEALER_COMMISSION` por `NEXT_PUBLIC_DEALER_COMMISSION_ART` y `NEXT_PUBLIC_DEALER_COMMISSION_OTHERS` en el frontend.
- **Aplicar la comisión correcta al crear items de pedido**: En `ordersController.js`, usar la tasa correspondiente al tipo de producto al calcular `commission_amount` para `art_order_items` y `other_order_items`.
- **Actualizar el endpoint `/api/seller/wallet`**: Devolver dos campos `commissionRateArt` y `commissionRateOthers` en lugar del actual `commissionRate`.
- **Actualizar el texto de comisión en el Monedero del seller**: Mostrar ambas tasas (ej: "Se aplica una comisión del X% en obras de arte y del Y% en otros productos").
- **Corregir bug en `confirmationScheduler.js`**: Actualmente acredita `price_at_purchase` completo al seller sin restar `commission_amount`. Corregir para que descuente la comisión, alineándolo con el comportamiento de `ordersController.js`.
- **Actualizar configuración de entorno**: `.env.example` (api y client), `docker-compose.*.yml`, `Dockerfile.staging`.

## Capabilities

### New Capabilities

_(ninguna — este cambio modifica capacidades existentes)_

### Modified Capabilities

- `seller-wallet`: El endpoint devuelve dos tasas de comisión (`commissionRateArt`, `commissionRateOthers`) en lugar de una sola. La UI muestra ambos porcentajes.
- `orders-dashboard-stats`: El texto informativo de comisión muestra ambas tasas diferenciadas por tipo de producto.

## Impact

- **Backend**: `api/config/env.js`, `api/controllers/ordersController.js`, `api/routes/sellerRoutes.js`, `api/services/emailService.js`, `api/scheduler/confirmationScheduler.js`
- **Frontend**: `client/app/orders/page.js`
- **Config/Infra**: `api/.env.example`, `client/.env.example`, `client/Dockerfile.staging`, `docker-compose.m1.yml`, `docker-compose.pre2.yml`
- **APIs afectadas**: `POST /api/orders` (cálculo interno), `GET /api/seller/wallet` (respuesta cambia — **BREAKING** para consumidores del campo `commissionRate`)
- **No hay cambios de esquema de BD**: `commission_amount` ya se almacena por item; el valor correcto se calcula al momento de crear el pedido.
