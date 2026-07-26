## Context

Las salas Agora viven en `client/components/AgoraLiveRoom.js` sobre dos hooks: `useAgoraRoom.js` (ciclo de vida RTC: join/leave, tracks locales, publicación) y `useAgoraDevices.js` (enumeración y cambio en caliente de dispositivos). El track de cámara local se crea **perezosamente en el primer encendido** y a partir de ahí **se conserva**: apagar la cámara hace `setEnabled(false)`, no `close()`. El track solo se destruye en `becomeAudience()` y en el teardown del efecto de join/leave.

Solo hay dos superficies con control de cámara, ambas de montaje estable durante toda la sesión:

| Componente | Quién lo ve | Modos |
|---|---|---|
| `AgoraHostControls` | host | broadcast + meeting |
| `MeetingSelfControls` | asistente | meeting |

En broadcast los asistentes no publican vídeo (solo audio tras ser promovidos) y no tienen UI de cámara, por lo que quedan fuera del alcance de forma natural.

La extensión oficial `agora-extension-virtual-background@2.1.0` se inyecta en el pipeline del track local: `track.pipe(processor).pipe(track.processorDestination)`. Se ha inspeccionado el paquete: **el WASM viaja embebido en base64 dentro del propio bundle JS de 2,1 MB**, no se descarga de ningún CDN y `init()` no necesita el parámetro `wasmDir`. Esto tiene dos consecuencias directas: no hay que tocar `connect-src` en el CSP, y el peso obliga a carga perezosa.

## Goals / Non-Goals

**Goals:**
- Desenfoque de fondo en dos intensidades y sustitución del fondo por una imagen de un catálogo del repo, para el host (broadcast y meeting) y los asistentes de meeting.
- Un único punto de control en la barra inferior, coherente con el selector de dispositivos que ya existe.
- Que la preferencia sobreviva entre salas y sesiones sin tocar backend ni base de datos.
- Degradación limpia: navegador incompatible, móvil, catálogo vacío o equipo sobrecargado no deben romper la sala.
- Coste cero en el bundle para quien no use la función.

**Non-Goals:**
- Fondos de color sólido y de vídeo (la extensión los soporta; se omiten por minimalismo y coste de CPU respectivamente).
- Fondos subidos por el usuario o gestionados desde el admin: el catálogo es estático y se versiona en el repo.
- Efectos en LiveKit (`EventLiveRoom.js`) — queda intacto.
- Aplicar efectos a la pantalla compartida o a la pizarra.
- Que los demás participantes sepan qué efecto usa cada uno (no hay señalización nueva).
- Soporte en navegadores móviles.

## Decisions

### D1 — Extensión oficial de Agora, no una implementación propia

**Elegido:** `agora-extension-virtual-background@2.1.0`.
**Alternativa descartada:** MediaPipe Selfie Segmentation + composición en `<canvas>` y `captureStream()`.

La extensión se integra en el pipeline nativo del SDK, así que el track publicado ya sale procesado sin tocar la lógica de publicación, sin desincronizar el `volume-indicator` ni el swap de pantalla. La alternativa manual exigiría reimplementar el bucle de render, gestionar el `requestAnimationFrame` en pestañas de fondo y volver a envolver el track en `createCustomVideoTrack`, con más superficie de fallo y sin ganar nada. El peer range `>=4.15.0` es compatible con el `agora-rtc-sdk-ng@^4.24.6` actual.

### D2 — Carga perezosa con `import()` dinámico al abrir el menú

2,1 MB es más que todo el resto del bundle de la sala. El módulo se importa la primera vez que el usuario **abre** el menú de efectos (no al montar los controles, no al encender la cámara), y se cachea en un módulo-singleton para el resto de la sesión. Mientras carga, el menú muestra un estado de carga en es-ES.

Consecuencia: la comprobación `extension.checkCompatibility()` no puede correr antes de importar. Para no mostrar un control que luego resulte incompatible, el gate previo es la **detección de móvil** (síncrona, sin coste); `checkCompatibility()` se evalúa tras la carga y, si falla, el panel sustituye la lista de efectos por un mensaje explicativo.

### D3 — El pipeline se re-establece a partir de un contador de versión del track

El problema real es que `camTrackRef` es un `ref`: cuando `setCameraEnabled(true)` crea un track nuevo, nada re-renderiza a quien deba re-pipear el procesador. Un procesador piped a un track cerrado es basura silenciosa y el efecto no reaparecería tras `becomeAudience()` → volver a hablar.

