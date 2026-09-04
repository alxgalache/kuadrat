# Consola móvil del host para retransmisiones Agora

## Why

Las retransmisiones de conferencias y presentaciones se hacen desde un **Pixel 9 Pro en horizontal montado en un trípode de hasta 185 cm**, con micrófonos DJI Mic 3 conectados por USB. La vista de host actual (`AgoraLiveRoom` → `BroadcastArea` + `AgoraHostControls`) está diseñada para escritorio: apila vídeo 16:9 a ancho completo, rejilla de participantes, controles en una fila que envuelve, y chat lateral. En un móvil horizontal el alto útil cae a **~300 px CSS** (la barra de direcciones de Chrome reaparece al arrastrar hacia arriba), de modo que los controles quedan por debajo del pliegue, hay que hacer scroll para alcanzarlos, y los desplegables de dispositivo se abren fuera de pantalla. Elegir la entrada de audio correcta —lo único que decide si el evento entero se graba con el DJI o con el micrófono del teléfono— es hoy la operación más difícil de la interfaz.

A esto se suman dos defectos operativos observados en las pruebas: **la pantalla del móvil se bloquea a mitad de retransmisión** siguiendo el tiempo de espera del sistema, y **no hay forma de recuperar el espacio que ocupa la barra de direcciones**.

## What Changes

### Consola móvil del host (nueva, opt-in por evento)

- Nueva columna `events.allow_mobile_host_console` (INTEGER, `NOT NULL DEFAULT 0`), expuesta como checkbox **«Consola móvil del host»** en los formularios de creación y edición de evento. Solo se ofrece con `provider='agora'` e `interaction_mode='broadcast'`; el resto de combinaciones la ignoran.
- Con el flag activo, la vista de host gana **tres modos intercambiables**:
  - **`full`** — la vista actual, sin un solo cambio. Es el modo inicial siempre.
  - **`console`** — superposición `fixed inset-0` sin navbar, pie ni banners: previsualización de vídeo a la izquierda con **medidor de nivel de micrófono**, y a la derecha tarjetas táctiles grandes (≥48 px) para Micrófono, Cámara, Altavoz y Pantalla —cada una con su interruptor y su selector de fuente— más «Finalizar stream». Sin rejilla de participantes y sin chat.
  - **`preview`** — solo el vídeo a sangre, para encuadrar el trípode desde lejos.
- La selección de fuente en modo `console` se hace en un **panel a pantalla completa** con filas de ≥48 px, no en el desplegable actual (`DeviceDropdown` se abre `top-full` y en 300 px de alto queda fuera de la pantalla).
- Al entrar en `console` o `preview` se solicita **pantalla completa nativa** (`requestFullscreen`) y, si el navegador lo permite, **bloqueo de orientación horizontal**. Perder la pantalla completa **no** saca del modo: se muestra un botón para volver a entrar.
- El modo elegido se recuerda en `localStorage` y se restaura al recargar (un refresco a mitad de evento no obliga a rehacer la configuración).

### Bloqueo de pantalla (independiente del flag)

- Nuevo hook `useScreenWakeLock`, montado en **toda vista de host en directo** —Agora y LiveKit, con o sin consola móvil—, que mantiene la pantalla encendida mientras dura la retransmisión y la vuelve a bloquear al volver de segundo plano. Es la corrección de un defecto, no una función de la consola, y por eso no se ata al checkbox.

### Refactor que sostiene lo anterior

- Los controles de host pasan a un único hook `useHostMediaControls` (dispositivos, efectos, alternancias de micro/cámara/pantalla, finalizar evento). `AgoraHostControls` y la nueva consola son **dos presentaciones del mismo estado**, no dos copias de la lógica. El hook se instancia una sola vez por encima del conmutador de modo, de forma que cambiar de vista no reinicia la enumeración de dispositivos ni el procesador de fondos virtuales.

Sin cambios en el comportamiento de asistentes, de eventos LiveKit, de `interaction_mode='meeting'`, ni de ningún evento cuyo checkbox esté desmarcado.

## Capabilities

### New Capabilities

- `agora-host-mobile-console`: el flag por evento `allow_mobile_host_console`, los tres modos de vista del host en salas Agora `broadcast`, su distribución en horizontal, el panel de selección de fuente táctil, la degradación de los controles que el navegador móvil no soporta, y la gestión de pantalla completa y orientación.
- `host-screen-wake-lock`: mantener la pantalla encendida mientras el host retransmite, en cualquier proveedor y con independencia del flag anterior.

### Modified Capabilities

Ninguna. `agora-streaming-provider` gana un campo aditivo en los formularios y validadores de evento, pero ninguno de sus requisitos actuales cambia de comportamiento: un evento sin el flag se comporta exactamente igual que hoy.

## Impact

**Base de datos** — `api/config/database.js`: nueva columna en el `CREATE TABLE events` **y** su `safeAlter` correspondiente (las bases existentes no se recrean).

**API** — `api/validators/eventSchemas.js` (create + update), `api/controllers/eventAdminController.js`, `api/services/eventService.js` (lista de columnas del `INSERT` y `allowedFields` del `UPDATE`). El camino de lectura no necesita nada: `getEventBySlug` hace `SELECT e.*`, así que el flag llega solo al cliente.

**Cliente** — `client/components/AgoraLiveRoom.js` (conmutador de modo y refactor de controles), nuevos `client/components/events/HostConsole.js`, `MobileDevicePicker.js`, nuevos `client/hooks/useHostMediaControls.js`, `useScreenWakeLock.js`, `useHostViewMode.js`; `client/components/EventLiveRoom.js` (solo monta el wake lock); `client/lib/constants.js` (clave de `localStorage` y textos es-ES); formularios `client/app/admin/espacios/nuevo/page.js` y `client/app/admin/espacios/[id]/page.js`.

**Sin impacto** en variables de entorno, CSP, Sentry, Socket.IO, tokens RTC ni facturación. No se añade ninguna dependencia: la API de Wake Lock, la de Pantalla Completa y la de Orientación son nativas del navegador.

**Límites conocidos que la implementación debe exponer, no ocultar:**
- **Compartir pantalla no funciona de forma fiable en Chrome para Android** (`getDisplayMedia` es «dependiente del dispositivo y la versión, no fiable»). La tarjeta «Pantalla» se detecta por capacidad y se muestra deshabilitada con explicación en vez de fallar al pulsarla.
- **La selección de altavoz no existe en Android** (`setSinkId` y la enumeración de `audiooutput` son de escritorio): la salida la decide el sistema. El guardián actual `playbackDevices.length > 0` ya la oculta; en la consola se sustituye por una tarjeta deshabilitada que lo dice.
- **Ningún API puede ocultar permanentemente la barra de direcciones en una pestaña normal.** Se cubre con pantalla completa nativa, y la alternativa más sólida —instalar el sitio desde «Añadir a pantalla de inicio», que ya funciona hoy porque `client/app/manifest.json` declara `display: standalone`— no requiere código y se documenta como procedimiento operativo.
- **El cliente sigue sin runner de tests**, así que la consola y su distribución se verifican a mano en dispositivo. La parte de API (columna, validadores, persistencia) sí queda cubierta por un test nuevo.
