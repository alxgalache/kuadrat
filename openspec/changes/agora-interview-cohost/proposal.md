# Entrevistas en directo: el admin como co-presentador en eventos Agora stream

## Why

Los eventos `provider='agora'` + `interaction_mode='broadcast'` son hoy un formato de **una sola cámara**: el host emite, la audiencia mira y, como mucho, habla con la mano levantada y sin vídeo. La galería va a empezar a producir **entrevistas** —el admin entrevistando a un artista que presenta su colección, o al creativo de un estudio— y una entrevista necesita dos personas en cámara y en audio, con una puesta en escena que decida quien la dirige.

Nada de eso existe, y dos piezas actuales lo impiden activamente:

1. **El admin entra como `subscriber`.** `POST /api/events/:id/admin-access` le crea una fila de asistente con `is_staff = 1`, y `getViewerToken` le da en `broadcast` el rol de cualquier espectador. Con **Co-host authentication** activo en la consola de Agora, un token `subscriber` no puede publicar ni manipulando el cliente. El diseño archivado de ese cambio lo dejó escrito: «Convertir al administrador en co-host es otra funcionalidad». Es esta.
2. **Compartir pantalla hace desaparecer la cámara del host.** Verificado en el bundle instalado (`agora-rtc-sdk-ng@4.24.6`): `publish()` lanza `CAN_NOT_PUBLISH_MULTIPLE_VIDEO_TRACKS` si el cliente ya publica una pista de vídeo. Por eso `useAgoraRoom.startScreenShare` *intercambia* cámara por pantalla. En una entrevista, perder las caras al mostrar un proyecto es perder la entrevista. Y el defecto afecta hoy a toda presentación con diapositivas.

Hay además un fallo latente que la funcionalidad dispararía el primer día: en `broadcast` el host da y quita la palabra con un clic en la casilla de un participante, y quitarla crea una *kicking rule* de Agora que **impide publicar durante 24 h**. En cuanto el admin aparezca como participante que publica, un clic del host sobre su casilla le cortaría cámara y micrófono para el resto del evento.

## What Changes

### El admin, co-presentador en `broadcast`

- Un asistente `is_staff = 1` cuyo email corresponde **hoy** a un usuario `role = 'admin'` recibe en eventos Agora `broadcast` un token **`publisher`** con su propio uid de asistente (nunca `HOST_UID`), y la respuesta lo marca con `coHost: true`. Se aplica en `getViewerToken` y en `renewToken`. En `meeting` y en LiveKit no cambia nada.
- El admin conserva el acceso sin registro ni pago que ya tiene y entra por el mismo botón «Entrar como administrador».
- En la sala dispone **solo** de: micrófono (activar y seleccionar dispositivo), cámara (activar y seleccionar dispositivo), altavoces, y el conmutador de disposición de las cámaras. **No** tiene pantalla compartida, pizarra, efectos de fondo, selector de calidad, moderación ni «Finalizar stream»: dos personas operando esas funciones a la vez producen estados incompatibles.
- El micrófono del admin usa el perfil de 128 kbps del host, que no cuesta nada porque el audio tiene tarifa plana, pero **conserva el procesado del navegador** (AEC/ANS/AGC): el admin oye al host por sus altavoces. La cámara emite a 720p 16:9 fija.
- La presencia de Socket.IO lo identifica con `coHost: true`. El admin no puede levantar la mano, no pasa por el antispam automático (que banearía su email e IP) y **el servidor rechaza** promoverlo, degradarlo, expulsarlo del chat o reportarlo como spam.

### Escena de cámaras del stream, para todos los roles

- **Una cámara encendida** (del host o del admin): al 100 %, exactamente como hoy.
- **Dos cámaras**, con dos disposiciones que **solo el admin** conmuta y que todos los clientes ven a la vez:
  - **Dividida** (por defecto): host a la izquierda y admin a la derecha, cada uno en su mitad, con el vídeo recortado por los laterales para rellenar la mitad.
  - **Recuadro**: host a pantalla completa y el admin en pequeño en la esquina inferior derecha.
