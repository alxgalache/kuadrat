# Diseño

## El fallo, con los datos de producción

Obra 26 (vendedor 8, `packaging_cost` = 7,39 €). Ocho zonas generadas, cuatro grupos, cuatro métodos:

```
                 método 14        método 15        método 16        método 17
               correos:premium   ce:epaq24       ce:ecommerce      ce:paq24
             ┌───────────────┬───────────────┬───────────────┬───────────────┐
  peninsula  │  z86  15,29 € │  z87  15,88 € │       —       │       —       │
  baleares   │  z88  18,13 € │       —       │  z89  18,41 € │       —       │
  canarias   │  z90  27,91 € │       —       │  z91  31,84 € │       —       │
  ceuta_mel  │  z92  18,13 € │       —       │       —       │  z93  27,34 € │
             └───────────────┴───────────────┴───────────────┴───────────────┘
```

Los ocho precios cuadran con `round(base × 1,21, 2) + 7,39`. La calculadora es correcta.

El comprador con CP 28034 (Madrid → península) ve dos opciones: 15,29 € y 15,88 €. Elige una. El servidor entonces ejecuta:

```sql
SELECT cost FROM shipping_zones WHERE shipping_method_id = 14 AND seller_id = 8 LIMIT 1
```

Hay **24 filas** que satisfacen ese `WHERE` (6 obras × 4 grupos), con 6 costes distintos entre 13,61 € y 27,91 €. Devuelve la de menor `id`, que pertenece a otra obra. `|15,29 − otra_cosa| > 0,01` → `400`.

### Las tres coordenadas

Identificar una tarifa necesita tres ejes, y la consulta rota usa uno:

| eje | qué elige | de dónde sale |
|---|---|---|
| `method_id` | la **columna** — qué modalidad quiso el comprador | `item.shipping.methodId`, ya viaja en el payload |
| `postal_code` | la **fila** — a qué grupo de zona pertenece el destino | hoy no se usa |
| `product_id` | la **tabla entera** — cada obra tiene su embalaje y su tarifa | hoy no se usa |

La intersección de las tres es única **por construcción**, no por suerte: el guardado de la calculadora es de conjunto por `(obra, grupo)` y un `option_code` aparece como mucho una vez por selección, así que `(product_id, zone_group, method_id)` es único; y los cuatro grupos particionan exactamente las 52 provincias de `ES.csv` (`api/tests/spainShippingZones.test.js`), así que un código postal cae en un grupo y solo en uno.

Para las zonas hechas a mano la unicidad no está garantizada — puede haber una zona genérica y una producto-específica para el mismo método. Ahí manda la regla que ya existe en `applyProductPriority`: específica gana a genérica, y entre empatadas la más barata. Es la regla que vio el comprador, así que es la que debe verificar el servidor.

## Decisión 1: un resolver, dos entradas — no dos consultas de acuerdo

La tentación es añadir los filtros que faltan a la consulta de `verifyShippingCosts`. Eso arregla el síntoma y deja el defecto: seguirían siendo dos consultas independientes que **deben** coincidir, mantenidas por separado, sin nada que lo obligue. Ya divergieron una vez.

```
                  ┌──────────────────────────────────────┐
                  │  api/services/shipping/zoneResolver  │
                  │  resolveShippingOptions({            │
                  │    productId, productType,           │
                  │    country, postalCode })            │
                  │                                      │
                  │  · la consulta (pickup + delivery)   │
                  │  · la prioridad producto-específica  │
                  │  · el encaje por peso y dimensiones  │
                  └──────────────────┬───────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
   getAvailableShipping     verifyShippingCosts       legacyProvider
   da forma a la            .find(methodId)           .getDeliveryOptions
   respuesta HTTP           y compara el coste        multiplica por bultos
```

`verifyShippingCosts` **no vuelve a tocar la base de datos**. Busca el método elegido en la lista que devuelve el resolver. Si no está, el método no aplica; si está, el coste correcto es el que trae. No hay forma de que difiera de lo cotizado, porque es la misma llamada.

### Firma

```js
resolveShippingOptions({ productId, productType, country, postalCode })
  → { sellerId, pickup: [Option], delivery: [Option] }

Option = {
  methodId, zoneId, cost, methodType,      // 'pickup' | 'delivery'
  name, description, maxArticles,
  estimatedDeliveryDays, maxWeight, maxDimensions,
  ...campos de recogida cuando methodType === 'pickup'
}
```

