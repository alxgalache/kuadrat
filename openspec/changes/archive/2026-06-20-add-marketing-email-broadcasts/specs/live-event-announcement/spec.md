## ADDED Requirements

### Requirement: Anuncio automático de evento en directo

El backend SHALL enviar automáticamente un anuncio de evento al segmento newsletter scoped al topic *Programación de eventos en directo* cuando un evento entra por primera vez en estado `scheduled`, ya sea al crearse o al transicionar a dicho estado.

#### Scenario: Evento programado
- **WHEN** un evento se crea con estado `scheduled` o transiciona a `scheduled` por primera vez
- **THEN** el sistema dispara el anuncio al topic *Programación de eventos en directo* tras confirmar la escritura en base de datos

#### Scenario: Envío único
- **WHEN** un evento ya anunciado se edita o vuelve a guardarse en estado `scheduled`
- **THEN** el sistema no envía un segundo anuncio para ese evento

#### Scenario: Estado no cualificado
- **WHEN** un evento permanece en `draft` (u otro estado no cualificado)
- **THEN** el sistema no envía ningún anuncio

### Requirement: Contenido del anuncio de evento

El anuncio de evento SHALL incluir un texto introductorio y la información del evento: título, descripción, imagen de portada (como URL absoluta), fecha/hora del evento y categoría.

#### Scenario: Datos del evento en el correo
- **WHEN** se renderiza el anuncio de un evento
- **THEN** el correo muestra el título, la descripción, la imagen de portada mediante una URL absoluta, la fecha/hora del evento y su categoría
- **AND** los campos ausentes se omiten sin romper el diseño
