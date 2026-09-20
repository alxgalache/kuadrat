## Context

En un evento Agora `broadcast` los cuadrados de participante se pintan hoy en dos sitios, con dos presentaciones y **una sola función de orden**:

- `AgoraParticipantGrid` (dentro de `client/components/AgoraLiveRoom.js`): `flex flex-wrap gap-2`, un cuadrado de 56 px por asistente, tantas filas como haga falta. En la vista del host se excluye al propio host.
- `CompactParticipantRow`: fila de 60 px con desplazamiento horizontal y cuadrados de 44 px, con el botón de mano fijo fuera del scroll.
- `sortParticipants` (en `ParticipantTile.js`): host primero → el propio al final → mano levantada antes que el resto. Sin memoria, sin voz, sin cola.

El modo `meeting` ya resolvió el problema del orden: `useSpeakerActivity` (memoria de 6 s de quién se oye, con el instante en que **empezó**) + `speakerRanks` (`client/lib/meetingGrid.js`), aplicado con CSS `order` para no mover los `<video>` de sitio. `broadcast` nunca recibió nada de eso.

La presencia de la sala (`api/socket/eventSocket.js`) es la fuente de verdad del grid: `{ identity, name, isHost, agoraUid, handRaised, speaker, chatBanned, screenSharing, coHost, staff }`. `handRaised` es un booleano **sin instante**.

Restricciones del entorno que ya están escritas en el repositorio y que este diseño hereda:

- `client/` no tiene runner de tests. Todo lo que viva ahí se verifica a mano.
- Nada dentro de la sala compacta puede renderizarse con un portal a `document.body` (`LiveRoomSheet` es hija del contenedor).
- `AgoraLiveRoom` se monta con `dynamic(..., { ssr: false })`: no hay render de servidor que desajustar.
- Todos los textos en es-ES y en `LIVE_ROOM_COPY`; los umbrales, en `client/lib/constants.js`.

## Goals / Non-Goals

**Goals:**

- Que la fila ocupe **una altura fija**, sea cual sea el número de asistentes: 1, 50 o 5.000.
- Que el host tenga siempre a la vista, sin desplazarse, a quien pide la palabra y a quien la tiene.
- Que pueda alcanzar a **cualquier** asistente, esté o no en la fila.
- Una sola fuente de orden para las dos disposiciones, como hoy.

**Non-Goals:**

- LiveKit (`EventLiveRoom.js`). Fuera por la misma decisión de `live-event-mobile-layout` (13/09/2026).
- El modo `meeting`: su rejilla tiene tope propio (16 publicadores) y su orden ya existe.
- La banda del teatro en `broadcast`: es de solo lectura y ya pagina con bucle.
- Reducir el tamaño de la presencia. El servidor sigue enviando una entrada por asistente; esto arregla la interfaz, no el transporte.
- Suscribirse a menos flujos de Agora o gastar menos: los cuadrados son iniciales, no vídeo.

## Decisions

### D1. El instante de la mano lo sella el SERVIDOR (`handRaisedAt`)

`publicPresence` incorpora `handRaisedAt` (epoch ms, `null` sin mano). `hand_raise` lo escribe **solo en la transición `false → true`**; `notifyPromoted` lo limpia junto a `handRaised`.

- *Por qué no en el cliente:* quien entra tarde —o el host que recarga la página en mitad del evento— no tiene forma de saber quién levantó antes, y sellaría a todos con el mismo `Date.now()`; además dos clientes ordenarían la cola distinto. Es la misma trampa de «dos verdades» que documenta `zoneResolver`.
- *Por qué solo en la transición:* un segundo `hand_raise {raised:true}` (doble toque, reconexión de la pestaña) mandaría al final de la cola a quien lleva cinco minutos esperando.
- *Por qué epoch ms y no ISO:* el cliente nunca lo pinta, solo lo compara. No hay zona horaria que equivocar ni formato que parsear — al revés que `password_changed_at`, que sí se compara contra un `iat` y por eso necesita `parseSqlUtcDate`.
- *Reconexión:* la rama `existing` de `join_event_room` no sobrescribe `handRaised`, así que tampoco toca `handRaisedAt`. La mano y su puesto sobreviven a un refresco.
- *Compatibilidad:* un cliente nuevo contra una api antigua recibe `undefined` y todas las manos empatan → orden de llegada, que es exactamente el comportamiento de hoy. **No hace falta desplegar api y cliente juntos** (al contrario que el cambio de envíos).

### D2. Una función de orden pura, en `client/lib/participantRow.js`

`participantRanks(entries, { selfIdentity, activity })` devuelve `Map<identity, rango>` con estos escalones:

| # | Escalón | Orden interno |
|---|---------|---------------|
| 0 | Host (`isHost`) | uno solo |
| 1 | Co-presentador (`coHost`) | uno solo |
| 2 | **Mano levantada sin palabra** (`handRaised && !speaker`) | `handRaisedAt` ascendente; sin sello, al final del escalón por orden de llegada |
| 3 | **Con la palabra** (`speaker`) | primero quien está en el mapa de actividad de voz, por el instante en que **empezó** a hablar; después el resto, por orden de llegada |
| 4 | El resto | orden de llegada (posición en `presence`) |

