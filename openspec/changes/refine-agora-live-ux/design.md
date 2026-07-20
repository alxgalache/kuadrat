## Context

`add-agora-streaming-provider` (46/52, **sin archivar**) entregó `client/components/AgoraLiveRoom.js` con dos modos: `broadcast` (paridad LiveKit) y `meeting` (grid de cámaras estilo Meet), más la fase de pizarra (`WhiteboardPanel` con `@netless/fastboard` → `white-web-sdk`). En QA (dos navegadores + webcams externas) han aparecido cuatro problemas:

1. Errores de cámara: `AbortError "getUserMedia unexpected error"` al **entrar** a un meeting (dos veces), y `NotReadableError "Could not start video source"` al **encender** la cámara o cambiar de fuente, solo con algunas webcams externas (las integradas funcionan).
2. El layout de `meeting` muestra al host como un tile más del grid; se pide host a todo el ancho + participantes en filas de 3, y el chat lateral solo ocupa la altura de los recuadros de participantes (con pocos, queda muy corto).
3. Los asistentes no pueden poner en pantalla completa la pantalla compartida por el host.
4. Al activar la pizarra saltan dos errores del `white-web-sdk`: `Cannot find module 'agora-foundation/lib/logger'` (→ "fallback to Argus") y `[modules] load script with URL failed ... fetch "blob:..." failed`.

Causas confirmadas contra el runtime real (contenedor `kuadrat-client-1`), la API-ref oficial de Agora Web SDK 4.x y el propio `node_modules/white-web-sdk/index.js`.

## Goals / Non-Goals

**Goals:**
- Eliminar los errores de cámara al **entrar** a un meeting (los `AbortError`).
- Mitigar (best-effort) el `NotReadableError` al encender/cambiar cámara, con mensaje es-ES claro.
- Rediseñar el layout del modo `meeting`: host destacado a todo el ancho, participantes en filas de 3, chat a altura completa de página con scroll interno en la columna de medios.
- Permitir a los asistentes poner la pantalla compartida en pantalla completa.
- Desbloquear la pizarra (CSP) y documentar el aviso benigno de `agora-foundation`.

**Non-Goals:**
- Tocar el modo `broadcast` (mantiene la paridad LiveKit y su altura de chat sincronizada) o los eventos LiveKit.
- Cambios de BD, backend o API. Nuevas dependencias. Cambiar la versión del SDK de pizarra.
- Garantizar el 100% de webcams externas (fallo de nivel SO/driver aceptado como best-effort).

## Decisions

### D1. Enumeración de dispositivos sin probe de permisos (issue 1a)
**Causa:** `client/hooks/useAgoraDevices.js` llama en el `useEffect` de montaje a `AgoraRTC.getMicrophones()`/`getCameras()` con `skipPermissionCheck` por defecto = `false`. La API-ref confirma que en ese caso *"the SDK … triggers the request for media device permission"* → un `getUserMedia` de sondeo. En `meeting` **todos** montan controles (`MeetingSelfControls`/`AgoraHostControls`) → se sondea al entrar, y con una webcam que arranca mal eso lanza el `AbortError` (dos, uno por dispositivo/probe). En `broadcast` los viewers no montan controles, por eso no lo veían.
**Decisión:** enumerar con `skipPermissionCheck: true` en el montaje y **re-enumerar tras crear el primer track** (cuando el permiso ya está concedido de forma natural) para recuperar las etiquetas. Alternativa considerada: diferir toda enumeración hasta abrir un desplegable/encender un dispositivo — válida, pero cambia más la UX (lista no precargada); se prefiere `skipPermissionCheck` + re-enumeración por ser el cambio mínimo.

### D2. Arranque de cámara robusto, best-effort (issue 1b)
**Causa:** `createCameraVideoTrack()` / `track.setDevice()` hacen un `getUserMedia` real; `NotReadableError`/`NOT_READABLE` es de nivel SO/driver ("el navegador no puede iniciar la fuente"), típico de ciertas webcams externas. Ya pasamos config mínima (`{ cameraId }`), así que no es sobre-constraint.
**Decisión:** (1) al quitar el probe de D1 se elimina el doble-acceso concurrente al dispositivo, que en varias webcams es lo que precipita el fallo; (2) reintento único con constraints por defecto; (3) mensaje es-ES claro en `deviceError`. Se documenta como **best-effort**. Alternativa considerada: bajar `encoderConfig` — descartada (la config ya es mínima; no es la causa).

