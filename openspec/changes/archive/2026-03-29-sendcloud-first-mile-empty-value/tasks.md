## 1. Backend — Schema y validación

- [x] 1.1 **[HIGH-RISK]** Actualizar CHECK constraint en `api/config/database.js:653` — añadir `''` a la lista de valores permitidos para `first_mile`: `CHECK(first_mile IN ('pickup', 'dropoff', 'pickup_dropoff', 'fulfilment', ''))`
- [x] 1.2 Actualizar Zod enum en `api/validators/sendcloudConfigSchemas.js:18` — cambiar `z.enum(['pickup', 'dropoff', 'pickup_dropoff'])` a `z.enum(['pickup', 'dropoff', 'pickup_dropoff', ''])`

## 2. Backend — Controller

- [x] 2.1 Actualizar fallback en CREATE en `api/controllers/sendcloudConfigController.js:92` — cambiar `body.first_mile || 'dropoff'` por `body.first_mile ?? 'dropoff'`

## 3. Frontend — Componente SendcloudConfigSection

- [x] 3.1 Cambiar valor del option "Ambos" en `client/components/admin/SendcloudConfigSection.js:223` — de `value="pickup_dropoff"` a `value=""`
- [x] 3.2 Cambiar fallback en `loadConfig` en `client/components/admin/SendcloudConfigSection.js:62` — de `data.first_mile || 'dropoff'` a `data.first_mile ?? 'dropoff'`
