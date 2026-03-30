
## Listado de ubicaciones (service points) para los envíos de sendcloud, en el carrito y en la zona del seller.

Necesito implementar la siguiente funcionalidad:

Actualmente las opciones de envío que se muestran en el carrito ( @client/components/ShoppingCartDrawer.js ) cuando la funcionalidad de envío por sendcloud está activada ("SENDCLOUD_ENABLED_ART" y "SENDCLOUD_ENABLED_OTHERS") combinan opciones de "home_delivery" (el envío se realiza al domicilio del comprador) y "pickup" o "service_point" (el envío se deposita en un service point y el comprador lo recoge allí).

Actualmente, cuando se selecciona un método de envío del segundo tipo, se está realizando una petición al siguiente endpoint de la api de sendcloud V2:

```
curl -X GET 'https://servicepoints.sendcloud.sc/api/v2/service-points?country=ES&carrier=correos_express&postal_code=37008&radius=5000' \
2026-03-29T19:39:24.035983839Z   -H 'Authorization: Basic NzhlMjZlOWUtYjFlOS00NGE5LWE5YzctNzE4NDQ3YmM1MGM4OjkwOGJlZGY1Mzg1MDQ4MjE5ODhlOGQ4MTdlNTY5MWQ0' \
2026-03-29T19:39:24.035985605Z   -H 'Content-Type: application/json' \
2026-03-29T19:39:24.035986750Z   -H 'Accept: application/json'
```

Un ejemplo de respuesta para ese endpoint es:

```
[

{

"id": 13399275,

"code": "11457",

"is_active": true,

"shop_type": null,

"general_shop_type": "servicepoint",

"extra_data": {

"shop_type": null,

"external_id": "00411457"

},

"name": "(DISASHOP) - KIOSCO EL PUENTE",

"street": "CALLE FRANCISCO MONTEJO",

"house_number": "11",

"postal_code": "37008",

"city": "SALAMANCA",

"latitude": "40.957111",

"longitude": "-5.681800",

"email": "",

"phone": "",

"homepage": "",

"carrier": "correos_express",

"country": "ES",

"formatted_opening_times": {

"0": [

"07:30 - 14:30",

"17:00 - 20:45"

],

"1": [

"07:30 - 14:30",

"17:00 - 20:45"

],

"2": [

"07:30 - 14:30",

"17:00 - 20:45"

],

"3": [

"07:30 - 14:30",

"17:00 - 20:45"

],

"4": [

"07:30 - 14:30",

"17:00 - 20:45"

],

"5": [

"07:30 - 15:30"

],

"6": [

"07:30 - 15:30"

]

},

"open_tomorrow": true,

"open_upcoming_week": true

},

{

"id": 10775912,

"code": "3718094",

"is_active": true,

"shop_type": null,

"general_shop_type": "servicepoint",

"extra_data": {

"shop_type": null,

"external_id": "0983718094"

},

"name": "(OFICINA CORREOS) - SALAMANCA SUC 3 - 3718094",

"street": "MAESTRO SOLER",

"house_number": "26-28",

"postal_code": "37008",

"city": "SALAMANCA",

"latitude": "40.952857",

"longitude": "-5.664717",

"email": "",

"phone": "",

"homepage": "",

"carrier": "correos_express",

"country": "ES",

"formatted_opening_times": {

"0": [

"08:30 - 20:30"

],

"1": [

"08:30 - 20:30"

],

"2": [

"08:30 - 20:30"

],

"3": [

"08:30 - 20:30"

],

"4": [

"08:30 - 20:30"

],

"5": [],

"6": []

},

"open_tomorrow": true,

"open_upcoming_week": true

},

{

"id": 13402466,

"code": "2797",

"is_active": true,

"shop_type": null,

"general_shop_type": "servicepoint",

"extra_data": {

"shop_type": null,

"external_id": "0042797"

},

"name": "(DISASHOP) - AUTOSERVICIO QUIJADA",

"street": "PASEO CUATRO CALZADAS",

"house_number": "48",

"postal_code": "37008",

"city": "SALAMANCA",

"latitude": "40.947534",

"longitude": "-5.672316",

"email": "",

"phone": "",

"homepage": "",

"carrier": "correos_express",

"country": "ES",

"formatted_opening_times": {

"0": [

"09:30 - 15:00",

"17:00 - 20:30"

],

"1": [

"09:30 - 15:00",

"17:00 - 20:30"

],

"2": [

"09:30 - 15:00",

"17:00 - 20:30"

],

"3": [

"09:30 - 15:00",

"17:00 - 20:30"

],

"4": [

"09:30 - 15:00",

"17:00 - 20:30"

],

"5": [

"10:00 - 14:30"

],

"6": []

},

"open_tomorrow": true,

"open_upcoming_week": true

}

]
```

