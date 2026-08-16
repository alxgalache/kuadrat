## 1. El resolver compartido (ALTO RIESGO — infraestructura de precio)

- [x] 1.1 Crear `api/services/shipping/zoneResolver.js` con `resolveShippingOptions({ productId, productType, country, postalCode })` → `{ sellerId, pickup: [...], delivery: [...] }`, aceptando el vocabulario canónico `'art' | 'other'`
- [x] 1.2 Mover al resolver la carga de la fila del producto (`SELECT seller_id, weight, dimensions FROM art|others WHERE id = ? AND visible = 1`), de modo que ningún llamante pase `sellerId`; lanzar `ApiError` 404 si no existe o no es visible
- [x] 1.3 Mover al resolver la traducción de vocabularios: `articleType` (`'art' | 'others'`) para `shipping_methods.article_type` y `zoneProductType` (`'art' | 'other'`) para `shipping_zones.product_type`, en un único punto del módulo
- [x] 1.4 Mover al resolver la consulta de métodos `pickup` (`shippingController.js:718-745`) tal cual, añadiendo `sz.id AS zone_id` al `SELECT`
- [x] 1.5 Mover al resolver las dos consultas de métodos `delivery` — con código postal (`shippingController.js:787-838`) y sin él (`:857-882`) — añadiendo `sz.id AS zone_id` a la segunda, que hoy no lo selecciona
- [x] 1.6 Mover al resolver `applyProductPriority` (`shippingController.js:686-716`): específica gana a genérica, y entre candidatas la más barata
- [x] 1.7 Mover al resolver `checkProductFits` (`shippingController.js:652-678`), de modo que un método que no admite el producto quede fuera igual al cotizar que al verificar
- [x] 1.8 Normalizar la forma de `Option` (`methodId`, `zoneId`, `cost`, `methodType`, `name`, `description`, `maxArticles`, `estimatedDeliveryDays`, `maxWeight`, `maxDimensions`, y los campos de recogida cuando `methodType === 'pickup'`)

## 2. Consumidores del resolver

- [x] 2.1 Reescribir `getAvailableShipping` (`api/controllers/shippingController.js:616`) como envoltura fina: validar parámetros (manteniendo el contrato público `'art' | 'others'` de `:626`), traducir al vocabulario canónico, llamar al resolver y dar forma a `{ success, pickup, delivery }` **sin cambiar la respuesta HTTP**
- [x] 2.2 Comprobar que la respuesta de `GET /api/shipping/available` es byte a byte la de antes para un producto con zonas hechas a mano (capturar antes y después)
- [x] 2.3 Reescribir `legacyProvider.getDeliveryOptions` (`api/services/shipping/legacyProvider.js:37`) sobre el resolver, conservando solo la multiplicación por bultos `ceil(unidades / max_articles) × cost` y eliminando su dedup por método y su consulta local. El encaje se **conserva a nivel de bulto** (`parcel.weight/dimensions`), que es lo suyo: varios artículos copacked viajan en una caja que puede exceder un límite que ningún artículo suelto excede
- [x] 2.4 Eliminar de `shippingController.js` y de `legacyProvider.js` el código que el resolver absorbe, verificando que no queda ninguna consulta de precio a `shipping_zones` fuera del resolver (`grep -rn "FROM shipping_zones" api/` y revisar cada resultado). Resultado: las restantes son CRUD de admin, escrituras de la calculadora, y `drawService.js:694-744`, que comprueba **entregabilidad** (no selecciona `cost`) — mismo predicado duplicado, pero no puede producir un cobro erróneo, así que queda fuera de alcance

## 3. Verificación del coste en el pago (ALTO RIESGO — importe cobrado)

