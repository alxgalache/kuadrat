## ADDED Requirements

### Requirement: Ficha de artista en dos columnas

El modal de artista (`AuthorModal`) SHALL presentar la información como una ficha de catálogo de dos columnas en viewports `md` y superiores: una columna de imagen a la izquierda y una columna de contenido textual a la derecha, separadas por un filete divisorio.

La columna de imagen SHALL ocupar entre el 35 % y el 45 % del ancho del panel y toda su altura. La imagen del artista SHALL renderizarse con `object-cover` para llenar la columna sin deformarse.

El panel SHALL tener un ancho máximo de `max-w-4xl` y esquinas redondeadas, y SHALL recortar su contenido (`overflow-hidden`) para que la imagen respete el radio del panel.

#### Scenario: Apertura en escritorio con datos completos

- **WHEN** un visitante abre la ficha de un artista con `profile_img`, `full_name`, `location` y `bio` en un viewport de 1280 px de ancho
- **THEN** el modal SHALL mostrar la imagen del artista a pantalla completa en la columna izquierda
- **AND** SHALL mostrar en la columna derecha el nombre, la ubicación y la biografía
- **AND** SHALL mostrar un filete divisorio entre ambas columnas

#### Scenario: Imagen sin deformación con distintos ratios

- **WHEN** la imagen de perfil del artista es apaisada, cuadrada o vertical
- **THEN** la columna de imagen SHALL recortarla con `object-cover` centrado, sin estirarla ni comprimirla

### Requirement: Dos imágenes de artista según el tamaño de pantalla

La banda apilada de móvil y la columna de escritorio tienen proporciones opuestas y extremas, de modo que una sola fotografía no puede llenar ambas conservando su sujeto. Cada artista SHALL poder tener por tanto **dos imágenes distintas**:

- `profile_img` — la imagen principal, mostrada en viewports `md` y superiores.
- `profile_img_mobile` — una variante de orientación apaisada, mostrada por debajo de `md`.

Cuando `profile_img_mobile` esté vacía, por debajo de `md` SHALL usarse `profile_img`, de modo que los artistas con una sola imagen se comporten exactamente igual que antes de este cambio.

La selección entre ambas SHALL producirse sin parpadeo de la variante incorrecta al abrir la ficha.

#### Scenario: Artista con las dos imágenes

- **WHEN** un visitante abre la ficha de un artista que tiene `profile_img` y `profile_img_mobile` en un viewport por debajo de `md`
- **THEN** SHALL mostrarse `profile_img_mobile`

#### Scenario: La imagen principal se reserva a pantallas grandes

- **WHEN** el mismo visitante abre esa ficha en un viewport `md` o superior
- **THEN** SHALL mostrarse `profile_img`

#### Scenario: Artista con una sola imagen

- **WHEN** un visitante abre la ficha de un artista cuyo `profile_img_mobile` está vacío
- **THEN** SHALL mostrarse `profile_img` en todos los tamaños de pantalla

### Requirement: Opción de ocultar la imagen en pantallas pequeñas

Cada artista SHALL disponer de un indicador `hide_profile_img_mobile` que, cuando esté activo, suprima por completo la columna de imagen por debajo de `md`, cualquiera que sea la variante que correspondería mostrar. La ficha SHALL abrirse entonces directamente por el nombre del artista.

El indicador no SHALL afectar a los viewports `md` y superiores, donde la imagen se sigue mostrando con normalidad.

Su valor por defecto SHALL ser desactivado, de modo que los artistas existentes conserven su comportamiento actual.

#### Scenario: Indicador activo en pantalla pequeña

- **WHEN** un visitante abre la ficha de un artista con `hide_profile_img_mobile` activo en un viewport por debajo de `md`
- **THEN** no SHALL mostrarse ninguna imagen ni ningún espacio reservado para ella
- **AND** la ficha SHALL comenzar por el nombre del artista

#### Scenario: El indicador no afecta a escritorio

- **WHEN** ese mismo artista se abre en un viewport `md` o superior
- **THEN** SHALL mostrarse su imagen con normalidad

#### Scenario: Artista sin imagen y con el indicador activo

- **WHEN** un artista sin `profile_img` tiene el indicador activo y su ficha se abre en escritorio
- **THEN** SHALL mostrarse el marcador de iniciales, como cualquier otro artista sin imagen