**Elegido:** `useAgoraRoom` expone un `camTrackVersion` (entero de `useState`) que se incrementa cada vez que el track de cámara **se crea o se destruye**. `useAgoraVideoEffect` depende de él y reconcilia: si hay track y hay efecto activo → `pipe` + `setOptions` + `enable`; si no hay track → `release`.

**Alternativas descartadas:**
- Llamar a `applyEffect()` a mano después de cada `await room.setCameraEnabled(true, ...)` en los dos componentes de control: funciona hoy, pero deja la corrección dependiendo de que nadie añada un tercer call site.
- Exponer el track como estado en lugar de ref: obligaría a tocar todos los puntos de render de vídeo (`BroadcastArea`, `MeetingArea`, `TheaterMeetingTile`, `MeetingTile`) que hoy leen `camTrackRef.current`.

Se añade además una liberación explícita del procesador en `becomeAudience()` y en el teardown del efecto de join/leave, donde hoy se hace `close()` del track sin saber que hay un procesador colgando.

### D4 — El hook de efectos vive dentro de cada componente de control

`useAgoraVideoEffect` se llama dentro de `AgoraHostControls` y de `MeetingSelfControls`, igual que ya se hace con `useAgoraDevices`. Ambos son de montaje estable (están fuera del `TheaterShell` y no se desmontan al abrir el teatro ni al cambiar el layout destacado), y nunca coexisten: el render es `isHost ? <AgoraHostControls/> : <MeetingSelfControls/>`. Se evita así prop-drilling desde `AgoraLiveRoom` y se mantiene la simetría con el hook de dispositivos.

### D5 — Compartir pantalla y cambio de cámara: qué toca y qué no

- **Compartir pantalla**: `startScreenShare()` des-publica la cámara pero **no la cierra** (`setEnabled(false)`), así que el procesador sigue enganchado y el efecto reaparece solo al volver de la pantalla. La pantalla compartida nunca lleva efecto. **No requiere código nuevo.**
- **Cambio de cámara en caliente**: `track.setDevice()` sustituye el `MediaStreamTrack` subyacente conservando el objeto `LocalVideoTrack` y su cadena de procesadores, por lo que el efecto debería sobrevivir. Es un comportamiento no garantizado por la documentación: se verifica en implementación y, si se pierde, se re-aplica tras `selectCamera` (ver Riesgos).

### D6 — Miniaturas con `next/image`, fuente del procesador con `new Image()`

`setOptions({ type: 'img', source })` exige un `HTMLImageElement` real. `next/image` renderiza un `<img>` cuyo `src` apunta a `/_next/image?url=...&w=...` (reescalado y recomprimido) y no expone la instancia DOM de forma apta para esto.

Separación explícita:
- **Menú**: `<Image>` de `next/image` con `width`/`height` fijos para las miniaturas, cumpliendo la spec `nextjs-image-usage`.
- **Procesador**: un `new Image()` apuntando al fichero original `/fondos-virtuales/<file>`, esperando a `decode()` (o al `onload`) **antes** de llamar a `setOptions`. Mismo origen, así que no hace falta `crossOrigin`.

Se usa `fit: 'cover'` para que el fondo llene el encuadre sin deformarse, coherente con el `fit="cover"` que ya usan los tiles de meeting.

### D7 — Catálogo estático: carpeta + manifiesto

Los ficheros van a `client/public/fondos-virtuales/` y se declaran uno a uno en `client/lib/virtualBackgrounds.js` como `{ file, label }`. El manifiesto da etiquetas en es-ES (que un nombre de fichero no puede garantizar) y orden explícito, a cambio de una línea de código por imagen. Se descartó el escaneo automático en `prebuild`: añade maquinaria de build y pierde control sobre etiqueta y orden, para ahorrar una línea.

**Requisitos de las imágenes** (documentados en un `README.md` dentro de la carpeta):
- Relación 16:9, recomendado **1280×720**. El producto ancho×alto debe ser **par**: la propia documentación de Agora advierte del error `texture bound to texture unit 2 is not renderable` con dimensiones incompatibles.
- JPG o WEBP, por debajo de ~300 KB (se sirven a todos los participantes que abran el menú).
- Nombre en kebab-case sin acentos (`galeria-blanca.jpg`); la etiqueta acentuada va en el manifiesto.

Con el manifiesto vacío —el estado en el que se mergea este cambio— el menú muestra solo los desenfoques, sin hueco ni error.

### D8 — Persistencia en `localStorage`, con validación al leer

Clave `kuadrat.agora.videoEffect`, valor JSON `{ type: 'none' | 'blur' | 'img', blurDegree?, file? }`. Al leer se valida que el `file` siga existiendo en el manifiesto: si se retiró una imagen del repo, se degrada a `none` en vez de romper. Lectura y escritura envueltas en `try/catch` (Safari en modo privado puede lanzar al escribir).

