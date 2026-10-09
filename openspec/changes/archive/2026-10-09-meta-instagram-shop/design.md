## Context

**Lo que Meta exige hoy (octubre de 2026).** La tienda de Instagram es un escaparate construido sobre un catálogo de Commerce Manager. Desde el 4 de septiembre de 2025 toda tienda usa la compra en la web del vendedor, y **sin URL de compra la tienda no es visible**. Meta lee el catálogo de un feed programado (como mucho una vez por hora). Con la programación de sustitución, que es la normal, borra los artículos que ya no vienen en el feed. Un artículo borrado o agotado pierde sus etiquetas en las publicaciones, y una etiqueta perdida no vuelve aunque el producto vuelva. Para las imágenes, Meta documenta JPEG o PNG, de 500 × 500 px como mínimo y 8 MB como máximo, y recomienda el formato 1:1.

**Lo que 140d ya tiene:**

- **Feed de Google Merchant Center**, en `api/services/googleMerchantFeed.js`. Selecciona los productos con `visibilityPredicate` más el stock de la tienda, y cotiza el envío con `quoteSellerGroups`, el mismo módulo que el checkout, en cuatro grupos de zona. Deja fuera lo que no puede describir con verdad. Guarda una caché de 1 h con una sola generación en curso y, si una generación falla, sirve la anterior. Sus `id` son slugs, y Merchant Center y su fuente complementaria (`el-limite` con el ISBN) dependen de ellos. Las reglas que lo gobiernan están en `.claude/rules/catalog/merchant-feed.md`.
- **Píxel de Meta y API de conversiones** (`client/lib/metaPixel.js`, `api/services/metaConversionsService.js`). Solo actúan con consentimiento publicitario, y deduplican por `event_id`. Identifican los productos como `art_<id>` y `other_<id>[_v<variante>]`, y el propio módulo advierte de que ese es el formato que tendrá que usar el catálogo de Meta. El conjunto de datos es el `1057434273433077`.
- **Registro TXT `facebook-domain-verification`** en el DNS de 140d.art, que está en GoDaddy, no en Route 53 como dice el estudio. El dominio probablemente ya está verificado en el porfolio.
- **Cesta en `localStorage`** (`CartContext`) y un cajón de compra (`ShoppingCartDrawer`), abierto desde `Navbar` con estado local. Admite compra sin registro y pago exprés (`StripeExpressCheckout`).
  - La obra se añade **con el envío ya elegido** en `ShippingSelectionModal`. Si no lo tiene, el cajón bloquea «Completar pedido» y no ofrece forma de elegirlo. `SENDCLOUD_ENABLED_ART` debe seguir en `false`.
  - La tienda usa Sendcloud: el envío se elige en el paso 3 del cajón.
- **Imágenes de producto:** las 42 del catálogo actual son WebP, de hasta unos 2 MB, en `cdn.140d.art`. nginx ya cachea 30 días todo lo que cuelga de `/api/(art|others|users/authors)/images/`.

**Restricciones del proyecto.** Se busca la opción con menos piezas (filosofía del operador). Un predicado de dominio vive en un único módulo con nombre. Un recurso de caché inmutable nunca se sobrescribe. API y cliente se despliegan juntos. `client/` no tiene tests, y los tests de la API no pueden tocar la red.

## Goals / Non-Goals

**Goals:**

- Un feed que Commerce Manager acepte sin errores estructurales. Sus identificadores son los mismos del píxel, y su conjunto de productos y sus datos son los mismos que vende la web.
- Que el feed de Google no cambie ni un byte, y que los dos feeds no puedan divergir en qué se vende.
- Imágenes que Meta acepte, con la obra completa y sin recortes en las vistas cuadradas.
- Una URL de compra que cumpla lo que pide Meta: vaciar la cesta, añadir los productos, precio, subtotal, compra sin registro y aviso de lo no disponible. Tiene que encajar en el flujo de envío de la obra tal como es hoy.
- Una guía de operador, escalonada, para todo lo que solo se puede hacer en Meta.

