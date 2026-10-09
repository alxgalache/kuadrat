# seller-service-points-modal Specification

## Purpose

Definir el modal informativo de puntos de entrega en los pedidos del vendedor: búsqueda por código postal, mapa con marcadores, listado con horarios y estados de carga y error.

## Requirements

### Requirement: Botón de consulta de puntos de entrega en pedidos del seller

El sistema SHALL mostrar un botón "Consultar puntos de entrega" en la fila de acciones de cada pedido del panel "Mis envíos", junto a los botones existentes ("Descargar etiqueta", "Ver seguimiento", "Programar recogida").

El botón SHALL ser visible únicamente cuando al menos un item del pedido tiene un `sendcloudCarrierCode` no nulo.

#### Scenario: Pedido con carrier code de Sendcloud

- **WHEN** un pedido tiene al menos un item con `sendcloudCarrierCode` no nulo
- **THEN** el sistema SHALL mostrar el botón "Consultar puntos de entrega" en la fila de acciones del pedido

#### Scenario: Pedido sin carrier code de Sendcloud

- **WHEN** ningún item del pedido tiene `sendcloudCarrierCode`
- **THEN** el sistema SHALL NOT mostrar el botón "Consultar puntos de entrega"

### Requirement: Apertura del modal informativo de puntos de entrega

Al pulsar el botón "Consultar puntos de entrega", el sistema SHALL abrir un modal a pantalla completa (con backdrop) que muestre los puntos de entrega disponibles para el carrier del pedido.

El modal SHALL recibir como parámetros el `sendcloudCarrierCode` del pedido, el país (`deliveryAddress.country`) y el código postal (`deliveryAddress.postalCode`) de la dirección de entrega.

#### Scenario: Seller pulsa el botón en un pedido

- **WHEN** el seller pulsa "Consultar puntos de entrega" en un pedido con carrier `correos_express` y dirección de entrega con país `ES` y código postal `37008`
- **THEN** el sistema SHALL abrir el modal de puntos de entrega
- **THEN** el campo de código postal SHALL estar inicializado con `37008`
- **THEN** el sistema SHALL cargar los puntos de entrega de `correos_express` en `ES` con código postal `37008`

### Requirement: Campo de búsqueda por código postal

El modal SHALL incluir un campo de texto para el código postal en la parte superior. El seller SHALL poder modificar el código postal para buscar puntos de entrega en otra zona.

La búsqueda SHALL dispararse automáticamente con un debounce de 500ms después de que el seller deje de escribir, y solo cuando el código postal tenga al menos 4 caracteres.

#### Scenario: Seller modifica el código postal

- **WHEN** el seller cambia el código postal a `28001` y deja de escribir durante 500ms
- **THEN** el sistema SHALL realizar una nueva consulta de puntos de entrega con el código postal `28001`, manteniendo el mismo carrier y país
- **THEN** el mapa y el listado SHALL actualizarse con los nuevos resultados

#### Scenario: Código postal con menos de 4 caracteres

- **WHEN** el seller introduce un código postal con menos de 4 caracteres
- **THEN** el sistema SHALL NOT disparar la búsqueda

### Requirement: Visualización del mapa con marcadores

El modal SHALL mostrar un mapa de Google Maps con marcadores para cada punto de entrega devuelto por la API. El mapa SHALL ajustar automáticamente el zoom y los bounds para mostrar todos los marcadores.

Al hacer clic en un marcador, el sistema SHALL resaltar visualmente la tarjeta correspondiente en el listado y hacer scroll hasta ella.

#### Scenario: Puntos de entrega cargados correctamente

- **WHEN** la API devuelve 5 puntos de entrega con coordenadas
- **THEN** el mapa SHALL mostrar 5 marcadores en las coordenadas correspondientes
- **THEN** el mapa SHALL ajustar sus bounds para mostrar todos los marcadores

#### Scenario: Clic en marcador del mapa

