## 1. Columna del evento y camino de escritura

- [x] 1.1 Añadir `allow_mobile_host_console INTEGER NOT NULL DEFAULT 0` al `CREATE TABLE events` de `api/config/database.js`, con un comentario que explique que solo aplica a `provider='agora'` + `interaction_mode='broadcast'`
- [x] 1.2 Añadir el `safeAlter('ALTER TABLE events ADD COLUMN allow_mobile_host_console INTEGER NOT NULL DEFAULT 0')` junto a los de `provider` / `interaction_mode` (las bases existentes no se recrean)
- [x] 1.3 Aceptar el campo como booleano opcional en `createEventSchema` y `updateEventSchema` de `api/validators/eventSchemas.js`
- [x] 1.4 Propagarlo en `api/controllers/eventAdminController.js` (create y update), normalizando a 0/1
- [x] 1.5 Añadirlo a la lista de columnas del `INSERT` de `eventService.createEvent` y al array `allowedFields` de `eventService.updateEvent` — omitir cualquiera de los dos deja el checkbox guardando en silencio nada
- [x] 1.6 Verificar que no hace falta tocar el camino de lectura: `getEventBySlug` hace `SELECT e.*`

## 2. Checkbox en el panel de admin

- [x] 2.1 Añadir el checkbox «Consola móvil del host» en `client/app/admin/espacios/nuevo/page.js`, visible solo con `format='live'` + `provider='agora'` + `interaction_mode='broadcast'`, con texto de ayuda en es-ES sobre para qué sirve
- [x] 2.2 Lo mismo en `client/app/admin/espacios/[id]/page.js`, cargando el valor actual del evento en el estado del formulario
- [x] 2.3 Comprobar que al cambiar el proveedor o el modo de interacción a una combinación no soportada el campo deja de enviarse

## 3. Wake lock (independiente del flag)

- [x] 3.1 Crear `client/hooks/useScreenWakeLock.js`: detección de capacidad, petición con documento visible, sentinel guardado en ref, escucha de su `release`, y readquisición en `visibilitychange` → visible
- [x] 3.2 Liberar el bloqueo al desmontar y cuando el parámetro `enabled` pasa a falso; no reportar a Sentry ningún rechazo
- [x] 3.3 Montarlo en `client/components/AgoraLiveRoom.js` con `enabled: isHost && !eventEnded`
- [x] 3.4 Montarlo en `client/components/EventLiveRoom.js` (LiveKit) con la misma condición
- [ ] 3.5 Verificar en un dispositivo Android sobre HTTPS que la pantalla no se apaga, y que tras pasar a segundo plano y volver el bloqueo se recupera

## 4. Refactor: un hook de controles, dos presentaciones

- [x] 4.1 Crear `client/hooks/useHostMediaControls.js` envolviendo `useAgoraDevices`, `useAgoraVideoEffect`, las alternancias de micrófono/cámara/pantalla con su manejo de errores en es-ES, y el fin de evento; parámetro `enabled` (nunca llamada condicional)
- [x] 4.2 Instanciarlo **una sola vez** en `AgoraLiveRoom` y pasarlo a `BroadcastArea` y `MeetingArea`
- [x] 4.3 Reescribir `AgoraHostControls` para que consuma el hook en lugar de instanciarlo, sin ningún cambio visible en la vista `full` (escritorio y `meeting` incluidos)
- [x] 4.4 Exponer en el hook la detección de capacidad de `getDisplayMedia` y el hecho de que no haya dispositivos `audiooutput`, para que ambas presentaciones decidan igual
- [ ] 4.5 Comprobar por regresión que en `meeting` los controles de host y `MeetingSelfControls` siguen funcionando igual

## 5. Conmutador de modos y andamiaje de la superposición

- [x] 5.1 Crear `client/hooks/useHostViewMode.js`: estado `full | console | preview`, persistencia en `localStorage` leída **desde un efecto**, y forzado a `full` cuando el evento termina
- [x] 5.2 Añadir `AGORA_HOST_VIEW_MODE_STORAGE_KEY` y los textos es-ES de los tres modos a `client/lib/constants.js`
- [x] 5.3 Añadir la gestión de pantalla completa y orientación al andamiaje: `requestFullscreen` al entrar, `screen.orientation.lock('landscape')` **después** de que se resuelva, salida y liberación al volver a `full`, fallos ignorados en silencio
- [x] 5.4 Escuchar `fullscreenchange` solo para sincronizar el botón de reentrada — **no** cambiar de modo al perderla (divergencia deliberada respecto a `TheaterShell`, dejarlo comentado en el código)
- [x] 5.5 Montar el envoltorio de modo **siempre** alrededor del medio destacado, con la `className` cambiando según el modo, para que la pizarra no cambie de posición en el árbol
- [x] 5.6 Renderizar el selector de modo en `BroadcastArea` solo cuando `isHost && allow_mobile_host_console && interaction_mode === 'broadcast'`, sin restricción por tamaño de viewport
- [x] 5.7 Propagar el flag desde el evento hasta `AgoraLiveRoom` a través de `client/app/live/[slug]/EventDetail.js`

## 6. Modo consola

