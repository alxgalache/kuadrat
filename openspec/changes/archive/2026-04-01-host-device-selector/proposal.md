## Why

Cuando el host de un evento en directo necesita cambiar de fuente de video o audio (por ejemplo, de la webcam integrada a una USB, o de un microfono a otro), actualmente solo puede hacerlo a traves de los ajustes nativos del navegador (icono de camara/microfono en la barra de direcciones de Chrome). Al cambiar el dispositivo desde ahi, Chrome muestra el mensaje "Vuelve a cargar esta pagina para aplicar la configuracion actualizada a este sitio", forzando una recarga completa. Esto rompe la conexion LiveKit, desconecta al host del stream, y pierde cualquier configuracion seleccionada.

Este problema hace que el host no pueda cambiar de dispositivo durante un evento en directo sin interrumpir el stream para todos los asistentes.

## What Changes

- **Agregar selectores de dispositivo in-app en `HostControls`**: Al lado de cada toggle switch de microfono y camara, anadir un boton chevron (flecha) que al hacer click despliega un dropdown con la lista de dispositivos disponibles del mismo tipo. Seleccionar un dispositivo cambia la fuente activa **sin recargar la pagina**.
- **Agregar selector de salida de audio (altavoces)**: Un nuevo control (solo selector, sin toggle on/off) que permite al host elegir por que dispositivo de salida escuchar el audio de los participantes promovidos.
- **Utilizar el hook `useMediaDeviceSelect` de `@livekit/components-react`**: Este hook ya instalado (v2.9.20) proporciona enumeracion reactiva de dispositivos, tracking del dispositivo activo, y switching seguro sin necesidad de codigo manual de bajo nivel.

## Capabilities

### New Capabilities

- `host-device-selector`: El host del evento puede seleccionar fuente de microfono, camara y salida de audio desde la interfaz del evento sin abandonar ni recargar la pagina.

### Modified Capabilities

_(ninguna — el cambio agrega funcionalidad nueva a los controles del host, no modifica funcionalidad existente)_

## Impact

- **Layer**: Frontend only
- **Files afectados**: `client/components/EventLiveRoom.js` (componente `HostControls`, posibles nuevos sub-componentes internos)
- **DB schema**: Sin cambios
- **Dependencies**: No se requieren nuevas dependencias. Se utilizan exports ya disponibles en `@livekit/components-react` (v2.9.20) que ya esta instalado: `useMediaDeviceSelect` hook.
- **APIs backend**: Sin cambios
- **Config/Infra**: Sin cambios

## Non-goals

- Selector de dispositivos para viewers (los viewers no publican video/audio salvo cuando son promovidos, y en ese caso el microfono se activa automaticamente con el dispositivo por defecto).
- Selector de dispositivos para screen share (el OS proporciona su propio picker nativo via `getDisplayMedia()`).
- Pre-configuracion de dispositivos antes de conectar al stream (pre-join device picker).
- Persistencia de preferencias de dispositivo entre sesiones (por ejemplo en localStorage).
