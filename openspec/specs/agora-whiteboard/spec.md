# agora-whiteboard

## Purpose

Optional interactive whiteboard for Agora events, backed by the Netless/Agora Whiteboard service. Covers the `AGORA_WHITEBOARD_*` credential group, lazy per-event room creation persisted in `events.whiteboard_room_uuid`, per-role room tokens (`writer` / `reader`, with an "everyone writes" mode for meetings), and the host toggle that swaps the main video area for the shared board across all clients. Degrades silently to no whiteboard when credentials are absent.

> Capa afectada: backend (`api/`) y frontend (`client/`). Cambio de BD: columna `events.whiteboard_room_uuid` SOLO vía `api/config/database.js` (`CREATE TABLE` + `safeAlter`). Esta capability completa puede omitirse en la implementación sin afectar a `agora-streaming-provider`.

## Requirements

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
El host de un evento Agora SHALL disponer de un toggle "Pizarra" en sus controles. Al activarlo, el servidor SHALL emitir `whiteboard_toggle { active: true }` por la sala Socket.IO y todos los clientes SHALL montar la pizarra (Fastboard: `createFastboard({ sdkConfig: { appIdentifier, region }, joinRoom: { uid, uuid, roomToken } })` + `mount`, paquetes `@netless/fastboard` / `@netless/fastboard-ui` con la API vanilla, import dinámico `ssr:false`) ocupando el área principal, con el vídeo del host reducido a un tile y el audio ininterrumpido. Al desactivarlo, los clientes SHALL desmontar la pizarra y restaurar el layout de vídeo. El host SHALL poder escribir, añadir imágenes y usar las herramientas estándar de Fastboard; los asistentes SHALL ver los trazos en tiempo real.

#### Scenario: Pizarra en directo
- **WHEN** el host activa la pizarra y dibuja un esquema
- **THEN** todos los asistentes ven la pizarra en el área principal con los trazos en tiempo real y siguen oyendo al host

#### Scenario: Vuelta al vídeo
- **WHEN** el host desactiva la pizarra
- **THEN** todos los clientes restauran el layout de vídeo original sin recargar la página

### Requirement: Política CSP para la pizarra interactiva (Agora Whiteboard)
La cabecera Content-Security-Policy de `client/next.config.js` SHALL permitir la carga de módulos del `white-web-sdk`: las directivas `script-src` y `connect-src` SHALL incluir `blob:` (además del `worker-src 'self' blob:` ya presente). Sin ello, `white-web-sdk` no puede cargar sus módulos —los inyecta con `document.createElement("script")` y `src=blob:`— y la pizarra falla con `[modules] load script with URL failed ... fetch "blob:..." failed`. Los hosts de la pizarra (`https://*.netless.link` / `wss://*.netless.link`) SHALL permanecer en `connect-src`.

#### Scenario: Host activa la pizarra sin errores de CSP
- **WHEN** el host activa la pizarra en un evento Agora activo
- **THEN** el `white-web-sdk` carga sus módulos desde `blob:` sin ser bloqueado por CSP y la pizarra se muestra a todos con los trazos en tiempo real

#### Scenario: Asistente ve la pizarra
- **WHEN** la pizarra está activa y un asistente recibe su room token de lectura
- **THEN** el asistente ve el lienzo renderizado (sin el error de carga de módulos) y los trazos del host en tiempo real

### Requirement: Aviso benigno de `agora-foundation` documentado (Agora Whiteboard)
El sistema SHALL documentar que `white-web-sdk@2.16.56` declara el peer `agora-foundation@"3.11.1-rc.1 || 3.11.1"`, versión **no publicada en npm** (solo existe hasta `3.11.0`), por lo que el paquete no se instala y el SDK cae a su logger de reserva (Argus), emitiendo el aviso NO bloqueante `agora-foundation logger worker unavailable, fallback to Argus` / `Cannot find module 'agora-foundation/lib/logger'`. NO SHALL forzarse una versión distinta del peer ni cambiarse la versión del SDK de pizarra para silenciarlo. Para silenciar todo el ruido de red relacionado, `connect-src` SHALL incluir `https://*.agoralab.co` y `wss://*.agoralab.co` (endpoints `api-solutions-*` del logger de reserva), y `font-src` SHALL incluir `https://*.netless.link` (fuentes de `convertcdn.netless.link`).

#### Scenario: Aviso conocido no bloquea la pizarra
- **WHEN** el host activa la pizarra y aparece en consola `agora-foundation logger worker unavailable, fallback to Argus`
- **THEN** la pizarra funciona con normalidad (el aviso es benigno y está documentado como conocido)

