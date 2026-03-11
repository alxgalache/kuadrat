## Cambios en la página de evento dentro del sección "Live"

Me gustaría implementar una serie de cambios en la funcionalidad frontend de los eventos que se muestran dentro de la sección "Live".
En cuanto a la pantalla del detalle del evento ( @client/app/live/[slug]/EventDetail.js )

1. En el chat, añadir un botón "Enviar" en la parte inferior, a la derecha del input. Deberás hacer que el input del mensaje no ocupe todo el ancho del chat; e incluir el botón a la derecha del input, en la misma linea. La funcionalidad de enviar el mensaje pulsando "Enter" debe de seguir funcionando.
2. Arreglar el icono de la mano en el botón "Levantar mano". Actualmente la mano no se muestra correctamente. Aparecen lineas difusas y no se aprecia la forma de la mano. Revisalo o simplifica el icono en su caso.
3. Arreglar la vista del stream de video en móviles en pantalla completa (horizontal o landscape) cuando se trata de un video en directo con participantes.
En este caso, la sección inferior donde se muestran los participantes y las opciones para mutear/desmutear ocupa demasiado espacio en la pantalla en modo pantalla completa; y hace que no se vea correctamente al host o la pantalla que está compartiendo (el componente con los cuadrados de los participantes ocupa casi media pantalla cuando estamos en modo pantalla completa y horizontal).
Debes reducir la altura y el tamaño de este components para que no tape tanta porción de la pantalla.
4. Añadir funcionalidad para la conclusión del stream cuando se trata de un evento en directo.
Deberá existir un botón de "Finalizar stream", disponible para el host, para cuando el host quiera terminar el stream.
Esto mostrará un modal de confirmación y cuando el host lo confirme, se finalizará el stream de la misma forma que el enlace de "Finalizar" en la lista de eventos del admin ( @client/app/admin/espacios/page.js o @client/app/admin/espacios/[id]/page.js )
Una vez realizada esa acción,  el host será redirigido a la página de los detalles del evento; y a todos los usuarios que estaban viendo el stream les aparecerá un modal con un mensaje diciendo que el stream ha finalizado. Cuando pulsen el botón aceptar (o salgan del modal) se les redireccionará tambien a la página de detalles del evento.
5. Por último, debes revisar el código y asegurarte de que, cuando un usuario participante se apunta a un evento y está en la pantalla de detalles de ese evento cuando aún no ha comenzado (está esperando), la pantalla se actualiza al contenido del stream automáticamente cuando el evento empieza; sin ser necesaria la interacción del usuario o que el usuario recargue la página.

Comienza con la implementación de todos estos puntos.
Debes preguntar o consultar cualquier duda que tengas sobre la implementación de estos puntos, o sobre cualquier información que consideres incompleta o inexistente.
