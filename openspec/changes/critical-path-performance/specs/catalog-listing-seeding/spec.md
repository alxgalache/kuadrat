## ADDED Requirements

### Requirement: El servidor siembra la primera página completa del catálogo

`client/lib/serverApi.js` SHALL devolver, para la primera página sin filtro de autor de `art` y `others`, tanto los productos como `hasMore`. Ante cualquier fallo SHALL devolver una siembra vacía (`products: []`, `hasMore: false`) sin lanzar, porque `/galeria` y `/tienda` se prerrenderizan en `docker build`.

`client/app/galeria/page.js` y `client/app/tienda/page.js` SHALL pasar al componente de cliente los productos, la semilla de ordenación y `hasMore`.

#### Scenario: La API responde durante la compilación
- **WHEN** se compila `/galeria` con la API disponible
- **THEN** el HTML contiene la rejilla de la primera página
- **AND** el cliente recibe la semilla y `hasMore` con los que se construyó

#### Scenario: La API no responde durante la compilación
- **WHEN** la API falla mientras se prerrenderiza `/galeria`
- **THEN** la compilación termina sin error
- **AND** la página se comporta como antes del cambio: el cliente pide la primera página al montar

### Requirement: Un listado sembrado no repite al montar la petición que ya está en el HTML

`client/hooks/useGalleryProducts.js` NO SHALL pedir la primera página a la API al montar cuando recibe una siembra completa (productos no vacíos y `hasMore` conocido) y no hay instantánea de restauración de scroll. En ese caso SHALL adoptar la semilla sembrada para las páginas siguientes y comunicarla a la restauración de scroll.

Con instantánea de restauración, o sin siembra completa, SHALL comportarse exactamente como antes del cambio.

#### Scenario: Primera visita a la galería
- **WHEN** se carga `/galeria` en un navegador sin instantánea de restauración
- **THEN** no se hace ninguna petición a `/api/art` durante la carga
- **AND** la rejilla que se ve es la del HTML, sin sustituirse tras hidratar

#### Scenario: Desplazamiento hasta el final de la primera página
- **WHEN** el visitante llega al final de la rejilla sembrada y `hasMore` es verdadero
- **THEN** se pide la página 2 con la misma semilla que construyó la página 1

#### Scenario: Vuelta atrás desde una ficha
- **WHEN** el visitante vuelve a `/galeria` desde una ficha con una instantánea de N páginas
- **THEN** se rehidratan las N páginas en una sola petición, con la semilla de la instantánea, como antes del cambio
- **AND** no se pide ninguna otra página en paralelo a esa rehidratación: con instantánea, `hasMore` arranca en falso aunque la siembra lo traiga

#### Scenario: Catálogo de una sola página
- **WHEN** la siembra trae `hasMore` en falso
- **THEN** no se hace ninguna petición al llegar al final y el pie de rejilla indica que no hay más obras

### Requirement: La lista de autores del filtro viaja sembrada

`/galeria`, `/tienda`, `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]` SHALL obtener en el servidor la lista de autores visibles de su categoría con `fetchAuthors(category)` y pasarla al cliente. `client/hooks/useGalleryAuthors.js` NO SHALL pedirla a la API cuando la recibe no vacía.

#### Scenario: Filtro de autores en móvil
- **WHEN** se carga `/galeria` a 412 px de ancho
- **THEN** el filtro de autores viene completo en el HTML
- **AND** no se hace ninguna petición a `/api/users/authors` durante la carga
- **AND** el CLS de la página es 0

#### Scenario: Siembra de autores vacía
- **WHEN** la lista de autores sembrada está vacía por un fallo de la API en el servidor
- **THEN** el cliente la pide al montar, como antes del cambio

### Requirement: La frescura del listado es la del ISR

La primera página de `/galeria` y `/tienda` SHALL tener la frescura de la revalidación de la ruta (`revalidate = 300`), la misma que las fichas de producto. Las páginas siguientes SHALL pedirse en vivo; las repeticiones que produzca un cambio del catálogo entre ambas SHALL seguir filtrándose por la regla de concatenación sin duplicados de `grid-infinite-scroll`.

#### Scenario: Obra vendida tras la última revalidación
- **WHEN** una obra de la primera página se vende después de que la ruta se revalidara
- **THEN** la galería puede mostrarla como disponible hasta la siguiente revalidación, igual que su ficha
- **AND** la compra sigue rechazándose en el servidor
