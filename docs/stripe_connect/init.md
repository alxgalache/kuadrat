Necesito implementar la funcionalidad Stripe Connect en mi aplicación web. Mi modelo de negocio es el siguiente:

La presente aplicación web corresponde a una Galería de Arte online en la que ofreceré y publicitaré las obras de arte (o productos más generalistas) de diferentes artisas; y en cada compra de cada producto u obra de arte yo me quedaré con una comisión (que en el caso de las obras de arte (tabla 'art') será del 25% y en el caso del resto de articulos (tabla 'others') será del 10%).

He estado investigando diferentes funcionalidades, y creo que la que más encaja es Stripe Connect.
Necesito que realices una investigación muy profunda de esta funcionalidad y definas perfectamente y con el máximo nivel de detalle posible el encaje de esta funcionalidad con la aplicación y su estado actual.

En cuanto a la variante o modalidad de Stripe Connect, la opción deseada sería "Marketplace":
La descripción en la documentación de Stripe es la siguiente:
"Tu plataforma cobra pagos y distribuye fondos a los vendedores. Por ejemplo, un servicio de entrega de comida que conecta a los clientes con restaurantes y conductores."

De esta forma el pago realizado por el cliente final de la aplicación o comprador llegara a mi cuenta, y de ahí se realizará el pago del importe menos la comisión que me correspondería, a la cuenta conectada.
IMPORTANTE: Si es posible, el pago de esta cantidad no debería realizarse automáticamente cuando el comprador realiza el pedido. Por temas legales y para dejar pasar el plazo de devoluciones y reclamaciones de 14 días, la funcionalidad para el pago a las cuentas conectadas debería realizarse manualmente (por mi parte si es posible) y estar ligada a la funcionalidad actual de "Monedero" y "Realizar transferencia" en la aplicación. Actualmente esta acción genera y envía un email al admin con la información. A partir de ahí, el admin podría tener una interfaz o acción en algua pantalla o página de la aplicación solo disponible para él, en la que pueda realizar una llamada para emitir el pago con la cantidad que se seleccione. Debes analizar muy profundamente la viabilidad de estas implementaciones y desarrollos antes de realizarlos, y tener muy claro la lógica y las implicaciones.

Tienes disponible un prompt de ejemplo obtenido de la documentación oficial de stripe para configurar stripe connect en el fichero @docs/stripe_connect/interactive_platform_guide.md

También debes utilizar en todo momento el MCP de Stripe, durante todo el proceso de investigación y análisis para la inclusión e implementación de la herramienta dentro de la aplicación web, tanto a nivel de cliente como de API.

Además del MCP de Stripe que tienes disponible, puedes y debes usar los ficheros dentro de la carpeta @docs/stripe_connect
Cada uno de ellos contiene información importante obtenida de la documentación oficial de Stripe connect.
Algunos ejemplos de ficheros que puedes consultar son:
@docs/stripe_connect/authentication.md
@docs/stripe_connect/interactive_platform_guide.md
@docs/stripe_connect/integration-recommendations.md
@docs/stripe_connect/onboarding.md
@docs/stripe_connect/service-agreement-types.md

Por favor, si necesitas cualquier otro tipo de información o documentación de Stripe, detén el análisis y la investigación y pregúntame lo que necesites. Tengo acceso a la documentación de Stripe y puedo resolverte cualquier duda por pequeña que sea.

También tienes disponible el feedback del chat de soporte de Stripe en una conversación que tuve con ellos acerca de la idoneidad de elegir stripe connect como herramienta. Está disponible en el fichero @docs/stripe_connect/support_chat.md

En definitiva y en resumen, necesito que analices en profundidad la funcionalidad de Stripe connect, y elabores un "path" o definición super completa y pormenorizada de la funcionalidad y desarrollos a incluir dentro de la aplicación para poder gestionar los pagos a los artistas que componen la aplicación.
En cada pago realizado se deberá tener en cuenta los parámetros definidos en la aplicación a nivel de variables de entorno para los porcentajes de comisión a nivel del productos tipo 'art' y productos tipo 'others'.
Debes tener en cuenta que en la sección de "eventos" existe la posibilidad de poner un precio para apuntarse al evento. En este caso el porcentaje de comisión que aplicaría sería el mismo que el almacenado para los productos de tipo "others".
Las variables de entorno definidas para estos porcentajes son "DEALER_COMMISSION_ART" y "DEALER_COMMISSION_OTHERS" a nivel de API; y "NEXT_PUBLIC_DEALER_COMMISSION_ART" y "NEXT_PUBLIC_DEALER_COMMISSION_OTHERS" a nivel de cliente.

