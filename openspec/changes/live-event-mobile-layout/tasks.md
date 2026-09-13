El backend va primero y es mínimo: presencia del socket, texto y traza de un controlador, y tests. No cambian el esquema de BD, los endpoints, las variables de entorno ni el CSP. **Riesgo alto** marca las tareas que tocan infraestructura compartida o la vista de escritorio.

## 1. Backend: expulsión del chat por el admin

- [x] 1.1 En `api/socket/eventSocket.js`, añadir `staff` a la entrada de presencia y exponerlo en `publicPresence`. **Riesgo alto: presencia que consumen todos los clientes.** Es un campo aditivo y los clientes antiguos lo ignoran.
  - Host: `false`.
  - Asistente: `Number(attendee.is_staff) === 1`.
  - Copiarlo también en la fusión de una reconexión de la misma identidad.
- [x] 1.2 En `banFromChat` de `api/controllers/eventController.js`:
  - cambiar el texto del 403 a «Solo el host o un administrador pueden expulsar del chat»;
  - tras cada expulsión efectiva, en las ramas Agora y LiveKit, registrar `logger.info({ eventId, identity, actorUserId, actorRole })`, con `actorRole = 'host'` si `req.user.id === event.host_user_id` y `'admin'` en otro caso.
- [x] 1.3 Crear `api/tests/eventChatAdminModeration.test.js` (con `tests/helpers/app.js` y el patrón de `agoraBroadcastCohost.test.js`). Casos:
  - un admin que no es el host expulsa a un asistente en Agora `broadcast` y en `meeting`: 200, `chat_banned = 1` y `notifyChatBanned` llamado;
  - lo mismo en LiveKit, con `livekitService.updateParticipantPermissions` espiado;
  - un `seller` que no es el host recibe 403 y el asistente conserva `chat_banned = 0`;
  - un JWT `admin` cuya fila ya no lo es recibe 403;
  - sin JWT, 401;
  - admin contra staff, 400;
  - repetición, `alreadyBanned`;
  - traza con `actorRole: 'admin'`, y `'host'` cuando expulsa el host.
- [x] 1.4 Ampliar `api/tests/eventSocketCohost.test.js`:
  - el admin con acceso de administrador lleva `staff: true` en `broadcast` y en `meeting` (con `coHost: false` en `meeting`);
  - el host y un asistente ordinario llevan `staff: false`.
- [x] 1.5 Ejecutar la suite completa con `docker compose exec api npm test` y confirmar que `tests/testEnvironmentIsolation.test.js` sigue en verde.

## 2. Criterio, constantes y documento

- [x] 2.1 Añadir a `client/lib/constants.js` el bloque de la sala compacta, con el porqué de cada número. **Riesgo alto: fichero compartido.** Solo se añade.
  - Consultas: `LIVE_ROOM_COMPACT_QUERY`, `LIVE_ROOM_LANDSCAPE_QUERY`.
  - Proporciones y tiempos: `LIVE_ROOM_STAGE_MAX_HEIGHT_RATIO`, `LIVE_ROOM_KEYBOARD_SHRINK_RATIO`, `LIVE_ROOM_CHROME_HIDE_MS`, `LIVE_ROOM_CHAT_STICK_THRESHOLD_PX`.
  - Dimensiones: `LIVE_ROOM_CAMERA_TILE`, `LIVE_ROOM_PANEL_WIDTH`.
  - Textos es-ES: `LIVE_ROOM_COPY`.
- [x] 2.2 Crear `client/hooks/useCompactRoomLayout.js`: `useSyncExternalStore` sobre las dos consultas (servidor `false`) que devuelve `{ compact, landscape }`. Congela el valor mientras el foco esté dentro de `[data-chat-composer]` y aplica el pendiente en `focusout`.
- [x] 2.3 Crear `client/hooks/useLiveRoomDocument.js`. **Riesgo alto: toca el documento global.**
  - Con `enabled`, pone `data-live-room` en `<html>` y añade `viewport-fit=cover` al `content` de `<meta name="viewport">`.
  - En la limpieza, retira el atributo y restaura la cadena original exacta.