El resolver carga él mismo la fila del producto (`seller_id`, `weight`, `dimensions`, `visible = 1`), así que los llamantes no pasan `sellerId`: no puede llamarse con un vendedor que no sea el del producto.

Se conserva `visible = 1`, igual que hoy en la cotización. Una obra ocultada entre el añadir-al-carrito y el pago deja de tener envío y el pago se bloquea, que es lo correcto: no está a la venta.

`zoneId` se devuelve para trazabilidad y para poder loguear qué fila decidió el precio. **No se acepta del cliente**: aceptarlo sería dejar que el navegador eligiera la fila del precio, exactamente el agujero que este cambio cierra.

## Decisión 2: tres vocabularios, y ninguno es opcional

Es la forma más probable de romper el checkout de `other` mientras se arregla el de `art`:

| campo | valores | quién lo usa |
|---|---|---|
| `shipping_methods.article_type` | `'art'` \| **`'others'`** \| `'all'` | `getAvailableShipping`, con el parámetro de query **crudo** |
| `shipping_zones.product_type` | `'art'` \| **`'other'`** | `applyProductPriority`, normalizado en `shippingController.js:680` |
| `compactItems[].type` | `'art'` \| **`'other'`** | `verifyShippingCosts` |

`legacyProvider.js:110` hace la traducción en la otra dirección (`productType === 'other' ? 'others' : productType`), lo que confirma que la trampa ya mordió a alguien.

El resolver acepta **un solo vocabulario canónico**, el del carrito y el pago (`'art' | 'other'`), y traduce en su interior a los dos de la base de datos. `getAvailableShipping` mantiene su contrato HTTP público (`'art' | 'others'`, validado en `shippingController.js:626`) y traduce en el borde.

Si el resolver pasara `'other'` donde se espera `'others'`, **desaparecerían todos los métodos que no sean `article_type = 'all'`**. El checkout de `art` no lo notaría. Va con test propio.

## Decisión 3: la verificación resuelve contra el destino real

Hoy el precio se fija con el CP introducido al **añadir al carrito** y la dirección real se pide **después**. `ShoppingCartDrawer.js:565-575` compara ambos y bloquea, pero eso vive en el navegador.

El resolver necesita un destino. Elegir `item.shipping.deliveryPostalCode` (lo que el carrito arrastra) reproduciría el agujero dentro del código nuevo: el cliente seguiría eligiendo el precio. Se resuelve contra la dirección de entrega que el comprador acaba de validar, que ya está en memoria cuando se llama a `create-intent` (`ShoppingCartDrawer.js:432-445` valida la dirección **antes** de avanzar al paso de pago).

**Sin respaldo cuando falta.** Si algún artículo lleva método `delivery` y no llega dirección, se rechaza con `SHIPPING_ADDRESS_REQUIRED`. Un respaldo al CP del carrito sería el bypass: bastaría con omitir el campo. Consecuencia operativa: **api y client se despliegan juntos**, porque la API pasa a exigir un campo que solo envía el cliente nuevo.

Los métodos `pickup` no necesitan destino — sus zonas son del vendedor, sin filtro geográfico. Un carrito solo de recogida no necesita enviar dirección.

## Decisión 4: qué error, y qué puede hacer el comprador con él

"El coste de envío no coincide. Recarga la página." falla dos veces: no distingue causas y propone una acción inútil — el carrito está en `localStorage`, recargar no lo toca.

El código de máquina va en `title` y el texto es-ES en `message`, siguiendo el precedente de `CAPTCHA_UNAVAILABLE` (`api/controllers/inquiriesController.js:15`). El cliente ya expone `error.title` (`client/lib/api.js:179`), así que puede ramificar sin cambiar el manejo de errores.

| `title` | Causa | Acción real del comprador |
|---|---|---|
| `SHIPPING_ADDRESS_REQUIRED` | envío a domicilio sin dirección en la petición | ninguna: es un defecto de cliente, se registra en el log |
| `SHIPPING_METHOD_UNAVAILABLE` | el método no aplica a ese producto o destino | volver a elegir envío |
| `SHIPPING_COST_OUTDATED` | el método aplica, el precio cambió | quitar el producto de la cesta y volver a añadirlo |

`SHIPPING_COST_OUTDATED` no es teórico aunque sea raro: **cada vez que se regenera una obra en la calculadora, todos los carritos que ya la contienen quedan con un precio viejo** y fallan hasta que el comprador borre el producto a mano. Hoy leían "Recarga la página" y se quedaban atascados.

