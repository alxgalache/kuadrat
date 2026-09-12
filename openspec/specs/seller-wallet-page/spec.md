# seller-wallet-page

## Purpose

El monedero del vendedor como pantalla propia en `/seller/monedero`: el saldo en sus dos bolsas de régimen fiscal con su total combinado, la línea de comisiones del vendedor autenticado, el botón «Solicitar pago a 140d Galería de Arte» y el `StripeConnectBanner`.

Ese bloque vivía dentro de `client/app/orders/page.js` —una pantalla que se alcanza por un menú llamado «Pedidos» y cuyo `<h1>` decía «Monedero»—, mezclando el dinero con las estadísticas de venta y la lista de pedidos físicos. Separarlo es lo que permite ocultar «Pedidos» a un vendedor sin producto sin dejarle sin saldo ni forma de cobrar, y lo que permite que el menú de cada tipo de vendedor diga la verdad. La página es accesible para los dos tipos de vendedor y se renderiza en un solo sitio: pintar el bloque también en otra pantalla pondría dos botones de cobro para la misma acción.

> Capa afectada: frontend (`client/`). No cambia el esquema de BD ni ningún endpoint; reubica una interfaz que ya existe.

## Requirements

### Requirement: El monedero tiene ruta propia en `/seller/monedero`

El sistema SHALL exponer una ruta `/seller/monedero` que contenga, y sea el **único** lugar que contenga:

- el `StripeConnectBanner`,
- el saldo del vendedor en sus dos bolsas de régimen fiscal, con su total combinado,
- la línea de comisiones aplicables al vendedor autenticado,
- el botón «Solicitar pago a 140d Galería de Arte» y su diálogo de confirmación.

La página SHALL estar protegida por `AuthGuard requireRole="seller"` y SHALL ser accesible a los **dos** tipos de vendedor, artista y ponente.

Ese bloque vive hoy dentro de `client/app/orders/page.js`, una pantalla que se alcanza por un menú llamado «Pedidos» y cuyo `<h1>` dice «Monedero». Mezcla el dinero con las estadísticas de venta y la lista de pedidos físicos, y por eso ocultar «Pedidos» a un vendedor sin producto le dejaría sin saldo y sin forma de cobrar. Separarlo es lo que permite que el menú de cada tipo diga la verdad.

El bloque SHALL extraerse a un componente propio (`client/components/seller/SellerWallet.js`) y SHALL renderizarse en un solo sitio. Pintarlo también en otra pantalla pondría dos botones de cobro en la aplicación para la misma acción.

#### Scenario: Un ponente cobra sus eventos
- **GIVEN** un vendedor `speaker` con saldo acreditado por un evento de pago
- **WHEN** abre «Monedero» desde su menú
- **THEN** SHALL ver su saldo en la bolsa «Productos y servicios (21%)»
- **AND** SHALL poder pulsar «Solicitar pago a 140d Galería de Arte»

#### Scenario: Un artista encuentra su monedero
- **GIVEN** un vendedor `artist`
- **WHEN** abre «Monedero» desde su menú
- **THEN** SHALL ver el mismo saldo, las mismas comisiones y el mismo botón de cobro que veía en `/orders`

#### Scenario: El monedero no aparece dos veces
- **WHEN** un vendedor recorre todas sus pantallas
- **THEN** el botón «Solicitar pago a 140d Galería de Arte» SHALL aparecer exactamente en una

#### Scenario: Un comprador no alcanza la ruta
- **WHEN** un usuario con `role = 'buyer'` navega a `/seller/monedero`
- **THEN** SHALL ser redirigido fuera sin que el saldo llegue a pintarse

---

### Requirement: El aviso de Stripe Connect acompaña al monedero

`StripeConnectBanner` SHALL renderizarse en `/seller/monedero` para todo vendedor cuya cuenta conectada no esté operativa, con independencia de su tipo.

Un ponente sin Stripe Connect completado no puede recibir el pago de sus eventos, así que el aviso SHALL alcanzarle por la misma vía que a un artista. Hoy ese banner sólo se pinta en `/orders`, que es precisamente la pantalla que el ponente deja de ver.

#### Scenario: Ponente sin onboarding completado
- **GIVEN** un vendedor `speaker` con `stripe_connect_status` distinto de `'active'`
- **WHEN** abre `/seller/monedero`
- **THEN** SHALL ver el aviso de Stripe Connect con su llamada a completar el alta

#### Scenario: Vendedor con la cuenta operativa
- **GIVEN** un vendedor con `stripe_connect_status = 'active'` y transferencias habilitadas
- **WHEN** abre `/seller/monedero`
- **THEN** el aviso SHALL NOT renderizarse

---

### Requirement: El menú del vendedor lleva a «Monedero»

El desplegable del vendedor SHALL incluir una entrada «Monedero» apuntando a `/seller/monedero`, en escritorio y en móvil, para los dos tipos de vendedor.

#### Scenario: Entrada presente en ambos tipos
- **WHEN** un vendedor de cualquier tipo abre su menú
- **THEN** SHALL ver «Monedero»
- **AND** SHALL llevarle a `/seller/monedero`
