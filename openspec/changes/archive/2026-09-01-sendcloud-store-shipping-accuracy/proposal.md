# Envío de la tienda: cobrarlo, tarificarlo por volumen y agrupar de verdad

## Why

El envío de los productos de la tienda (`other`) se calcula hoy con cuatro entradas, y **tres de las cuatro están mal**. El resultado no es un precio aproximado: es un precio que la galería no cobra, calculado sobre un paquete que no existe, con un seguro que no es el que viaja.

Todo lo que sigue está verificado en vivo contra la cuenta real de Sendcloud, usando el único producto de la tienda (`El Límite`, id 999933, 600 g, `30x30x4`, 20 €, vendedor 96).

1. **El comprador no paga el envío.** `buildCompactItems` (`ShoppingCartDrawer.js:198-206`) envía `shipping: item.shipping`, que para un artículo Sendcloud es **`null`** — la selección vive en `shippingSelections`, un estado paralelo que nunca se escribe en el artículo. `verifyShippingCosts` los descarta en su primera línea (`if (!item.shipping?.methodId) continue`) y `computeShippingTotal` suma cero. El `PaymentIntent` sale por el importe de los productos y nada más. Con 2 unidades: **Stripe cobra 40,00 €**, el envío real cuesta 4,57 € y lo paga la galería.

2. **Y a la vez lo registra por duplicado.** `placeOrderInDatabase` sí fusiona `shippingSelections` en cada artículo, y después `Array(item.quantity).fill(baseItem)` (`:740`) expande una fila por unidad. Cada fila se lleva el coste **íntegro**. `ordersController.js:170-174` las suma todas: `orders.total_price` de ese mismo pedido queda en **49,14 €**. Ni 40,00 ni 44,57: un tercer número que no es el cobrado ni el correcto.

3. **Sólo se cotiza el primer bulto.** `POST /v3/shipping-options` devuelve **una cotización por bulto**, y así lo etiqueta en su propio desglose. Con tres bultos idénticos la respuesta trae `"Label (1/3)"`, `"Label (2/3)"` y `"Label (3/3)"`, y `sendcloudProvider.js:198` se queda con `opt.quotes?.[0]`. Verificado: 1, 2 y 3 bultos devuelven **el mismo precio en pantalla**. Después del pago, `createShipments()` sí crea N etiquetas.

4. **El seguro se cotiza a 2 € y se anuncia al valor real.** `ShippingStep.js:28-35` no envía `price` y `enrichItemsFromDB` no lo lee, así que la suma de `parcelGrouper.js:48` se ejecuta sobre ceros y `insuredValueFor(0)` cae al mínimo del rango: **2 €**. El anuncio, en cambio, parte de `price_at_purchase` y asegura el valor real. La diferencia medida sobre el mismo bulto: 4,57 € cotizado con 2 € asegurados frente a 4,79 € con 40 €, 5,75 € con 200 € y 7,55 € con 500 €. La paga la galería, y contradice literalmente lo que documenta `createShipments()`.

5. **El bulto agrupado viaja sin medidas.** `parcelGrouper.js:56` fija `dimensions: null` para el bulto co-empaquetado, así que Sendcloud tarifica **sólo por peso real**. Medido: un bulto de 1,2 kg cuesta 5,06 € sin medidas y **39,48 € declarando 60×60×60 cm** — Sendcloud aplica peso volumétrico con divisor 6000, y 216000/6000 = 36 kg. Que hoy no perdamos dinero es una coincidencia del catálogo: `30×30×4 / 6000 = 600 g`, exactamente el peso real de `El Límite`. El primer producto ligero y voluminoso que publique un artista se cotizará muy por debajo de lo que factura el transportista.