- El cuadrado propio **no se ordena**: se excluye del ranking y se fija en el último hueco (D4). Misma regla que `speakerRanks` y que el `sortParticipants` de hoy.
- Un promovido que levanta la mano cae en el escalón 3, no en el 2: ya tiene la palabra. La insignia ámbar se sigue viendo.
- El escalón 2 es la **cola de turno** que pidió el producto: la mano más antigua primero, y quien recibe la palabra o la baja sale del escalón, con lo que los que quedan avanzan solos. No hace falta ninguna lógica de «adelantamiento»: es una consecuencia del escalón.
- El co-presentador tiene escalón propio aunque `speaker` sea cierto: es una pieza fija de la entrevista, su cuadrado no ofrece acciones y no debe bailar con las voces.

La actividad de voz sale de `useSpeakerActivity`, **sin cambios**, alimentado igual que en `meeting`: identidades con `speakingUids` y `hasAudio`, excluida la propia. Se reutiliza `MEETING_SPEAKER_HOLD_MS` (6 s) en lugar de renombrarlo a `SPEAKER_HOLD_MS`: el valor y el comportamiento son los mismos y el renombrado obligaría a tocar un requisito de `agora-streaming-provider` que no cambia.

### D3. La fila **sí** reordena el DOM — al revés que las rejillas de `meeting`

`meeting` aplica el orden con CSS `order` porque sus recuadros llevan `<video>` de Agora y moverlos de nodo los corta. Aquí los cuadrados son un `<button>` con una letra: moverlos no cuesta nada, y la alternativa —montar los 5.000 y ordenarlos con CSS— es precisamente el coste que este cambio elimina. Los cuadrados llevan `key={identity}`, así que React mueve el nodo en vez de recrearlo.

La fila de promovidos con vídeo (`CompactPromotedRow` y su equivalente de escritorio) **no se toca**: ahí sí hay `<video>`, y su número está acotado por las promociones del host.

### D4. Capacidad y ventana: una función, dos entradas

`rowWindow({ entries, selfIdentity, capacity })` (mismo módulo, puro). `capacity` son los **huecos que la fila pinta, contando el del contador**.

```
si entries.length <= capacity        → todos, sin contador
si no:
  huecos      = capacity - 1                  (el último es el contador)
  si el propio está presente → se le reserva 1 hueco al final
  se llenan los huecos restantes PRIMERO con los escalones garantizados
    (0, 1 y 3: host, co-presentador y quien tiene la palabra),
    luego con el resto, ambos en orden de rango
  la ventana se vuelve a ordenar por rango; el propio va el último
  más = entries.length - cuadrados pintados
```

- **Escritorio:** `capacity` se **mide** con `ResizeObserver` sobre el contenedor, con la misma fórmula que la banda del teatro: `max(1, floor((ancho + hueco) / (ancho_cuadrado + hueco)))`, descontando el padding real con `getComputedStyle`. Para que la medida sea cierta, el elemento de escritorio pasa a **ancho fijo de 64 px** (`BROADCAST_ROW_TILE_W_DESKTOP`): hoy mide entre 56 y 64 según lo largo que sea el nombre, y una fórmula sobre un paso variable es una fórmula equivocada. No cambia nada visible: la etiqueta ya truncaba a `max-w-16` = 64 px.
- **Compacto:** no se mide nada. `capacity = BROADCAST_ROW_COMPACT_MAX + 1` = 21 huecos, es decir **20 cuadrados y luego el contador**. El `+1` es el hueco del contador, y tiene el efecto deseable de que con exactamente 21 asistentes se pinten los 21 en vez de 20 y un «+1 más». La fila conserva su desplazamiento horizontal: el tope no está para que quepa, sino para que deslizar tenga fin.
- **Antes de la primera medición** se usa `BROADCAST_ROW_FALLBACK_CAPACITY` (12). El `ResizeObserver` dispara al observar, antes del primer pintado, así que en la práctica no se ve; la constante evita el parpadeo de una fila vacía si no lo hiciera.
- **Caso patológico:** si los escalones garantizados no caben ni ellos, se truncan entre sí por rango y el resto va al contador. Es preferible a no pintar la fila.

### D5. Quien tiene la palabra nunca cae en el contador

Decisión de producto, tomada contra la lectura literal de la especificación («las manos adelantan a quien tiene la palabra»): el adelantamiento se conserva **en el orden**, pero no en la visibilidad. Con 20 manos levantadas y una fila de 10, la lectura literal dejaría fuera justo a quien está hablando en ese momento — y una fila en la que no está quien habla no sirve para lo que existe. Las manos sobrantes son las que pasan al contador, donde siguen contadas y a un clic.

### D6. El contador abre la lista completa, y la lista es una sola implementación

