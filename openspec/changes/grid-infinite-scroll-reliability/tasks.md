## 1. Backend — orden determinista de la paginación pública

- [x] 1.1 En `api/controllers/artController.js:52`, cambiar `ORDER BY a.created_at DESC LIMIT ? OFFSET ?` por `ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`. No tocar nada más de la consulta: los filtros, el `limit + 1` y la forma de la respuesta se mantienen.
- [x] 1.2 Aplicar el mismo desempate en `api/controllers/othersController.js:51` (`o.created_at DESC, o.id DESC`).
- [x] 1.3 Crear `api/tests/catalogPaginationOrdering.test.js`: sembrar más obras de las que caben en una página con varias compartiendo `created_at`, recorrer todas las páginas de `GET /api/art` y comprobar que el conjunto de ids devuelto no tiene repeticiones y cubre exactamente el catálogo visible. Repetir para `GET /api/others`. Usar `tests/helpers/app.js`, nunca `../app` directamente.
- [x] 1.4 Ejecutar `npm test` desde `api/` y comprobar que la suite completa sigue en verde, incluido `tests/testEnvironmentIsolation.test.js`.

## 2. Parche de contención — DESCARTADO por decisión del operador (24/08/2026)

> Este grupo contenía el parche mínimo desplegable por separado (subir el umbral del listener
> de scroll a `bottomPosition - 600`), pensado para cortar la incidencia en producción antes de
> que el cambio completo estuviese listo. **No se aplica**: el operador implementa el cambio de
> una sola vez, y el grupo 4 lo sustituye por completo — sustituye el listener entero, así que
> el parche habría sido código escrito para borrarlo acto seguido.
>
> El grupo se conserva vacío en lugar de renumerar el resto, para que las referencias cruzadas
> de `design.md` sigan apuntando a donde apuntan.

## 3. Constantes y textos

- [x] 3.1 Añadir en `client/lib/constants.js`, junto a `DEFAULT_PAGE_SIZE`: el margen de anticipación del observador (600 px), el umbral del vigía de respaldo (600 px) y el nombre del evento de analítica del control manual.
- [x] 3.2 Añadir en `client/lib/constants.js` los textos es-ES del pie de rejilla (`Cargar más obras` / `Cargar más productos`, `Cargando...`, aviso de error y `Reintentar`), con las dos variantes de vocabulario que usan galería y tienda.

## 4. Hook de carga incremental *(infraestructura compartida por las cuatro rutas — riesgo alto)*

- [x] 4.1 Crear `client/hooks/useInfiniteScroll.js`, que recibe `{ hasMore, isLoading, onLoadMore }` y devuelve `{ sentinelRef, requestLoadMore }`.
- [x] 4.2 Implementar el cerrojo en un `useRef` actualizado de forma síncrona, y `requestLoadMore()` como único punto de entrada: sale sin hacer nada si el cerrojo está echado, si no quedan productos o si la carga automática está desarmada (salvo cuando la llamada procede de una acción explícita del visitante).
- [x] 4.3 Implementar el `IntersectionObserver` con `root: null`, `threshold: 0` y el `rootMargin` de la constante, creado dentro de un efecto cuyas dependencias incluyan `hasMore`, `isLoading` y el número de página, de modo que cada carga completada produzca un `observe()` nuevo y con él el re-armado. Desconectar el observador en la limpieza del efecto.
- [x] 4.4 Implementar el vigía de respaldo sobre `scroll` y `resize`, agrupado con `requestAnimationFrame`, comparando contra el umbral de la constante (nunca contra el fondo exacto). `resize` es obligatorio: es el evento que emiten los navegadores móviles al ocultar o mostrar su barra.
- [x] 4.5 Implementar el desarme: una llamada a `onLoadMore` que rechaza, o que se resuelve sin aportar ningún producto nuevo, desarma los disparadores automáticos. Los rearma únicamente `requestLoadMore({ manual: true })` o un desplazamiento que vuelva a cruzar el umbral tras haber salido de él.
- [x] 4.6 Guardar el caso de que `IntersectionObserver` no exista: el vigía de respaldo debe quedar operativo por sí solo, sin lanzar.

## 5. Hook del listado

