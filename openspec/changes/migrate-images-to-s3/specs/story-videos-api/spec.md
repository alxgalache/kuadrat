## ADDED Requirements

### Requirement: Endpoint público para listar story videos desde S3
El sistema SHALL exponer un endpoint `GET /api/stories/videos` que liste los objetos bajo el prefijo `stories/` en el bucket S3 configurado y devuelva un array de objetos con `filename` y `url`. Las URLs SHALL construirse usando `CDN_BASE_URL` si está configurado. El endpoint SHALL ser público (sin autenticación) y SHALL aplicar cache control.

#### Scenario: Listado exitoso de videos en S3
- **WHEN** se llama a `GET /api/stories/videos` y hay objetos bajo `stories/` en S3
- **THEN** la respuesta SHALL ser 200 con un array de objetos `{ filename: string, url: string }` donde `url` usa `CDN_BASE_URL` si está definido

#### Scenario: Bucket sin videos
- **WHEN** se llama a `GET /api/stories/videos` y no hay objetos bajo `stories/` en S3
- **THEN** la respuesta SHALL ser 200 con un array vacío `[]`

#### Scenario: Error de conexión a S3
- **WHEN** se llama a `GET /api/stories/videos` y S3 no es accesible
- **THEN** el sistema SHALL registrar el error en el logger y SHALL retornar 500 con mensaje de error apropiado

### Requirement: Página de inicio consume el endpoint de story videos
La página de inicio (`client/app/page.js`) SHALL obtener la lista de videos llamando al endpoint `GET /api/stories/videos` en tiempo de renderizado (Server Component async). La selección aleatoria de un video SHALL seguir ocurriendo en el cliente (componente `StoryVideo`).

#### Scenario: Renderizado con videos disponibles
- **WHEN** el Server Component renderiza y el endpoint devuelve videos
- **THEN** el componente `StoryVideo` SHALL recibir las URLs completas y SHALL seleccionar una aleatoriamente para mostrar

#### Scenario: Renderizado sin videos (array vacío)
- **WHEN** el endpoint devuelve un array vacío
- **THEN** la sección de video SHALL no renderizarse (o mostrar un placeholder) sin lanzar error

#### Scenario: Error al obtener videos
- **WHEN** la llamada al endpoint falla
- **THEN** la página SHALL renderizarse igualmente (el video es decorativo, no crítico), manejando el error de forma silenciosa

### Requirement: Story videos servidos desde CloudFront en todos los entornos
Los videos de la página de inicio SHALL servirse siempre desde CloudFront CDN usando las URLs devueltas por el endpoint. El directorio local `public/video/stories/` deja de ser la fuente de verdad para esta funcionalidad.

#### Scenario: Video reproducido desde CDN
- **WHEN** el componente `StoryVideo` recibe una URL completa de CloudFront
- **THEN** el elemento `<video>` SHALL usar esa URL directamente como `src`, sin construcción adicional de URL en el componente
