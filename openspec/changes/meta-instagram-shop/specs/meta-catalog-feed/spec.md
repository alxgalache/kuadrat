## ADDED Requirements

### Requirement: Feed público del catálogo de Meta

La API SHALL servir el catálogo de Meta en `GET /api/feeds/meta-catalog.xml`, sin autenticación, desde `api/routes/feedRoutes.js` y `api/controllers/feedController.js`.

- La respuesta SHALL ser un documento RSS 2.0 con el espacio de nombres `xmlns:g="http://base.google.com/ns/1.0"`, un `<item>` por artículo.
- SHALL llevar `Content-Type: application/xml; charset=utf-8` y `Cache-Control: public, max-age=3600`, igual que el feed de Google.
- Como la respuesta es XML, el controlador SHALL responder con `res.send` y no con los helpers JSON de `api/utils/response.js`, y SHALL pasar los errores a `next()` para que los trate `errorHandler`.
- La lógica SHALL vivir en `api/services/metaCatalogFeed.js`.

#### Scenario: Meta descarga el feed
- **WHEN** se pide `GET /api/feeds/meta-catalog.xml` sin credenciales
- **THEN** la respuesta es 200, con `Content-Type: application/xml; charset=utf-8`, y el cuerpo es un RSS 2.0 bien formado con el espacio de nombres `g`

#### Scenario: Valores escapados
- **WHEN** el nombre o la descripción de un producto contiene `&`, `<`, comillas o caracteres de control
- **THEN** el XML los escapa o los elimina con el mismo `xmlText` que el feed de Google, y el documento sigue siendo XML válido

### Requirement: Una sola generación del catálogo para los feeds de Google y de Meta

La selección de productos, la lectura de imágenes, el texto plano, la cotización del envío y la caché SHALL vivir en un único módulo, `api/services/productFeedCatalogue.js`. Ese módulo devuelve entradas neutras de canal. `api/services/googleMerchantFeed.js` y `api/services/metaCatalogFeed.js` SHALL ser serializadores de esas entradas y SHALL NOT consultar productos por su cuenta.

- Los helpers de XML SHALL vivir en `api/utils/feedXml.js`.
- El XML de `GET /api/feeds/google-merchant.xml` SHALL ser idéntico byte a byte al que se generaba antes del cambio con los mismos datos. Sus `id` siguen siendo slugs, y sus campos, su orden y su envío no cambian.
- Las exportaciones públicas de `googleMerchantFeed.js` que usan los tests (`getGoogleMerchantFeed`, `generateFeed`, `formatDimensions`, `HANDLING_DAYS`, `__resetFeedCache`) SHALL mantenerse.

#### Scenario: El feed de Google no cambia
- **WHEN** se generan los dos feeds sobre los mismos datos
- **THEN** el XML de Google coincide con el que producía el código anterior, y `api/tests/googleMerchantFeed.test.js` pasa sin modificaciones

#### Scenario: Los dos feeds comparten generación
- **WHEN** se piden los dos feeds dentro de la misma hora
- **THEN** el catálogo se carga y se cotiza una sola vez, y los dos XML salen de esas mismas entradas

### Requirement: Conjunto de productos del feed de Meta

El feed de Meta SHALL contener exactamente los productos que contiene el feed de Google. Son los que cumplen `visibilityPredicate` (`api/services/catalogOrdering.js`) y tienen al menos una imagen y algún grupo de zona con envío. En la tienda, además, el producto SHALL tener stock. Cada producto de la tienda SHALL aparecer como un artículo por cada variante con `stock > 0`.

Una obra vendida, en subasta, en sorteo, oculta o retirada SHALL NOT aparecer. Un artículo SHALL NOT declararse nunca `out of stock`: lo que no se puede comprar no está en el feed.

#### Scenario: Obra vendida
- **WHEN** una obra pasa a `is_sold = 1` y se genera de nuevo el catálogo
- **THEN** su `<item>` no aparece en el feed de Meta ni en el de Google

#### Scenario: Producto de la tienda con una variante agotada
- **WHEN** un producto visible tiene dos variantes, una con stock 3 y otra con stock 0
- **THEN** el feed de Meta contiene un solo artículo, el de la variante con stock

