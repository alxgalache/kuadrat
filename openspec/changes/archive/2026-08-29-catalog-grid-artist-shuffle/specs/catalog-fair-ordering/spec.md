## ADDED Requirements

### Requirement: Ordenación entrelazada por artista bajo semilla

Los listados públicos paginados de obra y de tienda (`GET /api/art` y `GET /api/others`) SHALL aceptar un parámetro de consulta opcional `seed`. Cuando llega una semilla válida y **no** hay filtro por autor, la respuesta SHALL ordenarse entrelazando los artistas por rondas: se baraja el orden de los artistas y el orden interno de las obras de cada artista de forma determinista a partir de la semilla, y a continuación se reparte una obra de cada artista, después la segunda de cada uno, y así sucesivamente hasta agotar el catálogo.

El orden así producido SHALL ser un orden **total y determinista**: la misma semilla sobre el mismo conjunto de productos SHALL producir siempre exactamente la misma secuencia, en peticiones distintas y en procesos distintos.

La ordenación SHALL calcularse sobre el catálogo completo que el listado puede devolver, no sobre la página solicitada, de modo que el entrelazado se sostenga a través de las fronteras entre páginas.

#### Scenario: Cada artista aparece en las primeras posiciones

- **WHEN** el catálogo contiene obras de 4 artistas y se solicita la primera página con una semilla
- **THEN** las 4 primeras posiciones corresponden a 4 artistas distintos

#### Scenario: Sin dos productos contiguos del mismo artista

- **WHEN** se recorre la secuencia completa producida para una semilla
- **THEN** dos posiciones consecutivas pertenecen al mismo artista únicamente si, a partir de la primera de ellas, todos los productos restantes pertenecen a ese mismo artista

#### Scenario: El entrelazado cruza la frontera entre páginas

- **WHEN** el último producto de una página y el primero de la siguiente se obtienen en dos peticiones distintas con la misma semilla
- **THEN** pertenecen a artistas distintos, salvo que ya no queden productos de ningún otro artista

#### Scenario: Determinismo de la semilla

- **WHEN** se solicita dos veces la misma página con la misma semilla y el catálogo no ha cambiado entre ambas
- **THEN** las dos respuestas contienen los mismos productos en el mismo orden

### Requirement: La rejilla no dibuja bandas verticales

El orden de artistas SHALL resortearse en **cada ronda**, y no fijarse una vez para todo el reparto. Cuando la ronda tiene cuatro o más participantes, el nuevo orden SHALL además ser un desarreglo del de la ronda anterior: ningún artista repite el mismo índice dentro de la ronda.

El motivo es la interacción con la rejilla, no la secuencia en sí. Un reparto por rondas con orden fijo produce una secuencia **periódica de periodo `m`** (el tamaño de la ronda). Una rejilla de `c` columnas coloca en la misma columna las posiciones que distan `c`, de modo que con `c === m` cada artista queda clavado en su columna, fila tras fila. Con cuatro artistas y `lg:grid-cols-4` el resultado eran cuatro columnas monotemáticas: como la obra de cada artista tiene un estilo muy reconocible, el visitante percibía un patrón vertical **más molesto que el agrupamiento horizontal que este cambio venía a corregir**. `c === m` es el único caso en que la secuencia puede engancharse con la rejilla, y el desarreglo entre rondas es su antídoto exacto — sin que la API necesite saber cuántas columnas pinta el cliente, que además cambian con el breakpoint.

El umbral de cuatro participantes es deliberado y SHALL NOT rebajarse: con dos, desarreglo y no-contigüidad son incompatibles (y la alternancia resultante es la única secuencia posible sin contigüidad); con tres, la solución es única y devolvería la secuencia a ser periódica, esta vez en diagonal.

SHALL NOT añadirse más distancias prohibidas: exigir a la vez la distancia 2 y la 4 con cuatro artistas deja dos permutaciones válidas y fuerza el primer elemento de cada ronda, con lo que la primera columna acaba alternando siempre entre los dos mismos artistas — una banda cambiada por otra.

#### Scenario: Tantas columnas como artistas

- **WHEN** el catálogo tiene cuatro artistas con obra repartida y la rejilla pinta cuatro columnas
- **THEN** ninguna obra tiene encima una obra del mismo artista

#### Scenario: La columna no pertenece a nadie

- **WHEN** se observan las primeras filas de la rejilla, a dos o a cuatro columnas
- **THEN** ninguna columna está ocupada por un solo artista, salvo cuando ya no queda obra de ningún otro

#### Scenario: No hay más bandas que barajando al azar

