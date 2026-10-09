## Why

Instagram permite a 140d etiquetar sus obras en publicaciones, reels y stories (el sticker de producto) y abrir una tienda en el perfil, pero solo si Meta tiene un catálogo de las obras y la tienda está aprobada. Desde septiembre de 2025 la compra siempre termina en la web del vendedor, y **una tienda sin URL de compra no se muestra**. Hoy 140d no puede dar a Meta ninguna de las dos cosas:

- **No hay catálogo que Meta pueda leer.** El feed de Google (`/api/feeds/google-merchant.xml`) no sirve tal cual. Sus `id` son slugs, y el píxel de Meta, ya instalado con la API de conversiones, identifica los productos como `art_<id>` y `other_<id>_v<variante>`. Un catálogo con otros identificadores no empareja ningún evento. Además, el feed de Google declara `in_stock`, mientras que Meta documenta `in stock`, y agrupa la tienda por producto, cuando la compra se hace por variante.
- **Meta rechaza todas las imágenes.** Las 42 imágenes del catálogo actual están en WebP, y Meta solo admite JPEG o PNG.
- **No hay URL de compra.** Meta envía al comprador a `URL?products=<id>:<cantidad>,…`, y esa página tiene que vaciar la cesta, añadir los productos y mostrar precio y subtotal. 140d no tiene esa página. Además, la obra exige elegir el envío al añadirla a la cesta (`SENDCLOUD_ENABLED_ART` debe seguir en `false`).

El estudio previo está en `docs/tienda_meta/Instagram Shopping para 140d Kuadrat estudio y guía práctica.md`. Este cambio corrige ese estudio contra el código real y deja una guía de configuración por pasos.

## What Changes

- **Una sola generación del catálogo para todos los feeds.** La parte de `api/services/googleMerchantFeed.js` que decide qué productos entran y cómo se describen pasa a un módulo compartido. De esa parte forman la selección (`visibilityPredicate`), las imágenes, el texto, la cotización del envío y la caché de 1 h con generación única. El feed de Google queda como un serializador encima de ese módulo, y su XML **no cambia**.
  - Una cotización que falla por un error pasajero reutiliza la última cotización buena de ese producto en lugar de sacarlo del feed. Esto protege a los dos canales, y sobre todo a Meta, que borra del catálogo lo que falta en el feed y con ello quita las etiquetas de las publicaciones.
- **Feed nuevo para Meta: `GET /api/feeds/meta-catalog.xml`.** RSS 2.0 en el espacio de nombres de Google, que Meta acepta. Lleva:
  - Los identificadores del píxel: `art_<id>` para la obra y `other_<id>_v<variante>` para cada variante con stock de la tienda, con `item_group_id = other_<id>`.
  - `availability = in stock`, `condition = new` y la marca (el artista, o «140d» si no tiene nombre).
  - En la obra, la técnica y las medidas al principio de la descripción, `google_product_category` 500044 y `product_type`, que sirve para las colecciones.
  - Las imágenes en JPEG cuadrado (punto siguiente).
  - Sin `shipping`: con la compra en la web, el envío lo cobra y lo muestra 140d.
- **Copias JPEG cuadradas de las imágenes de producto.** Nuevas rutas `GET /api/art/images/jpeg/v1/:basename.jpg` y `GET /api/others/images/jpeg/v1/:basename.jpg`. Cada una lee el original, encaja la obra entera en un lienzo 1:1 blanco y devuelve un JPEG. Entran en la caché de imágenes que nginx ya tiene para `/api/(art|others)/images/`, así que cada imagen se convierte una vez. La versión `v1` va en la ruta porque un recurso de caché inmutable nunca se sobrescribe: si cambia el formato, cambia el nombre.
- **URL de compra para Meta: `https://140d.art/cesta`.** Página nueva, sin indexar, que:
  - lee `products`, resuelve cada identificador con los endpoints públicos que ya existen y sustituye la cesta por esos productos;
  - pide el envío de cada obra con el `ShippingSelectionModal` de siempre, igual que la ficha;
  - muestra productos, cantidades, precios y subtotal;
  - abre el cajón de compra, donde se puede pagar sin registrarse y con pago exprés de Stripe.

  Lo que ya no está disponible se avisa y se omite. Si no queda nada que comprar, la cesta anterior no se toca.