`«+12 más»` es un cuadrado del mismo tamaño que los demás, gris (`bg-gray-50 ring-1 ring-gray-300`), con `+12` dentro y, en escritorio, «más» en la línea de etiqueta que ya llevan los cuadrados debajo (si no la llevara, la fila perdería 16 px de alto y se vería desigual). Techo `+999`. En compacto no hay etiqueta, como en el resto de cuadrados, y la frase completa va en `aria-label`.

Al pulsarlo se abre **la lista completa de participantes**: buscador por nombre, estado de cada uno y las mismas acciones que el cuadrado.

- **Una lista, dos envoltorios.** `ParticipantList` pinta las filas; en compacto la envuelve `LiveRoomSheet` (hoja inferior ya existente, hija del contenedor) y en escritorio un panel en línea bajo la fila (`ring-1 ring-gray-200`, `max-h-64 overflow-y-auto`), que se pliega con el mismo botón y con Escape. **Ningún diálogo nuevo y ningún portal**: la sala compacta lo prohíbe y en escritorio no hay razón para introducir un segundo sistema de diálogos.
- **Las acciones son botones con su texto** («Dar la palabra», «Quitar la palabra», «Silenciar mi micrófono»), no la fila entera. La regla de la sala compacta —un toque impreciso no debe dar la palabra a otra persona— se cumple mejor con un botón etiquetado que apilando una segunda hoja encima de la primera.
- **La lista no se cierra al actuar**: el host suele dar la palabra a varias personas seguidas. Es una divergencia deliberada respecto de la hoja de un participante, que sí se cierra porque trata de uno solo.
- **Orden de la lista = orden de la fila**, así que las manos pendientes están arriba, y el propio al final.
- **Tope de pintado** `PARTICIPANT_LIST_MAX_ROWS` (100) con una línea «Mostrando 100 de 312. Escribe para buscar.». Mil filas en el DOM de una sala con vídeo se notan; el buscador es la respuesta, no el scroll infinito.
- **El buscador ignora acentos y mayúsculas** (`normalize('NFD')` + quitar diacríticos): escribir «jose» tiene que encontrar a «José». En es-ES esto no es un extra.

### D7. La fila de escritorio se congela mientras el puntero está encima

Un reordenamiento entre el `mousedown` y el `click` promovería a otra persona en directo. La fila de escritorio ejecuta la acción **con un clic directo** (así es hoy), así que congela la ventana mientras el puntero está dentro (`pointerenter`/`pointerleave`) y la reanuda al salir; quien llegue mientras tanto se añade al final. Es el mismo recurso, y por el mismo motivo, que usa la banda del teatro al pasar de página.

No aplica en compacto: allí un toque abre la hoja y no actúa, que es la protección que ya existía.

## Risks / Trade-offs

- **[El cuadrado propio fijo gasta un hueco]** → En una fila de 10 es el 10 %. Aceptado: el estado del propio micrófono y de la propia mano es lo que más mira un asistente, y que desaparezca al entrar gente nueva se lee como un fallo.
- **[Con la fila congelada por el puntero, el host ve un orden viejo]** → Se congela solo mientras el puntero está dentro de la fila y el contador sigue contando a todos. El riesgo contrario —promover a quien no era— es peor y silencioso.
- **[La lista completa con miles de asistentes]** → Tope de 100 filas pintadas más buscador. El coste de recorrer la presencia (O(N log N) por actualización) se contiene con `useMemo` sobre la lista de presencia y la instantánea de actividad.
- **[`client/` no tiene runner de tests]** → `participantRanks` y `rowWindow` son puras y son justo lo que convendría probar, y no se puede: el contenedor `api` solo monta `api/`. Se verifican a mano con la matriz de `tasks.md`. La mitad de servidor (`handRaisedAt`) sí queda cubierta por `api/tests/eventHandRaiseOrder.test.js`.
- **[La presencia sigue siendo O(N)]** → Con miles de asistentes el cliente sigue recibiendo y guardando una entrada por cabeza, y cada mano levantada difunde un `presence_updated` a toda la sala. Este cambio no lo toca y no lo disimula; queda anotado como el siguiente techo.
- **[Dos sitios pintan la fila]** → Escritorio y compacto siguen siendo dos presentaciones. Comparten el módulo de orden y ventana, el cuadrado y la lista; lo que no comparten es solo la caja.

## Migration Plan

1. **api primero.** `handRaisedAt` es aditivo: un cliente antiguo ignora el campo.
2. **cliente después.** Contra una api antigua degrada a orden de llegada dentro del escalón de manos, que es el comportamiento actual. No es un despliegue acoplado.
3. **Vuelta atrás:** revertir el cliente basta; el campo de presencia puede quedarse sin consumidor.

## Open Questions

- ¿Extender el mismo orden a la **banda del teatro** de `broadcast` (hoy solo lectura y con su propia paginación)? Fuera de alcance aquí; sería una línea más de ordenación sobre `stripEntries`.
- ¿Merece el escalón 3 un subnivel para «micrófono abierto pero callado» por delante de «con la palabra y el micro cerrado»? Se ha dejado en orden de llegada para no multiplicar estados que el host no distingue de un vistazo.
