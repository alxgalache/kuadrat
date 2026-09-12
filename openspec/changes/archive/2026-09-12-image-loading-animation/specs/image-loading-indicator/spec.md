## ADDED Requirements

### Requirement: Indicador de carga sobre el marcador de posición de imagen

Toda superficie del escaparate que pinte una imagen de producto o de evento dentro de una caja con fondo `bg-gray-200` SHALL mostrar un indicador de carga animado dentro de esa misma caja mientras la imagen no esté pintada. El indicador SHALL pintarse por debajo del elemento `<Image>` y SHALL desmontarse en cuanto la imagen esté disponible.

El indicador NO SHALL alterar las dimensiones, el `aspect-ratio` ni la posición de la caja que lo contiene: ocupa el hueco que ya estaba reservado.

#### Scenario: Imagen que tarda en llegar

- **WHEN** una superficie monta una imagen de producto o evento que no está en caché
- **THEN** la caja `bg-gray-200` SHALL mostrar el indicador animado
- **THEN** la caja SHALL conservar exactamente las mismas dimensiones que tenía sin indicador

#### Scenario: La imagen termina de llegar

- **WHEN** la imagen queda pintada
- **THEN** el indicador SHALL desaparecer
- **THEN** el indicador SHALL quedar desmontado del DOM, no meramente oculto

#### Scenario: Producto sin imagen

- **WHEN** una superficie no tiene ningún `basename` que pintar y no se monta ningún `<Image>`
- **THEN** la caja SHALL mostrar el gris estático sin indicador alguno

### Requirement: Aparición retardada

El indicador SHALL aparecer únicamente cuando la imagen siga sin estar disponible transcurrido un retardo configurable desde el montaje. El retardo SHALL estar declarado como constante con nombre en `client/lib/constants.js`, con un valor por defecto de 200 ms.

#### Scenario: Imagen servida desde caché

- **WHEN** la imagen se pinta antes de cumplirse el retardo
- **THEN** el indicador NO SHALL llegar a mostrarse en ningún momento
- **THEN** no SHALL producirse ningún parpadeo visible en la caja

#### Scenario: Navegación repetida por el catálogo

- **WHEN** el visitante vuelve atrás a una rejilla cuyas imágenes ya visitó
- **THEN** ninguna celda SHALL mostrar indicador

### Requirement: Detección de carga resistente a la caché

La detección de «imagen ya disponible» NO SHALL depender exclusivamente del evento `onLoad`. La implementación SHALL comprobar además, de forma imperativa en el montaje, el estado real del elemento `<img>` subyacente (`complete` junto a `naturalWidth > 0`).

#### Scenario: La imagen ya estaba completa antes de adjuntar el manejador

- **WHEN** la imagen está completa en caché antes de que React adjunte `onLoad`, de modo que el evento nunca se dispara
- **THEN** el indicador NO SHALL mostrarse
- **THEN** el indicador NO SHALL quedar visible de forma indefinida sobre una imagen ya pintada

#### Scenario: Elemento completo pero sin píxeles

- **WHEN** el elemento `<img>` reporta `complete: true` con `naturalWidth` igual a 0, que es lo que reporta una imagen fallida
- **THEN** la comprobación NO SHALL interpretarlo como imagen cargada con éxito

### Requirement: El fallo de carga apaga el indicador

Cuando la carga de una imagen falle, el indicador SHALL retirarse y la caja SHALL quedar con su gris estático. El indicador NO SHALL seguir animando sobre una imagen que no va a llegar.

#### Scenario: Imagen que responde 404 o cuya descarga falla

- **WHEN** el elemento `<Image>` emite `onError`
- **THEN** el indicador SHALL desmontarse
- **THEN** la caja SHALL mostrar el marcador gris estático

### Requirement: Compatibilidad con el renderizado en servidor

El estado inicial SHALL ser «sin indicador», y la activación del retardo SHALL ocurrir en un efecto de cliente. El HTML emitido por el servidor NO SHALL contener marcado del indicador.

#### Scenario: Rejilla renderizada en servidor

- **WHEN** una ruta que renderiza su rejilla en el servidor (ficha de autor, ficha de subasta, ficha de sorteo) se sirve al navegador
- **THEN** el HTML servido NO SHALL incluir el indicador
- **THEN** la hidratación NO SHALL producir ninguna advertencia de desajuste

### Requirement: Respeto de `prefers-reduced-motion`

Con `prefers-reduced-motion: reduce` activo, el indicador NO SHALL animarse. La degradación SHALL resolverse en CSS mediante una regla `@media`, no consultando `matchMedia` desde JavaScript.

#### Scenario: Visitante con movimiento reducido

- **WHEN** el sistema del visitante declara `prefers-reduced-motion: reduce`
- **THEN** el indicador SHALL presentarse como un marcador estático de contraste suave
- **THEN** NO SHALL ejecutarse ninguna animación en bucle

### Requirement: El indicador es decorativo para la accesibilidad

El indicador SHALL llevar `aria-hidden="true"`. NO SHALL declarar `role="status"`, NO SHALL anunciar texto a los lectores de pantalla y NO SHALL incluir texto visible.

#### Scenario: Rejilla completa con lector de pantalla

- **WHEN** un lector de pantalla recorre una rejilla cuyas imágenes están cargando
- **THEN** SHALL anunciar únicamente el `alt` de cada imagen
- **THEN** NO SHALL anunciar ningún mensaje de carga por celda

### Requirement: Coste de pintado acotado