- **Coherencia del píxel con el catálogo.** El `ViewContent` de un producto de la tienda pasa a declararse como `content_type = product_group`, porque su identificador (`other_<id>`) es ahora el `item_group_id` del catálogo. La obra no cambia.
- **Cesta (infraestructura compartida).** `CartContext` expone si ya ha leído `localStorage`. El cajón de compra se abre con el evento `open-cart-drawer` que `Navbar` ya escucha (lo usan las páginas de pago fallido y cancelado). Las fichas de obra y de tienda construyen la línea de cesta con los mismos constructores que la página `/cesta`, en lugar de con seis copias del objeto escritas a mano.
- **Guía de configuración por pasos** en `docs/tienda_meta/`, con el mismo formato que `docs/google-presencia/`: un README con las decisiones y el estado, y guías numeradas e independientes (cuentas y dominio, feed, catálogo, tienda y URL de compra, etiquetado y promoción, mantenimiento).

## Capabilities

### New Capabilities

- `meta-catalog-feed`: el feed del catálogo de Meta y la generación compartida con el feed de Google. Cubre identificadores comunes con el píxel, variantes, campos, conjunto de productos, caché y la reutilización de la última cotización buena.
- `catalog-jpeg-images`: copias JPEG cuadradas, sobre fondo blanco, de las imágenes de producto para los canales que no aceptan WebP. Cubre rutas versionadas, validación, caché y límites de coste.
- `meta-checkout-url`: la página `/cesta` que reconstruye la cesta desde los parámetros de Meta y lleva al cajón de compra. Cubre la sustitución de la cesta, el envío de la obra, los productos no disponibles y el modo cotización.

### Modified Capabilities

Ninguna. No hay spec del feed de Google (se documentó en `.claude/rules/catalog/merchant-feed.md`), y la que regula el píxel (`environment-aware-analytics`) no fija el `content_type` de los eventos. La garantía de que el XML de Google no cambia queda como requisito de `meta-catalog-feed`.

## Impact

- **Capas:** backend y frontend, más documentación de operador. API y cliente se despliegan juntos (el feed de Meta anuncia la URL de compra que crea el cliente).
- **Esquema de base de datos:** ninguno.
- **Dependencia nueva:** `sharp` en `api/` para convertir WebP a JPEG. Producción es una `t4g.medium` (ARM64) con `node:20-alpine` y `npm ci`, así que el lockfile tiene que llevar los binarios `linuxmusl-arm64`. Hay una tarea que lo comprueba en la imagen de producción.
- **Integración externa:** Meta Commerce Manager **lee** el feed cada hora. La API no llama a Meta para el catálogo: no hay token nuevo ni Catalog Batch API.
- **Backend:** `api/services/googleMerchantFeed.js` (se divide), un módulo compartido nuevo, `api/services/metaCatalogFeed.js`, `api/utils/metaContentId.js`, el controlador y las rutas de feeds, `artRoutes.js` y `othersRoutes.js`, y los tests nuevos en `api/tests/`.
- **Frontend:** `client/app/cesta/` (nueva), `client/contexts/CartContext.js` (**riesgo alto**: infraestructura compartida), `client/lib/cartItems.js` (nuevo), las dos fichas de producto, `client/lib/metaPixel.js` y `client/lib/constants.js`.
- **Operación:** pasos manuales en el porfolio empresarial de Meta y en Commerce Manager, que no se pueden automatizar. Los describe la guía.

## Non-goals

- **Catalog Batch API** para marcar una obra como vendida en el instante de la venta. El feed horario deja un retraso de hasta unas dos horas. Lo cubren la ficha («Vendido»), `/cesta` (que avisa) y la protección de compra concurrente. Queda como un paso futuro, con su coste real (token de usuario del sistema y llamada a Meta en el flujo de pago).
- **Excluir obras concretas de Meta** (p. ej. por desnudo). Decisión del operador: si Meta rechaza una obra, se pide revisión manual o se cambia la foto principal.
- **Cupones.** 140d no tiene códigos de descuento, así que `/cesta` ignora el parámetro `coupon`. No se deben crear ofertas en Commerce Manager.
- **Cambiar los identificadores del feed de Google** o su contenido. Los slugs siguen siendo sus `id`, porque Merchant Center y su fuente complementaria (`el-limite`) dependen de ellos.
- **Pinterest, WhatsApp Business y anuncios de catálogo.** Pueden reutilizar este catálogo más adelante, pero no forman parte del cambio.
- **Una spec del feed de Google.** No existe y este cambio no la crea, más allá del requisito de que su salida no cambie.
- **Atribución en el pedido** (`cart_origin`, UTM). Plausible ya registra `utm_source=IGShopping` desde la URL de aterrizaje, y el píxel registra los eventos.
