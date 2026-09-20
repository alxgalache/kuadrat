## MODIFIED Requirements

### Requirement: Fila de participantes con el botón de levantar la mano

En modo `broadcast` y disposición compacta, debajo de la escena, la sala SHALL mostrar una única fila de 60 px de alto:

- **Botón de mano (asistentes).** Para el asistente, que no es host ni co-presentador, la fila SHALL empezar por un botón de 44 × 44 px con el icono de mano y el mismo radio que los cuadrados. El botón SHALL quedar fijo a la izquierda, **fuera** del desplazamiento, separado de los cuadrados por un filete. Sus estados y colores SHALL ser los del botón de escritorio, y su etiqueta accesible «Levantar mano» o «Bajar mano».
- **Cuadrados de participantes.** A continuación, cuadrados de 44 × 44 px con:
  - la inicial, los colores y los anillos de escritorio;
  - las insignias de micrófono y de mano a 16 px, sin recortar;
  - el orden por prioridad definido en `broadcast-participant-row` (manos levantadas por antigüedad, después quien tiene la palabra, después el resto), el mismo que en escritorio, con el propio al final con «(Tu)».
- **Tope y recuadro de resto.** La fila SHALL pintar como máximo `BROADCAST_ROW_COMPACT_MAX` (20) cuadrados de participante y, si hay más, SHALL añadir a continuación el recuadro gris con el número de ocultos, según `broadcast-participant-row`. Tocarlo SHALL abrir la lista completa de participantes como hoja inferior de la sala.
- **Desplazamiento.** Los cuadrados SHALL desplazarse horizontalmente dentro de la fila, sin barra de scroll visible y con `overscroll-behavior-x: contain`. El desplazamiento SHALL terminar en el recuadro de resto.
- **Nombres.** Los cuadrados NO SHALL llevar el nombre debajo. Cada uno SHALL exponerlo como etiqueta accesible.
- **Tocar.** Tocar un cuadrado SHALL abrir la hoja del participante (requisito «Hojas de la sala»). NO SHALL ejecutar directamente ninguna acción. Por eso la fila compacta NO SHALL congelar su orden bajo el puntero, al contrario que la de escritorio.
- **Host y co-presentador.** Para ellos la fila SHALL empezar directamente por los cuadrados, sin botón de mano.
- **Promovidos con vídeo.** Si hay asistentes promovidos publicando vídeo, SHALL mostrarse encima una fila propia de recuadros 16:9 de 64 px de alto, con desplazamiento horizontal. Sin ellos, esa fila no existe. Esa fila NO SHALL tener tope ni recuadro de resto: sus recuadros llevan `<video>` y su número lo acota el host al promover.

#### Scenario: Muchos participantes

- **WHEN** hay 30 participantes y el asistente desliza la fila
- **THEN** los cuadrados se desplazan y el botón de mano sigue visible a la izquierda
- **AND** tras el cuadrado 20 aparece el recuadro gris «+10 más»

#### Scenario: Cientos de participantes

- **WHEN** hay 300 participantes
- **THEN** la fila sigue midiendo 60 px de alto
- **AND** el recuadro de resto cuenta a los 280 que no se pintan

#### Scenario: Abrir la lista completa desde el móvil

- **WHEN** el host toca el recuadro de resto
- **THEN** se abre la lista completa de participantes como hoja inferior, con su buscador

#### Scenario: Levantar la mano

- **WHEN** el asistente toca el botón de mano
- **THEN** el botón cambia a su estado ámbar y el host ve la mano levantada en su cuadrado
- **AND** su cuadrado pasa a las primeras posiciones de la fila del host, detrás de las manos anteriores a la suya

#### Scenario: El final de la fila no navega atrás

- **WHEN** en Chrome para Android el asistente sigue deslizando la fila más allá de su último cuadrado
- **THEN** el navegador no inicia la navegación hacia atrás

#### Scenario: El host no da la palabra por error

- **WHEN** el host toca el cuadrado de un asistente
- **THEN** se abre la hoja de ese participante con su nombre y «Dar la palabra»
- **AND** el asistente no ha sido promovido hasta que el host pulsa esa acción