- **Pantalla compartida o pizarra activa**: el contenido ocupa la escena y las cámaras encendidas aparecen en un **recuadro en la esquina inferior derecha**. Con dos cámaras, el recuadro siempre las muestra lado a lado. La disposición elegida por el admin no se modifica y vuelve sola al terminar, y el conmutador queda deshabilitado mientras tanto.
- Se aplica **a todo evento stream**, haya admin o no: el host que comparte pantalla sigue viéndose en la esquina si tiene la cámara encendida.
- El modo teatro muestra la misma composición a pantalla completa. El anillo de «hablando» pasa a ser por cámara.

### Pantalla y cámara a la vez: un segundo cliente para la pantalla

- En `broadcast`, la pantalla del host se publica desde un **segundo cliente RTC** con uid reservado `2` (`HOST_SCREEN_UID`) y un token `publisher` propio, emitido por un endpoint nuevo `POST /api/events/:id/screen-token`, solo para el host. La cámara del host sigue publicada en su cliente.
- El cliente principal del host **no se suscribe** a su propia pantalla. En `meeting` se conserva el intercambio actual.

### Coste contenido: flujo reducido para lo que se ve pequeño

Agora factura a cada asistente por la **suma de píxeles** de los vídeos que recibe, y la banda HD termina justo en 1280 × 720:

| Escena que ve el asistente | Píxeles recibidos | Banda |
|---|---|---|
| Una cámara a 720p (hoy) | 921.600 | HD |
| Dos cámaras a 720p, dividida o recuadro | 1.843.200 | **Full HD — asumido por decisión** |
| Pantalla ≤ 1792 × 1008 + dos cámaras en flujo reducido 480 × 270 | ≤ 2.065.536 | Full HD (igual que compartir pantalla hoy) |
| Pizarra + dos cámaras en flujo reducido | 259.200 | HD |

- Las pistas de cámara del host y del admin activan el **dual stream** de Agora con un flujo reducido de **480 × 270, 16:9**. El defecto del SDK es 160 × 120, es decir 4:3: la misma trampa que ya tuvo la cámara.
- Cada asistente recibe el flujo reducido **solo** para las cámaras que se pintan en el recuadro de la esquina, y el completo en el resto de casos.
- La pantalla compartida en `broadcast` se limita a 1792 × 1008 para que pantalla y esquina quepan en Full HD.

### Endurecimiento de identidades que la escena necesita

- La rama de JWT de `renewToken` deja de emitir tokens `HOST_UID` a un admin que no es host. Era código muerto documentado, y con un co-host en la sala dejaría de serlo.
- `join_event_room` con JWT deja de dar `isHost: true, agoraUid: 1` a un admin que no es host. La escena identifica al host por su presencia: dos presencias de host la romperían.

## Capabilities

### New Capabilities

- `agora-broadcast-cohost`: el admin como co-presentador en eventos Agora `broadcast`. Cubre la elegibilidad (`is_staff` + rol admin vigente), el rol `publisher` y la marca `coHost` en los tokens, los controles restringidos, el perfil de micrófono y cámara, la presencia `coHost`, la protección frente a la moderación, el evento de socket `stage_layout` con su validación en servidor y su entrega a quien entra tarde, y el endurecimiento de identidades de host.
- `agora-broadcast-stage`: la composición de la escena de un evento Agora `broadcast` para host, admin y audiencia. Cubre una cámara, dividida, recuadro, pantalla o pizarra con recuadro de esquina, las reglas de recorte, el anillo por cámara, el teatro, la exclusión de estas cámaras de la rejilla de promovidos, el dual stream y la selección de flujo por disposición, y el límite de resolución de la pantalla.

### Modified Capabilities

- `agora-streaming-provider`:
  - «Compartir pantalla del host (Agora)» deja de ser un intercambio en `broadcast` y pasa a usar un segundo cliente con `HOST_SCREEN_UID`.
  - «Emisión de tokens RTC Agora por rol y estado» añade el rol `publisher` del co-host y el token de pantalla.
  - «Renovación de token Agora» retira la rama de admin no host.
