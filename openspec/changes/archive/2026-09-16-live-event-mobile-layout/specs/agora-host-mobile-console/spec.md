## MODIFIED Requirements

### Requirement: Tres modos de vista intercambiables para el host

Cuando el usuario es el host de un evento Agora `broadcast` con `allow_mobile_host_console = 1`, la sala SHALL ofrecer tres modos de vista mutuamente excluyentes:

- **`full`** — la vista normal de la sala (vídeo, participantes, controles de host y chat). Por encima del umbral de `live-event-mobile-layout` es la vista de escritorio, sin ninguna modificación respecto al comportamiento previo. Por debajo, es la disposición compacta de esa capacidad.
- **`console`** — superposición a pantalla completa sin navbar, pie ni banners, con previsualización de vídeo y controles táctiles. NO SHALL mostrar la rejilla de participantes ni el chat.
- **`preview`** — únicamente el vídeo publicado, a sangre sobre fondo negro.

El modo inicial al entrar en la sala SHALL ser siempre `full`, salvo que exista una preferencia previa restaurable (ver el requisito de persistencia).

El conmutador SHALL estar accesible desde los tres modos:
- en `full` de escritorio, en su barra oscura, como hasta ahora;
- en `full` compacta, como la entrada «Vista del host» de la hoja «Más»;
- en `console` y `preview`, en su propia superposición.

Los asistentes NO SHALL ver nunca ninguno de estos controles, sea cual sea el valor del flag.

#### Scenario: El host alterna entre modos

- **WHEN** el host pulsa el selector de vista y elige «Consola»
- **THEN** la interfaz sustituye la página por la superposición de consola
- **AND** el conmutador sigue visible para volver a «Completa» o pasar a «Vídeo»

#### Scenario: El host abre la consola desde el móvil

- **WHEN** el host en disposición compacta abre la hoja «Más» y elige «Consola» en «Vista del host»
- **THEN** la hoja se cierra y se abre la superposición de consola
- **AND** al volver a «Completa» se muestra de nuevo la disposición compacta

#### Scenario: La retransmisión no se interrumpe al cambiar de modo

- **WHEN** el host cambia de `full` a `console`, de `console` a `preview` y vuelve a `full` con la cámara y el micrófono activos
- **THEN** las pistas siguen publicadas sin corte para los asistentes
- **AND** el estado de micrófono, cámara, pantalla y efecto de fondo se conserva íntegro
- **AND** la enumeración de dispositivos no se repite ni se pierde la fuente seleccionada

#### Scenario: Un asistente nunca ve el conmutador

- **WHEN** un asistente entra en un evento con `allow_mobile_host_console = 1`
- **THEN** su vista es la de asistente, sin selector de modo en ninguna disposición

#### Scenario: Flag desactivado

- **WHEN** el host entra en un evento con `allow_mobile_host_console = 0`
- **THEN** no existe selector de modo en ninguna parte de la interfaz: ni la barra oscura en escritorio ni la entrada «Vista del host» en la hoja «Más»
- **AND** la vista de escritorio es idéntica a la anterior al cambio

### Requirement: Una sola fuente de lógica para los dos conjuntos de controles

La lógica de los controles de host —enumeración y cambio de dispositivos, alternancia de micrófono, cámara y pantalla, efectos de fondo, y finalización del evento— SHALL vivir en un único módulo compartido (`client/hooks/useHostMediaControls.js`), instanciado **una sola vez** por encima del conmutador de modo y de la disposición.

Estas SHALL ser presentaciones de ese mismo estado:
- `AgoraHostControls` (vista `full` de escritorio);
- la fila de controles compacta con su hoja «Más» (vista `full` en disposición compacta, `live-event-mobile-layout`);
- la consola.

Duplicar la lógica en varios componentes haría que pudieran divergir en silencio. Reinstanciarla al cambiar de modo o de disposición reiniciaría la enumeración de dispositivos y el procesador de fondos virtuales en cada cambio.

#### Scenario: El efecto de fondo sobrevive al cambio de vista

- **WHEN** el host aplica un desenfoque de fondo en la vista `full` y pasa a `console` y vuelve
- **THEN** el efecto sigue aplicado y el procesador no se ha vuelto a descargar ni inicializar

#### Scenario: Un cambio de dispositivo se refleja en ambas vistas

- **WHEN** el host cambia el micrófono desde la consola y vuelve a la vista `full`
- **THEN** el selector de la vista `full` muestra ese mismo dispositivo como activo

#### Scenario: Cambio de disposición sin reinstanciar

- **WHEN** el host cambia de micrófono desde la hoja «Más» en vertical y después gira el móvil o abre la consola
- **THEN** la nueva presentación muestra ese mismo dispositivo como activo
- **AND** los dispositivos no se han vuelto a enumerar
