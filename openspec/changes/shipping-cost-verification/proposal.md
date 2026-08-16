# Resolución única de zonas de envío y verificación del coste contra el destino real

## Why

Desde el despliegue de la calculadora de envíos, **ningún comprador puede pagar una obra de la galería**. El botón "Ir al pago" responde `400` con "El coste de envío no coincide. Recarga la página." — un consejo además inútil, porque el carrito vive en `localStorage` y recargar no lo cambia.

La causa está en `api/utils/paymentHelpers.js:181-192`. La verificación del coste de envío en `create-intent` resuelve la tarifa así:

```sql
SELECT sz.cost FROM shipping_zones sz
 WHERE sz.shipping_method_id = ? AND sz.seller_id = ?
 LIMIT 1
```

No filtra por producto, ni por destino, ni ordena. Coge una fila arbitraria — con `idx_shipping_zones_method`, la de menor `id` — y exige que el coste enviado por el cliente coincida con ella.

Eso funcionó mientras hubo **una zona por `(método, vendedor)`**. La calculadora rompió esa premisa por diseño y en dos ejes a la vez:

- `ensureShippingMethod` (`api/services/shipping/artShippingCalculator.js:360`) cachea el `shipping_methods` por `sendcloud_option_code`, no por obra ni por grupo: `shipping_methods` es un catálogo de **modalidades**. Así que `correos:premium` es un único `shipping_method_id` compartido por todas las obras y los cuatro grupos de zona.
- Cada `(obra, grupo)` inserta su propia fila en `shipping_zones` con su propio `cost`.

Medido en producción (16/08/2026): el método 14 (`correos:premium`) tiene **24 zonas** para el vendedor 8 con **6 costes distintos** entre 13,61 € y 27,91 €. La primera fila creada fija el precio que todo checkout debe cumplir; cualquier otra obra y cualquier otro destino fallan. Para la obra 26 el comprador elige 15,29 € (zona 86, península) y el servidor compara contra la zona de otra obra.

**La calculadora escribe precios correctos** — las ocho zonas de la obra 26 cuadran al céntimo con `round(base × 1,21, 2) + packaging_cost`. El defecto está solo en la verificación.

### El problema real es que la misma regla está escrita tres veces

Buscando dónde vivía la resolución correcta aparecieron **tres implementaciones divergentes** de "qué zona aplica":

| # | Dónde | Filtra por producto | Desempate |
|---|---|---|---|
| 1 | `shippingController.getAvailableShipping:787` | sí (`applyProductPriority`) | específica > genérica, luego la más barata |
| 2 | `paymentHelpers.verifyShippingCosts:181` | **no** | ninguno (`LIMIT 1`) |
| 3 | `legacyProvider.getDeliveryOptions:76` | **no** | la más barata |

La #1 es la que cotiza al comprador. La #2 es la que valida lo que se le cobra. **Que coincidan no puede seguir dependiendo de que dos consultas independientes se parezcan**: ya divergieron. La #3 está inerte hoy (`SENDCLOUD_ENABLED_ART=false`) pero divergirá en cuanto se active.

Arreglar la consulta rota deja el defecto de clase intacto. Lo que hay que arreglar es que haya tres.

### Y hay un agujero de precio que la calculadora acaba de encarecer

El código postal que fija el precio se captura al **añadir al carrito**; la dirección de envío real se introduce **después**, en el paso 2 del drawer. El servidor nunca compara ambos: solo lo hace el cliente (`client/components/ShoppingCartDrawer.js:565-575`), que es manipulable.

Antes de la calculadora eso eran céntimos. Para la obra 26 son **15,29 € (península) frente a 27,91 € (Canarias)**: un comprador puede pagar tarifa peninsular y recibir en Canarias. Cerrarlo cuesta poco — cuando se llama a `create-intent` (`ShoppingCartDrawer.js:432-445`) la dirección ya está validada y en memoria; solo hay que enviarla y resolver contra ella.

## What Changes

### Un único resolver de zonas, dos puntos de entrada

- **Nuevo `api/services/shipping/zoneResolver.js`** con `resolveShippingOptions({ productId, productType, country, postalCode })` → `{ sellerId, pickup: [...], delivery: [...] }`. Contiene **la** consulta, **la** regla de prioridad producto-específica y **el** filtro de encaje por peso y dimensiones. Devuelve además el `zoneId` de la fila elegida, para trazabilidad.
- `getAvailableShipping` (`api/controllers/shippingController.js:616`) pasa a ser una envoltura fina: valida parámetros, llama al resolver y da forma a la respuesta.
- **`verifyShippingCosts` deja de consultar la base de datos.** Llama al mismo resolver y busca el método elegido en el resultado. "Lo que se le enseñó al comprador" y "lo que el servidor valida" dejan de *coincidir* para pasar a ser **el mismo número**.
- `legacyProvider.getDeliveryOptions` (`api/services/shipping/legacyProvider.js:37`) consume el resolver y conserva solo lo suyo: la multiplicación por número de bultos (`ceil(unidades / max_articles) × cost`).

