## ADDED Requirements

### Requirement: El cliente API no debe emitir console.log de depuración
El módulo `client/lib/api.js` NO DEBE contener sentencias `console.log` para registrar errores o respuestas de API. Sentry es el mecanismo de monitoreo de errores en producción.

#### Scenario: Respuesta de error de API sin log en consola
- **WHEN** el cliente API recibe una respuesta con status de error (4xx, 5xx)
- **THEN** el error se propaga al código llamante sin emitir `console.log`

#### Scenario: Respuesta exitosa de API sin log en consola
- **WHEN** el cliente API recibe una respuesta exitosa
- **THEN** la respuesta se procesa sin emitir `console.log`

### Requirement: El hook de socket de subastas no debe emitir console.log de conexión
El hook `client/hooks/useAuctionSocket.js` NO DEBE contener sentencias `console.log` que expongan URLs de conexión de Socket.IO u otra información de infraestructura.

#### Scenario: Conexión de socket sin log en consola
- **WHEN** el hook `useAuctionSocket` establece conexión con el servidor Socket.IO
- **THEN** la conexión se establece sin emitir `console.log` con la URL de conexión

### Requirement: El carrito de compras no debe emitir console.log de estado de pago
El componente `client/components/ShoppingCartDrawer.js` NO DEBE contener sentencias `console.log` para registrar estados de pago (cancelaciones, confirmaciones).

#### Scenario: Cancelación de pago Revolut sin log en consola
- **WHEN** el usuario cancela un pago con Revolut Pay
- **THEN** la cancelación se maneja sin emitir `console.log`

### Requirement: Scripts standalone del backend mantienen console.log
Los scripts CLI y de migración (`api/create-admin.js`, `api/migrations/migrate_postal_refs.js`) DEBEN mantener sus sentencias `console.log` como interfaz de feedback al operador.

#### Scenario: Script create-admin muestra progreso
- **WHEN** se ejecuta `api/create-admin.js` desde terminal
- **THEN** el script muestra mensajes de progreso via `console.log`

#### Scenario: Script de migración muestra progreso
- **WHEN** se ejecuta `api/migrations/migrate_postal_refs.js` desde terminal
- **THEN** el script muestra mensajes de progreso de cada paso via `console.log`
