## Funcionalidad para comprobar estados de pedidos y artículos y lanzar alertas

Quiero implementar una nueva funcionalidad para comprobar estados de pedidos y artículos y lanzar alertas al usuario administrador.
Quiero crear dos nuevos endpoints en la api para comprobar los estados de los productos en pedidos y lanzar alertas via email al usuario administrador.
El primer endpoint comprobará y obtendrá los productos (tabla 'art_order_items' o 'other_order_items') que lleven en estado "arrived" más de 10 días. Actualmente solo almaenamos el estado en esta table. No tenemos forma de saber en qué fecha se actualizó el registro a ese estado. Por esta razón, tendremos que añadir un nuevo campo "status_modified", que será de tipo "NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP" y que almacenará la fecha de cambio de estado del pedido.
Esta fecha deberá ser seteada o actualizada cada vez que se actualice el estado del producto. Estos casos son:
- Cuando el usuario comprador marca el producto o pedido como "arrived" o "confirmed" desde las acciones "Marcar como recibido" o "Confirmar recepción" en la página @client/app/pedido/[token]/page.js  
- Cuando el usuario vendedor marca el producto o pedido como "sent" desde la acción "Marcar como enviado" en la página @client/app/orders/page.js o @client/app/orders/[id]/page.js 
- Cuando el usuario admin cambia el estado del producto o pedido a cualquier estado desde la acción "Cambiar estado" en la página @client/app/admin/pedidos/page.js o en la página @client/app/admin/pedidos/[id]/page.js

Este primer endpoint realizará la comprobación descrita anteriormente y enviará un correo al usuario administrador con los detalles de los productos que cumplen con la condición.
Se debe incluir por cada product el número de días que lleva en estado "arrived", y los resultados aparecerán ordenador descendentemente por el número de días.

El segundo endpoint será similar al primero, pero deberá alertar sobre los productos que lleven más de 15 días en estado "sent".

El correo para las alertas será el definido en la variable de entorno "process.env.REGISTRATION_EMAIL".

Una vez implementados los endpoints, deberás incluir un menú en la página de administración de los pedidos ( @client/app/admin/pedidos/page.js ).
Se mostrará un icono de tres puntos verticales y al hacer click un menú con las opciones "Alertas de productos recibidos" y "Alertas de productos enviados".
Estas acciones realizarán las llamadas a los endpoints correspondientes y la alerta, si corresponde, al usuario administrador via email.