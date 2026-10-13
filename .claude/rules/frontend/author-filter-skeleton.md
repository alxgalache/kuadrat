---
paths:
  - "client/hooks/useAuthorFilterNavigation.js"
  - "client/components/{AuthorSidebar,AuthorMobileFilter,ProductGrid}.js"
  - "client/app/galeria/GalleryContent.js"
  - "client/app/tienda/GalleryMasContent.js"
  - "client/app/{galeria,tienda}/autor/**"
---

## Esqueleto del filtro de autor (`useAuthorFilterNavigation`)

El filtro de autor de `/galeria` y `/tienda` no filtra en el sitio: cada artista es otra ruta (`<base>/autor/<slug>`), ISR y sin precarga, porque son `<button>` y no `<Link>`. Cada pulsación espera un render de servidor completo, y mientras tanto el router de Next deja la página anterior intacta. Medido en producción el 13/10/2026: **1285 ms** sin ningún cambio en pantalla la primera vez que se entra en un autor. Ahora la lista de autores y la rejilla pasan a esqueleto en la misma pulsación. Ver `openspec/changes/archive/2026-10-13-author-filter-skeletons`.

* **La espera es `isPending` de `useTransition` alrededor de `router.push`, en `client/hooks/useAuthorFilterNavigation.js`**, que además concentra las URL del filtro (antes copiadas en las cuatro rutas). Dura exactamente lo que la navegación: el origen se desmonta en el mismo commit en que se pinta el destino, sin temporizador. **Nunca un `loading.js`**: desmonta el origen en el acto (el esqueleto ya no podría pintarse en los contenedores reales), y uno en `galeria/` envolvería también las fichas de obra.
* **El esqueleto lo pintan los mismos componentes con la prop `pending`** (`AuthorSidebar`, `AuthorMobileFilter`, `ProductGrid`), dentro de sus propios contenedores. Por eso las cajas coinciden al píxel: comprobado con `getBoundingClientRect` a 390, 768, 1024 y 1440 px. Al retocar la maqueta real, el esqueleto está en el mismo fichero. **No sacarlo a componentes aparte con las clases copiadas.**
  * La barra del nombre del sidebar lleva el **nombre real en texto transparente** y `truncate`: mide lo que mide ese nombre recortado. Los chips de móvil conservan su contenido con `*:invisible`, lo que además saca sus botones del foco y de los clics.
  * La celda coincide cuando autor, título y precio caben en una línea. A 1024 px (celdas de 148 px) los nombres largos saltan de línea y la celda real crece. Es inevitable, porque los textos del destino aún no han llegado.
  * Las anchuras de las barras de la rejilla salen de un patrón fijo por índice, **nunca al azar en el render**: cada re-render durante la espera las haría temblar.
* **Las cuatro rutas tienen el mismo `py-12` sobre la rejilla.** Las fichas de autor tenían `py-16`, y el esqueleto, que se pinta en el origen, quedaba 16 px desplazado respecto al destino. Cambiar el margen de una sola ruta reintroduce el salto.
* **`GridLoadMore` no se monta durante la espera.** Al pasar de 48 obras a 12 celdas la página encoge, y su centinela pediría la página siguiente del listado que se abandona. Ocultarlo por CSS no basta: hay que desmontarlo.
* **`.skeleton` y su `@keyframes` viven en `globals.css`**, con el criterio de `.image-loader`. El brillo es un `::after` por pieza animado sólo con `transform`; el gris es el `gray-200` del hueco de imagen. Con `prefers-reduced-motion` el `::after` no se pinta.
* **Esqueleto breve en navegaciones repetidas, aceptado.** Repetir el mismo par listado ↔ autor en producción tardó 105 y 38 ms, así que el esqueleto se ve unos pocos fotogramas. Un umbral de aparición no lo arregla, sólo lo traslada a las navegaciones que rozan el umbral, y una duración mínima alargaría a propósito cada navegación corta.
* **Accesibilidad:** piezas `aria-hidden`, `<main aria-busy>` y una única región `role="status"` en `ProductGrid`, siempre montada y vacía fuera de la espera, con `AUTHOR_FILTER_LOADING_COPY`.
* **Punto ciego:** sin runner de tests en `client/`. Verificado con Chrome (escritorio) y Chrome headless por CDP (390, 768, 1024 y 1280 px, movimiento reducido), con la respuesta RSC retrasada a propósito para observar la espera. Sin cubrir: Safari/iOS y un lector de pantalla real.