### D3. Layout del modo `meeting` a altura de viewport (issue 2, solo meeting)
**Causa del bug de altura:** el chat toma su altura de `videoAreaHeight`, medido por `ResizeObserver` sobre la columna de medios; con pocos participantes la columna es baja → chat corto.
**Decisión:** en `meeting`, la vista pasa a ocupar la **altura de viewport disponible** aprovechando que `body` ya es `h-full flex flex-col` con `<main className="flex-grow">`. La rama meeting de `EventDetail.js` da al contenedor una altura definida (flex hasta el viewport, restando header/navbar/footer); en `MeetingArea`: columna de medios `flex-1 min-h-0 overflow-y-auto` (scroll interno), recuadro del host `w-full aspect-video` (muestra la pantalla compartida si el host comparte), participantes en `grid-cols-3` (`md+`, 2 en móvil); la columna de chat pasa a `h-full` **desacoplada del `ResizeObserver`** (que se conserva solo para `broadcast`). Así el chat mantiene su altura al compartir pantalla o al crecer los participantes. Alternativa considerada: fijar `min-h` grande al chat — descartada (no cumple "toda la altura disponible" de forma fiable).

### D4. Pantalla completa de la pantalla compartida (issue 3)
**Viable sin API de Agora:** `track.play(div)` inserta un `<video>`; basta `div.requestFullscreen()` sobre el contenedor del track. Hoy el botón de broadcast fullscreen apunta a **toda** la columna (`videoAreaRef`) y en meeting no hay botón sobre la pantalla.
**Decisión:** botón "pantalla completa" superpuesto **sobre el recuadro de la pantalla compartida** (meeting: recuadro destacado; broadcast: vídeo del host cuando hay screen share), llamando `requestFullscreen()` en ese contenedor. **Fallback iOS Safari:** no permite fullscreen de un `div` arbitrario → usar `webkitEnterFullscreen()` sobre el `<video>` del track. Alternativa considerada: mantener el fullscreen de toda la columna — descartada (el usuario quiere maximizar la pantalla concreta).

### D5. CSP para la pizarra (issue 4, error bloqueante)
**Causa (leída en `white-web-sdk@2.16.56`):** `loadScriptWithURL()` hace `document.createElement("script")` con `src = blob:…`. El CSP de `client/next.config.js` tiene `worker-src 'self' blob:` ✅ pero **`script-src` NO incluye `blob:`** (ni `connect-src`) → el navegador bloquea el `<script src="blob:">` y el SDK lo reporta como `[modules] load script with URL failed`.
**Decisión:** añadir `blob:` a `script-src` y a `connect-src` en el CSP (worker-src ya lo tiene). Es la superficie mínima que exige el SDK; `blob:` es de mismo origen. Alternativa considerada: solo `script-src` — se añade también `connect-src` por robustez (algunas rutas del loader usan `fetch`).

### D6. Aviso benigno de `agora-foundation` (issue 4, no bloqueante)
**Causa (verificada en npm y en el peer del SDK):** `white-web-sdk@2.16.56` declara `peerDependency agora-foundation@"3.11.1-rc.1 || 3.11.1"`, pero **en npm solo existe hasta `3.11.0`** → no se instala y el SDK usa su logger de reserva (Argus). Es no bloqueante ("fallback to Argus").
**Decisión:** **no** forzar versión ni cambiar el SDK. Documentar el aviso como conocido/benigno (CLAUDE.md, `.env.example`). Para silenciar **todo** el ruido de red relacionado se incluyen los hosts Agora/Netless: `*.agoralab.co` en `connect-src` (http + wss, endpoints `api-solutions-*` del logger de reserva) y `*.netless.link` en `font-src` (fuentes de `convertcdn.netless.link`). Alternativas descartadas: instalar `agora-foundation@3.11.0` con `--legacy-peer-deps` (mismatch de versión, riesgo de romper en vez de arreglar) o subir/bajar `@netless/fastboard` (cambia la versión del SDK de pizarra, más riesgo).

### D7. OpenSpec: orden de archivado y base del `MODIFIED`
Las capabilities `agora-streaming-provider` y `agora-whiteboard` las introduce el cambio padre **sin archivar**, así que aún no viven en `openspec/specs/`. El `MODIFIED` del requisito de meeting toma como base el bloque del delta del padre. **Este cambio debe archivarse después del padre.** Si `openspec validate` señalara que el `MODIFIED` no encuentra su base en las specs principales, se reformula ese bloque como requisito `ADDED` que refina el layout de meeting (mismo contenido), documentándolo aquí.

