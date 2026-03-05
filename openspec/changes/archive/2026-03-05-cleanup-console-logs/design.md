## Context

El proyecto Kuadrat usa Pino como logger estructurado en el backend, con la convención explícita de "no console.log en código de producción". Sin embargo, existen `console.log` residuales en 3 archivos del frontend (código de producción) y 2 archivos del backend (scripts standalone CLI/migración).

Los `console.log` encontrados:
- **`client/lib/api.js`** (líneas 93-94): Log de errores y respuestas de API — información de depuración que no debería exponerse en producción.
- **`client/hooks/useAuctionSocket.js`** (línea 51): Log de URL de conexión Socket.IO — expone detalles de infraestructura.
- **`client/components/ShoppingCartDrawer.js`** (línea 1123): Log de cancelación de Revolut Pay — información de depuración sin valor en producción.
- **`api/create-admin.js`**: Script CLI standalone para crear admin — logs son la interfaz de usuario del script.
- **`api/migrations/migrate_postal_refs.js`**: Script de migración standalone — logs son la interfaz de progreso.

## Goals / Non-Goals

**Goals:**
- Eliminar todos los `console.log` de depuración del código de producción del frontend
- Mantener comportamiento funcional idéntico tras la eliminación

**Non-Goals:**
- No se modifican scripts standalone del backend (`create-admin.js`, migraciones) — sus `console.log` son su interfaz de salida legítima
- No se introduce un sistema de logging en el frontend (no hay Pino ni similar en client/)
- No se eliminan `console.warn` ni `console.error` (estos pueden tener valor en producción)

## Decisions

### 1. Eliminar sin reemplazar
**Decisión:** Los `console.log` del frontend se eliminan completamente, sin reemplazarlos por otro mecanismo de logging.
**Alternativas consideradas:** Introducir un logger de frontend (descartado — sobrecarga innecesaria para esta app). El monitoreo de errores ya lo cubre Sentry.
**Rationale:** Estos logs son puramente de depuración y no aportan valor en producción. Sentry captura errores reales.

### 2. Mantener scripts CLI/migración intactos
**Decisión:** Los `console.log` en `api/create-admin.js` y `api/migrations/migrate_postal_refs.js` se mantienen.
**Rationale:** Son scripts que se ejecutan manualmente desde terminal. Sus `console.log` son la interfaz de usuario (feedback de progreso), no logs de depuración.

## Risks / Trade-offs

- **[Pérdida de visibilidad en depuración]** → Mitigación: Sentry captura errores reales; para depuración local se pueden añadir console.log temporales.
- **[Riesgo mínimo de regresión]** → Mitigación: Solo se eliminan sentencias de log, no lógica de negocio.
