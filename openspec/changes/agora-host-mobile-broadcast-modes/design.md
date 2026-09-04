## Context

`AgoraLiveRoom.js` (1744 líneas) resuelve dos modos de interacción (`broadcast` y `meeting`) con un árbol pensado para escritorio: `BroadcastArea` apila vídeo 16:9 a ancho completo, rejilla de participantes y `AgoraHostControls`; a la derecha, un chat de `lg:w-80`. `AgoraHostControls` instancia `useAgoraDevices` y `useAgoraVideoEffect` y dispone los controles en una fila `flex-wrap` con `ToggleSwitch` de 44 × 24 px y `DeviceDropdown` posicionado `top-full`.

En un móvil horizontal ese árbol se rompe por el alto, no por el ancho. El presupuesto real medido para el caso de uso:

| Situación | Alto CSS aproximado |
|---|---|
| Chrome Android horizontal, barra de direcciones visible | **~300 px** |
| Chrome Android horizontal, barra retraída | ~340 px |
| Pantalla completa nativa | ~390–430 px |
| Móvil horizontal pequeño (peor caso soportado) | ~280 px |

Con 300 px, el vídeo 16:9 a ancho completo ya consume más alto del disponible y todo lo demás cae bajo el pliegue. Los desplegables de dispositivo se abren hacia abajo desde controles que están al final de la página: quedan fuera de la pantalla.

Restricciones que el diseño hereda del código existente y **no puede romper**:

- **La pizarra no puede cambiar de posición en el árbol de React.** Ya está documentado en `TheaterShell`: moverla destruye y rejoinea la sala de fastboard y se pierde la sesión con permiso de escritura.
- **`AgoraVideo` hace `track.play(el)` al montar y `track.stop()` al desmontar.** En una pista **local** de Agora, `stop()` detiene solo la reproducción local: la publicación continúa. Es lo que permite mover la previsualización entre modos sin cortar la emisión, y hay que verificarlo en dispositivo antes de dar el modo por bueno.
- **`useEventRoomSocket` vive en `AgoraLiveRoom`**, por encima de cualquier conmutador de vista, así que presencia y chat siguen llegando aunque sus paneles no estén montados.
- **Todo contexto del árbol lee `localStorage` desde un efecto, nunca desde el inicializador de `useState`.** Es la propiedad que hizo posible activar el SSR sin discrepancias de hidratación, y la restauración del modo de vista debe respetarla.

## Goals / Non-Goals

**Goals:**

- Que el host pueda operar micrófono, cámara, altavoz, pantalla y fin de emisión desde un móvil en horizontal **sin scroll y con áreas táctiles de ≥48 px**.
- Que el error más caro del montaje —emitir con el micrófono equivocado— sea visible antes de empezar.
- Recuperar el espacio de la barra de direcciones y evitar que la pantalla se bloquee.
- Que un evento sin el checkbox marcado se comporte **byte a byte** como hoy.

**Non-Goals:**

- LiveKit (`EventLiveRoom.js`) no gana modos de vista; solo monta el wake lock.
- `interaction_mode='meeting'` queda fuera: su rejilla de cámaras es otro problema de distribución.
- Los asistentes no cambian en nada.
- No se rediseña la vista `full` de escritorio.
- No se persigue soporte de iOS Safari: el dispositivo objetivo es Android y la pantalla completa de elemento no existe en iOS.

## Decisions

### 1. Un hook de controles, dos presentaciones

`AgoraHostControls` mezcla hoy lógica y presentación. Con dos superficies de control, copiarla sería crear dos verdades que pueden divergir en silencio —el mismo error que documenta `zoneResolver` y que costó la caída del 16/08/2026— y, peor, reinstanciar `useAgoraVideoEffect` en cada cambio de modo reiniciaría el procesador de fondos virtuales (2,1 MB de WASM) y `useAgoraDevices` volvería a enumerar.

