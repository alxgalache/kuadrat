## Why

Las imágenes de productos y avatares de autores se almacenan actualmente en un volumen Docker local (`api/uploads/`), lo que acopla el almacenamiento de assets al servidor de la API, limita la escalabilidad y aumenta la carga de la instancia EC2 sirviendo ficheros estáticos. Migrar a AWS S3 + CloudFront desacopla el almacenamiento, mejora el rendimiento de entrega mediante CDN global, y permite escalar el backend sin preocuparse del estado del filesystem.

## What Changes

- **Nuevo servicio S3** (`api/services/s3Service.js`) que encapsula `PutObject`, `DeleteObject` y `ListObjectsV2` del SDK de AWS.
- **Upload de imágenes** en `artController`, `othersController` y el handler de avatar de autores pasa de escribir a disco local a subir a S3 (solo en producción; entornos sin `AWS_S3_BUCKET` siguen usando disco).
- **Delete de imágenes** al borrar productos/avatares pasa de `fs.unlink` a `s3Service.deleteFile` cuando corresponde.
- **Nuevo endpoint** `GET /api/stories/videos` que lista los videos del prefijo `stories/` en S3 y devuelve URLs de CloudFront.
- **Página de inicio** (`client/app/page.js`) reemplaza la lectura síncrona del filesystem por una llamada al nuevo endpoint, en todos los entornos.
- **URLs de imágenes en el frontend** pasan a apuntar al CDN (`cdn.140d.art`) en producción, manteniendo las rutas de Express como fallback para entornos locales.
- **Limpieza legacy**: se eliminan la ruta, el multer y la lógica de ficheros de la tabla `products` (no usada).
- Las rutas de serving de Express (`GET /api/art/images/:basename`, etc.) se **mantienen** como fallback para entornos sin S3.
- El volumen `api_uploads` se mantiene para videos de eventos, sin cambios.

## Capabilities

### New Capabilities

- `s3-media-storage`: Almacenamiento y gestión (upload, delete, listado) de assets multimedia en AWS S3 con entrega vía CloudFront CDN. Incluye lógica de selección de backend (S3 vs disco) según configuración del entorno.
- `story-videos-api`: Endpoint público que expone la lista de videos de la página de inicio almacenados en S3, devolviendo URLs de CloudFront listas para usar.

### Modified Capabilities

*(No hay specs existentes en openspec/specs/ que cambien de requisitos.)*

## Impact

**Backend:**
- `api/package.json` — nueva dependencia `@aws-sdk/client-s3`
- `api/config/env.js` — nuevas variables opcionales `AWS_S3_BUCKET`, `AWS_S3_REGION`, `CDN_BASE_URL`; flag `useS3`
- `api/services/s3Service.js` — nuevo fichero
- `api/controllers/artController.js` — lógica de upload/delete modificada
- `api/controllers/othersController.js` — lógica de upload/delete modificada
- `api/routes/admin/authorRoutes.js` — multer cambia a memoryStorage; handler de avatar modificado
- `api/routes/storiesRoutes.js` — nuevo fichero
- `api/server.js` — montar nueva ruta `/api/stories`
- `api/routes/admin/productRoutes.js`, `api/controllers/productsController.js`, `api/routes/productsRoutes.js` — limpieza de lógica de imágenes legacy

**Frontend:**
- `client/next.config.js` — añadir `cdn.140d.art` a `remotePatterns` y CSP (`img-src`, `media-src`)
- `client/lib/api.js` — funciones de URL de imagen actualizadas; nueva función `fetchStoryVideos`
- `client/lib/serverApi.js` — funciones de URL de imagen actualizadas para SSR
- `client/app/page.js` — async Server Component, llama al endpoint de stories
- `client/components/StoryVideo.js` — recibe URL completa en lugar de nombre de fichero

**Infraestructura:**
- AWS S3 bucket (`140d-media-pro-...`, región `eu-south-2`) — ya creado
- AWS CloudFront distribution (`cdn.140d.art`) — ya configurado
- IAM Role en EC2 con permisos S3 — ya configurado