- [x] 5.1 En `client/hooks/useGalleryProducts.js`, eliminar el `useEffect` del listener de scroll (líneas 70-85) y consumir en su lugar `useInfiniteScroll`.
- [x] 5.2 Separar el estado de error: mantener `error` para la carga inicial y añadir `loadMoreError` para las cargas posteriores a la primera. El `catch` actual escribe en el mismo estado; repartirlo según la rama.
- [x] 5.3 Cambiar la concatenación a una que descarte por `id` los productos ya presentes, y devolver desde `onLoadMore` cuántos productos nuevos se han añadido, que es lo que el hook del grupo 4 necesita para detectar una página sin aportación.
- [x] 5.4 Exponer las props del pie de rejilla (`sentinelRef`, `hasMore`, `isLoadingMore`, `loadMoreError`, `onLoadMore`) como un único objeto, para que las cuatro páginas lo pasen sin desestructurar de cinco maneras distintas.
- [x] 5.5 Comprobar que la ruta de restauración no cambia: con instantánea se sigue pidiendo `getAll(1, min(pages, GRID_RESTORE_MAX_PAGES) * DEFAULT_PAGE_SIZE, authorSlug)` en una sola petición, `page` queda en el número restaurado y `setLoadedPages(page)` se sigue invocando.

## 6. Pie de rejilla

- [x] 6.1 Crear `client/components/GridLoadMore.js` con el centinela (`<div ref={sentinelRef} aria-hidden="true" />`), el indicador de carga, el control manual y el aviso de error con reintento. Mostrar el control manual siempre que `hasMore` y no haya carga en curso.
- [x] 6.2 Hacer el control manual un `<button type="button">` real, alcanzable con teclado y con texto visible, no un elemento decorativo con manejador de clic.
- [x] 6.3 Aceptar la variante de vocabulario (`obras` / `productos`) como prop, tomando los textos de `client/lib/constants.js`.
- [x] 6.4 Emitir el evento de analítica en el manejador del control manual con `window.plausible?.(...)`, incluyendo la rejilla de origen como propiedad. Nunca datos del visitante.

## 7. Páginas

- [x] 7.1 `client/app/galeria/page.js` — sustituir el bloque en línea de `isLoadingMore` (líneas 105-113) por `<GridLoadMore>` tras `<ProductGrid>`, y dejar de tratar el error de carga incremental como error de página completa.
- [x] 7.2 `client/app/tienda/page.js` — mismo cambio.
- [x] 7.3 `client/app/galeria/autor/[authorSlug]/GalleryAuthorContent.js` — montar `<GridLoadMore>`; esta ruta no mostraba ningún indicador de carga.
- [x] 7.4 `client/app/tienda/autor/[authorSlug]/GalleryMasAuthorContent.js` — mismo cambio.
- [x] 7.5 Comprobar en las cuatro que `useGridScrollRestoration` se sigue invocando **antes** de `useGalleryProducts`, requisito de la restauración de scroll.

## 8. Analítica

- [ ] 8.1 Dar de alta el evento del control manual como objetivo en el panel de Plausible de `analytics.140d.art`. Sin este paso el evento se envía y se descarta en silencio, sin error en ninguna parte.

## 9. Verificación manual (`client/` no tiene runner de tests)

- [ ] 9.1 `/galeria` en escritorio: bajar hasta el final → cargan las 26 obras en dos tandas, sin duplicados y sin avisos en consola sobre claves repetidas.
- [ ] 9.2 `/galeria` en un móvil Samsung con el navegador por defecto: bajar hasta el final **sin subir en ningún momento**, con la barra inferior a la vista → cargan las obras siguientes. Es el caso que hoy falla.
- [ ] 9.3 Mismo recorrido abriendo el enlace desde el navegador integrado de Instagram.
- [ ] 9.4 Con la red desconectada a mitad de recorrido: las obras ya cargadas siguen en pantalla, aparece el aviso en línea y **no** hay ráfaga de peticiones repetidas en la pestaña de red. Al reconectar, «Reintentar» completa la carga.
- [ ] 9.5 Recorrer la rejilla completa usando sólo el teclado, sin ratón ni gestos: el control manual es alcanzable y permite llegar a la última obra.
- [ ] 9.6 Restauración de scroll: cargar varias páginas, abrir una obra, volver atrás → se rehidratan todas las páginas en **una sola** petición y la obra queda centrada, exactamente como antes de este cambio.
- [ ] 9.7 `/galeria/autor/[authorSlug]`: comprobar que ahora aparece indicador de carga durante una carga incremental.
- [ ] 9.8 Ficha de artista con menos de 12 obras: no se muestra el control manual y no se dispara ninguna petición adicional.
- [ ] 9.9 En producción, tras 48 horas: revisar en Plausible cuántas veces se ha usado el control manual y con qué navegadores. Cifras próximas a cero confirman que la carga automática funciona; una concentración en un motor concreto señala dónde seguir mirando.
