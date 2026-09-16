## ADDED Requirements

### Requirement: Menú «Expulsar del chat» para el admin

Un usuario con rol `admin` en la sala en directo de un evento SHALL disponer sobre los mensajes del chat del **mismo menú «Expulsar del chat» que el host**. El rol se toma de `user.role` de la sesión del cliente, leído en `client/app/live/[slug]/EventDetail.js` con `useAuth()` y pasado como prop `isAdmin`. Aplica a las salas:

- Agora `broadcast`, donde el admin es co-presentador;
- Agora `meeting`;
- LiveKit.

El menú SHALL ejecutar la misma acción (`eventsAPI.banFromChat` → `POST /api/events/:id/participants/:identity/ban-from-chat`) con el mismo efecto.

- **Sobre qué mensajes NO SHALL ofrecerse:**
  - los propios: en Agora, `identity` igual a la identidad propia de la sala; en LiveKit, `from.isLocal`;
  - los del host (identidad `host-*`);
  - en Agora, los de cualquier participante cuya presencia tenga `coHost` o `staff`.
- **Cuando el admin es además el host del evento,** SHALL comportarse como host.
- **En la disposición compacta** de `live-event-mobile-layout`, el menú SHALL abrir la hoja de moderación de esa capacidad.
- **El chat de los pases de vídeo** (`format='video'`) no tiene moderación y NO SHALL ganarla.

La condición SHALL evaluarse igual en `client/components/AgoraLiveRoom.js` y en `client/components/EventLiveRoom.js`: `isHost || isAdmin`.

#### Scenario: El admin expulsa del chat en un stream Agora

- **WHEN** el admin, en la sala como co-presentador, abre el menú de un mensaje de un asistente y pulsa «Expulsar del chat»
- **THEN** el asistente queda con `chat_banned = 1` y sus mensajes dejan de difundirse
- **AND** su cliente muestra «Has sido expulsado del chat por comportamiento inapropiado.»

#### Scenario: El admin expulsa del chat en una reunión Agora

- **WHEN** el admin, en una reunión, usa «Expulsar del chat» sobre el mensaje de un participante
- **THEN** el participante queda expulsado del chat igual que si lo hubiera hecho el host

#### Scenario: El admin expulsa del chat en un evento LiveKit

- **WHEN** el admin, en la sala de un evento `provider='livekit'`, usa «Expulsar del chat» sobre un mensaje
- **THEN** el participante pierde `canPublishData` y queda con `chat_banned = 1`

#### Scenario: Mensajes sin menú

- **WHEN** el admin mira el chat
- **THEN** no hay menú sobre sus propios mensajes, ni sobre los del host, ni sobre los de otro miembro del staff

#### Scenario: Un asistente ordinario no modera

- **WHEN** un asistente sin rol `admin` que no es el host mira el chat
- **THEN** no ve el menú en ningún mensaje

### Requirement: Autorización del endpoint de expulsión del chat

`POST /api/events/:id/participants/:identity/ban-from-chat` (`api/routes/eventRoutes.js` con `authenticate`; `banFromChat` en `api/controllers/eventController.js`) SHALL aceptar a:

- el host del evento (`req.user.id === event.host_user_id`);
- un usuario cuyo rol **actual** sea `admin` (`req.user.role`, que passport lee de la fila de `users` en cada petición, no del JWT).

Cualquier otro usuario autenticado SHALL recibir **403** con el mensaje «Solo el host o un administrador pueden expulsar del chat», sin efectos. Una petición sin JWT SHALL recibir **401**.

Para el host y para el admin SHALL regir las mismas reglas:

- **400** si la identidad es `host-*` o el evento no está activo con sala;
- **400 sin efectos** si el objetivo es staff (requisito «Protección del staff frente a la moderación» de `agora-broadcast-cohost`);
- **404** si el participante no pertenece al evento;
- **200** con `alreadyBanned: true` si ya estaba expulsado.

**Efectos por proveedor:**

- **Agora:** `eventService.markAttendeeChatBanned` y `eventSocket.notifyChatBanned`.
- **LiveKit:** revocar `canPublishData` y persistir `chat_banned`.

El endpoint NO SHALL exigir que el admin tenga fila de asistente en el evento. Los errores SHALL lanzarse con `ApiError` y responder por el `errorHandler` global.

#### Scenario: Admin que no es el host

- **WHEN** un admin que no es el host del evento Agora activo expulsa a un asistente ordinario
- **THEN** la API responde 200, persiste `chat_banned = 1` y notifica a la sala

#### Scenario: Vendedor que no es el host

- **WHEN** un usuario con rol `seller` que no es el host llama al endpoint
- **THEN** la API responde 403 con «Solo el host o un administrador pueden expulsar del chat»
- **AND** `chat_banned` del asistente sigue a 0

#### Scenario: Admin degradado con un JWT antiguo

- **WHEN** un usuario cuyo JWT dice `admin` pero cuya fila de `users` ya no lo es llama al endpoint
- **THEN** la API responde 403 y no expulsa a nadie

#### Scenario: El admin contra el staff

- **WHEN** un admin intenta expulsar del chat a un asistente con `is_staff = 1`
- **THEN** la API responde 400 y no marca `chat_banned`

#### Scenario: Sin sesión

- **WHEN** se llama al endpoint sin cabecera `Authorization`
- **THEN** la API responde 401

#### Scenario: Evento LiveKit

- **WHEN** un admin expulsa del chat a un asistente de un evento LiveKit activo
- **THEN** la API responde 200, revoca `canPublishData` en LiveKit y persiste `chat_banned = 1`

### Requirement: Traza de la expulsión del chat

Tras cada expulsión efectiva (no con `alreadyBanned`), `banFromChat` SHALL registrar con `logger.info` un objeto con:

- `eventId`, `identity` y `actorUserId`;
- `actorRole`: `'host'` cuando quien expulsa es el host del evento, aunque sea también admin, y `'admin'` en otro caso.

La traza NO SHALL escribir en la base de datos.

#### Scenario: Traza de una expulsión por el admin

- **WHEN** un admin que no es el host expulsa del chat a un asistente
- **THEN** se registra una línea `info` con `actorRole: 'admin'` y su `actorUserId`

#### Scenario: El host que también es admin

- **WHEN** el host del evento, cuyo rol es `admin`, expulsa del chat a un asistente
- **THEN** la traza registra `actorRole: 'host'`

### Requirement: La presencia identifica al staff

Cada entrada pública de presencia de la sala Socket.IO de eventos Agora (`publicPresence` en `api/socket/eventSocket.js`) SHALL incluir `staff: boolean`:

- `true` para un asistente con `is_staff = 1`;
- `false` para el host y para los asistentes ordinarios.

El valor SHALL fijarse al unirse a la sala y actualizarse en una reconexión de la misma identidad.

En el cliente, `client/components/AgoraLiveRoom.js` SHALL construir el conjunto de identidades protegidas frente al menú de expulsión con `coHost || staff`. El rechazo en el servidor ya existente no cambia.

#### Scenario: El admin en una reunión

- **WHEN** el admin entra con su acceso de administrador en un evento Agora `meeting`
- **THEN** su presencia lleva `staff: true` y `coHost: false`

#### Scenario: El host no ve el menú sobre el admin en una reunión

- **WHEN** el admin escribe en el chat de una reunión
- **THEN** el host no ve el menú «Expulsar del chat» sobre ese mensaje

#### Scenario: Asistente ordinario y host

- **WHEN** un asistente ordinario y el host están en la sala
- **THEN** la presencia de ambos lleva `staff: false`