**Non-Goals:** los de la propuesta. Catalog Batch API, exclusión de obras por canal, cupones, cambios en el feed de Google, Pinterest, WhatsApp, anuncios de catálogo y atribución en el pedido.

## Decisions

### 1. Una generación compartida y dos serializadores, en dos URLs

| | Google (`google-merchant.xml`) | Meta (`meta-catalog.xml`) |
|---|---|---|
| `id` | slug (`fragil-1`) | `art_<id>`, `other_<id>_v<variante>` |
| Tienda | un artículo por producto | un artículo por variante con stock, más `item_group_id` |
| `availability` | `in_stock` | `in stock` |
| Imágenes | WebP del CDN | JPEG cuadrado (decisión 6) |
| Envío | el del grupo de zona más caro | no se declara (decisión 7) |
| Lectura | la programa Merchant Center | cada hora |

El catálogo se extrae a `api/services/productFeedCatalogue.js`: carga, imágenes, texto plano, cotización, `mapLimit`, caché de 1 h, generación única y servir la anterior si falla. Ese módulo devuelve **entradas neutras**: tipo, id numérico, slug, nombre, artista, descripción en texto plano, técnica, medidas, precio en céntimos, *basenames* de las imágenes, céntimos y plazos del envío, y variantes con stock e imágenes. Encima hay dos serializadores puros, `googleMerchantFeed.js` (con lo de ahora) y `metaCatalogFeed.js`. Los helpers de XML (`xmlText`, `tag`) pasan a `api/utils/feedXml.js`.

Un ciclo de caché sirve a los dos feeds. Meta lee cada hora y Google cuando lo tenga programado, y entre los dos no hay más de una generación por hora.

**Alternativas descartadas:**

- **Dar a Meta la URL de Google.** No cuesta código, pero los `id` no emparejan con el píxel, `in_stock` no es un valor documentado por Meta, la tienda sale sin variantes y las imágenes son WebP. Los cuatro puntos son defectos, no matices.
- **Un feed independiente con su propia consulta.** Sería una segunda respuesta a «qué se vende», con su propia copia de `visibilityPredicate`, de las imágenes y del filtro de envío. Es justo lo que el invariante de predicados con nombre existe para evitar.
- **Cambiar los `id` de Google al formato del píxel.** Rompería el historial de Merchant Center y la fuente complementaria del ISBN, que va por `id`.

**Garantía:** `api/tests/googleMerchantFeed.test.js` se mantiene sin cambios y en verde. Un test nuevo compara el XML de Google antes y después de la extracción sobre los mismos datos.

### 2. Los identificadores son los del píxel

`api/utils/metaContentId.js` define `contentId(productType, productId, variantId)`, con la misma salida que `contentId()` de `client/lib/metaPixel.js`. Las dos apps no comparten código, así que cada copia cita a la otra en un comentario, como ya hace `DIMENSION_RE`. Un test de la API fija el formato.

Los ids numéricos no cambian nunca. El slug puede cambiar si se renombra una obra, y eso lo hace peor como clave para un catálogo que conserva etiquetas.

`productType` en el id es `art` u `other`, el mismo valor que guarda la cesta. Las tablas `art` y `others` tienen secuencias distintas, y el prefijo es lo que evita la ambigüedad.

### 3. Variantes de la tienda: un artículo por variante con stock

Cada variante con `stock > 0` de un producto visible es un artículo:

- `id`: `other_<id>_v<variante>`.
- `item_group_id`: `other_<id>`, siempre, también con una sola variante. Así el `ViewContent` de la ficha (`other_<id>`, decisión 10) siempre tiene un grupo con el que emparejar.
- Título: lleva la etiqueta de la variante (`key`, o «Opción estándar») solo si el producto tiene más de una variante con stock.
- Imágenes: primero las de la variante y después las del producto, hasta tres en total.

Meta puede avisar en el diagnóstico de que las variantes de un grupo no difieren en ningún atributo estándar (color, talla…). Ninguna variante de la tienda es de color o talla. El aviso no bloquea y se acepta. Inventar un atributo sería describir algo que no es verdad.

### 4. El mismo conjunto de productos que Google, y lo vendido sale

