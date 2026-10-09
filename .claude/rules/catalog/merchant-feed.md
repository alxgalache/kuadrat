---
paths:
  - "api/services/{googleMerchantFeed,productFeedCatalogue}.js"
  - "api/{controllers/feedController,routes/feedRoutes,utils/productImageUrl}.js"
  - "api/tests/googleMerchantFeed.test.js"
  - "docs/google-presencia/**"
---

## Feed de Google Merchant Center

`GET /api/feeds/google-merchant.xml` (`api/services/googleMerchantFeed.js`) genera desde la base de datos el feed que Merchant Center obtiene una vez al día. Sustituyó en octubre de 2026 a una hoja de cálculo editada a mano. Contexto completo, auditoría y decisiones: `docs/google-presencia/`.

**Desde el cambio `meta-instagram-shop`, qué se vende, cómo se describe, el envío y la caché viven en `api/services/productFeedCatalogue.js`**, compartido con el feed de Meta. `googleMerchantFeed.js` solo escribe ese catálogo en el formato de Google, con slugs como `id`. Lo propio de Meta está en `.claude/rules/catalog/meta-catalog.md`.

* **140d no tiene Perfil de Empresa de Google y no debe volver a tenerlo.** Es una tienda solo online, y Google excluye expresamente a los negocios solo online («marcas, organizaciones, artistas…»). Su presencia va por Merchant Center y el perfil de marca. Tampoco se declara `ArtGallery` en el JSON-LD: es un `LocalBusiness`.
* **El conjunto de productos es el del catálogo**: `visibilityPredicate` (el mismo de los listados) y, en la tienda, stock > 0. Una obra vendida, en subasta o en sorteo sale del feed sola, y Merchant Center la borra en la siguiente lectura.
* **El envío se cotiza con `quoteSellerGroups`, el mismo módulo que cobra el checkout**, una vez por grupo de zona y en su código postal representativo (`ZONE_GROUP_POSTAL_CODES`). Nunca con una consulta paralela: es el invariante de `zoneResolver`.
* **Un solo precio de envío por producto para toda España**, el del grupo más caro al que se envía. Merchant Center solo admite precios por código postal en nueve países, y España no está entre ellos. Google pide una cifra «igual o superior» cuando no puede ser exacta. Por eso hay obras que en Google muestran el envío a Canarias aunque el comprador sea peninsular.
* **Lo que no se puede describir con verdad se deja fuera, no se adivina**: sin imagen o sin ningún grupo con envío (`warn`). Una cotización fallida (`error`) también lo saca, salvo si el producto estaba en la generación anterior: entonces conserva la cotización anterior, porque en Meta sacarlo borraría sus etiquetas de Instagram.
* **Imágenes**: URL directa del CDN (`utils/productImageUrl.js`), inmutable. Nunca la del optimizador de Next: depende de su configuración y la sirve el servidor saturable.
* **Caché de 1 h con generación única compartida**, también con el feed de Meta: los dos salen de la misma generación. La URL es pública y cada generación cotiza todo el catálogo, Sendcloud incluido. Si una generación falla, se sirve la anterior.
* **El GTIN no vive en la base de datos.** Las obras declaran `identifier_exists = no`. Los productos de la tienda no declaran nada, y el ISBN de un libro va en una fuente complementaria de Merchant Center («id», «gtin», `identifier_exists = yes`). El feed no puede mandar `no` en la tienda: chocaría con ese GTIN, y quién gana entre la fuente principal y la complementaria es un ajuste de Merchant Center. Las fuentes complementarias exigen activar el complemento «Gestión avanzada de fuentes de datos».
* **La API no conoce el modo cotización** (`NEXT_PUBLIC_ART_BUY_AVAILABLE` es del cliente). Si la tienda deja de vender, hay que pausar la fuente en Merchant Center a mano.
* `api/tests/googleMerchantFeed.test.js` cubre el conjunto de productos, el precio de envío máximo, las imágenes, el escapado XML y la caché, sin red.
