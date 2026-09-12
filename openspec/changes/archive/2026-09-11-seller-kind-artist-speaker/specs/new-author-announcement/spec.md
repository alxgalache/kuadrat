# new-author-announcement (MODIFIED)

## MODIFIED Requirements

### Requirement: Anuncio manual de nuevo autor

El backend SHALL permitir que un administrador dispare manualmente un anuncio de "nuevo autor" que se envía al segmento newsletter scoped al topic *Nuevos autores*, a partir de un autor seleccionado.

El selector (`GET /api/admin/marketing/authors`) y el disparo (`POST /api/admin/marketing/announce-author`) SHALL limitarse a autores con `seller_kind = 'artist'`. El asunto del broadcast es literalmente «Nuevo artista en 140d» y su plantilla presenta a alguien cuya obra se puede ir a ver; anunciar así a un ponente enviaría a toda la lista una afirmación falsa. Anunciar a un ponente requiere su propia plantilla y su propio topic, y queda fuera del alcance de esta capacidad.

#### Scenario: Disparo manual con autor válido
- **WHEN** un administrador solicita el anuncio para un autor existente, visible y con `seller_kind = 'artist'`
- **THEN** el sistema renderiza la plantilla de nuevo autor y envía el broadcast al segmento newsletter con el topic *Nuevos autores*
- **AND** registra el envío en la auditoría de marketing

#### Scenario: Autor inexistente o no válido
- **WHEN** se solicita el anuncio para un identificador de autor que no existe o no corresponde a un autor (vendedor)
- **THEN** el sistema responde con un error de validación y no envía ningún broadcast

#### Scenario: El selector no ofrece ponentes
- **GIVEN** un vendedor visible con `seller_kind = 'speaker'`
- **WHEN** el administrador abre la sección de marketing
- **THEN** ese vendedor SHALL NOT aparecer en el selector de autores a anunciar

#### Scenario: Disparo directo sobre un ponente
- **WHEN** se solicita el anuncio para un vendedor visible con `seller_kind = 'speaker'`
- **THEN** el sistema responde con un error de validación
- **AND** no envía ningún broadcast ni registra envío alguno
