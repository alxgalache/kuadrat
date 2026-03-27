## Why

La página "Mis envíos" del seller (`/seller/pedidos`) muestra actualmente los items de cada pedido como tarjetas individuales separadas, tiene un ancho inconsistente con el resto de la aplicación (`max-w-4xl` vs `max-w-7xl`), ordena por `status_modified` en lugar de por fecha de creación, y carece de la funcionalidad de programar recogidas a domicilio vía Sendcloud. Los sellers que operan con `first_mile='pickup'` no tienen forma de solicitar que el transportista pase a recoger los paquetes desde la propia plataforma.

## What Changes

- **Layout**: Ancho del contenedor cambia de `max-w-4xl` a `max-w-7xl` (consistente con admin y otras páginas seller).
- **Agrupación por pedido**: El endpoint backend devuelve datos agrupados por `order_id` en vez de items sueltos. Paginación por pedidos. Ordenación por `created_at` DESC.
- **Nueva tarjeta de pedido**: Fila horizontal de imágenes de productos (con badge de cantidad por producto+variante y nombre de variante debajo), información del pedido (fecha, dirección de entrega), y fila horizontal de acciones (descargar etiqueta, ver seguimiento, programar recogida).
- **Programar recogida (pickup)**: Nuevo botón visible solo si `first_mile='pickup'` o vacío/null. Abre modal con formulario de dirección (checkbox "usar dirección por defecto" del seller), intervalo de tiempo (datetime inicio/fin), e instrucciones especiales. Crea pickup en Sendcloud vía `POST /v3/pickups`. Al completarse, los items del seller en el pedido pasan a status `sent`.
- **Persistencia de carrier code**: Nueva columna `sendcloud_carrier_code` en `art_order_items` y `other_order_items`, poblada al crear shipments.
- **Tabla de pickups**: Nueva tabla `sendcloud_pickups` para registrar los pickups programados con su estado.
- **Email de notificación**: `sendSellerNewOrderEmail` incluye siempre un warning informativo sobre la opción de programar recogida y el plazo de 7 días.

## Capabilities

### New Capabilities
- `seller-order-pickup`: Funcionalidad de programar recogida a domicilio vía Sendcloud para pedidos del seller. Incluye endpoint backend, integración con Sendcloud Pickups API, tabla de persistencia, modal de formulario frontend, y cambio automático de estado a `sent`.
- `seller-orders-redesign`: Rediseño de la vista de pedidos del seller con agrupación por order_id, nueva estructura de tarjetas, respuesta backend reestructurada con sellerConfig incluida, y layout consistente con el resto de la app.
- `seller-order-email-pickup-warning`: Inclusión de warning informativo sobre recogida y plazo de 7 días en el email de nuevo pedido al seller.

### Modified Capabilities
<!-- No existing specs are being modified at the requirement level -->

## Impact

- **Backend API**: Cambio en la estructura de respuesta de `GET /api/seller/orders` (breaking para el frontend actual). Nuevo endpoint `POST /api/seller/orders/:orderId/pickup`.
- **Base de datos**: Nuevas columnas en `art_order_items` y `other_order_items`. Nueva tabla `sendcloud_pickups`. Nuevos índices.
- **Sendcloud Provider**: Nueva función `createPickup`. Modificación de `createShipments` para extraer y retornar `carrier_code`.
- **Payments Controller**: Almacena `carrier_code` al crear shipments.
- **Email Service**: Modificación del HTML de `sendSellerNewOrderEmail`.
- **Frontend**: Rediseño completo de `client/app/seller/pedidos/page.js`. Nuevo componente `PickupModal`. Nuevos métodos en `sellerAPI`.
- **Validación**: Nuevo schema Zod para pickup request.
