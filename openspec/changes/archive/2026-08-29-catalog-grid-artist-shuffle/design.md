## Context

`GET /api/art` y `GET /api/others` sirven hoy:

```sql
... WHERE visible = 1 AND is_sold = 0 AND status = 'approved' AND removed = 0
      AND (for_auction = 0 OR for_auction IS NULL)
      AND (for_draw   = 0 OR for_draw   IS NULL)
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?
```

`created_at` es `DATETIME DEFAULT CURRENT_TIMESTAMP` con resolución de un segundo, y cada artista sube su obra de una sentada: el resultado es que las obras salen **agrupadas por artista** y con el mismo artista siempre arriba. El desempate por `id DESC` lo añadió `grid-infinite-scroll-reliability` y es lo que hoy garantiza que recorrer las páginas no repita ni pierda filas; cualquier ordenación nueva tiene que conservar esa garantía.

Distribución real en preproducción (28/08/2026), que es la que gobierna las decisiones de abajo:

| tabla | artistas | obras | reparto |
|---|---|---|---|
| `art` | 4 | 26 | 9 / 6 / 6 / 5 |
| `others` | 0 | 0 | — |

Cuatro consumidores del listado, y sólo dos cambian:

- `/galeria` y `/tienda` — sin filtro, scroll infinito. **Cambian.**
- `/galeria/autor/[slug]` y `/tienda/autor/[slug]` — un solo artista, con siembra desde el servidor (`initialProducts`). **No cambian.**
- `client/lib/serverApi.js` → `fetchAuthorArtProducts` / `fetchAuthorOtherProducts`, siempre con `author_slug`. **No cambian.**
- Cualquier consumidor externo que llame al endpoint sin `seed`. **No cambia.**

Restricciones heredadas que condicionan el diseño:

- **La paginación es por ventana sobre una lista, y el scroll infinito pide las páginas de una en una.** El orden tiene que ser idéntico entre la petición de la página 1 y la de la página 3, minutos después.
- **`useGridScrollRestoration`** rehidrata hasta 10 páginas en una sola petición al volver atrás y coloca en pantalla el producto que se pulsó. Si la rejilla se reconstruye con otro orden, la instantánea apunta a otra obra.
- **Nada que dependa del azar puede evaluarse durante el render.** `StoryVideo` ya costó un fallo de hidratación por un `Math.random()` en un inicializador de `useState` (ver CLAUDE.md); el sorteo de la semilla va en un efecto.
- **El techo medido de producción está en el render de Next.js, no en la API** (25 req/s en fichas, la API a 60 req/s con p95 382 ms). Aun así, la ordenación no debe añadir trabajo por petición que crezca con el catálogo.

## Goals / Non-Goals

**Goals:**

- Que ninguna posición de la rejilla pertenezca sistemáticamente al mismo artista: en particular, que la **primera posición sea equiprobable entre artistas** en cada carga.
- Que dos productos contiguos no sean del mismo artista mientras queden obras de otro por colocar.
- Que el orden cambie en cada carga de la rejilla y se mantenga estable durante toda la vida de esa rejilla (páginas siguientes del scroll infinito y restauración al volver atrás).
- Conservar intacta la garantía de paginación: recorrer todas las páginas devuelve cada producto exactamente una vez.
- Dejar el filtro por autor y las rutas por autor **sin un solo cambio observable**.
- No aumentar el número de viajes a Turso por petición.

**Non-Goals:**

- Ponderar la exposición por criterios de negocio (obra nueva, precio, artista destacado, obras sin ventas). Este cambio sólo elimina un sesgo; no introduce otro.
- Persistir el orden entre visitas o entre dispositivos.
- Cambiar el orden de la portada, de `/galeria/artistas`, de subastas, de sorteos o de las rutas por autor.
- Invalidar la caché de la baraja desde las rutas de escritura (ver *Decisions*, punto 6).
- Nuevas tablas, columnas, índices o variables de entorno.

## Decisions

### 1. El orden se calcula en la aplicación, no en SQL

**Elegido:** la API obtiene los ids del catálogo agrupados por artista, y una función **pura de JavaScript** produce la lista ordenada a partir de esa agrupación y de una semilla.

**Alternativa descartada — hacerlo en SQL con funciones de ventana:**

```sql
ROW_NUMBER() OVER (PARTITION BY seller_id ORDER BY ((a.id * ?) % 2147483647))
```

