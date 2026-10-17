## ADDED Requirements

### Requirement: Catálogo de portadas

El sistema SHALL ofrecer exactamente tres portadas, identificadas por `inicio`, `intermedio` y `final`, con las etiquetas es-ES «Inicio», «Intermedio» y «Final». Cada una SHALL ser un JPG de 1920 × 1080 publicado en `client/public/cortinillas/<id>-v1.jpg`, generado a partir de su original PNG en `docs/cortinillas/`. Además SHALL existir un fondo neutro para la grabación, `client/public/grabacion/fondo-negro-v1.jpg`: un JPG negro de 1920 × 1080.

El catálogo SHALL vivir en `api/utils/stageCovers.js`, con un espejo en `client/lib/stageCovers.js` que tenga los mismos identificadores y ficheros. La URL pública de un fichero SHALL ser `<CLIENT_URL>/<ruta>`, construida solo en esos módulos.

Un fichero publicado NO SHALL sobrescribirse nunca: un diseño nuevo se publica con otro nombre (`-v2`) y se cambia en los dos catálogos.

#### Scenario: URL de la portada de inicio
- **WHEN** la API construye la URL pública de `inicio` con `CLIENT_URL = https://140d.art`
- **THEN** SHALL obtener `https://140d.art/cortinillas/inicio-v1.jpg`

#### Scenario: Identificador desconocido
- **WHEN** se pide la portada `descanso`
- **THEN** el catálogo SHALL responder que no existe, sin lanzar

### Requirement: Alcance de las portadas

Las portadas SHALL existir solo en eventos con `provider='agora'`, `interaction_mode='broadcast'` y `format='live'`. El predicado SHALL ser uno por lado, `supportsStageCovers(event)`, en los dos módulos del catálogo. En cualquier otro evento NO SHALL mostrarse el menú, NO SHALL aceptarse `stage_cover` y el inicio NO SHALL fijar ninguna portada.

#### Scenario: Evento meeting
- **WHEN** el host entra en un evento Agora `meeting`
- **THEN** no ve el menú «Portadas»

#### Scenario: Evento LiveKit
- **WHEN** el admin inicia un evento LiveKit
- **THEN** no se fija ninguna portada

### Requirement: Estado de la portada en la sala

`api/socket/eventSocket.js` SHALL guardar la portada de cada evento en memoria (`eventStageCovers`, del id del evento al id de la portada; sin entrada no hay portada). Es el mismo ciclo de vida que la disposición de cámaras:

- El mensaje `stage_cover { cover }` SHALL aceptarse solo si lo envía una entrada de presencia con `isHost` o `coHost`, en un evento que cumpla `supportsStageCovers`, y si `cover` es `null` o un identificador del catálogo. Cualquier otro SHALL ignorarse en silencio.
- Al aceptarlo, SHALL guardar el valor (o borrar la entrada con `null`), emitir `stage_cover { cover }` a toda la sala `event-room-{id}`, incluido quien lo envió, y disparar una reconciliación de la grabación sin esperarla.
- El ACK de `join_event_room` SHALL incluir `stageCover`, con el id de la portada o `null`.
- `broadcastEventEnded` SHALL borrar la entrada.
- El objeto que devuelve `eventSocket` SHALL exponer `setStageCover(eventId, cover)`, que guarda y emite a la sala igual que el mensaje, para el inicio del evento, y `getStageState(eventId)`, que devuelve `{ screenSharing, cover }` para la grabación.

Un reinicio de la API pierde la portada. Los clientes convergen a «sin portada» al volver a unirse.

#### Scenario: El host pone el intermedio
- **WHEN** el host emite `stage_cover { cover: 'intermedio' }`
- **THEN** todos los presentes en la sala reciben `stage_cover { cover: 'intermedio' }`, el host incluido

#### Scenario: El co-presentador cambia la portada
- **WHEN** el co-presentador emite `stage_cover { cover: 'final' }`
- **THEN** la portada pasa a `final` para todos

