# author-filter-skeleton

## Purpose

Qué ve el visitante entre la pulsación de un artista del filtro de autor y la llegada de la página de destino en `/galeria`, `/tienda` y sus fichas de autor. El filtro navega a otra ruta, ISR y sin precarga, así que cada pulsación espera un render de servidor completo (1285 ms medidos en producción la primera vez), y sin esta capacidad la página anterior se quedaba intacta y sin ninguna señal. La lista de autores y la rejilla pasan a un esqueleto que ocupa exactamente las cajas de lo que sustituye, durante exactamente lo que dura la navegación.

> Capa afectada: `client/hooks/useAuthorFilterNavigation.js`, `client/components/AuthorSidebar.js`, `client/components/AuthorMobileFilter.js`, `client/components/ProductGrid.js`, el bloque `.skeleton` de `client/app/globals.css`, `AUTHOR_FILTER_LOADING_COPY` en `client/lib/constants.js` y los componentes de contenido de las cuatro rutas.

## Requirements

### Requirement: Estado de espera inmediato al usar el filtro de autor

En `/galeria`, `/tienda`, `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]`, al activar un control del filtro de autor (seleccionar un artista, cambiar a otro o quitar el filtro), la lista de autores y la rejilla de productos SHALL sustituirse por su esqueleto en la misma respuesta a la pulsación, sin esperar a ninguna petición de red.

La lista de autores es el sidebar en anchos `lg` y superiores, y la fila de chips por debajo. La etiqueta «Autores» SHALL seguir pintándose como texto: no cambia con el filtro.

#### Scenario: Seleccionar un artista desde el listado completo

- **WHEN** un visitante de `/galeria` pulsa el nombre de un artista en el sidebar
- **THEN** las filas del sidebar y las celdas de la rejilla SHALL pasar a esqueleto antes de que responda el servidor
- **THEN** el navegador SHALL navegar a `/galeria/autor/<slug>`

#### Scenario: Cambiar de artista desde una ficha de autor

- **WHEN** un visitante de `/tienda/autor/<a>` pulsa el chip de otro artista en un móvil
- **THEN** los chips y las celdas de la rejilla SHALL pasar a esqueleto
- **THEN** el navegador SHALL navegar a `/tienda/autor/<b>`

#### Scenario: Quitar el filtro

- **WHEN** un visitante de `/galeria/autor/<slug>` pulsa la X del artista seleccionado, o vuelve a pulsar su nombre
- **THEN** la lista y la rejilla SHALL pasar a esqueleto
- **THEN** el navegador SHALL navegar a `/galeria`

### Requirement: El estado de espera dura exactamente lo que la navegación

El estado de espera SHALL derivarse de la propia navegación del router de Next, no de un temporizador. SHALL terminar cuando la página de destino se monta, y NO SHALL imponer una duración mínima.

#### Scenario: Llega la página de destino

- **WHEN** termina la navegación iniciada por el filtro
- **THEN** el esqueleto SHALL desaparecer en el mismo commit en que se pinta la página de destino, con su lista de autores y su rejilla reales

#### Scenario: Navegación muy rápida

- **WHEN** la página de destino ya está en la caché del router y la navegación termina casi en el acto
- **THEN** el esqueleto NO SHALL alargarse artificialmente

### Requirement: Cada pieza del esqueleto mide lo mismo que el elemento real

El esqueleto SHALL pintarse con los mismos contenedores y clases de maquetación que los elementos a los que sustituye, de modo que en cualquier ancho de pantalla cada pieza ocupe exactamente la caja del elemento real:

- **Fila del sidebar:** la misma caja (alto, relleno, separaciones y ancho). Un círculo del tamaño del icono de información en su lugar, y una barra que empieza donde empieza el nombre y mide lo que mide ese nombre, recortado igual que el real cuando no cabe. El hueco reservado a la X se conserva.
- **Chip de la fila móvil:** el mismo ancho y el mismo alto que el chip real del mismo artista, incluido el del artista seleccionado.
- **Celda de la rejilla:** las mismas columnas, separaciones y márgenes laterales en cada punto de corte. Un cuadrado con el tamaño y el redondeo del hueco de la imagen, y un bloque de texto con la altura total del real cuando cada línea cabe en una (autor, título y precio con sus interlineados y separaciones), con una barra centrada dentro de cada línea. Un texto real que salta de línea hace más alta la celda real. Esa altura depende de textos del destino que aún no han llegado, así que queda fuera de esta garantía.

La rejilla de esqueleto SHALL tener `DEFAULT_PAGE_SIZE` celdas, el máximo que puede pintar la primera página de cualquier destino.

#### Scenario: Comparación al píxel en escritorio

- **WHEN** se activa el filtro con la ventana a 1440 px de ancho
- **THEN** la caja de cada fila de esqueleto del sidebar SHALL coincidir en posición y tamaño con la de la fila real del mismo artista
- **THEN** la caja de cada celda de esqueleto SHALL coincidir con la de la celda real que ocupaba esa posición cuando el autor, el título y el precio de esa fila caben en una línea