### Requirement: Gestión de ambas imágenes desde el formulario de artista

Los formularios de creación y de edición de artista del panel de administración SHALL permitir al administrador gestionar las dos imágenes y el indicador:

- Un campo "Imagen para móvil", junto al campo de avatar ya existente, con las mismas restricciones de formato y tamaño (PNG, JPG o WEBP, hasta 10 MB) y su propia vista previa.
- Una casilla "No mostrar imagen en versión móvil" junto a ese campo.

Sustituir una de las dos imágenes no SHALL eliminar ni alterar la otra. En el formulario de edición, ambos campos SHALL mostrar la imagen ya almacenada, y la casilla SHALL reflejar el valor guardado.

#### Scenario: Subida de la imagen para móvil

- **WHEN** un administrador sube una imagen en el campo "Imagen para móvil" y guarda
- **THEN** la imagen SHALL almacenarse en `profile_img_mobile`
- **AND** `profile_img` SHALL permanecer sin cambios

#### Scenario: Sustitución del avatar principal

- **WHEN** un administrador sustituye el avatar de un artista que ya tiene imagen para móvil
- **THEN** SHALL actualizarse únicamente `profile_img`
- **AND** el fichero de `profile_img_mobile` SHALL conservarse

#### Scenario: Persistencia de la casilla

- **WHEN** un administrador marca "No mostrar imagen en versión móvil" y guarda
- **THEN** el valor SHALL persistirse
- **AND** SHALL aparecer marcada al volver a abrir el formulario de edición

#### Scenario: Formato no admitido

- **WHEN** un administrador intenta subir un archivo que no es PNG, JPG o WEBP en el campo de imagen para móvil
- **THEN** SHALL mostrarse un mensaje de error en es-ES y el archivo no SHALL aceptarse

### Requirement: Imagen persistente durante el scroll de la biografía

En viewports `md` y superiores, la columna de imagen SHALL permanecer visible mientras el visitante recorre la biografía: el scroll SHALL producirse dentro del contenedor de contenido, no en el panel completo.

#### Scenario: Biografía extensa en escritorio

- **WHEN** un visitante abre la ficha de un artista cuya biografía excede la altura disponible y desplaza el texto hacia abajo
- **THEN** la biografía SHALL desplazarse dentro de su propio contenedor
- **AND** la imagen del artista SHALL permanecer completamente visible en la columna izquierda

### Requirement: El panel nunca excede la altura de la ventana

El panel del modal SHALL estar acotado en altura de modo que nunca sobrepase los límites verticales del viewport, independientemente de la longitud de la biografía. La cabecera (nombre y ubicación) y la barra de acciones SHALL permanecer fijas; únicamente el cuerpo de la biografía SHALL desplazarse.

#### Scenario: Biografía muy larga en una ventana baja

- **WHEN** un visitante abre la ficha de un artista con una biografía de más de 2000 caracteres en una ventana de 600 px de alto
- **THEN** el panel del modal SHALL quedar contenido dentro del viewport con margen visible arriba y abajo
- **AND** el botón "Cerrar" SHALL ser visible sin necesidad de desplazarse
- **AND** el nombre del artista SHALL permanecer visible al desplazar la biografía

#### Scenario: Biografía corta

- **WHEN** un visitante abre la ficha de un artista cuya biografía cabe holgadamente en el espacio disponible
- **THEN** el panel SHALL ajustarse al contenido sin dejar espacio vacío excesivo
- **AND** no SHALL aparecer barra de desplazamiento en el cuerpo de la biografía

### Requirement: Maqueta apilada en móvil

En viewports inferiores a `md` la ficha SHALL apilarse verticalmente: la imagen del artista arriba en formato apaisado con relación de aspecto acotada, y el contenido textual debajo.

La imagen SHALL ocupar como máximo el 40 % de la altura del panel, de modo que siempre quede visible una porción del texto al abrir el modal. La barra de acciones con el botón "Cerrar" SHALL permanecer fija en la parte inferior del panel.

#### Scenario: Apertura en móvil

- **WHEN** un visitante abre la ficha de un artista en un viewport de 375 × 667 px
- **THEN** la imagen SHALL aparecer en la parte superior en formato apaisado
- **AND** el nombre, la ubicación y el comienzo de la biografía SHALL ser visibles sin desplazarse
- **AND** el botón "Cerrar" SHALL permanecer fijo y visible en la parte inferior del panel

