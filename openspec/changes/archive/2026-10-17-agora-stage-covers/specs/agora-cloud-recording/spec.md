## MODIFIED Requirements

### Requirement: Diseño del lienzo según la pantalla compartida

En modo `mix`, el diseño del lienzo SHALL derivarse del estado de la escena —portada y pantalla compartida— mediante una única función pura, `mixLayoutFor({ screenSharing, cover })`:

- **Con portada:** `{ mixedVideoLayout: 3, layoutConfig, backgroundImage: <URL pública de la portada> }`. `layoutConfig` tiene 17 regiones, las que admite Agora, cada una con el lienzo entero (`x_axis: 0`, `y_axis: 0`, `width: 1`, `height: 1`) y `alpha: 0`. Ningún participante se ve sobre la portada, y el audio de todos sigue en la mezcla. La portada SHALL tener prioridad sobre la pantalla compartida.
- **Sin portada y sin pantalla compartida:** `{ mixedVideoLayout: 1 }` (adaptativo).
- **Sin portada y con pantalla compartida:** `{ mixedVideoLayout: 2, maxResolutionUid: '2' }` (vertical con la pantalla en la ventana grande).

Todo diseño SHALL llevar `backgroundColor: '#000000'` y un `backgroundImage` explícito: la portada, o el fondo neutro `grabacion/fondo-negro-v1.jpg` cuando no hay portada. Las URLs SHALL salir del catálogo `api/utils/stageCovers.js`. Así ninguna portada queda en el lienzo al quitarla, la reemplace `updateLayout` la configuración entera o la combine con la anterior.

El estado de la escena SHALL leerse con un lector `getStageState(eventId)` expuesto por el objeto que devuelve `eventSocket`, que devuelve `{ screenSharing, cover }`:

- `screenSharing` sale de la presencia en memoria de `api/socket/eventSocket.js` (`entry.screenSharing` del host o del co-presentador, que comparten la única pantalla de la escena, fijado por el mensaje `screen_share`);
- `cover` sale del estado de la portada de la sala (`agora-stage-covers`).

Ninguno de los dos SHALL copiarse a otro almacén. Sin presencia, `screenSharing` SHALL tomarse como `false`, y sin portada, `cover` como `null`.

El diseño aplicado a cada tarea SHALL guardarse en dos columnas de `event_recordings`: `applied_layout` (`'adaptive' | 'screen'`, la parte de la pantalla compartida) y `applied_cover` (`NULL` o el id de la portada). Cuando cualquiera de las dos difiera de lo deseado, el sistema SHALL llamar a `updateLayout` y, solo si responde con éxito, actualizar ambas. Un fallo de `updateLayout` NO SHALL detener la grabación y SHALL reintentarse en la siguiente reconciliación. Los manejadores `screen_share` y `stage_cover` SHALL disparar una reconciliación inmediata del evento.

#### Scenario: Un presentador empieza a compartir pantalla
- **WHEN** el host o el co-presentador de un evento `broadcast` grabado emite `screen_share { active: true }` sin portada puesta
- **THEN** el sistema SHALL llamar a `updateLayout` con el diseño vertical, `maxResolutionUid: '2'` y el fondo neutro
- **AND** `applied_layout` SHALL pasar a `'screen'`

#### Scenario: El presentador deja de compartir
- **WHEN** quien compartía emite `screen_share { active: false }`
- **THEN** el sistema SHALL volver al diseño adaptativo

#### Scenario: Se pone una portada
- **WHEN** el host de un evento `broadcast` grabado pone la portada `intermedio`
- **THEN** el sistema SHALL llamar a `updateLayout` con `mixedVideoLayout: 3`, las 17 regiones transparentes y `backgroundImage` igual a la URL de `intermedio`
- **AND** `applied_cover` SHALL pasar a `'intermedio'`

#### Scenario: Se quita la portada
- **WHEN** la portada pasa a `null` y nadie comparte pantalla
- **THEN** el sistema SHALL llamar a `updateLayout` con el diseño adaptativo y el fondo neutro
- **AND** `applied_cover` SHALL pasar a `NULL`

#### Scenario: Portada y pantalla a la vez
- **WHEN** hay portada y la presencia aún marca pantalla compartida
- **THEN** el diseño deseado SHALL ser el de la portada

#### Scenario: Fallo de updateLayout
- **WHEN** `updateLayout` responde con error
- **THEN** la tarea SHALL seguir en `recording` con su `applied_layout` y su `applied_cover` anteriores
- **AND** la siguiente reconciliación SHALL volver a intentarlo

