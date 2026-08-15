## ADDED Requirements

### Requirement: El admin de CoA muestra el número de ejemplar
Los endpoints admin de CoA (`GET /api/admin/coa/tags`, `GET /api/admin/coa/tags/:uid`) SHALL incluir `edition_number` del tag y `edition_size` de la obra en sus respuestas. El listado `/admin/coa` y la página de detalle `/admin/coa/[uid]` SHALL mostrar "Ejemplar n de N" cuando la obra tenga `edition_size > 1` (junto al nombre de la obra o al `serial_label`); para obras únicas no se muestra nada adicional.

#### Scenario: Listado con tags de una edición
- **WHEN** un admin abre `/admin/coa` y existen varios tags de la misma obra con `edition_size = 15`
- **THEN** cada fila muestra su indicación "Ejemplar n de 15", permitiendo distinguirlos

#### Scenario: Detalle de un tag de edición
- **WHEN** un admin abre `/admin/coa/[uid]` de un tag con `edition_number = 3` y obra con `edition_size = 15`
- **THEN** el bloque de datos del tag muestra "Ejemplar 3 de 15"

#### Scenario: Detalle de un tag de obra única
- **WHEN** un admin abre el detalle de un tag con `edition_number` NULL
- **THEN** no se muestra ninguna indicación de ejemplar (comportamiento actual)
