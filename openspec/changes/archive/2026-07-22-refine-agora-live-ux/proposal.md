## Why

El cambio `add-agora-streaming-provider` entregó la sala en directo Agora (modos `broadcast` y `meeting` + pizarra), pero está aún **sin archivar** (46/52) y en las pruebas de QA han aparecido cuatro problemas que degradan la experiencia del modo `meeting`/"cámaras" y **rompen la pizarra**. Conviene corregirlos antes de archivar el cambio padre, sin tocar el modo `broadcast` (paridad LiveKit) ni los eventos LiveKit.

## What Changes

- **[Fix] Cámara — `AbortError` al entrar (meeting):** la enumeración de dispositivos (`useAgoraDevices`) dejará de disparar un probe de `getUserMedia` al montar los controles. Se enumerará con `AgoraRTC.getMicrophones/getCameras(skipPermissionCheck: true)` y se re-enumerará tras crear el primer track para recuperar las etiquetas. Elimina los dos errores de acceso.
- **[Fix best-effort] Cámara — `NotReadableError "Could not start video source"` al encender/cambiar de fuente:** reintento único con constraints por defecto y mensaje es-ES claro. Es un fallo de nivel SO/driver de algunas webcams externas; se documenta como **garantía best-effort** (las webcams realmente incompatibles pueden seguir fallando; las integradas funcionan).
- **[UX · solo meeting] Layout del modo `meeting`:** el recuadro del host pasa a ocupar **todo el ancho** del contenedor de cámaras (grande, `aspect-video`; muestra la pantalla compartida cuando el host comparte) y los participantes se muestran **debajo en filas de 3**. El chat lateral ocupa **siempre toda la altura disponible de la página** (la columna de medios hace scroll interno), sin crecer al compartir pantalla ni al haber muchos participantes. El modo `broadcast` **no cambia**.
- **[Nuevo] Pantalla completa de la pantalla compartida:** botón de pantalla completa **sobre el recuadro de la pantalla compartida** (meeting y broadcast) para que los asistentes la maximicen en su dispositivo, vía Fullscreen API del navegador sobre el contenedor del track. Fallback iOS Safari (`webkitEnterFullscreen` sobre el `<video>`).
- **[Fix] Pizarra bloqueada por CSP:** añadir `blob:` a `script-src` y `connect-src` en `client/next.config.js` (`worker-src` ya lo tiene). `white-web-sdk` carga sus módulos con `document.createElement("script")` + `src=blob:`, hoy bloqueado por CSP → `[modules] load script with URL failed`.
- **[Doc] Aviso benigno de la pizarra:** documentar que el peer `agora-foundation@3.11.1` que pide `white-web-sdk@2.16.56` **no existe en npm** (solo hasta `3.11.0`), por lo que el SDK cae a su logger de reserva (Argus) y funciona igual. **No** se fuerza versión ni se cambia el SDK de pizarra. Opcional: `https://*.agoralab.co` en `connect-src` para silenciar el ruido de red del logger de reserva.

## Capabilities

### New Capabilities
<!-- Ninguna: este cambio refina capabilities ya introducidas por el cambio padre. -->

### Modified Capabilities
- `agora-streaming-provider`: MODIFICA el requisito del modo `meeting` (layout host full-width + participantes en filas de 3 + chat a altura completa con scroll interno de la columna de medios) y AÑADE los requisitos de pantalla completa de la pantalla compartida, enumeración de dispositivos sin probe de permisos en la entrada, y arranque de cámara robusto (best-effort).
- `agora-whiteboard`: AÑADE el requisito de política CSP para la pizarra (`blob:` en `script-src`/`connect-src`) y documenta el aviso benigno de `agora-foundation` (peer no instalable) como no bloqueante.

> Nota de orden de archivado: ambas capabilities las introduce el cambio padre `add-agora-streaming-provider`, **aún sin archivar**. Este cambio debe archivarse **después** del padre (ver `design.md`).

## Impact

- **Frontend (único código):** `client/hooks/useAgoraDevices.js`, `client/hooks/useAgoraRoom.js`, `client/components/AgoraLiveRoom.js`, `client/app/live/[slug]/EventDetail.js` (contenedor de altura de la rama meeting), `client/next.config.js` (CSP).
- **Documentación:** `api/.env.example` y `CLAUDE.md` (nota del CSP de la pizarra y del aviso benigno de `agora-foundation`).
- **Sin cambios** de base de datos, backend/API, dependencias nuevas, modo `broadcast`, ni eventos LiveKit.