- [x] 3.1 Reescribir `verifyShippingCosts` (`api/utils/paymentHelpers.js:171-199`) para que reciba el destino del pedido, llame al resolver por artículo y busque `item.shipping.methodId` en `pickup.concat(delivery)`; **eliminar por completo su consulta `LIMIT 1`**
- [x] 3.2 Conservar el guardián `if (!item.shipping?.methodId) continue` como primera línea, que es lo que mantiene los artículos Sendcloud fuera de este camino
- [x] 3.3 Conservar la tolerancia de 0,01 € en la comparación
- [x] 3.4 Rechazar con `ApiError(400, mensaje, 'SHIPPING_METHOD_UNAVAILABLE')` cuando el método no aparece en las opciones resueltas
- [x] 3.5 Rechazar con `ApiError(400, mensaje, 'SHIPPING_COST_OUTDATED')` cuando el método aparece pero el coste difiere, incluyendo en `message` el precio correcto
- [x] 3.6 Rechazar con `ApiError(400, mensaje, 'SHIPPING_ADDRESS_REQUIRED')` cuando algún artículo lleva método `delivery` y no llegó dirección; **sin respaldo** al `deliveryPostalCode` del carrito
- [x] 3.7 Registrar en `logger.info` el `zoneId` que decidió cada precio verificado, para poder reconstruir una disputa

## 4. Endpoints de pago

- [x] 4.1 Crear `api/validators/paymentSchemas.js` con el esquema Zod de `POST /create-intent`: `items` (array no vacío) + `deliveryAddress` opcional `{ country, postalCode }`; hoy el endpoint no valida nada
- [x] 4.2 Aplicar `validate()` en `api/routes/stripePaymentsRoutes.js:14`, manteniendo `sensitiveLimiter`
- [x] 4.3 Propagar `deliveryAddress` en `createPaymentIntentEndpoint` (`api/controllers/stripePaymentsController.js:33-60`) hasta `verifyShippingCosts`
- [x] 4.4 Propagar `deliveryAddress` en `initRevolutOrderEndpoint` (`api/controllers/paymentsController.js:197-215`) hasta `sharedVerifyShippingCosts`, para que los dos proveedores validen igual
- [x] 4.5 Documentar los tres códigos de error en el comentario de cabecera de ambos endpoints

## 5. Frontend (ALTO RIESGO — toca el drawer del carrito)

- [x] 5.1 Añadir los tres textos es-ES de error a `client/lib/constants.js`, junto al resto de literales de carrito
- [x] 5.2 `client/lib/api.js:618`: `stripeAPI.createPaymentIntent` acepta y envía `deliveryAddress` — ya reenviaba el objeto entero, no necesitó cambio
- [x] 5.3 `client/lib/api.js`: `paymentsAPI.initRevolutOrder` acepta y envía `deliveryAddress` — admite forma de objeto, el cambio está en la llamada del drawer
- [x] 5.4 `client/components/ShoppingCartDrawer.js:659`: `initializeStripePayment` envía `{ country, postalCode }` de `deliveryAddress`, que ya está validada al llegar aquí (`:432-445`)
- [x] 5.5 `client/components/ShoppingCartDrawer.js:611`: hacer lo mismo en la inicialización de la orden de Revolut
- [x] 5.6 Ramificar el banner de error por `error.title` en ambos manejadores (`:673` y `:640`), usando los textos de `constants.js`; `error.title` ya viaja desde `client/lib/api.js:179`
- [x] 5.7 Mantener la comprobación de código postal del cliente (`:565-575`): sigue siendo el aviso temprano y ahora tiene respaldo en el servidor

## 6. Tests