### Requirement: Compatibilidad de la pizarra con React 19
La pizarra SHALL funcionar y ser **dibujable** bajo React 19. La causa del fallo ("binding container" / "render is not a function"; pizarra visible pero no dibujable) es que **`white-web-sdk`** llama a `ReactDOM.render` y `unmountComponentAtNode`, eliminados en React 19 (NO es el wrapper `@netless/fastboard-react`: el error reaparece también con la API vanilla). El sistema SHALL incluir `client/lib/reactDomLegacyShim.js`, que re-implementa esos métodos legacy sobre `createRoot` (`react-dom/client`, con `flushSync`) parcheando el `module.exports` de `react-dom`, y SHALL importarlo **antes** de `@netless/fastboard` en `WhiteboardPanel.js`. `WhiteboardPanel.js` SHALL montar la pizarra con la API vanilla `@netless/fastboard` (`createFastboard` + `mount(app, div, { config })`, UI Svelte de `@netless/fastboard-ui`), destruir la instancia (`ui.destroy()` + `app.destroy()`) al desmontar, y usar el rol correcto (`isWritable`). NO SHALL cambiarse la versión del SDK de pizarra.

#### Scenario: El host puede dibujar en la pizarra
- **WHEN** el host activa la pizarra (rol writer) y usa las herramientas de dibujo
- **THEN** puede dibujar y los trazos se propagan a los asistentes en tiempo real, sin el error `render is not a function`

#### Scenario: El asistente ve la pizarra en modo lectura
- **WHEN** un asistente en `broadcast` recibe el rol reader
- **THEN** ve el lienzo y los trazos del host sin la barra de herramientas de edición (config de solo lectura), y sin errores de binding

### Requirement: Nombres reales en los cursores en vivo de la pizarra
Los cursores en vivo de la pizarra SHALL mostrar el **nombre real** del usuario (el mismo nombre de la presencia del evento) en lugar de la identity interna (`host-<id>` / `viewer-<n>`). Para ello, `WhiteboardPanel` SHALL unir la sala pasando `joinRoom.userPayload = { nickName: <nombre> }` a `createFastboard` (el cursor de `@netless/window-manager` resuelve su etiqueta como `payload.nickName || payload.cursorName || memberId`). El `uid`/token de la sala NO SHALL cambiar (el `userPayload` es informativo). Si el nombre no está disponible, el comportamiento SHALL degradar al actual (etiqueta = memberId).

#### Scenario: El asistente ve el nombre del host en el cursor
- **WHEN** el host dibuja en la pizarra activa
- **THEN** los asistentes ven junto al cursor del host su nombre real, no `host-<id>`

#### Scenario: Cursores de participantes con "Todos escriben"
- **WHEN** en un meeting con "Todos escriben" activo varios participantes mueven el cursor sobre la pizarra
- **THEN** cada cursor muestra el nombre real del participante correspondiente, no `viewer-<n>`

### Requirement: Pizarra en modo teatro con interactividad completa
Cuando la pizarra se visualiza en el modo teatro de la sala Agora, la instancia fastboard NO SHALL remontarse al entrar ni al salir del teatro (el contenedor de la pizarra conserva su posición en el árbol de componentes; solo cambia su posicionamiento CSS). En teatro, el **host SHALL poder seguir escribiendo y usando la toolbar** con normalidad, y los **asistentes con rol writer** (meeting con "Todos escriben") SHALL poder escribir igualmente; los asistentes con rol reader SHALL seguir en solo lectura. El cambio del flag "Todos escriben" durante el teatro SHALL comportarse como en la vista normal (remontaje por credenciales/rol nuevos, con el contenido persistido en el servidor).

#### Scenario: El host escribe en la pizarra a pantalla completa
- **WHEN** el host activa el teatro sobre la pizarra y usa las herramientas de dibujo
- **THEN** puede dibujar con normalidad y los trazos llegan a los asistentes en tiempo real
- **AND** al salir del teatro la pizarra continúa en la vista normal sin recargarse ni perder el estado de la sesión

#### Scenario: Asistente writer escribe en teatro
- **WHEN** en un meeting con "Todos escriben" activo un asistente entra al teatro de la pizarra y dibuja
- **THEN** sus trazos se propagan a todos, igual que en la vista normal

#### Scenario: Asistente reader en teatro sigue en solo lectura
- **WHEN** un asistente con rol reader (broadcast, o meeting sin "Todos escriben") entra al teatro de la pizarra
- **THEN** ve el lienzo y los trazos en tiempo real sin toolbar de edición y no puede dibujar

