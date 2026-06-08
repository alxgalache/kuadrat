## ADDED Requirements

### Requirement: Toggles de entorno para la compra

El cliente SHALL exponer dos flags derivados de variables de entorno build-time, leídos en `client/lib/constants.js`:

- `PAYMENT_ENABLED` = `process.env.NEXT_PUBLIC_PAYMENT_ENABLED !== 'false'`
- `ART_BUY_AVAILABLE` = `process.env.NEXT_PUBLIC_ART_BUY_AVAILABLE !== 'false'`

Ambos SHALL ser fail-safe: cuando la variable no está definida, el flag SHALL valer `true` (preservando el comportamiento actual). Solo el valor literal `'false'` SHALL desactivar el flag.

#### Scenario: Variable sin definir se comporta como activada

- **WHEN** `NEXT_PUBLIC_PAYMENT_ENABLED` no está presente en el bundle
- **THEN** `PAYMENT_ENABLED` vale `true`
- **AND** lo mismo aplica a `ART_BUY_AVAILABLE` respecto a `NEXT_PUBLIC_ART_BUY_AVAILABLE`.

#### Scenario: Valor 'false' desactiva el flag

- **WHEN** `NEXT_PUBLIC_PAYMENT_ENABLED` vale exactamente `'false'`
- **THEN** `PAYMENT_ENABLED` vale `false`.

#### Scenario: Cualquier otro valor activa el flag

- **WHEN** `NEXT_PUBLIC_ART_BUY_AVAILABLE` vale `'true'` (o cualquier cadena distinta de `'false'`)
- **THEN** `ART_BUY_AVAILABLE` vale `true`.

### Requirement: CTA condicionado en ficha de obra (art)

La ficha pública de una obra (`/galeria/p/[id]`, componente `ArtProductDetail`) SHALL decidir qué call-to-action mostrar en el bloque de acción a partir de `PAYMENT_ENABLED` y `ART_BUY_AVAILABLE`, salvo cuando la obra esté vendida (en cuyo caso prevalece el botón "Vendido" deshabilitado existente). La lógica SHALL ser:

- `!PAYMENT_ENABLED && !ART_BUY_AVAILABLE` → no se renderiza ningún botón de acción.
- `PAYMENT_ENABLED && ART_BUY_AVAILABLE` → se renderiza el botón "Añadir a la cesta" con su comportamiento actual (carrito + envío).
- En cualquier otro caso (exactamente uno de los dos a `true`) → se renderiza el botón "Solicitar cotización".

#### Scenario: Ambos desactivados ocultan el botón

- **WHEN** `PAYMENT_ENABLED` es `false` y `ART_BUY_AVAILABLE` es `false` y la obra no está vendida
- **THEN** no se renderiza ni "Añadir a la cesta" ni "Solicitar cotización".

#### Scenario: Ambos activados muestran añadir a la cesta

- **WHEN** `PAYMENT_ENABLED` es `true` y `ART_BUY_AVAILABLE` es `true` y la obra no está vendida
- **THEN** se renderiza el botón "Añadir a la cesta" con la lógica de carrito existente intacta.

#### Scenario: Pago activado pero compra de arte no disponible muestra cotización

- **WHEN** `PAYMENT_ENABLED` es `true` y `ART_BUY_AVAILABLE` es `false` y la obra no está vendida
- **THEN** se renderiza el botón "Solicitar cotización".

#### Scenario: Compra de arte disponible pero pago desactivado muestra cotización

- **WHEN** `PAYMENT_ENABLED` es `false` y `ART_BUY_AVAILABLE` es `true` y la obra no está vendida
- **THEN** se renderiza el botón "Solicitar cotización".

#### Scenario: Obra vendida prevalece sobre los toggles

- **WHEN** la obra tiene `is_sold === 1`
- **THEN** se renderiza el botón "Vendido" deshabilitado independientemente del valor de los toggles.

### Requirement: CTA condicionado en ficha de producto (other)

La ficha pública de un producto `other` (`/tienda/p/[id]`, componente `OthersProductDetail`) SHALL mostrar el botón "Añadir a la cesta" únicamente cuando `PAYMENT_ENABLED` sea `true`. `ART_BUY_AVAILABLE` NO SHALL afectar a las fichas de `other`. El estado "Vendido"/sin stock existente SHALL seguir prevaleciendo.

#### Scenario: Pago activado muestra añadir a la cesta

- **WHEN** `PAYMENT_ENABLED` es `true` y la variación seleccionada tiene stock
- **THEN** se renderiza el botón "Añadir a la cesta" (y el selector de cantidad) con la lógica existente.

#### Scenario: Pago desactivado oculta el botón

- **WHEN** `PAYMENT_ENABLED` es `false` y el producto no está vendido
- **THEN** no se renderiza el botón "Añadir a la cesta" (ni el selector de cantidad asociado a la compra).

#### Scenario: ART_BUY_AVAILABLE no afecta a other

- **WHEN** `PAYMENT_ENABLED` es `true` y `ART_BUY_AVAILABLE` es `false`
- **THEN** la ficha de `other` sigue mostrando "Añadir a la cesta" (el toggle de arte no aplica aquí).

### Requirement: Botón "Solicitar cotización" abre el modal de cotización

Cuando la ficha de obra muestre el botón "Solicitar cotización", éste SHALL tener el mismo estilo visual que "Añadir a la cesta" (botón primario negro a ancho completo) y, al hacer click, SHALL abrir el modal `ArtProductQuoteModal` con el formulario vacío.

#### Scenario: Click abre el modal de cotización

- **WHEN** el usuario hace click en el botón "Solicitar cotización"
- **THEN** se abre el modal `ArtProductQuoteModal` con el formulario vacío y el widget de Turnstile montado.
