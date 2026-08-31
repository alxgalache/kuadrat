# checkout-buyer-tax-id

## ADDED Requirements

### Requirement: Validación del NIF español (DNI/NIE) con dígito de control

El sistema SHALL validar los identificadores fiscales de personas física españolas comprobando el **dígito de control**, no únicamente el formato. Un DNI son 8 dígitos seguidos de una letra; un NIE es `X`, `Y` o `Z` seguido de 7 dígitos y una letra. En ambos casos la letra SHALL ser `'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23]`, donde `n` es la parte numérica y, para el NIE, el prefijo `X`/`Y`/`Z` se sustituye por `0`/`1`/`2` antes de convertir a número.

La validación SHALL normalizar el valor (recortar espacios y pasar a mayúsculas) antes de comprobarlo, y SHALL rechazar los CIF de persona jurídica.

Esta lógica SHALL residir en un único módulo por lado — uno en el backend y uno en el frontend — y no SHALL duplicarse en componentes ni servicios.

#### Scenario: DNI con letra correcta

- **WHEN** se valida `"12345678Z"`
- **THEN** el resultado SHALL ser válido

#### Scenario: DNI con letra incorrecta

- **WHEN** se valida `"12345678A"`
- **THEN** el resultado SHALL ser inválido

#### Scenario: NIE con letra correcta

- **WHEN** se valida `"X1234567L"`
- **THEN** el resultado SHALL ser válido

#### Scenario: NIE con prefijo Y

- **WHEN** se valida `"Y1234567X"`
- **THEN** el resultado SHALL ser válido

#### Scenario: Normalización de minúsculas y espacios

- **WHEN** se valida `"  12345678z  "`
- **THEN** el resultado SHALL ser válido

#### Scenario: CIF de empresa rechazado

- **WHEN** se valida `"B12345678"`
- **THEN** el resultado SHALL ser inválido

#### Scenario: Valores no textuales

- **WHEN** se valida `null`, `undefined`, un número o una cadena vacía
- **THEN** el resultado SHALL ser inválido y la función SHALL NOT lanzar una excepción

### Requirement: Campo DNI/NIE en el paso de datos personales del carrito

El carrito SHALL mostrar un campo «DNI/NIE» en la sección «Información personal» del paso de datos del comprador, situado **inmediatamente debajo** de «Nombre completo» y ocupando el mismo ancho que este (`sm:col-span-2` dentro de la rejilla de dos columnas). El campo SHALL usar los mismos estilos, el mismo marcado de obligatoriedad (asterisco rojo) y el mismo comportamiento de `onChange` que el resto de campos de la sección.

El campo SHALL estar presente en las dos implementaciones de esa sección — la de introducción manual de dirección y la de autocompletado — porque la variable de entorno `NEXT_PUBLIC_CART_ADDRESS_FUNC` determina cuál se renderiza.

El valor introducido SHALL mostrarse en mayúsculas y SHALL almacenarse normalizado (mayúsculas, sin espacios sobrantes).

#### Scenario: Posición y ancho del campo

- **WHEN** el comprador llega al paso de datos personales
- **THEN** el campo «DNI/NIE» SHALL aparecer entre «Nombre completo» y «Email»
- **AND** SHALL ocupar el ancho completo de la rejilla, igual que «Nombre completo»

#### Scenario: Modo de dirección manual

- **GIVEN** `NEXT_PUBLIC_CART_ADDRESS_FUNC` vale `manual`
- **WHEN** se renderiza el paso de datos personales
- **THEN** el campo «DNI/NIE» SHALL estar presente

#### Scenario: Modo de dirección con autocompletado

- **GIVEN** `NEXT_PUBLIC_CART_ADDRESS_FUNC` vale `autocomplete`
- **WHEN** se renderiza el paso de datos personales
- **THEN** el campo «DNI/NIE» SHALL estar presente

#### Scenario: Solo se muestra una vez

- **GIVEN** un carrito que solo requiere dirección de facturación (todos los productos son de recogida)
- **WHEN** se renderiza el paso de datos personales
- **THEN** la sección «Información personal» SHALL mostrarse una sola vez y el campo «DNI/NIE» SHALL aparecer una sola vez

### Requirement: El DNI es obligatorio para avanzar en el checkout

El carrito SHALL impedir avanzar del paso de datos personales al de envío o pago mientras el DNI esté vacío o no supere la validación del dígito de control. El botón de continuar SHALL quedar deshabilitado en ese caso, con el mismo criterio que ya se aplica al nombre, al email y al teléfono.

El sistema SHALL mostrar un error en línea bajo el campo cuando el valor introducido no sea un DNI/NIE válido, y SHALL NOT mostrarlo mientras el campo esté vacío y no se haya intentado avanzar.

#### Scenario: DNI vacío bloquea el avance

- **GIVEN** nombre, email y teléfono válidos y el campo DNI vacío
- **WHEN** el comprador intenta continuar
- **THEN** el sistema SHALL NOT avanzar de paso
- **AND** SHALL mostrar el aviso de información personal incompleta

#### Scenario: DNI inválido bloquea el avance

- **GIVEN** el comprador escribe `"12345678A"`
- **WHEN** intenta continuar
- **THEN** el sistema SHALL NOT avanzar de paso
- **AND** SHALL mostrar un error en línea indicando que el DNI/NIE no es válido