#### Scenario: Grabación reanudada con la pantalla ya compartida
- **WHEN** arranca una tarea nueva mientras el host o el co-presentador comparten pantalla
- **THEN** el `start` SHALL llevar ya el diseño vertical

#### Scenario: Grabación arrancada con portada
- **WHEN** arranca una tarea nueva con una portada puesta
- **THEN** el `start` SHALL llevar ya el diseño de portada

### Requirement: Registro de tareas de grabación

Cada tarea de Agora SHALL tener una fila en la tabla nueva `event_recordings` (declarada en `api/config/database.js`) con, al menos: `id`, `event_id`, `mode` (`'mix' | 'individual'`), `attempt`, `recorder_uid`, `status` (`'starting' | 'recording' | 'stopping' | 'stopped' | 'interrupted' | 'failed'`), `stop_reason` (`'event_ended' | 'max_duration' | 'recording_disabled'`), `resource_id`, `sid`, `s3_bucket`, `s3_prefix`, `applied_layout`, `applied_cover`, `upload_status`, `file_list`, `error`, `created_at`, `started_at`, `stopped_at` y `updated_at`.

`applied_cover TEXT` SHALL añadirse en el `CREATE TABLE` y con `safeAlter` para las bases existentes, **sin** `CHECK`: sus valores los valida el catálogo de portadas. El `CHECK` de `applied_layout` NO SHALL ampliarse, porque SQLite no lo aplicaría a la tabla de producción.

Un índice único parcial sobre `event_id` con `status IN ('starting','recording','stopping')` SHALL impedir dos tareas vivas del mismo evento, y un índice único sobre `(event_id, attempt)` SHALL impedir dos intentos con el mismo número. Ningún comentario dentro del `CREATE TABLE` SHALL terminar una línea en punto y coma ni contener una barra invertida.

#### Scenario: Dos arranques simultáneos
- **WHEN** la transición de inicio del evento y una pasada del scheduler intentan arrancar la grabación a la vez
- **THEN** SHALL existir exactamente una tarea viva para el evento
- **AND** el intento perdedor SHALL terminar sin error y sin llamar a Agora

#### Scenario: Base de datos existente
- **WHEN** la API arranca contra una base creada antes de este cambio
- **THEN** `event_recordings` SHALL tener la columna `applied_cover`, con `NULL` en las filas anteriores

### Requirement: Reconciliador del ciclo de vida

`api/services/agoraRecordingService.js` SHALL exponer `reconcileEvent(eventId, { getStageState })`, que lee el estado del evento y de sus tareas y hace converger la realidad con él: arrancar si el evento debe grabarse y no hay tarea viva, parar si hay tarea viva y no debe grabarse, detectar interrupciones y ajustar el diseño. Las llamadas SHALL serializarse por evento dentro del proceso. Sin el lector `getStageState`, el diseño de una tarea viva NO SHALL tocarse: un diseño calculado sin conocer la escena revertiría una portada o una pantalla en curso.

`api/scheduler/recordingScheduler.js` SHALL ejecutar `reconcileEvent` cada 30 segundos para cada evento `active` con grabación elegible y para cada evento con una tarea viva, sin solapar pasadas, pasando el lector. SHALL arrancarse solo desde `api/server.js`.

Además, SHALL llamarse a `reconcileEvent` sin esperar su resultado y registrando su error desde:

- el inicio del evento, manual o automático;
- `eventAdminController.endEvent`, `eventController.endEvent` y `eventAdminController.markEventFinished`;
- los manejadores `screen_share` y `stage_cover` de `eventSocket.js`.

Ninguna de esas rutas SHALL esperar a Agora ni fallar por un error de grabación.

#### Scenario: Inicio del evento
- **WHEN** el admin inicia un evento Agora en directo con grabación
- **THEN** la respuesta de inicio NO SHALL esperar a la API de Agora
- **AND** SHALL crearse una tarea sin esperar a la siguiente pasada del scheduler

#### Scenario: Ruta de fin que no avisa
- **WHEN** un evento pasa a `finished` por una ruta que no llama a `reconcileEvent`
- **THEN** la siguiente pasada del scheduler SHALL parar la tarea viva

#### Scenario: Agora no responde al iniciar
- **WHEN** Agora tarda o devuelve un 504 al arrancar la grabación
- **THEN** el evento SHALL quedar `active` y los participantes SHALL poder entrar

#### Scenario: Reconciliación sin lector
- **WHEN** se reconcilia una tarea viva sin pasar `getStageState`
- **THEN** el sistema NO SHALL llamar a `updateLayout`