Se extrae **`useHostMediaControls`**, que envuelve `useAgoraDevices`, `useAgoraVideoEffect`, las alternancias de micro/cámara/pantalla con su manejo de errores en es-ES, y el fin de evento. Se instancia **una sola vez en `AgoraLiveRoom`**, con un parámetro `enabled: isHost` (nunca condicionalmente: las reglas de los hooks lo prohíben), y se pasa hacia abajo. `AgoraHostControls` y `HostConsole` lo consumen.

*Alternativa descartada:* mantener `AgoraHostControls` como está y montar la consola como componente hermano con sus propios hooks. Más corto de escribir, pero dos enumeraciones de dispositivos simultáneas compitiendo por los mismos `deviceId` y dos procesadores de vídeo sobre la misma pista.

### 2. La consola es una superposición `fixed inset-0`, no una reestructuración de la página

Escapar del navbar, el pie, el banner de cookies y el `max-w-7xl` de `EventDetail` con media queries obligaría a tocar el layout raíz. Una superposición `fixed inset-0 z-[60]` los sortea sin tocar nada, y es exactamente el patrón que `TheaterShell` ya usa y que está probado en esta base de código.

El envoltorio de la consola SHALL montarse **siempre** alrededor del medio destacado, con la `className` cambiando según el modo —el mismo truco que `TheaterShell` documenta— para que la pizarra nunca cambie de posición en el árbol.

### 3. Prioridad a los controles, no al vídeo

El vídeo ocupa ~40 % del ancho, no la mitad. Con 300 px de alto, un 16:9 al 40 % de 900 px mide 360 × 203 px: sobra para verificar el encuadre, que es todo lo que hace falta —la posición del trípode se ajusta antes de empezar. Los 540 px restantes dan tarjetas de ~250 × 90 px en rejilla 2 × 2, muy por encima del mínimo táctil. A la inversa (vídeo al 50 % en una pantalla de 640 px) las tarjetas bajarían a ~40 px de alto, por debajo del umbral, justo en el dispositivo más difícil.

Presupuesto vertical de la consola: cabecera 40 px + dos filas de tarjetas ~90 px + separaciones + pie 44 px ≈ **250 px**, dentro de los 300 px del peor caso habitual. Por debajo de eso, **solo la columna de tarjetas** recibe `overflow-y-auto`; la cabecera, el vídeo y «Finalizar stream» permanecen fijos. La superposición nunca hace scroll como página.

### 4. El selector de fuente es un panel completo, no el desplegable actual

`DeviceDropdown` se posiciona `top-full` bajo su disparador. En 300 px de alto, abierto desde una tarjeta de la segunda fila, la lista cae fuera de la pantalla. La consola usa **`MobileDevicePicker`**: un panel que ocupa la superposición, con filas de ≥48 px, la fuente activa marcada, cierre explícito y por toque fuera. Reutiliza los datos y los `select*` de `useAgoraDevices`, no su presentación.

### 5. `preview` se incluye, y sirve para el trípode

El tercer modo (vídeo a sangre) no es decoración: con el teléfono a 185 cm de altura, comprobar el encuadre exige ver la imagen lo más grande posible desde lejos. Un único botón translúcido para volver, y nada más.

### 6. El medidor de nivel de micrófono

Es el añadido de mayor valor por línea escrita para este montaje concreto. `LocalAudioTrack.getVolumeLevel()` devuelve 0–1; un sondeo a ~10 Hz mientras la consola está abierta basta. Con el micrófono apagado el medidor se muestra **en reposo, no oculto**: un hueco vacío se lee igual que un nivel cero, y son dos situaciones distintas.

### 7. `fullscreenchange` NO cierra el modo

`TheaterShell` cierra la vista cuando se pierde la pantalla completa. Aquí ese comportamiento expulsaría al operador de su consola en mitad de una retransmisión por un gesto accidental del sistema. La consola **escucha** el evento para mantener sincronizado el estado del botón, pero no cambia de modo: muestra un control para volver a entrar. Es una divergencia deliberada respecto al componente vecino y hay que dejarla escrita donde se lea al editar.