Es una sola consulta y sin estado, que es muy atractivo. Se descarta por dos razones, la primera de ellas decisiva:

- **SQLite no tiene función de hash ni operador XOR** (`&`, `|`, `<<`, `>>`, `~`, pero no `^`), así que el único mezclador expresable es el multiplicativo `(x · semilla) mod p`. Ordenar `{x·s mod p}` para un conjunto pequeño de `x` no produce una permutación uniforme: es la estructura de los tres huecos, con una familia de permutaciones alcanzables mucho menor que `k!` y con sesgos que dependen de la fracción continua de `s/p`. Ese sesgo recaería justo sobre **quién sale primero**, que es la propiedad por la que existe este cambio, y sería invisible: el orden parecería aleatorio.
- **La invariante interesante no sería comprobable.** «Dos productos contiguos no son del mismo artista» se afirma sobre una cadena de texto SQL. Como función pura se comprueba con un bucle sobre miles de semillas.

Con la función en JavaScript se usa **mulberry32**, un PRNG de 32 bits de estado, cinco líneas, sin dependencias, con avalancha real y reproducible entre procesos.

### 2. Entrelazado por rondas (round-robin), no reparto proporcional

Baraja los artistas, baraja las obras de cada artista, y reparte por rondas: una obra de cada artista, luego la segunda de cada uno, y así hasta agotar.

Propiedades que se obtienen de la construcción, sin ajustes:

- **La primera posición es equiprobable entre artistas** (es el primero de la baraja de artistas). Éste es el objetivo del cambio.
- **Todos los artistas aparecen en las primeras `k` posiciones**, con `k` = número de artistas. Con 4 artistas, los cuatro están en la primera fila.
- **Dos contiguos del mismo artista sólo pueden ocurrir en la frontera entre rondas**, y sólo cuando ya no queda más que un artista con obras. Es exactamente la excepción «por número de obras» que el cambio admite.

Con el reparto real (9/6/6/5, 26 obras): las **20 primeras** posiciones alternan los cuatro artistas sin una sola repetición; las posiciones 21-23 alternan los tres que quedan; y las **tres últimas** son del artista con 9 obras. Con páginas de 12, las páginas 1 y 2 son perfectas y la agrupación cae en las dos últimas tarjetas de la página 3.

**Alternativa descartada — voraz «el que más le queda, distinto del anterior»** (el algoritmo óptimo del problema de reorganizar cadenas). Con 4/2/2 consigue cero repeticiones donde el round-robin deja una. Se descarta porque **la posición 1 le toca siempre al artista con más obras**: cambia un sesgo sistemático por fecha de alta por un sesgo sistemático por tamaño de catálogo, que es la misma injusticia con otro nombre. Y en el reparto real la ganancia sería de dos tarjetas al final de la última página.

**Alternativa descartada — rango fraccionario `(i + φ) / c`** (reparto proporcional al catálogo de cada artista, con fase aleatoria). Separa mejor en el caso muy desequilibrado, pero la probabilidad de salir primero pasa a ser proporcional al número de obras (con 4/2/2, el 58 % para el grande), y la fase aleatoria produce agrupaciones ocasionales que el round-robin nunca produce. Más complejo y peor en el objetivo declarado.

**También se baraja el orden interno de cada artista**, no sólo el orden entre artistas: si no, la misma obra de cada artista encabezaría siempre su serie.

### 2 bis. El orden de artistas se resortea en cada ronda (bandas verticales)

La primera versión de este cambio fijaba el orden de artistas **una sola vez** y lo repetía en todas las rondas. Corregía el agrupamiento horizontal y, al hacerlo, creó uno peor: verificado en pantalla sobre `/galeria`, cada artista quedaba clavado en una columna, fila tras fila. Con obra de estilos muy reconocibles, el visitante lee esa columna como un bloque — el mismo defecto que se venía a corregir, girado 90°.

**La causa no es la aleatoriedad, es la periodicidad.** El reparto por rondas produce una secuencia de periodo `m` (el tamaño de la ronda, es decir el número de artistas con obra). Una rejilla de `c` columnas pone en la misma columna las posiciones que distan `c`. Con `c === m`, «distar `c`» es «mismo índice dentro de la ronda»: alineación perfecta. `ProductGrid.js` pinta `grid-cols-2` y `lg:grid-cols-4`, y la galería tiene cuatro artistas — la coincidencia exacta.

**La corrección tiene dos piezas:**

