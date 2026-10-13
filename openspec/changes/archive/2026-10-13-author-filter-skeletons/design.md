## Context

El filtro de autor de los listados navega. `AuthorSidebar` (escritorio) y `AuthorMobileFilter` (móvil) pintan `<button>`, y su `onClick` llama a `router.push('/galeria/autor/<slug>')`, `router.push('/galeria')` o a los equivalentes de `/tienda`. El manejador está copiado cuatro veces, en `GalleryContent`, `GalleryMasContent`, `GalleryAuthorContent` y `GalleryMasAuthorContent`.

Las fichas de autor son ISR con `generateStaticParams` vacío, así que la primera visita a cada una tras una revalidación pide al servidor un render completo: `fetchAuthor`, `fetchAuthorArtProducts` y `fetchAuthors`, más el render de Next, que es el recurso que satura antes (25 req/s medidos). Como son botones y no `<Link>`, no hay precarga. Durante toda esa espera el router de Next deja la página anterior intacta, y el visitante no recibe ninguna señal.

El fundido que hace `useGalleryProducts` al cambiar de autor (`isFading` durante 300 ms) ya no se ve nunca: `authorSlug` no cambia dentro de un componente montado, porque cada filtro es otra ruta y otro montaje.

Restricciones que vienen de reglas vigentes:
- `client/` no tiene runner de tests (verificación manual).
- Las animaciones viven en `globals.css` y no en `tailwind.config.js`, con los `@keyframes` fuera de `@layer` y `prefers-reduced-motion` resuelto en CSS (`frontend/image-loading.md`).
- Ninguna lectura de `useSearchParams()` en estos árboles, porque los sacaría del HTML prerrenderizado (`frontend/lcp-listados.md`).
- Nada que se decida en el render puede diferir entre servidor y cliente (hidratación).

## Goals / Non-Goals

**Goals:**
- Que la pulsación tenga respuesta visible en el mismo fotograma, en las cuatro rutas, en los dos anchos y en los tres gestos (seleccionar, cambiar y quitar).
- Que el esqueleto ocupe exactamente las cajas de lo que sustituye, por construcción y no por copiar medidas.
- Que la espera dure lo que dura la navegación, ni más ni menos.

**Non-Goals:**
- Hacer más rápida la navegación. Convertir los botones en `<Link>` con precarga lo haría, pero precargar hasta veinte fichas de autor por visita multiplicaría los renders de servidor, que es justo el techo medido. Es otro cambio y otra decisión.
- Esqueletos para la carga inicial de la página: `/galeria` y `/tienda` ya llegan con la rejilla sembrada en el HTML.
- Sustituir el «Cargando...» a página completa de `loading && page === 1`, que sólo aparece cuando la siembra del servidor falló o un autor no tiene obras sembradas.
- Contar cuántas obras tiene el destino: la API de autores no lo devuelve, y añadirlo sería un cambio de servidor para afinar una espera.

## Decisions

### 1. El estado de espera sale de `useTransition`, no de `loading.js`

`startTransition(() => router.push(href))` hace que `isPending` valga verdadero desde la pulsación hasta que el árbol de destino se confirma. Es el mecanismo del propio router: no hay temporizador que ajustar, no hay duración mínima y no hay forma de que la espera se desincronice de la llegada.

Alternativa descartada: un `loading.js`.
- En `galeria/autor/[authorSlug]/` sólo cubriría la entrada en un autor, no la vuelta a `/galeria`.
- Para cubrir la vuelta haría falta otro en `galeria/`, que envolvería también `/galeria/p/[id]` y `/galeria/artistas`: abrir una obra mostraría un esqueleto de rejilla. Evitarlo exige mover las páginas a grupos de rutas.
- Además, `loading.js` desmonta la página de origen en el acto, así que el esqueleto no se podría pintar dentro de los contenedores reales, que es la base de la decisión 3. También se perdería el desplazamiento horizontal de la fila de chips en móvil.

### 2. Un hook: `useAuthorFilterNavigation(baseRoute, selectedSlug)`