6. **`can_copack` no llega a la cotización, y además no se puede rellenar.** El campo viaja **desde el navegador** (`ShippingStep.js:35`, `item.canCopack ?? true`), el carrito nunca lo guarda (`addToCart` desestructura un juego fijo de campos y `canCopack` no está) y `enrichItemsFromDB` no lo relee. Siempre vale `true`. El anuncio posterior sí lo lee de la base de datos (`paymentsController.js:389`): un producto con `can_copack = 0` se **cotiza como un bulto y se anuncia como N**.

   Y no se puede rellenar porque `ProductForm.js:938` compara `productCategory === 'others'`, mientras que el `<select>` sólo emite `'art'` o `'other'` (`:752`) e `initialProductType` es `'art' | 'other'` (`:148`). **El checkbox no se ha renderizado nunca.** El mismo typo aparece dos veces más y las dos son peores: `:519` (`weightRequired`) evalúa a `false` para productos de tienda, así que **el peso no es obligatorio** pese a que `sendcloud-seller-config` lo exige desde hace tiempo; y `:896` nunca pinta el asterisco rojo, de modo que el formulario anuncia "(opcional)" el único dato del que depende todo el precio. Un producto de tienda sin peso se cotiza como **1 kg** por el respaldo de `sendcloudProvider.js:86`.

Ninguno de los seis es una decisión: los seis son el mismo defecto repetido — el servidor confía en un dato que no ha verificado, o se queda con el primer elemento de una lista que tiene N.

## What Changes

### Bloque 1 — El servidor deja de creer al cliente

- **`enrichItemsFromDB` amplía su `SELECT` a `price` y `can_copack`** y **sobrescribe** ambos, sin respaldo al valor del cliente. Es la misma propiedad que ya cumplen `weight` y `dimensions`, extendida a los dos campos que faltaban.
- **`canCopack` desaparece del esquema Zod** (`shippingOptionsSchemas.js`) y del cuerpo que envía `ShippingStep.js`. Un campo que el servidor ignora no debe seguir aceptándose: hoy es un endpoint público sin autenticación por el que se puede forzar el agrupamiento.
- **Consecuencia inmediata y buscada:** `parcelGrouper` empieza a producir bultos separados para los productos con `can_copack = 0`, y `totalValue` deja de ser cero, así que el seguro cotizado pasa a ser el valor real de la mercancía.

### Bloque 2 — El precio de una opción es la suma de sus bultos

- **`quoteTotal()` suma `quotes[i].price.total.value` de todas las cotizaciones**, no sólo la primera. Con un bulto el número es idéntico al de hoy, así que el camino habitual de la tienda y la calculadora de arte (que siempre envía `parcels: [parcel]`) no cambian ni un céntimo.
- `estimatedDays` pasa a ser el **máximo** de los `lead_time` — el pedido no está entregado hasta que llega el último bulto.
- `getDeliveryOptions()` registra un `warn` si el número de cotizaciones no coincide con el de bultos enviados: es la señal de que la API ha cambiado de forma bajo nuestros pies.

### Bloque 3 — Peso volumétrico en el bulto agrupado

- **Nuevo `api/utils/volumetricWeight.js`**: `volumetricGrams(dimensions)` = `L × W × H / 5000`, en gramos, y `parcelWeight(items)` = `max(Σ peso_real, Σ peso_volumétrico)`.
- **El bulto co-empaquetado pasa a enviar ese máximo como `weight`, y sigue sin enviar `dimensions`.** Las dos cosas juntas serían un doble conteo: Sendcloud aplica su propio volumétrico sobre las medidas que reciba, así que un peso ya inflado *más* las medidas se tarificaría dos veces.
- **El bulto individual (`can_copack = 0`, y `art`) no cambia**: sigue enviando peso real y medidas reales, y es Sendcloud quien aplica el divisor de cada transportista y quien hace cumplir los límites de tamaño. Es estrictamente mejor que calcularlo nosotros, y por eso ahí no calculamos nada.
- **Divisor 5000 y no 6000.** 6000 es el que aplica Sendcloud (medido), pero nuestro sumatorio de volúmenes por artículo es el **suelo** de cualquier caja real: una caja que contenga N artículos ocupa al menos la suma de sus volúmenes, más el hueco. Los dos errores apuntan en sentidos opuestos y el 5000 compensa parte del hueco que no sabemos medir.