- [x] 2.4 Añadir a `client/app/globals.css`: **Riesgo alto: CSS global.** Todo queda acotado por atributo o clase propia.
  - `html[data-live-room], html[data-live-room] body { overflow: hidden; overscroll-behavior: none; }`;
  - la clase de encaje 16:9 por unidades de contenedor;
  - (el control de volumen se oculta con la variante `[@media(hover:none)]:hidden` en el propio `EventVideoPlayer`: es modalidad de entrada, no disposición, y no necesita regla global).

## 3. Altura visible y teclado

- [x] 3.1 Crear `client/hooks/useLiveRoomViewport.js`: suscripción a `resize` y `scroll` de `visualViewport`, agrupada por `requestAnimationFrame`, que escribe `--room-h` y `--room-top` con `style.setProperty` sobre la ref recibida, sin `setState`.
- [x] 3.2 Añadir la detección de teclado al mismo hook.
  - Referencia de alto máximo por orientación, reiniciada al cambiar `screen.orientation.type`.
  - `data-keyboard="open"` con el compositor enfocado y el alto por debajo de ratio × referencia.
  - Al perder el foco, retirar el atributo y llamar a `window.scrollTo(0, 0)`.

## 4. Piezas compartidas de presentación

- [x] 4.1 Crear `client/components/events/LiveRoomShell.js`:
  - siempre montado, con `className="contents"` fuera de compacto;
  - en compacto, `fixed z-40 grid` con `top: var(--room-top, 0px)` y `height: var(--room-h, 100dvh)`, sin `transform` y con clase `group`;
  - áreas por disposición;
  - monta `useLiveRoomDocument` y `useLiveRoomViewport` solo en compacto.
- [x] 4.2 Crear `client/components/events/LiveRoomTopBar.js`:
  - 44 px más `env(safe-area-inset-top)`;
  - `BrandLogo` a `h-5` sin enlace;
  - «EN DIRECTO» con punto rojo y número opcional con `aria-label`;
  - oculta con el teclado abierto.
- [x] 4.3 Crear `client/components/events/LiveRoomSheet.js`:
  - `absolute inset-0` hijo del contenedor, con panel inferior de alto máximo del 70 % y scroll interno;
  - `role="dialog"`, `aria-modal`, título y «Cerrar» de 44 px;
  - cierre con el fondo y con Escape;
  - foco dentro al abrir y devuelto al cerrar;
  - margen inferior de área segura.
- [x] 4.4 Extraer `ConsoleConfirm` de `client/components/events/HostConsole.js` a `client/components/events/InlineConfirm.js` y hacer que `HostConsole` lo importe sin cambio visible.
- [x] 4.5 Extraer las opciones de `client/components/events/VideoEffectsMenu.js` a `client/components/events/VideoEffectsOptions.js` y que el desplegable las use sin cambio visible.
- [x] 4.6 Crear `client/hooks/useAutoHideChrome.js`: se muestra al tocar, se oculta tras `LIVE_ROOM_CHROME_HIDE_MS` y admite la opción `pinned`.
- [x] 4.7 Añadir el margen de área segura inferior a `client/components/events/MobileDevicePicker.js`, sin cambiar su comportamiento en la consola.

## 5. Chat compartido y menú de moderación

- [x] 5.1 Crear `client/hooks/useChatAutoScroll.js`:
  - sigue al final si la distancia es ≤ `LIVE_ROOM_CHAT_STICK_THRESHOLD_PX` o el mensaje es propio; si no, expone `hasNew`;
  - desplaza solo el contenedor con `scrollTop`, nunca con `scrollIntoView`.
- [x] 5.2 Crear `client/components/events/chat/ChatComposer.js`:
  - `data-chat-composer` y `enterKeyHint="send"`;
  - 16 px en compacto y `text-sm` fuera;
  - botón de icono de 44 px con `aria-label="Enviar"` que no roba el foco (`onPointerDown` con `preventDefault`);
  - margen de área segura salvo con el teclado abierto;
  - aviso de expulsión.
