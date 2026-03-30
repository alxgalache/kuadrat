## ADDED Requirements

### Requirement: Botón de consulta de puntos de entrega en pedidos del seller

El sistema DEBE mostrar un botón "Consultar puntos de entrega" en la fila de acciones de cada pedido del panel "Mis envíos", junto a los botones existentes ("Descargar etiqueta", "Ver seguimiento", "Programar recogida").

El botón DEBE ser visible únicamente cuando al menos un item del pedido tiene un `sendcloudCarrierCode` no nulo.

#### Scenario: Pedido con carrier code de Sendcloud

- **WHEN** un pedido tiene al menos un item con `sendcloudCarrierCode` no nulo
- **THEN** el sistema DEBE mostrar el botón "Consultar puntos de entrega" en la fila de acciones del pedido

#### Scenario: Pedido sin carrier code de Sendcloud

- **WHEN** ningún item del pedido tiene `sendcloudCarrierCode`
- **THEN** el sistema NO DEBE mostrar el botón "Consultar puntos de entrega"

### Requirement: Apertura del modal informativo de puntos de entrega

Al pulsar el botón "Consultar puntos de entrega", el sistema DEBE abrir un modal a pantalla completa (con backdrop) que muestre los puntos de entrega disponibles para el carrier del pedido.

El modal DEBE recibir como parámetros el `sendcloudCarrierCode` del pedido, el país (`deliveryAddress.country`) y el código postal (`deliveryAddress.postalCode`) de la dirección de entrega.

#### Scenario: Seller pulsa el botón en un pedido

- **WHEN** el seller pulsa "Consultar puntos de entrega" en un pedido con carrier `correos_express` y dirección de entrega con país `ES` y código postal `37008`
- **THEN** el sistema DEBE abrir el modal de puntos de entrega
- **THEN** el campo de código postal DEBE estar inicializado con `37008`
- **THEN** el sistema DEBE cargar los puntos de entrega de `correos_express` en `ES` con código postal `37008`

### Requirement: Campo de búsqueda por código postal

El modal DEBE incluir un campo de texto para el código postal en la parte superior. El seller DEBE poder modificar el código postal para buscar puntos de entrega en otra zona.

La búsqueda DEBE dispararse automáticamente con un debounce de 500ms después de que el seller deje de escribir, y solo cuando el código postal tenga al menos 4 caracteres.

#### Scenario: Seller modifica el código postal

- **WHEN** el seller cambia el código postal a `28001` y deja de escribir durante 500ms
- **THEN** el sistema DEBE realizar una nueva consulta de puntos de entrega con el código postal `28001`, manteniendo el mismo carrier y país
- **THEN** el mapa y el listado DEBEN actualizarse con los nuevos resultados

#### Scenario: Código postal con menos de 4 caracteres

- **WHEN** el seller introduce un código postal con menos de 4 caracteres
- **THEN** el sistema NO DEBE disparar la búsqueda

### Requirement: Visualización del mapa con marcadores

El modal DEBE mostrar un mapa de Google Maps con marcadores para cada punto de entrega devuelto por la API. El mapa DEBE ajustar automáticamente el zoom y los bounds para mostrar todos los marcadores.

Al hacer clic en un marcador, el sistema DEBE resaltar visualmente la tarjeta correspondiente en el listado y hacer scroll hasta ella.

#### Scenario: Puntos de entrega cargados correctamente

- **WHEN** la API devuelve 5 puntos de entrega con coordenadas
- **THEN** el mapa DEBE mostrar 5 marcadores en las coordenadas correspondientes
- **THEN** el mapa DEBE ajustar sus bounds para mostrar todos los marcadores

#### Scenario: Clic en marcador del mapa

- **WHEN** el seller hace clic en un marcador del mapa
- **THEN** la tarjeta correspondiente en el listado DEBE resaltarse visualmente
- **THEN** el listado DEBE hacer scroll automático hasta la tarjeta resaltada

### Requirement: Listado de puntos de entrega con información completa

El modal DEBE mostrar un listado scrollable de tarjetas, una por cada punto de entrega. Cada tarjeta DEBE incluir:

- Nombre del punto de entrega
- Dirección completa (calle y número)
- Ciudad y código postal
- Distancia desde el código postal buscado (en metros o kilómetros)
- Horario completo de apertura de todos los días de la semana (lunes a domingo)

Al hacer clic en una tarjeta, el mapa DEBE centrar la vista en el marcador correspondiente.

#### Scenario: Visualización de tarjeta de punto de entrega

- **WHEN** se muestra un punto de entrega con nombre "Correos Oficina 1", dirección "Calle Mayor 5", ciudad "Salamanca", código postal "37001", distancia 1200 metros, y horarios de lunes a domingo
- **THEN** la tarjeta DEBE mostrar todos estos datos
- **THEN** los horarios DEBEN mostrarse para cada día de la semana (Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo)
- **THEN** los días en que el punto está cerrado DEBEN indicarse con el texto "Cerrado"

#### Scenario: Clic en tarjeta del listado

- **WHEN** el seller hace clic en una tarjeta del listado
- **THEN** el mapa DEBE centrar la vista en el marcador del punto correspondiente

### Requirement: Horarios completos por día de la semana

A diferencia del componente de checkout (que solo muestra el horario del día actual), este modal DEBE mostrar los horarios de apertura de **todos los días de la semana**.

Los días DEBEN mostrarse con sus nombres en español: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo.

Los datos de Sendcloud usan índices 0-6 donde 0=Lunes y 6=Domingo. El sistema DEBE mapear estos índices correctamente.

Cuando un día tiene múltiples franjas horarias (por ejemplo, mañana y tarde), todas DEBEN mostrarse.

#### Scenario: Punto con horario partido

- **WHEN** un punto de entrega tiene horario `{"1": ["09:00-13:00", "16:00-20:00"]}` para el martes (índice 1)
- **THEN** la tarjeta DEBE mostrar "Martes: 09:00-13:00, 16:00-20:00"

#### Scenario: Punto cerrado un día

- **WHEN** un punto de entrega tiene horario `{"6": []}` para el domingo (índice 6)
- **THEN** la tarjeta DEBE mostrar "Domingo: Cerrado"

### Requirement: Estados de carga y error

El modal DEBE gestionar correctamente los estados de carga, error y resultados vacíos.

#### Scenario: Cargando puntos de entrega

- **WHEN** se está realizando la petición a la API de puntos de entrega
- **THEN** el modal DEBE mostrar un indicador de carga (spinner)

#### Scenario: Error en la petición

- **WHEN** la petición a la API falla
- **THEN** el modal DEBE mostrar un mensaje de error con opción de reintentar

#### Scenario: Sin resultados

- **WHEN** la API devuelve una lista vacía de puntos de entrega
- **THEN** el modal DEBE mostrar el mensaje "No hay puntos de recogida disponibles en esta zona."

#### Scenario: Error de carga de Google Maps

- **WHEN** Google Maps no se puede cargar
- **THEN** el listado de puntos DEBE seguir visible y funcional sin el mapa

### Requirement: Cierre del modal

El modal DEBE poder cerrarse mediante un botón de cierre (X) en la esquina superior o pulsando la tecla Escape. Al cerrar el modal no se realiza ninguna acción adicional.

#### Scenario: Cerrar modal con botón X

- **WHEN** el seller pulsa el botón de cierre del modal
- **THEN** el modal DEBE cerrarse sin efectos secundarios

#### Scenario: Cerrar modal con tecla Escape

- **WHEN** el seller pulsa la tecla Escape mientras el modal está abierto
- **THEN** el modal DEBE cerrarse sin efectos secundarios
