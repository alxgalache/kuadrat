# catalog-jpeg-images Specification

## Purpose

Definir las copias JPEG cuadradas de las imágenes de producto para los canales que no aceptan WebP (el catálogo de Meta): rutas versionadas e inmutables, validación contra `product_images`, formato de salida, caché de nginx y límites de coste de la conversión.

## Requirements

### Requirement: Rutas versionadas de la copia JPEG

La API SHALL servir una copia JPEG de cada imagen de producto en dos rutas públicas, sin autenticación:

- `GET /api/art/images/jpeg/v1/:basename.jpg`, en `api/routes/artRoutes.js`, para las imágenes `art`;
- `GET /api/others/images/jpeg/v1/:basename.jpg`, en `api/routes/othersRoutes.js`, para las imágenes `other` y `other_var`.

Las dos SHALL usar un único controlador de conversión. El segmento `v1` identifica el formato de salida. Un cambio de tamaño, fondo, calidad o formato SHALL publicarse en una ruta `v2`, y SHALL NOT cambiar nunca lo que devuelve `v1`.

Las rutas cuelgan de `/api/(art|others)/images/`, y por eso nginx las cachea con la `location` que ya existe en `deploy/nginx/140d.art.conf` (`kuadrat_img`, 30 días, `proxy_cache_lock`). No hace falta cambiar nginx.

#### Scenario: Imagen de una obra
- **WHEN** se pide `GET /api/art/images/jpeg/v1/<basename>.jpg` con el *basename* de una imagen `art` existente
- **THEN** la respuesta es 200 con `Content-Type: image/jpeg`

#### Scenario: Imagen de una variante
- **WHEN** se pide `GET /api/others/images/jpeg/v1/<basename>.jpg` con el *basename* de una imagen `other_var`
- **THEN** la respuesta es 200 con `Content-Type: image/jpeg`

### Requirement: Validación del basename y de su existencia

La ruta SHALL pedirse con el nombre del original más `.jpg` (`<uuid>.webp.jpg`), porque sirve un JPEG y un validador que se fíe de la extensión no debe leer `.webp`. Sin ese sufijo la respuesta SHALL ser 400. Sin el sufijo, el parámetro `basename` SHALL cumplir el mismo patrón que aceptan las rutas de imagen actuales (`^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$`). SHALL existir además en `product_images` con un `product_type` del prefijo de la ruta: `art` en `/api/art/…`, y `other` u `other_var` en `/api/others/…`.

- Un *basename* que no cumple el patrón SHALL responder 400.
- Uno que no existe para ese prefijo SHALL responder 404.

En ambos casos la respuesta SHALL lanzar `ApiError` y SHALL NOT descargar ni procesar ningún fichero.

#### Scenario: Nombre con ruta
- **WHEN** se pide la ruta JPEG con `basename = ..%2Fsecret.webp`
- **THEN** la respuesta es 400 y no se descarga nada

#### Scenario: Imagen de otro prefijo
- **WHEN** se pide `GET /api/art/images/jpeg/v1/<basename>.jpg` con el *basename* de una imagen `other`
- **THEN** la respuesta es 404 y no se descarga nada

### Requirement: Formato de la copia JPEG

La copia SHALL generarse con `sharp` a partir del original, que se lee por la URL pública que devuelve `productImageUrl()` (`api/utils/productImageUrl.js`). Ese mismo módulo decide el CDN o la ruta local, y SHALL seguir siendo el único sitio que lo decide. El proceso es:

1. Se aplica la orientación EXIF y se aplana la transparencia sobre blanco (`#ffffff`).
2. La obra se encaja entera, sin recortes, en un lienzo cuadrado blanco de 1600 × 1600 px, ampliándola si su lado mayor es menor.
3. Sale en JPEG progresivo de calidad 85, sin metadatos.

#### Scenario: Obra apaisada en WebP
- **WHEN** el original es un WebP de 2400 × 1600 px
- **THEN** la copia es un JPEG de 1600 × 1600 px, con la obra completa a 1600 × 1067 px centrada en vertical sobre blanco

#### Scenario: Original pequeño
- **WHEN** el original mide 400 × 300 px
- **THEN** la copia mide 1600 × 1600 px, por encima del mínimo de 500 × 500 que exige Meta

#### Scenario: PNG con transparencia
- **WHEN** el original es un PNG con zonas transparentes
- **THEN** esas zonas salen blancas en la copia JPEG

### Requirement: Cabeceras de caché inmutables

Una respuesta 200 de la ruta JPEG SHALL llevar `Cache-Control: public, max-age=31536000, immutable`. Las respuestas de error SHALL NOT llevar esa cabecera.

#### Scenario: Copia servida
- **WHEN** la conversión termina bien
- **THEN** la respuesta lleva `Cache-Control: public, max-age=31536000, immutable`

### Requirement: Límites de coste de la conversión

La conversión SHALL estar acotada para no competir con el resto de la API en la misma máquina:

- `sharp.concurrency(1)`, con la caché de libvips desactivada.
- Como mucho una conversión a la vez en el proceso. Las demás esperan turno.
- La descarga del original SHALL abortarse a los 15 s o al superar 25 MB.

Si la descarga o la conversión fallan, la respuesta SHALL ser 502 (`ApiError`) y el fallo SHALL registrarse con `logger.error`.

#### Scenario: Original inaccesible
- **WHEN** el CDN no responde en 15 s
- **THEN** la respuesta es 502, el error queda registrado y no se envía `Cache-Control` inmutable

#### Scenario: Peticiones simultáneas
- **WHEN** llegan a la vez cinco peticiones de imágenes distintas sin caché
- **THEN** las conversiones se ejecutan de una en una y todas terminan con 200

### Requirement: Pruebas sin red

Los tests de la ruta JPEG (`api/tests/`) SHALL NOT acceder a la red. La lectura del original SHALL poder sustituirse en los tests: por ejemplo, simulando `fetch` o inyectando el lector. Los tests SHALL generar las imágenes de prueba con el propio `sharp`.

#### Scenario: Conversión en el test
- **WHEN** el test pide la copia JPEG de una imagen WebP generada en memoria y servida por un lector simulado
- **THEN** obtiene un JPEG cuadrado de 1600 px sin que se haya abierto ninguna conexión de red
