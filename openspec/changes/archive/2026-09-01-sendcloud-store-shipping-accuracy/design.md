## Context

El flujo de envío de la tienda tiene dos mitades que nunca se han comparado entre sí. La **cotización** (`POST /api/shipping/options` → `parcelGrouper` → `sendcloudProvider.getDeliveryOptions`) trabaja con datos que en parte vienen del navegador y produce un número que se enseña al comprador. El **anuncio** (`paymentsController.announceShipments` → `sendcloudProvider.createShipments`) trabaja con datos leídos de la base de datos y produce las etiquetas que se pagan de verdad. Las dos mitades discrepan en tres ejes — co-empaquetado, valor asegurado y número de bultos — y ninguna discrepancia produce error: el envío sale, la etiqueta se imprime y la diferencia se paga.

Encima de eso, el número que la cotización produce **nunca llega al cobro**, porque la selección Sendcloud vive en `shippingSelections` (un estado paralelo al carrito) y los endpoints de pago sólo miran `item.shipping`.

Este cambio no introduce funcionalidad nueva: hace que las dos mitades hablen del mismo paquete y que el número que se enseña sea el que se cobra.

## Goals / Non-Goals

**Goals**
- Que el importe cobrado, el mostrado y el registrado en base de datos sean el mismo número, por construcción y no por coincidencia.
- Que el bulto que se cotiza sea el bulto que se anuncia: mismos artículos, mismo valor asegurado, mismo recuento.
- Que un producto voluminoso y ligero no se cotice por debajo de su coste real.
- Que `can_copack` sea rellenable por el artista y respetado por el servidor.

**Non-Goals**
- Activar Sendcloud para `art` (`SENDCLOUD_ENABLED_ART` sigue en `false`).
- Cambiar el tope de 10 unidades del carrito.
- Tocar la calculadora de envíos de arte, ni el proveedor legacy, ni `zoneResolver`.
- Empaquetado inteligente (bin packing): decidir cuántas cajas hacen falta y de qué tamaño queda fuera. Aquí un grupo co-empaquetable sigue siendo exactamente un bulto.
- Leer `insurance_type` / `insurance_fixed_amount`. Siguen sin lector, por decisión anterior.

## Decisions

### D1 — `can_copack` y `price` se leen de la base de datos, sin respaldo al valor del cliente

`enrichItemsFromDB` ya existe precisamente para esto y su comentario lo dice: *"Overrides any frontend-provided values to ensure accuracy"*. Sólo que su `SELECT` se quedó en `weight, dimensions`. Se amplía a `price, can_copack` y los dos se **sobrescriben**, sin el patrón `dbData?.x || item.x` que usan los otros dos.

La diferencia importa: `weight` con respaldo es defendible porque el valor del cliente también salió de la base de datos al añadir al carrito. `can_copack` y `price` no admiten respaldo, porque un respaldo es una vía para fijarlos desde fuera — y el endpoint es público y sin autenticación. Por eso `canCopack` sale además del esquema Zod: un campo que el servidor ignora pero sigue aceptando es una invitación a que alguien lo pruebe.

`other_vars` no tiene columna de precio ni de peso (sólo `key`, `value`, `stock`), así que el precio y el peso de una variante son siempre los de su producto padre. No hay caso especial que tratar.

### D2 — `quoteTotal` suma todas las cotizaciones, y por qué eso no cambia nada de lo que hoy funciona

La evidencia está en la propia respuesta de Sendcloud. Con tres bultos idénticos de 0,6 kg:

```
quotes: [
  { price: { breakdown: [{ label: "Label (1/3)", ... }], total: "4.35" } },
  { price: { breakdown: [{ label: "Label (2/3)", ... }], total: "4.35" } },
  { price: { breakdown: [{ label: "Label (3/3)", ... }], total: "4.35" } }
]
```

`quotes` es **una entrada por bulto**, no una lista de alternativas entre las que elegir. Quedarse con `[0]` es cobrar una etiqueta de tres.

Se cambia `quoteTotal()` en `sendcloudPricing.js` en lugar de añadir una función nueva, porque el significado correcto de "el total de esta opción para esta petición" es la suma, y tener dos funciones casi iguales invita a llamar a la equivocada. Con un solo bulto la suma es el primer elemento, así que:

- el bulto co-empaquetado de la tienda (siempre uno) devuelve el mismo número que hoy;
- la calculadora de arte, que envía `parcels: [parcel]` en `artShippingCalculator.js:249`, devuelve el mismo número que hoy;
- `hasUsableRate()`, que se apoya en `quoteTotal()`, sigue descartando `sendcloud:letter` (N bultos a `"0"` suman 0).

El desglose (`breakdown`) de la calculadora de arte sigue leyendo `quotes[0]`, que es correcto ahí porque sólo hay uno. Un test fija esa equivalencia para que el cambio de semántica no se filtre a esa pantalla.