- [x] 6.1 **Test de paridad** (el guardián estructural): para el mismo `(productId, productType, methodId, country, postalCode)`, el coste que devuelve `getAvailableShipping` y el que usa `verifyShippingCosts` SHALL ser el mismo, sobre una tabla sembrada con zonas de varios grupos y varias obras
- [x] 6.2 Regresión del fallo actual: obra con zonas del mismo método en dos grupos con costes distintos → cada destino valida el suyo
- [x] 6.3 Regresión: dos obras compartiendo método con costes distintos → cada una valida el suyo
- [x] 6.4 Rechazo: coste de otro grupo de la misma obra → 400 `SHIPPING_COST_OUTDATED`
- [x] 6.5 Rechazo: coste de otra obra con el mismo método → 400 `SHIPPING_COST_OUTDATED`
- [x] 6.6 Rechazo: método que no aplica al destino → 400 `SHIPPING_METHOD_UNAVAILABLE`
- [x] 6.7 Rechazo: artículo con método `delivery` sin `deliveryAddress` → 400 `SHIPPING_ADDRESS_REQUIRED`, y comprobar que **no** cae al `deliveryPostalCode` del carrito
- [x] 6.8 Aceptación: carrito solo de recogida sin `deliveryAddress` → 200
- [x] 6.9 **Vocabulario**: producto `other` con un método de `article_type = 'others'` se resuelve; comprobar explícitamente que no desaparece por comparar contra `'other'`
- [x] 6.10 Prioridad producto-específica: zona específica y genérica del mismo método → la verificación usa la específica
- [x] 6.11 Sendcloud intacto: artículo `other` con `shipping: null` atraviesa `verifyShippingCosts` sin error y sin llamar al resolver
- [x] 6.12 Producto oculto (`visible = 0`) → el pago se rechaza
- [x] 6.13 Tolerancia: diferencia de 0,01 € aceptada, de 0,02 € rechazada
- [x] 6.14 Ejecutar la suite completa (`cd api && npm test`) y comprobar que `orders.test.js` y los tests de Sendcloud siguen en verde

## 7. Verificación y despliegue

- [x] 7.1 Reproducir el fallo en local antes de tocar nada: calculadora sobre una obra guardando **dos** grupos con la misma opción, añadir al carrito y llegar a "Ir al pago" → 400. Sin esto no hay prueba de que el arreglo arregle algo
- [x] 7.2 En preproducción: comprar la obra con destino peninsular, balear, canario y ceutí, comprobando que el importe del PaymentIntent coincide con el que muestra el carrito en los cuatro casos
- [x] 7.3 En preproducción: comprobar que el checkout de `other` con Sendcloud sigue igual — mismas opciones en el paso 3, mismo importe, ningún error nuevo
- [x] 7.4 En preproducción: con `SENDCLOUD_ENABLED_OTHERS=false`, comprobar que el camino legacy de `other` (modal + zonas) sigue funcionando — es lo que protege la tarea 6.9
- [x] 7.5 **Desplegar api y client juntos** con `./deploy/deploy.sh`: la API pasa a exigir un campo que solo envía el cliente nuevo. Purga de la caché de nginx obligatoria, como en todo despliegue de client
- [x] 7.6 En producción: repetir 7.2 con la obra 26 y CP 28034, comprobando 15,29 € (método 14) y 15,88 € (método 15)
- [x] 7.7 Actualizar `CLAUDE.md` con la sección del resolver único y la regla de las tres coordenadas

## 8. Seguimiento (fuera de este cambio)

> **Descartado al archivar (16/08/2026).** Este seguimiento no se realiza dentro de OpenSpec: el hallazgo de `design.md` § "Hallazgo fuera de alcance" sigue **sin verificar** y se traslada fuera de este flujo. Las casillas se marcan para cerrar el cambio, no porque la comprobación se haya hecho.

- [x] 8.1 Verificar el hallazgo de `design.md` § "Hallazgo fuera de alcance": coger un pedido pagado con `other_order_items.shipping_cost > 0` y comparar `orders.total_price` con el importe del PaymentIntent en Stripe
- [x] 8.2 Si se confirma, abrir un cambio propio para el cobro del envío Sendcloud de `other`, incluyendo la comprobación de la suma por cantidad (`computeShippingTotal` suma por entrada, `ordersController.js:153` suma por unidad)
