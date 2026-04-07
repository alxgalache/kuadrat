# s3-media-storage Specification

## Purpose
Almacenamiento de imágenes de productos (art, others, other_vars) y avatares de autores en AWS S3, con fallback transparente a disco local cuando S3 no está configurado, y servido vía CloudFront CDN en producción.

## Requirements

### Requirement: Upload de imagen a S3 cuando el entorno lo requiere
El sistema SHALL subir imágenes de productos (art, others, other_vars) y avatares de autores a AWS S3 cuando la variable de entorno `AWS_S3_BUCKET` esté configurada. La key S3 SHALL construirse como `{prefix}/{basename}` donde prefix es `art`, `others` o `authors` según el tipo de recurso. El basename almacenado en base de datos NO cambia de formato.

#### Scenario: Subida exitosa de imagen art en producción
- **WHEN** se recibe un POST a `/api/art` con un fichero imagen válido y `AWS_S3_BUCKET` está configurado
- **THEN** la imagen SHALL subirse a S3 bajo la key `art/{uuid}.{ext}`, el basename SHALL guardarse en la BD sin prefijo, y la respuesta SHALL ser 201

#### Scenario: Subida de imagen art en entorno sin S3
- **WHEN** se recibe un POST a `/api/art` con un fichero imagen válido y `AWS_S3_BUCKET` NO está configurado
- **THEN** la imagen SHALL escribirse a disco en `uploads/art/{uuid}.{ext}` y el comportamiento SHALL ser idéntico al actual

#### Scenario: Subida exitosa de imagen others con variaciones
- **WHEN** se recibe un POST a `/api/others` con imagen principal y variaciones y `AWS_S3_BUCKET` está configurado
- **THEN** todas las imágenes (principal y variaciones) SHALL subirse a S3 bajo el prefijo `others/`, cada una con su basename único

#### Scenario: Subida exitosa de avatar de autor
- **WHEN** se recibe un POST a `/api/admin/authors/:id/upload-avatar` con imagen válida y `AWS_S3_BUCKET` está configurado
- **THEN** la imagen SHALL subirse a S3 bajo la key `authors/{filename}`, el campo `profile_img` en BD SHALL actualizarse con solo el nombre del fichero (sin prefijo), y el avatar anterior SHALL eliminarse de S3 si existía

### Requirement: Eliminación de imagen de S3 al borrar recurso
El sistema SHALL eliminar la imagen correspondiente de S3 cuando se elimine un producto art, others (incluyendo todas sus variaciones) o cuando se reemplace el avatar de un autor. La eliminación SHALL ser best-effort: si falla, se SHALL registrar el error en el logger pero NO se SHALL interrumpir la operación principal.

#### Scenario: Borrado de producto art elimina imagen de S3
- **WHEN** se recibe una petición de borrado de un producto art y `AWS_S3_BUCKET` está configurado
- **THEN** la imagen SHALL eliminarse de S3 usando la key `art/{basename}` y el producto SHALL eliminarse de BD independientemente del resultado de la operación S3

#### Scenario: Borrado de producto others elimina todas las imágenes
- **WHEN** se recibe una petición de borrado de un producto others con variaciones y `AWS_S3_BUCKET` está configurado
- **THEN** la imagen principal SHALL eliminarse de S3 (`others/{basename}`) y todas las imágenes de variaciones SHALL eliminarse de S3 (`others/{var_basename}`)

#### Scenario: Reemplazo de avatar elimina el anterior
- **WHEN** se sube un nuevo avatar para un autor que ya tiene `profile_img` y `AWS_S3_BUCKET` está configurado
- **THEN** el avatar anterior SHALL eliminarse de S3 antes de subir el nuevo

### Requirement: Fallback transparente a disco local cuando S3 no está configurado
El sistema SHALL mantener el comportamiento actual de disco local (escritura en `uploads/`, serving vía Express `res.sendFile()`) cuando `AWS_S3_BUCKET` no esté configurado, sin cambios en la lógica de negocio.

#### Scenario: Entorno sin S3 funciona igual que antes
- **WHEN** `AWS_S3_BUCKET` no está definido en el entorno
- **THEN** todos los uploads SHALL escribirse a disco, todas las rutas `GET /api/{tipo}/images/:basename` SHALL seguir funcionando, y el comportamiento SHALL ser idéntico al previo a esta migración

### Requirement: URLs de imágenes en frontend apuntan al CDN en producción
El sistema SHALL construir URLs de imágenes apuntando a CloudFront (`NEXT_PUBLIC_CDN_URL`) cuando esa variable esté definida, y a la API de Express en caso contrario.

#### Scenario: URLs CDN en producción
- **WHEN** `NEXT_PUBLIC_CDN_URL` está definido en el cliente
- **THEN** `getArtImageUrl(basename)` SHALL retornar `${NEXT_PUBLIC_CDN_URL}/art/${basename}`, `getOthersImageUrl` SHALL usar prefijo `others/`, y `getAuthorImageUrl` SHALL usar prefijo `authors/`

#### Scenario: URLs Express en desarrollo
- **WHEN** `NEXT_PUBLIC_CDN_URL` no está definido
- **THEN** las funciones helper SHALL retornar las mismas URLs que antes (`${API_URL}/{tipo}/images/{basename}`)