`screen.orientation.lock('landscape')` se intenta **después** de que la pantalla completa se resuelva: en Android el bloqueo de orientación solo se concede dentro de pantalla completa. Los dos fallos se ignoran en silencio.

### 8. El wake lock no se ata al flag

Que la pantalla se apague a mitad de evento es un defecto de la vista de host, no una carencia de la consola móvil. `useScreenWakeLock` se monta en toda vista de host en directo, en Agora y en LiveKit. Cinco pasos: detectar la capacidad, pedir el bloqueo con el documento visible, guardar el `WakeLockSentinel`, escuchar su `release`, y volver a pedirlo en `visibilitychange` → visible. Sin bloqueo no hay forma de liberarlo a mano, y el navegador lo suelta solo al ocultarse la pestaña, así que el sentinel debe guardarse en una ref.

Requiere contexto seguro (HTTPS o `localhost`). En preproducción servida por HTTP plano la petición se rechaza; se captura y no se avisa. **No se reporta a Sentry**: un rechazo previsible del navegador no es una excepción de código de aplicación —la misma categoría de error que documenta el hallazgo de la prueba de carga.

### 9. La columna, y el ritual de cuatro sitios que sí aplica

`events.allow_mobile_host_console` INTEGER `NOT NULL DEFAULT 0`, en el `CREATE TABLE` **y** en un `safeAlter` —las bases existentes no se recrean, y `interaction_mode` sentó ese precedente exacto tres líneas más arriba—. `DEFAULT 0` sin backfill: los eventos existentes quedan sin consola, que es lo correcto porque nadie la ha probado todavía en ellos.

El camino de escritura toca cuatro sitios y omitir cualquiera deja el checkbox **guardando en silencio nada**: los dos esquemas Zod (`createEventSchema` y `updateEventSchema`), el `INSERT` de `eventService.createEvent`, y el array `allowedFields` de `eventService.updateEvent`. El camino de lectura no toca nada: `getEventBySlug` hace `SELECT e.*`.

*Nota:* esto **no** es el ritual de `NEXT_PUBLIC_*`. El flag viaja en la respuesta del evento, no en el bundle, así que no hay `Dockerfile` ni `build.args` que tocar.

### 10. El modo se persiste, pero la sala abre en `full`

La preferencia se guarda en `localStorage` bajo `AGORA_HOST_VIEW_MODE_STORAGE_KEY` (mismo patrón que `AGORA_VIDEO_EFFECT_STORAGE_KEY`) y se restaura **desde un efecto**, nunca desde un inicializador de `useState`. La pantalla completa no se restaura: exige un gesto del usuario, y pedirla sin él fallaría de todos modos.

### 11. El conmutador no se limita por viewport

Con el flag activo, el selector de modo se ofrece en cualquier tamaño de pantalla. Restringirlo a `max-width` haría imposible probar la consola desde el escritorio antes de un evento, que es precisamente cuando conviene probarla. La distribución está optimizada para horizontal, pero no se esconde en otros tamaños.

### 12. Respuesta al problema de la barra de direcciones

No existe ninguna API que oculte permanentemente la barra de direcciones en una pestaña normal de Chrome; los trucos de `window.scrollTo` de hace una década ya no funcionan. Las opciones reales, en orden de eficacia:

1. **Pantalla completa nativa** (lo que implementa este cambio). Recupera la barra de direcciones y la barra de navegación del sistema. Exige un gesto del usuario, y el usuario puede salirse.
2. **Instalar el sitio desde «Añadir a pantalla de inicio».** `client/app/manifest.json` ya declara `display: standalone`, así que **esto funciona hoy sin escribir una línea**: abierto desde el icono, el sitio no tiene barra de direcciones en absoluto y no hay gesto que la haga aparecer. Es la opción más sólida para un evento planificado y va a la documentación operativa.
3. **Dimensionar con `dvh`** para que el diseño no salte cuando la barra entra y sale, y **no hacer scrollable el documento**, que es lo que dispara su reaparición. Ambas cosas las hace la superposición por construcción.

