## ADDED Requirements

### Requirement: Fila única de participantes con recuadro de resto

En un evento Agora `interaction_mode='broadcast'`, los cuadrados de participante SHALL ocupar **una sola fila**, de altura fija e independiente del número de asistentes, en las dos disposiciones:

- **Escritorio** (`AgoraParticipantGrid`): la fila NO SHALL envolver ni desplazarse. Su capacidad SHALL medirse con `ResizeObserver` sobre el contenedor, descontando su padding real, con la fórmula `max(1, floor((ancho + hueco) / (ancho_cuadrado + hueco)))`. Cada elemento de la fila SHALL tener **ancho fijo** (`BROADCAST_ROW_TILE_W_DESKTOP`), para que esa medida sea exacta.
- **Compacta** (`CompactParticipantRow`): la fila SHALL conservar su desplazamiento horizontal y SHALL cortarse en `BROADCAST_ROW_COMPACT_MAX` (20) cuadrados de participante.

Cuando no quepan todos, el **último hueco** de la fila SHALL ocuparlo un recuadro gris con el número de participantes **ocultos** («+12»), nunca el total, y en escritorio la palabra «más» en la línea de etiqueta que los cuadrados ya llevan debajo. Por encima de 999 ocultos SHALL mostrar «+999». Su etiqueta accesible SHALL nombrar la acción completa en es-ES.

Cuando todos quepan, el recuadro NO SHALL renderizarse.

La fila SHALL reservar holgura vertical (`py-1`) dentro de la caja recortada: las insignias de micrófono y de mano se dibujan 4 px por encima del cuadrado y el anillo 2, de modo que sin ella `overflow-hidden` las recorta. NO SHALL hacer falta holgura horizontal, porque el envoltorio de cada cuadrado (64 px) centra un botón de 56 y ese margen ya absorbe el saliente lateral.

La ventana visible SHALL calcularse con una única función pura (`rowWindow` en `client/lib/participantRow.js`), compartida por las dos disposiciones. Los anchos, huecos y topes SHALL vivir en `client/lib/constants.js` y los textos en `LIVE_ROOM_COPY`.

La fila de asistentes promovidos que publican vídeo NO SHALL cambiar: sus recuadros llevan `<video>` y su número lo acota el host al promover.

#### Scenario: Caben todos

- **WHEN** en un broadcast hay 8 asistentes y en la fila de escritorio caben 12 cuadrados
- **THEN** se ven los 8 cuadrados y ningún recuadro de resto

#### Scenario: No caben todos en escritorio

- **WHEN** en ese mismo evento entran 300 asistentes
- **THEN** la fila sigue midiendo una sola altura de cuadrado
- **AND** el último hueco muestra el recuadro gris con el número de ocultos
- **AND** la suma de cuadrados pintados y ocultos es 300

#### Scenario: La ventana se reduce

- **WHEN** el host estrecha la ventana del navegador y en la fila pasan a caber 7 huecos en lugar de 12
- **THEN** la fila vuelve a medirse y muestra menos cuadrados
- **AND** el número del recuadro de resto aumenta en la misma cantidad

#### Scenario: Tope de la disposición compacta

- **WHEN** un asistente abre desde un móvil un broadcast con 300 asistentes
- **THEN** la fila se desplaza horizontalmente hasta el cuadrado 20
- **AND** a continuación aparece el recuadro gris con los 280 restantes
- **AND** deslizar más allá no revela más cuadrados

#### Scenario: Justo uno más que el tope compacto

- **WHEN** hay exactamente 21 asistentes y la disposición es compacta
- **THEN** se pintan los 21 cuadrados y no hay recuadro de resto

### Requirement: Orden por prioridad de la fila

El orden de los cuadrados SHALL recalcularse en vivo y SHALL salir de una única función pura (`participantRanks` en `client/lib/participantRow.js`), consumida por las dos disposiciones y por la lista completa. Los escalones, de primero a último, SHALL ser:

1. **Host** (`isHost`). En la vista del propio host no aparece, igual que hoy.
2. **Co-presentador** (`coHost`).
3. **Mano levantada sin palabra** (`handRaised && !speaker`), ordenados por `handRaisedAt` **ascendente** — la mano más antigua primero, es una cola de turno. Una entrada sin `handRaisedAt` SHALL colocarse al final de este escalón, por orden de llegada.
4. **Con la palabra** (`speaker`): primero quienes estén en el mapa de actividad de voz de `useSpeakerActivity`, por el instante en que **empezaron** a hablar; después el resto, por orden de llegada.
5. **El resto**, por orden de llegada (su posición en la lista de presencia).