Entra lo que entra en Google: visible, aprobado, no vendido, no en subasta ni en sorteo, con imagen y con algún grupo de zona con envío. En la tienda, además, con stock. Una obra vendida desaparece del feed, y la programación de sustitución la borra del catálogo de Meta.

**Alternativa descartada: mantenerla como `out of stock`.** Meta también quita la etiqueta de un artículo agotado, así que no salvaría las etiquetas. Además mostraría obras vendidas como «Agotado» en la tienda y exigiría otra consulta distinta de la de los listados.

### 5. Un fallo pasajero de cotización no borra el producto

Hoy, si la cotización de un producto falla (Sendcloud caído, un error puntual), el producto sale del feed hasta la siguiente generación. En Google eso cuesta un día sin ficha. En Meta es peor: la sustitución lo borra, y sus etiquetas en las publicaciones se pierden para siempre.

Por eso, cuando la cotización falla y la generación anterior contenía ese producto, se reutiliza la cotización de envío de esa generación. El resto (precio, texto, imágenes) sale de la lectura actual, que sí ha funcionado. Se registra como `error`, igual que ahora. Solo «la cotización falló» reutiliza. «Sin imagen» y «sin ningún grupo con envío» son hechos ciertos y siguen sacando el producto. Tras un reinicio no hay generación anterior, y se mantiene el comportamiento actual.

Esto cambia también el feed de Google, a mejor y solo en ese caso de error. No cambia el XML que se genera cuando todo va bien.

### 6. JPEG cuadrado en una ruta versionada que nginx ya cachea

- **Rutas:** `GET /api/art/images/jpeg/v1/:basename.jpg` y `GET /api/others/images/jpeg/v1/:basename.jpg`. La segunda sirve también las imágenes de variante (`other_var`), que viven bajo el mismo prefijo `others/`. Al colgar de `/api/(art|others)/images/`, nginx las cachea 30 días con `proxy_cache_lock`, sin tocar su configuración. Cada imagen se convierte una vez por mes como mucho, y una avalancha de lecturas de Meta se queda en una conversión.
- **Validación:** el *basename* cumple el patrón de las rutas de imagen actuales, y existe en `product_images` con un `product_type` de ese prefijo (`art`, o `other` y `other_var`). Si no existe, devuelve 404 sin descargar nada. La ruta no convierte cualquier fichero que se le pida.
- **Conversión** con `sharp`:
  1. Se lee el original por la URL de `productImageUrl()`, que en producción es el CDN, con límite de tiempo y de tamaño.
  2. Se rota según el EXIF y se aplana sobre blanco.
  3. La obra se encaja entera (`contain`) en un lienzo blanco de **1600 × 1600 px**. Se amplía si su lado mayor es menor: así se cumple el mínimo de Meta y 1600 supera el 1024 recomendado.
  4. Sale en JPEG progresivo de calidad 85, sin metadatos.
- **Límites de coste:** `sharp.concurrency(1)`, caché de libvips desactivada y una sola conversión a la vez en el proceso. El resto espera.
- **Cabeceras:** `Content-Type: image/jpeg` y `Cache-Control: public, max-age=31536000, immutable`.
- **Versión en la ruta (`v1`).** Si algún día cambian el tamaño, el fondo o el formato, se publica `v2` y el feed apunta a `v2`. `v1` nunca cambia de contenido, como pide el invariante de recursos inmutables.
- **El feed de Meta** apunta a `${SITE_API_BASE_URL}/api/<prefijo>/images/jpeg/v1/<basename>.jpg`.

**Alternativas descartadas:**

- **El optimizador de imágenes de Next.** Mantiene el formato WebP si el cliente no pide otro, y corre en el servidor que se satura. La regla del feed de Google ya lo prohíbe.
- **Generar el JPEG al subir la imagen y guardarlo en S3.** Exige tocar las subidas, un script para rellenar las existentes y gestionar los borrados: tres piezas más para el mismo resultado.
- **Lambda@Edge o un servicio externo.** Más infraestructura que mantener.

### 7. Campos del feed de Meta

