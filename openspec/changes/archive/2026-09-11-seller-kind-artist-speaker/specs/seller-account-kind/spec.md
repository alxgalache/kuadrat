## ADDED Requirements

### Requirement: La columna `users.seller_kind` distingue Artista de Ponente

La tabla `users` SHALL llevar una columna `seller_kind TEXT NOT NULL DEFAULT 'artist' CHECK(seller_kind IN ('artist','speaker'))`.

El valor `'artist'` describe el vendedor completo que existe hoy: publica obra, publica tienda, gestiona envíos y puede ser host de eventos. El valor `'speaker'` describe al invitado que **sólo** participa en eventos multimedia — streams en directo, charlas, pases de vídeo, talleres y cursos.

La columna SHALL leerse únicamente cuando `role = 'seller'`. Existe en toda fila de `users` porque `ALTER TABLE ADD COLUMN` no admite columnas por rol, igual que `dealer_commission_art` existe en filas de compradores; su valor en una fila `buyer` o `admin` no tiene significado y ningún camino de código lo consulta.

El `DEFAULT 'artist'` SHALL desplegarse **sin backfill**: toda cuenta existente queda como artista y conserva exactamente el comportamiento previo al cambio.

`ALTER TABLE ... ADD COLUMN` en SQLite no aplica la restricción `CHECK` a las filas existentes ni la añade a la tabla ya creada, así que el enum SHALL además validarse en Zod en toda ruta que lo escriba — el mismo reparto que ya usa `stripe_connect_status`, que declara su `CHECK` en el `CREATE TABLE` y viaja sin él en su `safeAlter`.

#### Scenario: Base de datos nueva
- **WHEN** `initializeDatabase()` crea la tabla `users` desde cero
- **THEN** la columna `seller_kind` SHALL existir con `DEFAULT 'artist'` y su `CHECK`

#### Scenario: Base de datos existente
- **WHEN** la API arranca contra una base de datos anterior al cambio
- **THEN** el `safeAlter` SHALL añadir la columna
- **AND** toda fila existente SHALL quedar con `seller_kind = 'artist'`
- **AND** ningún vendedor SHALL perder acceso a ninguna sección

#### Scenario: Valor fuera del enum
- **WHEN** una petición intenta escribir `seller_kind = 'streamer'`
- **THEN** la validación Zod SHALL rechazarla con 400
- **AND** la columna SHALL conservar su valor anterior

---

### Requirement: El conjunto de capacidades de cada tipo es una sola definición

El sistema SHALL derivar de `seller_kind` un único conjunto de capacidades, definido en **un solo sitio por lado** (`api/utils/sellerCapabilities.js` en el servidor, `client/lib/sellerCapabilities.js` en el cliente), y nunca por comparaciones `seller_kind === 'speaker'` repetidas en cada pantalla o cada ruta.

Un `artist` SHALL poder: publicar y gestionar `art`, publicar y gestionar `others`, gestionar envíos Sendcloud de vendedor, tener configuración Sendcloud, y ser host de eventos.

Un `speaker` SHALL poder: ser host de eventos gratuitos y de pago, ver y cobrar su monedero, completar Stripe Connect, mantener sus datos fiscales, recibir facturas de asistentes (serie P) y ser acreditado por `eventCreditScheduler`. Un `speaker` SHALL NOT poder publicar ni gestionar producto de ningún tipo, ni acceder a los envíos de vendedor, ni tener configuración Sendcloud.

La comisión aplicable a un evento de pago SHALL seguir siendo `users.dealer_commission_other` y su régimen fiscal `standard_vat`, sin cambio alguno respecto a hoy y con independencia del `seller_kind` del host.

#### Scenario: Un ponente cobra un evento igual que un artista
- **GIVEN** un `speaker` que es host de un evento de pago finalizado
- **WHEN** `eventCreditScheduler` procesa el evento
- **THEN** el importe SHALL acreditarse en `available_withdrawal_standard_vat` con la comisión `dealer_commission_other` del host
- **AND** el cálculo SHALL ser idéntico al de un host `artist`

#### Scenario: Ninguna pantalla decide por su cuenta
- **WHEN** se añade una nueva sección restringida a artistas
- **THEN** SHALL consultar el módulo de capacidades
- **AND** SHALL NOT comparar el literal `'speaker'` en línea

---

### Requirement: El admin elige el tipo al crear un autor

`POST /api/admin/authors` SHALL aceptar un campo `seller_kind` opcional con valor `'artist'` o `'speaker'`, y SHALL persistirlo en la fila creada. Omitirlo SHALL equivaler a `'artist'`.

