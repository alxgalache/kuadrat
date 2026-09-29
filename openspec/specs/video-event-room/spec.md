# video-event-room

## Purpose

Sala de los eventos de pase de vídeo (`format='video'`): entrada confirmada por el servidor en la sala autenticada, chat autenticado, duración del vídeo medida por la API y cierre del pase con cinco minutos de chat tras el final del vídeo.

## Requirements

### Requirement: La sala de un pase de vídeo espera la confirmación del servidor

El cliente SHALL pintar la sala de un evento `format='video'` activo solo cuando la entrada en la sala autenticada de Socket.IO (`join_event_room`) haya sido aceptada. `join_event_room` SHALL admitir los eventos de vídeo y validar al asistente (credencial verificada, sin pago pendiente, no expulsado por email ni IP) o el JWT del host. Un rechazo SHALL devolver la página a la ficha con «Acceder»: borrando la sesión guardada si era de asistente, o descartando el intento de host si el JWT no es válido.

#### Scenario: Navegador con un usuario caducado
- **GIVEN** un navegador cuyo `user` en `localStorage` coincide con el host del evento pero cuyo JWT ha caducado
- **WHEN** abre el pase de vídeo en curso
- **THEN** la sala no se pinta; tras el rechazo de `join_event_room` se muestra la ficha con «Acceder»

#### Scenario: Asistente verificado
- **WHEN** un asistente verificado de un evento gratuito abre el pase en curso
- **THEN** se muestra «Comprobando acceso…» y, tras la confirmación, la sala con el vídeo y el chat

#### Scenario: Sesión de otro navegador o inválida
- **WHEN** la credencial guardada no es aceptada por el servidor
- **THEN** la sesión se borra y no se muestra la sala

### Requirement: Chat autenticado en los pases de vídeo

El chat de un pase de vídeo SHALL usar `event_chat_message` de la sala autenticada, con el nombre del emisor fijado por el servidor y la expulsión del chat y el antispam aplicados. El servidor SHALL NOT atender el evento público `chat_message`.

#### Scenario: Visitante sin acceso
- **WHEN** alguien sin credencial emite un mensaje de chat para el evento
- **THEN** el servidor no lo difunde a nadie

#### Scenario: Nombre del emisor
- **WHEN** un asistente envía un mensaje
- **THEN** todos lo reciben con el nombre y apellidos de su registro, nunca «Anónimo»

### Requirement: Duración del vídeo medida por la API

La API SHALL guardar en `events.video_duration_seconds` la duración del MP4 de `video_url`, leída de la caja `mvhd`: por petición Range firmada (CDN protegido), por HTTP (URL externa) o en disco (archivo subido). La medición SHALL intentarse al crear o editar cuando cambia `video_url`, al subir un archivo, y al iniciar el pase si falta, y SHALL NOT bloquear ninguna de esas operaciones. Una respuesta 200 a una petición Range SHALL abortarse sin descargar el archivo.

#### Scenario: MP4 con el índice al principio o al final
- **WHEN** la API mide un MP4 con `moov` antes o después de `mdat`
- **THEN** obtiene la duración a partir de la escala de tiempo y la duración de `mvhd`

#### Scenario: Medición imposible
- **WHEN** la URL no responde o el archivo no es un MP4 legible
- **THEN** el evento se guarda igual con `video_duration_seconds = NULL`

### Requirement: Cierre del pase con cinco minutos de chat

El fin del pase SHALL ser `video_started_at` + `video_duration_seconds` (o `duration_minutes` si no se conoce), y el cierre, el fin + 5 minutos. La ficha pública SHALL exponer ambos instantes (`video_ends_at`, `chat_closes_at`). Al terminar el vídeo, el cliente SHALL mostrar en el panel del chat un aviso informativo con una cuenta atrás en directo hasta el cierre. Al llegar el cierre, el cliente SHALL cerrar la sala y mostrar el modal «Evento finalizado». El servidor SHALL finalizar el evento (estado `finished`, `finished_at`, `event_ended`) como mucho 15 s después del cierre, y desde el cierre SHALL rechazar `/video-token` y `join_event_room`.

#### Scenario: Aviso con cuenta atrás
- **WHEN** el vídeo termina
- **THEN** los participantes ven el aviso de que el chat seguirá abierto unos minutos, con el tiempo restante actualizándose cada segundo

#### Scenario: Fin de la cuenta atrás
- **WHEN** se alcanza `chat_closes_at`
- **THEN** cada participante ve el modal «Evento finalizado» con el botón «Aceptar», y el evento pasa a `finished` en el servidor

#### Scenario: Entrada tras el cierre
- **WHEN** alguien intenta obtener el vídeo o entrar en la sala después de `chat_closes_at`
- **THEN** el servidor lo rechaza

#### Scenario: Finalización manual
- **WHEN** el admin finaliza un pase de vídeo en curso
- **THEN** quien está en la sala ve el mismo modal «Evento finalizado»