`estimatedDays` pasa a `Math.max(...lead_time)`: con varios bultos el pedido no está entregado hasta el último.

### D3 — El volumétrico se calcula sólo donde no conocemos la caja

Sendcloud aplica peso volumétrico con divisor **6000** (medido: 60×60×60 cm y 1,2 kg reales se tarificaron como 36 kg = 216000/6000, y el precio pasó de 5,06 € a 39,48 €). Lo aplica **por transportista y sobre las medidas que reciba**. De ahí la regla:

```
bulto individual  (can_copack = 0, art)
    → weight = peso real  +  dimensions = medidas reales
    → lo calcula Sendcloud, con el divisor de cada transportista
      y haciendo cumplir sus límites de tamaño.          SIN CAMBIOS

bulto agrupado    (can_copack = 1, N artículos)
    → weight = max( Σ peso_real_i × q_i ,  Σ volumétrico_i × q_i )
    → dimensions = null                                   (se mantiene)
```

**Nunca las dos cosas a la vez.** Enviar un peso ya inflado *y* las medidas haría que Sendcloud volviese a aplicar el volumétrico sobre ellas: doble conteo. Como del bulto agrupado no conocemos la caja, la única entrada honesta es el peso.

**Por qué 5000 y no 6000.** Σ de los volúmenes de los artículos es el **suelo** de cualquier caja real: la caja que los contiene ocupa al menos eso, más el hueco que no sabemos estimar. Ese sesgo tira hacia abajo. Un divisor menor tira hacia arriba (5000 da un 20 % más de peso volumétrico que 6000). Se eligen 5000 para que los dos sesgos se compensen en vez de acumularse, y porque la dirección segura del error es cobrar de más al comprador antes que perder dinero en cada envío. 5000 es además el divisor de DHL, UPS y GLS, así que no es un número inventado.

Sobre `El Límite` (30×30×4 = 3600 cm³): volumétrico 720 g frente a 600 g reales. Dos unidades pasan de 1,20 kg a `max(1,20 ; 1,44) = 1,44 kg`, y de 4,57 € a 4,79 € con Correos Premium.

**Producto sin medidas.** El bloque 5 las hace obligatorias en el formulario y en la API, pero un producto anterior puede no tenerlas. En ese caso el volumétrico no se calcula y el bulto se tarifica por peso real, como hoy, con un `logger.warn` que nombra el producto. Se prefiere a rechazar la cotización: dejar de vender un producto del catálogo por un dato que faltaba es un daño mayor que cotizarlo como hasta ahora. Si en el futuro se quiere endurecer, el punto de rechazo es ese mismo `warn`.

### D4 — El seguro cotizado deja de ser el mínimo del rango

Con `price` leído de la base de datos, `parcelGrouper.js:48` (`totalValue += (item.price || 0) * qty`) deja de sumar ceros y `insuredValueFor(totalValue)` devuelve el valor real en vez del suelo de 2 €. No hay código nuevo: el cálculo ya estaba escrito, sólo le faltaba la entrada.

Con eso la cotización y el anuncio quedan alineados: el anuncio parte de `price_at_purchase`, y `loadProductsDetails` cobra sobre el precio vigente, así que ambos números son el mismo salvo que el artista cambie el precio entre el pago y el anuncio — caso en que el desajuste sería de céntimos y el anuncio, que es el que viaja, seguiría siendo el correcto.

Coste medido del seguro real, sobre un bulto de 1,2 kg con Correos Premium: 4,57 € (asegurado 2 €), 4,79 € (40 €), 5,75 € (200 €), 7,55 € (500 €), 10,55 € (1000 €).

### D5 — El precio se recotiza en el servidor, y el importe del cliente sólo sirve para detectar deriva

Es el mismo principio que `verifyShippingCosts` documenta para el flujo legacy: *"el precio mostrado y el precio validado son el mismo número, en lugar de dos números que tienen que coincidir"*. Aplicado aquí:

```
cliente → shippingSelections: [{ sellerId, shippingOptionCode, servicePointId, cost }]
                                                                              │
                    create-intent recotiza POST /v3/shipping-options ─────────┤
                    con los MISMOS artículos y la dirección de ENTREGA        │
                              │                                              │
        ¿existe el código?  no → 400 SHIPPING_METHOD_UNAVAILABLE              │
        ¿grupo sin elegir?  sí → 400 SHIPPING_SELECTION_REQUIRED              │
        ¿cost ≠ recotizado? sí → 400 SHIPPING_COST_OUTDATED ──────────────────┘
                              │                                    (en céntimos enteros)
                              ▼
        amount = productos + Σ precio_recotizado_por_vendedor
```