La pantalla `/admin/autores/nuevo` SHALL presentar un selector obligatorio «Tipo de usuario» con las opciones **«Artista»** y **«Ponente»**, y una línea de ayuda en es-ES que explique que un ponente sólo participa en eventos y no publica obra ni productos.

El resto del alta SHALL ser idéntico para ambos tipos, incluido el envío del email de activación con su token de 48 horas.

#### Scenario: Alta de un ponente
- **WHEN** el admin crea un autor con «Ponente» seleccionado
- **THEN** la fila SHALL guardarse con `seller_kind = 'speaker'` y `role = 'seller'`
- **AND** SHALL enviarse el mismo email de configuración de contraseña que a un artista

#### Scenario: Alta sin especificar tipo
- **WHEN** llega un `POST /api/admin/authors` sin el campo `seller_kind`
- **THEN** la fila SHALL guardarse con `seller_kind = 'artist'`

#### Scenario: Sólo el admin escribe la columna
- **WHEN** un vendedor autenticado intenta modificar su propio `seller_kind` por cualquier ruta de `/api/seller/*`
- **THEN** el campo SHALL ser ignorado o rechazado
- **AND** la columna SHALL conservar su valor

---

### Requirement: Degradar a Ponente se rechaza mientras haya huella comercial viva

`PUT /api/admin/authors/:id` SHALL rechazar un cambio de `'artist'` a `'speaker'` con **409** y `title: 'SELLER_KIND_CHANGE_BLOCKED'` cuando el vendedor tenga alguna de estas cosas:

- una fila en `art` o en `others` con `removed = 0`;
- una subasta suya en estado activo o programado;
- un sorteo suyo en estado activo o programado;
- un `art_order_items` u `other_order_items` suyo cuyo pedido no esté en estado terminal.

La respuesta SHALL enumerar los bloqueos encontrados, con su recuento, en es-ES, para que el admin sepa qué resolver. El cuerpo SHALL NOT modificar ninguna fila: la comprobación ocurre antes de cualquier escritura.

Nada SHALL despublicarse, ocultarse ni borrarse de forma automática. Una obra a la venta cuyo autor pierde el panel para gestionarla es una obra huérfana; ocultarla sin avisar es despublicar mercancía que puede estar en el carrito de alguien o en una subasta en curso. Ambas son peores que un rechazo con motivo.

El sentido contrario, `'speaker'` a `'artist'`, SHALL NOT tener bloqueos de este tipo: sólo concede capacidades.

#### Scenario: Artista con obra publicada
- **GIVEN** un vendedor `artist` con 3 obras `removed = 0`
- **WHEN** el admin intenta cambiarlo a «Ponente»
- **THEN** la respuesta SHALL ser 409 con `title: 'SELLER_KIND_CHANGE_BLOCKED'`
- **AND** SHALL nombrar las 3 obras como causa
- **AND** `users.seller_kind` SHALL seguir siendo `'artist'`

#### Scenario: Artista sin nada vivo
- **GIVEN** un vendedor `artist` sin producto no eliminado, sin subasta ni sorteo activos y sin ítems de pedido abiertos
- **WHEN** el admin lo cambia a «Ponente»
- **THEN** la respuesta SHALL ser 200
- **AND** `users.seller_kind` SHALL pasar a `'speaker'`

#### Scenario: Pedido en curso bloquea
- **GIVEN** un vendedor `artist` sin producto vivo pero con un ítem de pedido pendiente de envío
- **WHEN** el admin intenta degradarlo
- **THEN** la respuesta SHALL ser 409 nombrando el pedido

#### Scenario: Promoción sin bloqueos
- **GIVEN** un vendedor `speaker`
- **WHEN** el admin lo cambia a «Artista»
- **THEN** la respuesta SHALL ser 200 sin comprobar huella comercial

#### Scenario: Guardar sin tocar el tipo
- **WHEN** el admin guarda la ficha de un artista sin cambiar el selector de tipo
- **THEN** SHALL NOT ejecutarse ninguna comprobación de bloqueo
- **AND** SHALL NOT invalidarse ninguna sesión

---

### Requirement: Ningún cambio de tipo se acepta durante un directo del vendedor

`PUT /api/admin/authors/:id` SHALL rechazar cualquier cambio de `seller_kind`, **en las dos direcciones**, mientras el vendedor sea `host_user_id` de un evento con `status = 'active'`. La respuesta SHALL ser 409 con `title: 'SELLER_KIND_CHANGE_BLOCKED'` y SHALL nombrar el evento en curso.