### Bloque 4 — El envío se cobra, se verifica y se registra una sola vez

- **El carrito envía la selección por vendedor a los endpoints de pago:** `shippingSelections: [{ sellerId, shippingOptionCode, servicePointId, cost }]`, tanto a `create-intent` como a `init-order` y a `placeOrder`.
- **El servidor recotiza contra Sendcloud** con los mismos artículos y la dirección de entrega del pedido, localiza el `shippingOptionCode` elegido y **cobra ese precio**, no el del cliente. `cost` viaja únicamente para detectar deriva; nunca para cobrar.
- **Rechazos con código de máquina en `title`**, siguiendo el patrón existente: `SHIPPING_SELECTION_REQUIRED` (nuevo — un grupo de vendedor Sendcloud sin método elegido), `SHIPPING_METHOD_UNAVAILABLE` (el código ya no existe en la recotización) y `SHIPPING_COST_OUTDATED` (el precio ha cambiado desde que se mostró). Los es-ES viven en `SHIPPING_VERIFICATION_ERRORS`.
- **Comparación en céntimos enteros**, nunca con tolerancia en coma flotante.
- **El importe verificado por vendedor se guarda en la metadata del `PaymentIntent`**, y `placeOrder` lo lee de ahí en lugar de recotizar por segunda vez. Lo registrado es entonces, por construcción, lo cobrado — que es exactamente el invariante que este bloque existe para restaurar.
- **El coste se escribe una sola vez por grupo de vendedor**, íntegro en la primera fila de `art_order_items` / `other_order_items` de ese vendedor y a 0 en las demás. Mantiene correctas sin tocarlas las seis agregaciones `Σ (price_at_purchase + shipping_cost)` de `ordersController` (`:818`, `:1238`, `:1632`, `:1823`, `:2066`) y no añade ninguna columna.

### Bloque 5 — El formulario de producto vuelve a funcionar

- **Se corrige el typo `'others'` → `'other'` en las tres apariciones** de `ProductForm.js` (`:519`, `:896`, `:938`). Con eso el checkbox de co-empaquetado aparece por primera vez y el peso pasa a ser realmente obligatorio, que es lo que `sendcloud-seller-config` especifica desde su primera versión.
- **Las dimensiones pasan a ser obligatorias** para productos `other` cuando `SENDCLOUD_ENABLED_OTHERS`, con el mismo tratamiento que el peso. Sin ellas no hay peso volumétrico que calcular, y el bloque 3 se quedaría sin entrada.
- **Validación equivalente en el servidor**, en el validador compartido `api/utils/productValidation.js` que ya usan los cuatro endpoints de alta y edición. El peso **sí** estaba bien validado ahí (consulta `isSendcloudEnabled(productType)` con el valor real, sin el typo); lo que faltaba eran las dimensiones. Es decir: el requisito de peso obligatorio estaba implementado en la API y roto sólo en el formulario, de modo que el artista lo descubría al enviar en vez de al rellenar.

### Lo que NO cambia

- **El tope de 10 unidades por producto del carrito se mantiene.** Es una defensa razonable contra el abuso de un producto concreto y, con el resto arreglado, el riesgo de lo que quepa por debajo de ese tope es mucho menor.
- **`SENDCLOUD_ENABLED_ART` sigue en `false`.** El arreglo del bloque 2 lo deja preparado (dos obras serían dos bultos y hoy se cotizarían como uno), pero no se activa nada.
- **La calculadora de envíos de arte no cambia de comportamiento.** Envía siempre un bulto, así que la suma de cotizaciones del bloque 2 devuelve su mismo número.
- **`insurance_type` e `insurance_fixed_amount` siguen sin leerse.** Todo envío va asegurado por el valor de su mercancía, como ya está decidido.