Si necesitas más información sobre este endpoint o los endpoints disponibles de sendcloud para esta funcionalidad, utiliza el MCP de sendcloud o consulta el fichero @docs/sendcloud/llms.txt

El problema es que la respuesta de ese endpoint no se está tratando ni mostrando correctamente en el component del carrito de compra en el paso de "Opciones de envío" dentro de @client/components/ShoppingCartDrawer.js

Cuando el comprador selecciona una opción con recogida, se deberá mostrar dentro del componente 'drawer' del carrito una ventana "overlay" dentro de los límites del drawer (difuminando o poniendo un color gris detrás) consistente en una vista de mapa arriba y debajo un listado con los service points o puntos de recogida disponibles según su dirección (los que se han obtenido en la respuesta de la petición).
Debes estudiar la respuesta de la petición de sendcloud, y utilizar los datos que creas convenientes o necesarios para poder mostrar los puntos en el mapa; y para mostrar la información que creas necesaria o importante en el listado (nombre de la ubicación, dirección, horario, etc).

El usuario podrá seleccionar uno de los puntos que le aparezcan. Los elementos del listado tendrán un diseño en el que se mostrará un radio button en la parte derecha de cada elemento o tarjeta con la opción. Cuando el comprador pulse en un elemento del listado se seleccionará el radio button. Cuando se seleccione un punto en el mapa también se seleccionará esa opción. Abajo del todo de la ventana modal tendremos un botón de aceptar, que solo estará habilitado cuando el comprador haya seleccionado una de la opciones del listado.

IMPORTANTE: Se debe almacenar el punto seleccionado, guardando el valor correspondiente al campo "id" en la respuesta de sendcloud del punto correspondiente; para posteriormente incluirlo en la petición de creación del envío dentro del payload en el campo "to_service_point.id". La petición que se realiza posteriormente para crear el pedido se realiza en la función "createShipments" del fichero @api/services/shipping/sendcloudProvider.js
Un ejemplo de esa petición es:

```
curl -X POST 'https://panel.sendcloud.sc/api/v3/shipments' \
2026-03-29T20:03:53.657317199Z   -H 'Authorization: Basic NzhlMjZlOWUtYjFlOS00NGE5LWE5YzctNzE4NDQ3YmM1MGM4OjkwOGJlZGY1Mzg1MDQ4MjE5ODhlOGQ4MTdlNTY5MWQ0' \
2026-03-29T20:03:53.657323267Z   -H 'Content-Type: application/json' \
2026-03-29T20:03:53.657327162Z   -H 'Accept: application/json' \
2026-03-29T20:03:53.657331743Z   -d '{"from_address":{"name":"Pablo Perez","company_name":"Empresa de Pablo","address_line_1":"Afueras a Valverde","address_line_2":"1ºA","house_number":"38","postal_code":"28034","city":"Madrid","country_code":"ES","phone_number":"+34681096432","email":"axgalache@proton.me"},"to_address":{"name":"Alejandro Galache Corredera","address_line_1":"Paseo del Rector Esperabé 18","address_line_2":"","postal_code":"37008","city":"Salamanca","country_code":"ES","phone_number":"+34681096432","email":"axgalache@proton.me"},"ship_with":{"type":"shipping_option_code","properties":{"shipping_option_code":"correos_express:ecommerce"}},"order_number":"1015","external_reference_id":"order-1015-seller-9-parcel-0","total_order_price":{"currency":"EUR","value":"33.00"},"parcels":[{"weight":{"value":"0.026","unit":"kg"},"parcel_items":[{"item_id":"20","description":"substantial bottle","quantity":1,"weight":{"value":0.026,"unit":"kg"},"price":{"value":"33.00","currency":"EUR"},"hs_code":"","origin_country":"ES"}]}]}'
```

Para mostrar la vista del mapa con los puntos, creo que la mejor opción será usar google maps, ya que actualmente ya hay disponible una api key para usar google maps (que se incluyó para la selección de la dirección en el mapa cuando la variable de entorno del cliente "NEXT_PUBLIC_CART_ADDRESS_FUNC" era "autocomplete"). Por favor, analiza todo el código relacionado con esa funcionalidad y decide si sería posible o conveniente ese approach (usar esa api key) para la vista del mapa.
Si consideras que no sería posible, o hay alguna opción mejor, más útil, más robusta o más rápida para esta caso de uso, comentalo y adóptala en su lugar.

IMPORTANTE: Comentame cualquier duda o consulta que tengas durante el estudio y análisis de la solución y la implementación. Debes preguntar cualquier cuestión para que pueda ayudarte a completar cualquier información que haya dejado incompleta o que no entiendas del todo.
