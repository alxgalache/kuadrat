## Why

En navegadores móviles el scroll infinito de `/galeria` y `/tienda` deja de cargar obras. El visitante llega al final de la rejilla y no pasa nada: las obras restantes son inalcanzables. Ocurre más en el navegador por defecto de Samsung y en el navegador integrado de Instagram, y no se ha conseguido reproducir en escritorio.

El impacto es directo y medible: la galería tiene **26 obras en producción** y la primera página son 12. Un visitante afectado ve **el 46 % del catálogo** y no tiene ninguna forma de llegar al resto — no hay botón, no hay paginación, no hay enlace. El scroll es el único camino.

La causa está en `client/hooks/useGalleryProducts.js:70-85`, que dispara la carga comparando la posición de scroll con el fondo exacto del documento y con **tolerancia cero**:

```js
const scrollPosition = window.innerHeight + window.scrollY
const bottomPosition = document.documentElement.scrollHeight
if (scrollPosition >= bottomPosition) { … }
```

En móvil `window.innerHeight` es el **viewport visual** (encoge cuando la barra del navegador está a la vista) mientras que el recorrido de scroll se calcula contra el **viewport de maquetación** (que no cambia nunca, para no reflowear en cada scroll). Con la barra visible, la suma se queda corta por la altura de esa barra y la condición **no puede cumplirse**, esté el usuario donde esté. Y como en ese punto ya no hay más recorrido, tampoco se emiten más eventos de scroll: no hay segundo intento. El detalle completo, con la evidencia que descarta las hipótesis alternativas, está en `design.md`.

## What Changes

- El disparo de la carga deja de depender de medir el viewport. Pasa a un `IntersectionObserver` sobre un centinela colocado al final de la rejilla, cuyo marco de referencia es el viewport de maquetación y por tanto es inmune a la barra del navegador, al zoom y al redondeo subpíxel.
- El observador se **re-arma** explícitamente tras cada carga: un `IntersectionObserver` no vuelve a notificar si el centinela sigue interseccionando después de añadir elementos.
- Tres disparadores independientes convergen en un único punto de entrada con cerrojo: el observador, un vigía de `scroll`/`resize` con umbral generoso (agrupado por `requestAnimationFrame`), y un **botón «Cargar más» siempre visible mientras queden obras**. El botón es la garantía dura: si algún WebView rompiera los otros dos, la funcionalidad degrada a «pulsar para cargar», nunca a «catálogo inalcanzable». Además es hoy el único camino posible con teclado o lector de pantalla.
- Un fallo de red al cargar la página N deja de borrar la rejilla entera. Hoy `if (error) return <pantalla de error>` sustituye las obras ya cargadas por «No se pudieron cargar las obras»; pasa a ser un aviso en línea con «Reintentar», y un error **no re-arma** la carga automática (si lo hiciera, el re-armado convertiría un 429 en una tormenta de peticiones).
- Las cuatro rutas comparten un mismo pie de rejilla (`GridLoadMore`), de modo que el estado cargando / cargar más / error sea idéntico en todas. Hoy `GalleryAuthorContent` y `GalleryMasAuthorContent` ni siquiera desestructuran `isLoadingMore`: en las fichas de artista no hay ninguna señal de que se esté cargando algo.
- Concatenación deduplicada por `id` y cerrojo en `useRef` en lugar de estado, que cierran la carrera de doble disparo (dos eventos de scroll en el mismo frame ven el mismo `isLoadingMore` obsoleto y la deduplicación de GET de `lib/api.js` les devuelve la misma promesa, duplicando 12 obras).
- La paginación pública del catálogo pasa a tener un orden total determinista (`ORDER BY created_at DESC, id DESC`). `created_at` es un `CURRENT_TIMESTAMP` de SQLite, con resolución de **un segundo**: en cuanto dos obras empaten, el orden entre ellas es indefinido y las páginas pueden solaparse o **saltarse obras que no aparecerán nunca**. Verificado contra producción: hoy no hay ningún empate, así que esto es endurecimiento preventivo, no la incidencia actual. Con un test de regresión en `api/tests/`.
- Instrumentación de una línea: cada uso del botón manual emite un evento personalizado a Plausible. Como la incidencia no es reproducible, la única forma honesta de saber si el arreglo funciona en la vida real es medir cuántas veces hace falta la salida de emergencia, y Plausible desglosa por navegador. Sin cookies, sin identificadores y sin datos personales.

