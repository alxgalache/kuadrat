## 1. Dependencias y configuración base

- [x] 1.1 Instalar `@aws-sdk/client-s3` en `api/package.json`
- [x] 1.2 Añadir variables opcionales en `api/config/env.js`: `awsS3Bucket`, `awsS3Region` (default `'eu-west-1'`), `cdnBaseUrl`; añadir flag `useS3 = !!config.awsS3Bucket`

## 2. Servicio S3

- [x] 2.1 Crear `api/services/s3Service.js` con función `uploadFile(key, buffer, mimetype)` — usa `PutObject` del SDK de AWS
- [x] 2.2 Añadir función `deleteFile(key)` a `api/services/s3Service.js` — usa `DeleteObject`, maneja errores de forma silenciosa (log + no throw)
- [x] 2.3 Añadir función `listFiles(prefix)` a `api/services/s3Service.js` — usa `ListObjectsV2`, retorna array de keys relativas al prefix

## 3. Controller de productos art

- [x] 3.1 En `api/controllers/artController.js`: en `createArtProduct`, reemplazar `fs.promises.writeFile` por `s3Service.uploadFile('art/' + basename, buffer, mimetype)` cuando `config.useS3`, manteniendo el flujo de disco en caso contrario
- [x] 3.2 En `api/controllers/artController.js`: en la función de borrado de producto, reemplazar `fs.unlink` por `s3Service.deleteFile('art/' + basename)` cuando `config.useS3`

## 4. Controller de productos others

- [x] 4.1 En `api/controllers/othersController.js`: en `createOthersProduct`, reemplazar `fs.promises.writeFile` por `s3Service.uploadFile('others/' + basename, ...)` para imagen principal y cada variación cuando `config.useS3`
- [x] 4.2 En `api/controllers/othersController.js`: en la función de borrado, reemplazar `fs.unlink` de imagen principal y variaciones por `s3Service.deleteFile('others/' + basename)` cuando `config.useS3`

## 5. Upload de avatar de autores

- [x] 5.1 En `api/routes/admin/authorRoutes.js`: cambiar configuración multer de `diskStorage` a `memoryStorage`
- [x] 5.2 En el handler de upload de avatar en `api/routes/admin/authorRoutes.js`: reemplazar escritura a disco por `s3Service.uploadFile('authors/' + filename, buffer, mimetype)` cuando `config.useS3`; si no, escribir a disco como antes
- [x] 5.3 En el handler de upload de avatar: al reemplazar avatar existente, eliminar el anterior de S3 (`s3Service.deleteFile('authors/' + oldFilename)`) cuando `config.useS3`, en lugar del `fs.unlinkSync` actual

## 6. Endpoint de story videos

- [x] 6.1 Crear `api/routes/storiesRoutes.js` con `GET /videos` que llama a `s3Service.listFiles('stories/')` y retorna array de `{ filename, url }` usando `config.cdnBaseUrl`; aplicar `cacheControl()` middleware
- [x] 6.2 Montar la ruta en `api/server.js` como `app.use('/api/stories', storiesRoutes)`

## 7. Frontend — configuración

- [x] 7.1 En `client/next.config.js`: añadir `{ protocol: 'https', hostname: 'cdn.140d.art' }` a `remotePatterns`
- [x] 7.2 En `client/next.config.js`: actualizar CSP `img-src` y `media-src` para incluir el origen de `NEXT_PUBLIC_CDN_URL` cuando esté definido

## 8. Frontend — helpers de URL

- [x] 8.1 En `client/lib/api.js`: actualizar `getArtImageUrl(basename)` para usar `${NEXT_PUBLIC_CDN_URL}/art/${encodeURIComponent(basename)}` cuando `NEXT_PUBLIC_CDN_URL` esté definido
- [x] 8.2 En `client/lib/api.js`: misma actualización para `getOthersImageUrl` (prefijo `others/`) y `getAuthorImageUrl` (prefijo `authors/`)
- [x] 8.3 En `client/lib/api.js`: añadir función `fetchStoryVideos()` que llama a `GET /api/stories/videos` y retorna el array de videos
- [x] 8.4 En `client/lib/serverApi.js`: actualizar `getArtImageUrl` y `getOthersImageUrl` usando `process.env.CDN_BASE_URL` (variable de servidor, sin NEXT_PUBLIC_)

## 9. Frontend — página de inicio y StoryVideo

- [x] 9.1 En `client/app/page.js`: convertir a async Server Component; reemplazar `fs.readdirSync` por llamada `fetch` al endpoint `GET /api/stories/videos`; eliminar imports de `fs` y `path`; manejar error silenciosamente (array vacío si falla)
- [x] 9.2 En `client/app/page.js`: pasar las URLs completas (no solo nombres) al componente `StoryVideo`
- [x] 9.3 En `client/components/StoryVideo.js`: actualizar para recibir y usar URLs completas directamente en el `src` del `<video>`, eliminando la construcción de URL `/video/stories/${video}`

## 10. Limpieza legacy (tabla products)

- [x] 10.1 En `api/routes/admin/productRoutes.js`: eliminar la configuración multer de imágenes y el endpoint de upload de imagen de producto
- [x] 10.2 En `api/controllers/productsController.js`: eliminar la función `getProductImage` y las referencias al directorio `uploads/products/`
- [x] 10.3 En `api/routes/productsRoutes.js`: eliminar la ruta `GET /api/products/images/:basename`
- [x] 10.4 Eliminar el directorio `api/uploads/products/` y su contenido
