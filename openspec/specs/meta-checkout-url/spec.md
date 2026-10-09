# meta-checkout-url Specification

## Purpose

Definir la URL de compra de la tienda de Meta (`/cesta`): lectura del parámetro `products`, disponibilidad resuelta en el servidor, sustitución de la cesta, envío de la obra, resumen con subtotal, paso al cajón de compra y construcción compartida de las líneas de cesta.

## Requirements

### Requirement: Página `/cesta` como URL de compra de Meta

El cliente SHALL servir la página `https://140d.art/cesta`, en `client/app/cesta/page.js`, como URL de compra de la tienda de Instagram y Facebook.

- La página SHALL ser un componente de servidor que lee `searchParams` y resuelve los productos en el servidor, con lecturas a la API sin caché de datos (`cache: 'no-store'`). Las funciones de lectura viven en `client/lib/serverApi.js`.
- El HTML servido SHALL contener ya el resumen de los productos.
- La página SHALL declarar `robots: { index: false, follow: false }`.
- La página SHALL NOT aparecer en el sitemap ni en un `Disallow` de `robots.txt`.

#### Scenario: Meta envía al comprador
- **WHEN** el comprador llega a `/cesta?products=art_57%3A1&utm_source=IGShopping&utm_medium=Social&cart_origin=instagram`
- **THEN** el HTML de la respuesta ya muestra la obra 57 con su precio, y la página no es indexable

#### Scenario: Página sin parámetros
- **WHEN** alguien abre `/cesta` sin `products`
- **THEN** la página muestra el aviso de que no hay productos que añadir, con enlaces a `/galeria` y `/tienda`, y la cesta no cambia

### Requirement: Lectura del parámetro `products`

`products` SHALL interpretarse como una lista separada por comas de `<id>:<cantidad>`, ya decodificada de la URL. Cada `<id>` SHALL interpretarse con `parseContentId()` de `client/lib/metaPixel.js`, la contraparte de `contentId()` y la única definición del formato en el cliente:

- `art_<id>` es una obra.
- `other_<id>_v<varianteId>` es una variante de la tienda.

Un identificador con otro formato, o con una cantidad que no es un entero positivo, SHALL ignorarse. Un identificador repetido SHALL sumar sus cantidades. El parámetro `coupon` SHALL ignorarse.

#### Scenario: Dos productos
- **WHEN** `products` es `art_57:1,other_4_v12:2`
- **THEN** la página resuelve la obra 57 con cantidad 1 y la variante 12 del producto 4 con cantidad 2

#### Scenario: Identificador desconocido
- **WHEN** `products` es `fragil-1:1,art_57:1`
- **THEN** `fragil-1` se ignora y solo se resuelve la obra 57

#### Scenario: Cupón
- **WHEN** la URL lleva `coupon=VERANO`
- **THEN** la página no aplica ningún descuento ni muestra ningún error por el cupón

### Requirement: Disponibilidad y cantidades

La página SHALL decidir en el servidor qué líneas son comprables, con los predicados de `client/lib/cartItems.js`:

- Una **obra** es comprable si existe y está publicada, no está vendida (`is_sold`), no está en subasta (`for_auction`) ni en sorteo (`for_draw`), y si `getArtCta()` devuelve `'cart'`. Su cantidad SHALL ser siempre 1.
- Una **variante de la tienda** es comprable si el producto existe, está publicado y no está vendido, si la variante pertenece a ese producto y tiene stock, y si `PAYMENT_ENABLED` está activo. Su cantidad SHALL limitarse a su stock y a 10, el máximo del selector de la ficha.

Las líneas no comprables SHALL mostrarse en un bloque aparte, «Ya no está disponible», con enlace a su ficha cuando el producto sigue publicado.

#### Scenario: Obra vendida desde que Meta leyó el feed
- **WHEN** `products` es `art_57:1` y la obra 57 ya está vendida
- **THEN** la obra aparece como «Ya no está disponible», con enlace a su ficha, y no se añade a la cesta

#### Scenario: Cantidad mayor que el stock
- **WHEN** `products` es `other_4_v12:5` y la variante 12 tiene stock 2
- **THEN** la línea se muestra y se añade con cantidad 2

#### Scenario: Cantidad de una obra
- **WHEN** `products` es `art_57:3`
- **THEN** la obra se muestra y se añade con cantidad 1

### Requirement: Sustitución de la cesta

El componente cliente de `/cesta` SHALL esperar a que `CartContext` haya leído `localStorage` (`isInitialized`) antes de modificar la cesta.

- Si hay al menos una línea comprable, SHALL vaciar la cesta (`clearCart`) y añadir las líneas de la tienda en ese momento, sin envío, porque Sendcloud lo resuelve en el cajón.
- Si no hay ninguna línea comprable, la cesta SHALL NOT modificarse.

Al recargar la página, la cesta SHALL volver a sustituirse por los productos de la URL, y SHALL NOT acumular cantidades.

#### Scenario: Comprador con cesta previa
- **WHEN** un comprador con dos obras en la cesta llega a `/cesta?products=other_4_v12:1`
- **THEN** la cesta pasa a contener solo la variante 12 del producto 4, con cantidad 1

