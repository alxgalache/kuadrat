## 1. Bloque 1 — El servidor deja de creer al cliente

- [x] 1.1 Ampliar el `SELECT` de `enrichItemsFromDB` en `api/controllers/shippingOptionsController.js:32` a `id, weight, dimensions, price, can_copack` para `others`, y a `id, weight, dimensions, price` para `art`
- [x] 1.2 En el `map` final de `enrichItemsFromDB`, **sobrescribir** `price` y `canCopack` con el valor de base de datos, sin el patrón `dbData?.x || item.x` que usan `weight` y `dimensions`; un valor del cliente no debe sobrevivir para estos dos campos
- [x] 1.3 Emitir `logger.warn` con el id y el nombre del producto cuando su fila no traiga `weight`, para que el respaldo de 1000 g de `sendcloudProvider.js:86` deje de ser invisible
- [x] 1.4 Eliminar `canCopack` de `shippingOptionsItemSchema` en `api/validators/shippingOptionsSchemas.js`, de modo que el campo ni se acepte ni se propague
- [x] 1.5 Dejar de enviar `canCopack`, `weight` y `dimensions` desde `client/components/shipping/ShippingStep.js:28-35`; el cuerpo pasa a ser `{ productId, productType, quantity, sellerId }`
- [x] 1.6 Test: una petición que declara `canCopack: true` sobre un producto con `can_copack = 0` produce N bultos, no uno
- [x] 1.7 Test: el valor asegurado de un bulto de 2 unidades de un producto de 20 € es 40 y no 2, sin que el cuerpo de la petición mencione ningún precio

## 2. Bloque 2 — El precio de una opción es la suma de sus bultos

- [x] 2.1 Cambiar `quoteTotal()` en `api/services/shipping/sendcloudPricing.js` para que sume `price.total.value` de **todas** las entradas de `quotes`, documentando en el propio módulo que `quotes` es una entrada por bulto (evidencia: las etiquetas `Label (1/3)`, `(2/3)`, `(3/3)` del desglose)
- [x] 2.2 Reescribir `normalizeOption()` en `api/services/shipping/sendcloudProvider.js:196-215` para que `price` use `quoteTotal(opt)` y `estimatedDays` derive del **máximo** de los `lead_time`
- [x] 2.3 Pasar el número de bultos enviados a `normalizeOption()` y emitir `logger.warn` si no coincide con `opt.quotes.length`
- [x] 2.4 Verificar que `hasUsableRate()` sigue descartando `sendcloud:letter` con N bultos (N cotizaciones de `"0"` suman 0)
- [x] 2.5 Test: una opción con tres cotizaciones de 4,35 € normaliza a 13,05 €
- [x] 2.6 Test de no regresión: con una sola cotización, `quoteTotal()` devuelve exactamente el mismo número que antes — es lo que garantiza que ni el carrito co-empaquetado ni la calculadora de arte cambian de precio
- [x] 2.7 Comprobar que `artShippingCalculator.js` (que envía `parcels: [parcel]` en `:249` y lee `quotes[0]` sólo para el `breakdown`) no requiere cambios, y fijarlo con un test

## 3. Bloque 3 — Peso volumétrico en el bulto agrupado

- [x] 3.1 Crear `api/utils/volumetricWeight.js` con `VOLUMETRIC_DIVISOR = 5000` (constante local y documentada: Sendcloud aplica 6000, y el 5000 compensa el hueco de embalaje que nuestro sumatorio de volúmenes no puede medir), `volumetricGrams(dimensions)` parseando el formato `LxAxF` y devolviendo 0 ante un valor ausente o malformado
- [x] 3.2 Añadir `parcelWeightGrams(items)` = `max(Σ peso_real_i × q_i, Σ volumétrico_i × q_i)`
- [x] 3.3 Usarlo en la rama co-empaquetable de `api/services/shipping/parcelGrouper.js:43-64`, manteniendo `dimensions: null` — el comentario de `:56` debe explicar que ahora el volumen viaja **dentro del peso** y que enviar además las medidas lo contaría dos veces
- [x] 3.4 No tocar la rama no co-empaquetable ni la de `art`: siguen enviando peso real y medidas reales, y es Sendcloud quien aplica el divisor de cada transportista y sus límites de tamaño
- [x] 3.5 Emitir `logger.warn` nombrando el producto cuando un artículo co-empaquetable no tenga `dimensions`, y tarificar ese bulto por peso real
- [x] 3.6 Test: 30x30x4 con cantidad 2 produce 1440 g (volumétrico) y no 1200 g (real)
- [x] 3.7 Test: un producto denso cuyo volumétrico es menor que su peso real se tarifica por el peso real
- [x] 3.8 Test: el bulto agrupado nunca lleva `dimensions` en el cuerpo enviado a Sendcloud; el individual siempre las lleva cuando existen

