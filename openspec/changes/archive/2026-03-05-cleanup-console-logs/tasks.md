## 1. Cliente API — Eliminar console.log de depuración

- [x] 1.1 Eliminar `console.log('API Error:', data)` en `client/lib/api.js` línea 93
- [x] 1.2 Eliminar `console.log('API Response:', response.status)` en `client/lib/api.js` línea 94

## 2. Hook de Subastas — Eliminar console.log de conexión

- [x] 2.1 Eliminar `console.log('[useAuctionSocket] Connecting to:', SOCKET_URL)` en `client/hooks/useAuctionSocket.js` línea 51

## 3. Carrito de Compras — Eliminar console.log de estado de pago

- [x] 3.1 Eliminar `console.log('Revolut Pay cancelled by user')` en `client/components/ShoppingCartDrawer.js` línea 1123

## 4. Verificación

- [x] 4.1 Verificar que no quedan `console.log` en código de producción del frontend (excluir node_modules)
- [x] 4.2 Confirmar que los `console.log` de scripts standalone del backend (`api/create-admin.js`, `api/migrations/migrate_postal_refs.js`) siguen intactos