Devuelve `{ isPending, filterByAuthor, clearFilter }`. Concentra las dos reglas de URL que hoy están copiadas cuatro veces: pulsar el artista seleccionado quita el filtro, y la ruta de autor es `${baseRoute}/autor/${slug}`. Antes de iniciar la transición sube la página arriba del todo con `behavior: 'instant'`. Es lo mismo que ya hace `useGalleryProducts` al cambiar de autor, y el destino se pinta arriba de todos modos. Sin eso, quien pulsa el sidebar fijo con la rejilla desplazada vería la página encogerse bajo sus pies y el navegador recolocaría el scroll en mitad del esqueleto.

### 3. El esqueleto lo pintan los mismos componentes, con una prop `pending`

`AuthorSidebar`, `AuthorMobileFilter` y `ProductGrid` reciben `pending` y, cuando vale verdadero, sustituyen sólo el contenido de cada fila, chip o celda. El `<aside>`, el `sticky`, el `<ul>` con sus columnas y separaciones y el `<li>` con sus clases siguen siendo los mismos nodos con las mismas clases. Así las medidas coinciden por construcción, y quien edite la maqueta real tiene el esqueleto en el mismo fichero, a la vista.

Alternativa descartada: componentes `*Skeleton` aparte con las clases copiadas. Funciona el día que se escribe y se desvía en el primer retoque de la maqueta.

Medidas pieza a pieza:
- **Fila del sidebar** (caja de 36 px con `p-2`, `gap-x-3` y `items-center`): un círculo `size-5 rounded-full` donde va el `InformationCircleIcon` (`size-5`). La barra del nombre es un `<span>` con el **nombre real en texto transparente**, `truncate` y una altura menor que la línea, centrada, así que mide exactamente lo que mide ese nombre recortado. El hueco `w-6` de la X se conserva.
- **Chip móvil:** el chip conserva su contenedor, sus clases y su contenido, pero el contenido pasa a `invisible` y el fondo es el del esqueleto. Así mide lo mismo, incluida la X del seleccionado, sin calcular nada.
- **Celda:** mismo `<li>` y mismo `div.group relative`. El cuadrado es `aspect-square w-full rounded-md`. El bloque de texto conserva `mt-6` y tres cajas de línea con la altura de cada línea real: `h-5` para el autor (`text-sm`), `mt-1 h-6` para el título y `mt-1 h-6` para el precio (`text-base`). En cada caja hay una barra centrada más baja que la línea. Las anchuras de esas barras no pueden ser las del destino, que aún no ha llegado. Se eligen de un patrón fijo según el índice, nunca al azar en el render.
- **Número de celdas:** `DEFAULT_PAGE_SIZE` (12), el máximo de la primera página de cualquier destino. Llena el área visible tanto en escritorio (tres filas de cuatro) como en móvil.

### 4. Brillo con `transform` sobre un pseudoelemento por pieza

`.skeleton` da a cada pieza `background-color: #e5e7eb` (el `gray-200` del hueco de imagen, para que al llegar el destino con las imágenes aún en camino no cambie el tono), `position: relative` y `overflow: hidden`. Su `::after` es un degradado blanco translúcido que se desplaza con `translateX(-100%) → translateX(100%)`. Barre la pieza durante parte del ciclo y descansa el resto, un brillo sutil que pasa en lugar de un parpadeo continuo.

- **Por pieza y no un único brillo para toda la rejilla:** cada pieza recorta su propio brillo (`overflow: hidden` respeta el `rounded-full` del círculo y el `rounded-md` del cuadrado), y funciona igual en la fila de chips aunque esté desplazada en horizontal. Un brillo único posicionado sobre un contenedor desplazado quedaría fuera de la vista.
- **`transform` y no `background-position`:** se anima en el compositor sin repintar las piezas en cada fotograma. Cuesta una capa por pieza, unas sesenta pequeñas en escritorio, que es asumible.
- `animate-pulse` de Tailwind se descarta: es un parpadeo de opacidad de toda la pieza, el efecto que el cambio `image-loading-animation` ya rechazó por pesado.
- `prefers-reduced-motion: reduce`: el `::after` no se pinta y las piezas quedan grises y quietas.

### 5. El pie de rejilla no se pinta durante la espera