- [x] 6.1 Crear `client/components/events/HostConsole.js` con la rejilla: cabecera (~40 px), columna izquierda de vídeo (~40 % del ancho), columna derecha de tarjetas 2 × 2 y pie con «Finalizar stream»
- [x] 6.2 Dimensionar con unidades `dvh`/`dvw` e impedir el scroll del documento; `overflow-y-auto` **solo** en la columna de tarjetas
- [x] 6.3 Tarjetas de control con área táctil de ≥48 px: Micrófono y Cámara con interruptor y acceso a fuente; Pantalla con interruptor; Altavoz con acceso a fuente
- [x] 6.4 Estado deshabilitado con explicación en es-ES para Pantalla (sin `getDisplayMedia`) y para Altavoz (sin dispositivos `audiooutput`); errores de captura pintados dentro de la propia tarjeta
- [x] 6.5 Previsualización del vídeo publicado (pantalla compartida si está activa, si no la cámara) con `AgoraVideo`
- [x] 6.6 Medidor de nivel de micrófono bajo el vídeo, sondeando `getVolumeLevel()` a ~10 Hz mientras la consola está abierta; visible en reposo con el micrófono apagado
- [x] 6.7 Cabecera con «EN DIRECTO», número de conectados y el selector de modo
- [x] 6.8 «Finalizar stream» reutilizando el `ConfirmDialog` existente, visualmente separado de las tarjetas
- [x] 6.9 Confirmar que la rejilla de participantes y el chat no se renderizan en este modo

## 7. Selector de fuente táctil

- [x] 7.1 Crear `client/components/events/MobileDevicePicker.js`: panel que ocupa la superposición, filas de ≥48 px, fuente activa marcada, cierre por botón y por toque fuera
- [x] 7.2 Alimentarlo con las listas y los `selectMicrophone` / `selectCamera` / `selectSpeaker` de `useHostMediaControls` — mismos datos que la vista `full`, distinta presentación
- [ ] 7.3 Verificar la reenumeración en caliente: conectar el receptor DJI con la consola abierta y comprobar que aparece en la lista sin recargar

## 8. Modo vídeo

- [x] 8.1 Renderizar el vídeo publicado a sangre sobre negro, con `object-contain`
- [x] 8.2 Un único botón translúcido para volver, siempre alcanzable
- [x] 8.3 Comprobar que se puede saltar de `preview` a `console` sin pasar por `full`

## 9. Tests de API

- [x] 9.1 Crear `api/tests/mobileHostConsoleFlag.test.js`: creación con el flag a 1 y a 0, actualización en ambos sentidos, y valor por defecto 0 en un evento creado sin el campo
- [x] 9.2 Cubrir que un valor inválido lo rechaza la validación Zod sin tocar la base de datos
- [x] 9.3 Añadir una aserción estructural de que la columna está tanto en el `INSERT` de `createEvent` como en `allowedFields` de `updateEvent` — es el fallo silencioso que el ritual de cuatro sitios provoca
- [x] 9.4 Ejecutar `npm test` desde `api/` y comprobar que no hay regresiones, en particular en `adminEventAccess.test.js`

## 10. Verificación en dispositivo (manual, el cliente no tiene runner)

- [ ] 10.1 **Cambio de modo sin cortar la emisión**: con un segundo cliente observando, alternar `full` → `console` → `preview` → `full` con cámara y micrófono activos y confirmar que el asistente no ve ningún corte
- [ ] 10.2 **Pizarra**: activarla, cambiar de modo y volver; confirmar que sigue conectada y con permiso de escritura
- [ ] 10.3 **Chat**: enviar mensajes desde otro cliente durante el modo consola y confirmar que al volver a `full` está el historial completo
- [ ] 10.4 **Efecto de fondo**: aplicarlo en `full`, ir a consola y volver; confirmar que sigue aplicado y el procesador no se ha reinicializado
- [ ] 10.5 **Distribución** en el Pixel 9 Pro en horizontal, con y sin barra de direcciones: todo visible sin scroll, áreas táctiles cómodas
- [ ] 10.6 **Micrófono DJI**: seleccionarlo desde la consola y verificar con el medidor y con el segundo cliente que es la fuente que se emite
- [ ] 10.7 **Pantalla completa y orientación**: entrar, salir con un gesto del sistema y comprobar que el host **sigue** en modo consola con el botón de reentrada
- [ ] 10.8 **Fin de evento** con la consola abierta: vuelve a `full`, sale de pantalla completa y muestra el estado de finalizado
- [ ] 10.9 **Regresión con el flag desactivado**: un evento sin la casilla no muestra ningún control nuevo
- [ ] 10.10 **LiveKit y meeting**: comprobar que ninguno de los dos ha cambiado, más allá del wake lock

## 11. Documentación

- [x] 11.1 Añadir a `CLAUDE.md` una sección corta que fije las reglas que se romperán al editar: el envoltorio siempre montado por la pizarra, la divergencia deliberada respecto a `fullscreenchange` de `TheaterShell`, que el wake lock no depende del flag, y que la consola y la vista `full` comparten un único hook
- [x] 11.2 Documentar como procedimiento operativo la instalación desde «Añadir a pantalla de inicio» (`manifest.json` ya declara `display: standalone`), que elimina la barra de direcciones sin depender de la pantalla completa y es la opción más sólida para un evento planificado
- [x] 11.3 Dejar registrados los límites conocidos: compartir pantalla no fiable en Chrome para Android, selección de altavoz inexistente en Android, y ausencia de test automático para la distribución del cliente