## Capabilities

### New Capabilities
- `sendcloud-shipping-charge`: el envío cotizado por Sendcloud se recotiza en el servidor, se cobra en el importe del pago y se registra una sola vez por grupo de vendedor, con lo registrado igual a lo cobrado por construcción.

### Modified Capabilities
- `sendcloud-checkout-shipping`: el agrupamiento en bultos deja de depender de datos del cliente (`can_copack`, `price`) y pasa a tarificar el bulto agrupado por el mayor entre su peso real y su peso volumétrico.
- `sendcloud-provider`: el precio de una opción de envío pasa a ser la suma de las cotizaciones de todos sus bultos, y su plazo el máximo de sus `lead_time`.
- `sendcloud-seller-config`: el checkbox de co-empaquetado y el peso obligatorio pasan de estar especificados a estar implementados; las dimensiones se suman a los campos obligatorios y ambos se validan también en el servidor.

## Impact

**Base de datos:** ninguna columna nueva, ningún `safeAlter`, ninguna migración de datos.

**Backend:**
- Nuevo: `api/utils/volumetricWeight.js`, `api/services/shipping/sendcloudQuoteVerifier.js`.
- Modificado: `shippingOptionsController.js` (`SELECT` ampliado y sobrescritura), `parcelGrouper.js` (peso del bulto agrupado), `sendcloudPricing.js` (`quoteTotal` suma), `sendcloudProvider.js` (`normalizeOption`, aviso de descuadre), `paymentHelpers.js` (`computeShippingTotal` y verificación Sendcloud), `stripePaymentsController.js` y `paymentsController.js` (recotización + metadata), `ordersController.js` (coste una vez por vendedor), `othersController.js` y `adminProductEditController.js` (validación de peso y medidas), `validators/shippingOptionsSchemas.js` y `validators/orderSchemas.js`.

**Frontend:**
- Modificado: `ProductForm.js` (typo × 3, dimensiones obligatorias), `ShippingStep.js` (deja de enviar `canCopack`), `ShoppingCartDrawer.js` (`shippingSelections` en los tres endpoints, coste una vez por vendedor), `lib/constants.js` (`SHIPPING_SELECTION_REQUIRED`).

**Externo:** una llamada adicional a `POST /v3/shipping-options` por `create-intent` (~1 s medido). `placeOrder` no añade ninguna: lee el importe de la metadata del `PaymentIntent`.

**Riesgo — el comprador empieza a pagar el envío.** Es el objetivo del bloque 4, pero conviene decirlo con el número delante. Sobre `El Límite`, a Madrid, con Correos Premium:

| | hoy cotiza | hoy **cobra** | tras el cambio cotiza **y cobra** |
|---|---|---|---|
| 1 ud | 4,35 € | **0,00 €** | 4,45 € |
| 2 uds | 4,57 € | **0,00 €** | 4,79 € |
| 10 uds | 6,84 € | **0,00 €** | 8,02 € |

De los ~0,10–1,18 € de subida en la cotización, aproximadamente la mitad es el seguro real (bloque 4) y la otra mitad el volumétrico al divisor 5000 (bloque 3). El salto grande, de 0,00 € a 4,45 €, es simplemente que el envío pasa a cobrarse.

**Riesgo — deriva de tarifa durante el checkout.** Sendcloud incluye un recargo por combustible variable. Si el precio se mueve entre que el comprador lo ve y paga, el pago se rechaza con `SHIPPING_COST_OUTDATED` y tiene que volver a elegir. Es el mismo comportamiento que ya tiene el flujo legacy y se prefiere a cobrar en silencio un importe distinto del mostrado.

**Límite conocido que no se toca:** `insuredValueFor` acota a `[2, 5000]` €, y por encima de 5000 Sendcloud cobra la prima del techo sin avisar. Un carrito de tienda por encima de 5000 € quedaría infra-asegurado. Es el mismo techo ya documentado para la calculadora de arte.