## 4. Bloque 4 — El envío se cobra, se verifica y se registra una sola vez

- [x] 4.1 Extraer a `api/services/shipping/cartQuoting.js` el núcleo compartido (`enrichItemsFromDB` + `quoteSellerGroups`), que ahora usan el endpoint de cotización y el de pago, y crear sobre él `api/services/shipping/sendcloudQuoteVerifier.js` con `verifySendcloudShipping(...)`: reconstruye los mismos bultos, recotiza por vendedor, localiza cada `shippingOptionCode` y devuelve `[{ sellerId, cost, shippingOptionCode, servicePointId }]`
- [x] 4.2 Implementar en ese servicio los tres rechazos con código de máquina en `title`: `SHIPPING_SELECTION_REQUIRED` (grupo Sendcloud sin selección), `SHIPPING_METHOD_UNAVAILABLE` (código ausente en la recotización) y `SHIPPING_COST_OUTDATED` (importe distinto del mostrado), reutilizando `SHIPPING_ADDRESS_REQUIRED` cuando falte la dirección de un grupo con entrega
- [x] 4.3 Comparar el importe del cliente contra el recotizado **en céntimos enteros**; el importe cobrado es siempre el recotizado
- [x] 4.4 Tratar la selección de recogida (`type === 'pickup'`) como coste 0 y sin necesidad de dirección
- [x] 4.5 Añadir `shippingSelections` al esquema Zod de `create-intent`, de la inicialización de Revolut y de `POST /api/orders` (`api/validators/orderSchemas.js`)
- [x] 4.6 En `api/controllers/stripePaymentsController.js:56-67`, llamar al verificador y sumar `Σ cost` al `amountMinor` junto a `computeShippingTotal(compactItems)`, que sigue cubriendo los artículos legacy
- [x] 4.7 Escribir los importes verificados en la metadata del `PaymentIntent` como `[{"s":<sellerId>,"c":<céntimos>}]`, comprobando que cabe holgadamente en el límite de 500 caracteres por clave
- [x] 4.8 En `ordersController.placeOrder`, leer esos importes del `PaymentIntent` que ya se recupera para verificar el pago, en lugar de recotizar; en el camino Revolut, recotizar con el mismo verificador
- [x] 4.9 En `placeOrder`, escribir el coste de cada grupo de vendedor **íntegro en la fila de menor id del grupo** y 0 en las demás, tanto para `art_order_items` como para `other_order_items`
- [x] 4.10 Ajustar el cálculo de `totalPrice` de `ordersController.js:162-175` para que sume ese coste una sola vez por grupo, no una por unidad
- [x] 4.11 En `client/components/ShoppingCartDrawer.js`, enviar `shippingSelections` en `initializeRevolutOrder`, `initializeStripePaymentIntent` y `placeOrderInDatabase`, y dejar de fusionar la selección Sendcloud en cada artículo expandido de `:714-740`
- [x] 4.12 Añadir `SHIPPING_SELECTION_REQUIRED` a `SHIPPING_VERIFICATION_ERRORS` en `client/lib/constants.js` con su texto es-ES
- [x] 4.13 Test de integración: un carrito de 2 unidades de un producto de 20 € con envío verificado de 4,57 € produce un `PaymentIntent` de 4457 céntimos
- [x] 4.14 Test de integración: el pedido resultante tiene `orders.total_price = 44.57`, una fila con `shipping_cost = 4.57` y otra con `0`, y las agregaciones existentes devuelven 44,57
- [x] 4.15 Test: un carrito con un grupo Sendcloud sin selección se rechaza con `SHIPPING_SELECTION_REQUIRED`
- [x] 4.16 Test: un `cost` manipulado por el cliente no cambia el importe cobrado y produce `SHIPPING_COST_OUTDATED`