- `title`: «Nombre – Artista», más la variante cuando corresponda. Meta recomienda 65 caracteres, y la técnica y las medidas alargarían el título y lo cortarían. Si no hay artista, solo el nombre.
- `description`: el texto plano de la ficha. En la obra va precedido de «Técnica · Alto × Ancho cm.» si las medidas se pueden leer, con el mismo `formatDimensions` del feed de Google. Si no hay descripción, el título. Máximo 9999 caracteres.
- `brand`: el artista o, si falta, «140d». En Meta es obligatorio, y sin él el artículo se rechaza.
- `availability`: `in stock`. `condition`: `new`. `price`: «1200.00 EUR».
- `link`: la ficha (`/galeria/p/<slug>` o `/tienda/p/<slug>`), sin UTM. Meta añade las suyas.
- `google_product_category`: 500044 en la obra. En la tienda, nada, igual que en Google.
- `product_type`: «Obra original > <técnica>» en la obra y «Tienda» en la tienda. Es el campo por el que se filtran las colecciones y los conjuntos de productos en Commerce Manager, junto con `brand` y el precio.
- **Sin `shipping`.** Con la compra en la web, el envío lo calcula y lo cobra 140d. Declarar el del grupo más caro, como en Google, mostraría a un comprador peninsular el precio de Canarias sin ninguna obligación que lo justifique.
- **Sin `identifier_exists`, `gtin` ni `quantity_to_sell_on_facebook`.** El primero es de Google, del segundo no hay dato en la base de datos y el tercero solo servía al pago dentro de Meta.

### 8. Frescura: lectura horaria, sin Catalog Batch API

El retraso máximo entre una venta y su desaparición del catálogo de Meta es de unas dos horas (lectura horaria más caché de 1 h). El daño posible está acotado:

- la ficha muestra «Vendido»;
- `/cesta` avisa de que la obra ya no está disponible;
- el checkout impide vender dos veces la misma obra (protección de compra concurrente).

La Batch API eliminaría el retraso. A cambio exige una app de Meta, un token de usuario del sistema con permiso de catálogo y una llamada a Meta dentro del flujo de pago, que es la parte que no puede fallar. Queda como paso futuro, si el volumen lo justifica.

### 9. URL de compra: `/cesta`, resuelta en el servidor

- **Ruta:** `client/app/cesta/page.js`, un componente de servidor. Lee `searchParams.products`, lo interpreta con `parseContentId` (`client/lib/metaPixel.js`, junto a `contentId`, la única definición del formato en el cliente) y resuelve cada producto contra la API **sin caché de datos**, con una variante de `fetchArtProduct` y `fetchOthersProduct` de `lib/serverApi.js` con `cache: 'no-store'`.
  - Una ruta que lee `searchParams` es dinámica. Next la sirve con `no-store`, y nginx, que respeta `Cache-Control`, no la guarda.
  - El HTML ya trae el resumen. Así la ve igual quien valida desde Commerce Manager, aunque no ejecute JavaScript, y no hay pantalla vacía mientras carga.
- **Disponibilidad**, calculada en el servidor:
  - Una obra está disponible si no está vendida, ni en subasta, ni en sorteo, y si el modo de la tienda es «cesta» (`getArtCta() === 'cart'`).
  - Una variante de la tienda está disponible si existe, tiene stock, el producto no está vendido y `PAYMENT_ENABLED` está activo.
  - La cantidad de una obra es siempre 1. La de una variante se limita a su stock y al máximo de 10 del selector de la ficha.
  - Los identificadores mal formados se ignoran. `coupon` se ignora.
