## 1. Imágenes y catálogo

- [x] 1.1 Generar `client/public/cortinillas/{inicio,intermedio,final}-v1.jpg` desde `docs/cortinillas/*.png`: 1920 × 1080, calidad 85–90, sin metadatos. Comprobar que pesan menos de 1 MB y que no hay diferencia visible con el PNG (las fuentes son opacas).
- [x] 1.2 Generar `client/public/grabacion/fondo-negro-v1.jpg`: negro puro, 1920 × 1080.
- [x] 1.3 Versionar los originales `docs/cortinillas/*.png`, hoy sin seguimiento en git.
- [x] 1.4 Crear `api/utils/stageCovers.js`:
  - `STAGE_COVERS`, con `inicio`, `intermedio` y `final` → `{ file, headline }`;
  - `STAGE_COVER_RECORDING_BLANK` (`grabacion/fondo-negro-v1.jpg`);
  - `isStageCover(id)` y `stageCoverPublicUrl(file)`, con `config.clientUrl`;
  - `supportsStageCovers(event)`: `provider='agora'`, `interaction_mode='broadcast'` y `format='live'`.

  Un comentario que remita al espejo del cliente y diga que un fichero publicado nunca se sobrescribe.
- [x] 1.5 Crear el espejo `client/lib/stageCovers.js`: los mismos ids y ficheros, la etiqueta es-ES y el titular para el `alt`, y `supportsStageCovers`. Los textos de interfaz van en `client/lib/constants.js` (`STAGE_COVER_COPY`: «Portadas», «Ninguna» y la ayuda sobre el silenciado de micrófonos).

## 2. Esquema (riesgo alto: infraestructura compartida)

- [x] 2.1 En `api/config/database.js`, añadir `applied_cover TEXT` al `CREATE TABLE event_recordings`, con un comentario que explique por qué no lleva `CHECK`. Ninguna línea de comentario puede acabar en punto y coma ni llevar barra invertida. Añadir también el `safeAlter('ALTER TABLE event_recordings ADD COLUMN applied_cover TEXT')` junto a los de la grabación.
- [x] 2.2 Ejecutar `api/tests/dbDump.test.js` para comprobar que la tabla se restaura.

## 3. Sala Socket.IO (`api/socket/eventSocket.js`)

- [x] 3.1 Añadir `eventStageCovers`, con el mismo comentario de ciclo de vida que `eventStageLayouts`.
- [x] 3.2 Guardar en la entrada de presencia (o en `socket.data`) si el evento cumple `supportsStageCovers`. `authenticateJoin` ya carga el evento.
- [x] 3.3 Manejador `stage_cover { cover }`. Valida que lo envía `isHost || coHost`, que el evento admite portadas y que `cover` es `null` o `isStageCover`. Después guarda o borra el valor, emite `stage_cover { cover }` a `roomName(id)` y llama a `agoraRecordingService.triggerReconcile(id, { getStageState })`, sin esperarla.
- [x] 3.4 Añadir `stageCover` al ACK de `join_event_room`.
- [x] 3.5 Borrar la entrada en `broadcastEventEnded`.
- [x] 3.6 Exponer `setStageCover(eventId, cover)` (guarda y emite, sin reconciliar) y `getStageState(eventId)` → `{ screenSharing: isStageScreenSharing(id), cover }`. Cambiar la reconciliación del manejador `screen_share` para que pase `getStageState`.
- [x] 3.7 Tests en `api/tests/eventSocketStageCover.test.js`, con el `io` falso de `eventSocketCohost.test.js`:
  - host y co-presentador aceptados;
  - asistente, promovido, id desconocido y evento `meeting` ignorados sin emitir;
  - eco a toda la sala;
  - ACK con `stageCover`;
  - borrado al terminar;
  - `getStageState`.

## 4. Grabación (`api/services/agoraRecordingService.js`)