- **WHEN** se compara la frecuencia con que una columna queda ocupada por un solo artista con la que produciría barajar el catálogo entero sin ningún criterio
- **THEN** la del entrelazado no es mayor, y además no presenta las repeticiones horizontales que el azar sí produce

#### Scenario: La secuencia deja de ser periódica

- **WHEN** se comparan dos rondas consecutivas de una misma ordenación
- **THEN** el orden de los artistas difiere entre ellas

#### Scenario: Dos artistas

- **WHEN** el catálogo sólo tiene dos artistas
- **THEN** la secuencia alterna entre ambos y la rejilla queda bandeada, porque la alternancia es la única disposición sin dos obras contiguas del mismo artista

### Requirement: La primera posición es equiprobable entre artistas

El algoritmo de ordenación SHALL asignar la primera posición de la rejilla a un artista elegido de forma uniforme entre los artistas con obra publicada, con independencia de cuántas obras tenga cada uno y de cuándo las publicó.

Esta propiedad es la razón de ser del cambio. Un algoritmo que consiga una separación mejor entre obras del mismo artista a costa de conceder la primera posición al artista con más obras SHALL NOT emplearse: sustituiría el sesgo por fecha de alta por un sesgo por tamaño de catálogo.

#### Scenario: Reparto de la primera posición a lo largo de muchas cargas

- **WHEN** se generan muchas ordenaciones con semillas distintas sobre un catálogo de 4 artistas con 9, 6, 6 y 5 obras
- **THEN** cada uno de los 4 artistas ocupa la primera posición en una fracción de los casos próxima a un cuarto, sin que el artista con 9 obras salga favorecido

#### Scenario: Semillas distintas producen órdenes distintos

- **WHEN** se solicita la primera página con dos semillas distintas sobre el mismo catálogo
- **THEN** el orden de los productos difiere entre ambas respuestas

### Requirement: Garantía de paginación bajo semilla

Recorrer todas las páginas de un listado con la **misma** semilla y con el catálogo sin cambios SHALL devolver cada producto exactamente una vez, sin repeticiones ni omisiones. El indicador `hasMore` SHALL calcularse sobre el número total de productos ordenables, no sobre el número de filas efectivamente devueltas en la página.

Los parámetros aceptados (`page`, `limit`, `author_slug`) y la forma de la respuesta (`success`, `products`, `hasMore`, `page`) SHALL permanecer sin cambios.

#### Scenario: Recorrido completo con semilla fija

- **WHEN** un catálogo de 26 obras se recorre en páginas de 12 con la misma semilla
- **THEN** las tres páginas devuelven en conjunto las 26 obras, cada una exactamente una vez

#### Scenario: Rehidratación en una sola petición

- **WHEN** se solicita `page=1` con un `limit` equivalente a varias páginas y una semilla
- **THEN** el resultado es el mismo prefijo de la secuencia que se habría obtenido pidiendo esas páginas de una en una con esa semilla

#### Scenario: Página posterior al final del catálogo

- **WHEN** se solicita una página cuyo desplazamiento supera el número de productos disponibles
- **THEN** la respuesta devuelve una lista vacía y `hasMore` en falso, sin error

### Requirement: Sin semilla, el orden cronológico actual

Cuando la petición **no** incluye `seed`, o cuando el valor recibido no es un entero dentro del rango admitido, el listado SHALL responder con el orden cronológico `created_at DESC, id DESC` vigente hasta ahora, con la paginación por `LIMIT`/`OFFSET` y sin ningún cambio observable.

Una semilla inválida SHALL tratarse como semilla ausente y SHALL NOT producir un error: la rejilla nunca debe quedarse sin contenido por un valor mal formado en la query.

#### Scenario: Consumidor que no manda semilla

- **WHEN** un cliente solicita el listado sin el parámetro `seed`
- **THEN** recibe los productos en el mismo orden que antes de este cambio

#### Scenario: Semilla mal formada

- **WHEN** un cliente solicita el listado con `seed=abc`, `seed=-1` o `seed` por encima del rango admitido
- **THEN** el listado responde con éxito y en orden cronológico, sin error

### Requirement: El filtro por autor desactiva el entrelazado

Cuando la petición incluye `author_slug`, el listado SHALL responder en orden cronológico aunque llegue una semilla. Con un solo artista no hay nada que entrelazar, y la protección SHALL residir en el servidor y no únicamente en que el cliente se abstenga de enviar la semilla.

Las rutas por autor (`/galeria/autor/[authorSlug]`, `/tienda/autor/[authorSlug]`), el filtro de la barra lateral y el filtro móvil SHALL comportarse exactamente igual que antes del cambio: al seleccionar un artista se muestran únicamente sus obras, en el orden de siempre.

#### Scenario: Filtro de artista desde la barra lateral

