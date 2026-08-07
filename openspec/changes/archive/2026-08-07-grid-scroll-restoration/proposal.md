## Why

En `/galeria` y `/tienda` el usuario baja por el grid de scroll infinito, entra en el detalle de una obra y, al pulsar el botón atrás del navegador, aparece arriba del todo con solo las 12 primeras obras cargadas: tiene que volver a bajar y a esperar cargas sucesivas para retomar donde estaba. Es la fricción más visible del recorrido de compra, porque castiga precisamente al usuario que más obras está explorando.

La causa es que `useGalleryProducts` refetchea siempre la página 1 al montar y el grid no conserva ni cuántas páginas había cargadas ni qué obra se pulsó, así que la restauración de scroll nativa del navegador no tiene contenido al que volver.

## What Changes

- Al pulsar una obra del grid se guarda una instantánea de la sesión ligada a **esa entrada concreta del historial**: páginas cargadas, id de la obra pulsada y desplazamiento en píxeles.
- Al volver con el botón atrás (o adelante) a esa misma entrada del historial, el grid se rehidrata con todas las páginas que había cargadas en una única petición y coloca la obra pulsada **aproximadamente en el centro de la pantalla**.
- La restauración solo ocurre en la navegación hacia atrás/adelante. Entrar en `/galeria` o `/tienda` desde el menú, desde un enlace externo o cambiando de filtro de autor sigue arrancando desde arriba con la página 1, exactamente como hoy.
- El scroll infinito continúa desde la última página restaurada: la siguiente carga pide la página N+1, sin repetir obras.
- Tope de restauración de 120 obras (10 páginas). Por encima se restaura hasta el tope.
- Si la obra pulsada ya no aparece en el listado (vendida, despublicada o reordenada), se restaura el desplazamiento en píxeles guardado en lugar de volver arriba.
- Alcance: los cuatro grids que comparten `ProductGrid` — `/galeria`, `/tienda`, `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]`.
- Sin cambios de API, de base de datos ni de variables de entorno. No hay cambios rompedores.

## Capabilities

### New Capabilities
- `grid-scroll-restoration`: restauración de la posición de scroll y de las páginas cargadas en los grids de producto con scroll infinito al volver atrás desde el detalle de un producto.

### Modified Capabilities
<!-- Ninguna. Ningún spec existente describe requisitos del grid de galería/tienda ni de su scroll infinito. -->

## Impact

**Código afectado (todo en `client/`, sin backend):**
- `client/hooks/useGalleryProducts.js` — acepta una instantánea de restauración: carga inicial de N páginas en una sola petición y continúa la paginación desde N.
- `client/hooks/useGridScrollRestoration.js` *(nuevo)* — marca la entrada del historial, guarda y lee la instantánea en `sessionStorage` y ejecuta el desplazamiento tras el pintado.
- `client/components/ProductGrid.js` — expone el id de cada obra en el DOM y notifica el clic al hook.
- `client/app/galeria/page.js`, `client/app/tienda/page.js`, `client/app/galeria/autor/[authorSlug]/GalleryAuthorContent.js`, `client/app/tienda/autor/[authorSlug]/GalleryMasAuthorContent.js` — conectan hook y grid.
- `client/lib/constants.js` — constantes de la restauración (clave de `sessionStorage`, tope de páginas, TTL).

**Sistemas y dependencias:**
- Usa `sessionStorage` y `window.history.state` (API ya soportada por el App Router de Next.js 16). Sin dependencias nuevas.
- El endpoint público `GET /api/art` y `GET /api/others` recibe un `limit` mayor (hasta 120) en la petición de restauración; ya lo admite y sigue cacheado por `cacheControl()`.
- Sin impacto en SEO: el grid ya es client-side y la restauración solo actúa tras una navegación del usuario.