#### Scenario: Un asistente intenta poner una portada
- **WHEN** un asistente ordinario o un promovido emite `stage_cover { cover: 'inicio' }`
- **THEN** el servidor lo ignora y no emite nada

#### Scenario: Portada desconocida
- **WHEN** el host emite `stage_cover { cover: 'otra' }`
- **THEN** el servidor lo ignora y la portada no cambia

#### Scenario: Llegada tarde
- **WHEN** un asistente entra en la sala con la portada `intermedio` puesta
- **THEN** el ACK de su unión lleva `stageCover: 'intermedio'`

#### Scenario: Fin del evento
- **WHEN** el evento termina con una portada puesta
- **THEN** `getStageState` del evento devuelve `cover: null`

### Requirement: La portada en la escena

`client/components/events/BroadcastStage.js` SHALL recibir la portada activa y, si la hay, pintar su imagen sobre todas las capas de la escena: cámaras, recuadros de esquina, pantalla compartida y pizarra. La imagen SHALL ocupar el marco entero, con `object-contain` sobre fondo blanco, y solo el botón del teatro SHALL quedar por encima. SHALL verse igual para host, co-presentador y audiencia, en escritorio, en la vista compacta, en horizontal y en el teatro. Mientras haya portada NO SHALL mostrarse el aviso «Esperando al host».

La capa de portada SHALL añadirse como un hijo más. NO SHALL desmontar ni mover las capas existentes: la pizarra sigue siendo el primer hijo y ningún `AgoraVideo` se vuelve a montar.

En la consola móvil del host, el panel de vídeo y el modo «Vídeo» SHALL mostrar la portada activa en lugar de la vista previa de la cámara. Para `useScreenWakeLock` de los asistentes, una portada SHALL contar como algo que ver.

La imagen SHALL llevar como `alt` el titular de su portada: «Empezamos en breve», «Volvemos enseguida» o «Gracias por acompañarnos».

#### Scenario: Asistente que entra antes que el host
- **WHEN** un asistente entra en un stream recién iniciado
- **THEN** ve «Empezamos en breve» en la escena, y no «Esperando al host»

#### Scenario: Teatro
- **WHEN** un asistente abre el teatro con la portada `intermedio` puesta
- **THEN** el teatro muestra la portada entera, centrada sobre blanco

#### Scenario: Se quita la portada
- **WHEN** la portada pasa a `null` con la cámara del host ya publicada
- **THEN** la escena muestra la cámara sin volver a montar su `AgoraVideo`

### Requirement: Menú «Portadas»

El host y el co-presentador de un evento que cumpla `supportsStageCovers` SHALL tener un menú «Portadas» con cuatro opciones: «Ninguna», «Inicio», «Intermedio» y «Final». La opción marcada SHALL ser la portada de la sala (`stageCover` de `client/hooks/useEventRoomSocket.js`), nunca un estado local. Elegir una opción SHALL emitir `stage_cover` y cerrar el menú.

- **Escritorio:** junto a «Efectos» en `AgoraHostControls` (`client/components/AgoraLiveRoom.js`) y en `CoHostControls`. Mismo marcado y mismo comportamiento de apertura y cierre que `DeviceDropdown` y `VideoEffectsMenu` (clic fuera, Escape), y un solo menú abierto a la vez.
- **Consola móvil (`HostConsole`):** una tarjeta «Portadas» con su propio selector, hijo directo de la superposición.
- **Vista compacta:** una entrada «Portadas» en «Más» (`CompactHostControls` y `CompactCoHostControls`), que abre una hoja `LiveRoomSheet`.

El menú NO SHALL depender de la cámara ni deshabilitarse por ella, y SHALL mostrarse también en móvil. Ninguna de sus presentaciones SHALL pintarse con un portal a `document.body`. Los asistentes NO SHALL verlo nunca. Los textos SHALL vivir en `client/lib/constants.js`.

#### Scenario: Host con la cámara apagada
- **WHEN** el host tiene la cámara apagada y abre «Portadas»
- **THEN** el menú está habilitado y puede elegir «Intermedio»

