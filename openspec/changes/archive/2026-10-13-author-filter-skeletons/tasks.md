## 1. Base: estilo, textos y hook

- [x] 1.1 Añadir `.skeleton` (fondo `gray-200`, `relative`, `overflow: hidden` y `::after` con el degradado) en `@layer components` de `client/app/globals.css`, el `@keyframes` del brillo fuera de la capa y la degradación con `prefers-reduced-motion`
- [x] 1.2 Añadir `AUTHOR_FILTER_LOADING_COPY` (obras y productos) en `client/lib/constants.js`
- [x] 1.3 Crear `client/hooks/useAuthorFilterNavigation.js`: `{ isPending, filterByAuthor, clearFilter }` con `useTransition` + `router.push`, que sube la página arriba del todo antes de navegar

## 2. Componentes con estado de espera

- [x] 2.1 `AuthorSidebar`: prop `pending`. Cada fila conserva su caja y pinta un círculo `size-5` y la barra con el nombre transparente y recortado, todo `aria-hidden` y sin botones. La etiqueta «Autores» no cambia
- [x] 2.2 `AuthorMobileFilter`: prop `pending`. Cada chip conserva su contenedor y su contenido `invisible`, con el fondo de esqueleto, `aria-hidden` y sin botones
- [x] 2.3 `ProductGrid`: prop `pending` y `variant`. Con `pending` pinta `DEFAULT_PAGE_SIZE` celdas de esqueleto dentro del mismo `<ul>`, con el cuadrado y las tres cajas de línea, y anchuras de barra de un patrón fijo por índice. Región `role="status"` siempre montada con el texto de carga sólo durante la espera

## 3. Las cuatro rutas

- [x] 3.1 `GalleryContent` y `GalleryMasContent`: sustituir los manejadores copiados por el hook, pasar `pending` a los tres componentes, `aria-busy` en `<main>` y no montar `GridLoadMore` durante la espera
- [x] 3.2 `GalleryAuthorContent` y `GalleryMasAuthorContent`: lo mismo, y `py-16` → `py-12` en la rejilla y en el estado vacío
- [x] 3.3 Comprobar que no queda ningún `router.push` del filtro fuera del hook (`grep`)

## 4. Verificación manual en el navegador

- [x] 4.1 Confirmar que `isPending` cubre toda la navegación en Next 16 con la red ralentizada: el esqueleto aparece al pulsar y desaparece cuando el destino se pinta, en los tres gestos (seleccionar, cambiar y quitar) y en `/galeria` y `/tienda`
   - Hecho con la respuesta RSC retrasada a propósito (envoltorio de `fetch` en la página). En los tres gestos, el esqueleto aparece a los 4–9 ms de la pulsación y desaparece en el mismo muestreo en que cambia la URL.
- [x] 4.2 Medir con `getBoundingClientRect` a 1440 y a 1024 px que cada fila de esqueleto del sidebar y cada celda coinciden con las reales (posición y tamaño), y que la barra del nombre recortado no desborda
   - Medido a 1920 px (equivale a 1440: `max-w-7xl` limita a celdas de 216 px), 1280 y 1024 px. Filas del sidebar, iconos y barras de nombre idénticas, y la barra de un nombre recortado mide 148 px, lo mismo que el real. Celdas idénticas a 1440 y 1280. A 1024 px coinciden el cuadrado y el arranque del texto, pero los nombres largos de la celda real saltan de línea (+20 px por línea): queda recogido en la spec y en `design.md`.
- [x] 4.3 Medir a 390 y a 768 px que cada chip de esqueleto mide lo mismo que el real (incluido el seleccionado) y que la rejilla conserva columnas, separación y margen
   - Chrome headless por CDP con viewport emulado: chips (incluido el seleccionado con su X), celdas, cuadrados y bloques de texto idénticos a 390 y a 768 px.
- [x] 4.4 Comprobar que la primera fila de la rejilla de destino aparece a la altura de la primera fila del esqueleto (listado → autor, autor → autor y autor → listado) y que queda alineada con «Autores»
   - La rejilla arranca a y = 120 en las cuatro rutas, igual que la etiqueta «Autores», y la primera fila de destino aparece donde estaba la del esqueleto en los tres sentidos.
- [x] 4.5 Con varias páginas cargadas, pulsar un artista y comprobar en la red que no se pide ninguna página más del listado abandonado
   - Desde y = 1447 con 24 obras cargadas: la página sube a 0, se pintan 12 celdas de esqueleto, no hay centinela y no se pide ninguna página de `/api/art` durante la espera, aunque se fuercen `scroll` y `resize`. Tras llegar, sólo la página 1 del autor.
- [x] 4.6 Navegación desde la caché del router (volver a un destino ya visitado): comprobar si el esqueleto destella; si lo hace, aplicar el umbral descrito en `design.md` y documentarlo
   - En producción (código anterior), la primera entrada en un autor tardó 1285 ms; repetir el par, 105 y 38 ms. Se acepta un esqueleto de unos pocos fotogramas y no se añade umbral: el razonamiento está en `design.md`.
- [x] 4.7 Emular `prefers-reduced-motion: reduce` y comprobar que el esqueleto queda estático; comprobar en el árbol de accesibilidad que las piezas están ocultas, que hay un único estado de carga y que nada es enfocable
   - Con movimiento reducido, el `::after` queda en `display: none`. Comprobado sobre el DOM, no con un lector de pantalla: todas las piezas están bajo `aria-hidden`, hay un único `role="status"` con «Cargando obras...» o «Cargando productos...», `aria-busy` en `<main>` y ningún botón ni enlace visible dentro del esqueleto.
- [x] 4.8 Revisar la consola: sin avisos de hidratación ni de claves duplicadas, y sin errores nuevos
   - Sin errores ni avisos en la consola en las cinco pasadas de Chrome headless. Las clases sobreviven al CSS compilado por Tailwind (`.skeleton`, `::after`, `@keyframes`, `*:invisible` y la regla de movimiento reducido).

## 5. Documentación

- [x] 5.1 Crear `.claude/rules/frontend/author-filter-skeleton.md` con `paths:` a los ficheros tocados y su línea en el índice de `CLAUDE.md`
- [x] 5.2 Ejecutar `node scripts/check-claude-rules.mjs` y `openspec validate author-filter-skeletons --strict`
