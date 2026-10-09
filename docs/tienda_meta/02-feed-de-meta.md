# 02 · El feed de Meta

**Para qué:** el catálogo de Meta se alimenta de un fichero que la API genera desde la base de datos. Cada alta, cada cambio de precio y cada venta llega sola a Instagram. Esta guía explica qué opción se eligió, qué lleva cada obra y cómo comprobarlo.

**Estado:** en producción desde el 09/10/2026. Cambio archivado en `openspec/changes/archive/2026-10-09-meta-instagram-shop/`, y specs en `openspec/specs/meta-catalog-feed/` y `openspec/specs/catalog-jpeg-images/`.

## Qué opción se eligió y por qué

140d ya tiene un feed para Google Merchant Center (`/api/feeds/google-merchant.xml`). Había tres caminos:

| Opción | Qué supone | Veredicto |
|---|---|---|
| Dar a Meta la URL del feed de Google | Ni una línea de código | **No sirve.** Sus identificadores son slugs (`fragil-1`), y el píxel identifica las obras como `art_57`: Meta no relacionaría visitas ni compras con el catálogo. Las fotos son WebP, que Meta rechaza. Declara `in_stock` y Meta documenta `in stock`. La tienda va por producto y la compra por variante |
| Un feed nuevo e independiente | Otra consulta a la base de datos | **No.** Habría dos respuestas distintas a «qué se vende», que acabarían divergiendo |
| **El mismo catálogo con dos formatos de salida** | La API decide una vez qué se vende y lo escribe en el formato de Google y en el de Meta | **Elegida.** Los dos feeds no pueden contradecirse, y el de Google no cambia ni un byte |

Con esta opción, una sola generación cada hora sirve a los dos feeds. Generar el catálogo cuesta unos segundos, porque cotiza el envío de cada producto.

## Qué entra en el catálogo de Meta

Exactamente lo mismo que en el de Google:

- obras **visibles, aprobadas, no vendidas, no en subasta ni en sorteo**;
- de la tienda, **cada variante con stock**: un libro con «tapa dura» y «tapa blanda» son dos artículos del mismo grupo;
- **con al menos una foto y con envío** a alguna zona de España.

**Una obra vendida sale del feed, y Meta la borra del catálogo** en su siguiente lectura. Su etiqueta desaparece de las publicaciones en las que estuviera. Es lo esperado: Meta quita la etiqueta también si la obra solo se marca como agotada, así que no hay forma de conservarla.

Si un día falla la cotización del envío de un producto (por ejemplo, Sendcloud caído), la API reutiliza la última cotización buena de ese producto en vez de sacarlo. Así un fallo pasajero no le cuesta las etiquetas.

## Qué lleva cada obra

| Campo | Qué pone la API | Ejemplo |
|---|---|---|
| `id` | El identificador del píxel | `art_57` · `other_4_v12` |
| `item_group_id` | Solo en la tienda: el producto al que pertenece la variante | `other_4` |
| `title` | «Nombre – Artista», más la variante si hay varias | `Frágil 1 – Pilar Español` |
| `description` | Técnica y medidas, y después la descripción de la ficha sin HTML | `Técnica mixta sobre papel · 30 × 40 cm. Serie Frágil…` |
| `price` | El precio de la web | `350.00 EUR` |
| `availability` / `condition` | Siempre `in stock` / `new`: lo que no se puede comprar no está | — |
| `quantity_to_sell_on_facebook` | **1** en cada obra (se vende de una en una) y el stock real en cada variante de la tienda. Sin este campo Meta cuenta 0 y la tienda muestra «Agotado» | `1` |
| `link` | La ficha en 140d.art | `https://140d.art/galeria/p/fragil-1` |
| `image_link` y adicionales | Hasta 3 fotos, en su orden, en **JPEG cuadrado de 1600 px** con la obra entera sobre blanco | `https://api.140d.art/api/art/images/jpeg/v1/<foto>.webp.jpg` |
| `brand` | El artista (o «140d» si falta). Sirve para agrupar por artista | `Pilar Español` |
| `product_type` | `Obra original > técnica` o `Tienda`. Sirve para las colecciones | `Obra original > Óleo sobre lienzo` |
| `google_product_category` | Obras de arte (500044), solo en las obras | `500044` |

**Sin envío en el feed.** La compra se cierra en la web, que calcula y cobra el envío real.

**Las fotos.** La API convierte cada foto la primera vez que alguien la pide, y nginx guarda la copia 30 días. Cambiar las fotos de una obra en la web basta: las nuevas tienen otro nombre y llegan solas.

**Retraso.** Meta lee el feed cada hora y la API lo regenera como mucho una vez por hora: un cambio tarda **hasta unas dos horas** en verse en Instagram. Si alguien entra desde Instagram a una obra recién vendida, la web le dice que ya no está disponible, y el pago impide venderla dos veces.

## Cómo comprobarlo (tras desplegar)

1. Abre `https://api.140d.art/api/feeds/meta-catalog.xml` en el navegador.
   - Debe haber un `<item>` por obra a la venta y uno por variante con stock de la tienda.
   - Los `<g:id>` empiezan por `art_` u `other_`.
   - Los `<g:link>` empiezan por `https://140d.art/`.
2. Copia un `<g:image_link>` y ábrelo: tiene que verse la obra entera en un cuadrado blanco. Si lo abres con «Guardar como», es un `.jpg`.
3. Abre `https://api.140d.art/api/feeds/google-merchant.xml` y comprueba que sigue igual que antes: mismos `<g:id>` (slugs) y mismo número de productos.
4. Si falta algún producto, el registro de la API dice por qué («Product left out of the product feeds», con el motivo). Los dos feeds comparten esa decisión.

## Si hay que tocar algo

| Quiero cambiar… | Dónde |
|---|---|
| Qué productos entran | `visibilityPredicate` (`api/services/catalogOrdering.js`), el de los listados, a propósito |
| Los campos del feed de Meta | `api/services/metaCatalogFeed.js` |
| El tamaño o el fondo de las fotos JPEG | `api/services/catalogImageService.js`, **y pasar `CATALOG_JPEG_VERSION` a `v2`** en `api/utils/productImageUrl.js`, que mueve a la vez las rutas y los enlaces del feed: una URL `v1` nunca cambia de contenido |
| El formato de los identificadores | **No lo cambies.** Lo comparten el píxel (`client/lib/metaPixel.js`) y la API (`api/utils/metaContentId.js`). Cambiarlo obliga a rehacer el catálogo y pierde todas las etiquetas |

Siguiente: [03 · Catálogo en Commerce Manager](03-catalogo-commerce-manager.md).
