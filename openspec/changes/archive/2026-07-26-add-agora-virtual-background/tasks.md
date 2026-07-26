## 1. Dependencia y catálogo de fondos

- [x] 1.1 Añadir `agora-extension-virtual-background` (^2.1.0) a `client/package.json` y ejecutar `npm install` en `client/`; verificar que no reclama peers (el proyecto ya tiene `agora-rtc-sdk-ng@^4.24.6` y el rango es `>=4.15.0`)
- [x] 1.2 Crear `client/public/fondos-virtuales/README.md` con los requisitos de las imágenes: 16:9 (recomendado 1280×720), producto ancho×alto par, JPG o WEBP, < ~300 KB, nombre en kebab-case sin acentos
- [x] 1.3 Crear `client/lib/virtualBackgrounds.js` exportando `VIRTUAL_BACKGROUNDS` como lista vacía de entradas `{ file, label }`, con un comentario de cabecera explicando el procedimiento para añadir una imagen (dejar el fichero en la carpeta + añadir la línea aquí)
- [x] 1.4 Añadir a `client/lib/constants.js` las constantes del efecto: clave de `localStorage` (`kuadrat.agora.videoEffect`), grados de desenfoque suave (1) e intenso (3) y ruta base del catálogo (`/fondos-virtuales/`)

## 2. Ciclo de vida del track en `useAgoraRoom`

- [x] 2.1 **[Riesgo: infraestructura compartida]** En `client/hooks/useAgoraRoom.js`, exponer `camTrackVersion` (contador `useState`) que se incremente cada vez que el track de cámara se **crea** en `setCameraEnabled(true)` y cada vez que se **destruye** (en `becomeAudience()` y en el teardown del `useEffect` de join/leave)
- [x] 2.2 **[Riesgo: infraestructura compartida]** Verificar por regresión manual que el contador no introduce re-renders indeseados: encender/apagar cámara, compartir y dejar de compartir pantalla, y promoción/degradación de rol siguen comportándose igual que antes del cambio

## 3. Hook de efectos

- [x] 3.1 Crear `client/hooks/useAgoraVideoEffect.js` con la carga perezosa: `import()` dinámico de la extensión disparado por la primera apertura del panel, cacheado en un singleton de módulo, con estados `loading` / `ready` / `error` / `unsupported`
- [x] 3.2 Implementar en el hook la detección de móvil (síncrona, sin dependencias: `navigator.userAgentData?.mobile` con fallback a `matchMedia('(pointer: coarse)')`) y la evaluación de `extension.checkCompatibility()` tras la carga
- [x] 3.3 Implementar el ciclo de vida del procesador: `createProcessor()` → `init()` → `pipe(processor).pipe(track.processorDestination)`, con `setOptions()` **siempre antes** de `enable()`, `disable()` para "Ninguno" conservando el procesador inicializado, y `unpipe()` + `release()` al destruirse el track o desmontar el hook
- [x] 3.4 Implementar la reconciliación con `camTrackVersion`: aplicar el efecto vigente al aparecer un track nuevo y liberar el procesador al desaparecer, en un único `useEffect`
- [x] 3.5 Implementar la carga de la imagen de fondo: `new Image()` apuntando a `/fondos-virtuales/<file>` (fichero original, no la URL de `next/image`), esperar a `decode()`/`onload` antes de `setOptions({ type: 'img', source, fit: 'cover' })`, y manejar el fallo de carga devolviendo un error en es-ES sin romper la publicación
- [x] 3.6 Implementar la persistencia: lectura al montar con validación de que el `file` sigue en el manifiesto (degradar a "Ninguno" si no), escritura al seleccionar, todo envuelto en `try/catch` para tolerar almacenamiento no disponible
- [x] 3.7 Enganchar `processor.onoverload`: desactivar el efecto, reflejar "Ninguno" como activo y exponer un mensaje de aviso en es-ES, **sin** sobrescribir la preferencia guardada

