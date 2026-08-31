## MODIFIED Requirements

### Requirement: Instantánea del grid al abrir el detalle de un producto

Los grids de producto con scroll infinito (`/galeria`, `/tienda`, `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]`) SHALL guardar una instantánea de su estado de navegación cuando el usuario abre el detalle de un producto desde el grid. La instantánea SHALL contener el número de páginas cargadas, el identificador del producto pulsado, el desplazamiento vertical de la página en ese instante y **la semilla de ordenación con la que se construyó esa rejilla**, y SHALL quedar asociada a la entrada del historial del navegador correspondiente a ese grid.

La semilla SHALL ser opcional en la instantánea. Los grids con filtro de autor no usan semilla, y las instantáneas escritas antes de la introducción de la ordenación entrelazada siguen en `sessionStorage` de los visitantes durante su periodo de validez: una instantánea sin semilla SHALL considerarse válida y SHALL restaurarse con una semilla nueva, no descartarse.

La instantánea SHALL almacenarse en `sessionStorage`, de modo que no sobreviva al cierre de la pestaña ni se comparta entre pestañas.

#### Scenario: El usuario pulsa una obra tras hacer scroll

- **WHEN** el usuario ha cargado 4 páginas del grid de `/galeria`, ha desplazado la página y pulsa la obra con id 87
- **THEN** el sistema guarda una instantánea con 4 páginas, el id 87, el desplazamiento vertical actual y la semilla de ordenación en uso, asociada a la entrada de historial de `/galeria`

#### Scenario: Cada grid guarda su propia instantánea

- **WHEN** el usuario abre un producto desde `/tienda` y después abre otro desde `/galeria/autor/ana-lopez`
- **THEN** cada grid conserva su instantánea de forma independiente, sin que una sobrescriba a la otra

#### Scenario: Apertura en una pestaña nueva

- **WHEN** el usuario abre un producto del grid en una pestaña nueva (clic central, o clic con la tecla modificadora pulsada)
- **THEN** el sistema no guarda ninguna instantánea, porque el grid de la pestaña actual no cambia de página

#### Scenario: Grid con filtro de autor

- **WHEN** el usuario abre un producto desde `/galeria/autor/ana-lopez`, que no usa ordenación entrelazada
- **THEN** el sistema guarda la instantánea sin semilla y la restauración posterior funciona igual que antes del cambio

### Requirement: Restauración al volver atrás desde el detalle

Al volver a un grid mediante navegación de historial (botón atrás o adelante) hacia una entrada que tiene instantánea, el grid SHALL recargar todas las páginas que estaban cargadas **con la semilla de ordenación registrada en esa instantánea** y SHALL situar el producto pulsado aproximadamente en el centro del área visible. El desplazamiento SHALL ejecutarse de forma instantánea, sin animación, y SHALL producirse antes de que el grid sea visible para el usuario, de modo que no se perciba un salto desde la parte superior.

Reutilizar la semilla es lo que hace correcta la restauración cuando la rejilla se ordena al azar: con una semilla nueva se rehidratarían las mismas páginas de un barajado distinto, el producto pulsado ocuparía otra posición —o quedaría fuera de las páginas recargadas— y el sistema caería al desplazamiento guardado, que ya no correspondería a nada.

El scroll infinito posterior a la restauración SHALL continuar con esa misma semilla, de modo que las páginas siguientes pertenezcan al mismo orden que las restauradas.

La restauración SHALL consumir la instantánea: tras aplicarse, esa instantánea deja de estar disponible para restauraciones posteriores.

#### Scenario: Vuelta atrás con varias páginas cargadas

- **WHEN** el usuario vuelve atrás desde el detalle de la obra 87 al grid de `/galeria`, donde había 4 páginas cargadas
- **THEN** el grid muestra las 48 obras que había cargadas, en el mismo orden en que estaban, y la obra 87 queda aproximadamente centrada verticalmente en pantalla

#### Scenario: Una sola petición para rehidratar el grid

- **WHEN** el grid restaura 4 páginas de 12 productos
- **THEN** el sistema realiza una única petición al listado, con la semilla de la instantánea, en lugar de 4 peticiones sucesivas

#### Scenario: El scroll infinito continúa desde donde estaba

- **WHEN** tras la restauración de 4 páginas el usuario sigue bajando hasta el final del grid
- **THEN** el sistema carga la página 5 con la misma semilla y añade sus productos al final, sin repetir ninguno de los ya mostrados

#### Scenario: Recarga de la página tras restaurar

- **WHEN** el usuario recarga el grid con F5 después de haber vuelto atrás
- **THEN** el grid arranca desde la página 1 y en la parte superior, con una semilla nueva y por tanto en otro orden, porque la instantánea ya fue consumida

#### Scenario: Instantánea anterior al cambio, sin semilla

- **WHEN** el usuario vuelve atrás a una entrada cuya instantánea se escribió antes de este cambio y no registra semilla
- **THEN** el grid restaura las páginas guardadas con una semilla nueva y aplica el desplazamiento guardado, sin descartar la instantánea ni mostrar ningún error

## ADDED Requirements

### Requirement: Ciclo de vida de la semilla de ordenación en el cliente

Los grids sin filtro de autor (`/galeria` y `/tienda`) SHALL sortear una semilla de ordenación **nueva en cada carga de la rejilla** y SHALL usar esa misma semilla en todas las peticiones de esa rejilla, incluidas las páginas siguientes del scroll infinito.

El sorteo SHALL ejecutarse dentro de un efecto, **nunca durante el render**. Ambas rutas se prerrenderizan, y un valor aleatorio calculado en el render del servidor no coincidiría con el del cliente: es el fallo de hidratación que ya se corrigió en el vídeo de la portada.

Los grids con filtro de autor SHALL NOT enviar semilla.

#### Scenario: Nueva visita a la galería

- **WHEN** el visitante entra en `/galeria` desde el menú, desde un enlace externo o recargando la página
- **THEN** la rejilla se construye con una semilla nueva y muestra los productos en un orden distinto al de la visita anterior

#### Scenario: Continuidad durante el scroll infinito

- **WHEN** el visitante baja y el grid carga las páginas 2, 3 y 4
- **THEN** las tres peticiones viajan con la misma semilla que la página 1 y ningún producto se repite ni se pierde

#### Scenario: Cambio de filtro de autor y vuelta

- **WHEN** el visitante filtra por un artista y después limpia el filtro para volver a la rejilla completa
- **THEN** la rejilla completa se construye con una semilla nueva

#### Scenario: Sin desajuste de hidratación

- **WHEN** se sirve el HTML prerrenderizado de `/galeria` y el navegador hidrata la página
- **THEN** no se produce ninguna advertencia de desajuste de hidratación, porque la semilla no interviene en el render inicial