- `admin-event-access`: «Admin joins as a participant, not as host» — en `broadcast` el admin pasa a `publisher` como co-presentador. Sigue sin ocupar `HOST_UID` y sin controles de host.
- `agora-whiteboard`: «Toggle del host y visualización compartida» — en `broadcast`, el vídeo del host ya no se reduce a un mosaico debajo de la pizarra: las cámaras van en el recuadro de esquina sobre ella.

## Impact

**Capas:** backend y frontend.

**Base de datos:** **ninguna columna nueva**. El co-host se deriva de `event_attendees.is_staff` más `users.role`, y la disposición vive en memoria del socket con el mismo ciclo de vida que el estado de la pizarra (`eventWhiteboards`).

**API:**
- `api/services/agoraService.js`: `HOST_SCREEN_UID`.
- `api/services/eventService.js`: predicado único de co-host.
- `api/controllers/eventController.js`:
  - `getViewerToken` y `renewToken`: rol y marca de co-host.
  - `renewToken`: la rama JWT se endurece.
  - Nuevo `getScreenToken`.
  - `resolveAgoraAttendee`, `banFromChat` y `reportSpam`: rechazo de objetivos staff.
- `api/routes/eventRoutes.js`: ruta `screen-token`, con `authenticate`.
- `api/validators/eventSchemas.js`: esquema del endpoint.
- `api/socket/eventSocket.js`:
  - `coHost` en la presencia.
  - Evento `stage_layout`.
  - Disposición en la respuesta de `join_event_room`.
  - Exención de antispam y de mano levantada.
  - Host por JWT solo si es el host.

**Cliente:**
- `client/hooks/useAgoraRoom.js`: segundo cliente de pantalla, dual stream, selección de tipo de flujo remoto y no suscribirse a la propia pantalla.
- `client/components/AgoraLiveRoom.js`: rol co-host y escena en `BroadcastArea`.
- Componente nuevo de escena en `client/components/events/`.
- `client/hooks/useHostMediaControls.js`: se reutiliza para el co-host con una presentación restringida.
- `client/hooks/useEventRoomSocket.js`: `stageLayout`.
- `client/app/live/[slug]/EventDetail.js`: propaga `coHost`.
- `client/lib/api.js`: `getScreenToken`.
- `client/lib/constants.js`: disposiciones y textos es-ES, flujo reducido, perfil de pantalla y uids reservados.

**Facturación:** +125 % por minuto-asistente (de HD a Full HD) **solo** mientras host y admin tienen las dos cámaras encendidas sin contenido compartido. Compartir pantalla y pizarra mantienen su banda actual gracias al flujo reducido. Si el evento permite al host elegir 1080p y lo elige, la entrevista a dos cámaras cruza a 2K (ver design).

**Sin dependencias externas nuevas.** Sin variables de entorno nuevas, sin cambios de CSP. Requiere que el proyecto de Agora mantenga **Co-host authentication** activo, como ya exige.

**Sin impacto** en LiveKit, `interaction_mode='meeting'`, eventos de vídeo pregrabado, facturas, créditos al monedero ni recuento de asistentes (el staff ya está excluido).

## Non-goals

- **Más de un co-presentador en cámara.** La escena admite como mucho dos cámaras (host + un admin). Si hay dos admins con la cámara encendida, se muestra el primero en entrar. El resto se oye pero no se ve.
- **Co-presentadores que no sean admin** (un segundo artista invitado): exigiría otra vía de elegibilidad y otra UI de concesión.
- **Pantalla compartida, pizarra, efectos, calidad o moderación para el admin.** Excluidos a propósito (ver arriba).
- **Cambios en `meeting`**: el admin ya publica allí como cualquier asistente, y el intercambio cámara/pantalla del host se conserva.
- **Ver la cámara del admin en la consola móvil del host.** La consola sigue mostrando el encuadre propio del host, que es su función. La composición completa está en la vista completa.
- **Rótulos con el nombre sobre cada cámara**: no pedidos, y el broadcast actual tampoco los tiene.
- **Bajar automáticamente la resolución de las dos cámaras** para quedarse en HD durante la entrevista. Descartado por decisión: se asume Full HD.
- **Composición en servidor** (transcodificación o Media Push de Agora): la escena se compone en cada navegador, sin coste de transcodificación ni latencia añadida.
