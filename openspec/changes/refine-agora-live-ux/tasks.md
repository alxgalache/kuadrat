# Tasks: refine-agora-live-ux

> Cambio 100% frontend + CSP + documentación. NO tocar backend/API/BD, el modo `broadcast`, ni los eventos LiveKit. Tareas marcadas **[ALTO RIESGO]** tocan infraestructura compartida o el componente central `AgoraLiveRoom.js` — verificar que broadcast queda intacto.
>
> Las tareas de verificación en navegador (1.4, 2.5, 3.5, 4.4, 6.1, 6.2) quedan pendientes de QA manual: requieren un evento Agora activo con cámaras/host reales. Nota: `next lint` fue eliminado en Next 16, no hay lint funcional en el repo; la validación de compilación real ocurrirá al reconstruir el cliente.

## 1. Pizarra — desbloqueo por CSP (issue 4)

- [x] 1.1 **[ALTO RIESGO]** `client/next.config.js`: añadir `blob:` a la directiva `script-src` del CSP (junto a `'unsafe-inline' 'unsafe-eval'`), manteniendo el resto de fuentes.
- [x] 1.2 `client/next.config.js`: añadir `blob:` al array `cspConnectSrc` (directiva `connect-src`); dejar `worker-src 'self' blob:` como está.
- [x] 1.3 `client/next.config.js`: para silenciar TODO el ruido de CSP de la pizarra, añadir a `cspConnectSrc` los hosts Agora/Netless relacionados — `https://*.agoralab.co` y `wss://*.agoralab.co` (logger de reserva/Argus) — y añadir `https://*.netless.link` a la directiva `font-src` (fuentes de `convertcdn.netless.link`). El resto de recursos ya está cubierto (`img-src https:`, `media-src https: blob:`).
- [ ] 1.4 Verificar en el navegador: el host activa la pizarra y NO aparece `[modules] load script with URL failed`; la pizarra renderiza y los trazos llegan a un asistente en tiempo real.

## 2. Cámara — errores de `getUserMedia` (issue 1)

- [x] 2.1 `client/hooks/useAgoraDevices.js`: en `refreshDevices()`, llamar a `AgoraRTC.getMicrophones(true)`, `getCameras(true)` y `getPlaybackDevices(true)` con `skipPermissionCheck: true` para no disparar el probe de `getUserMedia` al montar.
- [x] 2.2 `client/hooks/useAgoraDevices.js`: re-enumerar (con `skipPermissionCheck: true`, ya con permiso concedido) tras encender micro/cámara, vía `useEffect` keyed en `micEnabled`/`camEnabled` (nuevos params), para recuperar las etiquetas reales sin volver a sondear.
- [x] 2.3 **[ALTO RIESGO]** `client/hooks/useAgoraRoom.js`: helper `createCameraTrackWithRetry()` que envuelve `createCameraVideoTrack()` con un reintento único (mismo device, 300 ms) ante `NotReadableError`/`NOT_READABLE`; usado en `setCameraEnabled`. No se altera la rama de screen share ni broadcast.
- [x] 2.4 `client/components/AgoraLiveRoom.js`: helper `cameraErrorMessage(err)` con mensaje es-ES claro para `NOT_READABLE` ("No se pudo iniciar la cámara; puede estar en uso por otra aplicación"), usado en `toggleCamera` de `AgoraHostControls` y `MeetingSelfControls`.
- [ ] 2.5 Verificar: entrar a un meeting con una webcam problemática NO genera `AbortError` en consola; encender cámara falla con mensaje claro (best-effort) sin romper audio/chat; webcam integrada funciona.

## 3. Layout modo meeting (issue 2 — solo meeting)

- [x] 3.1 **[ALTO RIESGO]** Altura de viewport de la sala meeting: aplicada en el contenedor raíz de meeting de `client/components/AgoraLiveRoom.js` (`lg:h-[calc(100dvh-10rem)] lg:min-h-0`). No fue necesario tocar `EventDetail.js` (una altura explícita no requiere que el ancestro propague altura); broadcast/LiveKit sin cambios.
- [x] 3.2 **[ALTO RIESGO]** `client/components/AgoraLiveRoom.js`: en el `return` principal, chat `h-[60vh] lg:h-auto` (se estira a la altura de la fila) SOLO en meeting; broadcast conserva el `ResizeObserver`/altura sincronizada (`style` inline solo si `!isMeeting`).
- [x] 3.3 `client/components/AgoraLiveRoom.js` (`MeetingArea`): recuadro del host (o pantalla compartida) a `w-full aspect-video` destacado arriba; columna de medios `flex-1 min-h-0 lg:overflow-y-auto` (scroll interno).
- [x] 3.4 `client/components/AgoraLiveRoom.js` (`MeetingArea`): participantes (todos menos el host) en `grid-cols-2 md:grid-cols-3` debajo del host; eliminados `MEETING_GRID_COLS`/`meetingColsClass`.
- [ ] 3.5 Verificar: con 1, 2 y 8+ participantes el host se ve grande a todo el ancho, los participantes en filas de 3, el chat ocupa toda la altura de página y NO cambia al compartir pantalla ni al crecer los participantes (la zona de cámaras hace scroll interno). Broadcast sin cambios.

