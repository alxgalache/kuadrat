## Security Audit Implementation

Quiero realizar una especie de prueba de seguridad o de auditoría a nivel global de la aplicación para identificar vulnerabilidades y garantizar la seguridad de los datos y funcionalidades.
Estas pruebas se centrarán en dos aspectos distintos y bien diferenciados:

1. Por un lado, necesito comprobar (y corregir, si aplica) los escenarios de concurrencia en la compra de un mismo producto por parte de dos usuarios distintos de forma simultanea. La acción de la compra de un producto se realiza desde el component del frontend @client/components/ShoppingCartDrawer.js , y utiliza el endpoint "/api/orders/placeOrder" de la API.
Los productos, tanto en la tabla 'art' como en la tabla 'others', tienen un campo 'is_sold' que se modificará cuando ese producto es vendido.
Necesito saber si se está teniendo en cuenta algún tipo de validación en la concurrencia para evitar que dos usuarios intenten comprar el mismo producto al mismo tiempo.
En caso de que sea necesario aplicar algún mecanismo para evitar este caso de uso, quiero sabe si esa solución puede implicar la consulta de este campo.
No tengo mucho conocimiento sobre qué solución específica aplicar para estos casos de 'race condition', así que deberás implementar la solución que creas que sea más robusta y completa (en el caso de que sea necesario. Si no supone un problema, no es necesario que realices ninguna acción).

2. Por otro lado, necesito que lleves a cabo un estudio MUY EXHAUSTIVO y MUY DETALLADO de todos los casos, en el ámbito de TODA LA APLICACIÓN, de los posibles ataques que se puedan presentar por el siguiente medio:
Que el usuario pueda realizar modificaciones desde el cliente (por ejemplo utilizando la consola de desarrollador de su navegador) que puedan modificar o "trampear" los datos o la información de la api, o aprovechar endpoints o código de la API que no realice alguna validación. Estos casos podrían darse en las siguiente situaciones:
- Intentar modificar el precio de un artículo en la petición de compra que se realiza a la API con la esperanza de que la API no compruebe ese precio.
- Intentar modificar el estado de un producto como vendido para poder comprarlo nuevamente.
- Inyección de SQL modificando desde el cliente alguna petición a la API
- Realizar peticiones modificando algún parámetro sensible de la petición que se realice a la API, de forma general.
- Cualquier otro caso de uso sensible que se te ocurra.
Necesito que analices todos estos casos y me indiques si es necesario implementar alguna solución para evitarlos, y si es así, qué solución implementarías. Si no es necesario hacer nada, no es necesario que realices ninguna acción.

Estudia con detenimiento y profundidad estos dos casos e implementa las soluciones necesarias para evitarlos, si procede.
Puedes consultarme cualquier duda que tengas sobre el tema en el proceso de implementación.