1. **Resorteo del orden de artistas en cada ronda**, con la restricción dura de siempre (el primero de una ronda no puede ser el último de la anterior). Esto elimina la periodicidad, y con ella cualquier banda a cualquier número de columnas.
2. **Desarreglo respecto de la ronda anterior** —ningún artista repite índice dentro de la ronda— cuando la ronda tiene **cuatro o más** participantes. Esto convierte «no hay banda» en «no hay *ni un solo* vecino vertical igual» en el caso alineado `c === m`, que es el único en que la rejilla puede engancharse.

**El umbral de cuatro no es arbitrario, y bajarlo empeora el resultado:**

| participantes | desarreglos válidos | consecuencia |
|---|---|---|
| 2 | 0 (incompatible con la restricción de fila) | la alternancia es la única secuencia sin contigüidad; la banda es del reparto, no del algoritmo |
| 3 | 1 (la rotación) | solución **única** ⇒ la secuencia vuelve a ser periódica, en diagonal. Y protegería la distancia 3, que ninguna rejilla usa |
| ≥ 4 | de sobra | la restricción no determina nada; se cumple y queda azar |

**No se prohíben más distancias**, aunque parezca gratis proteger también las 2 columnas del móvil. Con cuatro artistas, exigir a la vez distancia 2 y distancia 4 deja **dos** permutaciones válidas y **fuerza** el primer elemento de cada ronda: la primera columna acaba alternando siempre entre los dos mismos artistas. Se cambiaría una banda por otra. Con `m` grande sí habría holgura, pero entonces tampoco hace falta: sin alineación no hay banda.

**Medido sobre el reparto real (9/6/6/5), 3000 semillas:**

| | antes | ahora |
|---|---|---|
| vecino vertical igual, 4 columnas | 100 % | 7,65 % |
| columnas monopolizadas por un artista | 100 % | 0 % |
| repartos parejos (5/5/5/5), 4 columnas | 100 % | **0 %** |

El resto de propiedades no se toca: la primera ronda sigue siendo un barajado sin restricciones, así que la primera posición sigue siendo equiprobable; la restricción de fila sigue siendo dura, así que la invariante de contigüidad se mantiene palabra por palabra.

**Coste:** hasta `INTENTOS_RONDA` (40) barajados de `m` elementos por ronda, con la reparación por intercambio como red final. Con cuatro artistas una permutación al azar cumple ambas restricciones una de cada cuatro veces, así que lo típico son tres o cuatro intentos. Medido: 10 000 obras y 200 artistas se ordenan en menos de medio segundo, y en la práctica en pocos milisegundos.

### 3. La semilla la sortea el cliente y viaja en la query

`GET /api/art?page=2&limit=12&seed=2748492113`

- **Por qué el cliente y no el servidor:** el servidor tendría que recordar qué semilla le dio a quién para que la página 2 casara con la página 1 — cookie o sesión, estado por visitante en un endpoint público y cacheable. El cliente ya es el dueño natural del ciclo de vida «una carga de la rejilla».
- **Por qué en la query y no en la URL de la página:** `?seed=` en `/galeria` ensuciaría la URL que la gente comparte y haría que compartir un enlace fijara el orden, que es lo contrario de lo que se busca.
- **Es un dato público sin ninguna autoridad:** permuta filas que el endpoint ya sirve sin autenticar. No selecciona filas, no filtra y no revela nada. Se valida como entero en `[0, 2^32 − 1]`; **una semilla ausente, no numérica o fuera de rango se trata como ausente**, y ausente significa el orden cronológico de hoy. La rejilla nunca se rompe por una semilla mala.
- **`author_slug` gana siempre.** Con filtro de autor hay un solo artista y no hay nada que entrelazar: se sirve el camino cronológico aunque llegue una semilla. Así el filtro de la barra lateral queda protegido en el servidor, no sólo por que el cliente no mande semilla.

Ciclo de vida en el cliente (`useGalleryProducts`):

| situación | semilla |
|---|---|
| montaje de `/galeria` o `/tienda` | **nueva**, sorteada dentro del efecto de montaje |
| páginas 2, 3… del scroll infinito | la misma |
| recarga de la página (F5) | **nueva** |
| volver atrás desde la ficha de una obra | **la de la instantánea** |
| rutas por autor | ninguna |

El sorteo ocurre dentro de `loadInitial()`, que se ejecuta en un efecto. **Nunca durante el render**: `/galeria` y `/tienda` se prerrenderizan y su HTML estático es «Cargando…», así que un `Math.random()` en un inicializador de `useState` sería el mismo fallo de hidratación que ya costó `StoryVideo`.

