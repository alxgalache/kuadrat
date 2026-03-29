## Why

Cuando se selecciona "Ambos" en el campo "Primera milla" de la configuración Sendcloud de un seller, se almacena `pickup_dropoff` en la BD. La API de Sendcloud interpreta `pickup_dropoff` como "solo métodos que soporten ambas opciones", en vez de "todos los métodos". Para obtener todos (pickup, dropoff y pickup_dropoff), no se debe enviar el parámetro `first_mile`. Por tanto, "Ambos" debe almacenarse como valor vacío para que el backend no lo incluya en la petición a Sendcloud.

## What Changes

- El valor del `<option>` "Ambos" en el select de primera milla cambia de `pickup_dropoff` a `''` (string vacío).
- La constraint CHECK de la columna `first_mile` en `user_sendcloud_configuration` se actualiza para aceptar `''`.
- La validación Zod del campo `first_mile` se amplía para aceptar `''`.
- Los controladores y el componente frontend usan `??` (nullish coalescing) en vez de `||` para no coercionar `''` a un valor por defecto.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

(ninguna — es un cambio de valor almacenado, no de requisitos de spec)

## Impact

- **Backend**: `api/config/database.js` (CHECK constraint), `api/validators/sendcloudConfigSchemas.js` (Zod enum), `api/controllers/sendcloudConfigController.js` (CREATE fallback)
- **Frontend**: `client/components/admin/SendcloudConfigSection.js` (option value + loadConfig)
- **Comportamiento en Sendcloud provider**: `api/services/shipping/sendcloudProvider.js` ya maneja correctamente valores falsy (no envía filtro), por lo que no requiere cambios.