## Decisión 5: el guardián estructural es un test de paridad

Los tests de regresión (cada grupo valida su coste, cada obra el suyo) demuestran que el fallo actual está corregido. No impiden que vuelva.

Lo que lo impide es un test que afirme que **las dos entradas devuelven el mismo número** para el mismo `(producto, método, código postal)` — mismo espíritu que `api/tests/sentryGating.test.js`, que afirma que `instrument.js` y `config.sentry.enabled` coinciden en toda la matriz de entornos. Si alguien vuelve a escribir una consulta paralela, ese test cae.

## El flujo Sendcloud de `other` no se toca

```
OthersProductDetail.js:101   SENDCLOUD_ENABLED_OTHERS = true
        │                    → addToCart SIN shipping
        ▼
   item.shipping = null
        │
        │  paso 3: setSendcloudShipping(sellerId, sel)
        │    └─▶ CartContext.js:295 escribe SOLO en `shippingSelections`,
        │        estado PARALELO al carrito. Nunca toca item.shipping.
        ▼
   buildCompactItems (ShoppingCartDrawer.js:196) → shipping: null
        ▼
   verifyShippingCosts (paymentHelpers.js:172)
        └──▶ if (!item.shipping?.methodId) continue;   ← sale aquí
```

Los artículos Sendcloud abandonan la función en su primera línea, hoy y después del cambio. La rama que se reescribe es la de zonas legacy, a la que no llegan.

`other` **sí** tiene camino legacy — el que se usaría con `SENDCLOUD_ENABLED_OTHERS=false` (modal + zonas legacy, igual que `art` hoy). Ese camino sí pasa por el resolver, y es el que protege la decisión 2.

## Hallazgo fuera de alcance: el envío Sendcloud de `other` no se cobra

Detectado analizando lo anterior. **No lo introduce este cambio y no se corrige aquí**, pero queda escrito porque es dinero.

```
CartContext.js:220-225   getTotalPrice() = productos + legacy + sendcloudShipping
                         ──────────────────────────────────────────────────────
                         lo que ve el comprador en pantalla
                                          │  ✗ divergen
                                          ▼
ShoppingCartDrawer:659   initializeStripePayment → buildCompactItems(cart)
                                                   shipping: null en Sendcloud
paymentHelpers.js:152    computeShippingTotal → suma 0
stripePayments.js:58     amountMinor = productsTotal + 0
                         ─────────────────────────────────
                         lo que se cobra
```

`placeOrderInDatabase` (`ShoppingCartDrawer.js:690-702`) **sí** fusiona `shippingSelections` en los ítems, así que el pedido guarda un `shipping_cost` que nunca se ingresó. No hay endpoint de actualización del PaymentIntent (`initializeStripePayment:653` hace early-return si ya hay secret) y el webhook (`stripePaymentsController.js:112-140`) marca `paid` sin reconciliar importes.

Verificación pendiente antes de darlo por bueno: coger un pedido pagado reciente con `other_order_items.shipping_cost > 0` y comparar `orders.total_price` con el importe del PaymentIntent en Stripe.

Observación relacionada a comprobar en ese mismo cambio, no verificada aquí: `computeShippingTotal` (`paymentHelpers.js:152-159`) suma el envío **una vez por entrada** de `compactItems`, mientras `placeOrderInDatabase` expande `Array(item.quantity).fill(...)` y `ordersController.js:153` lo suma **una vez por unidad**. Para `art` es inocuo — el carrito prohíbe la misma obra dos veces, así que la cantidad es siempre 1.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Añadir los filtros que faltan a la consulta de `verifyShippingCosts` | Arregla el síntoma y deja tres implementaciones divergentes. Es cómo llegamos aquí. |
| Que el cliente mande el `zoneId` y el servidor lea esa fila | El navegador elegiría la fila del precio. Basta con mandar el `zoneId` de la zona peninsular y enviar a Canarias. |
| Aceptar el coste si coincide con **cualquier** zona válida del `(método, vendedor, producto)` | Permite pagar tarifa peninsular con envío a Canarias: 15,29 € contra 27,91 € en la obra 26. `placeOrder` no revalida nada, así que esta es la única defensa. |
| Resolver contra `item.shipping.deliveryPostalCode` | Reproduce el agujero dentro del código nuevo. |
| Respaldo al CP del carrito cuando falta `deliveryAddress` | Convierte el respaldo en el bypass: basta con omitir el campo. |