### D8. Pizarra: shim de `ReactDOM.render` legacy para React 19 (post-QA, issue pizarra)
**Causa raíz (confirmada leyendo los bundles):** con la pizarra activa la UI se renderizaba pero **no se podía dibujar** (`[fastboard] An error occurred while binding container` + `TypeError: (0, yl.render) is not a function`). El primer intento —pasar de `@netless/fastboard-react` a la API vanilla— NO lo arregló: el error reaparece dentro de `mount()`. El culpable real es **`white-web-sdk@2.16.56`**, que usa `ReactDOM.render` (39 llamadas) y `unmountComponentAtNode`, **ambos eliminados en React 19** (la app corre React 19.2). `@netless/appliance-plugin` (que trae su propio react-dom 16) está **desactivado por defecto** (`enableAppliancePlugin` opcional), así que no interviene.
**Decisión:** añadir `client/lib/reactDomLegacyShim.js` que re-implementa `ReactDOM.render`/`unmountComponentAtNode` sobre `createRoot` (`react-dom/client`), con `flushSync` para conservar la semántica síncrona, parcheando el `module.exports` de `react-dom` (CJS, extensible y compartido con el `require('react-dom')` de white-web-sdk — verificado). Se importa **antes** de `@netless/fastboard` en `WhiteboardPanel.js`. Se conserva la API vanilla `createFastboard`+`mount` (más limpia, alineada con D10 del padre). **No cambia** la versión del SDK. El aviso benigno de `agora-foundation` (D6) persiste, no relacionado.
**Alternativas descartadas:** alias de bundler `react-dom`→shim (circular al re-exportar todo react-dom, y doble config Turbopack+webpack); subir/cambiar el SDK de pizarra (su última versión aún fija react `^16.8`, no resuelve); bajar la app a React 18 (contra el stack).

### D9. Vista del host: grid de iguales salvo destacado (post-QA, ajuste 3)
**Decisión:** en `meeting`, para el **host** la utilidad es ver a todos, así que sin pantalla compartida ni pizarra se muestran todas las cámaras (la suya primera, mismo tamaño) en el grid de filas de 3, sin recuadro destacado; al compartir pantalla o activar la pizarra, esta ocupa el destacado (como antes). Para los **asistentes** no cambia nada: el host siempre destacado. Implementado con `showFeatured = whiteboard || hostScreenSharing || !isHost` y `gridEntries` (todos con host primero cuando no hay destacado; solo no-host cuando sí).

### D10. Chat: scroll solo del contenedor interno (post-QA, issue 1)
**Causa:** `messagesEndRef.scrollIntoView()` desplazaba también la ventana → en el layout meeting a altura de viewport, enviar un mensaje saltaba toda la página.
**Decisión:** scrollear únicamente el contenedor de mensajes (`el.scrollTop = el.scrollHeight`) vía ref, nunca `scrollIntoView`. Aplica a ambos modos (mejora general).

## Risks / Trade-offs

- **[R1] `MODIFIED` sin base en specs principales** (padre no archivado) → `openspec validate` podría marcarlo. **Mitigación:** orden de archivado (padre primero); plan B de reformular a `ADDED` (D7).
- **[R2] `NotReadableError` best-effort** → algunas webcams externas seguirán sin publicar vídeo. **Mitigación:** mensaje es-ES claro + el resto de la sala intacto; aceptado por el usuario.
- **[R3] Ampliar CSP con `blob:` en `script-src`/`connect-src`** amplía ligeramente la superficie. **Mitigación:** `blob:` es de mismo origen y lo exige el SDK; se mantiene el resto del CSP.
- **[R4] Layout a altura de viewport en móvil** (scroll interno, tiles pequeños en filas de 3). **Mitigación:** 2 columnas en móvil, 3 en `md+`; el footer queda bajo el pliegue durante el evento (comportamiento típico de una "sala").
- **[R5] Fullscreen en iOS Safari** solo sobre `<video>`. **Mitigación:** fallback `webkitEnterFullscreen()`.
- **[R6] `skipPermissionCheck: true` → etiquetas de dispositivo vacías** hasta conceder permiso. **Mitigación:** re-enumerar tras crear el primer track (D1).

## Migration Plan

1. Solo frontend + CSP + documentación: desplegar `client` (rebuild por el CSP en `next.config.js`). Sin cambios de BD/backend/API.
2. **Orden de archivado OpenSpec:** archivar primero `add-agora-streaming-provider`, después `refine-agora-live-ux`.
3. **Rollback:** revertir los ficheros de `client/` (incluido el CSP). Las specs son inertes hasta archivar.

## Open Questions

- Resuelto (usuario): grid de participantes en móvil = **2 columnas** (3 en `md+`).
- Resuelto (usuario): se incluyen **todos los hosts Agora/Netless relacionados** para silenciar cualquier ruido de CSP — `*.agoralab.co` (`connect-src`, http + wss) y `*.netless.link` (`font-src`); el resto de directivas ya lo cubre.
- Sin preguntas abiertas.
