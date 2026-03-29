## Context

El campo `first_mile` en `user_sendcloud_configuration` almacena la preferencia de primera milla del seller para la API de Sendcloud. Actualmente, "Ambos" guarda `pickup_dropoff`, pero la API de Sendcloud interpreta ese valor como "solo métodos que soporten ambas opciones simultáneamente". Para obtener todos los métodos (pickup, dropoff y pickup_dropoff), no se debe enviar el parámetro. El valor vacío `''` en la BD indicará "no filtrar por primera milla".

## Goals / Non-Goals

**Goals:**
- Que "Ambos" almacene `''` en la BD para que el backend no envíe `first_mile` a Sendcloud
- Mantener retrocompatibilidad: las filas existentes con `pickup_dropoff` seguirán funcionando (se verán como "Ambos" en el UI y el provider ya no les enviará filtro)

**Non-Goals:**
- Migrar datos existentes en la BD (no es necesario; el frontend al re-guardar actualizará el valor)
- Cambiar el comportamiento de `pickup` o `dropoff`

## Decisions

### Usar string vacío `''` en vez de NULL
El campo es `NOT NULL DEFAULT 'dropoff'`. Usar `''` requiere solo añadir `''` al CHECK constraint, sin cambiar la nullabilidad. Si usáramos NULL, habría que eliminar `NOT NULL` y propagar nullable por toda la cadena.

### Usar `??` (nullish coalescing) en vez de `||`
En los puntos donde se aplica un default (`loadConfig` en frontend, `CREATE` en backend), `||` trata `''` como falsy y lo sustituye por `'dropoff'`. Con `??`, solo se aplica el default cuando el valor es `null` o `undefined`.

### No modificar `sendcloudProvider.js`
La línea `if (sellerConfig.first_mile)` ya trata `''` como falsy y no envía el filtro. El comportamiento deseado ya está implementado.

### Tratar `pickup_dropoff` como equivalente a `''` en el frontend
En `loadConfig`, cuando se carga un valor existente `pickup_dropoff` de la BD, se mostrará como "Ambos" en el select. Al leer un `''`, también se mostrará como "Ambos" porque el select tendrá `<option value="">Ambos</option>`.

## Risks / Trade-offs

- **Registros existentes con `pickup_dropoff`**: Seguirán enviando el filtro a Sendcloud hasta que el admin re-guarde la configuración de ese seller. Esto es aceptable porque el comportamiento actual ya es el que se quiere corregir. Riesgo bajo.
- **CHECK constraint más permisivo**: Añadir `''` al CHECK es seguro, no afecta a ningún otro valor existente.