### La verificación resuelve contra el destino real del pedido

- `POST /api/payments/stripe/create-intent` y `POST /api/payments/revolut/init-order` aceptan `deliveryAddress: { country, postalCode }` en el cuerpo. **Obligatorio si algún artículo lleva un método de tipo `delivery`.**
- El coste se valida contra esa dirección, no contra el `deliveryPostalCode` que el carrito arrastra desde el momento de añadir el producto. Manipular ese campo en el cliente deja de cambiar el precio validado.
- No hay respaldo silencioso al código postal del carrito cuando falta la dirección: sería exactamente el bypass que este cambio cierra. **Api y client deben desplegarse juntos.**

### Errores distinguibles y accionables

`title` pasa a llevar un código de máquina (mismo patrón que `CAPTCHA_UNAVAILABLE` en `inquiriesController.js:15`), y `message` el texto es-ES que ve el comprador:

| `title` | Cuándo | `message` |
|---|---|---|
| `SHIPPING_ADDRESS_REQUIRED` | hay envío a domicilio y no llegó dirección | "Falta la dirección de entrega para calcular el envío." |
| `SHIPPING_METHOD_UNAVAILABLE` | el método elegido no aplica a ese producto o destino | "El método de envío elegido ya no está disponible para esa dirección. Vuelve a seleccionar el envío." |
| `SHIPPING_COST_OUTDATED` | el método aplica pero el precio ha cambiado | "El precio del envío ha cambiado. Elimina el producto de la cesta y vuelve a añadirlo para continuar." |

Sustituye a "El coste de envío no coincide. Recarga la página.", que describía mal la causa y proponía una acción que no arregla nada.

## Capabilities

### New Capabilities
- `shipping-zone-resolution`: un único resolver de zonas de envío legacy, compartido por la cotización al comprador, la verificación del coste en el pago y el proveedor legacy; y la verificación del coste contra la dirección de entrega real del pedido.

### Modified Capabilities
- `shipping-zone-product-filter`: la prioridad producto-específica sobre genérica, hasta ahora aplicada solo al cotizar, pasa a aplicarse también al verificar el coste en el pago. Sin cambio de comportamiento visible al comprador; lo que cambia es que deja de existir un camino que la ignora.

## Non-goals

- **No se toca el flujo Sendcloud de `other`.** Sus artículos llegan a `verifyShippingCosts` con `shipping: null` (`ShoppingCartDrawer.js:196-204`, porque `setSendcloudShipping` escribe en `shippingSelections`, un estado paralelo al carrito, y nunca en `item.shipping`) y salen en la primera línea de la función por el guardián `if (!item.shipping?.methodId) continue`. Ni entran hoy ni entrarán después. El paso 3 contra Sendcloud en vivo (`shippingOptionsController` → `sendcloudProvider`) no aparece en el diff.
- **No se activa `SENDCLOUD_ENABLED_ART`.** El checkout de `art` sigue leyendo las zonas que escribe la calculadora por el camino legacy.
- **No se corrige el cobro del envío Sendcloud de `other`**, aunque se ha detectado durante este análisis y está descrito en `design.md` § "Hallazgo fuera de alcance". Es otra capacidad, otro riesgo y necesita su propia decisión de diseño.
- No se cambia el esquema de base de datos. Ninguna tabla, columna ni índice nuevo.
- No se cambia el formulario de zonas del admin ni la calculadora de envíos.

## Impact

**Backend:**
- Nuevo: `api/services/shipping/zoneResolver.js`
- Modificado: `api/utils/paymentHelpers.js` (`verifyShippingCosts` deja de consultar), `api/controllers/shippingController.js` (`getAvailableShipping` adelgaza), `api/services/shipping/legacyProvider.js` (`getDeliveryOptions` adelgaza), `api/controllers/stripePaymentsController.js` y `api/controllers/paymentsController.js` (aceptan y propagan `deliveryAddress`)
- Nuevo validador: `api/validators/paymentSchemas.js` — hoy `POST /create-intent` no valida nada (`api/routes/stripePaymentsRoutes.js:14`)

**Frontend:**
- `client/components/ShoppingCartDrawer.js`: enviar la dirección en `initializeStripePayment` y en la inicialización de Revolut; ramificar el banner de error por `error.title`
- `client/lib/api.js`: `stripeAPI.createPaymentIntent` y `paymentsAPI.initRevolutOrder` aceptan la dirección
- `client/lib/constants.js`: los tres textos es-ES de error

**Base de datos:** ninguno.

**Despliegue:** api y client van **juntos** — la API pasa a exigir un campo que solo envía el cliente nuevo. Purga obligatoria de la caché de páginas de nginx, como en todo despliegue de client (`deploy/deploy.sh`).
