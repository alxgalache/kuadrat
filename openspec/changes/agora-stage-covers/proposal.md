## Why

En un stream (evento Agora `broadcast`) no hay forma de cubrir la escena con una imagen fija en los momentos sin emisión: antes de empezar, en un intermedio o al terminar, antes de pulsar «Finalizar stream». El público ve un rectángulo negro con «Esperando al host…» o la última imagen de la cámara. La grabación muestra el último fotograma congelado de quien apagó la cámara.

«Efectos» no sirve para esto. Sus fondos sustituyen el fondo de la **cámara** del host: exigen la cámara encendida y dejan al host delante. Una portada no depende de ninguna cámara y no deja ver nada delante.

Las tres portadas ya están diseñadas (`docs/cortinillas/`: «Empezamos en breve», «Volvemos enseguida» y «Gracias por acompañarnos», 1920 × 1080).

## What Changes

- **Menú «Portadas»** junto a «Efectos», con «Ninguna», «Inicio», «Intermedio» y «Final». No depende de la cámara. Lo tienen el host y el co-presentador, en la vista de escritorio, en la consola móvil y en «Más» de la vista compacta.
- **Una portada activa ocupa toda la escena, igual para todos los roles.** Se pinta por encima de cámaras, pantalla y pizarra, también en el teatro y en la vista compacta.
- **La escena se vacía al elegir una portada.** Cada presentador (host y co-presentador) apaga su cámara, su pantalla compartida y su micrófono. El host apaga también la pizarra. Quitar la portada no enciende nada.
- **Cualquier acción de vídeo de un presentador quita la portada:** encender la cámara, compartir pantalla o activar la pizarra. El menú vuelve a «Ninguna». Encender el micrófono no la quita: se puede hablar sobre «Final».
- **El estado de la portada vive en la sala Socket.IO del evento**, como la disposición de cámaras. Se emite con `stage_cover`, se entrega en el ACK de unión a quien llega tarde y se borra al terminar el evento.
- **Al iniciar un stream, la portada es «Inicio».** Así, quien entra antes que el host ve «Empezamos en breve». Vale para el inicio manual y, con `event-auto-start`, para el automático, porque los dos comparten el mismo camino.
- **Las portadas salen en la grabación de Agora.** En modo `mix`, `updateLayout` admite una imagen de fondo del lienzo (`backgroundImage`) y cambiarla en plena grabación. Mientras hay portada, el diseño pasa a uno personalizado de ventanas transparentes con la portada de fondo: no se ve nadie delante y el audio sigue en la mezcla. Al quitarla, vuelve el diseño de siempre.
  - **Todo diseño enviado a Agora fija `backgroundImage` explícitamente**: una imagen negra cuando no hay portada. La documentación no aclara si `updateLayout` sustituye o combina la configuración, y así la portada no puede quedarse pegada. Efecto secundario deliberado: tras 3,5 s, quien apaga la cámara aparece en negro en vez de congelado, según la documentación de Agora.
- **Las imágenes se publican como JPG versionados** (`client/public/cortinillas/<nombre>-v1.jpg`). La documentación de Agora solo cita JPG y BMP, y las fuentes PNG son opacas, así que la conversión no pierde nada. Las sirve el cliente desde `CLIENT_URL`, que el proxy de preproducción no bloquea para `.jpg`. Un cambio de diseño se publica como `-v2`.

## Capabilities

### New Capabilities

- `agora-stage-covers`: portadas de la escena de un stream. Cubre el catálogo, el alcance, el estado compartido en la sala, cómo se pintan, el menú, el vaciado de la escena al elegir una, las acciones que la quitan y la portada «Inicio» al iniciar.

### Modified Capabilities

- `agora-cloud-recording`: el diseño del lienzo pasa a derivarse de la escena completa (portada y pantalla compartida), con un lector de estado de la escena en lugar de `isStageScreenSharing`. Se añaden la columna `applied_cover` y el `backgroundImage` explícito, y el manejador `stage_cover` dispara una reconciliación inmediata.
- `agora-broadcast-cohost`: el co-presentador gana el menú «Portadas». Es una excepción razonada a «dos operadores producen estados incompatibles», porque la portada es un único valor en el servidor y gana el último.

## Impact

- **Capas:** backend y frontend.
- **API:**
  - `api/socket/eventSocket.js`: mapa `eventStageCovers`, manejador `stage_cover`, `stageCover` en el ACK, lector `getStageState`, `setStageCover` para el inicio y limpieza en `broadcastEventEnded`;
  - `api/services/agoraRecordingService.js`: `mixLayoutFor`, `ensureLayout`, `startTask` y el lector;
  - `api/scheduler/recordingScheduler.js`;
  - `api/controllers/eventAdminController.js` (inicio);
  - módulo nuevo `api/utils/stageCovers.js`: catálogo, URL pública y predicado de alcance.
- **Cliente:**
  - `client/components/events/BroadcastStage.js`: capa de portada;
  - menú nuevo `client/components/events/StageCoverMenu.js` y sus opciones;
  - `client/components/AgoraLiveRoom.js`: `AgoraHostControls` y pizarra;
  - `client/components/events/{CoHostControls,HostConsole,CompactHostControls}.js`;
  - `client/hooks/{useEventRoomSocket,useHostMediaControls}.js`;
  - espejo `client/lib/stageCovers.js`;
  - textos en `client/lib/constants.js`;
  - cuatro JPG estáticos.
- **Esquema de BD:** una columna nueva, `event_recordings.applied_cover TEXT`, sin `CHECK`, en el `CREATE TABLE` y con `safeAlter`. El `CHECK` de `applied_layout` (`'adaptive','screen'`) no se puede ampliar en producción, así que no se toca. Solo en `api/config/database.js`.
- **Dependencias:** ninguna nueva. Integración externa: la REST de Agora Cloud Recording, que ya se usa (`start` y `updateLayout`, con campos nuevos).
- **Coste:** una portada no publica vídeo, así que mientras está puesta los espectadores no reciben vídeo facturable de la escena. La grabación factura por flujos grabados, no por el lienzo.
- **Tests (Jest):** socket (`stage_cover`, permisos, validación, ACK, ciclo de vida), `mixLayoutFor` con portada, `ensureLayout` con `applied_cover` y la portada «Inicio» al iniciar. El cliente no tiene runner: la escena, el menú, el vaciado y la grabación real se verifican a mano, la grabación en preproducción.
- **Despliegue:** API y cliente juntos.

## Non-goals

- Portadas en `meeting`, en LiveKit o en los pases de vídeo (`format='video'`). «Stream» es `broadcast`: la escena y la grabación `mix` solo existen ahí.
- Subir portadas desde el panel de admin o tener portadas por evento. El catálogo es fijo y se cambia publicando un fichero nuevo.
- Texto, cuenta atrás o música sobre la portada.
- Conservar la portada tras un reinicio de la API. Vive en memoria, como la disposición de cámaras y la pizarra: el host la vuelve a poner.
- Cambiar la portada desde `/admin/espacios` sin entrar en la sala.
- Apagar las cámaras de los asistentes promovidos: no están en la escena, y en la grabación quedan ocultos tras la portada.