Este bloqueo existe porque el cambio de tipo invalida la sesión del vendedor: un host en mitad de una retransmisión perdería la renovación de su token y quedaría fuera de su propia sala, sin explicación y sin forma de volver antes de re-autenticarse.

#### Scenario: Host retransmitiendo
- **GIVEN** un vendedor que es host de un evento con `status = 'active'`
- **WHEN** el admin intenta cambiar su tipo en cualquier dirección
- **THEN** la respuesta SHALL ser 409 nombrando el evento
- **AND** `users.seller_kind` y `users.sessions_invalidated_at` SHALL quedar intactos

#### Scenario: Evento programado pero no iniciado
- **GIVEN** un vendedor que es host de un evento con `status = 'scheduled'`
- **WHEN** el admin cambia su tipo
- **THEN** el cambio SHALL aceptarse
- **AND** el evento SHALL conservar su host

---

### Requirement: Cambiar el tipo corta las sesiones abiertas de ese vendedor

Cuando `PUT /api/admin/authors/:id` cambia efectivamente el valor de `seller_kind`, SHALL escribir `users.sessions_invalidated_at = CURRENT_TIMESTAMP` **en el mismo enunciado SQL** que escribe `seller_kind`, de modo que no exista un estado en el que el tipo ha cambiado y las sesiones antiguas siguen vivas.

Sin este corte, el menú del vendedor seguiría mostrando las secciones del tipo anterior hasta que el JWT caduque (7 días): el objeto `user` del cliente sale de `localStorage` y sólo se refresca al iniciar sesión.

El corte SHALL aplicarse únicamente cuando el valor cambia. Guardar la ficha con el mismo tipo SHALL NOT expulsar a nadie.

#### Scenario: El vendedor es expulsado al cambiar su tipo
- **GIVEN** un vendedor con sesión abierta en su navegador
- **WHEN** el admin cambia su tipo
- **THEN** su siguiente petición autenticada SHALL responder 401
- **AND** el cliente SHALL llevarle a la pantalla de acceso

#### Scenario: Guardar el mismo tipo no expulsa
- **WHEN** el admin guarda la ficha con el tipo ya vigente
- **THEN** `users.sessions_invalidated_at` SHALL quedar sin tocar
- **AND** la sesión del vendedor SHALL seguir siendo válida

#### Scenario: El cambio y el corte son atómicos
- **WHEN** se aplica un cambio de tipo
- **THEN** `seller_kind` y `sessions_invalidated_at` SHALL escribirse en el mismo `UPDATE`

---

### Requirement: El servidor rechaza las acciones de producto de un ponente

`api/middleware/authorization.js` SHALL exponer `requireArtistSeller`, hermano de `requireSeller`, que responde **403** con `title: 'SELLER_KIND_FORBIDDEN'` cuando el usuario autenticado es vendedor con `seller_kind = 'speaker'`.

SHALL aplicarse, como mínimo, a: `GET|POST|DELETE /api/art` de vendedor, `GET|POST|DELETE /api/others` de vendedor, `GET|POST|DELETE /api/products` de vendedor, `GET /api/seller/products`, `PUT /api/seller/products/:id/visibility`, `DELETE /api/seller/products/:id`, `PUT /api/seller/others/:id/variations` y todas las rutas `/api/seller/orders*` de envíos Sendcloud.

Ocultar una entrada de menú SHALL NOT considerarse un permiso. La prohibición vive en el servidor; el menú sólo evita ofrecer lo que no se puede hacer.

`req.user` SHALL transportar `seller_kind`, resuelto por la estrategia JWT desde la fila ya cargada, sin consulta adicional.

#### Scenario: Ponente intenta publicar obra
- **WHEN** un vendedor `speaker` envía `POST /api/art` con un token válido
- **THEN** la respuesta SHALL ser 403 con `title: 'SELLER_KIND_FORBIDDEN'`
- **AND** SHALL NOT crearse ninguna fila en `art`

#### Scenario: Ponente pide sus envíos
- **WHEN** un vendedor `speaker` llama a `GET /api/seller/orders`
- **THEN** la respuesta SHALL ser 403

#### Scenario: Artista no ve diferencia
- **WHEN** un vendedor `artist` llama a cualquiera de las rutas protegidas
- **THEN** la respuesta SHALL ser byte a byte la de antes del cambio

#### Scenario: Sin consulta extra
- **WHEN** se procesa una petición autenticada
- **THEN** la estrategia JWT SHALL ejecutar exactamente el mismo `SELECT` sobre `users` que ejecutaba antes

---

### Requirement: El menú del vendedor se compone según su tipo