El criterio de «hablando» SHALL ser el mismo del modo `meeting`: nivel de `volume-indicator` por encima de `AGORA_SPEAKING_VOLUME_THRESHOLD` **y** micrófono publicado (`hasAudio`), con la memoria de `MEETING_SPEAKER_HOLD_MS` (6 s) de `useSpeakerActivity`, que NO SHALL modificarse.

Un participante con la palabra que levante la mano SHALL permanecer en el escalón 4; su insignia ámbar SHALL seguir viéndose.

Al contrario que las rejillas del modo `meeting`, esta fila SHALL reordenar y desmontar nodos del DOM en lugar de aplicar CSS `order`: sus cuadrados no contienen `<video>`, y montar un nodo por asistente es precisamente el coste que esta capacidad elimina. Cada cuadrado SHALL llevar `key={identity}`.

#### Scenario: Cola de manos levantadas

- **WHEN** tres asistentes levantan la mano, en orden A, B y C
- **THEN** sus cuadrados aparecen en las primeras posiciones de la fila, en ese mismo orden

#### Scenario: El host da la palabra al primero de la cola

- **WHEN** el host da la palabra a A
- **THEN** A sale del escalón de manos y pasa al de quien tiene la palabra
- **AND** B y C avanzan una posición cada uno, en su orden

#### Scenario: Bajar la mano

- **WHEN** B baja la mano sin haber recibido la palabra
- **THEN** su cuadrado deja las primeras posiciones y vuelve a su orden de llegada
- **AND** C queda el primero de la cola

#### Scenario: Un promovido empieza a hablar

- **WHEN** dos asistentes tienen la palabra y solo uno de ellos está hablando
- **THEN** el que habla aparece antes que el otro dentro de su escalón

#### Scenario: Pausa breve al hablar

- **WHEN** quien tiene la palabra calla menos de 6 segundos entre frases
- **THEN** su cuadrado no cambia de posición

#### Scenario: Micrófono cerrado

- **WHEN** un asistente con la palabra tiene el micrófono silenciado y hay ruido a su alrededor
- **THEN** su cuadrado no se adelanta a quien sí está hablando

#### Scenario: Levantar la mano teniendo la palabra

- **WHEN** un asistente al que el host ya ha dado la palabra levanta la mano
- **THEN** su cuadrado permanece en el escalón de quien tiene la palabra
- **AND** muestra la insignia ámbar de mano levantada

### Requirement: Quien tiene la palabra nunca cae en el recuadro de resto

Al recortar la fila, los escalones **host**, **co-presentador** y **con la palabra** SHALL ocupar hueco antes que cualquier mano levantada y que cualquier otro asistente. Si las manos levantadas no caben, SHALL ser ellas las que pasen al recuadro de resto.

Esto SHALL prevalecer sobre el orden: en la fila, las manos levantadas siguen apareciendo por delante de quien tiene la palabra, pero no pueden desplazarle fuera de la vista.

Si los escalones garantizados no caben ni ellos, SHALL truncarse entre sí por orden de rango y el resto SHALL contarse en el recuadro.

#### Scenario: Más manos levantadas que huecos

- **WHEN** en una fila con 8 huecos hay 2 asistentes con la palabra y 20 con la mano levantada
- **THEN** los 2 que tienen la palabra siguen visibles en la fila
- **AND** las manos levantadas ocupan el resto de huecos, las más antiguas primero
- **AND** el recuadro de resto cuenta a las manos que no caben y a los demás asistentes

#### Scenario: El que habla no desaparece al llegar manos

- **WHEN** alguien está hablando con la palabra concedida y en ese momento diez asistentes levantan la mano
- **THEN** su cuadrado sigue en la fila

### Requirement: El cuadrado propio permanece visible

El cuadrado del propio usuario SHALL quedar **fijo en el último hueco antes del recuadro de resto**, en las dos disposiciones, y NO SHALL participar en el orden por prioridad — ni siquiera cuando levanta la mano o habla.

En la vista del host, donde el host no tiene cuadrado propio en la fila, ese hueco SHALL quedar disponible para un participante más.

#### Scenario: Asistente entre cientos

- **WHEN** un asistente está en un broadcast con 300 personas y no tiene la palabra ni la mano levantada
- **THEN** su propio cuadrado sigue visible, el último antes del recuadro de resto

#### Scenario: El propio cuadrado no salta