La superficie que la animación repinta SHALL quedar acotada a la caja del propio indicador y NO SHALL alcanzar nunca la caja de la imagen. En consecuencia, NO SHALL animarse `background-position` sobre un degradado que cubra el hueco, ni `width`, `height`, `top` o `left` de ningún elemento a tamaño de caja. Cada indicador SHALL animar como máximo tres elementos.

La animación elegida (un anillo indeterminado) transforma el SVG con `transform` y anima el trazo del círculo con `stroke-dasharray`/`stroke-dashoffset`. El trazo es la excepción admitida y es lo que constituye el gesto: repinta los 46 px del anillo, no la caja, que es lo que esta regla protege.

#### Scenario: Rejilla llena en un dispositivo móvil

- **WHEN** una rejilla monta su tanda completa de celdas con todas las imágenes pendientes
- **THEN** ninguna animación SHALL repintar un área mayor que la del propio indicador
- **THEN** ninguna animación SHALL seguir ejecutándose tras cargar su imagen

### Requirement: Tamaño acotado, no proporcional a la caja

El indicador SHALL tener un tamaño acotado entre 24 y 46 px con independencia del tamaño de la caja que lo contiene. NO SHALL escalar proporcionalmente al hueco.

#### Scenario: La misma imagen en la rejilla y en la ficha

- **WHEN** el indicador se muestra en una celda de rejilla de 156 px y en la caja de ficha de 480 px
- **THEN** SHALL medir aproximadamente lo mismo en las dos
- **THEN** NO SHALL ocupar en la ficha una fracción del hueco comparable a la que ocupa en la celda

### Requirement: Nada de indicadores sobre imágenes que no se han pedido

El retardo SHALL empezar a contar cuando el navegador esté a punto de solicitar la imagen, no cuando se monta la superficie. Una imagen con `loading="lazy"` lejos del área visible todavía no ha iniciado su descarga, y el indicador NO SHALL mostrarse sobre ella.

#### Scenario: Celdas por debajo de la línea de flotación

- **WHEN** una rejilla monta celdas cuyas imágenes están lejos del área visible y no han iniciado la descarga
- **THEN** esas celdas NO SHALL mostrar indicador
- **THEN** NO SHALL quedar ninguna animación en marcha sobre ellas de forma indefinida

#### Scenario: La celda entra en pantalla al desplazarse

- **WHEN** el visitante desplaza la página hasta acercar una de esas celdas al área visible
- **THEN** SHALL empezar a contar el retardo para esa celda
- **THEN** SHALL mostrarse el indicador si la imagen no ha llegado al cumplirse

### Requirement: Cobertura de superficies

El indicador SHALL estar presente en todas las superficies públicas que pintan una imagen de producto o de evento: la rejilla de productos (galería, tienda y fichas de autor), el carrusel de la ficha de producto, el visor de imagen completa, el mosaico de subasta, la tarjeta de sorteo, las fichas de subasta y de sorteo, el listado de eventos en directo y la ficha de evento en directo.

La lógica de estado SHALL residir en un único hook compartido y la presentación en un único componente compartido. NO SHALL duplicarse la detección de carga en cada superficie.

#### Scenario: Mosaico de subasta con varias imágenes

- **WHEN** el mosaico pinta dos o más celdas de imagen
- **THEN** cada celda SHALL gestionar su propio indicador
- **THEN** una celda ya cargada NO SHALL seguir mostrando indicador porque otra siga pendiente

#### Scenario: Cambio de imagen en el carrusel

- **WHEN** el visitante avanza a una imagen del carrusel que aún no se ha descargado
- **THEN** la caja SHALL volver a evaluar el estado de carga para esa imagen
- **THEN** SHALL mostrar el indicador si la nueva imagen supera el retardo

#### Scenario: Imagen bajo el degradado del listado de eventos

- **WHEN** el listado de `/live` pinta la imagen de un evento con su degradado superpuesto
- **THEN** el indicador SHALL quedar por debajo del degradado, no encima

#### Scenario: Miniaturas y iconos

- **WHEN** la superficie es una miniatura de variación de producto o un icono de insignia de evento
- **THEN** NO SHALL mostrarse indicador de carga

### Requirement: Muestrario de selección, temporal y aislado

Antes de implementar el indicador en las superficies SHALL existir una página de muestrario con las propuestas de animación, para que el usuario elija una. La página SHALL declarar `robots: { index: false }`, NO SHALL figurar en `client/app/sitemap.js`, NO SHALL ser importada por ningún componente de la aplicación, y SHALL eliminarse por completo antes de archivar el cambio.

#### Scenario: Revisión del muestrario

- **WHEN** el usuario abre la página de muestrario
- **THEN** SHALL ver las propuestas numeradas y con nombre
- **THEN** cada propuesta SHALL mostrarse a la vez al tamaño de celda de rejilla y al tamaño de la ficha de detalle
- **THEN** SHALL disponer de un control para relanzar todas las animaciones y de un conmutador que simule `prefers-reduced-motion`

#### Scenario: Selección pendiente

- **WHEN** el usuario todavía no ha elegido una propuesta
- **THEN** NO SHALL modificarse ninguna de las superficies del escaparate

#### Scenario: Cierre del cambio

- **WHEN** el indicador ya está implantado y verificado
- **THEN** la ruta del muestrario SHALL haber sido eliminada del repositorio
- **THEN** NO SHALL quedar ninguna referencia a ella en el código de la aplicación
