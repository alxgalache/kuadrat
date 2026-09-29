# live-event-announcement Specification

## Purpose

Definir el anuncio automático de evento en directo hacia el segmento newsletter scoped al topic *Programación de eventos en directo*, incluyendo el disparo por estado, el envío único y el contenido del correo.

## Requirements

### Requirement: Anuncio automático de evento en directo

El backend SHALL enviar automáticamente un anuncio de evento al segmento newsletter, limitado al topic *Programación de eventos en directo*, cuando un evento **que no está marcado como prueba** (`is_test = 0`) entra por primera vez en estado `scheduled`, ya sea al crearse o al pasar a ese estado. Un evento marcado como prueba SHALL NOT anunciarse nunca mientras conserve la marca.

#### Scenario: Evento programado
- **WHEN** un evento con `is_test = 0` se crea con estado `scheduled` o pasa a `scheduled` por primera vez
- **THEN** el sistema dispara el anuncio al topic *Programación de eventos en directo* tras confirmar la escritura en base de datos

#### Scenario: Envío único
- **WHEN** un evento ya anunciado se edita o vuelve a guardarse en estado `scheduled`
- **THEN** el sistema no envía un segundo anuncio para ese evento

#### Scenario: Estado no cualificado
- **WHEN** un evento permanece en `draft` (u otro estado no cualificado)
- **THEN** el sistema no envía ningún anuncio

#### Scenario: Evento de prueba
- **WHEN** un evento con `is_test = 1` se crea con estado `scheduled`, pasa a `scheduled` o se edita en ese estado
- **THEN** el sistema no envía ningún anuncio ni registra ningún envío

#### Scenario: Prueba convertida en evento real
- **WHEN** un evento `scheduled` que nunca se anunció pasa de `is_test = 1` a `is_test = 0`
- **THEN** el sistema envía el anuncio en ese guardado, como en cualquier evento que entra en `scheduled`

### Requirement: Contenido del anuncio de evento

El anuncio de evento SHALL incluir un texto introductorio y la información del evento: título, descripción, imagen de portada (como URL absoluta), fecha/hora del evento y categoría.

#### Scenario: Datos del evento en el correo
- **WHEN** se renderiza el anuncio de un evento
- **THEN** el correo muestra el título, la descripción, la imagen de portada mediante una URL absoluta, la fecha/hora del evento y su categoría
- **AND** los campos ausentes se omiten sin romper el diseño
