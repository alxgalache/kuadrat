## 1. Frontend: Componente DeviceSelector

- [x] 1.1 Crear el sub-componente `DeviceSelector` dentro de `client/components/EventLiveRoom.js`. El componente recibe `kind` ('audioinput' | 'videoinput' | 'audiooutput'), `isOpen` (boolean), y `onToggle` (callback). Usa internamente `useMediaDeviceSelect({ kind, requestPermissions: true })` importado de `@livekit/components-react`. Renderiza: un boton chevron (SVG flecha abajo, `h-4 w-4 text-gray-500 hover:text-gray-700`, rotado 180deg cuando abierto) y, condicionalmente, un dropdown absolutamente posicionado (`bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] max-w-[300px] py-1 z-10`).

- [x] 1.2 Dentro del dropdown de `DeviceSelector`, renderizar la lista de dispositivos: cada item es un `<button>` con `px-3 py-2 text-sm w-full text-left hover:bg-gray-50`. El dispositivo activo (cuyo `deviceId === activeDeviceId`) muestra un checkmark SVG (`h-4 w-4 text-gray-900`) a la izquierda y texto en `font-medium text-gray-900`. Los inactivos muestran espacio vacio equivalente al ancho del check y texto en `text-gray-700`. Si `device.label` es vacio, mostrar "Dispositivo {index + 1}" como fallback. Si `devices.length === 0`, mostrar "No se encontraron dispositivos" en `text-gray-400 italic`.

- [x] 1.3 Implementar la logica de seleccion: al hacer click en un dispositivo, llamar a `setActiveMediaDevice(device.deviceId)` dentro de un try/catch. En caso de error, propagar al padre via una prop `onDeviceError` para que `HostControls` lo muestre en el mensaje `deviceError` existente. Cerrar el dropdown tras la seleccion (invocando `onToggle`).

- [x] 1.4 Implementar cierre del dropdown: (a) click-outside via `useEffect` con listener `mousedown` en `document` que comprueba si el target esta fuera del ref del componente, (b) tecla Escape via listener `keydown` en `document`, (c) cierre automatico al seleccionar dispositivo. Limpiar ambos listeners en el cleanup del effect.

## 2. Frontend: Integracion en HostControls

- [x] 2.1 Agregar import de `useMediaDeviceSelect` desde `@livekit/components-react` en la seccion de imports de `EventLiveRoom.js` (linea 4).

- [x] 2.2 Agregar estado `openDeviceMenu` en `HostControls` para controlar que solo un dropdown este abierto a la vez. Tipo: `useState(null)` donde el valor es `'audioinput'` | `'videoinput'` | `'audiooutput'` | `null`. Pasar `isOpen={openDeviceMenu === kind}` y `onToggle` a cada `DeviceSelector`.

- [x] 2.3 Modificar el layout del control de Microfono (linea ~454): agregar `relative` al contenedor div, y despues del `<ToggleSwitch />` insertar `<DeviceSelector kind="audioinput" isOpen={openDeviceMenu === 'audioinput'} onToggle={...} onDeviceError={...} />`.

- [x] 2.4 Modificar el layout del control de Camara (linea ~458): agregar `relative` al contenedor div, y despues del `<ToggleSwitch />` insertar `<DeviceSelector kind="videoinput" isOpen={openDeviceMenu === 'videoinput'} onToggle={...} onDeviceError={...} />`.

- [x] 2.5 Agregar el control de Altavoces entre Camara y Pantalla: un nuevo `<div className="relative flex items-center gap-x-2">` con label "Altavoces" y `<DeviceSelector kind="audiooutput" ... />`. Este control NO tiene `<ToggleSwitch />`. Solo renderizar este bloque si el `DeviceSelector` de audiooutput reporta dispositivos disponibles (pasar la visibilidad como logica interna del componente o como prop de retorno).

- [x] 2.6 Verificar que el control de Pantalla (screen share) NO recibe DeviceSelector — permanece sin cambios.

## 3. Frontend: Manejo de audiooutput con degradacion elegante

- [x] 3.1 En el `DeviceSelector`, cuando `kind === 'audiooutput'` y `devices.length === 0` (navegador sin soporte para `setSinkId`), el componente debe retornar `null` para no renderizar nada. Esto hace que el bloque "Altavoces" en `HostControls` desaparezca automaticamente en navegadores sin soporte.

## 4. Verificacion manual

- [x] 4.1 Verificar que al hacer click en el chevron de Microfono se despliega un dropdown con los microfonos disponibles, y que al seleccionar uno el audio del host cambia sin recargar la pagina.
- [x] 4.2 Verificar que al hacer click en el chevron de Camara se despliega un dropdown con las camaras disponibles, y que al seleccionar una el video del host cambia sin recargar la pagina.
- [x] 4.3 Verificar que el selector de Altavoces aparece (en Chrome/Edge) y permite cambiar la salida de audio.
- [x] 4.4 Verificar que conectar/desconectar un dispositivo USB durante el stream actualiza la lista en el dropdown.
- [x] 4.5 Verificar que solo un dropdown puede estar abierto a la vez, y que se cierra con click-outside y Escape.
- [x] 4.6 Verificar que el control de Pantalla no muestra selector de dispositivos.
