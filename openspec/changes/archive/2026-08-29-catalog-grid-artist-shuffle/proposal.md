## Why

Las rejillas públicas de `/galeria` y `/tienda` ordenan hoy por `created_at DESC, id DESC`. Como cada artista sube su catálogo de una sentada, esa cláusula agrupa las obras por artista en bloques contiguos y **fija para siempre qué artista ocupa la primera fila**: quien subió el último aparece siempre arriba y quien subió primero no llega nunca a la primera página. La exposición en la rejilla —el activo más escaso de la galería— queda repartida por la fecha de alta, que no es un criterio que nadie haya elegido.

El coste crece con el catálogo: hoy con pocos artistas todos caben en las primeras filas, pero con veinte artistas y quince obras cada uno, el orden por fecha condena a la mayoría a páginas que casi nadie carga.

## What Changes

- Los listados públicos paginados `GET /api/art` y `GET /api/others` aceptan un parámetro **`seed`** opcional. Con `seed`, la respuesta se ordena **entrelazando artistas por rondas** (un producto de cada artista, luego el segundo de cada uno, y así) con el orden de artistas y el orden interno de cada artista barajados de forma determinista a partir de esa semilla.
- **Sin `seed`, el comportamiento es exactamente el de hoy** (`created_at DESC, id DESC`). El parámetro es opcional y aditivo: ningún consumidor existente cambia.
- **El filtro por autor desactiva el entrelazado.** Con `author_slug` presente sólo hay un artista y no hay nada que entrelazar: se sirve el orden cronológico de siempre, aunque llegue una semilla. Las rutas `/galeria/autor/[slug]` y `/tienda/autor/[slug]` y el filtro de la barra lateral funcionan sin ningún cambio observable.
- El cliente **sortea una semilla nueva en cada carga** de `/galeria` y `/tienda` y la mantiene durante toda la vida de esa rejilla, de modo que las páginas 2, 3… del scroll infinito pertenezcan al mismo barajado. Cada visita, y cada recarga, ve un orden distinto.
- La **restauración de scroll** guarda la semilla en su instantánea y la reutiliza al volver atrás: sin eso, la vuelta desde la ficha de una obra reconstruiría una rejilla distinta y la posición guardada apuntaría a otro producto.
- Nueva capa de ordenación en la API (`api/services/catalogOrdering.js`): una **baraja** de `(artista → ids)` cacheada en memoria con TTL corto —independiente de la semilla, compartida por todos los visitantes— y una **función pura de entrelazado** que consume esa baraja y una semilla. La página se hidrata después por clave primaria. El coste por petición **baja**: se sustituye un recorrido con `LIMIT`/`OFFSET` por una búsqueda de doce filas por id.

## Capabilities

### New Capabilities
- `catalog-fair-ordering`: ordenación entrelazada por artista y aleatorizada por semilla de los listados públicos de catálogo, incluidas sus garantías de paginación (orden total, sin repeticiones ni omisiones entre páginas) y su degradación cuando no se recibe semilla o hay filtro de autor.

### Modified Capabilities
- `grid-scroll-restoration`: la instantánea pasa a incluir la semilla de ordenación de la rejilla, y la restauración SHALL reconstruirla con esa misma semilla. Sin este añadido la restauración deja de ser correcta en cuanto la rejilla se ordena al azar.

## Impact

**API**
- `api/controllers/artController.js` → `getAllArtProducts`
- `api/controllers/othersController.js` → `getAllOthersProducts`
- Nuevo `api/services/catalogOrdering.js` (baraja cacheada + PRNG sembrado + entrelazado puro)
- `api/tests/`: nuevos tests de la función pura (entrelazado, determinismo, uniformidad de la primera posición) y de extremo a extremo sobre los dos endpoints (sin repeticiones ni omisiones al recorrer todas las páginas con la misma semilla). El guardián estructural existente `api/tests/catalogPaginationOrdering.test.js` debe seguir en verde.

**Cliente**
- `client/hooks/useGalleryProducts.js` (sorteo y custodia de la semilla)
- `client/hooks/useGridScrollRestoration.js` (semilla en la instantánea)
- `client/lib/api.js` (`artAPI.getAll`, `othersAPI.getAll` aceptan la semilla)
- `client/lib/constants.js` (rango de la semilla)
- `client/app/galeria/page.js` y `client/app/tienda/page.js` **no cambian**: consumen el hook.
- `client/app/galeria/autor/[authorSlug]/` y `client/app/tienda/autor/[authorSlug]/` **no cambian**: pasan `authorSlug`, que desactiva el entrelazado.

**Sin impacto**
- Esquema de base de datos: ninguna tabla, columna ni índice nuevos.
- Variables de entorno: ninguna.
- `client/lib/serverApi.js`: sus dos usos del listado (`fetchAuthorArtProducts`, `fetchAuthorOtherProducts`) van filtrados por autor.
- Despliegue: api y cliente pueden desplegarse por separado en cualquier orden, porque el parámetro es opcional en un lado y omitible en el otro.