- **WHEN** ese asistente levanta la mano
- **THEN** su cuadrado no cambia de posición en su propia vista
- **AND** los demás sí lo ven en las primeras posiciones de su fila

#### Scenario: Vista del host

- **WHEN** el host mira su fila
- **THEN** no hay cuadrado propio y todos los huecos disponibles son para participantes

### Requirement: La fila de escritorio se congela bajo el puntero

Mientras el puntero esté dentro de la fila de escritorio, la ventana visible —cuadrados, orden y número del recuadro de resto— SHALL congelarse, y SHALL reanudarse al salir el puntero. Quien llegue o cambie de estado mientras tanto SHALL añadirse al final de la ventana congelada.

El motivo es que en escritorio un clic sobre un cuadrado da o quita la palabra directamente: un reordenamiento entre el `mousedown` y el `click` promovería a otra persona, en directo.

Este congelado NO SHALL aplicarse en la disposición compacta, donde tocar un cuadrado abre su hoja y no ejecuta ninguna acción.

#### Scenario: Reordenamiento mientras el host apunta

- **WHEN** el host lleva el puntero sobre la fila para dar la palabra a alguien y en ese instante otro asistente levanta la mano
- **THEN** los cuadrados no se mueven
- **AND** el host da la palabra a la persona que había apuntado

#### Scenario: Reanudación

- **WHEN** el host saca el puntero de la fila
- **THEN** la fila vuelve a ordenarse en vivo y muestra a quien levantó la mano en su posición

### Requirement: Lista completa de participantes

Pulsar el recuadro de resto SHALL abrir la **lista completa de participantes**, que SHALL contener:

- un **buscador por nombre**, que SHALL ignorar mayúsculas y **acentos** (buscar «jose» SHALL encontrar «José»);
- una fila por participante con su inicial, su nombre y su estado en es-ES (los de `LIVE_ROOM_COPY`: host, co-presentador, micrófono abierto, micrófono silenciado, ha levantado la mano, escuchando);
- las mismas acciones que el cuadrado, como **botones con su texto** y no como fila pulsable: «Dar la palabra» / «Quitar la palabra» para el host, «Silenciar mi micrófono» para el propio usuario promovido. El host, el co-presentador y el personal de la galería (`staff`) NO SHALL ofrecer ninguna acción.

Reglas:

- El **orden** SHALL ser el mismo de la fila, con el propio usuario al final, de modo que las manos pendientes queden arriba.
- La lista NO SHALL cerrarse al ejecutar una acción: el host da la palabra a varias personas seguidas.
- SHALL pintarse como máximo `PARTICIPANT_LIST_MAX_ROWS` (100) filas, con un aviso es-ES que diga cuántas se muestran de cuántas y remita al buscador.
- SHALL existir **una sola implementación** de la lista y sus filas, con dos envoltorios: la hoja inferior (`LiveRoomSheet`) en disposición compacta y un panel en línea bajo la fila en escritorio, plegable con el mismo recuadro y con Escape.
- Ni la lista ni su envoltorio SHALL renderizarse mediante un portal a `document.body`.

#### Scenario: El host alcanza a quien no está en la fila

- **WHEN** el host pulsa «+280 más» y escribe el nombre de una asistente que no había levantado la mano
- **THEN** la lista muestra su fila con su estado
- **AND** al pulsar «Dar la palabra» la asistente es promovida
- **AND** la lista sigue abierta

#### Scenario: Búsqueda sin acentos

- **WHEN** el host escribe «jose» en el buscador
- **THEN** aparecen tanto «Jose Ramírez» como «José Martín»

#### Scenario: Orden de la lista

- **WHEN** hay cinco manos levantadas entre 300 asistentes y el host abre la lista sin buscar nada
- **THEN** las cinco manos ocupan las primeras filas, la más antigua arriba

#### Scenario: Tope de filas

- **WHEN** hay 312 participantes y no se ha escrito nada en el buscador
- **THEN** se pintan 100 filas
- **AND** un aviso dice que se muestran 100 de 312 y remite al buscador

#### Scenario: Sin acciones sobre el personal

- **WHEN** el host abre la lista en un evento donde el admin está como co-presentador
- **THEN** la fila del admin muestra su estado y ningún botón de acción

#### Scenario: Lista en la sala compacta

- **WHEN** un host toca el recuadro de resto desde un móvil
- **THEN** la lista se abre como hoja inferior dentro del contenedor de la sala
- **AND** se cierra con «Cerrar», con Escape o tocando el fondo