- [x] 5.3 Crear `client/components/events/chat/NewMessagesButton.js` («Mensajes nuevos»).
- [x] 5.4 Migrar el `ChatPanel` de `client/components/AgoraLiveRoom.js` a esas piezas. **Riesgo alto: el chat de escritorio cambia de autodesplazamiento.**
  - Sustituir `isHost` por `canModerate` y excluir los mensajes propios (`msg.identity === selfIdentity`).
  - En compacto: sin la cabecera «Chat · N conectados», con `overscroll-behavior-y: contain`, y el menú abre una hoja con área táctil de 32 px.
- [x] 5.5 Añadir en `client/components/AgoraLiveRoom.js` la prop `isAdmin`.
  - `canModerateChat = isHost || isAdmin`.
  - `protectedIdentities` pasa a construirse con `p.coHost || p.staff`.
  - `handleHostBanFromChat` pasa a llamarse `handleBanFromChat`.
- [x] 5.6 En `client/app/live/[slug]/EventDetail.js`, pasar `isAdmin={user?.role === 'admin'}` a `AgoraLiveRoom` y a `EventLiveRoom`.
- [x] 5.7 En `client/components/EventLiveRoom.js`, aceptar `isAdmin`. **Riesgo alto: componente LiveKit estable.** No se toca nada más.
  - `ChatPanel` ofrece el menú con `(isHost || isAdmin) && !isHostMsg && senderIdentity && !msg.from?.isLocal`.
  - El manejador existente pasa a llamarse `handleBanFromChat`.
- [x] 5.8 Migrar `VideoChatPanel` de `client/app/live/[slug]/EventDetail.js` a `useChatAutoScroll`, `ChatComposer` y `NewMessagesButton`, eliminando `scrollIntoView` y, en compacto, la altura `calc(56.25vw * 0.6)`. Sigue sin moderación.

## 6. Sala `broadcast` compacta

- [x] 6.1 En `client/components/AgoraLiveRoom.js`, instanciar `useCompactRoomLayout` una vez y envolver la raíz en `LiveRoomShell`. **Riesgo alto: posición de la pizarra en el árbol.** Los condicionales, solo como huecos.
  - Pasar a `contents` en compacto la columna `videoAreaRef` y el envoltorio de `BroadcastArea`.
  - Asignar `grid-area` a `TheaterShell`, al bloque de filas y al chat.
  - Aplicar la sincronía de altura del chat solo fuera de compacto.
- [x] 6.2 En `client/app/live/[slug]/EventDetail.js`, no renderizar la cabecera de escritorio de la sala en compacto.
- [x] 6.3 Añadir a `client/components/events/BroadcastStage.js` una variante de marco compacta: sin esquinas ni borde, tope del 50 % del alto y encaje por unidades de contenedor. Recuadros de esquina y botón de teatro siguen referidos al marco 16:9.
- [x] 6.4 Extraer `AgoraParticipantTile` y su orden a `client/components/events/ParticipantTile.js`, con tamaño `default` (56 px, insignias de 20) y `compact` (44 px, insignias de 16), y consumirlo desde la rejilla de escritorio y el teatro sin cambio visual. **Riesgo alto: tile de escritorio.**
- [x] 6.5 Crear `client/components/events/CompactParticipantRow.js`:
  - mano de 44 px fija fuera del scroll, con filete, solo para asistentes;
  - cuadrados compactos con scroll horizontal, `overscroll-behavior-x: contain` y sin barra de scroll;
  - `py-2` para las insignias;
  - nombre en `aria-label`.
- [x] 6.6 Crear la hoja de participante con nombre, estado y acciones por rol, usando los mismos manejadores de promoción, degradación y silencio propio. Sin acciones sobre el host ni sobre el staff.
- [x] 6.7 Añadir la fila compacta de promovidos con vídeo (16:9, 64 px de alto), solo cuando existan.
- [x] 6.8 Crear `client/components/events/CompactHostControls.js` como presentación de `useHostMediaControls`:
  - Micrófono, Cámara, Pantalla (si `screenShareSupported`), Pizarra (si está disponible) y «Más»;
  - «Finalizar stream» o «Finalizar evento» con `InlineConfirm`;
  - línea de error sobre la fila.
