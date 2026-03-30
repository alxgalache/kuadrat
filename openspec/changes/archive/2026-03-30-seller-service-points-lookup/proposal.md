## Why

Los sellers necesitan consultar los puntos de entrega cercanos a la dirección de destino de un pedido para poder depositar sus envíos. Actualmente solo los compradores pueden ver los service points durante el checkout. Los sellers no tienen visibilidad sobre qué puntos de entrega están disponibles ni sus horarios de apertura, lo que les obliga a buscar esta información fuera de la plataforma.

## What Changes

- Nuevo botón "Consultar puntos de entrega" en cada pedido del panel "Mis envíos" (`seller/pedidos`), visible junto a los botones existentes ("Descargar etiqueta", "Programar recogida").
- El botón solo aparece en pedidos que tengan un carrier asociado (`sendcloudCarrierCode`).
- Al pulsar el botón se abre un modal con un mapa de Google Maps y un listado de puntos de entrega.
- El modal incluye un campo de código postal para buscar puntos de entrega cercanos (inicializado con el código postal de la dirección de entrega del pedido).
- A diferencia del selector del checkout, este modal es puramente informativo: no hay selección ni confirmación. El seller consulta ubicación, dirección, distancia y **horario completo de todos los días** (no solo el día actual).
- Se reutiliza el endpoint público existente `GET /api/shipping/service-points` sin modificaciones de backend.

## Capabilities

### New Capabilities

- `seller-service-points-modal`: Modal informativo de consulta de puntos de entrega para sellers, con mapa y horarios completos por día de la semana.

### Modified Capabilities

_(ninguna — el endpoint existente se reutiliza sin cambios)_

## Impact

- **Frontend**: Nuevo componente modal en `client/components/seller/`. Modificación de `client/app/seller/pedidos/page.js` para añadir el botón y montar el modal.
- **Backend**: Sin cambios. Se reutiliza `GET /api/shipping/service-points` (endpoint público, sin autenticación requerida).
- **Dependencias**: Reutiliza `client/lib/googleMaps.js` (carga singleton de Google Maps API) y `shippingAPI.getServicePoints()` de `client/lib/api.js`.
- **APIs externas**: Sendcloud Service Points API (misma llamada que el checkout, sin impacto adicional).
