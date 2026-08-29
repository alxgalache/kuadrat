# catalog-pagination-ordering

## Purpose

Garantizar que los listados públicos paginados de obra y de tienda devuelvan cada fila exactamente una vez al recorrer todas las páginas, incluso cuando varias filas comparten la misma marca de tiempo de creación. Aplica a `GET /api/art` y `GET /api/others`, en `api/controllers/artController.js` y `api/controllers/othersController.js`.

## Requirements

### Requirement: Orden total determinista en los listados públicos paginados

Los listados públicos paginados de obra y de tienda (`GET /api/art` y `GET /api/others`, en `api/controllers/artController.js` y `api/controllers/othersController.js`) SHALL ordenar sus resultados por un criterio que constituya un orden **total**: al criterio de negocio `created_at DESC` se le SHALL añadir el desempate `id DESC`.

`created_at` es `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` y `CURRENT_TIMESTAMP` de SQLite tiene resolución de un segundo, de modo que dos filas creadas en el mismo segundo empatan. Con paginación por `LIMIT`/`OFFSET`, un empate sin desempate deja el orden relativo de esas filas indefinido entre consultas: dos páginas consecutivas pueden devolver la misma fila y omitir otra, que no aparecerá en ninguna página. `hasMore` sigue siendo correcto en todo momento, así que la pérdida es silenciosa.

El desempate por `id` —`INTEGER PRIMARY KEY AUTOINCREMENT`, único y no reutilizado— coincide con el orden por antigüedad, por lo que no altera el orden observable del catálogo.

Este requisito SHALL cubrirse con un test automático en `api/tests/`, en la línea de los guardianes estructurales ya existentes.

#### Scenario: Varias obras creadas en el mismo segundo

- **WHEN** el catálogo contiene más obras de las que caben en una página y varias de ellas comparten la misma marca `created_at`
- **THEN** recorrer todas las páginas consecutivas devuelve cada obra exactamente una vez, sin repeticiones ni omisiones

#### Scenario: El orden observable no cambia

- **WHEN** no hay ningún empate en `created_at`
- **THEN** el listado devuelve las obras en el mismo orden que antes del cambio

#### Scenario: El contrato de la respuesta se mantiene

- **WHEN** un cliente solicita una página del listado
- **THEN** los parámetros aceptados, la forma de la respuesta y el cálculo de `hasMore` mediante la consulta de `limit + 1` filas permanecen sin cambios
