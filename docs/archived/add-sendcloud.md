## Añadir herramienta sendcloud para la logística de envíos

Necesito integrar la herramienta sendcloud para la logística de envíos en mi aplicación.
Como sabes, ahora mismo los métodos de envío se gestionan desde la parte de administración de la aplicación.
El usuario administrador crea métodos de envío con un precio determinado, los asigna a cada autor o artista y le pone un precio y unas zonas donde se aplica, referenciadas por códigos postales.
Para empezar, quiero tener la funcionalidad de sendcloud activada o desactivada dependiendo de variables de entorno, tanto a nivel de cliente como a nivel de api.
De esta forma podré elegir o cambiar fácil y rápidamente entre la funcionalidad de sendcloud y la de los métodos de envío tradicionales.
Este switch estará dividido o duplicado: para los productos tipo "art" y para los productos tipo "other" (recuerda que viven en tablas diferentes. 'art' y 'others').
Por tanto tendremos, tanto en client como en api, las variables de entorno:
- SENDCLOUD_ENABLED_ART
- SENDCLOUD_ENABLED_OTHERS
Con esto permitimos que podamos revertir la funcionalidad a la tradicional cuando sea necesario (seteando estas variables a false).

Implementación:

El funcionamiento y la lógica actual de envíos era la siguiente:
1. Cuando el usuario comprador añade un producto al carrito, se abre un modal ( @client/components/ShippingSelectionModal.js ) en el que el comprador introduce su código postal y se muestran las opciones de envío disponibles, según la configuración que ha creado el usuario admin de la página.
2. Se realiza una comprobación en @client/components/ShoppingCartDrawer.js cuando el usuario comprador introduce el código postal de su dirección de envío. Compara el código postal introducido con los configurados para el/los métodos de envío seleccionados para los artículos.
3. Se gestiona la logística y los estados de los pedidos de forma manual, ya sea desde el usuario 'seller' o desde el usuario 'admin'.

Quiero implementar un sistema y una lógica totalmente diferente para la gestión y logística de los pedidos y los envíos.
Se debe implementar la herramienta y la api de sendcloud para automatizar y gestionar los envíos.
Se que es una funcionalidad muy compleja y muy extensa, que cambia completamente el funcionamiento de la página en lo más "core". Por eso estoy pensando ahora mismo si un "switch" de esta funcionalidad vía las variables de entorno pueda ser factible y mantenible en el tiempo.
Antes de proceder con la implementación, quizás sería bueno que me propusieras alguna alternativa diferente para solucionar este problema y tener disponibles las dos funcionalidades.

A la hora de proceder con la implementación, los aspectos a tener en cuenta serían los siguientes:

- Deberá eliminarse la gestión y cambio de estados por parte del usuario 'seller'. Los lugares o páginas donde se realizan esos cambios de estado son: @client/app/orders/page.js o @client/app/orders/[id]/page.js . Se debería eliminar esta funcionalidad en el caso de que la funcionalidad de sendcloud esté activada. En su lugar, los estados de los pedidos estarán ligados al estado de los envíos en sendcloud, que se gestionarán a través del endpoint de la api del proyecto para los webhook de sendcloud.
- Como se indica en el punto anterior, deberá crearse un endpoint en la API para los webhooks que gestionen los envíos en sendcloud.
- Integrar la API de sendcloud en la aplicación. Cuando el usuario añada un producto al carrito, las opciones y los costes de envío disponible que se muestren serán los resultados de la consulta a la API de sendcloud con el código postal introducido por el usuario.
Habrá que tener en cuenta la lógica que tenemos actualmente cuando el usuario añade al carrito un producto de un artista para el que ya hay otro producto distinto en ese carrito. En ese caso, habrá que tener en cuenta la suma de las dimensiones y el peso de los artículos del mismo autor.
No tengo mucha idea de cómo funciona la api de sendcloud para todos estos aspectos (si hay opciones para varios bultos dentro del mismo envío, etc). Te proporcionaré al final del documento la url de la documentación de sendcloud y tendrás disponible un MCP de sendcloud para averiguar estos aspectos.
En definitiva, se tendrá que realizar un re-cálculo del tipo de envío y coste cuando se añada un product del mismo autor al carrito.

Deberíamos plantearnos tambien la opcion de cambiar completamente el funcionamiento y que los métodos de envio salgan en el @client/components/ShoppingCartDrawer.js en un nuevo paso al avanzar desde el paso de la dirección de envío y facturación, y antes del paso del pago. En el caso de esta forma de proceder, hay que tener en cuenta que se tendra que generar un envio distinto por cada artista diferente que haya en el carrito. El nuevo paso en el drawer del carrito podría ser una especie de menu por cada artista que tenga products en el carrito, para selecionar el método de envío por cada uno. Para cada uno se realizaría una petición a la API de sendcloud con los parámetros necesarios y, en su caso, el número de bultos o la suma de las medidas o peso de todos los productos de ese artista.
Estoy pensando y razonando todo eso al mismo tiempo que escribo. Creo que esta última opción sería la mejor en cuanto a ux y simplicidad.
Pero quiero que realices un estudio muy profundo de todo el código y me des tu opinión.

Para conocer y dominar toda la información sobre la funcionalidad de sendcloud y su api, debes utilizar y estudiar, además de tu propio conocimiento, las siguientes herramientas:
- El mcp de sendcloud que tienes disponible
- La colección de postman de la api de sendcloud (v3) disponible en el fichero @docs/sendcloud/Sendcloud_API.postman_collection.json
- La documentación oficial de sendcloud en https://sendcloud.dev/ y https://sendcloud.dev/api/v3 (por favor, comunicame si podrías consultar cualquier página o enlace dentro de la documentación para acceder a distintos endpoints o guias. Si tienes problemas para recopilar toda la información de la documentación, comunícamelo y busacaremos una solucion)
- Cualquier otro método o herramienta que se te ocurra que puedas tener disponible. Si para alguno de estos métodos o conocimientos es necesaria mi intervención o ayuda, comunícamelo y te ayudaré proporcionando lo que necesites.

Con todas esta información realiza un estudio de todo el código y desarrolla implicaciones, posibles caminos a seguir, implementación, etc.
Soy consciente de que es una tarea enorme y muy compleja, así que pon especial cuidado y atención a los detalles. También a la hora de dividir el pensamiento y el análisis, o la implementación en varias partes.

Por favor, comunicame cualquier aspecto, duda, sugerencia, feedback, etc que te surga en cualquier momento del análisis e intentaré ayudarte.