#### Scenario: Recarga
- **WHEN** el comprador recarga `/cesta?products=other_4_v12:1`
- **THEN** la cesta sigue conteniendo esa variante con cantidad 1, no 2

#### Scenario: Nada disponible
- **WHEN** todas las líneas de `products` son no comprables
- **THEN** la cesta previa del comprador queda intacta

### Requirement: Envío de la obra en `/cesta`

Cada obra comprable SHALL añadirse a la cesta con su envío ya elegido, como en la ficha:

- La página muestra para cada obra una acción «Elegir envío» que abre `ShippingSelectionModal` (`client/components/ShippingSelectionModal.js`), y la obra se añade al elegir el método.
- Si la cesta ya tiene una obra del mismo artista con envío elegido (`getSellerArtShipping`), la obra SHALL añadirse con ese envío, sin abrir el modal.

`SENDCLOUD_ENABLED_ART` SHALL NOT cambiar.

#### Scenario: Dos obras del mismo artista
- **WHEN** `products` trae dos obras del mismo artista y el comprador elige el envío de la primera
- **THEN** la segunda se añade con el mismo envío sin abrir el modal, y la página lo indica

#### Scenario: Obra sin envío elegido
- **WHEN** el comprador no ha elegido el envío de una obra
- **THEN** esa obra no está en la cesta y la acción para continuar está desactivada

### Requirement: Resumen con precio y subtotal

La página SHALL mostrar, para cada línea comprable:

- la imagen principal;
- el nombre, el artista y, en la tienda, la variante;
- la cantidad y el precio unitario.

Debajo SHALL mostrar el subtotal de los productos, sumado en céntimos enteros, con una nota de que el envío se calcula en el paso siguiente. La página SHALL funcionar en anchura de móvil.

#### Scenario: Subtotal
- **WHEN** las líneas comprables son una obra de 350 € y dos unidades de una variante de 19,90 €
- **THEN** el subtotal mostrado es 389,80 €

### Requirement: Paso al cajón de compra

La acción «Continuar con la compra» de `/cesta` SHALL activarse cuando todas las líneas comprables estén en la cesta, y SHALL abrir el cajón de compra con el evento `open-cart-drawer` (`window.dispatchEvent(new CustomEvent('open-cart-drawer'))`), el mismo que ya escucha `Navbar` (`client/components/Navbar.js`) y que usan las páginas de pago fallido y cancelado. `Navbar` SHALL NOT cambiar. La compra SHALL seguir el flujo actual del cajón, que permite pagar sin registrarse y con los métodos de pago exprés de Stripe.

`CartContext` (`client/contexts/CartContext.js`) SHALL exponer `isInitialized`, memorizado como el resto de su valor.

#### Scenario: Continuar
- **WHEN** todas las líneas comprables están en la cesta y el comprador pulsa «Continuar con la compra»
- **THEN** se abre el cajón de compra en el paso de la cesta, con esos productos

#### Scenario: Cajón en el resto del sitio
- **WHEN** se navega por cualquier otra página
- **THEN** el cajón se abre y se cierra exactamente igual que antes del cambio

### Requirement: Modo cotización y pagos desactivados

Si `PAYMENT_ENABLED` está desactivado, o si para una obra `getArtCta()` no devuelve `'cart'`, esas líneas SHALL mostrarse con enlace a su ficha, donde está la acción que corresponda (cotización o consulta), y SHALL NOT añadirse a la cesta.

#### Scenario: Tienda en modo cotización
- **WHEN** `NEXT_PUBLIC_ART_BUY_AVAILABLE=false` y `products` es `art_57:1`
- **THEN** la página muestra la obra con enlace a su ficha y la cesta no cambia

### Requirement: Construcción compartida de las líneas de cesta

Las líneas de cesta SHALL construirse con `artCartItem(product, shipping)` y `otherCartItem(product, variant, quantity, shipping)`, de `client/lib/cartItems.js`. Ese módulo SHALL contener también `getArtCta()` (que sale de `ArtProductDetail.js`) e `isArtPurchasable` e `isVariantPurchasable`.

`client/app/galeria/p/[id]/ArtProductDetail.js` y `client/app/tienda/p/[id]/OthersProductDetail.js` SHALL usar esos constructores en lugar de escribir el objeto en cada llamada a `addToCart`. Su comportamiento SHALL NOT cambiar.

#### Scenario: Añadir desde la ficha de una obra
- **WHEN** un comprador añade una obra a la cesta desde su ficha, con el envío elegido en el modal
- **THEN** la línea guardada en `localStorage` tiene la misma identidad, precio, cantidad, imagen y envío que antes del cambio, y además `weight` y `dimensions`, que nada lee

#### Scenario: Añadir desde la ficha de la tienda
- **WHEN** un comprador añade dos unidades de una variante desde su ficha
- **THEN** la línea guardada tiene la misma identidad, precio, cantidad, variante, imagen y envío que antes del cambio

### Requirement: Textos en español centralizados

Todos los textos visibles de `/cesta` SHALL vivir en `client/lib/constants.js`, bajo `META_CHECKOUT_COPY`.

#### Scenario: Texto nuevo
- **WHEN** se revisa el componente de `/cesta`
- **THEN** no contiene literales de texto visibles; todos salen de `META_CHECKOUT_COPY`
