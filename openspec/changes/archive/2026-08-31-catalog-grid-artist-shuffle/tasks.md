## 1. Servicio de ordenación (API)

- [x] 1.1 Crear `api/services/catalogOrdering.js` con las constantes del módulo: `DECK_TTL_MS` (30 s), `MAX_SEEDED_LIMIT` (120) y `SEED_MAX` (2^32 − 1).
- [x] 1.2 Implementar `parseSeed(valor)`: devuelve un entero en `[0, SEED_MAX]` o `null` si falta, no es numérico o está fuera de rango. Nunca lanza.
- [x] 1.3 Implementar el PRNG `mulberry32(semilla)` y `shuffleInPlace(array, rand)` (Fisher-Yates con ese generador).
- [x] 1.4 Implementar `interleaveByArtist(groups, seed)`: función **pura** que baraja el orden de artistas, baraja las obras de cada artista y reparte por rondas. Devuelve un array plano de ids.
- [x] 1.5 Implementar `getDeck(productType)`: consulta `SELECT id, seller_id FROM <tabla> WHERE <filtros de visibilidad> ORDER BY seller_id, id DESC`, agrupa en `Map<seller_id, id[]>`, cachea por tipo con `DECK_TTL_MS` y una única promesa en vuelo para peticiones concurrentes.
- [x] 1.6 Exponer un ayudante de test para vaciar la caché de barajas (`__clearDeckCache()`), en la línea de `__clearOutbox()` de `emailService`.

## 2. Controladores (API)

- [x] 2.1 En `artController.getAllArtProducts`, ramificar: con `seed` válida y sin `author_slug`, usar el camino entrelazado; en cualquier otro caso, el camino cronológico **sin tocar su consulta actual**.
- [x] 2.2 Implementar el camino entrelazado: `getDeck` → `interleaveByArtist` → recortar `[offset, offset + limit)` con `limit` topado en `MAX_SEEDED_LIMIT` → hidratar con `SELECT … WHERE a.id IN (…)` **reaplicando los filtros de visibilidad** → reordenar en memoria según la lista → `attachProductImages`.
- [x] 2.3 Calcular `hasMore` sobre la longitud de la lista ordenada (`total > offset + limit`), no sobre las filas hidratadas.
- [x] 2.4 Devolver lista vacía y `hasMore: false` cuando el desplazamiento supera el total, sin error, y topar `page` en 1 (un desplazamiento negativo haría que `Array.slice` sirviera la cola del catálogo).
- [x] 2.5 Replicar 2.1–2.4 en `othersController.getAllOthersProducts`, conservando el cálculo de `stock` por variaciones y `attachVariationThumbnails` sobre las filas hidratadas.
- [x] 2.6 Verificar que la línea `ORDER BY … created_at DESC, … id DESC LIMIT ? OFFSET ?` sigue presente en ambos controladores y que el camino entrelazado no usa `LIMIT ? OFFSET ?` en SQL (guardián estructural de `catalogPaginationOrdering.test.js`).

## 3. Tests de la API

- [x] 3.1 `api/tests/catalogOrdering.test.js` — función pura: la salida es una permutación exacta de la entrada; determinismo para la misma semilla; semillas distintas producen órdenes distintos.
- [x] 3.2 Mismo fichero — invariante de contigüidad: para muchas semillas y varios repartos (incluido 9/6/6/5), una repetición en la posición `i` implica que desde `i` en adelante todo pertenece al mismo artista.
- [x] 3.3 Mismo fichero — los `k` primeros elementos son de `k` artistas distintos cuando hay `k` artistas con obra.
- [x] 3.4 Mismo fichero — reparto de la primera posición sobre miles de semillas con el reparto 9/6/6/5: cada artista sale primero en una fracción próxima a 1/4, con márgenes holgados para que el test no sea inestable.
- [x] 3.5 Mismo fichero — casos límite: baraja vacía, un solo artista, un solo producto, artistas con una sola obra.
- [x] 3.6 `api/tests/catalogFairOrdering.test.js` — de extremo a extremo sobre `/api/art` y `/api/others`: sembrar varios vendedores con varias obras cada uno y recorrer todas las páginas con la misma semilla; cada producto aparece exactamente una vez.
- [x] 3.7 Mismo fichero — sin `seed`, el orden es el cronológico de siempre; con `seed` inválida (`abc`, `-1`, por encima del rango), respuesta 200 y orden cronológico.
- [x] 3.8 Mismo fichero — con `author_slug` y `seed` a la vez, la respuesta es cronológica y contiene sólo las obras de ese autor.
- [x] 3.9 Mismo fichero — `page=1` con `limit` de varias páginas devuelve el mismo prefijo que pedir esas páginas una a una con la misma semilla (camino de la restauración).
- [x] 3.10 Ejecutar la suite completa de `api/` y confirmar que `catalogPaginationOrdering.test.js` y `testEnvironmentIsolation.test.js` siguen en verde.

## 4. Cliente

- [x] 4.1 Añadir a `client/lib/constants.js` la constante del rango de la semilla y un ayudante `sortearSemillaOrden()` que la genere.
- [x] 4.2 Añadir el parámetro opcional `seed` a `artAPI.getAll` y `othersAPI.getAll` en `client/lib/api.js`; sólo se añade a la query cuando no es nulo.
- [x] 4.3 En `useGridScrollRestoration`: guardar la semilla en la instantánea (`setOrderSeed(seed)` + escritura en `onProductOpen`) y aceptar en `isValidSnapshot` instantáneas **sin** semilla.
- [x] 4.4 En `useGalleryProducts`: sortear la semilla dentro de `loadInitial` (nunca en el render), reutilizar la de la instantánea cuando la hay, guardarla en una referencia y pasarla en `loadInitial` y en `loadMore`. No enviar semilla cuando hay `authorSlug`.
- [x] 4.5 Comunicar la semilla en uso a la restauración para que `onProductOpen` la persista.
- [x] 4.6 Comprobar que `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]` siguen sin enviar semilla y que su siembra desde servidor (`initialProducts`) no cambia.

## 5. Verificación

- [x] 5.1 Con los contenedores locales, cargar `/galeria` varias veces y comprobar que el primer artista cambia entre cargas y que no hay dos obras contiguas del mismo artista en las dos primeras páginas.
- [x] 5.2 Bajar hasta cargar todas las páginas y comprobar que no se repite ninguna obra y que aparecen las 26.
- [x] 5.3 Abrir una obra, volver atrás y comprobar que la rejilla vuelve con el **mismo** orden y la obra centrada.
- [x] 5.4 Filtrar por cada artista en la barra lateral y en el filtro móvil; comprobar que sólo salen sus obras y en el orden de siempre.
- [x] 5.5 Comprobar la ausencia de advertencias de hidratación en la consola al cargar `/galeria` y `/tienda`.
- [x] 5.6 Ejecutar `docker compose exec -e NODE_ENV=production client npm run build` y confirmar que `/galeria` y `/tienda` siguen apareciendo como `○ (Static)` en la tabla de rutas.
