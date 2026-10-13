## Why

En `/galeria` y `/tienda`, y en sus fichas de autor, pulsar un artista del filtro (sidebar en escritorio, fila de chips en móvil) **no cambia nada en pantalla hasta que llega la página de destino**. El filtro navega a otra ruta (`/galeria/autor/<slug>`) con `router.push` desde un `<button>`, sin precarga, así que cada pulsación espera un render de servidor completo: tres peticiones a la API y el render de Next, que es justo el recurso que satura antes en producción (25 req/s medidos en fichas). Mientras tanto la página anterior sigue intacta y sin ningún indicador, y el visitante no sabe si el clic se ha registrado. Antes había al menos un fundido de la rejilla, pero vivía en el filtrado en el sitio y dejó de verse cuando el filtro pasó a navegar a su propia URL.

## What Changes

- **Al pulsar un artista, la lista de autores y la rejilla pasan al instante a un estado de esqueleto** (*skeleton*) con un brillo sutil que recorre cada pieza de izquierda a derecha, y se mantienen así hasta que la página de destino se pinta. Vale igual para seleccionar un artista, cambiar a otro y quitar el filtro (volver a `/galeria` o `/tienda`).
- **Cada pieza del esqueleto mide exactamente lo mismo que el elemento real al que sustituye**, en todos los anchos: se pinta con los mismos contenedores y clases que la lista, los chips y las celdas, en lugar de con una maqueta paralela que pueda desviarse.
  - Escritorio: cada fila del sidebar conserva su caja; el icono pasa a un círculo y el nombre a una barra con la anchura exacta de ese nombre.
  - Móvil: cada chip conserva su anchura y su altura y pasa a ser una sola pieza.
  - Rejilla: celdas con el cuadrado de la imagen y las tres líneas de texto (autor, título y precio) a su altura real, con la misma rejilla de 2 y 4 columnas y los mismos márgenes.
- **El estado de espera sale de la propia navegación** (`useTransition` alrededor de `router.push`), no de un temporizador ni de un `loading.js`: dura exactamente lo que tarda el destino y desaparece cuando se monta.
- **Un único hook** reúne la navegación del filtro, que hoy está copiada en las cuatro rutas (`handleFilterByAuthor` / `handleClearFilter`).
- **Las fichas de autor pasan de `py-16` a `py-12`** (decisión del usuario), el mismo margen superior que `/galeria` y `/tienda`. Hoy la rejilla de la ficha de autor queda 16 px por debajo de la etiqueta «Autores» del sidebar. Con el mismo margen, los esqueletos coinciden al píxel con la página de destino en cualquier sentido de la navegación.
- **Durante la espera no se pinta el pie de la rejilla** (centinela, «Cargar más…»): la rejilla que describía ya no está en pantalla, y su centinela, al encogerse la página, pediría la página siguiente de un listado que se está abandonando.
- **`prefers-reduced-motion`**: esqueleto estático, sin brillo.

Sin cambios en la API, en la base de datos, en variables de entorno ni en la CSP.

## Capabilities

### New Capabilities
- `author-filter-skeleton`: qué ocurre en pantalla entre la pulsación de un artista del filtro y la llegada de la página de destino. Cubre qué se sustituye por esqueleto y cuándo, qué medidas tiene que respetar cada pieza, la animación y su degradación, la accesibilidad del estado de espera y el margen superior común a las cuatro rutas.

### Modified Capabilities
- `grid-infinite-scroll`: el requisito «Garantía manual de acceso al resto del catálogo» obliga a mostrar el control manual siempre que queden productos y no haya una carga en curso. Se añade una excepción: mientras la rejilla está sustituida por el esqueleto de un cambio de filtro, el pie no se pinta.

## Impact

**Código modificado**
- `client/components/AuthorSidebar.js`, `client/components/AuthorMobileFilter.js` y `client/components/ProductGrid.js`: aceptan un estado de espera y se pintan como esqueleto dentro de sus propios contenedores.
- `client/app/galeria/GalleryContent.js`, `client/app/tienda/GalleryMasContent.js`, `client/app/galeria/autor/[authorSlug]/GalleryAuthorContent.js` y `client/app/tienda/autor/[authorSlug]/GalleryMasAuthorContent.js`: usan el hook nuevo, pasan el estado de espera y ocultan el pie de rejilla mientras dura. Las dos fichas de autor pasan a `py-12`.
- `client/app/globals.css`: la clase del esqueleto y su `@keyframes`, con el mismo criterio que `.image-loader` (fuera de `tailwind.config.js`).
- `client/lib/constants.js`: el texto para lectores de pantalla durante la espera.

**Código nuevo**
- `client/hooks/useAuthorFilterNavigation.js`: la navegación del filtro y su estado de espera.

**Documentación**
- Una regla nueva en `.claude/rules/frontend/` y su línea en el índice de `CLAUDE.md`.

**Riesgos conocidos**
- `client/` no tiene runner de tests, así que la verificación es manual y queda enumerada en `tasks.md`. Hay que medir el esqueleto contra el elemento real en el navegador a varios anchos, no darlo por bueno por leer las clases.
- Una navegación servida desde la caché del router de Next puede completarse casi en el acto. Hay que comprobar que el esqueleto no deja un parpadeo visible en ese caso.
