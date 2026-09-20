## Why

La fila de participantes de un evento Agora `broadcast` crece sin límite: hoy es un `flex-wrap` que reparte un cuadrado por asistente en tantas filas como haga falta (`AgoraParticipantGrid`), y en la sala compacta, una fila con desplazamiento horizontal sin fin (`CompactParticipantRow`). Con cientos o miles de asistentes eso deja de ser una interfaz: en escritorio se come la columna entera —escena incluida— y en móvil obliga al host a deslizar decenas de pantallas para encontrar a la persona a la que quiere dar la palabra.

La fila es, además, **la herramienta de trabajo del host durante el evento**: quien levanta la mano y quien está hablando tienen que estar siempre a la vista y a un clic, y quien ni pide ni tiene la palabra tiene que apartarse. Hoy el único criterio de orden es «host primero, manos antes que el resto, el propio al final» (`sortParticipants`), sin memoria ni prioridad por voz — todo lo que el modo `meeting` ya resolvió con `useSpeakerActivity` y `speakerRanks` y que `broadcast` nunca recibió.

## What Changes

- **Una sola fila, nunca varias.** En escritorio, la rejilla multifila pasa a ser una fila única que se trunca a lo que quepa, medido con `ResizeObserver` (mismo método que la banda del teatro). En la sala compacta, la fila conserva su desplazamiento horizontal y se corta a 20 cuadrados.
- **Recuadro «+N más».** El último hueco que cabe lo ocupa un recuadro gris con «12 más» (los ocultos, no el total). En compacto va detrás del cuadrado 20, porque allí la fila sí se desplaza.
- **Pulsar «+N más» abre la lista completa de participantes**, con buscador por nombre y las mismas acciones que el cuadrado (dar/quitar la palabra, silenciarse). Sin esto, truncar la fila le quitaría al host la única forma que tiene de promover a alguien que no haya levantado la mano.
- **Orden dinámico por prioridad**, recalculado en vivo:
  1. manos levantadas, **por orden de llegada de la mano** (la más antigua primero: es una cola de turno);
  2. quien tiene la palabra, y dentro de ese grupo quien se está oyendo, por el instante en que empezó a hablar (`useSpeakerActivity`, ya existente);
  3. el resto, por orden de llegada.
- **Quien tiene la palabra nunca cae dentro del «+N más»**: si las manos levantadas no caben, son ellas las que se van al contador. Una fila donde no está quien está hablando no sirve para lo que existe.
- **El cuadrado propio («Tú») queda fijo** en el último hueco antes del contador, en todas las disposiciones.
- **La presencia gana `handRaisedAt`** (servidor, epoch ms), sellado solo en la transición «no → sí». Sin él la cola de manos no existe: `handRaised` es un booleano y un cliente que entra tarde —o el host que recarga— no puede saber quién levantó antes.
- **La fila reordena y desmonta nodos del DOM**, al contrario que las rejillas de `meeting`, que usan CSS `order`. Aquí no hay `<video>` en los cuadrados, y montar mil nodos ocultos para luego ordenarlos con CSS es exactamente el coste que este cambio elimina.
- Sin cambios: `EventLiveRoom.js` (LiveKit), el modo `meeting`, la fila de promovidos con vídeo, la banda del teatro y el panel admin de participantes.

## Capabilities

### New Capabilities
- `broadcast-participant-row`: la fila de participantes de un evento Agora `broadcast` — fila única con capacidad medida, recuadro «+N más», lista completa con buscador, orden por prioridad (manos por antigüedad, palabra por voz, resto por llegada), garantía de visibilidad de quien tiene la palabra y del cuadrado propio. Cubre escritorio y disposición compacta con una sola fuente de orden.

### Modified Capabilities
- `agora-streaming-provider`: la entrada de presencia incorpora `handRaisedAt` y el manejador `hand_raise` lo sella en la transición (y `notifyPromoted` lo limpia con la mano); la cláusula de orden de los tiles del requisito de paridad broadcast deja de describirlo y remite a `broadcast-participant-row`.
- `live-event-mobile-layout`: el requisito «Fila de participantes con el botón de levantar la mano» incorpora el tope de 20 cuadrados, el recuadro «+N más», la hoja de la lista completa y el orden de la nueva capacidad.

## Impact

**Cliente (Next.js)**
- `client/components/AgoraLiveRoom.js` — `AgoraParticipantGrid` pasa de `flex-wrap` a fila medida; cálculo de rangos y actividad de voz también en `BroadcastArea`.
- `client/components/events/CompactParticipantRow.js` — tope de 20, recuadro «+N más», hoja de lista completa.
- `client/components/events/ParticipantTile.js` — `sortParticipants` se sustituye por el nuevo módulo de orden; nuevo recuadro contador (`MoreParticipantsTile`); el elemento de escritorio pasa a ancho fijo para que la medida sea exacta.
- **Nuevos:** `client/lib/participantRow.js` (orden y ventana, puros), `client/hooks/useHandRaiseOrder.js` o equivalente si hace falta memoria de manos en cliente, `client/components/events/ParticipantList.js` (lista + buscador, una sola implementación con dos envoltorios).
- `client/lib/constants.js` — anchos de cuadrado, hueco, tope compacto, tope de filas de la lista y textos es-ES en `LIVE_ROOM_COPY`.

**API (Express + Socket.IO)**
- `api/socket/eventSocket.js` — `publicPresence` emite `handRaisedAt`; `hand_raise` lo sella solo en la transición; `notifyPromoted` lo limpia junto a `handRaised`.
- **Nuevo test:** `api/tests/eventHandRaiseOrder.test.js`, sobre el `io` falso que ya usa `eventSocketCohost.test.js`.

**Fuera de alcance (por decisión)**
- LiveKit (`EventLiveRoom.js`), coherente con `live-event-mobile-layout` (13/09/2026).
- El modo `meeting` y su rejilla de cámaras.
- La banda del teatro en `broadcast`: es de solo lectura y ya tiene su propia paginación con bucle.
- El volumen de la propia presencia: el servidor sigue enviando una entrada por asistente, así que el coste de red y de memoria del cliente sigue siendo O(N). Este cambio arregla la interfaz, no el transporte.
