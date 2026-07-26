# Proposal: add-agora-virtual-background

## Why

En las salas Agora (broadcast y meeting) el participante que enciende su webcam expone su entorno real —casa, taller, estudio— sin ninguna alternativa: hoy la única opción de privacidad es no encender la cámara. Meet, Zoom y Teams han normalizado el desenfoque de fondo como higiene básica, y su ausencia es un freno real a que artistas y asistentes se muestren en directo. Además, siendo Kuadrat una galería, poder sustituir el fondo por una imagen de sala o de taller permite encuadrar al artista en un contexto coherente con la marca sin montar nada físico.

## What Changes

- **Nueva dependencia frontend `agora-extension-virtual-background`** (v2.x, peer `agora-rtc-sdk-ng >=4.15.0`; el proyecto ya usa `^4.24.6`). El bundle pesa ~2,1 MB con el WASM embebido en base64 —no descarga nada de ningún CDN—, por lo que SOLO se carga con `import()` dinámico al abrir el menú de efectos por primera vez. **No requiere cambios de CSP** (`script-src` ya incluye `'unsafe-eval'` y `worker-src` ya incluye `blob:`).
- **Control "Efectos" en la barra de controles**, junto al interruptor de Cámara y con el mismo patrón visual del selector de dispositivos (chevron + panel, cierre por clic-fuera y Escape). Deshabilitado mientras la cámara esté apagada. Se añade a los dos únicos puntos con control de cámara: `AgoraHostControls` (host en broadcast **y** en meeting) y `MeetingSelfControls` (asistentes en meeting). En broadcast los asistentes no publican vídeo ni tienen UI de cámara, así que ahí no hay nada que añadir.
- **Tres tipos de efecto**: `Ninguno`, **desenfoque** en dos intensidades (suave = `blurDegree 1`, intenso = `blurDegree 3`) y **fondo de imagen** elegido de un catálogo estático servido desde el repo.
- **Catálogo de fondos declarado a mano**: los ficheros se dejan en `client/public/fondos-virtuales/` y se declaran uno a uno en un manifiesto `client/lib/virtualBackgrounds.js` (`{ file, label }`), lo que permite etiquetas en es-ES y orden controlado. El menú muestra miniaturas.
- **Persistencia por dispositivo**: la selección se guarda en `localStorage` y se reaplica automáticamente la próxima vez que el usuario encienda la cámara en cualquier sala Agora. Sin cambios en base de datos ni en el backend.
- **Puerta de compatibilidad**: el control solo se renderiza si `extension.checkCompatibility()` es `true` **y** el dispositivo no es móvil. Agora desaconseja expresamente esta función en navegadores móviles por rendimiento; en escritorio (Chrome, Firefox, Safari) sí se ofrece.
- **Degradación ante sobrecarga**: se engancha el callback `processor.onoverload` para desactivar el efecto automáticamente y avisar en es-ES cuando el equipo no da abasto, en lugar de dejar el vídeo congelándose.

El efecto se aplica **solo al track local antes de publicarlo**, por lo que todos los participantes (y las grabaciones, si las hubiera) reciben ya el vídeo procesado. No hay señalización nueva por Socket.IO ni conocimiento del efecto en los demás clientes.

## Capabilities

### New Capabilities

- `agora-virtual-background`: efectos de fondo (desenfoque y sustitución por imagen) sobre la cámara local en salas Agora — catálogo de fondos, control de UI, persistencia, compatibilidad y comportamiento frente al ciclo de vida del track (encendido/apagado, cambio de cámara en caliente, compartir pantalla, promoción/degradación de rol y salida de la sala).

### Modified Capabilities

(ninguna)

> Nota: `agora-streaming-provider` describe la barra de controles enumerando micrófono, cámara, selectores de dispositivo y pantalla, pero no como lista cerrada; añadir "Efectos" no invalida ninguno de sus requisitos ni escenarios, así que no necesita delta. Lo mismo aplica a `host-device-selector` y a `agora-whiteboard`.

## Impact

**Solo frontend.** Sin cambios en `api/`, en `api/config/database.js`, en variables de entorno ni en `client/next.config.js` (CSP).

- `client/package.json` — nueva dependencia `agora-extension-virtual-background`.
- `client/hooks/useAgoraVideoEffect.js` *(nuevo)* — carga perezosa de la extensión, ciclo de vida del `VirtualBackgroundProcessor` (`init` → `pipe` → `setOptions`/`enable`/`disable` → `unpipe`/`release`), persistencia en `localStorage`, `onoverload` y detección de compatibilidad.
- `client/components/events/VideoEffectsMenu.js` *(nuevo)* — panel presentacional (Ninguno / desenfoque suave / desenfoque intenso / rejilla de miniaturas), en la línea de `DeviceDropdown.js`.
- `client/components/AgoraLiveRoom.js` — montar el control "Efectos" en `AgoraHostControls` y en `MeetingSelfControls`; enganchar el reaplicado del efecto en el flujo de encendido de cámara.
- `client/hooks/useAgoraRoom.js` — puntos de anclaje del pipeline: exponer el track de cámara al hook de efectos y liberar el procesador en `becomeAudience()` y en el teardown del `useEffect` de join/leave (hoy cierran el track sin saber del procesador).
- `client/lib/virtualBackgrounds.js` *(nuevo)* — manifiesto del catálogo de fondos.
- `client/lib/constants.js` — constantes del efecto (clave de `localStorage`, grados de desenfoque, ruta base del catálogo).
- `client/public/fondos-virtuales/` *(nueva carpeta)* — **imágenes aportadas manualmente por el equipo**; el repo solo aporta la carpeta y un `README.md` con los requisitos de formato.
- Sin cambios en `client/components/EventLiveRoom.js` (LiveKit conserva su comportamiento actual).
