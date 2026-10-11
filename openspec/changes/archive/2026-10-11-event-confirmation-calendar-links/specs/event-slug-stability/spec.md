## ADDED Requirements

### Requirement: Slug fijo una vez publicado el evento

`updateEvent` (`api/services/eventService.js`) SHALL regenerar el slug al cambiar el título solo si el evento está en `draft` en el momento de la edición. Fuera de `draft` SHALL conservarlo: el slug forma la URL `/live/<slug>` que ya llevan el email de confirmación, el anuncio de eventos y los calendarios de los asistentes.

#### Scenario: Evento en borrador
- **WHEN** el admin cambia el título de un evento en `draft`
- **THEN** el evento SHALL recibir un slug nuevo, generado a partir del título nuevo

#### Scenario: Evento publicado
- **WHEN** el admin cambia el título de un evento en `scheduled`, `active`, `finished` o `cancelled`
- **THEN** el slug SHALL conservar su valor anterior
- **AND** `/live/<slug anterior>` SHALL seguir mostrando el evento, con el título nuevo

#### Scenario: Publicar y retitular en la misma edición
- **WHEN** una sola edición cambia el título de un evento en `draft` y lo pasa a `scheduled`
- **THEN** el evento SHALL recibir un slug nuevo, porque estaba en `draft` al editarse
