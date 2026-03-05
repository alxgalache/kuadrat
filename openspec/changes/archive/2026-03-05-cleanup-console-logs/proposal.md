## Why

El proyecto utiliza Pino como logger estructurado en el backend (`api/config/logger.js`), pero aún existen `console.log` residuales en scripts de utilidad, migraciones, y en el cliente. En el frontend, los `console.log` de depuración exponen información innecesaria en producción (URLs de socket, errores de API, estados de pago). Eliminarlos mejora la higiene del código, reduce ruido en consola de producción y alinea el proyecto con su propia convención de "no console.log en código de producción".

## What Changes

- **Eliminar** `console.log` de depuración en `client/lib/api.js` (logs de errores y respuestas de API)
- **Eliminar** `console.log` de depuración en `client/hooks/useAuctionSocket.js` (log de conexión socket)
- **Eliminar** `console.log` en `client/components/ShoppingCartDrawer.js` (log de cancelación Revolut Pay)
- **Mantener** `console.log` en `api/create-admin.js` (script CLI standalone, no código de producción)
- **Mantener** `console.log` en `api/migrations/migrate_postal_refs.js` (script de migración standalone, no código de producción)

## Capabilities

### New Capabilities

- `console-log-cleanup`: Eliminación de sentencias `console.log` innecesarias del código de producción en api/ y client/

### Modified Capabilities

_(ninguna — no cambian requisitos de capacidades existentes)_

## Impact

- **Frontend:** 3 archivos modificados (`client/lib/api.js`, `client/hooks/useAuctionSocket.js`, `client/components/ShoppingCartDrawer.js`)
- **Backend:** Sin cambios (los `console.log` existentes están en scripts CLI/migración standalone, no en código de servidor)
- **APIs:** Sin cambios
- **Dependencias:** Ninguna