`cost` viaja **sólo** para el tercer contraste. Lo que se cobra es siempre el número recién recotizado, nunca el del navegador. Y el contraste no es paranoia redundante: sin él, un recargo por combustible que se moviese entre la pantalla y el pago haría que el comprador pagase en silencio algo distinto de lo que vio.

La comparación es en **céntimos enteros**, por la razón ya documentada en `zoneResolver`: `Math.abs(a - b) > 0.01` no expresa "un céntimo de tolerancia", porque 15,30 y 15,29 distan `0.010000000000001563` en coma flotante.

La dirección con la que se recotiza es la **dirección de entrega del pedido**, nunca la que el carrito capturó al añadir el producto — mismo criterio y mismo `SHIPPING_ADDRESS_REQUIRED` que ya usa el flujo legacy.

**Coste:** una llamada más a Sendcloud por `create-intent`, ~1 s medido. Se acepta: ocurre una vez por intento de pago, no por render.

### D6 — `placeOrder` lee el importe de la metadata del `PaymentIntent`, no lo vuelve a cotizar

Recotizar por segunda vez en `placeOrder` reintroduciría exactamente el defecto que este cambio arregla: dos números que tienen que coincidir. Entre `create-intent` y `placeOrder` han pasado los segundos del formulario de tarjeta, y una tarifa que se mueva en esa ventana produciría un pedido cuyo registro no cuadra con su cobro.

`create-intent` escribe en la metadata del `PaymentIntent` la forma compacta `[{"s":96,"c":457}]` (vendedor, céntimos), muy por debajo del límite de 500 caracteres por clave. `placeOrder` lo recupera con una llamada a `retrievePaymentIntent` — contra lo que se supuso al escribir este diseño, no recuperaba el intent en ningún momento: sólo guardaba su id. Es una llamada más **a Stripe**, no a Sendcloud, que es la que importaba evitar. **Lo registrado es lo cobrado porque es literalmente el mismo dato.**

Si la metadata no está (un intent anterior a este cambio) o la llamada falla, `placeOrder` recotiza, con un `warn` que lo dice. Degradar a lo que hacía antes es preferible a rechazar un pago ya cobrado.

Revolut (legacy) no tiene ese vehículo: en su camino `placeOrder` recotiza, con la misma verificación que `init-order`. Es aceptable porque Revolut está en desuso y porque el defecto que se reintroduce ahí es el que ya existe hoy en todas partes.

### D7 — El coste se registra íntegro en la primera fila de cada grupo de vendedor

El coste de envío Sendcloud es **por vendedor**, pero `art_order_items` y `other_order_items` lo guardan **por fila**, y `ShoppingCartDrawer.js:740` expande una fila por unidad. Hoy eso duplica el coste tantas veces como unidades haya.

```
2 uds de El Límite, envío verificado 4,57 €

  ANTES                          DESPUÉS
  fila 1  price 20,00  ship 4,57   fila 1  price 20,00  ship 4,57
  fila 2  price 20,00  ship 4,57   fila 2  price 20,00  ship 0,00
          Σ = 49,14 €                      Σ = 44,57 €
          cobrado: 40,00 €                 cobrado: 44,57 €
```

Se descartan las dos alternativas por la misma razón: seis consultas de `ordersController` (`:818`, `:1238`, `:1632`, `:1823`, `:2066`, y la del detalle de pedido) hacen `sum + item.price_at_purchase + (item.shipping_cost || 0)`, y también leen de ahí las facturas, los payouts y el export fiscal. Una columna `orders.shipping_total` obligaría a revisarlas todas para que no cuenten el envío dos veces ni ninguna. Un reparto proporcional (2,285 € por fila) introduce céntimos de redondeo que después hay que cuadrar contra el importe cobrado.

Poner el importe íntegro en una fila mantiene las seis agregaciones correctas **sin tocar ninguna** y sin cambiar el esquema. La fila elegida es la de menor `id` del grupo, para que sea determinista y reproducible al releer el pedido.

El campo sigue significando lo mismo para los artículos legacy y para `art`, donde cada artículo sí tiene su propio envío. Lo que cambia es sólo cómo se rellena para un grupo Sendcloud.

### D8 — Tres apariciones del mismo typo, y por qué el arreglo es más grande de lo que parece

`ProductForm.js` compara `productCategory === 'others'` en tres sitios, y `productCategory` sólo puede valer `'art'` o `'other'`:

| línea | expresión | evalúa a | efecto observado |
|---|---|---|---|
| `:938` | `productCategory === 'others' && SENDCLOUD_ENABLED_OTHERS` | siempre `false` | el checkbox de co-empaquetado no se ha renderizado nunca |
| `:519` | `(… 'art' && ART) \|\| (… 'others' && OTHERS)` | `false` para tienda | el peso no es obligatorio, pese a estar especificado |
| `:896` | idéntica a `:519` | `false` para tienda | el formulario etiqueta el peso como "(opcional)" |