- **Componente cliente** (`CestaFromMeta.js`). Recibe las líneas ya resueltas:
  1. **Espera a que `CartContext` haya leído `localStorage`** (`isInitialized`). Los efectos del hijo se ejecutan antes que los del proveedor: sin esa espera, la cesta guardada podría cargarse **después** de sustituirla y pisarla.
  2. Si hay al menos una línea disponible, vacía la cesta (`clearCart`) y añade los productos de la tienda, sin envío porque Sendcloud lo resuelve en el paso 3. Si no hay ninguna, no toca la cesta.
  3. Cada obra muestra «Elegir envío», que abre `ShippingSelectionModal`, y se añade al elegirlo. Como en la ficha, si ya hay en la cesta una obra del mismo artista con envío, se reutiliza ese envío sin preguntar (`getSellerArtShipping`).
  4. Muestra productos, cantidades, precios unitarios y subtotal de los productos. El envío se calcula después, en el cajón.
  5. «Continuar con la compra» se activa cuando todas las líneas disponibles están en la cesta, y abre el cajón con el evento `open-cart-drawer` (decisión 10).
- **Lo no disponible** aparece en una lista aparte («Ya no está disponible»), con enlace a su ficha si sigue publicada.
  - En modo cotización o sin pagos, no se toca la cesta. Se muestran los productos con enlace a su ficha, donde está la acción que corresponda (cotización o consulta).
  - Si no se reconoce ningún producto, se muestra un aviso y enlaces a `/galeria` y `/tienda`.
- **Sin indexar:** `robots: { index: false, follow: false }` en los metadatos. No entra en el sitemap. No se pone en `Disallow` de `robots.txt`, para no impedir que el validador de Meta la lea.
- **Textos:** todos en `client/lib/constants.js` (`META_CHECKOUT_COPY`).
- **Atribución:** no hace falta código. La URL de aterrizaje lleva `utm_source=IGShopping`, que Plausible registra como fuente, y el `AddToCart` lo emite `addToCart` como siempre.

**Alternativas descartadas:**

- **Redirigir a la ficha del producto.** No cumple «vaciar la cesta y añadir los productos», y con varios productos no tiene sentido.
- **Añadir la obra sin envío.** El cajón la bloquearía sin ofrecer forma de elegirlo.
- **Activar Sendcloud para la obra.** Está prohibido: el precio de la obra sale de las zonas que escribe la calculadora.
- **Un endpoint nuevo en la API para resolver la cesta.** Los públicos `GET /api/art/:id` y `GET /api/others/:id` ya aceptan el id numérico y devuelven todo lo necesario, también las variantes con su stock.

### 10. Cambios en la cesta y en el píxel (infraestructura compartida)

- **`CartContext`** expone `isInitialized`, memorizado como el resto del valor.
- **El cajón se abre con el evento `open-cart-drawer`**, que `Navbar` ya escucha y que usan las páginas de pago fallido y cancelado. Al implementar apareció ese mecanismo: añadir un contador al contexto y otro efecto a `Navbar` habría sido una segunda vía para lo mismo, en dos ficheros de riesgo alto.
- **`client/lib/cartItems.js`** (nuevo):
  - `artCartItem(product, shipping)` y `otherCartItem(product, variant, quantity, shipping)` construyen la línea que recibe `addToCart`. Incluyen siempre `weight` y `dimensions`: nada en la cesta los lee (el paso de envío solo manda identidad y cantidad), así que el flujo con envío elegido no cambia. De paso corrigen la imagen del flujo antiguo de la tienda, que leía `product.basename`, un campo que ya no existe.
  - `getArtCta()` sale de `ArtProductDetail.js`.
  - `isArtPurchasable(product)` e `isVariantPurchasable(product, variant)` responden «¿se puede comprar?».

  Las dos fichas y `/cesta` los usan. Hoy hay seis copias del objeto en las fichas, y `/cesta` sería la séptima. El comportamiento de las fichas no cambia.
- **`trackViewContent`** declara `content_type: 'product_group'` cuando el producto es de la tienda: su id (`other_<id>`) es el `item_group_id` del catálogo. La obra sigue con `product` y `art_<id>`. `AddToCart`, `InitiateCheckout` y `Purchase` ya llevan `other_<id>_v<variante>` y emparejan con los artículos sin cambios.

### 11. La guía vive en `docs/tienda_meta/`, no dentro del cambio

La guía describe la operación de Meta: cuentas, Commerce Manager, revisión, etiquetado y mantenimiento. Seguirá vigente cuando este cambio esté archivado. Por eso va junto al estudio que la originó, con el formato de `docs/google-presencia/`: un README con las decisiones, el estado y los pasos pendientes, y guías numeradas e independientes. El estudio se conserva como fuente. El README indica qué puntos del estudio corrige el código real:

- el DNS está en GoDaddy, no en Route 53;
- el píxel y la API de conversiones ya existen;
- la URL de compra es `/cesta`;
- el piloto con Google Sheets no hace falta;
- el feed de Google no se reutiliza tal cual.

## Risks / Trade-offs

- **[Meta rechaza o interpreta mal algún campo del RSS]** → Antes de programar la lectura horaria, la guía hace una carga única del feed con la herramienta de Commerce Manager y revisa el diagnóstico. El formato RSS con espacio de nombres `g:` está documentado como admitido.
- **[`sharp` no instala en ARM64 con Alpine]** → Una tarea construye `api/Dockerfile.prod` para `linux/arm64` y ejecuta `require('sharp')` en la imagen resultante. Si el lockfile no lleva los binarios `@img/sharp-linuxmusl-arm64`, se regenera antes de desplegar.
- **[CPU y memoria de la conversión en una `t4g.medium` compartida]** → Se aplican cuatro medidas: una conversión a la vez, caché de nginx de 30 días con bloqueo, unas 45 imágenes en total y un límite de tamaño de entrada. Meta guarda sus propias copias de las imágenes, así que no las pide en cada impresión.
- **[Una generación vacía o parcial borra el catálogo de Meta y sus etiquetas]** → Un error de base de datos lanza una excepción y se sirve la generación anterior, como hoy. Un fallo de cotización reutiliza la entrada anterior (decisión 5). Queda el caso de un catálogo vacío de verdad, que es correcto.
- **[Desnudo artístico rechazado por la revisión automática]** → Es decisión del operador no excluir obras. La guía de mantenimiento da el procedimiento: pedir revisión, y como último recurso cambiar el orden de las fotos de esa obra en la web. Eso afecta también a la web y a Google, porque no hay foto por canal.
- **[Una obra vendida sigue en Instagram hasta unas dos horas]** → Ver la decisión 8.
- **[`/cesta` vacía la cesta previa del comprador]** → Lo pide Meta, y solo ocurre si hay algo disponible que añadir.
- **[El validador de Commerce Manager exige algo que `/cesta` no hace]** → El resumen va en el HTML del servidor, con precio y subtotal. Si Meta pide más, se ajusta la página: la URL configurada no cambia.
- **[Meta cambia menús, nombres o requisitos]** → La guía marca las rutas de menú como orientativas y cita las fuentes de cada requisito.
- **[Aviso de variantes sin atributo diferenciador]** → Ver la decisión 3. No bloquea.

## Migration Plan

1. **Despliegue conjunto de API y cliente** con `./deploy/deploy.sh`, que además purga la caché de páginas de nginx. No hay migración de datos ni de esquema.
2. **Comprobación del despliegue:**
   - `https://api.140d.art/api/feeds/google-merchant.xml` sigue igual (mismo número de `<item>` y mismos `id`).
   - `https://api.140d.art/api/feeds/meta-catalog.xml` responde, y sus `image_link` devuelven `image/jpeg` cuadrado.
   - `https://140d.art/cesta?products=art_<id>%3A1` muestra la obra y lleva al cajón.
3. **Pasos en Meta**, según `docs/tienda_meta/`: catálogo, feed horario, conexión del conjunto de datos del píxel, tienda en vista previa, URL de compra, revisión y publicación.
4. **Reversión:** volver a la versión anterior del código deja el feed de Google como estaba, porque su XML no cambió. En Meta basta con pausar la fuente de datos u ocultar la tienda en Commerce Manager. Las rutas JPEG pueden quedarse sin efecto alguno.

## Open Questions

- **¿Muestra Meta el aviso de «variantes sin atributo»?** Hoy la tienda tiene un solo producto, con una sola variante. Se sabrá con el primer diagnóstico.
- **¿La validación de la URL de compra es automática o la confirma el operador a mano?** Las fuentes no lo aclaran. El diseño cubre los dos casos.