Debes analizar y definir las herramientas, lógicas o interfaces necesarias para la implementación e integración completa de Stripe Connect en la aplicación. Esto puede conllevar:

- Integrar y adaptar la funcionalidad existente de "monedero" para los usuarios 'seller' con la funcionalidad de Stripe Connect. Actualmente la acción "Realizar transferencia" simplemente genera y envía una alerta por email al usuario admin. Se podría mantener esa alerta, y además implementar una nueva página o interfaz para el admin en la que pueda ver los detalles de la solicitud de pago, y realizarlo. No obstante, analiza todas las opciones e implementaciones posibles y dame feedback acerca de la mejor opción. Por supuesto, puede ser necesario añadir nuevas tablas, modelos, etc. Debes tener en cuenta todo esto.
- Permitir al usuario admin llevar un control desde la aplicación de los pagos realizados a las cuentas conectadas; y dentro de cada uno, si es posible mostrar los artículos o productos (sean de tipo 'art', 'others' o eventos de pago) que forman parte de ese pago. Esto será útil para que después, a lahora de obtener la factura del pago para declarar ante hacienda, pueda ir en la factura los productos o servicios a los que corresponde el pago. Esto es importante porque dependiendo del tipo de producto que sea puede tributar a un IVA o a otro.
  Para esto sería bueno que investigaras, mediante el MCP de Stripe o la documentación adjunta (recuerda pedirme la documentación que necesites), si la api o la librería de Stripe permite definir de alguna forma en los pagos (mediante metadatos u otro método) los productos que forman parte de ese pago o generar la factura con los productos que forman parte de ese pago.
- Acciones necesarias sobre los usuarios tipo seller dentro de la sección "Autores" disponible para el usuario admin, con el fin de añadir esos artistas o usuarios como cuentas conectadas (definir la forma de realizarlo: compartiendo un enlace, rellenando el admin los datos del usuario y haciendo una petición a stripe directamente, etc. Debes realizar un análisis y exponerme todas las opciones disponibles, y elegir la mejor de ellas)
- Cualquier otro desarrollo, lógica, o nueva interfaz dentro de la aplicación que consideres necesaria o útil.

Conforme realices el análisis es normal que te surjan muchas dudas, diferente aproximaciones a un mismo desarrollo o lógica, o cuestiones que tengas que compartir o debatir conmigo con el fin de implementar una solución lo más robusta posible.
No dudes en consultarme cualquier detalle por mínimo que sea. Entre los dos intentaremos definir la funcionalidad y el desarrollo de la forma más completa y profunda posible para evitar comportamientos no deseados o especificaciones inconcretas.

Como parte de la investigación e implementación o como anexo, debes elaborar un informe en un fichero con formato markdown, indicando para mi gestoría/asesoría fiscal y contable toda la lógica o flujo. Este documento debe servir para indicar a la gestoría cómo operar con respecto a las facturas que se tengan que emitir o recibir a lo largo del ciclo de vida del flujo, y cómo y de qué forma podrán generarse.

Si consideras que falta alguna información a nivel de este mensaje o de cualquier fichero que se adjunta, por favor comunícamelo y trataré de ampliarte la información lo mejor que pueda.

Comienza el análisis y la investigación, dame el feedback y haz las preguntas que consideres, y en base a eso iremos definiendo una base de conocimiento y un contexto para poder comenzar a definir la funcionalidad en un cambio (ingente) de openspec. Al igual que con el resto de aspectos, siéntete libre de organizar la implementación como quieras o como consideres más óptimo. Puedes dividir la implementación en varios cambios de openspec diferentes, realizar las tareas de plan y análisis como consideres oportuno, etc.

Comienza cuando estés listo y buena suerte.