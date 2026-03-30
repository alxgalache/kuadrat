## 1. Componente modal de puntos de entrega

- [x] 1.1 Crear el componente `client/components/seller/ServicePointsInfoModal.js` con la estructura base del modal (backdrop, cierre con X y Escape, props: `isOpen`, `onClose`, `carrier`, `country`, `postalCode`).
- [x] 1.2 Implementar el campo de búsqueda por código postal con debounce de 500ms y mínimo 4 caracteres. Utilizar el hook existente `useDebounce` de `client/hooks/useDebounce.js`.
- [x] 1.3 Implementar la carga de puntos de entrega llamando a `shippingAPI.getServicePoints(carrier, country, postalCode)` de `client/lib/api.js`. Gestionar estados de loading, error (con botón reintentar) y resultados vacíos.
- [x] 1.4 Implementar el mapa de Google Maps usando `loadGoogleMaps('places,marker')` de `client/lib/googleMaps.js`. Mostrar marcadores para cada punto, ajustar bounds automáticamente. Manejar error de carga de Maps (el listado debe seguir funcional sin mapa).
- [x] 1.5 Implementar el listado scrollable de tarjetas de puntos de entrega con: nombre, dirección, ciudad, código postal, distancia, y horarios completos de lunes a domingo. Mapear índices Sendcloud (0=Lunes...6=Domingo) a nombres en español. Mostrar "Cerrado" para días con array vacío. Mostrar múltiples franjas horarias separadas por coma.
- [x] 1.6 Implementar la interacción bidireccional mapa-listado: clic en marcador resalta tarjeta y hace scroll; clic en tarjeta centra el mapa en el marcador correspondiente.

## 2. Integración en página de pedidos del seller

- [x] 2.1 Modificar `client/app/seller/pedidos/page.js` para añadir el botón "Consultar puntos de entrega" en la fila de acciones de cada pedido. Visible solo cuando al menos un item tiene `sendcloudCarrierCode` no nulo. Extraer el carrier code del primer item con `sendcloudCarrierCode`.
- [x] 2.2 Añadir el estado del modal (`servicePointsModal: { open, carrier, country, postalCode }`) y montar el componente `ServicePointsInfoModal` en la página, pasando los props correspondientes desde los datos del pedido (`sendcloudCarrierCode`, `deliveryAddress.country`, `deliveryAddress.postalCode`).