Se descarta persistir en base de datos por usuario: obligaría a endpoint, migración y sesión autenticada, y los asistentes de eventos pueden entrar como invitados sin cuenta.

### D9 — Gate de compatibilidad: móvil primero, `checkCompatibility()` después

El control **no se renderiza** en dispositivos móviles. Detección best-effort sin dependencias nuevas: `navigator.userAgentData?.mobile` cuando existe (Chromium) y, si no, `matchMedia('(pointer: coarse)').matches` combinado con el ancho de viewport. En escritorio se renderiza siempre y es `checkCompatibility()`, ya con el módulo cargado, quien decide si se ofrecen efectos o un mensaje de no compatible.

Se acepta que Safari de escritorio rinda peor de lo ideal (documentado por Agora): se ofrece igualmente y `onoverload` cubre el caso malo.

### D10 — Sobrecarga: desactivar el efecto pero conservar la preferencia

`processor.onoverload` desactiva el efecto (`disable()`), lo refleja en la UI y muestra un aviso en es-ES en el mismo hueco de mensajes que ya usan los errores de dispositivo. **La preferencia guardada no se sobrescribe**: si la sobrecarga fue puntual (otra app comiéndose la CPU), el usuario no pierde su elección en la siguiente sala. Sin esto, la alternativa es dejar que el vídeo se congele, que es peor y menos diagnosticable.

### D11 — Orden de llamadas al procesador

Siempre `setOptions()` **antes** de `enable()`: llamar `enable()` en frío hace que el SDK aplique por defecto un desenfoque de grado 1, que no es lo que el usuario pidió. Con el procesador ya habilitado, cambiar de efecto es solo `setOptions()`; volver a "Ninguno" es `disable()` (se mantiene el procesador inicializado para que reactivar sea instantáneo). `release()` queda reservado para la destrucción del track y la salida de la sala.

## Risks / Trade-offs

- **2,1 MB de bundle** → `import()` dinámico disparado al abrir el menú; quien no usa la función no lo descarga nunca. Aceptamos un retardo perceptible la primera vez, cubierto con estado de carga.
- **Coste de CPU** (Agora pide i5 de 4 núcleos y 8 GB) → gate de móvil + `onoverload` + el efecto es opt-in y off por defecto.
- **`setDevice()` podría romper el pipeline de procesadores** (no garantizado por la documentación) → tarea de verificación manual explícita en `tasks.md`; si se pierde, re-aplicar el efecto tras `selectCamera` en los dos componentes de control.
- **Firefox congela el vídeo al pasar la pestaña a segundo plano con la extensión activa** (limitación documentada por Agora) → no mitigable desde nuestro código; queda como limitación conocida.
- **Dependencia implícita del CSP**: compilar WASM exige `'unsafe-eval'` (o `'wasm-unsafe-eval'`) en `script-src`. Hoy está presente por otros motivos; si alguien endurece esa directiva en el futuro, esta función deja de funcionar. Se anota en el comentario del CSP de `client/next.config.js` sin cambiar su valor.
- **El procesador es un recurso con estado ligado al track** → toda la reconciliación pasa por un único `useEffect` sobre `camTrackVersion`, y se libera en `becomeAudience()`, en el teardown de la sala y al desmontar el hook.
- **Retrato incompleto**: la extensión rinde mal con varias personas delante de la cámara (limitación de la segmentación). Aceptado: el caso de uso es una persona por webcam.

## Migration Plan

Cambio puramente aditivo en el frontend: sin migración de datos, sin nuevas variables de entorno, sin cambios de esquema ni de CSP. El despliegue es el habitual (`npm install` en `client/` recoge la nueva dependencia; nada que añadir a los Dockerfiles ni a los `docker-compose.*.yml`, porque no hay `NEXT_PUBLIC_*` nuevo).

Se mergea con `client/public/fondos-virtuales/` conteniendo solo su `README.md` y el manifiesto vacío: la función queda activa con desenfoque, y los fondos de imagen aparecen cuando se suban las imágenes y se declaren en el manifiesto, sin nuevo despliegue de código más allá del build.

**Rollback:** revertir el commit. No queda estado residual salvo la clave de `localStorage`, que es inerte.

## Open Questions

- ¿Sobrevive el efecto a `track.setDevice()`? Resuelto en implementación con verificación manual (ver Riesgos). No bloquea el diseño: el plan B —re-aplicar tras `selectCamera`— está acotado a dos call sites.
