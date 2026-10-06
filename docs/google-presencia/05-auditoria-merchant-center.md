# 05 · Auditoría de Merchant Center (06/10/2026)

Contexto: Merchant Center (cuenta 5846987403, «140d Servicios Digitales SL») carga los productos desde una hoja de cálculo de Google («Google sheets general»), que se obtiene a diario. Las 42 fichas de la web (41 obras y el libro «El Límite») están aprobadas. Para esta auditoría se cruzaron:

- la exportación CSV de la hoja;
- el JSON-LD de cada ficha en producción;
- los costes de envío reales que da la API del checkout, por zona (28001 península, 07001 Baleares, 35001 Canarias, 51001 Ceuta), consultados el 06/10/2026;
- las imágenes del CDN;
- las capturas de la cuenta.

## Lo que está bien

- Las **42 filas** coinciden una a una con las 42 fichas de la web. No falta ninguna y no sobra ninguna.
- **Enlaces** canónicos, **precios** exactos y **disponibilidad** coherente (todas a la venta).
- `brand` con el nombre del artista, `condition = new` e `identifier_exists = no` en las obras.
- Tienda online **verificada y reclamada**. Los datos de empresa coinciden con el aviso legal (140D Servicios Digitales S.L., Salamanca).
- 42 de 42 productos aprobados; la fuente se actualiza a diario.

## Lo que hay que corregir en la hoja

Todo está ya corregido en **`feed-merchant-center-corregido.csv`** (en esta carpeta). Cómo aplicarlo, más abajo.

| Gravedad | Problema | Corrección |
|---|---|---|
| Alta | **`id` y `title` intercambiados en las obras de Chema B.** Google muestra como título el slug (`retrogeometria-26`, `question`…), y seis identificadores llevan espacios o acentos; uno es literalmente `?`. | `id` = slug de la URL y `title` = nombre de la obra. |
| Alta | **`unit_pricing_measure` relleno con el peso en las 42 filas.** Ese atributo es para productos que se venden por peso o volumen: Google calcula y puede mostrar un precio por unidad (un collage de 253 € y «50 g» saldría a 5.060 €/kg). | Columna eliminada. |
| Media | **El envío no se parece al que cobra el checkout.** La política de la cuenta calcula por peso, pero los pesos de la hoja no son los del paquete y el precio real no depende de ellos. Dos obras de «1 kg» cuestan 34,76 € y 68,36 €, y obras de «8 kg» y de «5 kg» cuestan lo mismo. El coste real va de 5,89 € a 68,36 € según la obra y la zona. | Columna `shipping` por producto con el coste real (ver «El envío»). Se quitan `shipping_weight` y la dependencia del peso. |
| Media | **`image_link` apunta al optimizador de Next** (`/_next/image?url=…&w=1920`). Esa URL depende de la configuración de imágenes de Next (un cambio en los anchos permitidos la rompe) y la sirve el servidor de la web, que es el cuello de botella de producción. Google pide una URL que no cambie. | La URL directa del CDN (`https://cdn.140d.art/…webp`), inmutable y servida por CloudFront. Las 52 cumplen los requisitos: WebP admitido, lado menor ≥ 500 px y como máximo 4,5 MB (el límite es 16 MB). |
| Baja | **`additional_image_link` vacío.** Los cuatro «Frágil» y «El Límite» tienen 3 fotos en la web. | Fotos adicionales añadidas. |
| Baja | **«El Límite»: la imagen principal no es la de la web.** | La primera foto de la ficha. |
| Baja | **`product_highlight` usado como etiquetas** («"Obra de arte", "Óleo…"»). Debe ser una frase de ventaja. Además, `gender`, `age_group` y `adult` son atributos de ropa y no aportan nada a una obra. La técnica del libro tenía una errata («Líbro»). | Columnas eliminadas; `material` vacío en el libro. |
| Mejora | Sin categoría de Google y con títulos de una o dos palabras. | `google_product_category` = 500044 («Casa y jardín > Decoración > Obras de arte > Carteles, copias y arte visual»), o 784 («Multimedia > Libros») para el libro. Títulos con artista, técnica y medidas: «Frágil #1 – BAZKEZ · Acrílico sobre madera · 30 × 30 cm». |

### El envío: qué valor lleva la columna `shipping`

Formato: `ES:::<coste> EUR`. Para Google, un envío indicado en el producto **sustituye** la política de la cuenta.

En España, Merchant Center no admite precios por código postal en el producto (solo en Alemania, Australia, Brasil, Canadá, EE. UU., Francia, India, Nueva Zelanda y Reino Unido). Por eso hay un solo precio por obra para toda España. La regla de Google es: «Si no puede proporcionar la tarifa exacta, realice una estimación por lo alto. Envíe una cifra igual o superior».

El CSV lleva, para cada producto, **el coste más alto entre las zonas a las que se envía**:

- **23 productos**: es exacto, porque cuestan lo mismo en todas sus zonas. La mayoría solo se envía a península y Baleares, al mismo precio.
- **19 productos** (los 6 de Alicia Nieto Velázquez, los 12 «Umbral» y el libro): el precio de Canarias es más alto, así que Google mostrará más de lo que paga un comprador peninsular.

