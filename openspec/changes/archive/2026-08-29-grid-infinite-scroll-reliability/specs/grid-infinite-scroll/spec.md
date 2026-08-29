## ADDED Requirements

### Requirement: La carga incremental no depende de medir el viewport

Las rejillas de producto con carga incremental (`/galeria`, `/tienda`, `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]`) SHALL disparar la carga de la siguiente página mediante un `IntersectionObserver` con `root: null` sobre un elemento centinela situado al final de la rejilla, con un margen de anticipación configurable en `client/lib/constants.js`.

La decisión de cargar SHALL NOT depender de comparar `window.innerHeight`, `window.scrollY` o `document.documentElement.scrollHeight` entre sí. Estas magnitudes se miden en marcos de referencia distintos en los navegadores móviles —el viewport visual encoge cuando la barra del navegador está a la vista, mientras que el recorrido de scroll se calcula contra el viewport de maquetación— y su comparación con tolerancia cero es inalcanzable mientras esa barra esté presente.

#### Scenario: La barra del navegador está visible al llegar al final

- **WHEN** un visitante en un navegador móvil con barra dinámica visible (Samsung Internet, navegador integrado de Instagram, Chrome Android) desplaza la rejilla hasta el final
- **THEN** el sistema carga la siguiente página de productos, con independencia de que el viewport visual sea menor que el de maquetación

#### Scenario: Alturas fraccionarias por subpíxel

- **WHEN** la altura total del documento no es un número entero de píxeles CSS, como ocurre en la rejilla de dos columnas sobre pantallas cuyo ancho no es divisible de forma exacta
- **THEN** la carga incremental se dispara igualmente, porque no interviene ninguna comparación de alturas

#### Scenario: Anticipación

- **WHEN** el centinela entra en el margen de anticipación por debajo del área visible
- **THEN** el sistema inicia la carga antes de que el visitante alcance el final de la rejilla

### Requirement: El observador se re-arma tras cada carga

Tras completarse una carga incremental, el sistema SHALL volver a evaluar el estado de intersección del centinela y SHALL iniciar otra carga si sigue dentro del margen de anticipación y quedan productos por cargar.

Un `IntersectionObserver` sólo notifica cambios de estado. Sin re-armado explícito, un centinela que permanece interseccionando después de añadir productos no produce ninguna notificación nueva y la carga incremental queda detenida de forma indistinguible del fallo que este cambio corrige.

#### Scenario: El centinela sigue visible tras cargar

- **WHEN** tras añadir una página de productos el centinela continúa dentro del margen de anticipación, por ejemplo en una pantalla alta o en una ficha de artista con pocas obras
- **THEN** el sistema carga la página siguiente sin esperar a ninguna acción del visitante

#### Scenario: El centinela sale del margen

- **WHEN** tras añadir una página el centinela queda por debajo del margen de anticipación
- **THEN** el sistema no realiza ninguna carga adicional hasta que el visitante vuelva a desplazarse

### Requirement: Disparadores redundantes con un único punto de entrada

El sistema SHALL disponer de tres vías independientes para solicitar la siguiente página —el observador de intersección, un vigía de los eventos `scroll` y `resize` con umbral de anticipación, y una acción manual del visitante— y las tres SHALL converger en un único punto de entrada protegido por un cerrojo.

El cerrojo SHALL apoyarse en una referencia mutable actualizada de forma síncrona, no en el estado de React, cuyo valor no está disponible para los manejadores hasta el siguiente renderizado.

`resize` SHALL formar parte del vigía: es el evento que emiten los navegadores móviles cuando su barra se oculta o reaparece, es decir, el momento en que la situación puede haber cambiado sin que se haya producido ningún desplazamiento.

#### Scenario: Dos disparos simultáneos

- **WHEN** dos disparadores solicitan la siguiente página antes de que el primero haya terminado
- **THEN** el sistema realiza una única petición y añade los productos una sola vez

#### Scenario: Sin soporte de IntersectionObserver

- **WHEN** el navegador no expone `IntersectionObserver`
- **THEN** el vigía de `scroll` y `resize` mantiene la carga incremental operativa

#### Scenario: La barra del navegador reaparece estando al final

- **WHEN** el visitante está al final de la rejilla y la barra del navegador se oculta o reaparece, provocando un evento `resize`
- **THEN** el sistema vuelve a evaluar si procede cargar la siguiente página

### Requirement: Garantía manual de acceso al resto del catálogo

Mientras queden productos por cargar y no haya una carga en curso, la rejilla SHALL mostrar un control manual que carga la siguiente página al ser activado. El control SHALL estar presente siempre, no sólo cuando se detecte un fallo de la carga automática.

El control SHALL ser accesible mediante teclado y SHALL estar expuesto a los productos de apoyo, de modo que exista una forma de recorrer el catálogo completo sin realizar ningún gesto de desplazamiento.

#### Scenario: La carga automática no se produce

- **WHEN** por cualquier motivo ninguno de los disparadores automáticos solicita la siguiente página
- **THEN** el visitante puede cargar el resto del catálogo activando el control manual