`client/components/Navbar.js` SHALL componer el desplegable del vendedor, en su versión de escritorio y en la de móvil, a partir del `seller_kind` del usuario:

- `artist`: Perfil · Artículos · Mis envíos (si `SENDCLOUD_ENABLED`) · Monedero · Pedidos · Salir
- `speaker`: Perfil · Monedero · Salir

«Artículos», «Mis envíos» y «Pedidos» SHALL NOT renderizarse para un ponente. «Monedero» SHALL renderizarse para ambos: es la única vía de un ponente para ver su saldo y solicitar el cobro de sus eventos.

Las dos versiones del menú SHALL derivarse de la misma lista, no de dos condicionales paralelos: hoy son dos bloques JSX independientes y una divergencia entre ellos sólo se ve en un tamaño de pantalla.

#### Scenario: Menú de un ponente
- **WHEN** un vendedor `speaker` abre su menú de perfil
- **THEN** SHALL ver «Perfil», «Monedero» y «Salir»
- **AND** SHALL NOT ver «Artículos», «Mis envíos» ni «Pedidos»

#### Scenario: Menú de un artista
- **WHEN** un vendedor `artist` abre su menú de perfil
- **THEN** SHALL ver las entradas que veía antes del cambio, más «Monedero»

#### Scenario: Paridad escritorio-móvil
- **WHEN** el mismo vendedor abre el menú en escritorio y en móvil
- **THEN** ambas SHALL ofrecer exactamente las mismas entradas

---

### Requirement: `AuthGuard` cierra las páginas de producto a un ponente

`client/components/AuthGuard.js` SHALL aceptar una propiedad `requireSellerKind`. Cuando se declara y el `seller_kind` del usuario no coincide, el componente SHALL redirigir a `/` sin pintar el contenido, con el mismo comportamiento que ya tiene `requireRole`.

`/seller/products`, `/seller/publish` y `/seller/pedidos` SHALL declarar `requireSellerKind="artist"`.

Esto SHALL entenderse como comodidad de navegación, no como control de acceso: la autoridad es el 403 del servidor.

#### Scenario: Ponente escribe la URL a mano
- **WHEN** un vendedor `speaker` navega directamente a `/seller/publish`
- **THEN** SHALL ser redirigido a `/`
- **AND** el formulario SHALL NOT llegar a pintarse

#### Scenario: Artista entra con normalidad
- **WHEN** un vendedor `artist` navega a `/seller/products`
- **THEN** la página SHALL comportarse igual que antes del cambio

---

### Requirement: El panel de admin muestra el tipo de cada autor

`/admin/autores` SHALL mostrar el tipo de cada fila con las etiquetas «Artista» y «Ponente».

`/admin/authors/:id` (ficha de sólo lectura) SHALL mostrar el tipo entre los datos del autor y SHALL conservar el resto de la pantalla sin cambios, incluida la sección de artículos, que en un ponente aparecerá permanentemente vacía.

`/admin/authors/:id/edit` SHALL presentar el selector «Tipo de usuario» con ambas opciones y SHALL mostrar el resto de la información igual que hoy, **excepto la sección «Configuración de envío Sendcloud»**, que SHALL ocultarse cuando el autor es ponente.

Al cambiar el selector, la pantalla SHALL pedir confirmación explícita antes de guardar, advirtiendo en es-ES de que el cambio cerrará la sesión del vendedor y modificará las secciones a las que tiene acceso.

El selector de host de `/admin/espacios` SHALL seguir ofreciendo los dos tipos y SHALL indicar el tipo junto al nombre.

#### Scenario: Ficha de un ponente
- **WHEN** el admin abre `/admin/authors/:id` de un ponente
- **THEN** SHALL ver «Ponente» como tipo
- **AND** la sección de artículos SHALL mostrar su estado vacío habitual

#### Scenario: Edición de un ponente
- **WHEN** el admin abre `/admin/authors/:id/edit` de un ponente
- **THEN** SHALL NOT ver la sección «Configuración de envío Sendcloud»
- **AND** SHALL ver el resto de secciones igual que en un artista

#### Scenario: Confirmación antes de cambiar el tipo
- **WHEN** el admin cambia el selector de tipo y pulsa guardar
- **THEN** SHALL aparecer un diálogo que advierte del cierre de sesión del vendedor
- **AND** el guardado SHALL ocurrir sólo tras confirmar

#### Scenario: Selector de host
- **WHEN** el admin crea o edita un evento
- **THEN** el desplegable de host SHALL listar artistas y ponentes
- **AND** SHALL mostrar el tipo junto a cada nombre
