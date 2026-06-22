# new-author-announcement Specification

## Purpose

Definir el anuncio manual de "nuevo autor" que un administrador dispara hacia el segmento newsletter scoped al topic *Nuevos autores*, incluyendo su contenido dinámico y la posibilidad de reenvío.

## Requirements

### Requirement: Anuncio manual de nuevo autor

El backend SHALL permitir que un administrador dispare manualmente un anuncio de "nuevo autor" que se envía al segmento newsletter scoped al topic *Nuevos autores*, a partir de un autor seleccionado.

#### Scenario: Disparo manual con autor válido
- **WHEN** un administrador solicita el anuncio para un autor existente y visible
- **THEN** el sistema renderiza la plantilla de nuevo autor y envía el broadcast al segmento newsletter con el topic *Nuevos autores*
- **AND** registra el envío en la auditoría de marketing

#### Scenario: Autor inexistente o no válido
- **WHEN** se solicita el anuncio para un identificador de autor que no existe o no corresponde a un autor (vendedor)
- **THEN** el sistema responde con un error de validación y no envía ningún broadcast

### Requirement: Contenido del anuncio de nuevo autor

El anuncio de nuevo autor SHALL incluir, de forma dinámica desde los datos del autor, su imagen de perfil (como URL absoluta), su nombre completo, su ubicación y su biografía.

#### Scenario: Datos del autor en el correo
- **WHEN** se renderiza el anuncio de un autor
- **THEN** el correo muestra la imagen de perfil del autor mediante una URL absoluta, su nombre completo, su ubicación y su biografía
- **AND** los campos ausentes se omiten sin romper el diseño

### Requirement: Reenvío manual permitido con aviso

El anuncio de nuevo autor SHALL poder reenviarse para un mismo autor (no está sujeto al guard de envío único de los anuncios automáticos), registrando cada envío en la auditoría.

#### Scenario: Segundo envío para el mismo autor
- **WHEN** un administrador dispara de nuevo el anuncio para un autor que ya fue anunciado
- **THEN** el sistema permite el envío y lo registra
- **AND** la interfaz puede advertir que ese autor ya había sido anunciado previamente