#### Scenario: Cambio hecho por el otro presentador
- **WHEN** el co-presentador elige «Final» y el host tiene «Portadas» a la vista
- **THEN** el menú del host marca «Final»

#### Scenario: Asistente
- **WHEN** un asistente ordinario está en la sala
- **THEN** no ve «Portadas» en ninguna vista

### Requirement: Elegir una portada vacía la escena

Cada vez que el cliente de un presentador (host o co-presentador) reciba `stage_cover` con una portada no nula, también si es el eco de su propia elección, SHALL:

- apagar su cámara si está encendida;
- dejar de compartir pantalla si comparte;
- silenciar su micrófono si está abierto;
- en el caso del host, apagar la pizarra si está activa.

Pasar de una portada a otra SHALL aplicar lo mismo. Elegir «Ninguna» NO SHALL encender nada. La portada recibida en el ACK de unión NO SHALL apagar nada: al unirse, los presentadores aún no publican. Los asistentes promovidos NO SHALL verse afectados.

La lógica SHALL vivir en `client/hooks/useHostMediaControls.js`, instanciado una sola vez en `AgoraLiveRoom`, y la pizarra se apaga con el mismo `toggleWhiteboard` de la sala.

#### Scenario: Intermedio con la cámara y el micrófono encendidos
- **WHEN** el host, con cámara y micrófono encendidos, elige «Intermedio»
- **THEN** su cámara y su micrófono quedan apagados y todos ven «Volvemos enseguida»

#### Scenario: El co-presentador pone una portada mientras el host comparte pantalla
- **WHEN** el host comparte pantalla y el co-presentador elige «Final»
- **THEN** el host deja de compartir pantalla y la escena muestra «Gracias por acompañarnos»

#### Scenario: Pizarra activa
- **WHEN** el host elige «Inicio» con la pizarra activa
- **THEN** la pizarra se desactiva para todos

### Requirement: Una acción de vídeo quita la portada

Con una portada activa, cuando un presentador complete con éxito una de estas acciones, su cliente SHALL emitir `stage_cover { cover: null }`:

- encender su cámara;
- empezar a compartir pantalla;
- en el caso del host, activar la pizarra.

El menú de todos los presentadores SHALL pasar a «Ninguna». Si la acción falla, la portada SHALL seguir puesta. Encender el micrófono, cambiar de dispositivo, de efecto, de calidad o de disposición de cámaras NO SHALL quitarla.

#### Scenario: El host enciende la cámara sobre «Inicio»
- **WHEN** el host enciende la cámara con la portada `inicio` puesta
- **THEN** todos pasan a ver su cámara y «Portadas» marca «Ninguna»

#### Scenario: Hablar sobre la portada final
- **WHEN** el host enciende el micrófono con la portada `final` puesta
- **THEN** la portada sigue puesta y todos le oyen

#### Scenario: La cámara no arranca
- **WHEN** el host intenta encender la cámara con una portada puesta y la cámara falla
- **THEN** la portada sigue puesta y el host ve el error de la cámara

### Requirement: Portada «Inicio» al iniciar el stream

Cuando un evento que cumpla `supportsStageCovers` pase a `active`, por «Iniciar» o por el inicio automático, el sistema SHALL fijar la portada `inicio` con `setStageCover`. Lo hará después de guardar el estado `active` y antes de emitir `event_started` y de disparar la reconciliación de la grabación, de modo que la primera tarea de grabación ya arranque con la portada. Los dos caminos de inicio SHALL compartir esta operación, sin copias.

#### Scenario: Inicio de un stream
- **WHEN** el admin pulsa «Iniciar» en un evento Agora `broadcast` en directo
- **THEN** `getStageState` del evento devuelve `cover: 'inicio'`
- **AND** quien entra en la sala ve «Empezamos en breve»

#### Scenario: Primera tarea de grabación
- **WHEN** se inicia un stream con grabación activada
- **THEN** el `start` de Agora lleva ya el diseño de portada con la imagen de `inicio`
