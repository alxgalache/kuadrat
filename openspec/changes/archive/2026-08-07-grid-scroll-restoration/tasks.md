## 1. Constantes

- [x] 1.1 Añadir en `client/lib/constants.js` las constantes de la restauración: prefijo de clave en `sessionStorage`, clave de la marca en `history.state`, máximo de páginas a restaurar (10) y TTL de la instantánea (30 minutos en ms). Reutilizar `DEFAULT_PAGE_SIZE` como tamaño de página.

## 2. Hook de restauración

- [x] 2.1 Crear `client/hooks/useGridScrollRestoration.js` con las utilidades internas de `sessionStorage` (leer, escribir, borrar), todas envueltas en `try/catch` y con guarda `typeof window !== 'undefined'`, de modo que un almacenamiento no disponible desactive la funcionalidad sin lanzar errores.
- [x] 2.2 Implementar el marcado de la entrada del historial: si `window.history.state` no trae la marca, generar un id y escribirlo con `replaceState` **fusionando** el estado existente (nunca reemplazándolo, para no perder las claves internas del App Router).
- [x] 2.3 Implementar la lectura de la instantánea durante el render, memorizada en un `useRef`, y su borrado en un efecto de montaje (no durante el render, para que el doble render de StrictMode no la consuma). Descartar instantáneas caducadas por TTL o con forma inválida.
- [x] 2.4 Implementar `onProductOpen(productId)`: guarda `{ pages, productId, scrollY, savedAt }` bajo el id de la entrada actual, ignorando clics con botón secundario/central o con `metaKey`/`ctrlKey`/`shiftKey`/`altKey`.
- [x] 2.5 Implementar la purga en cada escritura: eliminar instantáneas caducadas y conservar como mucho las 10 más recientes.
- [x] 2.6 Implementar `applyRestore()`: buscar `[data-product-id="<id>"]`, calcular `rect.top + window.scrollY - (innerHeight - rect.height) / 2` acotado a los límites del documento y aplicar `window.scrollTo` instantáneo; si el elemento no existe, aplicar el `scrollY` guardado. Repetir el cálculo una vez en `requestAnimationFrame` como corrección de reflow tardío.

## 3. Hook del listado

- [x] 3.1 Añadir a `useGalleryProducts` un parámetro opcional con la instantánea de restauración, sin alterar el comportamiento cuando llega vacía.
- [x] 3.2 En la carga de montaje con instantánea: pedir `getAll(1, min(pages, 10) * DEFAULT_PAGE_SIZE, authorSlug)` en una sola llamada y fijar `page` al número de páginas restauradas, para que el scroll infinito continúe en `page + 1` sin solapes ni huecos.
- [x] 3.3 Mantener el gating de carga durante la restauración (pantalla "Cargando..." mientras llega la respuesta) y exponer una señal que permita a la página aplicar el desplazamiento en `useLayoutEffect` con el grid aún a opacidad 0, fundiéndolo solo después.
- [x] 3.4 Verificar que el cambio de `authorSlug` sigue ignorando cualquier instantánea: primera página y `window.scrollTo(0)`, comportamiento actual intacto.
- [x] 3.5 Verificar que un fallo de la petición de restauración cae en el `catch` existente: mensaje de error habitual y ningún estado de carga colgado.

## 4. Grid

- [x] 4.1 Añadir `data-product-id={product.id}` al `<li>` de `ProductGridItem` en `client/components/ProductGrid.js`.
- [x] 4.2 Añadir la prop `onProductOpen` a `ProductGrid` / `ProductGridItem` e invocarla desde el `onClick` de los dos enlaces del producto (imagen y título), sin afectar a los botones de variación, que ya hacen `stopPropagation`.

## 5. Páginas