- **WHEN** el visitante selecciona un artista en el filtro de `/galeria`
- **THEN** la rejilla muestra únicamente las obras de ese artista, en orden cronológico, con el mismo comportamiento que antes del cambio

#### Scenario: Semilla junto a filtro de autor

- **WHEN** una petición incluye a la vez `author_slug` y `seed`
- **THEN** la respuesta se ordena cronológicamente y la semilla se ignora

### Requirement: El orden se calcula fuera de SQL, en una función pura y comprobable

El entrelazado SHALL implementarse como una función pura de la aplicación que recibe la agrupación de identificadores por artista y una semilla, y devuelve la secuencia ordenada. SHALL NOT implementarse mediante expresiones aritméticas de aleatorización dentro de la sentencia SQL.

SQLite no dispone de función de hash ni de operador XOR, de modo que el único mezclador expresable en SQL es el multiplicativo `(x · semilla) mod p`, cuya permutación inducida sobre un conjunto pequeño de identificadores no es uniforme y sesgaría precisamente el reparto de la primera posición, de forma invisible. Además, una invariante como «dos contiguos no son del mismo artista» sólo es comprobable de forma exhaustiva sobre una función pura.

La ordenación SHALL cubrirse con tests automáticos en `api/tests/` que verifiquen, como mínimo: determinismo, que la salida es una permutación exacta de la entrada, la invariante de no contigüidad, el reparto de la primera posición sobre muchas semillas y la ausencia de bandas verticales.

Esos tests SHALL barrer un abanico de repartos —de un artista a cincuenta, de obra repartida a un artista que copa el catálogo— y no únicamente el reparto vigente. La comprobación de las garantías duras sobre todo el abanico es lo que sostiene que el algoritmo sirve para la galería que hay hoy y para la que habrá: fue ese barrido, y no el reparto real, el que descubrió que al reducirse la ronda a dos participantes se reutilizaba el orden de la ronda anterior —que ya contenía artistas agotados— y la secuencia dejaba de ser una permutación del catálogo.

#### Scenario: La salida es una permutación de la entrada

- **WHEN** se entrelaza una agrupación cualquiera con una semilla cualquiera
- **THEN** la secuencia devuelta contiene exactamente los mismos identificadores que la entrada, cada uno una sola vez

#### Scenario: Reproducibilidad entre procesos

- **WHEN** la misma agrupación y la misma semilla se entrelazan en dos ejecuciones distintas del proceso
- **THEN** ambas producen la misma secuencia

### Requirement: Origen de los datos a ordenar y su caducidad

El conjunto de productos ordenables SHALL obtenerse con los mismos criterios de visibilidad que el listado cronológico (`visible`, no vendido, `status = 'approved'`, no retirado, no reservado para subasta ni para sorteo) y SHALL poder cachearse en memoria del proceso durante un intervalo breve, ya que **no depende de la semilla**.

La consulta que lo obtiene SHALL llevar un orden determinista, de modo que un catálogo que no ha cambiado produzca una agrupación idéntica al reconstruirse y, por tanto, la misma semilla siga produciendo la misma secuencia después de que la caché caduque.

Los productos de la página solicitada SHALL rehidratarse desde la base de datos **reaplicando los criterios de visibilidad**, de modo que un producto que haya dejado de ser publicable después de construirse la agrupación no llegue nunca a mostrarse.

La caducidad SHALL ser por tiempo. El sistema SHALL NOT invalidar la agrupación desde los caminos de escritura que cambian la visibilidad de un producto: son muchos y dispersos, olvidar uno sería silencioso, y la consecuencia de olvidarlo es peor que la de esperar a que caduque.

#### Scenario: Obra vendida mientras la agrupación sigue vigente

- **WHEN** una obra se vende justo después de construirse la agrupación y un visitante pide la página que la contenía
- **THEN** esa obra no aparece en la respuesta, la página devuelve un producto menos y `hasMore` sigue siendo correcto

#### Scenario: Obra recién aprobada

- **WHEN** el administrador aprueba una obra nueva
- **THEN** la obra aparece en el listado en cuanto caduca la agrupación vigente, sin necesidad de reiniciar el proceso

#### Scenario: Reconstrucción sin cambios en el catálogo

- **WHEN** la agrupación caduca y se reconstruye sin que el catálogo haya cambiado
- **THEN** una petición posterior con la misma semilla devuelve la misma secuencia que antes de la caducidad

#### Scenario: Peticiones concurrentes con la agrupación caducada

- **WHEN** varias peticiones llegan a la vez con la agrupación caducada
- **THEN** el sistema realiza una única consulta para reconstruirla y todas las peticiones la comparten