- **WHEN** el seller hace clic en un marcador del mapa
- **THEN** la tarjeta correspondiente en el listado SHALL resaltarse visualmente
- **THEN** el listado SHALL hacer scroll automático hasta la tarjeta resaltada

### Requirement: Listado de puntos de entrega con información completa

El modal SHALL mostrar un listado scrollable de tarjetas, una por cada punto de entrega. Cada tarjeta SHALL incluir:

- Nombre del punto de entrega
- Dirección completa (calle y número)
- Ciudad y código postal
- Distancia desde el código postal buscado (en metros o kilómetros)
- Horario completo de apertura de todos los días de la semana (lunes a domingo)

Al hacer clic en una tarjeta, el mapa SHALL centrar la vista en el marcador correspondiente.

#### Scenario: Visualización de tarjeta de punto de entrega

- **WHEN** se muestra un punto de entrega con nombre "Correos Oficina 1", dirección "Calle Mayor 5", ciudad "Salamanca", código postal "37001", distancia 1200 metros, y horarios de lunes a domingo
- **THEN** la tarjeta SHALL mostrar todos estos datos
- **THEN** los horarios SHALL mostrarse para cada día de la semana (Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo)
- **THEN** los días en que el punto está cerrado SHALL indicarse con el texto "Cerrado"

#### Scenario: Clic en tarjeta del listado

- **WHEN** el seller hace clic en una tarjeta del listado
- **THEN** el mapa SHALL centrar la vista en el marcador del punto correspondiente

### Requirement: Horarios completos por día de la semana

A diferencia del componente de checkout (que solo muestra el horario del día actual), este modal SHALL mostrar los horarios de apertura de **todos los días de la semana**.

Los días SHALL mostrarse con sus nombres en español: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo.

Los datos de Sendcloud usan índices 0-6 donde 0=Lunes y 6=Domingo. El sistema SHALL mapear estos índices correctamente.

Cuando un día tiene múltiples franjas horarias (por ejemplo, mañana y tarde), todas SHALL mostrarse.

#### Scenario: Punto con horario partido

- **WHEN** un punto de entrega tiene horario `{"1": ["09:00-13:00", "16:00-20:00"]}` para el martes (índice 1)
- **THEN** la tarjeta SHALL mostrar "Martes: 09:00-13:00, 16:00-20:00"

#### Scenario: Punto cerrado un día

- **WHEN** un punto de entrega tiene horario `{"6": []}` para el domingo (índice 6)
- **THEN** la tarjeta SHALL mostrar "Domingo: Cerrado"

### Requirement: Estados de carga y error

El modal SHALL gestionar correctamente los estados de carga, error y resultados vacíos.

#### Scenario: Cargando puntos de entrega

- **WHEN** se está realizando la petición a la API de puntos de entrega
- **THEN** el modal SHALL mostrar un indicador de carga (spinner)

#### Scenario: Error en la petición

- **WHEN** la petición a la API falla
- **THEN** el modal SHALL mostrar un mensaje de error con opción de reintentar

#### Scenario: Sin resultados

- **WHEN** la API devuelve una lista vacía de puntos de entrega
- **THEN** el modal SHALL mostrar el mensaje "No hay puntos de recogida disponibles en esta zona."

#### Scenario: Error de carga de Google Maps

- **WHEN** Google Maps no se puede cargar
- **THEN** el listado de puntos SHALL seguir visible y funcional sin el mapa

### Requirement: Cierre del modal

El modal SHALL poder cerrarse mediante un botón de cierre (X) en la esquina superior o pulsando la tecla Escape. Al cerrar el modal no se realiza ninguna acción adicional.

#### Scenario: Cerrar modal con botón X

- **WHEN** el seller pulsa el botón de cierre del modal
- **THEN** el modal SHALL cerrarse sin efectos secundarios

#### Scenario: Cerrar modal con tecla Escape

- **WHEN** el seller pulsa la tecla Escape mientras el modal está abierto
- **THEN** el modal SHALL cerrarse sin efectos secundarios