`GridLoadMore` se monta sólo con `!isPending`. Al sustituir una rejilla de, por ejemplo, 48 obras por 12 celdas de esqueleto, la página encoge y el centinela entra en pantalla: el `IntersectionObserver` y el vigía de `scroll`/`resize` pedirían la página siguiente del listado que se abandona. Desmontar el pie desmonta el centinela. Los dos efectos de `useInfiniteScroll` ya toleran que `sentinelRef.current` sea `null`: el primero sale sin observar y el vigía cae a comparar contra el alto del documento. Por eso tampoco basta con ocultar el pie por CSS.

### 6. Accesibilidad

- Cada pieza lleva `aria-hidden`. El nombre transparente del sidebar sólo aporta anchura, y leerlo duplicaría la lista.
- `<main aria-busy>` mientras dura la espera.
- Una región `role="status"` (educada) dentro de `ProductGrid`, siempre montada y vacía fuera de la espera, porque una región viva que nace con el texto ya puesto no la anuncian todos los lectores. Sus textos viven en `AUTHOR_FILTER_LOADING_COPY` (`client/lib/constants.js`), con una variante para obras y otra para productos, como `GRID_LOAD_MORE_COPY`.
- El esqueleto no contiene botones ni enlaces, así que no hay foco que perder dentro de él.

### 7. Margen superior común (decisión del usuario)

Las fichas de autor pasan de `py-16` a `py-12` en la rejilla y en el estado vacío. Es el margen de `/galeria` y `/tienda` y el del `sticky py-12` del sidebar, así que la primera imagen queda alineada con la etiqueta «Autores». Viene así desde el primer commit de esas rutas, sin justificación escrita. Sin este ajuste, el esqueleto, que se pinta en la página de origen, quedaría 16 px desplazado respecto al destino en cada cambio entre listado y ficha.

## Risks / Trade-offs

- **[Esqueleto muy breve en navegaciones repetidas]** Medido en producción (13/10/2026, `/galeria` con el código anterior): la primera entrada en un autor tardó **1285 ms**, la vuelta a `/galeria` 368 ms, y repetir el mismo par justo después 105 ms y **38 ms**. Con 38 ms el esqueleto se ve dos o tres fotogramas entre dos rejillas distintas. → Se acepta y no se añade umbral. Un umbral (mostrar sólo pasados ~100 ms) no elimina el destello, lo traslada a las navegaciones que rozan el umbral: una de 105 ms lo enseñaría 5 ms. Evitarlo de verdad exige además una duración mínima, que alarga a propósito cada navegación corta y contradice el requisito. El usuario pidió respuesta «en el momento» de la pulsación, y el caso lento, el de la queja, es el primero.
- **[Textos que saltan de línea]** A 1024 px las celdas miden 148 px y los nombres largos («Daniel Córdoba García», «Baños de la Encina, España») ocupan dos líneas. La celda real crece 20 px por línea extra y la de esqueleto no. → Inevitable: depende de textos del destino que aún no han llegado. El cuadrado y el arranque del bloque de texto sí coinciden, y la spec lo dice así.
- **[El esqueleto no es interactivo]** Mientras dura la espera no se puede pulsar otro artista ni abrir una biografía. Con el router de Next, una segunda transición sustituiría a la primera sin problema, pero el usuario pidió sustituir la lista por el esqueleto. La vuelta atrás del navegador sigue funcionando.
- **[Número de celdas]** Un artista con dos obras pasa de 12 celdas de esqueleto a 2 al llegar. Es inevitable sin saber cuántas tiene, y es el mismo encogimiento que hay hoy al filtrar.
- **[Capas de composición]** Una por pieza animada (≈ 12 × 4 + 2 por fila de autor). Son pequeñas y sólo existen durante la espera. Si en un móvil de gama media se nota, se puede pasar a un único `::after` por celda, porque el brillo es blanco sobre fondo blanco y fuera de las piezas no se ve.
- **[Navegación fallida]** Si la petición RSC falla, Next cae a una navegación completa del documento y el esqueleto se queda hasta que la página nueva carga. Es el comportamiento correcto.

## Migration Plan

Sólo cliente. Se despliega con `./deploy/deploy.sh` como cualquier cambio del cliente, incluida la purga de la caché de páginas de nginx. La vuelta atrás es revertir el commit, sin datos ni configuración de por medio.
