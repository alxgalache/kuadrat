## Context

El componente `EventLiveRoom` (`client/components/EventLiveRoom.js`) gestiona la sala de streaming en directo usando LiveKit. Dentro de el, el sub-componente `HostControls` (lineas 398-491) proporciona al host tres toggle switches:

```
Microfono [ON/OFF]    Camara [ON/OFF]    Pantalla [ON/OFF]
```

Cada toggle llama a `localParticipant.setCameraEnabled()` / `setMicrophoneEnabled()` / `setScreenShareEnabled()` — operaciones de encendido/apagado que usan el dispositivo por defecto del sistema. No existe mecanismo para seleccionar un dispositivo especifico.

### Imports actuales de LiveKit

```javascript
// De @livekit/components-react (v2.9.20)
import {
  LiveKitRoom, VideoTrack, RoomAudioRenderer,
  useParticipants, useTracks, useChat,
  useLocalParticipant, useIsSpeaking, useRoomContext,
} from '@livekit/components-react'

// De livekit-client (v2.17.2)
import { Track, RoomEvent, DisconnectReason } from 'livekit-client'
```

### API disponible para seleccion de dispositivos

El paquete `@livekit/components-react` ya instalado exporta las siguientes herramientas para gestion de dispositivos:

**Hook `useMediaDeviceSelect`** — API principal para este cambio:
```javascript
import { useMediaDeviceSelect } from '@livekit/components-react'

const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
  kind: 'audioinput',        // 'audioinput' | 'videoinput' | 'audiooutput'
  requestPermissions: true,  // Para obtener labels legibles
})
```

Retorna:
- `devices: MediaDeviceInfo[]` — lista de dispositivos disponibles del kind especificado
- `activeDeviceId: string` — ID del dispositivo actualmente activo
- `setActiveMediaDevice(deviceId: string, options?: { exact: boolean }): Promise<void>` — cambia el dispositivo activo

Internamente, el hook:
1. Llama a `navigator.mediaDevices.enumerateDevices()` y filtra por kind
2. Se suscribe a `navigator.mediaDevices.ondevicechange` para hot-swap (conexion/desconexion USB)
3. Sincroniza el estado React con el estado interno de Room de LiveKit
4. Llama a `room.switchActiveDevice(kind, deviceId)` cuando se invoca `setActiveMediaDevice`
5. Gestiona cleanup automatico al desmontar el componente (event listeners, operaciones pendientes)

**Componente `MediaDeviceMenu`** — alternativa prefab (NO se usara):
Componente de boton + dropdown completo. Descartado porque no se integra bien con el patron existente de toggle switches customizados.

**Metodos de bajo nivel en `room`** — alternativa manual (NO se usara):
- `room.switchActiveDevice(kind, deviceId)` — switching directo
- `room.getActiveDevice(kind)` — consulta del dispositivo activo
Descartados porque requieren gestionar manualmente: enumeracion, event listeners, cleanup, sincronizacion con React.

## Goals / Non-Goals

**Goals:**
- Permitir al host cambiar de microfono, camara y altavoces durante un evento en directo sin recargar la pagina
- Integrar los selectores de forma natural con los toggle switches existentes
- Manejar correctamente hot-swap de dispositivos (conexion/desconexion USB durante el stream)
- UI consistente con el diseno minimalista existente (TailwindCSS, dropdown blanco, bordes grises)

**Non-Goals:**
- Selector de dispositivos para viewers o participantes promovidos
- Selector para screen share (el OS lo gestiona)
- Pre-join device picker
- Persistencia de preferencias entre sesiones
- Tests automatizados (no hay test suite configurada en el proyecto)

## Decisions

### 1. Usar `useMediaDeviceSelect` hook (Nivel 2)

**Decision:** Utilizar el hook `useMediaDeviceSelect` de `@livekit/components-react` para la enumeracion y switching de dispositivos.

**Alternativas consideradas:**

- **MediaDeviceMenu (Nivel 1):** Componente prefab que genera su propio boton + dropdown. Descartado porque no se puede integrar de forma natural al lado de los toggle switches existentes — generaria un segundo boton separado en lugar del patron chevron deseado.

- **room.switchActiveDevice (Nivel 3):** API directa del SDK livekit-client. Descartado porque requiere ~40 lineas de codigo manual para replicar lo que el hook ya resuelve: enumeracion reactiva, suscripcion a device change events, sincronizacion con React state, cleanup al desmontar. Misma funcionalidad final, pero mas codigo y mas superficie para bugs (race conditions, memory leaks por listeners no limpiados, setState en componente desmontado).

**Justificacion del Nivel 2:** El hook proporciona exactamente la interfaz necesaria (`devices`, `activeDeviceId`, `setActiveMediaDevice`) dejando total libertad sobre la UI, que es lo que necesitamos para el patron chevron+dropdown.

