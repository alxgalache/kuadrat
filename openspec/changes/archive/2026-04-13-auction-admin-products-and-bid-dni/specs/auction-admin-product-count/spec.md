## ADDED Requirements

### Requirement: El endpoint admin de listado de subastas incluye conteo de productos
El sistema SHALL incluir un campo `product_count` de tipo numérico en cada objeto de subasta devuelto por `GET /api/admin/auctions`. Este campo MUST representar la suma total de registros en `auction_arts` y `auction_others` asociados a esa subasta.

#### Scenario: Subasta con productos de arte y otros
- **WHEN** el admin solicita el listado de subastas y existe una subasta con 3 registros en `auction_arts` y 2 registros en `auction_others`
- **THEN** el campo `product_count` de esa subasta es `5`

#### Scenario: Subasta sin productos asociados
- **WHEN** el admin solicita el listado de subastas y existe una subasta sin registros en `auction_arts` ni en `auction_others`
- **THEN** el campo `product_count` de esa subasta es `0`

#### Scenario: Subasta filtrada por estado incluye product_count
- **WHEN** el admin solicita el listado de subastas con filtro `?status=active`
- **THEN** cada subasta devuelta incluye el campo `product_count` con el conteo correcto

### Requirement: El frontend admin muestra el conteo de productos correctamente
El frontend en `/admin/subastas` SHALL renderizar el valor de `product_count` en la columna "Productos" de la tabla de subastas.

#### Scenario: Se muestra el conteo real de productos
- **WHEN** la API devuelve una subasta con `product_count: 5`
- **THEN** la columna "Productos" muestra "5" para esa fila
