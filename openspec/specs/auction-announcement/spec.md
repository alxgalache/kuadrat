# auction-announcement Specification

## Purpose

Definir el anuncio automático de subasta hacia el segmento newsletter scoped al topic *Subastas y sorteos*, incluyendo el disparo por estado, el envío único y el contenido del correo.

## Requirements

### Requirement: Anuncio automático de subasta

El backend SHALL enviar automáticamente un anuncio de subasta al segmento newsletter scoped al topic *Subastas y sorteos* cuando una subasta entra por primera vez en estado `scheduled` o `active`, ya sea al crearse o al transicionar a dicho estado.

#### Scenario: Subasta creada o programada
- **WHEN** una subasta se crea con estado `scheduled`/`active` o transiciona a uno de esos estados por primera vez
- **THEN** el sistema dispara el anuncio al topic *Subastas y sorteos* tras confirmar la escritura en base de datos

#### Scenario: Envío único pese a varios estados
- **WHEN** una subasta ya anunciada cambia de `scheduled` a `active` o se edita
- **THEN** el sistema no envía un segundo anuncio para esa subasta

#### Scenario: Estado no cualificado
- **WHEN** una subasta permanece en `draft` (u otro estado no cualificado)
- **THEN** el sistema no envía ningún anuncio

### Requirement: Contenido del anuncio de subasta

El anuncio de subasta SHALL incluir un texto introductorio y la información de la subasta de forma equivalente al grid de subastas del frontend: nombre, imagen(es) de las piezas, y fechas de inicio y fin.

#### Scenario: Datos de la subasta en el correo
- **WHEN** se renderiza el anuncio de una subasta
- **THEN** el correo muestra el nombre de la subasta, su(s) imagen(es) mediante URLs absolutas y las fechas de inicio y fin
- **AND** la presentación es coherente con cómo se muestra la subasta en el grid de la aplicación
