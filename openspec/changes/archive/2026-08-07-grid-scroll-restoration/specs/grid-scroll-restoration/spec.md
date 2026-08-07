## ADDED Requirements

### Requirement: Instantánea del grid al abrir el detalle de un producto

Los grids de producto con scroll infinito (`/galeria`, `/tienda`, `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]`) SHALL guardar una instantánea de su estado de navegación cuando el usuario abre el detalle de un producto desde el grid. La instantánea SHALL contener el número de páginas cargadas, el identificador del producto pulsado y el desplazamiento vertical de la página en ese instante, y SHALL quedar asociada a la entrada del historial del navegador correspondiente a ese grid.

La instantánea SHALL almacenarse en `sessionStorage`, de modo que no sobreviva al cierre de la pestaña ni se comparta entre pestañas.

#### Scenario: El usuario pulsa una obra tras hacer scroll

- **WHEN** el usuario ha cargado 4 páginas del grid de `/galeria`, ha desplazado la página y pulsa la obra con id 87
- **THEN** el sistema guarda una instantánea con 4 páginas, el id 87 y el desplazamiento vertical actual, asociada a la entrada de historial de `/galeria`

#### Scenario: Cada grid guarda su propia instantánea

- **WHEN** el usuario abre un producto desde `/tienda` y después abre otro desde `/galeria/autor/ana-lopez`
- **THEN** cada grid conserva su instantánea de forma independiente, sin que una sobrescriba a la otra

#### Scenario: Apertura en una pestaña nueva

- **WHEN** el usuario abre un producto del grid en una pestaña nueva (clic central, o clic con la tecla modificadora pulsada)
- **THEN** el sistema no guarda ninguna instantánea, porque el grid de la pestaña actual no cambia de página

### Requirement: Restauración al volver atrás desde el detalle

Al volver a un grid mediante navegación de historial (botón atrás o adelante) hacia una entrada que tiene instantánea, el grid SHALL recargar todas las páginas que estaban cargadas y SHALL situar el producto pulsado aproximadamente en el centro del área visible. El desplazamiento SHALL ejecutarse de forma instantánea, sin animación, y SHALL producirse antes de que el grid sea visible para el usuario, de modo que no se perciba un salto desde la parte superior.

La restauración SHALL consumir la instantánea: tras aplicarse, esa instantánea deja de estar disponible para restauraciones posteriores.

#### Scenario: Vuelta atrás con varias páginas cargadas

- **WHEN** el usuario vuelve atrás desde el detalle de la obra 87 al grid de `/galeria`, donde había 4 páginas cargadas
- **THEN** el grid muestra las 48 obras que había cargadas y la obra 87 queda aproximadamente centrada verticalmente en pantalla

#### Scenario: Una sola petición para rehidratar el grid

- **WHEN** el grid restaura 4 páginas de 12 productos
- **THEN** el sistema realiza una única petición al listado en lugar de 4 peticiones sucesivas

#### Scenario: El scroll infinito continúa desde donde estaba

- **WHEN** tras la restauración de 4 páginas el usuario sigue bajando hasta el final del grid
- **THEN** el sistema carga la página 5 y añade sus productos al final, sin repetir ninguno de los ya mostrados

#### Scenario: Recarga de la página tras restaurar

- **WHEN** el usuario recarga el grid con F5 después de haber vuelto atrás
- **THEN** el grid arranca desde la página 1 y en la parte superior, porque la instantánea ya fue consumida

### Requirement: La restauración se limita a la navegación de historial

El grid SHALL restaurar la posición únicamente cuando la navegación devuelve al usuario a la misma entrada del historial que generó la instantánea. Cualquier otra entrada al grid —enlace del menú, enlace externo, recarga, o cambio del filtro de autor— SHALL cargar la primera página y situar la página en la parte superior, con el comportamiento actual sin cambios.

#### Scenario: Entrada desde el menú de navegación

- **WHEN** el usuario, que antes había explorado y abierto una obra, entra en `/galeria` desde el enlace del menú
- **THEN** el grid muestra la primera página desde la parte superior y no aplica ninguna restauración

#### Scenario: Cambio de filtro de autor

- **WHEN** el usuario está en `/galeria` con posición restaurada y filtra por un autor
- **THEN** el grid carga la primera página del autor y sitúa la página en la parte superior

#### Scenario: Navegación hacia adelante a la misma entrada

- **WHEN** el usuario vuelve atrás al grid y después pulsa el botón adelante y de nuevo el botón atrás
- **THEN** el grid vuelve a mostrarse desde la primera página y en la parte superior, sin restauración, porque la instantánea ya se consumió

### Requirement: Límite de profundidad de la restauración

La restauración SHALL limitarse a un máximo de 120 productos (10 páginas de 12). Si la instantánea registra más páginas, el sistema SHALL restaurar solo hasta el límite.

#### Scenario: Instantánea por encima del límite

- **WHEN** el usuario había cargado 14 páginas y vuelve atrás al grid
- **THEN** el sistema restaura 120 productos y no solicita más en la petición de restauración

#### Scenario: El producto pulsado queda fuera del límite

- **WHEN** el producto pulsado ocupaba la posición 160 del listado y por tanto no está entre los 120 restaurados
- **THEN** el sistema aplica el desplazamiento guardado en píxeles en lugar de centrar el producto

### Requirement: Degradación segura de la restauración

La restauración SHALL degradar sin errores visibles cuando no puede completarse. Si el producto pulsado ya no aparece en el listado restaurado, el sistema SHALL aplicar el desplazamiento vertical guardado. Si la petición de restauración falla, si `sessionStorage` no está disponible o si la instantánea está corrupta o caducada, el grid SHALL comportarse como una carga normal: primera página y posición superior.

Una instantánea SHALL considerarse caducada pasados 30 minutos desde su creación.

#### Scenario: La obra pulsada ya no está publicada

- **WHEN** el usuario vuelve atrás y la obra 87 ha sido vendida y retirada del listado
- **THEN** el grid restaura las páginas y aplica el desplazamiento vertical guardado, sin mostrar ningún error

#### Scenario: Falla la petición de restauración

- **WHEN** la petición que rehidrata las páginas devuelve un error
- **THEN** el grid muestra su mensaje de error habitual y no queda bloqueado en el estado de carga

#### Scenario: sessionStorage no disponible

- **WHEN** el navegador bloquea el acceso a `sessionStorage`
- **THEN** el grid funciona con normalidad, sin restauración y sin errores en consola

#### Scenario: Instantánea caducada

- **WHEN** el usuario vuelve atrás al grid más de 30 minutos después de haber abierto el detalle
- **THEN** el grid carga la primera página desde la parte superior