Las tres son compatibles y se aplican juntas.

## Risks / Trade-offs

- **[`track.stop()` en la previsualización local corta la emisión]** → Se apoya en que `stop()` de una pista local de Agora detiene solo la reproducción local. Es la suposición central del cambio de modo. Verificación obligatoria en dispositivo con un segundo cliente conectado antes de dar la tarea por cerrada; si no se sostiene, la alternativa es mantener montada una única `AgoraVideo` y mover su contenedor con CSS.
- **[Compartir pantalla no funciona en Chrome para Android]** → `getDisplayMedia` es, según la matriz de compatibilidad, «dependiente del dispositivo y la versión, no fiable» en Android. Se detecta por capacidad y la tarjeta se muestra deshabilitada con su motivo; si existe pero falla, el error se pinta dentro de la tarjeta. No se oculta el control: un hueco vacío parece un fallo de carga.
- **[La selección de altavoz no existe en Android]** → `setSinkId` y la enumeración de `audiooutput` son de escritorio. La tarjeta aparece deshabilitada explicando que la salida la gestiona el sistema. Para este montaje es irrelevante —monitorizar el audio en el propio teléfono provocaría acoplamiento—, pero el control se pidió y debe estar presente y explicado.
- **[La pizarra pierde la sesión al cambiar de modo]** → Se conjura con el envoltorio siempre montado y la `className` cambiante, el patrón que `TheaterShell` ya documenta. Es el riesgo más caro del cambio y debe probarse explícitamente: activar pizarra, ir a consola, volver, comprobar que sigue con permiso de escritura.
- **[El cliente no tiene runner de tests]** → La distribución, el medidor y la pantalla completa se verifican a mano. Es el mismo punto ciego que registra la sección de `ProductForm` en `CLAUDE.md`. La mitad de API (columna, validadores, persistencia en create y update) sí queda cubierta.
- **[El wake lock falla en preproducción por HTTP]** → Degradación silenciosa por diseño. La verificación real es en producción sobre HTTPS.
- **[El bloqueo de orientación se ignora en algunos dispositivos]** → Android API 36 relaja el bloqueo de orientación en tablets. Se intenta y se ignora el fallo; el teléfono ya está fijado en horizontal en el trípode, así que la pérdida es cosmética.
- **[El operador se queda encerrado si el conmutador desaparece]** → El selector de modo está presente en los tres modos, y `preview` conserva su botón de salida aunque el resto de la interfaz se desvanezca.

## Migration Plan

Un solo despliegue, sin coordinación entre servicios: la columna es aditiva con defecto `0`, así que la API nueva sirve clientes viejos (que ignoran el campo) y el cliente nuevo sirve eventos viejos (flag `0` → sin consola). No hay orden obligatorio entre `api` y `client`, a diferencia de `zoneResolver`.

Reversión: desmarcar el checkbox en el evento devuelve la vista `full` sin desplegar nada. La columna puede quedarse.

Activación: marcar el flag en un evento de prueba, verificarlo en el Pixel 9 Pro con el receptor DJI conectado y un segundo cliente observando la emisión, y solo después usarlo en un evento real.

## Open Questions

- ¿Conviene que la consola muestre un aviso de chat sin leer (un punto, sin abrir el panel) para que el host sepa que hay preguntas esperando? Queda fuera de este cambio; se decide después de la primera retransmisión real.
- ¿El medidor de nivel debería avisar activamente tras N segundos de silencio con el micrófono encendido? Es un salto de «mostrar el estado» a «juzgarlo», y un ponente que calla no es un fallo. Se pospone hasta tener datos de uso.