#### Scenario: Recorrido con teclado

- **WHEN** una persona navega la rejilla únicamente con teclado
- **THEN** puede alcanzar y activar el control manual, y con ello acceder a los productos más allá de la primera página

#### Scenario: No quedan productos

- **WHEN** la última respuesta indica que no hay más productos
- **THEN** el control manual no se muestra

### Requirement: Un fallo de carga incremental no destruye la rejilla

Un fallo al cargar una página posterior a la primera SHALL mostrarse como un aviso en línea bajo la rejilla, junto con una acción de reintento, y SHALL conservar visibles todos los productos ya cargados.

El estado de error de la carga incremental SHALL ser independiente del error de la carga inicial. Únicamente el error de la carga inicial —cuando no hay ningún producto que mostrar— SHALL sustituir el contenido de la página.

#### Scenario: Corte de red al cargar la tercera página

- **WHEN** el visitante tiene 24 obras cargadas y la petición de la página 3 falla
- **THEN** las 24 obras siguen visibles y bajo ellas aparece un aviso con la opción de reintentar

#### Scenario: Reintento con éxito

- **WHEN** el visitante activa el reintento tras un fallo y la petición tiene éxito
- **THEN** los productos se añaden al final de la rejilla y el aviso desaparece

#### Scenario: Fallo de la carga inicial

- **WHEN** falla la primera carga y no hay ningún producto que mostrar
- **THEN** se mantiene la pantalla de error a página completa actual

### Requirement: Un fallo desarma la carga automática

Tras un fallo de carga incremental el sistema SHALL desarmar los disparadores automáticos, y SHALL rearmarlos únicamente ante una acción explícita del visitante: activar el reintento, o un nuevo desplazamiento que vuelva a cruzar el umbral de anticipación.

Sin esta regla, el re-armado tras cada carga convierte un fallo persistente —una respuesta 429 del limitador de peticiones, por ejemplo— en un bucle de peticiones desde el navegador del visitante.

El sistema SHALL aplicar el mismo desarme cuando una respuesta indique que quedan productos pero no aporte ningún producto nuevo tras eliminar duplicados, situación que produce el mismo bucle sin mediar ningún error.

#### Scenario: Fallo persistente

- **WHEN** la petición de la siguiente página falla de forma repetida
- **THEN** el sistema no reintenta por su cuenta y espera una acción del visitante

#### Scenario: Página sin aportación

- **WHEN** una respuesta indica `hasMore` verdadero pero todos sus productos ya estaban en la rejilla
- **THEN** el sistema no encadena otra carga automática

### Requirement: Estado del pie de rejilla idéntico en las cuatro rutas

Las cuatro rutas con carga incremental SHALL renderizar el mismo componente de pie de rejilla, responsable del centinela, del indicador de carga, del control manual y del aviso de error.

Ninguna de las cuatro SHALL implementar por su cuenta ninguno de esos elementos. Hoy `/galeria/autor/[authorSlug]` y `/tienda/autor/[authorSlug]` no muestran indicador de carga alguno, lo que durante una carga en curso resulta indistinguible para el visitante de la ausencia de carga.

#### Scenario: Indicador de carga en una ficha de artista

- **WHEN** una carga incremental está en curso en `/galeria/autor/[authorSlug]`
- **THEN** el visitante ve el mismo indicador de carga que vería en `/galeria`

#### Scenario: Un estado nuevo aparece en las cuatro rutas

- **WHEN** se añade o modifica un estado del pie de rejilla
- **THEN** el cambio surte efecto en las cuatro rutas sin editarlas una por una

### Requirement: Concatenación sin duplicados

Al añadir los productos de una página nueva, el sistema SHALL descartar aquellos cuyo identificador ya esté presente en la rejilla.

#### Scenario: Solape entre páginas consecutivas

- **WHEN** una respuesta contiene productos que ya figuran en la rejilla, por ejemplo porque el catálogo cambió entre dos peticiones
- **THEN** cada producto aparece una sola vez en la rejilla y ninguna clave de React se repite

### Requirement: Medición del uso del control manual

Cada activación del control manual SHALL emitir un evento personalizado de analítica que identifique la rejilla de origen, mediante la cola de Plausible ya presente en el documento y con encadenamiento opcional, de modo que fuera de producción la llamada no tenga efecto.

El evento SHALL NOT incluir ningún dato del visitante ni escribir nada en su equipo.

Esta medición es el único indicador disponible de si la carga automática funciona en los navegadores donde la incidencia no es reproducible: si funciona, el control manual apenas se usa; si falla en algún motor concreto, el desglose por navegador lo revela.

#### Scenario: Activación en producción

- **WHEN** un visitante activa el control manual en `/galeria` en producción
- **THEN** se emite un evento de analítica que identifica esa rejilla, sin cookies ni identificadores persistentes

#### Scenario: Fuera de producción

- **WHEN** se activa el control manual en un entorno donde la analítica no está cargada
- **THEN** la activación carga la página siguiente con normalidad y no se produce ningún error