#### Scenario: DNI válido permite continuar

- **GIVEN** nombre, email, teléfono y `"12345678Z"` como DNI
- **WHEN** el comprador continúa
- **THEN** el sistema SHALL avanzar al paso de envío o de pago según corresponda

### Requirement: Persistencia del DNI en el pedido

La tabla `orders` SHALL disponer de una columna `dni TEXT` nullable. `POST /api/orders/placeOrder` SHALL leer el identificador del bloque `customer` de la petición y SHALL persistirlo en esa columna, **en la misma sentencia `INSERT`** que `full_name`, `email` y `phone`, normalizado a mayúsculas y sin espacios sobrantes.

La columna SHALL ser nullable para que los pedidos anteriores al cambio sigan siendo válidos y facturables.

#### Scenario: El DNI se guarda con el pedido

- **GIVEN** una petición de pedido con `customer.dni = "12345678Z"`
- **WHEN** el pedido se registra
- **THEN** la fila de `orders` SHALL tener `dni = '12345678Z'`

#### Scenario: Normalización al guardar

- **GIVEN** una petición con `customer.dni = " 12345678z "`
- **WHEN** el pedido se registra
- **THEN** la fila de `orders` SHALL tener `dni = '12345678Z'`

#### Scenario: Pedidos anteriores al cambio

- **GIVEN** un pedido creado antes de este cambio
- **WHEN** se consulta
- **THEN** su `dni` SHALL ser `NULL` y ninguna operación sobre el pedido SHALL fallar por ello

### Requirement: Validación del DNI en el backend

`POST /api/orders/placeOrder` SHALL rechazar con HTTP 400 toda petición cuyo `customer.dni` falte o no supere la validación del dígito de control, **antes** de crear la fila del pedido y antes de reservar inventario. La validación SHALL usar el mismo módulo compartido que el resto del backend, de modo que cliente y servidor no puedan divergir.

El esquema Zod de `placeOrder` SHALL declarar `dni` dentro del bloque `customer`; sin esa declaración el modo `strip` del esquema eliminaría el campo antes de que llegue al controlador.

#### Scenario: Petición sin DNI

- **GIVEN** una petición de pedido sin `customer.dni`
- **WHEN** se procesa
- **THEN** la respuesta SHALL ser HTTP 400
- **AND** SHALL NOT crearse ninguna fila en `orders`
- **AND** SHALL NOT consumirse ningún ejemplar de la edición

#### Scenario: Petición con DNI inválido

- **GIVEN** una petición con `customer.dni = "00000000X"`
- **WHEN** se procesa
- **THEN** la respuesta SHALL ser HTTP 400
- **AND** SHALL NOT crearse ninguna fila en `orders`

#### Scenario: El esquema conserva el campo

- **WHEN** el esquema de `placeOrder` analiza un cuerpo con `customer.dni`
- **THEN** el resultado SHALL conservar `customer.dni`

### Requirement: Propagación del DNI desde sorteos y subastas

Los pedidos generados al facturar una participación de sorteo o una puja de subasta SHALL rellenar `orders.dni` con el DNI que ya consta en `draw_buyers.dni` y `auction_buyers.dni` respectivamente. Las consultas de datos de facturación de ambos flujos, que seleccionan columnas explícitas, SHALL incluir esa columna.

Cuando la fila de origen no tenga DNI, `orders.dni` SHALL quedar a `NULL` y la facturación SHALL continuar sin error.

#### Scenario: Pedido de sorteo

- **GIVEN** una participación cuyo `draw_buyers.dni` es `"12345678Z"`
- **WHEN** el administrador factura la participación
- **THEN** el pedido creado SHALL tener `dni = '12345678Z'`

#### Scenario: Pedido de subasta

- **GIVEN** una puja adjudicada cuyo `auction_buyers.dni` es `"X1234567L"`
- **WHEN** el administrador factura la puja
- **THEN** el pedido creado SHALL tener `dni = 'X1234567L'`

#### Scenario: Comprador de subasta antiguo sin DNI

- **GIVEN** una puja cuyo `auction_buyers.dni` es `NULL`
- **WHEN** el administrador factura la puja
- **THEN** el pedido SHALL crearse con `dni = NULL` sin error

### Requirement: El DNI del comprador en el panel de administración

El detalle de pedido del administrador SHALL mostrar el DNI del comprador en el bloque «Información del comprador», junto al nombre, el email y el teléfono. Cuando el pedido no tenga DNI, SHALL mostrarse un texto de ausencia coherente con el de los demás campos.

En ese mismo bloque, el campo «Nombre» SHALL mostrar `order.full_name` y no el correo electrónico.

#### Scenario: Pedido con DNI

- **GIVEN** un pedido con `dni = '12345678Z'`
- **WHEN** el administrador abre su detalle
- **THEN** el bloque «Información del comprador» SHALL mostrar `12345678Z`

#### Scenario: Pedido sin DNI

- **GIVEN** un pedido con `dni = NULL`
- **WHEN** el administrador abre su detalle
- **THEN** el bloque SHALL mostrar «Sin DNI»

#### Scenario: El nombre deja de mostrar el email

- **GIVEN** un pedido con `full_name = 'Ana Ruiz'` y `email = 'ana@example.com'`
- **WHEN** el administrador abre su detalle
- **THEN** el campo «Nombre» SHALL mostrar `Ana Ruiz`
