# agora-whiteboard — Delta Spec (fase opcional, separable)

> Capa afectada: backend (`api/`) y frontend (`client/`). Cambio de BD: columna `events.whiteboard_room_uuid` SOLO vía `api/config/database.js` (`CREATE TABLE` + `safeAlter`). Esta capability completa puede omitirse en la implementación sin afectar a `agora-streaming-provider`.

## ADDED Requirements

### Requirement: Credenciales y configuración de la pizarra
`api/config/env.js` SHALL exponer el grupo `config.agoraWhiteboard` con `appIdentifier` (`AGORA_WHITEBOARD_APP_IDENTIFIER`), `ak` (`AGORA_WHITEBOARD_AK`), `sk` (`AGORA_WHITEBOARD_SK`) y `region` (`AGORA_WHITEBOARD_REGION`, defecto `eu`), todos opcionales. Los SDK tokens SHALL generarse exclusivamente en el servidor con AK/SK (paquete `netless-token`); ninguna credencial de pizarra SHALL viajar al cliente salvo el room token de su rol. Si las credenciales no están configuradas, el toggle de pizarra SHALL quedar oculto para el host (degradación silenciosa).

#### Scenario: Sin credenciales, sin pizarra
- **WHEN** un evento Agora está activo sin `AGORA_WHITEBOARD_*` configuradas
- **THEN** el host no ve el control "Pizarra" y el resto de la sala funciona con normalidad

### Requirement: Creación perezosa de la sala de pizarra
La sala de pizarra SHALL crearse solo la primera vez que el host activa la pizarra en un evento (coste cero si no se usa): `api/services/whiteboardService.js` SHALL llamar a `POST https://api.netless.link/v5/rooms` (headers `token: <SDK Token>`, `region: config.agoraWhiteboard.region`) y persistir el `uuid` devuelto en `events.whiteboard_room_uuid`. Activaciones posteriores SHALL reutilizar la sala persistida.

#### Scenario: Primera activación crea la sala
- **WHEN** el host activa "Pizarra" por primera vez en un evento Agora activo
- **THEN** el backend crea la sala en la API de whiteboard y guarda su `uuid` en el evento

#### Scenario: Reactivación reutiliza la sala
- **WHEN** el host desactiva y vuelve a activar la pizarra
- **THEN** no se crea una sala nueva y el contenido dibujado previamente se conserva

### Requirement: Room tokens de pizarra por rol
El sistema SHALL exponer `POST /api/events/:id/whiteboard-token` (mismas credenciales que `/token`, o JWT de host) que devuelve `{ appIdentifier, region, uuid, roomToken, role }`. Roles: host → `writer`; asistentes → `reader` en `broadcast`; en `meeting`, si el host habilita "todos escriben", los asistentes SHALL recibir `writer`. El endpoint SHALL rechazar si el evento no es Agora, no está activo o la pizarra no está activada.

#### Scenario: Token de lectura para asistente en broadcast
- **WHEN** un asistente pide `whiteboard-token` con la pizarra activa en un broadcast
- **THEN** recibe un room token `reader` y puede ver la pizarra sin poder dibujar

#### Scenario: Todos escriben en meeting
- **WHEN** el host de un meeting habilita "todos escriben" y un asistente renueva su token de pizarra
- **THEN** el asistente recibe `writer` y puede dibujar

### Requirement: Toggle del host y visualización compartida
El host de un evento Agora SHALL disponer de un toggle "Pizarra" en sus controles. Al activarlo, el servidor SHALL emitir `whiteboard_toggle { active: true }` por la sala Socket.IO y todos los clientes SHALL montar la pizarra (Fastboard: `createFastboard({ sdkConfig: { appIdentifier, region }, joinRoom: { uid, uuid, roomToken } })` + `mount`, paquetes `@netless/fastboard` / `@netless/fastboard-react`, import dinámico `ssr:false`) ocupando el área principal, con el vídeo del host reducido a un tile y el audio ininterrumpido. Al desactivarlo, los clientes SHALL desmontar la pizarra y restaurar el layout de vídeo. El host SHALL poder escribir, añadir imágenes y usar las herramientas estándar de Fastboard; los asistentes SHALL ver los trazos en tiempo real.

#### Scenario: Pizarra en directo
- **WHEN** el host activa la pizarra y dibuja un esquema
- **THEN** todos los asistentes ven la pizarra en el área principal con los trazos en tiempo real y siguen oyendo al host

#### Scenario: Vuelta al vídeo
- **WHEN** el host desactiva la pizarra
- **THEN** todos los clientes restauran el layout de vídeo original sin recargar la página
