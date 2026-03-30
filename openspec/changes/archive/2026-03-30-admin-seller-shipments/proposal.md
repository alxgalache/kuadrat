## Why

El administrador necesita visibilidad sobre los envíos de cada vendedor para supervisar el estado de los pedidos sin tener que acceder a la cuenta de cada seller. Actualmente solo los sellers pueden ver sus propios envíos en `/seller/pedidos`. El admin carece de una vista consolidada por vendedor que muestre los mismos datos (imágenes, estado, dirección, carrier) sin las acciones operativas propias del seller.

## What Changes

- **Nueva página admin de envíos por vendedor**: Se crea una nueva página en `/admin/envios-seller` que replica la vista de "Mis envíos" del seller, pero en modo solo lectura para el admin.
- **Selector de vendedor**: Al entrar, la página muestra un select con todos los sellers/artistas. El listado de envíos empieza vacío hasta que se seleccione un vendedor.
- **Vista de envíos por pestañas**: Una vez seleccionado un vendedor, los envíos se muestran con las mismas pestañas de estado (Todos, Pagados, Enviados, Entregados, Confirmados) y las mismas tarjetas (imágenes, dirección, carrier, estado).
- **Sin acciones operativas**: No se muestran los botones "Descargar etiqueta", "Programar recogida", "Consultar puntos de entrega", ni las acciones masivas.
- **Nuevo endpoint backend**: `GET /api/admin/orders/seller-shipments?sellerId=X&status=Y&page=Z` que reutiliza la misma lógica de `getSellerOrders` pero recibe el `sellerId` como parámetro en lugar de extraerlo del JWT.
- **Enlace en navegación admin**: Se añade la entrada "Envíos vendedor" en el menú de navegación del admin.

## Capabilities

### New Capabilities
- `admin-seller-shipments-page`: Página admin para visualizar los envíos de cualquier vendedor, con selector de vendedor, pestañas de estado, y tarjetas de pedido en modo solo lectura.

### Modified Capabilities

(ninguna)

## Impact

- **Frontend**: Nueva página `client/app/admin/envios-seller/page.js`. Modificación de `client/components/Navbar.js` para añadir enlace en menú admin.
- **Backend**: Nuevo endpoint en `api/routes/admin/orderRoutes.js` que reutiliza la lógica de consulta de `sellerOrdersController.js`.
- **API client**: Nuevo método en `adminAPI.orders` en `client/lib/api.js`.