### 4. La instantánea de scroll guarda la semilla

`useGridScrollRestoration` pasa a escribir `seed` junto a `pages`, `productId` y `scrollY`. Sin esto la restauración deja de funcionar en cuanto la rejilla se ordena al azar: se rehidratarían 4 páginas de un barajado **distinto**, y el producto que se pulsó estaría en otra posición o fuera de las páginas recargadas — el sistema caería al desplazamiento guardado, que ya no significa nada.

`isValidSnapshot` acepta `seed` **opcional**: las instantáneas escritas antes del despliegue siguen en `sessionStorage` de los visitantes hasta 30 minutos, y deben restaurar (con semilla nueva) en lugar de descartarse.

### 5. Baraja cacheada en memoria + hidratación por clave primaria

Tres pasos por petición con semilla:

1. **Baraja** (`getDeck(tipo)`) — `SELECT id, seller_id FROM art WHERE <filtros> ORDER BY seller_id, id DESC`, agrupada en `Map<seller_id, id[]>`. **No depende de la semilla**, así que una sola entrada de caché sirve a todos los visitantes. TTL de 30 s, con promesa única en vuelo para que N peticiones concurrentes hagan una sola consulta (mismo patrón que la caché de token de `sendcloudAuth.js`).
2. **Entrelazado** (función pura) — baraja + semilla → lista de ids. Sin E/S, O(N).
3. **Hidratación** — `SELECT … WHERE a.id IN (…)` con los 12 ids de la página, **reaplicando los filtros de visibilidad**, y reordenado en memoria según la lista.

El coste por petición **baja** respecto a hoy: con la baraja caliente es una búsqueda de doce filas por clave primaria en lugar de un recorrido con `LIMIT`/`OFFSET`, y se conserva un solo viaje a Turso.

`ORDER BY seller_id, id DESC` en la consulta de la baraja no es decorativo: es lo que hace que **un catálogo que no ha cambiado se rebarage idéntico** al expirar el TTL, y por tanto que la página 3 pedida cinco minutos después de la página 1 pertenezca al mismo orden.

`hasMore = baraja.length > offset + limit`, calculado sobre la baraja y no sobre las filas hidratadas, para que una obra vendida hace veinte segundos no corte la paginación.

El `limit` del camino con semilla se topa en 120 (`GRID_RESTORE_MAX_PAGES × DEFAULT_PAGE_SIZE`, el máximo que el cliente pide de verdad, en la rehidratación de la restauración). El camino cronológico no se toca. El tope es necesario porque el `IN (…)` de la hidratación gasta un parámetro por id y tiene techo en SQLite.

**Alternativa descartada — sin caché, dos consultas por petición.** Con 26 obras es indistinguible. Se incluye la caché porque el coste son ~30 líneas de un patrón que ya existe en el repositorio, y porque sin ella cada petición del listado envía el catálogo entero por la red: a 5 000 obras eso son ~150 KB por petición de página, en el endpoint más visitado del sitio.

### 6. La caché caduca por tiempo, nunca se invalida desde las escrituras

Invalidar explícitamente obligaría a llamar a la invalidación desde todos los caminos que cambian la visibilidad de un producto —aprobar, ocultar, vender, retirar, marcar para subasta, marcar para sorteo, el webhook de Sendcloud, el programador de subastas, la facturación de sorteos—. Son muchos sitios que tienen que estar de acuerdo, olvidar uno es silencioso, y la consecuencia de olvidarlo es peor que la de no invalidar nunca. Con TTL de 30 s el desfase máximo es de 30 s y no hay ningún sitio que mantener al día.

Consecuencias aceptadas, ambas acotadas por el TTL:

- Una obra recién aprobada tarda hasta 30 s en aparecer.
- Una obra vendida hace menos de 30 s sigue en la baraja, pero **no se hidrata** (los filtros se reaplican), así que esa página devuelve 11 productos en lugar de 12. `hasMore` sigue siendo correcto y el hueco desaparece al expirar el TTL. Es la misma clase de anomalía que la paginación por `OFFSET` ya produce hoy sobre un catálogo vivo, y que el cliente ya absorbe con su deduplicación por id.

### 7. Sin semilla, el comportamiento es literalmente el de hoy

