# draw-announcement Specification

## Purpose

Definir el anuncio automático de sorteo hacia el segmento newsletter scoped al topic *Subastas y sorteos*, incluyendo el disparo por estado, el envío único y el contenido del correo.

## Requirements

### Requirement: Anuncio automático de sorteo

El backend SHALL enviar automáticamente un anuncio de sorteo al segmento newsletter scoped al topic *Subastas y sorteos* cuando un sorteo entra por primera vez en estado `scheduled`, ya sea al crearse o al transicionar a dicho estado.

#### Scenario: Sorteo programado
- **WHEN** un sorteo se crea con estado `scheduled` o transiciona a `scheduled` por primera vez
- **THEN** el sistema dispara el anuncio al topic *Subastas y sorteos* tras confirmar la escritura en base de datos

#### Scenario: Envío único
- **WHEN** un sorteo ya anunciado se edita o vuelve a guardarse en estado `scheduled`
- **THEN** el sistema no envía un segundo anuncio para ese sorteo

#### Scenario: Estado no cualificado
- **WHEN** un sorteo permanece en `draft` (u otro estado no cualificado)
- **THEN** el sistema no envía ningún anuncio

### Requirement: Contenido del anuncio de sorteo

El anuncio de sorteo SHALL incluir un texto introductorio y la información del sorteo de forma equivalente al grid de sorteos del frontend: nombre, imagen del producto, precio y fechas de inicio y fin.

#### Scenario: Datos del sorteo en el correo
- **WHEN** se renderiza el anuncio de un sorteo
- **THEN** el correo muestra el nombre del sorteo, la imagen del producto mediante una URL absoluta, el precio y las fechas de inicio y fin
- **AND** la presentación es coherente con cómo se muestra el sorteo en el grid de la aplicación
