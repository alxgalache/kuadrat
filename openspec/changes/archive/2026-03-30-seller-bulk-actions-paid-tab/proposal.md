## Why

Los sellers necesitan programar recogidas y consultar puntos de entrega a nivel global (no solo por pedido individual) para gestionar múltiples envíos del mismo transportista en una sola operación. Actualmente deben abrir cada tarjeta de pedido individualmente, lo cual es ineficiente cuando tienen muchos envíos pagados del mismo carrier. Además, no se muestra qué empresa de transporte gestiona cada envío, lo que dificulta la identificación rápida.

## What Changes

- **Acciones globales en pestaña "Pagados"**: Se añaden dos botones ("Programar recogida" y "Consultar puntos de entrega") encima del listado de pedidos, visibles solo en la pestaña "Pagados".
- **Modal de recogida masiva (BulkPickupModal)**: Al pulsar "Programar recogida" se abre un modal con un select de carriers disponibles (extraídos de los pedidos pagados actuales). Al seleccionar carrier, se muestra un listado con checkboxes para seleccionar los pedidos/parcels deseados. Tras la selección se muestra el mismo formulario de dirección y horario que el PickupModal actual. La petición a Sendcloud `/v3/pickups` incluye todos los items seleccionados.
- **Modal de puntos de entrega global (BulkServicePointsModal)**: Al pulsar "Consultar puntos de entrega" se abre un modal con un select de carriers. Al seleccionar carrier, se muestra la misma vista de ServicePointsInfoModal (mapa + listado de service points).
- **Carrier visible en tarjetas de pedido**: Se muestra "Empresa de envío: {carrier}" debajo de la dirección de entrega en cada tarjeta de pedido.
- **Nuevo endpoint backend para recogida masiva**: POST `/api/seller/orders/bulk-pickup` que acepta múltiples order IDs y crea un único pickup en Sendcloud con todos los items agregados.

## Capabilities

### New Capabilities
- `seller-bulk-pickup`: Modal de recogida masiva con selección de carrier, selección de pedidos por checkbox, y envío agrupado a Sendcloud `/v3/pickups`.
- `seller-bulk-service-points`: Modal global de consulta de puntos de entrega con selección de carrier, reutilizando la vista existente de ServicePointsInfoModal.

### Modified Capabilities
- `sendcloud-seller-orders`: Se añade la visualización del carrier en cada tarjeta de pedido y los botones de acciones globales en la pestaña "Pagados".

## Impact

- **Frontend**: `client/app/seller/pedidos/page.js` (botones globales + carrier en tarjetas), dos nuevos componentes modales en `client/components/seller/`.
- **Backend**: Nuevo endpoint `POST /seller/orders/bulk-pickup` en `api/controllers/sellerOrdersController.js` y `api/routes/sellerRoutes.js`. Nuevo schema de validación en `api/validators/`.
- **API externa**: Misma integración con Sendcloud `/v3/pickups`, pero con múltiples items en una sola petición.
- **Base de datos**: La tabla `sendcloud_pickups` almacenará pickups con múltiples order_ids (se necesita considerar cómo referenciar múltiples pedidos en un solo pickup).
