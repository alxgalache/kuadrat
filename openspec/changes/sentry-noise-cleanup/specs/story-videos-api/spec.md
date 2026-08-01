## MODIFIED Requirements

### Requirement: Endpoint público para listar story videos desde S3
El sistema SHALL exponer un endpoint `GET /api/stories/videos` que liste los objetos bajo el prefijo `stories/` en el bucket S3 configurado y devuelva un array de objetos con `filename` y `url`. Las URLs SHALL construirse usando `CDN_BASE_URL` si está configurado. El endpoint SHALL ser público (sin autenticación) y SHALL aplicar cache control.

El endpoint SHALL distinguir dos situaciones de fallo que hasta ahora colapsaban en la misma respuesta:

- **S3 no configurado** (`AWS_S3_BUCKET` ausente, es decir `config.useS3 === false`): es un estado esperado del entorno — preproducción es self-hosted y no dispone de credenciales AWS. El endpoint SHALL responder `200` con un array vacío, sin invocar el cliente de S3 y sin generar un evento de error. El vídeo de portada es decorativo y su ausencia no es un incidente.
- **S3 configurado pero inaccesible** (credenciales inválidas, error de red, bucket inexistente): es un incidente real. El endpoint SHALL registrar el error y responder `500`, propagándolo al `errorHandler` global para que llegue a Sentry.

El criterio de activación SHALL ser la presencia de configuración (`config.useS3`), nunca una comprobación de `NODE_ENV`.

#### Scenario: Listado exitoso de videos en S3
- **WHEN** se llama a `GET /api/stories/videos` con S3 configurado y hay objetos bajo `stories/`
- **THEN** la respuesta SHALL ser 200 con un array de objetos `{ filename: string, url: string }` donde `url` usa `CDN_BASE_URL` si está definido

#### Scenario: Bucket sin videos
- **WHEN** se llama a `GET /api/stories/videos` con S3 configurado y no hay objetos bajo `stories/`
- **THEN** la respuesta SHALL ser 200 con un array vacío `[]`

#### Scenario: S3 no configurado en el entorno
- **WHEN** se llama a `GET /api/stories/videos` y `AWS_S3_BUCKET` no está definida (`config.useS3 === false`)
- **THEN** la respuesta SHALL ser 200 con un array vacío `[]`, el cliente de S3 NO SHALL instanciarse, y NO SHALL enviarse ningún evento de error a Sentry

#### Scenario: Error de conexión a S3 con bucket configurado
- **WHEN** se llama a `GET /api/stories/videos`, `AWS_S3_BUCKET` está definida, y la llamada a S3 falla
- **THEN** el sistema SHALL registrar el error en el logger, SHALL retornar 500 con mensaje de error apropiado, y el error SHALL reportarse a Sentry en los entornos donde el envío esté habilitado
