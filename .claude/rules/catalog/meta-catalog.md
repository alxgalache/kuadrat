---
paths:
  - "api/services/{productFeedCatalogue,metaCatalogFeed,catalogImageService}.js"
  - "api/{controllers/catalogImageController,utils/metaContentId,utils/feedXml}.js"
  - "api/tests/{metaCatalogFeed,catalogJpegImages,productFeedCatalogue}.test.js"
  - "client/app/cesta/**"
  - "client/lib/{cartItems,metaPixel}.js"
  - "docs/tienda_meta/**"
---

## Catálogo de Meta: tienda de Instagram y Facebook

`GET /api/feeds/meta-catalog.xml` (`api/services/metaCatalogFeed.js`) alimenta el catálogo de Commerce Manager, del que beben la tienda de Instagram y Facebook, las etiquetas de producto y el sticker de las stories. `https://140d.art/cesta` es la URL de compra. Se implantaron en octubre de 2026 (`openspec/changes/meta-instagram-shop`). La guía de operador, con los pasos en Meta, está en `docs/tienda_meta/`.

**Un solo catálogo, dos formatos.** `api/services/productFeedCatalogue.js` decide qué se vende, cómo se describe y cuánto cuesta enviarlo, con su caché de 1 h y una única generación en curso. `googleMerchantFeed.js` y `metaCatalogFeed.js` solo lo escriben, cada uno en su formato, y ninguno consulta productos por su cuenta: dos respuestas a «qué se vende» acabarían divergiendo. Un test comparó byte a byte el XML de Google antes y después de separar el módulo.

* **El feed de Google no sirve tal cual para Meta, por cuatro defectos y no por matices.**
  * Sus `id` son slugs, y el píxel identifica los productos como `art_<id>`.
  * Sus fotos son WebP, y Meta solo acepta JPEG o PNG.
  * Declara `in_stock`, y Meta documenta `in stock`.
  * Lista la tienda por producto, y la URL de compra devuelve la variante concreta.
* **Los `id` son los del píxel**, que define `contentId()` de `client/lib/metaPixel.js`, con su contraparte en `api/utils/metaContentId.js`. Las dos cambian juntas o no cambian: un formato nuevo es un catálogo nuevo, y con el viejo se pierden todas las etiquetas de Instagram. Se usan los ids numéricos, no el slug, porque el slug cambia al renombrar. Los slugs de Google se quedan como están, porque de ellos dependen Merchant Center y su fuente complementaria del ISBN.
* **La tienda va por variante con stock**, con un artículo `other_<id>_v<variante>` cada una e `item_group_id = other_<id>` siempre, también con una sola variante. Por eso el `ViewContent` de una ficha de la tienda se declara `product_group`. Meta puede avisar de variantes sin atributo diferenciador, y el aviso no bloquea: inventar un color o una talla sería mentir.
* **Lo que no se puede comprar no está, nunca `out of stock`.** Meta lee cada hora con programación de **sustitución** y borra lo que falta. Quita la etiqueta de las publicaciones tanto a lo borrado como a lo agotado, y esa etiqueta no vuelve. Conservar las obras vendidas no salvaría ninguna etiqueta.
* **Un fallo de cotización reutiliza la cotización anterior del producto.** El resto de sus datos sale de la lectura actual. Sin esto, un Sendcloud caído en el minuto de la lectura borraría el producto de Meta y sus etiquetas para siempre. «Sin imagen» y «sin zona con envío» siguen sacándolo: son hechos ciertos, no fallos pasajeros. Un error de base de datos tumba la generación entera y se sirve la anterior: un feed vacío vaciaría el catálogo.
* **Sin `shipping` en Meta**, porque la compra se cierra en la web, que cobra el envío real. Si falta el artista, `brand` es `140d`: en Meta es obligatorio y su ausencia rechaza el artículo.
* **Retraso de hasta unas dos horas** (lectura horaria más caché de 1 h). La ficha y `/cesta` dicen «ya no está disponible», y la protección de compra concurrente impide vender dos veces. **Se descartó la Catalog Batch API**: exige una app de Meta, un token de usuario del sistema y una llamada dentro del flujo de pago, que es la parte que no puede fallar.