- [x] 4.1 Reescribir `mixLayoutFor({ screenSharing, cover })` con los tres casos de la spec. Con portada, `layout` vale lo que marque la pantalla compartida y `cover` el id de la portada. Todos los diseños llevan `backgroundColor` y `backgroundImage`: la portada o el fondo neutro. Las 17 regiones transparentes son una constante con nombre y comentario.
- [x] 4.2 Sustituir el lector `isStageScreenSharing` por `getStageState` en `reconcileEvent`, `reconcileEventNow`, `startTask`, `ensureLayout` y `triggerReconcile`, que lo enlaza desde `eventSocket.getStageState`.
- [x] 4.3 `ensureLayout` compara `applied_layout` y `applied_cover` con lo deseado, y solo tras un `updateLayout` correcto actualiza las dos columnas. `startTask` guarda las dos al pasar a `recording`.
- [x] 4.4 `api/scheduler/recordingScheduler.js`: construir `getStageState` desde `app.get('eventSocket')` en cada llamada, igual que el lector actual.
- [x] 4.5 Ampliar `api/tests/agoraRecording.test.js`:
  - `mixLayoutFor` en los cuatro estados, portada con prioridad sobre pantalla incluida;
  - `backgroundImage` siempre presente;
  - `updateLayout` al poner, cambiar y quitar portada;
  - `start` con la portada ya puesta;
  - un fallo de `updateLayout` no toca las columnas;
  - sin lector no se llama a `updateLayout`.

  Revisar los tests existentes que pasaban `isStageScreenSharing`.

## 5. Portada «Inicio» al iniciar

- [x] 5.1 En el camino de inicio, llamar a `eventSocket.setStageCover(id, 'inicio')` cuando `supportsStageCovers(event)`, después de guardar `active` y antes de `broadcastEventStarted` y `triggerReconcile`. Si `event-auto-start` ya está aplicado, va en su función de inicio compartida. Si no, va en `eventAdminController.startEvent`.
- [x] 5.2 Test: iniciar un `broadcast` Agora deja `getStageState(id).cover === 'inicio'`. Iniciar un `meeting`, un LiveKit o un pase de vídeo no fija ninguna.

## 6. Cliente: estado y acciones

- [x] 6.1 `client/hooks/useEventRoomSocket.js`: estado `stageCover`, leído del ACK y del evento `stage_cover`, y `setStageCover(cover)`, que emite. Todo junto a `stageLayout`.
- [x] 6.2 `client/hooks/useHostMediaControls.js`, que recibe `stageCover`, `setStageCover` y un `turnOffWhiteboard` opcional (solo el host):
  - `selectCover(id | null)`, que solo emite;
  - un efecto que, ante cada cambio de `stageCover` a una portada **recibido por el evento** (no el valor del ACK), apaga cámara, pantalla y micrófono, y la pizarra si existe `turnOffWhiteboard`;
  - en `toggleCamera` (encender) y `toggleScreenShare` (empezar), emitir `setStageCover(null)` cuando la acción haya salido bien y hubiera portada.

  Comentarios con el porqué: un solo camino de código, y el micrófono como decisión del operador.
- [x] 6.3 `client/components/AgoraLiveRoom.js`: pasar al hook el estado de la portada y `turnOffWhiteboard` (host). Al activar la pizarra con portada, emitir `setStageCover(null)` tras `socket.toggleWhiteboard(true, …)`.

## 7. Cliente: escena y menú

- [x] 7.1 `client/components/events/BroadcastStage.js`: prop `cover` (`{ src, alt } | null`) pintada como último hijo según la Decisión 12. Sin portada, nada cambia. Con portada, no se pinta el `placeholder`.
- [x] 7.2 `AgoraLiveRoom`:
  - resolver la portada desde `socket.stageCover` con `client/lib/stageCovers.js` y pasarla a `BroadcastStage` en todas las vistas, teatro incluido;
  - mostrarla en el panel de vídeo de `HostConsole` y en el modo «Vídeo»;
  - contarla como algo que ver en `useScreenWakeLock` de los asistentes.