- [x] 5.1 Conectar hook y grid en `client/app/galeria/page.js`.
- [x] 5.2 Conectar hook y grid en `client/app/tienda/page.js`.
- [x] 5.3 Conectar hook y grid en `client/app/galeria/autor/[authorSlug]/GalleryAuthorContent.js`.
- [x] 5.4 Conectar hook y grid en `client/app/tienda/autor/[authorSlug]/GalleryMasAuthorContent.js`.
- [x] 5.5 Comprobar que en las cuatro páginas `useGridScrollRestoration` se invoca antes de `useGalleryProducts`, para que la instantánea esté disponible en el efecto de montaje del listado.

## 6. Verificación manual (`client/` no tiene runner de tests)

- [x] 6.1 `/galeria`: cargar 4 páginas, abrir una obra, volver atrás → se muestran 48 obras y la obra pulsada queda aproximadamente centrada, sin destello previo en la parte superior.
- [x] 6.2 Comprobar en la pestaña de red que la restauración hace **una sola** petición al listado.
- [x] 6.3 Tras restaurar, seguir bajando → carga la página siguiente sin repetir obras ni saltarse ninguna.
- [x] 6.4 Entrar en `/galeria` desde el menú después de haber abierto una obra → primera página y parte superior, sin restauración.
- [x] 6.5 Cambiar el filtro de autor tras una restauración → primera página del autor y parte superior.
- [x] 6.6 Atrás → adelante → atrás → la segunda vuelta ya no restaura (instantánea consumida).
- [x] 6.7 Recargar con F5 tras restaurar → primera página y parte superior.
- [x] 6.8 Abrir una obra en pestaña nueva (clic central y `Ctrl`/`Cmd`+clic) y volver atrás en la pestaña original → sin restauración espuria.
- [x] 6.9 Simular que la obra pulsada ya no está en el listado (despublicarla o alterar la respuesta) → se aplica el desplazamiento guardado, sin errores en consola.
- [x] 6.10 Bloquear `sessionStorage` en el navegador → los grids funcionan con normalidad, sin restauración y sin errores en consola.
- [x] 6.11 Repetir 6.1 y 6.3 en `/tienda` y en las dos rutas `/autor/[authorSlug]`. **Parcial:** verificado en `/galeria/autor/[authorSlug]` (obra centrada, instantánea consumida). `/tienda` y su ruta por autor NO verificables en preproducción: el catálogo `others` está vacío (0 productos). Mismo hook, mismo grid y mismo cableado que la galería.
- [x] 6.12 Repetir 6.1 en móvil (viewport estrecho, grid de 2 columnas) y comprobar que el centrado sigue siendo correcto. **No verificado en QA (marcado como done por decisión del autor, 2026-08-07):** el navegador de este entorno ignora el redimensionado de ventana (se queda en 1920×975). El cálculo del centrado solo usa `window.innerHeight` y la altura real de la tarjeta, así que no depende del número de columnas, pero queda por confirmar en un dispositivo real.
- [x] 6.13 Comprobar que la navegación atrás/adelante multi-paso del resto de la aplicación sigue intacta tras introducir el `replaceState` fusionado.
- [x] 6.14 Superar el tope: cargar más de 10 páginas, abrir una obra de la parte final y volver atrás → se restauran 120 obras y se aplica el desplazamiento guardado sin errores.

## 7. Notas de la verificación (2026-08-07, preproducción)

- El catálogo de preproducción tiene **26 obras** (3 páginas), no las 4+ que suponía 6.1: los ciclos se hicieron con 2 y 3 páginas. Resultado en ambos: obra pulsada centrada en 487 px con un viewport de 975 px (centro exacto 487,5).
- 6.14 se verificó inyectando una instantánea con `pages: 14`: la restauración pidió `limit=120`, confirmando el tope de 10 páginas.
- 6.9 se verificó inyectando `productId: 999999`: se aplicó el `scrollY` guardado (373 px exactos) sin errores.
- 6.10 se verificó forzando temporalmente el fallo de `getStorage()` en el hook; el parche se revirtió después.
- En 6.6 y 6.7 el scroll no queda exactamente en 0 sino donde lo deja la restauración nativa del navegador sobre un documento más corto (240 px y 373 px). Es el comportamiento previo al cambio: sin instantánea el hook no toca el scroll.