#### Scenario: Obra sin imagen o sin envío
- **WHEN** una obra visible no tiene imágenes o no tiene ningún grupo de zona con envío
- **THEN** no aparece en ninguno de los dos feeds, y el motivo se registra como `warn`

### Requirement: Identificadores comunes con el píxel de Meta

El `<g:id>` de cada artículo SHALL ser el identificador que emite el píxel de Meta para ese producto:

- `art_<id>` para una obra, con el id numérico de `art`;
- `other_<id>_v<varianteId>` para una variante de la tienda, con los ids numéricos de `others` y `other_vars`.

Cada artículo de la tienda SHALL llevar `<g:item_group_id>other_<id></g:item_group_id>`, también si el producto tiene una sola variante. Las obras SHALL NOT llevar `item_group_id`.

El formato SHALL definirse en `api/utils/metaContentId.js`, con un comentario que remita a `contentId()` de `client/lib/metaPixel.js`, su contraparte en el cliente. Las dos definiciones SHALL producir la misma salida.

#### Scenario: Identificador de una obra
- **WHEN** el feed incluye la obra con id 57
- **THEN** su artículo lleva `<g:id>art_57</g:id>` y ningún `item_group_id`

#### Scenario: Identificador de una variante
- **WHEN** el feed incluye la variante 12 del producto de la tienda con id 4
- **THEN** su artículo lleva `<g:id>other_4_v12</g:id>` y `<g:item_group_id>other_4</g:item_group_id>`

### Requirement: Campos de cada artículo del feed de Meta

Cada artículo SHALL llevar:

- `title`: «Nombre – Artista», o solo el nombre si el producto no tiene artista. Si el producto de la tienda tiene más de una variante con stock, se añade « · » y la etiqueta de la variante (`key`, o «Opción estándar» si es nula). Máximo 200 caracteres.
- `description`: el texto plano de la descripción, con los bloques HTML separados por espacios. En una obra va precedida de la técnica y las medidas («Óleo sobre lienzo · 60 × 80 cm. »), con las medidas formateadas por `formatDimensions` y omitidas si no se pueden leer. Si no hay descripción, el título. Máximo 9999 caracteres.
- `availability`: `in stock`.
- `condition`: `new`.
- `price`: el precio de la base de datos en el formato `1200.00 EUR`.
- `link`: `CLIENT_URL` más `/galeria/p/<slug>` (obra) o `/tienda/p/<slug>` (tienda), sin parámetros.
- `brand`: el nombre completo del artista, o `140d` si no lo tiene.
- `google_product_category`: `500044` en las obras. Nada en la tienda.
- `product_type`: `Obra original > <técnica>` en las obras (`Obra original` si no hay técnica) y `Tienda` en la tienda.

Los artículos SHALL NOT llevar `shipping`, `identifier_exists`, `gtin` ni `quantity_to_sell_on_facebook`.

#### Scenario: Obra con técnica y medidas
- **WHEN** el feed incluye la obra «Frágil 1» de «Pilar Español», técnica «Técnica mixta sobre papel», medidas «30x40», precio 350 y descripción `<p>Serie Frágil</p>`
- **THEN** su artículo lleva `title` «Frágil 1 – Pilar Español», `description` «Técnica mixta sobre papel · 30 × 40 cm. Serie Frágil», `price` «350.00 EUR», `availability` «in stock», `brand` «Pilar Español», `google_product_category` «500044» y `product_type` «Obra original > Técnica mixta sobre papel»

#### Scenario: Artista sin nombre
- **WHEN** el vendedor de un producto no tiene `full_name`
- **THEN** el artículo lleva `<g:brand>140d</g:brand>` y el título es solo el nombre del producto

#### Scenario: Producto con varias variantes
- **WHEN** un producto de la tienda tiene las variantes con stock «Tapa dura» y «Tapa blanda»
- **THEN** sus dos artículos llevan los títulos «Nombre – Artista · Tapa dura» y «Nombre – Artista · Tapa blanda», y el mismo `item_group_id`

### Requirement: Imágenes JPEG en el feed de Meta