#### Scenario: Scroll de biografía extensa en móvil

- **WHEN** un visitante desplaza la biografía en móvil
- **THEN** el texto SHALL desplazarse dentro de su contenedor
- **AND** la barra de acciones con "Cerrar" SHALL permanecer fija

### Requirement: Elementos gráficos de ficha

La ficha SHALL incorporar elementos gráficos discretos, acordes al minimalismo del proyecto y sin dark mode, que refuercen la lectura de "ficha de catálogo":

- Un filete divisorio entre la columna de imagen y la de contenido (vertical en escritorio, horizontal en móvil).
- Una cabecera con el nombre del artista y su ubicación, separada del cuerpo por una regla horizontal.
- Una etiqueta de sección para la biografía, en mayúsculas y tipografía pequeña con `tracking` ampliado.
- Una barra de acciones inferior separada por una regla, con el botón "Cerrar".

Todos los textos de interfaz SHALL estar en español (es-ES).

#### Scenario: Etiqueta de sección presente

- **WHEN** un visitante abre la ficha de un artista con biografía
- **THEN** el bloque de biografía SHALL ir precedido de una etiqueta de sección en mayúsculas

### Requirement: Estados de datos ausentes

La ficha SHALL renderizarse correctamente cuando falten campos opcionales del artista, sin dejar huecos ni contenedores vacíos:

- Sin `profile_img`: la columna de imagen SHALL mostrar un marcador con las iniciales del artista derivadas de `full_name`, conservando la maqueta de dos columnas.
- Sin `location`: la cabecera SHALL mostrar solo el nombre, sin espacio reservado para la ubicación.
- Sin `bio`: el cuerpo SHALL mostrar un texto es-ES indicando que no hay biografía disponible, en lugar de un área vacía.

#### Scenario: Artista sin imagen de perfil

- **WHEN** un visitante abre la ficha de un artista cuyo `profile_img` es nulo o vacío
- **THEN** la columna de imagen SHALL mostrar las iniciales del artista sobre un fondo neutro
- **AND** la maqueta de dos columnas SHALL mantenerse en escritorio

#### Scenario: Artista sin ubicación

- **WHEN** un visitante abre la ficha de un artista cuya `location` es nula o vacía
- **THEN** la cabecera SHALL mostrar únicamente el nombre, sin línea vacía

#### Scenario: Artista sin biografía

- **WHEN** un visitante abre la ficha de un artista cuya `bio` es nula o vacía
- **THEN** el cuerpo SHALL mostrar un mensaje es-ES de biografía no disponible

### Requirement: Acción única de cierre

La ficha SHALL ofrecer "Cerrar" como única acción y no SHALL incluir enlaces de navegación a otras vistas. El modal SHALL poder cerrarse además pulsando `Escape` o haciendo clic en el fondo, conforme al comportamiento de `Dialog` de Headless UI ya en uso.

#### Scenario: Cierre con el botón

- **WHEN** un visitante pulsa el botón "Cerrar"
- **THEN** el modal SHALL cerrarse

#### Scenario: Cierre con Escape

- **WHEN** un visitante pulsa la tecla `Escape` con el modal abierto
- **THEN** el modal SHALL cerrarse

### Requirement: Renderizado fiel de listas de la biografía

La biografía SHALL renderizarse con los marcadores y sangrías correspondientes al tipo de lista producido por el editor Quill del panel de administración, tanto para listas de viñetas como numeradas.

Dado que Quill 2 codifica las listas de viñetas como `<ol><li data-list="bullet">`, el saneado de la biografía SHALL conservar el atributo `data-list` en los elementos `li`, y los estilos SHALL derivar el marcador de dicho atributo cuando esté presente:

- `li[data-list="bullet"]` SHALL mostrar un marcador de disco.
- `li[data-list="ordered"]` SHALL mostrar un marcador numérico decimal correlativo.
- Un `ul` o `ol` sin `data-list` SHALL mostrar el marcador correspondiente a su etiqueta (disco y decimal, respectivamente).

Los elementos `<span class="ql-ui">` que Quill inserta únicamente para la edición SHALL eliminarse del contenido publicado.

#### Scenario: Lista de viñetas creada con Quill