## Capabilities

### New Capabilities
- `grid-infinite-scroll`: carga incremental de las rejillas de producto de galería y tienda — cuándo se dispara, cómo se re-arma, qué ocurre ante un fallo y qué garantía manual existe cuando la carga automática no se produce.
- `catalog-pagination-ordering`: orden total y estable de los listados públicos paginados de `art` y `others`, para que dos páginas consecutivas ni se solapen ni se salten filas.

### Modified Capabilities
<!-- Ninguna. `grid-scroll-restoration` sigue vigente sin cambios: su requisito «el scroll
     infinito continúa desde donde estaba» se mantiene tal cual, y el desempate determinista
     de la paginación sólo lo hace más fiable. -->

## Impact

**Layer afectada: frontend (`client/`) y backend (`api/`). Sin cambios de esquema de base de datos y sin dependencias nuevas.**

Frontend:
- `client/hooks/useInfiniteScroll.js` *(nuevo)* — observador, re-armado, vigía de respaldo, cerrojo y política de error. Único punto donde se decide «hay que cargar más».
- `client/hooks/useGalleryProducts.js` — consume el hook anterior; sustituye el listener de scroll, separa el error de carga incremental del error de carga inicial, deduplica al concatenar y expone las props del pie de rejilla.
- `client/components/GridLoadMore.js` *(nuevo)* — centinela + spinner + botón + error en línea. Lo usan las cuatro rutas.
- `client/app/galeria/page.js`, `client/app/tienda/page.js`, `client/app/galeria/autor/[authorSlug]/GalleryAuthorContent.js`, `client/app/tienda/autor/[authorSlug]/GalleryMasAuthorContent.js` — montan `GridLoadMore` y dejan de tratar un fallo de página N como error de página completa.
- `client/lib/constants.js` — margen del observador, umbral del vigía, tope de encadenamiento y los textos es-ES.

Backend:
- `api/controllers/artController.js:52` y `api/controllers/othersController.js:51` — desempate por `id` en el `ORDER BY`. Sin cambios de contrato: mismos parámetros, misma forma de respuesta, mismo `hasMore` por `limit + 1`.
- `api/tests/catalogPaginationOrdering.test.js` *(nuevo)* — con obras que empatan en `created_at`, recorrer todas las páginas devuelve cada obra exactamente una vez.

**Sistemas y dependencias:**
- `IntersectionObserver`: API nativa, sin polyfill. Disponible en todos los motores que este sitio recibe (Chrome/WebView Android 51+, Samsung Internet 5+, Safari iOS 12.2+). El vigía de respaldo cubre el caso de que no exista.
- Plausible: usa el stub de cola ya presente en `client/app/layout.js:210` y la llamada va con encadenamiento opcional, así que fuera de producción no hace nada. **Requiere dar de alta el objetivo del evento en el panel de Plausible** para que se registre; sin ese paso el evento se envía y se descarta, sin error.
- Sin cambios en variables de entorno, ni en la CSP, ni en nginx, ni en el despliegue.

## Non-goals

- **No se cambia la restauración de scroll.** `useGridScrollRestoration` y su rehidratación de N páginas en una petición quedan intactos, incluido `GRID_RESTORE_MAX_PAGES`.
- **No se cambia el contrato de paginación de la API.** Nada de paginación por cursor: `page`/`limit` con `hasMore` por `limit + 1` se mantiene. El cursor resolvería mejor el solape, pero obliga a tocar la restauración, el sitemap y el prerenderizado, y no tiene relación con la incidencia.
- **No se virtualiza la rejilla.** Con 26 obras no hay problema de rendimiento que resolver, y virtualizar rompería la restauración de scroll y el `data-product-id` del que depende.
- **No se toca la deduplicación de GET de `lib/api.js`.** Es correcta para su propósito; el problema estaba en llamar dos veces, no en deduplicar.
- **No se añade runner de tests a `client/`.** La verificación del frontend sigue siendo manual, como en el resto del proyecto. Lo único que se testea automáticamente aquí es el desempate del backend.
- **No se corrige el listado de `/galeria/artistas`**, que no usa este hook.
