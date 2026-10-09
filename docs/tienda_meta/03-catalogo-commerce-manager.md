# 03 · Catálogo en Commerce Manager

**Para qué:** el catálogo es la base de datos de productos dentro de Meta. De él beben la tienda de Instagram y Facebook, las etiquetas, el sticker de las stories y, en el futuro, los anuncios de catálogo y WhatsApp.

**Cuándo:** después de desplegar el cambio, con el feed respondiendo en `https://api.140d.art/api/feeds/meta-catalog.xml` (guía 02), y con la guía 01 terminada.

**Tiempo:** 20 minutos, más la primera lectura de Meta (unos minutos).

## Paso 1 · Crear el catálogo

1. Ve a https://business.facebook.com/commerce, con el porfolio de 140d seleccionado.
2. **Añadir catálogo** (o **Crear catálogo**) → tipo **Comercio electrónico** (productos en línea) → **Siguiente**.
3. Método de subida: **Subir información de producto** (no «Conectar una plataforma asociada»: la web no usa Shopify ni similares).
4. Propietario: **el porfolio de 140d**. Nombre: `140d · Catálogo`.
5. **Crear.**

## Paso 2 · Conectar el feed con lectura cada hora

1. En el catálogo, **Catálogo → Fuentes de datos → Añadir artículos**.
2. Elige **Fuente de datos** (o **Feed de datos**) → **Feed programado** (con URL, no «subir un archivo»).
3. URL: `https://api.140d.art/api/feeds/meta-catalog.xml`. Deja vacíos el usuario y la contraseña: el feed es público.
4. Frecuencia: **Cada hora**.
5. Si pregunta el tipo de actualización, elige **Sustituir** (*Replace*). Es lo que hace que una obra vendida desaparezca del catálogo. Con «Actualizar» las obras vendidas se quedarían para siempre.
6. Moneda predeterminada: **EUR**. Nombre de la fuente: `Feed 140d (API)`.
7. **Guardar** y, si lo ofrece, **Subir ahora**.

## Paso 3 · Revisar la primera carga

Espera a que termine (Fuentes de datos → `Feed 140d (API)` → estado **Completado**) y revisa tres cosas.

1. **Número de artículos.** En **Catálogo → Artículos** tiene que haber tantos como `<item>` hay en el feed.
2. **Problemas.** En **Catálogo → Problemas** (o Diagnóstico), lo normal en la primera carga es lo siguiente:

   | Aviso | Qué hacer |
   |---|---|
   | Variantes de un grupo sin atributo que las diferencie | Nada. Las variantes de la tienda no son de color ni de talla. El aviso no bloquea |
   | Falta `gtin` o identificador del fabricante | Nada. La obra original no tiene GTIN |
   | Imagen no válida o formato no admitido | **No es normal.** Abre el `image_link` de ese artículo: tiene que ser un JPEG. Si no, avisa: algo falla en la conversión |
   | Artículo rechazado por las políticas (desnudo, contenido sugerente) | Guía 06, «Obra rechazada» |
   | Precio o enlace no válido | **No es normal.** Copia el `<item>` del feed y revísalo |

3. **Un artículo cualquiera.** Abre una obra en **Artículos**. Comprueba que se ve la foto cuadrada con la obra entera, el título «Nombre – Artista», el precio y el enlace a `140d.art/galeria/p/…`.

## Paso 4 · Conectar el píxel al catálogo

Así Meta relaciona las visitas y las compras de la web con cada obra del catálogo. Es imprescindible para los anuncios de catálogo y útil para las estadísticas.

1. En el catálogo, **Configuración → Fuentes de eventos** (o **Conjuntos de datos y píxeles**) → **Conectar** → conjunto de datos `1057434273433077` → **Guardar**.
2. A los pocos días, en **Catálogo → Fuentes de eventos** aparece la **coincidencia de contenido** de `ViewContent`, `AddToCart` y `Purchase`: el porcentaje de eventos cuyo producto existe en el catálogo. Debería estar por encima del 90 %. Si es bajo, avisa: el píxel y el feed tienen que usar los mismos identificadores (`art_…`, `other_…`).

## Paso 5 · Conjuntos de productos (opcional ahora)

Son filtros guardados del catálogo. La tienda los usa para las colecciones (guía 05) y los anuncios para segmentar. En **Catálogo → Conjuntos → Crear conjunto → Usar filtros**:

| Conjunto | Filtro |
|---|---|
| Uno por artista | **Marca** es igual a «Nombre del artista» |
| Obra original | **Tipo de producto** contiene «Obra original» |
| Obra sobre papel | **Tipo de producto** contiene «papel» |
| Tienda | **Tipo de producto** es igual a «Tienda» |
| Por debajo de X € | **Precio** es menor que X |

Los conjuntos se actualizan solos con cada lectura del feed. Una obra nueva de un artista entra sola en su conjunto.

## Lista de comprobación

- [ ] Catálogo `140d · Catálogo`, de comercio electrónico, propiedad del porfolio
- [ ] Feed programado **cada hora**, en modo **Sustituir**, con la URL de la API
- [ ] Primera carga completada, con tantos artículos como `<item>` y sin errores de imagen, precio ni enlace
- [ ] Conjunto de datos `1057434273433077` conectado al catálogo
- [ ] (Opcional) Conjuntos por artista

Siguiente: [04 · Tienda y URL de compra](04-tienda-y-url-de-compra.md).
