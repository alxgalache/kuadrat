## Context

Actualmente todos los assets de imagen (productos art, others, avatares de autores) se almacenan en `api/uploads/` montado como volumen Docker bind-mount en la instancia EC2. Express sirve estos ficheros mediante `res.sendFile()` a través de rutas dedicadas. Los videos de la página de inicio están en `client/public/video/stories/` y se leen sincrónicamente del filesystem en tiempo de carga del módulo.

Este diseño acopla el estado de los assets al servidor de la API y hace que la EC2 gestione tanto la lógica de negocio como la entrega de assets estáticos. Con el crecimiento del catálogo, esto degrada el rendimiento de la API.

**Infraestructura ya provisionada:**
- S3 bucket: `140d-media-pro-...-eu-south-2` (bucket privado, región eu-south-2)
- CloudFront distribution: `cdn.140d.art` (OAC configurado, acceso exclusivo al bucket)
- IAM Role en EC2 con permisos S3 (no requiere access keys en el servidor)
- Credenciales AWS disponibles en todos los entornos para story videos

## Goals / Non-Goals

**Goals:**
- Desacoplar el almacenamiento de assets del proceso Express
- Servir imágenes y story videos desde CloudFront en producción
- Mantener el flujo de disco local funcional en entornos pre y desarrollo (solo para imágenes)
- Unificar los story videos en S3 en todos los entornos
- Eliminar código legacy de la tabla `products`

**Non-Goals:**
- Migrar videos de eventos (siguen en `uploads/events/` — su flujo protegido con vtoken no cambia)
- Modificar el esquema de la base de datos (los campos `basename` y `profile_img` mantienen su formato)
- Implementar transformación de imágenes (resize, WebP conversion) — no en este cambio
- Configurar CloudFront WAF o signed URLs — queda para fases posteriores

## Decisions

### D1: Detectar entorno por variable de entorno, no por NODE_ENV

**Decisión:** El flag `config.useS3` se deriva de la presencia de `AWS_S3_BUCKET`. Si está definida → S3; si no → disco local.

**Alternativa rechazada:** `NODE_ENV === 'production'` — demasiado rígido. El usuario podría querer probar S3 en local o usar disco en producción transitoriamente.

### D2: No cambiar el formato almacenado en la base de datos

**Decisión:** Los campos `basename` y `profile_img` siguen almacenando solo el nombre del fichero (ej: `uuid.jpg`). El prefijo S3 (`art/`, `others/`, `authors/`) se construye en el código según el tipo de recurso.

**Alternativa rechazada:** Guardar la key S3 completa en BD — requeriría migración de datos existentes y más complejidad para el fallback a disco.

### D3: S3Service como módulo singleton con lazy init del cliente

**Decisión:** `api/services/s3Service.js` exporta funciones directamente (no una clase). El cliente S3 se instancia una sola vez (lazy, en el primer uso). Si `AWS_S3_BUCKET` no está configurado, las funciones de imagen lanzan un error; `listFiles` hace fallback a disco para stories.

**Rationale:** Sigue el patrón del proyecto (servicios como módulos, no clases). El lazy init evita errores en arranque cuando no hay credenciales.

### D4: Story videos — S3 en todos los entornos, sin fallback a disco

**Decisión:** El endpoint `GET /api/stories/videos` siempre usa S3 (en todos los entornos). No hay fallback al filesystem para stories.

**Rationale:** El usuario requirió explícitamente que todos los entornos lean de S3 para stories. Los videos del filesystem local (`public/video/stories/`) dejan de ser la fuente de verdad.

**Implicación:** Los entornos locales y pre necesitan las variables `AWS_S3_BUCKET`, `AWS_S3_REGION`, y `CDN_BASE_URL` configuradas para que la página de inicio funcione.

### D5: URLs de imágenes en frontend — CDN cuando NEXT_PUBLIC_CDN_URL está definido

**Decisión:** Las funciones helper (`getArtImageUrl`, `getOthersImageUrl`, `getAuthorImageUrl`) construyen URLs CDN cuando `NEXT_PUBLIC_CDN_URL` está definido en el cliente, y URLs de Express en caso contrario.

**Formato CDN:** `${NEXT_PUBLIC_CDN_URL}/${prefix}/${encodeURIComponent(basename)}`
**Formato local:** `${API_URL}/${tipo}/images/${encodeURIComponent(basename)}` (sin cambios)

### D6: Multer de authorRoutes pasa a memoryStorage

**Decisión:** El upload de avatar en `api/routes/admin/authorRoutes.js` cambia de `diskStorage` a `memoryStorage`, igual que ya hacen art y others. El handler escribe a S3 o a disco según `config.useS3`.

**Rationale:** Consistencia con el resto de uploads; con memoryStorage el buffer está disponible directamente para el SDK de S3 sin leer el fichero de vuelta del disco.

### D7: Limpieza de rutas de serving de Express para imágenes al migrar, no eliminarlas

**Decisión:** Las rutas `GET /api/art/images/:basename`, `GET /api/others/images/:basename`, y `GET /api/users/authors/images/:filename` se **mantienen**. Son el fallback activo para entornos pre y desarrollo.

**Eliminación:** Solo se elimina la ruta de `products` (tabla legacy sin uso).

## Risks / Trade-offs

- **[Risk] Story videos sin fallback a disco** → Los entornos locales/pre que no tengan `AWS_S3_BUCKET` configurado no mostrarán videos en la home. Mitigación: documentar que esta variable es necesaria en todos los entornos.

- **[Risk] Latencia en el listado de story videos** → `listObjectsV2` añade una llamada de red en cada render de la página de inicio (Server Component). Mitigación: es una sola llamada puntual al hacer render; el resultado puede cachearse con `fetch` cache de Next.js si fuera necesario.

- **[Risk] Coste S3 + CloudFront inesperado** → Imágenes de alta resolución sin comprimir pueden generar transferencias elevadas. Mitigación: aceptable en la fase actual; optimización de imágenes (resize/WebP) es trabajo futuro.

- **[Risk] Credenciales AWS en EC2 via IAM Role** → Si el role se desasocia accidentalmente de la instancia, todos los uploads fallan. Mitigación: el error es claro (el SDK lanza excepción de credentials); monitorizarlo con Sentry.

## Migration Plan

1. Implementar y desplegar los cambios de código en producción con `AWS_S3_BUCKET` configurado.
2. Subir manualmente los videos de stories al bucket bajo el prefijo `stories/` usando AWS CLI o la consola S3.
3. No hay imágenes existentes de productos/avatares que migrar (entorno de pre fue limpiado; producción es nuevo despliegue).
4. **Rollback:** Si algo falla, basta con eliminar `AWS_S3_BUCKET` del `.env` y reiniciar los contenedores — el sistema vuelve automáticamente al flujo de disco local para imágenes. Para stories, hay que volver a poner los videos en `public/video/stories/` y revertir `page.js`.