## 4. Panel de efectos

- [x] 4.1 Crear `client/components/events/VideoEffectsMenu.js` como componente presentacional siguiendo el patrón de `client/components/events/DeviceDropdown.js`: botón chevron + panel, cierre por clic fuera y Escape, opción activa con check
- [x] 4.2 Renderizar en el panel, en orden: "Ninguno", "Desenfoque suave", "Desenfoque intenso" y la rejilla de miniaturas del catálogo con su etiqueta; ocultar la sección de imágenes cuando el manifiesto esté vacío
- [x] 4.3 Renderizar las miniaturas con `<Image>` de `next/image` con `width` y `height` explícitos (spec `nextjs-image-usage`); no usar `<img>`
- [x] 4.4 Renderizar los estados no nominales del panel con textos en es-ES: cargando la extensión (sin aceptar selecciones), error de carga y navegador no compatible

## 5. Montaje en la sala Agora

- [x] 5.1 En `client/components/AgoraLiveRoom.js`, montar el control "Efectos" en `AgoraHostControls` junto al interruptor de Cámara, usando `useAgoraVideoEffect` con el mismo patrón con que ya se usa `useAgoraDevices`, y deshabilitarlo mientras `room.camEnabled` sea `false`
- [x] 5.2 Montar el mismo control en `MeetingSelfControls` con idéntico comportamiento
- [x] 5.3 Integrar el estado `openDeviceMenu` existente para que abrir el panel de efectos cierre los desplegables de dispositivo y viceversa (un único menú abierto a la vez)
- [x] 5.4 Mostrar los avisos del hook (sobrecarga, fallo de carga, imagen ausente) en el mismo hueco de mensajes que ya usa `deviceError` en ambos componentes
- [x] 5.5 Confirmar que no se añade ningún control en la rama de asistentes de `broadcast` (`BroadcastArea`), que no publican vídeo

## 6. Verificación

- [x] 6.1 **Verificación manual crítica**: comprobar si el efecto sobrevive a `track.setDevice()` cambiando de webcam con un efecto activo. Si se pierde, re-aplicar el efecto tras `selectCamera` en `AgoraHostControls` y `MeetingSelfControls` (única incógnita abierta del diseño)
- [x] 6.2 Verificar en broadcast: host aplica desenfoque → los asistentes ven el vídeo procesado; el host comparte pantalla → la pantalla sale sin efecto; deja de compartir → la cámara vuelve con el efecto
- [x] 6.3 Verificar en meeting: dos asistentes con efectos distintos se ven correctamente entre sí y en el modo teatro; apagar y encender la cámara conserva el efecto sin estado de carga
- [x] 6.4 Verificar la persistencia: elegir un efecto, recargar la página, entrar en otro evento y comprobar que se reaplica al encender la cámara
- [x] 6.5 Verificar la degradación: abrir la sala desde un móvil (control ausente) y comprobar en escritorio que quien nunca abre el panel no descarga el bundle de la extensión (pestaña Network)
- [x] 6.6 Verificar que no aparecen violaciones de CSP en consola al inicializar el WASM, confirmando que `client/next.config.js` no necesita cambios
- [x] 6.7 Añadir en el comentario del CSP de `client/next.config.js` una nota de que `'unsafe-eval'` en `script-src` es además requisito para compilar el WASM del fondo virtual (solo comentario, sin cambiar el valor de la directiva)
- [x] 6.8 Ejecutar el lint del cliente y comprobar que no hay `<img>` nuevos ni `console.log` en el código añadido
      > El script `npm run lint` está roto en todo el repo desde Next 16 (`next lint` se eliminó) y no existe `eslint.config.js`, así que no es ejecutable — problema previo, ajeno a este cambio. En su lugar se verificó: `next build` limpio (sin errores ni warnings), cero `<img>` y cero `console.log` en el código añadido (solo `console.warn`, como el resto de los hooks Agora).