- [x] 7.3 Crear `client/components/events/StageCoverOptions.js`: cuatro opciones con la activa marcada y la ayuda de micrófonos. Crear también `client/components/events/StageCoverMenu.js`, desplegable con el marcado y el cierre de `VideoEffectsMenu`.
- [x] 7.4 Montar «Portadas» junto a «Efectos» en `AgoraHostControls` y en `CoHostControls`, compartiendo el estado de menú abierto de cada barra.
- [x] 7.5 `HostConsole`: tarjeta «Portadas» con selector propio, hijo directo de la superposición, sin portal.
- [x] 7.6 `CompactHostControls` y `CompactCoHostControls`: entrada «Portadas» en «Más», que abre una `LiveRoomSheet` con `StageCoverOptions`.
- [x] 7.7 `npm run lint` y `npm run build` en `client/`.

## 8. Verificación manual

En preproducción, con un evento Agora `broadcast` de prueba con grabación activada.

- [ ] 8.1 Al pulsar «Iniciar», un asistente en otro navegador ve «Empezamos en breve» antes de que entre el host, y el menú del host marca «Inicio» al entrar.
- [ ] 8.2 El host enciende la cámara: la portada desaparece para todos y el menú pasa a «Ninguna». Encender solo el micrófono no la quita.
- [ ] 8.3 Con cámara, micrófono y pantalla activos, el host elige «Intermedio»: todo se apaga y todos ven la portada. Repetir con la pizarra.
- [ ] 8.4 Con el admin como co-presentador: el admin elige «Final» y se apagan la cámara y la pantalla del host. Encender la cámara del admin quita la portada. Comprobar el menú del admin.
- [ ] 8.5 Teatro, vista compacta en vertical y en horizontal, y la consola móvil del host: la portada ocupa la escena y el menú funciona sin portales.
- [ ] 8.6 Un asistente que entra tarde ve la portada vigente. Al finalizar el evento con «Final» puesta, aparece el modal «Evento finalizado».
- [ ] 8.7 Descargar la grabación MP4 y comprobar:
  - «Inicio» de fondo al principio;
  - nadie delante durante las portadas, con la voz del host audible;
  - el paso a la cámara;
  - «Intermedio» y «Final»;
  - una cámara apagada sin portada se ve negra, no congelada.

  Anotar cuánto tarda Agora en aplicar la imagen. Si la geometría falla, aplicar el respaldo flotante de la Decisión 3 y repetir.

## 9. Conocimiento del proyecto

- [x] 9.1 Crear `.claude/rules/agora/stage-covers.md` con `paths:` a `api/utils/stageCovers.js`, `client/lib/stageCovers.js`, `client/components/events/{StageCoverMenu,StageCoverOptions}.js` y `client/public/cortinillas/**`. Contenido:
  - el porqué de la superposición;
  - las regiones transparentes;
  - el `backgroundImage` explícito y su efecto en las cámaras apagadas;
  - `applied_cover` frente al `CHECK`;
  - el vaciado como reacción al mensaje;
  - el micrófono;
  - la excepción del co-presentador;
  - cómo publicar un `-v2`.
- [x] 9.2 Añadir la línea de la regla al índice «Agora» de `CLAUDE.md`.
- [x] 9.3 Actualizar `.claude/rules/agora/recording.md` (diseño del lienzo, lector `getStageState`, `applied_cover`) y `.claude/rules/agora/interviews-cohost.md` (el co-presentador tiene «Portadas»).
- [x] 9.4 Actualizar `docs/grabaciones-eventos.md` con la portada en la grabación y la cámara apagada en negro. Añadir una guía corta para el operador, `docs/eventos-portadas.md`: cuándo usar cada portada, qué se apaga, y cómo sustituir una imagen publicando `-v2`.
- [x] 9.5 Ejecutar `node scripts/check-claude-rules.mjs` y la suite completa (`npm test` en `api/`).