- [x] 6.9 Crear la hoja «Más» del host:
  - fuentes con `MobileDevicePicker`;
  - Altavoz y Pantalla deshabilitados con motivo;
  - Calidad, y Efectos con `VideoEffectsOptions`;
  - «Todos escriben» en reunión con pizarra;
  - «Vista del host» con `HostViewModeSwitcher` si `allowMobileHostConsole`.
- [x] 6.10 Añadir a `client/components/events/CoHostControls.js` la presentación compacta: Micrófono, Cámara y «Más» con fuentes, Altavoz y disposición de cámaras bloqueada con aviso.
- [x] 6.11 En compacto, no renderizar la barra oscura «Vista del host» ni el botón de mano de escritorio de `BroadcastArea`.

## 7. Sala `meeting` compacta

- [x] 7.1 En `MeetingArea` de `client/components/AgoraLiveRoom.js`, mostrar en compacto el recuadro destacado para todos los roles (el host ve su cámara sin pantalla ni pizarra), sin cambiar la rejilla de iguales de escritorio.
- [x] 7.2 Crear `client/components/events/CompactCameraRow.js`:
  - cuadrados 1:1 de `clamp(64px, calc(var(--room-h) * 0.13), 104px)` con scroll horizontal;
  - `IntersectionObserver` con la fila como raíz y un cuadrado de margen: solo los visibles montan `AgoraVideo`;
  - nombre, insignia y anillo como `MeetingTile`.
- [x] 7.3 Crear la hoja de participante de reunión: nombre, estado y «Silenciar micrófono» para el host.
- [x] 7.4 Añadir la presentación compacta en `MeetingSelfControls`, sobre la misma instancia de sus hooks: Micrófono, Cámara y «Más» con fuentes, Altavoz y Efectos.

## 8. Disposición horizontal

- [x] 8.1 En `LiveRoomShell` y `client/components/AgoraLiveRoom.js`, montar la rejilla de dos columnas con `LIVE_ROOM_PANEL_WIDTH` y márgenes de área segura laterales.
  - Panel ocultable, no persistido.
  - Oculto por defecto para el asistente de `broadcast`; visible para host, co-presentador y reunión.
- [x] 8.2 Crear `client/components/events/LandscapeStageChrome.js` con `useAutoHideChrome`:
  - indicador y conectados arriba a la izquierda;
  - conmutador del panel en el grupo del botón de teatro;
  - mano abajo a la izquierda con el panel oculto;
  - fijado mientras haya pizarra en escena.

## 9. Pase de vídeo pregrabado

- [x] 9.1 En `client/app/live/[slug]/EventDetail.js`, envolver la rama de vídeo activo en `LiveRoomShell`: `LiveRoomTopBar` sin número, reproductor como escena y `VideoChatPanel` como chat, con la disposición horizontal y el panel oculto por defecto.
- [x] 9.2 En `client/components/EventVideoPlayer.js`, controles por toque con `useAutoHideChrome`, sin perder `group-hover` con ratón, y volumen oculto con `(hover: none)`.
- [x] 9.3 En `client/components/EventVideoPlayer.js`, pantalla completa:
  - pedirla sobre el contenedor y bloquear la orientación horizontal al resolverse;
  - sin API de elementos, usar `webkitEnterFullscreen`;
  - en `webkitendfullscreen`, recolocar con `getElapsedSeconds()` y llamar a `play()` si está en pausa;
  - exponer el estado «reproduciendo» con un callback.

## 10. Teatro, consola, bloqueo de pantalla y avisos

- [x] 10.1 En `TheaterShell` de `client/components/AgoraLiveRoom.js`, en compacto, bloquear la orientación horizontal tras `requestFullscreen` y liberarla en la limpieza. Añadir márgenes de área segura a `TheaterChrome` y `TheaterStrip`.
- [x] 10.2 Añadir márgenes de área segura a `HostConsole` y `HostPreviewMode` en `client/components/events/HostConsole.js`.
- [x] 10.3 Montar `useScreenWakeLock` para asistentes. **Riesgo alto: hook compartido con la vista del host.**
  - En `client/components/AgoraLiveRoom.js`: no host, no co-presentador, evento sin terminar y escena con vídeo remoto o contenido.
  - En la rama de vídeo de `EventDetail.js`: mientras el reproductor reproduce.
