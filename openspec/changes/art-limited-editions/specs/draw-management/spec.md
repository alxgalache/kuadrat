## ADDED Requirements

### Requirement: `units` validado contra la disponibilidad de la edición
La creación y la edición de sorteos (`POST /api/admin/draws`, `PUT /api/admin/draws/:id`) SHALL validar que, cuando el producto del sorteo es de tipo `art`, `units` no exceda los ejemplares disponibles de la edición (`edition_size - editions_sold`) en el momento de la operación, rechazando con 400 y mensaje es-ES en caso contrario. `units` SHALL ser un entero mínimo 1. Para productos `other` el comportamiento actual no cambia.

El sorteo SHALL NO pre-reservar ejemplares al crearse ni al activarse: el consumo de inventario ocurre exclusivamente al facturar cada participación ganadora.

#### Scenario: Creación de sorteo dentro de la disponibilidad
- **WHEN** un admin crea un sorteo sobre una obra con `edition_size = 15` y `editions_sold = 3`, con `units = 5`
- **THEN** el sorteo se crea correctamente

#### Scenario: Creación de sorteo que excede la disponibilidad
- **WHEN** un admin crea un sorteo sobre una obra con `edition_size = 15` y `editions_sold = 12`, con `units = 5`
- **THEN** la petición se rechaza con 400 y un mensaje es-ES indicando que solo quedan 3 ejemplares disponibles

#### Scenario: Sorteo sobre obra única
- **WHEN** un admin crea un sorteo sobre una obra con `edition_size = 1` no vendida, con `units = 1`
- **THEN** el sorteo se crea correctamente (comportamiento actual)

#### Scenario: La creación del sorteo no consume inventario
- **WHEN** un sorteo con `units = 5` se crea y se activa sobre una obra con edición
- **THEN** `editions_sold` de la obra no cambia hasta que se facturen participaciones ganadoras