| Producto | Península | Valor del CSV |
|---|---|---|
| Ventanas y horizontes (I y II) | 13,61 € | 25,33 € |
| El mapa que habito (I y II), Espacios vacíos, Iluminados por la misma luz | 15,29 € | 27,91 € |
| Umbral #1, #4, #8, #10, #13 | 5,89 € | 12,62 € |
| Umbral #11, #19, #21 | 6,04 € | 12,98 € |
| Umbral #28, #31, #32, #36 | 6,11 € | 13,16 € |
| El Límite | 4,08 € | 9,58 € |

Si prefieres mostrar el precio peninsular en esos 19, sustituye el valor de la tabla. Es más atractivo para la mayoría de compradores, pero se queda por debajo para los de las islas, que es lo que Google pide evitar.

**Limitación que queda:** 23 obras no se envían a Canarias, Ceuta ni Melilla, y Google no permite excluir esas zonas por producto en España. Un comprador de allí puede ver la obra en Google y descubrir en el carrito que no hay envío.

### Cómo aplicar el CSV corregido

1. Merchant Center → **Fuentes de datos** → en «Google sheets general», **Abrir**. Se abre la hoja.
2. En la hoja: **Archivo → Importar → Subir** → `feed-merchant-center-corregido.csv` → **Reemplazar la hoja actual**, con el separador detectado automáticamente.
3. Merchant Center → **Fuentes de datos** → **Actualizar**.
4. A las 24–48 h, revisa **Productos → Requiere atención**. Las 6 obras de Chema B a las que se les corrige el `id` aparecerán como productos nuevos y pasarán otra vez la revisión, y las 6 antiguas desaparecerán. Es lo esperado.

El CSV es una **foto del 06/10/2026**. Si desde entonces se ha vendido o publicado alguna obra, o se ha recotizado un envío, ajusta esa fila antes de importarlo.

## Lo que hay que corregir en la cuenta

1. **Desvincular el Perfil de Empresa** (Configuración → Información de empresa → **Tiendas**). «140d Galería de Arte» está vinculado a Merchant Center. Márcalo y quítalo **antes** de quitar el Perfil de Empresa (guía 01). Si la opción no aparece al marcar la casilla, búscala en Configuración → **Acceso y servicios**.
2. **Completar la política de devoluciones**. «Calidad de la tienda» marca «Gastos de devolución: **Incompleto**». En **Envíos y devoluciones → Políticas de devoluciones** debe quedar exactamente lo que dicen los términos publicados:
   - España;
   - **14 días** desde la recepción;
   - devolución por correo;
   - **gastos de devolución a cargo del cliente**;
   - artículo sin usar y en su embalaje original;
   - reembolso en 14 días como máximo.
3. **Completar la política de envío** (aparece como «Finaliza la configuración», con el nombre del servicio vacío). Con la columna `shipping`, ya no fija el precio de ningún producto: solo es la red de seguridad para uno que llegue sin esa columna. Para dejarla así:
   - ponle nombre al servicio, por ejemplo «Envío a domicilio»;
   - cambia el coste de «Peso» a un **precio fijo de 70 €**, por encima de cualquier envío real actual (el máximo es 68,36 €), para que nunca se quede corto;
   - deja los plazos de entrega.

## Respuestas del 06/10/2026 y qué cambia con ellas

- **«El Límite» tiene ISBN 978-84-09-87101-8.** Google exige enviarlo en los libros, como `gtin` = `9788409871018` con `identifier_exists = yes`.
  - Con el feed automático (guía 06), va en una fuente adicional de Merchant Center.
  - Mientras siga la hoja, añade a su fila dos columnas, `gtin` y `identifier_exists`, con esos valores.
- **Cada artista tarda unos 4 días en preparar un envío.** El feed automático declara una preparación de 3 a 5 días hábiles, más el tránsito real. Así Google vuelve a mostrar un plazo de entrega.
  - En la hoja, ese plazo exigiría una columna `shipping` con encabezado ampliado por obra. No merece la pena si el feed se activa pronto.
- **La sociedad está dada de alta en el registro de operadores intracomunitarios.** El NIF-IVA (`ESB88732599`) ya se publica en el JSON-LD de la web (cambio 4, guía 04).

## Seguimiento

A las 24–48 h de cambiar la fuente (o de importar la hoja, si el feed tarda en desplegarse), haz dos capturas:

- **Envíos y devoluciones → Políticas de devoluciones**;
- **Productos → Requiere atención**.

## Mantenimiento mientras el feed sea una hoja

- **Obra vendida**: bórrala de la hoja o pon `out_of_stock` el mismo día. Las actualizaciones automáticas de artículos ya lo corrigen solas al leer la ficha, porque desde el despliegue del 06/10/2026 declara `Product`.
- **Obra nueva**: añade su fila con el mismo formato.
- **Envío recotizado en la calculadora**: actualiza su columna `shipping`.

Todo esto desaparece al activar el feed automático (guía 06).

## Fuentes

- Atributo `shipping` (formato, prefijos por país, estimación por lo alto): https://support.google.com/merchants/answer/6324484?hl=es
- Atributo `image_link` (formatos, tamaños, URL estable): https://support.google.com/merchants/answer/6324350?hl=es
- Precio por unidad (`unit_pricing_measure`): https://support.google.com/merchants/answer/6324455
- Taxonomía de productos de Google (es-ES): https://www.google.com/basepages/producttype/taxonomy-with-ids.es-ES.txt
- Actualizaciones automáticas de artículos: https://support.google.com/merchants/answer/3246284?hl=es