### Requirement: Inserción de imágenes en la pizarra
La pizarra SHALL permitir insertar imágenes en el lienzo a los usuarios con rol writer efectivo: el **host** siempre, y los **asistentes** cuando su rol es writer ("Todos escriben" activo en meeting). La inserción SHALL ofrecer dos orígenes desde un control propio superpuesto a la pizarra (visible solo para writers): **subida de un fichero desde el dispositivo** (PNG, JPG o WEBP, hasta 10MB) y **pegado de la URL de una imagen externa** (http/https). La imagen insertada SHALL aparecer en el lienzo para **todos** los participantes en tiempo real, y SHALL comportarse como un elemento del lienzo: los writers SHALL poder seleccionarla, moverla y redimensionarla con la herramienta de selección, y los readers SHALL verla sin poder manipularla. Los mensajes de la UI SHALL estar en es-ES.

#### Scenario: El host sube una imagen desde su dispositivo
- **WHEN** el host pulsa el control de insertar imagen, elige un fichero JPG válido de su equipo y confirma
- **THEN** la imagen se sube al servidor y se inserta en el lienzo de la pizarra
- **AND** todos los participantes la ven aparecer en tiempo real

#### Scenario: Un asistente writer inserta una imagen por URL
- **WHEN** en un meeting con "Todos escriben" activo un asistente pega la URL http(s) de una imagen externa y confirma
- **THEN** la imagen se inserta en el lienzo y todos los participantes la ven

#### Scenario: Mover y redimensionar una imagen insertada
- **WHEN** un writer selecciona una imagen del lienzo con la herramienta de selección y la arrastra o redimensiona
- **THEN** el cambio de posición/tamaño se propaga a todos los participantes en tiempo real

#### Scenario: Un reader no puede insertar ni manipular imágenes
- **WHEN** un asistente con rol reader (broadcast, o meeting sin "Todos escriben") visualiza la pizarra con imágenes
- **THEN** ve las imágenes y sus movimientos en tiempo real, pero no dispone del control de insertar ni puede seleccionarlas o moverlas

#### Scenario: Fichero no válido rechazado
- **WHEN** un writer intenta subir un fichero que no es PNG/JPG/WEBP o supera los 10MB
- **THEN** la subida se rechaza y se muestra un mensaje de error claro en es-ES sin afectar a la pizarra

### Requirement: Subida y servido de imágenes de pizarra en el backend
El backend SHALL exponer un endpoint de subida de imagen de pizarra asociado al evento que SHALL validar: que el evento existe y está **activo**, que la **pizarra está activa**, que el solicitante está autorizado (host autenticado por JWT, o asistente por `attendeeId` + `accessToken`) y que su **rol efectivo es writer** (host siempre; asistente solo con "Todos escriben" activo en meeting). El fichero SHALL almacenarse con nombre UUID bajo el prefijo `whiteboard/` siguiendo el patrón de almacenamiento existente (S3 cuando está configurado, disco local como fallback), sin registro en base de datos. La respuesta SHALL incluir la **URL pública absoluta** de la imagen, apta para `insertImage`. El backend SHALL servir las imágenes de pizarra en un endpoint público de lectura con cabeceras de caché, de modo que cualquier participante (incluidos asistentes sin cuenta) pueda cargarlas desde el lienzo durante toda la vida de la sala.

#### Scenario: Subida autorizada de un writer
- **WHEN** el host (o un asistente writer con credenciales válidas) sube una imagen PNG válida al endpoint con la pizarra activa
- **THEN** el fichero se almacena con nombre UUID bajo `whiteboard/` y la respuesta incluye la URL pública absoluta de la imagen

#### Scenario: Subida rechazada a un asistente sin rol writer
- **WHEN** un asistente intenta subir una imagen cuando "Todos escriben" no está activo
- **THEN** el backend responde con error de autorización y no almacena el fichero

#### Scenario: Subida rechazada con la pizarra inactiva o el evento no activo
- **WHEN** se intenta subir una imagen de pizarra con la pizarra desactivada o el evento finalizado
- **THEN** el backend rechaza la petición con un error claro y no almacena el fichero

#### Scenario: Cualquier participante carga la imagen servida
- **WHEN** el navegador de un asistente sin cuenta solicita la URL pública de una imagen de pizarra existente
- **THEN** el backend la sirve con cabeceras de caché y la imagen se muestra en el lienzo

### Requirement: Panel de apps de fastboard oculto
La UI de la pizarra para writers NO SHALL mostrar el botón/panel de apps de fastboard-ui (que expone las apps integradas de Netless como "Code" y "Countdown"). El resto de la toolbar de edición (herramientas de dibujo, deshacer/rehacer, zoom, páginas) SHALL permanecer sin cambios. Los readers SHALL seguir sin toolbar, como hasta ahora.

#### Scenario: Writer sin panel de apps
- **WHEN** el host o un asistente writer abre la pizarra
- **THEN** la toolbar de edición se muestra completa pero sin el botón de apps (no hay acceso a "Code" ni "Countdown")

#### Scenario: Reader sin cambios
- **WHEN** un asistente reader visualiza la pizarra
- **THEN** sigue viendo el lienzo limpio sin toolbar, como en el comportamiento vigente