#### Scenario: Textos que saltan de línea

- **WHEN** se activa el filtro con la ventana a 1024 px de ancho y alguna celda real tiene un nombre de artista o un título partido en dos líneas
- **THEN** el cuadrado de la imagen y el arranque del bloque de texto de cada celda de esqueleto SHALL coincidir con los reales
- **THEN** la fila de esqueleto SHALL medir lo que mide una fila cuyos textos caben en una línea

#### Scenario: Comparación al píxel en móvil

- **WHEN** se activa el filtro con la ventana a 390 px y a 768 px de ancho
- **THEN** cada chip de esqueleto SHALL medir lo mismo que el chip real del mismo artista
- **THEN** la rejilla de esqueleto SHALL mantener las dos columnas, la separación y el margen lateral de la real

#### Scenario: Nombre largo recortado

- **WHEN** el nombre de un artista no cabe en la fila del sidebar y se pinta con puntos suspensivos
- **THEN** la barra del esqueleto SHALL terminar donde termina el nombre recortado, sin desbordar la fila

### Requirement: Margen superior común a las cuatro rutas

La rejilla de `/galeria`, `/tienda`, `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]` SHALL dejar el mismo margen superior (`py-12`), alineado con la etiqueta «Autores» del sidebar. El estado vacío de las fichas de autor SHALL usar el mismo margen.

#### Scenario: Entrar en un artista

- **WHEN** termina una navegación de `/galeria` a `/galeria/autor/<slug>`
- **THEN** la primera fila de la rejilla real SHALL aparecer a la misma altura a la que estaba la primera fila del esqueleto

#### Scenario: Alineación con el sidebar

- **WHEN** se carga cualquiera de las cuatro rutas en un ancho `lg` o superior
- **THEN** el borde superior de la primera imagen SHALL quedar a la misma altura que el de la etiqueta «Autores»

### Requirement: Brillo de carga y su degradación

Cada pieza del esqueleto SHALL tener el gris del hueco de imagen (`gray-200`) y un brillo translúcido que la recorre de izquierda a derecha en bucle, con una pausa entre pasadas. El brillo SHALL animarse únicamente con `transform`.

La clase y los `@keyframes` SHALL vivir en `client/app/globals.css`, con el mismo criterio que `.image-loader`: no en `tailwind.config.js`, y los `@keyframes` fuera de `@layer`.

Con `prefers-reduced-motion: reduce` el esqueleto SHALL quedar estático, sin brillo. La preferencia SHALL resolverse en CSS, no con `matchMedia`.

#### Scenario: Movimiento reducido

- **WHEN** el sistema del visitante pide movimiento reducido y se activa el filtro
- **THEN** el esqueleto SHALL pintarse con sus piezas grises y sin ninguna animación

#### Scenario: Coste de la animación

- **WHEN** el esqueleto está en pantalla
- **THEN** la única propiedad animada SHALL ser `transform`

### Requirement: Accesibilidad del estado de espera

Las piezas del esqueleto SHALL estar ocultas a los productos de apoyo (`aria-hidden`) y NO SHALL contener elementos enfocables ni interactivos. La zona de la rejilla SHALL marcarse con `aria-busy` mientras dura la espera, y una única región de estado educada SHALL anunciar el texto de carga, que vive en `client/lib/constants.js` con una variante para obras y otra para productos.

#### Scenario: Lector de pantalla

- **WHEN** una persona con lector de pantalla activa el filtro de autor
- **THEN** SHALL oír un único anuncio de carga, no uno por pieza
- **THEN** los nombres de artista que dan anchura a las barras del esqueleto NO SHALL leerse

#### Scenario: Teclado durante la espera

- **WHEN** el esqueleto está en pantalla
- **THEN** ninguna de sus piezas SHALL recibir el foco

### Requirement: Un único punto de navegación del filtro

La navegación del filtro de autor y su estado de espera SHALL vivir en un único hook compartido por las cuatro rutas, que recibe la ruta base (`/galeria` o `/tienda`) y el artista seleccionado. Ninguna ruta SHALL construir por su cuenta las URL del filtro.

Al activar el filtro, la página SHALL volver arriba del todo sin animación, para que el esqueleto se vea desde su primera fila y quede donde se pintará el destino.

#### Scenario: Pulsar con la página desplazada

- **WHEN** un visitante en escritorio ha bajado varias filas en la rejilla y pulsa un artista del sidebar fijo
- **THEN** la página SHALL situarse arriba del todo en el acto
- **THEN** SHALL verse la primera fila del esqueleto

#### Scenario: Comportamiento idéntico en las cuatro rutas

- **WHEN** se cambia la forma de navegar del filtro
- **THEN** el cambio SHALL surtir efecto en las cuatro rutas sin editarlas una por una