- [x] 10.4 Actualizar el comentario de `client/hooks/useScreenWakeLock.js`: la exclusión de asistentes pasa a «mientras no haya nada que ver».
- [x] 10.5 Añadir el aviso de orientación para host y co-presentador en compacto vertical: con la cámara apagada, una línea sobre los controles; encendida, la etiqueta «Emitiendo en vertical» solo en su vista.
- [x] 10.6 Cambiar el botón de `AudioActivationOverlay` en `client/components/AgoraLiveRoom.js` a «Activar el audio».

## 11. Build y regresión de escritorio

- [x] 11.1 `docker compose exec client npm run lint` sin errores nuevos en los ficheros tocados.
- [x] 11.2 `docker compose exec -e NODE_ENV=production client npm run build` completa sin errores. (Ejecutado en un contenedor efímero sobre una copia del código, para no pisar el `.next` del `next dev` en marcha: `BUILD_EXIT=0` y tabla de rutas completa.)
- [x] 11.3 Revisar en el navegador de escritorio (≥ 1024 × 500 px) la vista previa de `/live` y, con emulación móvil de Chrome, la disposición compacta en vertical y horizontal de las salas que se puedan abrir en local. (Verificado en local: `/live` y la página previa de un evento en escritorio sin errores de hidratación, y fuera de la sala sin `data-live-room` ni `viewport-fit=cover`. No había ningún evento activo en preproducción y la ventana no admitió el redimensionado, así que la sala compacta en sí queda para el grupo 12.)

## 12. Verificación manual (operador)

- [ ] 12.1 iPhone real en BrowserStack Live (recomendado) o TestMu AI, con Safari en un modelo con isla dinámica:
  - vertical sin scroll de página;
  - teclado sin ampliación y que no se cierra al enviar;
  - horizontal sin controles bajo la isla y con franja negra;
  - pase de vídeo en pantalla completa nativa que vuelve sincronizado.
- [ ] 12.2 Chrome Android con la barra de direcciones arriba y abajo: sin saltos, sin *pull-to-refresh*, y deslizar al final de la fila no navega atrás.
- [ ] 12.3 Reunión con varios participantes desde un móvil: la fila de cámaras se desliza y el host silencia desde la hoja.
- [ ] 12.4 Girar el móvil con la pizarra activa sin perder la escritura. Girar como host sin corte para la audiencia.
- [ ] 12.5 Bloqueo de pantalla del asistente: con vídeo en escena no se apaga; con «Esperando al host...» sí.
- [ ] 12.6 Admin moderando:
  - «Entrar como administrador» en un stream Agora, una reunión Agora y un evento LiveKit;
  - menú sobre mensajes de asistentes, y no sobre los propios, los del host ni los del staff;
  - la expulsión surte efecto;
  - en una reunión, el host no ve el menú sobre el admin.

## 13. Documentación

- [x] 13.1 Añadir a `CLAUDE.md` la sección «Vista compacta de las salas en directo», con los detalles que se rompen sin avisar:
  - un solo árbol, con condicionales como huecos;
  - altura por `visualViewport` sin estado;
  - nunca `transform` en el contenedor;
  - `data-live-room` y `viewport-fit` restaurados;
  - 16 px en el campo y botón de enviar que no roba el foco;
  - hojas sin portal;
  - verificación de iPhone en la nube;
  - punto ciego de tests.
- [x] 13.2 Actualizar en `CLAUDE.md` tres puntos:
  - en la consola móvil del host, que en compacto el conmutador vive en la hoja «Más»;
  - en el bloqueo de pantalla, que aplica también a los asistentes con algo que ver;
  - en «Interviews in Agora broadcast events», que el admin (co-presentador o no) tiene el menú «Expulsar del chat» y que la presencia expone `staff`.