Arreglar `:938` es lo que hace rellenable `can_copack`; sin el bloque 1 ese valor seguiría sin llegar a la cotización, y sin `:938` el bloque 1 leería de base de datos un campo que nadie puede escribir. Los dos se necesitan.

Arreglar `:519` y `:896` **hace cumplir en el formulario por primera vez** un requisito que `sendcloud-seller-config` ya declara ("Weight mandatory when Sendcloud is enabled"). Su escenario de validación en servidor sí estaba implementado, en el validador compartido `api/utils/productValidation.js`, que consulta `isSendcloudEnabled(productType)` con el valor correcto — el typo vivía sólo en el cliente. El efecto neto era el peor de los dos mundos: el formulario no pedía el peso y la API lo rechazaba al enviar. Las dimensiones se añaden a ese mismo validador compartido, no a cada controlador.

El respaldo silencioso que esto cierra está en `sendcloudProvider.js:86`: `String((parcel.weight || 1000) / 1000)`. Un producto de tienda sin peso se cotiza hoy **como si pesara 1 kg**, sin ningún aviso.

## Risks / Trade-offs

**El comprador empieza a pagar el envío.** De 0,00 € a 4,45 € en el caso más pequeño. Es el objetivo, pero es un cambio de precio visible y conviene desplegarlo sabiéndolo, no descubrirlo en el primer pedido.

**El divisor 5000 encarece ligeramente todo envío de tienda** frente al 6000 que aplica Sendcloud. Es deliberado (D3) y el margen es del 20 % sobre el componente volumétrico, no sobre el precio. Si el catálogo evoluciona hacia productos densos donde el volumétrico nunca manda, el divisor deja de tener efecto por sí solo.

**`SHIPPING_COST_OUTDATED` puede interrumpir un pago** si el recargo por combustible se mueve durante el checkout. Se prefiere a cobrar en silencio un importe distinto del mostrado, y es el comportamiento que el flujo legacy ya tiene. Si en producción resultase frecuente, la salida no es subir una tolerancia sino refrescar la cotización al entrar en el paso de pago.

**Un producto antiguo sin medidas se sigue cotizando sólo por peso.** Queda un `warn` en el log que lo nombra. Es la concesión consciente de D3.

**La mitad de cliente del predicado de categoría no tiene test automático.** El contenedor `api` monta sólo `api/`, así que ninguna prueba de la suite puede leer `client/components/ProductForm.js`, y el repo no tiene runner de tests de cliente (`CLAUDE.md` ya lo recoge). Un grep guardado con `existsSync` se saltaría en la única forma en que la suite se ejecuta, que es peor que no tenerlo. Lo que sí protege la propiedad es que ahora hay **una sola definición** de cada predicado (`isStoreCategory`, `isWeightRequired`, `areDimensionsRequired`) en lugar de tres copias inline — que es exactamente lo que permitió que el typo sobreviviera. La mitad de servidor, que es la que rechaza el producto, sí tiene test. Es el primer sitio donde un runner de tests de cliente habría pagado su coste.

**Un carrito de tienda por encima de 5000 €** queda infra-asegurado: `insuredValueFor` acota, y Sendcloud cobra la prima del techo sin error. Mismo límite ya documentado para la calculadora de arte, no se aborda aquí.

**Dos bloques cambian el precio y uno cambia lo que se cobra**, así que api y cliente deben desplegarse juntos: el servidor pasa a exigir `shippingSelections` en los endpoints de pago y un cliente antiguo no los envía.

## Migration Plan

Sin migración de datos: ninguna columna nueva, ningún backfill. `El Límite`, el único producto de la tienda, ya tiene peso (600 g), medidas (`30x30x4`) y `can_copack = 1`, así que las validaciones nuevas no invalidan el catálogo existente.

Orden de despliegue: api y cliente **a la vez**. El servidor empieza a rechazar un pago sin `shippingSelections` (`SHIPPING_SELECTION_REQUIRED`) y un cliente antiguo no los envía.

Verificación en preproducción, en este orden:
1. Cotizar 1 y 2 unidades y comprobar que el precio sube según la tabla de la propuesta.
2. Marcar un producto con `can_copack = 0`, cotizar 2 unidades y comprobar que el precio pasa a ser el de dos bultos y no el de uno.
3. Pagar un pedido de 2 unidades y comprobar las tres cifras: importe del `PaymentIntent`, `orders.total_price` y `Σ shipping_cost` de sus filas. Las tres iguales.
4. Anunciar el envío y comprobar que el valor asegurado del bulto coincide con el cotizado.

## Open Questions

Ninguna bloqueante. Dos decisiones quedan tomadas pero son reversibles sin coste si la realidad las contradice: el divisor volumétrico (5000, D3) y el rechazo estricto ante deriva de tarifa (D5).