- **WHEN** el HTML de la biografía contiene `<ol><li data-list="bullet">Máster de Estilismo…</li>…</ol>`
- **THEN** la ficha SHALL mostrar cada elemento con viñeta de disco y sangría a la izquierda
- **AND** no SHALL mostrar numeración

#### Scenario: Lista numerada creada con Quill

- **WHEN** el HTML de la biografía contiene `<ol><li data-list="ordered">…</li>…</ol>`
- **THEN** la ficha SHALL mostrar cada elemento numerado correlativamente desde 1, con sangría a la izquierda

#### Scenario: El marcador de edición de Quill no se publica

- **WHEN** el HTML de la biografía contiene `<span class="ql-ui" contenteditable="false"></span>` dentro de un `li`
- **THEN** ese elemento no SHALL aparecer en la salida renderizada ni introducir espacio adicional

### Requirement: Renderizado del resto de formato enriquecido de la biografía

La biografía SHALL renderizar con estilos explícitos —sin depender de clases inertes— el formato enriquecido admitido por el editor: párrafos con separación vertical, negritas, cursivas, subrayados y enlaces.

Los estilos SHALL estar acotados al contenedor de la biografía y no SHALL afectar a otras partes de la aplicación. Los enlaces SHALL ser visualmente distinguibles del texto corrido.

#### Scenario: Párrafos separados

- **WHEN** el HTML de la biografía contiene varios elementos `<p>` consecutivos
- **THEN** cada párrafo SHALL mostrarse con separación vertical respecto al anterior

#### Scenario: Negrita conservada

- **WHEN** el HTML de la biografía contiene `<strong>Centro de Enseñanzas Artísticas Superiores de Diseño</strong>`
- **THEN** ese fragmento SHALL renderizarse en negrita

#### Scenario: Enlace distinguible

- **WHEN** el HTML de la biografía contiene un elemento `<a href="…">`
- **THEN** el enlace SHALL renderizarse con un tratamiento visual distinto del texto corrido
- **AND** SHALL conservar los atributos `href`, `target` y `rel` permitidos por el saneado

#### Scenario: Los estilos no se filtran fuera de la biografía

- **WHEN** se renderiza cualquier otra vista de la aplicación que contenga listas o párrafos
- **THEN** los estilos de la biografía no SHALL alterar su presentación

### Requirement: El saneado de la biografía se mantiene restrictivo

La ampliación del saneado para conservar `data-list` no SHALL relajar las garantías de seguridad existentes: el conjunto de etiquetas permitidas SHALL seguir limitado a formato de texto y listas, y no SHALL admitirse ningún atributo capaz de ejecutar código o cargar recursos externos.

#### Scenario: Script en la biografía

- **WHEN** el HTML de la biografía contiene una etiqueta `<script>` o un atributo manejador de eventos
- **THEN** el contenido peligroso SHALL eliminarse antes de renderizarse

#### Scenario: Atributo de datos permitido

- **WHEN** el HTML de la biografía contiene `<li data-list="bullet">`
- **THEN** el atributo `data-list` SHALL conservarse tras el saneado

### Requirement: Coherencia de la biografía en las vistas de perfil

Las vistas que muestran la biografía del artista fuera del modal —el perfil del vendedor y la ficha de autor del panel de administración— SHALL aplicar el mismo tratamiento de HTML enriquecido, de modo que el autor vea sus listas renderizadas igual que las verá el público.

#### Scenario: Biografía con listas en el perfil del vendedor

- **WHEN** un vendedor con listas en su biografía abre su página de perfil
- **THEN** las listas SHALL mostrarse con sus marcadores y sangrías

#### Scenario: Biografía con listas en la ficha de autor del admin

- **WHEN** un administrador abre la ficha de un autor con listas en su biografía
- **THEN** las listas SHALL mostrarse con sus marcadores y sangrías

### Requirement: Compatibilidad con todos los puntos de entrada del modal

El rediseño SHALL mantener sin cambios la interfaz pública del componente (`author`, `open`, `onClose`), de modo que todas las vistas que hoy lo utilizan sigan funcionando sin modificaciones.

#### Scenario: Modal invocado desde cualquier vista

- **WHEN** la ficha se abre desde la galería de arte, la tienda, una página de autor, un detalle de producto, un sorteo o un evento en directo
- **THEN** SHALL mostrarse la nueva ficha rediseñada con el mismo contrato de props