El `image_link` y los `additional_image_link` de cada artículo SHALL apuntar a la copia JPEG versionada de la imagen (capacidad `catalog-jpeg-images`): `SITE_API_BASE_URL` más `/api/art/images/jpeg/v1/<basename>.jpg` para las obras y `/api/others/images/jpeg/v1/<basename>.jpg` para la tienda. SHALL NOT apuntar al WebP original ni al optimizador de imágenes de Next.

- Las imágenes van en su orden de `position`.
- En una variante, primero van las de la variante (`other_var`) y después las del producto (`other`).
- La primera imagen SHALL ser `image_link`, y las siguientes, hasta un total de tres, `additional_image_link`.

#### Scenario: Obra con tres imágenes
- **WHEN** el feed incluye una obra con tres imágenes
- **THEN** `image_link` es la URL JPEG de la primera, y hay dos `additional_image_link` con las URL JPEG de las otras dos, en orden

#### Scenario: Variante con imagen propia
- **WHEN** una variante tiene una imagen propia y el producto tiene dos
- **THEN** `image_link` es la imagen de la variante y los dos `additional_image_link` son las del producto

### Requirement: Un fallo pasajero de cotización no saca el producto del feed

Si la cotización del envío de un producto falla con un error y la generación anterior en memoria contenía ese producto, la generación nueva SHALL incluirlo con la cotización de envío de la generación anterior y SHALL registrar el fallo como `error`. El resto de sus datos (precio, texto, imágenes, variantes) SHALL salir de la lectura actual. Si no hay generación anterior o el producto no estaba en ella, el producto SHALL quedar fuera, como hasta ahora.

Solo SHALL reutilizarse la cotización ante un fallo de la cotización. La falta de imagen y la falta de grupos con envío SHALL sacar el producto siempre.

#### Scenario: Sendcloud falla en la segunda generación
- **WHEN** un producto de la tienda estaba en la generación anterior, su precio cambia y su cotización falla en la siguiente
- **THEN** los dos feeds siguen incluyéndolo con el precio nuevo y la cotización de envío anterior, y el registro contiene un `error` con el motivo

#### Scenario: Fallo sin generación anterior
- **WHEN** la cotización de un producto falla en la primera generación tras arrancar el proceso
- **THEN** el producto queda fuera de los dos feeds y el motivo se registra como `error`

### Requirement: Caché y fallo de la generación compartida

La generación compartida SHALL cachearse en memoria durante una hora, y las peticiones concurrentes SHALL esperar una única generación en curso. Si una generación falla y existe una anterior, los dos feeds SHALL servir la anterior y registrar el fallo. Si no existe ninguna, la petición SHALL fallar con el error.

#### Scenario: Petición dentro de la hora
- **WHEN** se pide el feed de Meta dos veces en menos de una hora sin cambios de caché
- **THEN** la segunda respuesta sale de la caché, sin volver a consultar la base de datos ni cotizar

#### Scenario: Generación fallida con caché anterior
- **WHEN** la generación falla por un error de base de datos y hay una generación anterior
- **THEN** el feed de Meta y el de Google responden 200 con el contenido de la generación anterior

### Requirement: Eventos del píxel emparejables con el catálogo

Los eventos del píxel de Meta (`client/lib/metaPixel.js`) SHALL usar identificadores que existan en el catálogo:

- El `ViewContent` de una obra SHALL emitirse con `content_type: 'product'` y `content_ids: ['art_<id>']`.
- El `ViewContent` de un producto de la tienda SHALL emitirse con `content_type: 'product_group'` y `content_ids: ['other_<id>']`, que es su `item_group_id`.
- `AddToCart`, `InitiateCheckout` y `Purchase` SHALL seguir emitiendo `other_<id>_v<varianteId>` en la tienda y `art_<id>` en las obras.

#### Scenario: Ficha de un producto de la tienda
- **WHEN** un visitante con consentimiento publicitario abre la ficha del producto de la tienda con id 4
- **THEN** el `ViewContent` lleva `content_type: 'product_group'` y `content_ids: ['other_4']`

#### Scenario: Ficha de una obra
- **WHEN** un visitante con consentimiento publicitario abre la ficha de la obra con id 57
- **THEN** el `ViewContent` lleva `content_type: 'product'` y `content_ids: ['art_57']`