## 5. Bloque 5 — El formulario de producto vuelve a funcionar

- [x] 5.1 Corregir `productCategory === 'others'` → `=== 'other'` en `client/components/ProductForm.js:519`, `:896` y `:938`
- [x] 5.2 Extender `weightRequired` a las dimensiones para productos `other` cuando `SENDCLOUD_ENABLED_OTHERS`, con el mensaje es-ES correspondiente y el formato `LxAxF` esperado
- [x] 5.3 Quitar el "(opcional)" de la etiqueta de dimensiones y marcarla con el asterisco rojo cuando sea obligatoria, igual que el peso
- [x] 5.4 Añadir la validación equivalente en `api/controllers/othersController.js` (`createOther`) y en `api/controllers/adminProductEditController.js`, que hoy no la tienen: 400 con el mensaje es-ES cuando falte peso, o dimensiones en un producto `other`, con Sendcloud activo para ese tipo
- [x] 5.5 (verificado por el operador) Comprobar manualmente que el checkbox de co-empaquetado aparece por primera vez en `/seller/publish` y en `/admin/products/[id]/edit?type=others`, y que su valor se guarda y se relee
- [x] 5.6 Blindar el predicado contra el typo. **No se puede hacer con un grep sobre `ProductForm.js`**: el contenedor `api` monta sólo `api/`, así que el fichero no existe en ninguna ruta que la suite pueda leer, y el repo no tiene runner de tests de cliente; un grep con `existsSync` se saltaría precisamente en la única forma en que la suite se ejecuta. En su lugar: (a) una sola definición de `isStoreCategory` / `isWeightRequired` / `areDimensionsRequired` sustituye a las tres copias inline que hicieron sobrevivir el typo, y (b) `api/tests/productFormCategoryPredicates.test.js` cubre la mitad de servidor de la misma regla, que es la que de verdad rechaza un producto mal formado. Riesgo residual anotado en design.md

## 6. Verificación en preproducción

- [x] 6.1 Cotizar 1 y 2 unidades de `El Límite` y comprobar la subida esperada — **verificado en vivo**: 1 ud 4,35 → **4,45 €**, 2 uds 4,57 → **4,79 €** (Correos Premium), 1 bulto en ambos casos
- [x] 6.2 Que dos bultos pasen a costar el doble — **verificado en vivo** contra la API real sin tocar datos de preproducción: 1 bulto 4,45 €, 2 bultos **8,90 €**, 3 bultos **13,35 €**, donde antes los tres devolvían 4,45 €. La otra mitad (que `can_copack = 0` produce N bultos pese a que el cliente diga lo contrario) la cubre `shippingQuoteServerTruth.test.js` contra la base local
- [x] 6.3 (verificado por el operador) Pagar un pedido de 2 unidades y comprobar que coinciden las tres cifras: importe del `PaymentIntent`, `orders.total_price` y `Σ shipping_cost` de sus filas
- [x] 6.4 (verificado por el operador) Anunciar el envío de ese pedido y comprobar que el valor asegurado del bulto es el mismo con el que se cotizó; cancelarlo acto seguido
- [x] 6.5 Comprobar que la calculadora de envíos de arte no cambia — **verificado en vivo** sobre la obra 92: cotiza con normalidad (`baseCost 5,06 €`, desglose intacto, asegurado 253 €) y sus 48 tests pasan sin tocarse; envía un solo bulto, así que la suma de cotizaciones devuelve su mismo número

## 7. Documentación

- [x] 7.1 Actualizar la sección de Sendcloud de `CLAUDE.md`: el hueco "el envío de `other` no se cobra" pasa a estar cerrado, y se documentan el peso volumétrico del bulto agrupado, la suma de cotizaciones por bulto y el registro del coste una sola vez por grupo de vendedor
- [x] 7.2 Documentar en `CLAUDE.md` la regla que no es evidente y que romperá quien toque `parcelGrouper`: **peso volumétrico y `dimensions` son excluyentes en un mismo bulto**, porque Sendcloud aplica su propio volumétrico sobre las medidas que reciba