**Fotos: JPEG cuadrado, versionado y nunca guardado.** `GET /api/{art,others}/images/jpeg/v1/<basename>.jpg` (`catalogImageService.js`) encaja la obra entera en un lienzo blanco de 1600 × 1600. El JPEG es progresivo, de calidad 85 y sin metadatos.

* **La ruta cuelga de `/api/(art|others)/images/` a propósito.** nginx ya cachea ese prefijo 30 días con `proxy_cache_lock`, así que cada foto se convierte una vez al mes y una avalancha de Meta cuesta una conversión. Guardar copias en S3 habría exigido tocar las subidas, un relleno y los borrados.
* **El nombre termina en `.jpg` (`<uuid>.webp.jpg`)** porque sirve un JPEG, y un validador que se fíe de la extensión no debe leer `.webp`.
* **`v1` nunca cambia de contenido.** Otro tamaño, fondo o formato es `v2`: se cambia `CATALOG_JPEG_VERSION` en `api/utils/productImageUrl.js`, que mueve a la vez las rutas y los enlaces del feed.
* **Solo convierte imágenes que existen en `product_images` con el `product_type` del prefijo.** La ruta es pública, y sin esa comprobación sería un conversor de cualquier fichero. La conversión está acotada: libvips en un hilo y sin caché, una conversión a la vez en el proceso, y una descarga de 15 s y 25 MB como máximo.
* **`sharp` es nativo, y producción es ARM64 con Alpine.** El lockfile tiene que llevar `@img/sharp-linuxmusl-arm64` y `@img/sharp-libvips-linuxmusl-arm64`, o `npm ci` del `Dockerfile.prod` instala sin el binario y la API no arranca.

**`/cesta`, la URL de compra.** Sin ella la tienda no se muestra, desde septiembre de 2025. Meta envía `?products=art_57%3A1%2Cother_4_v12%3A2` y pide vaciar la cesta, añadir los productos y enseñar precio y subtotal.

* **Se resuelve en el servidor y sin caché de datos** (`fetchArtProductFresh`, `fetchOthersProductFresh`). El resumen viaja en el HTML, para quien valide la URL sin JavaScript, y la disponibilidad es la de ese momento, no la de la ficha cacheada 300 s. La ruta es `ƒ (Dynamic)`, así que nginx no la guarda. Como mucho 20 líneas: cada una es una lectura a la API.
* **Espera a `isInitialized` de `CartContext` antes de tocar la cesta.** Los efectos del hijo se ejecutan antes que los del proveedor, y vaciarla antes de que este lea `localStorage` dejaría que la cesta guardada pisara la nueva. Solo la sustituye si hay algo comprable.
* **La obra elige envío en la propia página**, con `ShippingSelectionModal` y la reutilización por artista de la ficha. `SENDCLOUD_ENABLED_ART` sigue en `false`, y una obra sin envío deja el cajón bloqueado sin forma de elegirlo. La tienda, con Sendcloud, entra al momento.
* **El cajón se abre con el evento `open-cart-drawer`**, el que `Navbar` ya escucha para las páginas de pago fallido y cancelado. No se añadió una segunda vía.
* **`coupon` se ignora**, porque 140d no tiene códigos de descuento. La página lleva `noindex` y no está en el `Disallow` de `robots.txt`, para no impedir que el validador de Meta la lea.
* **`client/lib/cartItems.js` es la única definición de una línea de cesta** (`artCartItem`, `otherCartItem`) y de «¿se puede comprar?». Las seis copias de las fichas ya habían divergido, y una leía `product.basename`, un campo que ya no existe.
* **La API no conoce el modo cotización.** Si la web deja de vender, hay que ocultar la tienda y pausar la fuente en Commerce Manager a mano. Mientras tanto, `/cesta` enlaza a las fichas.

**Punto ciego conocido:** `client/` no tiene runner de tests. `/cesta` y las fichas se verificaron a mano, en el navegador y con el HTML del servidor. La apertura del cajón y la animación de los diálogos solo se pueden comprobar con la pestaña **visible**: en una pestaña oculta Chrome no ejecuta `requestAnimationFrame`, y el cajón no se abre. La API sí está cubierta, en `metaCatalogFeed.test.js`, `catalogJpegImages.test.js` y `productFeedCatalogue.test.js`, todos sin red.