El camino cronológico conserva su consulta, con su `ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?` intacto. Esto no es sólo compatibilidad: el guardián estructural de `api/tests/catalogPaginationOrdering.test.js` lee esa línea y falla si pierde el desempate por `id`. El camino con semilla no usa `LIMIT ? OFFSET ?` en SQL, así que no entra en ese guardián.

## Risks / Trade-offs

- **Recargar la página reordena la rejilla y el visitante pierde su sitio** → Es el comportamiento pedido de forma explícita. La vuelta atrás desde una ficha, que es la navegación frecuente, sí conserva el orden gracias a la semilla en la instantánea.
- **Baraja obsoleta hasta 30 s: hueco de una tarjeta tras una venta** → La hidratación reaplica los filtros, así que nunca se muestra una obra vendida; sólo se muestra una menos. `hasMore` se calcula sobre la baraja y no se corta la paginación. Misma clase de anomalía que hoy.
- **El catálogo cambia mientras el visitante recorre las páginas: una obra puede quedar sin aparecer** → Ya ocurre hoy con `OFFSET`, y está documentado en `useGalleryProducts`. La deduplicación por id del cliente impide el caso peor (la obra repetida con clave de React duplicada).
- **`useInfiniteScroll` desarma la carga automática ante una página que no aporta nada** → Correcto y deseado: el botón manual de `GridLoadMore` sigue ahí y rearma.
- **La respuesta deja de ser reutilizable entre visitantes por cachés compartidas** → `/api` no está en `proxy_cache` de nginx por decisión previa («la API sirve estado»), y `cacheControl({ maxAge: 60 })` sigue funcionando por URL, con la semilla dentro de la URL.
- **Memoria del proceso** → Dos entradas, cada una O(N) enteros. Con 26 obras es ruido; con 50 000 serían unos pocos MB.
- **`others` está vacío en preproducción** → El cambio es hoy un no-op visible en `/tienda`. El código es el mismo en los dos controladores y los tests siembran sus propios datos, así que no queda sin cubrir.
- **Percepción de «desorden»** → Un visitante que vuelve al día siguiente no reconoce la rejilla. Es el precio explícito de la rotación; la ficha de cada obra y la ruta por autor siguen siendo estables y son las que se comparten.
- **Con dos artistas la rejilla vuelve a bandearse, y no tiene arreglo** → La única secuencia sin dos obras contiguas del mismo artista es la alternancia, y la alternancia fija la paridad de cada columna. Es una propiedad del reparto, no del algoritmo. Con tres o más desaparece.
- **La tasa de vecinos verticales iguales tiende a 1/k** cuando el número de artistas `k` no coincide con el de columnas → Es el nivel del azar puro, sin patrón: con 5 artistas ronda el 20 %, con 10 baja al 4 %. Sólo el caso alineado `k = columnas` recibe la garantía de cero, y es precisamente el que producía la banda.
- **Un artista que copa el catálogo arrastra la cola** → Con 60 obras de 65, la mayor parte de la rejilla es suya por aritmética. La cabecera sigue repartiendo (los `k` primeros son `k` artistas distintos) y la primera posición sigue siendo equiprobable; lo que no se puede es inventar obra ajena para separar la suya.

## Migration Plan

Cambio **aditivo por los dos lados y sin acoplamiento de despliegue**, al contrario que `shipping-cost-verification`:

1. Desplegar la API. Sin clientes que manden `seed`, no cambia nada.
2. Desplegar el cliente. Empieza a mandar `seed` en `/galeria` y `/tienda`.

Cualquiera de los dos órdenes funciona, y también funcionan indefinidamente desacoplados.

**Retroceso:** revertir el cliente basta (deja de mandar `seed` → orden cronológico). Revertir sólo la API también es seguro: el parámetro se ignora como cualquier query desconocida.

Sin migración de datos, sin variables de entorno, sin cambios de esquema. Las instantáneas de scroll antiguas siguen siendo válidas.

## Open Questions

- ¿Debería la portada usar el mismo entrelazado cuando muestre obras? Fuera de alcance aquí; la función pura queda reutilizable.
- Si el catálogo llega a varios miles de obras, ¿conviene invalidar la baraja desde la aprobación de producto en lugar de subir el TTL? Hoy no compensa (punto 6).
- ¿Merece la pena medir con Plausible cuántas cargas llegan a la página 2, para saber si la cola agrupada del reparto desigual se ve siquiera? Hay ya un evento de carga incremental (`GRID_LOAD_MORE_EVENT`) que podría responderlo sin código nuevo.