## 4. Pantalla completa de la pantalla compartida (issue 3)

- [x] 4.1 `client/components/AgoraLiveRoom.js`: helpers `enterFullscreen(el)` (con fallback iOS `video.webkitEnterFullscreen()`) y `<FullscreenButton targetRef>`.
- [x] 4.2 `client/components/AgoraLiveRoom.js` (`MeetingArea`): `FullscreenButton` superpuesto sobre el recuadro destacado, visible solo cuando el host comparte pantalla (`hostScreenSharing`); funciona para asistentes.
- [x] 4.3 `client/components/AgoraLiveRoom.js` (`BroadcastArea`): el botón de pantalla completa del viewer ahora apunta al recuadro del vídeo del host (`hostVideoRef`), no a toda la columna; se muestra cuando hay `hostTrack`.
- [ ] 4.4 Verificar: un asistente puede maximizar la pantalla compartida en meeting y en broadcast; al salir vuelve al layout sin recargar; sin screen share no aparece el botón en meeting.

## 5. Documentación

- [x] 5.1 `CLAUDE.md` (bloque de entorno Agora): documentado el requisito de CSP (`blob:` en `script-src`/`connect-src`, `*.netless.link` en `font-src`, `*.agoralab.co` en `connect-src`) y el aviso benigno de `agora-foundation` (peer `3.11.1` no publicado; fallback a Argus; no forzar versión).
- [x] 5.2 `api/.env.example`: notas junto al bloque de whiteboard sobre el CSP requerido en el cliente y el aviso benigno de `agora-foundation`.

## 6. QA manual y cierre

- [ ] 6.1 Repasar los escenarios de las delta specs (meeting layout, fullscreen, enumeración sin probe, cámara best-effort, pizarra sin error de CSP) en dos navegadores + móvil.
- [ ] 6.2 Regresión de `broadcast` Agora y de un evento LiveKit de control: idénticos a antes del cambio.
- [x] 6.3 `openspec validate refine-agora-live-ux` sin errores.

## 7. Ajustes post-QA (segunda ronda)

- [x] 7.1 `client/components/AgoraLiveRoom.js` (`ChatPanel`): al enviar mensaje, scrollear solo el contenedor interno (`messagesContainerRef.scrollTop = scrollHeight`) en vez de `scrollIntoView` (que desplazaba toda la página en el layout meeting).
- [x] 7.2 **[ALTO RIESGO]** `client/components/events/WhiteboardPanel.js`: reescrito con la API vanilla `@netless/fastboard` (`createFastboard` + `mount(app, div, { config })` + `destroy` en cleanup); eliminado el wrapper `@netless/fastboard-react`. Sin cambio de versión del SDK. (Nota: esto solo no arreglaba el "no dibujable" — ver 7.5, la causa real es `white-web-sdk`.)
- [x] 7.3 `client/components/AgoraLiveRoom.js` (`MeetingArea`): vista del host = grid de tiles iguales (la suya primera) cuando no comparte pantalla/pizarra; destacado a todo el ancho solo al compartir pantalla o pizarra (`showFeatured`/`gridEntries`). Vista de asistentes sin cambios (host siempre destacado).
- [x] 7.5 **[ALTO RIESGO]** `client/lib/reactDomLegacyShim.js` (nuevo) + import en `WhiteboardPanel.js` antes de `@netless/fastboard`: re-implementa `ReactDOM.render` / `unmountComponentAtNode` (eliminados en React 19) sobre `createRoot` + `flushSync`, parcheando el `module.exports` de `react-dom` que usa `white-web-sdk`. Es el fix real del "no dibujable".
- [ ] 7.4 Verificar en navegador: (a) enviar en el chat no desplaza la página; (b) el host puede dibujar en la pizarra sin el error `render is not a function` y los asistentes lo ven; (c) el host ve el grid de iguales (suya primera) y el destacado al compartir pantalla/pizarra; asistentes sin cambios.
