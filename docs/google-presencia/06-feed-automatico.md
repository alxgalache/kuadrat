# 06 · Feed automático de Merchant Center

Contexto: Merchant Center carga hoy los productos de 140d desde una hoja de cálculo de Google, corregida a mano el 06/10/2026 (ver `05-auditoria-merchant-center.md`). Cada venta, cada obra nueva y cada envío recotizado exigen editarla. El feed automático la sustituye: la API genera el mismo contenido desde la base de datos, y Merchant Center lo descarga una vez al día.

**Estado:** implementado y con tests (06/10/2026), **pendiente de desplegar**.

## Cómo funciona

URL: **`https://api.140d.art/api/feeds/google-merchant.xml`**. Es un XML RSS 2.0, el formato estándar de Google.

| Dato | De dónde sale |
|---|---|
| Qué productos entran | Los mismos que muestran la galería y la tienda: visibles, aprobados, no vendidos, no en subasta ni en sorteo y, en la tienda, con stock. |
| `id` | El slug de la URL (`fragil-1`): los mismos identificadores que la hoja corregida. |
| `title` | «Nombre – Artista · Técnica · Alto × Ancho cm» en las obras; «Nombre – Artista» en la tienda. |
| `description` | La descripción de la ficha, sin HTML. |
| `price`, `availability` | La base de datos, en el momento de la descarga. |
| `image_link`, `additional_image_link` | Las fotos del producto, en su orden, con la URL directa del CDN (`https://cdn.140d.art/…`). |
| `brand`, `material` | El artista y la técnica. |
| `google_product_category` | 500044 («Obras de arte > Carteles, copias y arte visual») en las obras. Ninguna en la tienda. |
| `shipping` (precio) | **El mismo cálculo que cobra el checkout**, pedido para un código postal de cada zona (28001 península, 07001 Baleares, 35001 Canarias, 51001 Ceuta). Se publica el de la zona más cara a la que se envía, por la regla de Google (ver la guía 05). |
| `shipping` (plazos) | Preparación de **3 a 5 días hábiles** (tu dato: «unos 4 días»), más el tránsito que declaran los métodos de envío. |

**Lo que se deja fuera** (y queda en el registro de la API): un producto sin foto, sin ninguna zona con envío o cuya cotización falle. Google no puede anunciar con verdad algo que no se puede comprar desde la ficha.

**Caché:** la API genera el feed como mucho una vez por hora. Generarlo lleva unos segundos, porque cotiza todo el catálogo. Si una generación falla, sirve la anterior.

**Lo que el feed no sabe:**

- **El ISBN**: los libros lo llevan en una fuente adicional (paso 4).
- **El modo cotización**: si algún día la tienda deja de vender directamente, pausa la fuente en Merchant Center.

## Cómo activarlo (después de desplegar)

1. **Desplegar API y cliente juntos** con `./deploy/deploy.sh`. El despliegue incluye también el cambio 4 (denominación social y CIF en el JSON-LD).
2. **Comprobar el feed** abriendo `https://api.140d.art/api/feeds/google-merchant.xml` en el navegador:
   - Al principio debe decir `<link>https://140d.art</link>`. Si dice otra cosa, `CLIENT_URL` de producción no es la del sitio, y los enlaces de los productos estarían mal.
   - Los `image_link` deben empezar por `https://cdn.140d.art/`.
   - Debe haber tantos `<item>` como obras y productos a la venta. Si falta alguno, el registro de la API dice por qué («Product left out of the Google Merchant feed»).
3. **Cambiar la fuente en Merchant Center:**
   1. **Fuentes de datos → Añadir fuente de productos →** la opción de archivo **desde una URL / obtención programada**.
   2. URL: la del paso 2. Frecuencia: **diaria**. País: **España**. Idioma: **español**. Etiqueta de feed: **ES**, la misma que la fuente actual; si no coincide, Merchant Center los trataría como productos distintos.
   3. Pulsa **Obtener ahora** o **Actualizar**, y espera a que procese los productos sin errores.
   4. **Elimina la fuente «Google sheets general».** Los productos siguen existiendo, porque la fuente nueva aporta los mismos `id`. Si Merchant Center muestra durante unas horas avisos de productos duplicados entre las dos fuentes, desaparecen al eliminar la hoja.
4. **Fuente adicional con el ISBN de «El Límite»:**
   1. Crea una hoja de cálculo nueva con esta cabecera y una fila:

      | id | gtin | identifier_exists | google_product_category |
      |---|---|---|---|
      | el-limite | 9788409871018 | yes | 784 |

      El ISBN 978-84-09-87101-8 se escribe sin guiones. Su dígito de control es correcto.
   2. **Fuentes de datos → Añadir fuente de productos adicional →** Hojas de cálculo de Google → esa hoja.
   3. Vincúlala a la fuente principal del paso 3.

   Opcional: añade una columna `title` con «El Límite – Pilar Español · Libro, tapa blanda». Así recuperas el título más descriptivo de la hoja corregida, porque el feed solo pone «El Límite – Pilar Español».
5. A partir de aquí, **no hay mantenimiento manual**. Una obra vendida desaparece en la siguiente descarga diaria. Entre medias, las actualizaciones automáticas de artículos la marcan como agotada al leer su ficha, que ya declara `Product`. Una obra nueva aparece sola, y un envío recotizado se refleja solo.

## Si hay que tocar algo

| Quiero cambiar… | Dónde |
|---|---|
| Los días de preparación | `HANDLING_DAYS` en `api/services/googleMerchantFeed.js` |
| La categoría de las obras | `ARTWORK_CATEGORY`, en el mismo fichero |
| Qué productos entran | `visibilityPredicate` (`api/services/catalogOrdering.js`). Es el de los listados, a propósito |
| El GTIN, la categoría o el título de un producto concreto | La fuente adicional de Merchant Center, sin código |

Detalles técnicos y por qué cada decisión: `.claude/rules/catalog/merchant-feed.md` y el comentario de cabecera de `api/services/googleMerchantFeed.js`. Tests: `api/tests/googleMerchantFeed.test.js`.

## Fuentes

- Especificación de datos de producto de Google: https://support.google.com/merchants/answer/7052112?hl=es
- Atributo `shipping` (plazos, estimación por lo alto, países con código postal): https://support.google.com/merchants/answer/6324484?hl=es
- Actualizaciones automáticas de artículos: https://support.google.com/merchants/answer/3246284?hl=es