### 2. Patron UI: chevron desplegable al lado del toggle

**Decision:** Cada control de microfono y camara tendra dos zonas interactivas:
- El toggle switch existente (on/off)
- Un boton chevron (triangulo/flecha hacia abajo) que abre un dropdown posicionado debajo

```
  Microfono [═══●] ▾    Camara [═══●] ▾    Altavoces ▾    Pantalla [═══●]
                   │                  │               │
             ┌─────┴────────┐  ┌─────┴────────┐ ┌────┴─────────┐
             │ ● Mic interno│  │ ● USB cam    │ │ ● Altavoces  │
             │ ○ USB Audio  │  │ ○ Integrada  │ │   internos   │
             │ ○ Bluetooth  │  │ ○ OBS Virtual│ │ ○ HDMI Audio │
             └──────────────┘  └──────────────┘ └──────────────┘
```

El control de altavoces NO tiene toggle on/off (la salida de audio siempre esta activa para que el host escuche a los participantes promovidos). Solo muestra el selector con el nombre del dispositivo activo.

El control de pantalla NO tiene selector (el OS proporciona su propio picker nativo).

### 3. Componente DeviceSelector extraido como sub-componente interno

**Decision:** Crear un componente `DeviceSelector` dentro de `EventLiveRoom.js` (no en archivo separado) que encapsule:
- El boton chevron
- El dropdown con la lista de dispositivos
- La logica de click-outside para cerrar
- La llamada a `useMediaDeviceSelect`

Este componente se reutilizara tres veces (audioinput, videoinput, audiooutput) con la prop `kind`.

**Alternativa considerada:** Archivo separado `client/components/DeviceSelector.js`. Descartado porque este componente solo tiene sentido dentro del contexto de `LiveKitRoom` (necesita el room context de LiveKit para funcionar), y su unica referencia es `HostControls`.

### 4. Posicionamiento del dropdown: relativo al boton

**Decision:** Usar `position: absolute` relativo al contenedor del boton chevron, con `z-10` para asegurar que queda por encima del contenido adyacente.

**Alternativa considerada:** Portal al body con calculo de posicion. Descartado por complejidad innecesaria — los controles estan en la parte inferior de la columna de video, sin restricciones de overflow que bloqueen un dropdown relativo.

### 5. Cierre del dropdown: click-outside + seleccion + Escape

**Decision:** El dropdown se cierra cuando:
- Se hace click fuera del componente (useEffect con document click listener)
- Se selecciona un dispositivo
- Se pulsa la tecla Escape

### 6. Manejo de permisos: `requestPermissions: true`

**Decision:** Pasar `requestPermissions: true` al hook `useMediaDeviceSelect`. Sin esta opcion, los navegadores devuelven labels vacios o genericos ("", "Device 1") para los dispositivos por razones de privacidad. Con `requestPermissions: true`, el hook solicita acceso al media correspondiente para obtener labels legibles (ej: "USB Live camera (09da:2690)").

Nota: como el host ya ha concedido permisos de camara/microfono al activar los toggles, esta solicitud es transparente (no vuelve a mostrar prompt del navegador). Para `audiooutput`, los navegadores no requieren permisos adicionales.

### 7. Feedback visual del dispositivo activo

**Decision:** En el dropdown, el dispositivo activo se marca con un icono de check (checkmark) o bullet relleno a la izquierda, y su texto en `font-medium`. Los demas dispositivos muestran bullet vacio.

### 8. Estado vacio: sin dispositivos disponibles

**Decision:** Si la lista de dispositivos esta vacia (caso raro, ocurre si no hay permisos o no hay hardware), el dropdown muestra un texto gris italico: "No se encontraron dispositivos".

## Risks / Trade-offs

- **Compatibilidad `audiooutput`:** La seleccion de salida de audio (`setSinkId`) no esta soportada en todos los navegadores. Firefox lo soporta desde version 116, Safari desde 17.4. En navegadores sin soporte, el selector de altavoces simplemente no aparecera (el hook devolvera lista vacia para `audiooutput`). Esto es degradacion elegante, no un error.

- **Permisos denegados:** Si el usuario niega permisos de camara/microfono, las labels de dispositivos seran genericas. Esto no afecta la funcionalidad de switching (solo la legibilidad de los nombres). El dropdown mostrara lo que el navegador proporcione.

- **Hot-swap durante dropdown abierto:** Si un dispositivo USB se desconecta mientras el dropdown esta abierto, la lista se actualiza automaticamente (el hook escucha `devicechange`). Si el dispositivo activo es el que se desconecto, LiveKit maneja el fallback internamente.

## Open Questions

_(ninguna — todas las decisiones estan resueltas)_
