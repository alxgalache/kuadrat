# agora-host-mobile-console

## ADDED Requirements

### Requirement: Activación por evento del conjunto de modos de vista del host

El sistema SHALL disponer de la columna `events.allow_mobile_host_console` (INTEGER, `NOT NULL DEFAULT 0`), definida en `api/config/database.js` tanto en el `CREATE TABLE events` como en su `safeAlter` correspondiente. El flag SHALL exponerse como checkbox «Consola móvil del host» en los formularios de creación (`client/app/admin/espacios/nuevo/page.js`) y de edición (`client/app/admin/espacios/[id]/page.js`), visible únicamente cuando `format='live'`, `provider='agora'` e `interaction_mode='broadcast'`. Los validadores `createEventSchema` y `updateEventSchema` de `api/validators/eventSchemas.js` SHALL aceptarlo como booleano opcional, `eventService.createEvent` SHALL incluirlo en su `INSERT` y `eventService.updateEvent` SHALL incluirlo en `allowedFields`. El defecto `0` SHALL aplicarse sin backfill: todo evento anterior al cambio queda con la consola desactivada.

#### Scenario: Evento creado con la consola activada

- **WHEN** el admin crea un evento con `format='live'`, `provider='agora'`, `interaction_mode='broadcast'` y marca «Consola móvil del host»
- **THEN** `POST /api/admin/events` persiste `allow_mobile_host_console = 1`
- **AND** `GET /api/events/:slug` devuelve el evento con ese valor

#### Scenario: Evento existente sin el flag

- **WHEN** se consulta un evento creado antes de este cambio
- **THEN** `allow_mobile_host_console` vale `0`
- **AND** su vista de host se comporta exactamente igual que antes del cambio, sin ningún control nuevo

#### Scenario: El flag se puede cambiar después de crear el evento

- **WHEN** el admin edita un evento existente y marca (o desmarca) el checkbox
- **THEN** `PUT /api/admin/events/:id` persiste el nuevo valor
- **AND** el host lo ve reflejado la próxima vez que entra en la sala

#### Scenario: El checkbox no se ofrece fuera de Agora broadcast

- **WHEN** el formulario tiene `provider='livekit'`, o `provider='agora'` con `interaction_mode='meeting'`, o `format='video'`
- **THEN** el checkbox no se renderiza y la petición no envía el campo

### Requirement: Tres modos de vista intercambiables para el host

Cuando el usuario es el host de un evento Agora `broadcast` con `allow_mobile_host_console = 1`, la sala SHALL ofrecer tres modos de vista mutuamente excluyentes:

- **`full`** — la vista actual completa (vídeo, rejilla de participantes, controles de host y chat), sin ninguna modificación respecto al comportamiento previo al cambio.
- **`console`** — superposición a pantalla completa sin navbar, pie ni banners, con previsualización de vídeo y controles táctiles. NO SHALL mostrar la rejilla de participantes ni el chat.
- **`preview`** — únicamente el vídeo publicado, a sangre sobre fondo negro.

El modo inicial al entrar en la sala SHALL ser siempre `full`, salvo que exista una preferencia previa restaurable (ver el requisito de persistencia). El conmutador SHALL estar accesible desde los tres modos. Los asistentes NO SHALL ver nunca ninguno de estos controles, sea cual sea el valor del flag.

#### Scenario: El host alterna entre modos

- **WHEN** el host pulsa el selector de vista y elige «Consola»
- **THEN** la interfaz sustituye la página por la superposición de consola
- **AND** el conmutador sigue visible para volver a «Completa» o pasar a «Vídeo»

#### Scenario: La retransmisión no se interrumpe al cambiar de modo

- **WHEN** el host cambia de `full` a `console`, de `console` a `preview` y vuelve a `full` con la cámara y el micrófono activos
- **THEN** las pistas siguen publicadas sin corte para los asistentes
- **AND** el estado de micrófono, cámara, pantalla y efecto de fondo se conserva íntegro
- **AND** la enumeración de dispositivos no se repite ni se pierde la fuente seleccionada

#### Scenario: Un asistente nunca ve el conmutador

- **WHEN** un asistente entra en un evento con `allow_mobile_host_console = 1`
- **THEN** su vista es la de asistente de siempre, sin selector de modo

#### Scenario: Flag desactivado

- **WHEN** el host entra en un evento con `allow_mobile_host_console = 0`
- **THEN** no existe selector de modo en ninguna parte de la interfaz
- **AND** la vista es idéntica a la anterior al cambio

### Requirement: Distribución de la consola en móvil horizontal

El modo `console` SHALL caber íntegro, sin scroll de página, en un viewport de **900 × 300 px CSS** (Pixel 9 Pro en horizontal con la barra de direcciones de Chrome visible) y SHALL seguir siendo utilizable hasta **640 × 280 px CSS**. La superposición SHALL dimensionarse con unidades de viewport dinámicas (`dvh`/`dvw`) para no saltar cuando la barra de direcciones aparece o desaparece, y SHALL impedir el scroll del documento.

La distribución SHALL ser:

- **Cabecera** (~40 px): indicador «EN DIRECTO», número de conectados y el conmutador de modo.
- **Columna izquierda** (~40 % del ancho): previsualización del vídeo publicado en 16:9 y, debajo, el medidor de nivel de micrófono y el selector de calidad.
- **Columna derecha**: rejilla de dos columnas con las tarjetas de control **Micrófono**, **Cámara**, **Altavoz** y **Pantalla**. Cada tarjeta SHALL llevar su etiqueta, su interruptor de encendido cuando el control lo tenga, y el acceso a su selector de fuente cuando lo tenga.
- **Pie**: el botón «Finalizar stream», visualmente separado de las tarjetas.

Todo elemento pulsable SHALL tener un área táctil de **al menos 48 × 48 px**. Si el alto disponible no alcanza, SHALL desplazarse verticalmente solo la columna de tarjetas, nunca la página ni la cabecera ni el pie.

#### Scenario: Todo visible sin scroll en el dispositivo objetivo

- **WHEN** el host abre la consola en un viewport de 900 × 300 px CSS
- **THEN** vídeo, medidor, las cuatro tarjetas y «Finalizar stream» son visibles simultáneamente
- **AND** el documento no tiene barra de desplazamiento

#### Scenario: Pantalla pequeña

- **WHEN** el viewport es de 640 × 280 px CSS
- **THEN** la cabecera, el vídeo y el pie siguen fijos
- **AND** la columna de tarjetas se desplaza verticalmente si no cabe, conservando el tamaño táctil de 48 px

#### Scenario: La barra de direcciones aparece y desaparece

- **WHEN** el usuario arrastra el dedo hacia arriba y Chrome muestra la barra de direcciones
- **THEN** el diseño se recalcula sobre el alto real disponible sin que ningún control quede recortado

### Requirement: Selección de fuente táctil en la consola

En el modo `console` la elección de micrófono, cámara y altavoz SHALL hacerse en un panel que ocupa la superposición completa, con filas de al menos 48 px de alto y la fuente activa marcada, cerrable con un botón explícito y con toque fuera del panel. El desplegable `DeviceDropdown` de la vista `full` NO SHALL reutilizarse aquí: se posiciona bajo el disparador y con 300 px de alto quedaría fuera de la pantalla. La lista SHALL ser la misma que alimenta la vista de escritorio, incluida la reenumeración en caliente al conectar o desconectar un dispositivo USB.

#### Scenario: Cambio de micrófono a un receptor USB

- **WHEN** el host toca la tarjeta «Micrófono» y elige el receptor DJI de la lista
- **THEN** la pista de audio publicada pasa a ese dispositivo sin abandonar la sala
- **AND** el panel se cierra y la tarjeta refleja la nueva fuente

#### Scenario: Dispositivo conectado con la consola abierta

- **WHEN** el host conecta el receptor USB estando ya en la consola
- **THEN** la lista de fuentes de audio lo incluye sin recargar la página

#### Scenario: Panel cerrado sin elegir

- **WHEN** el host abre el panel de fuentes y toca fuera de él
- **THEN** el panel se cierra y la fuente activa no cambia

### Requirement: Toda la interfaz de la consola es hija de la superposición

Cualquier panel que la consola necesite mostrar —selector de fuente, confirmación de finalizar— SHALL renderizarse como hijo de la propia superposición. NO SHALL usarse ningún componente que se monte en un portal colgado de `document.body`, incluido el `ConfirmDialog` compartido: un portal así queda **fuera del elemento en pantalla completa** —el navegador solo pinta ese subárbol— y además por debajo del `z-index` de la superposición, de modo que el control resulta invisible e inoperante sin ningún error.

La confirmación de «Finalizar stream» SHALL por tanto ser propia de la consola, con los mismos objetivos táctiles de ≥48 px que el resto, y SHALL seguir apoyándose en la misma acción compartida de finalizar el evento.

#### Scenario: Finalizar el stream desde la consola en pantalla completa

- **WHEN** el host pulsa «Finalizar stream» estando en modo `console` y en pantalla completa
- **THEN** aparece la confirmación dentro de la propia consola
- **AND** al confirmarla el evento termina para todos los participantes

#### Scenario: Cancelar la confirmación

- **WHEN** el host abre la confirmación y la cancela o toca fuera de ella
- **THEN** el panel se cierra y la retransmisión continúa

#### Scenario: Fallo al finalizar

- **WHEN** la petición de finalizar el evento falla
- **THEN** la confirmación se cierra y el error queda visible en el pie de la consola

### Requirement: Medidor de nivel de micrófono

La consola SHALL mostrar un indicador continuo del nivel de entrada del micrófono local mientras el micrófono está activo, de forma que el host pueda confirmar **antes y durante** la retransmisión que la fuente seleccionada es la que capta sonido. Con el micrófono desactivado el indicador SHALL mostrarse en reposo, nunca oculto: su ausencia se confundiría con silencio.

#### Scenario: Fuente correcta

- **WHEN** alguien habla por el micrófono DJI seleccionado
- **THEN** el medidor se mueve de forma visible en la consola

#### Scenario: Fuente equivocada

- **WHEN** la fuente seleccionada no es la que capta el sonido de la sala
- **THEN** el medidor permanece plano, haciendo evidente el error antes de empezar

#### Scenario: Micrófono apagado

- **WHEN** el host desactiva el micrófono
- **THEN** el medidor sigue presente en estado de reposo, diferenciable de un nivel cero con el micrófono encendido

### Requirement: Selección de calidad de emisión

Que el host pueda elegir la calidad SHALL decidirlo el admin por evento, mediante la columna `events.allow_host_video_quality` (INTEGER, `NOT NULL DEFAULT 0`) y su checkbox «Permitir al host cambiar la calidad de vídeo». A diferencia del de la consola móvil, ese checkbox SHALL ofrecerse en **cualquier** evento Agora en directo, `broadcast` y `meeting`, porque el selector vive en los controles de host que ambas modalidades comparten.

Con el flag desactivado la emisión SHALL quedar fija en el nivel por defecto (720p) y el control NO SHALL renderizarse en ninguna vista. La preferencia guardada de un dispositivo NO SHALL aplicarse en ese caso: devolver el nivel almacenado cuando el evento no lo permite reabriría exactamente el gasto que el flag acota.

Con el flag activo, la consola SHALL permitir elegir entre tres niveles —alta, media y baja—, **todos en 16:9**, con la resolución misma como etiqueta del control. El cambio SHALL aplicarse sobre la pista ya publicada sin republicarla, de modo que los asistentes no vean ningún corte, y SHALL persistir por dispositivo. El mismo control SHALL estar disponible en la vista completa, compartiendo estado con el de la consola.

El nivel por defecto SHALL ser el medio (720p). Subir de ahí cruza la banda de facturación de Agora —que factura por asistente según la resolución agregada que recibe, con el corte en 921.600 px— y multiplica por 2,25 el coste de cada minuto-asistente, además de exigir una subida sostenida que un recinto puede no dar. El nivel bajo SHALL existir para lo contrario: sostener la emisión cuando la conexión es mala.

Con la cámara apagada el cambio NO SHALL fallar: el nivel elegido SHALL aplicarse a la pista cuando se cree.

#### Scenario: Bajar la calidad con la emisión en curso

- **WHEN** el host toca «480p» durante la retransmisión con la cámara encendida
- **THEN** la pista publicada se reconfigura a esa resolución
- **AND** los asistentes siguen recibiendo el vídeo sin corte ni reconexión

#### Scenario: Subir a 1080p

- **WHEN** el host toca «1080p»
- **THEN** la emisión pasa a 1920 × 1080, manteniendo la proporción 16:9

#### Scenario: Cambio con la cámara apagada

- **WHEN** el host cambia de calidad sin la cámara encendida
- **THEN** no se produce ningún error
- **AND** al encender la cámara la pista se crea con el nivel elegido

#### Scenario: La preferencia se recuerda

- **WHEN** el host elige un nivel y recarga la página
- **THEN** vuelve con ese nivel seleccionado

#### Scenario: Evento sin permiso de calidad

- **WHEN** el host entra en un evento con `allow_host_video_quality = 0`
- **THEN** no aparece el control de calidad ni en la consola ni en la vista completa
- **AND** la emisión es de 720p aunque ese dispositivo tuviera guardado otro nivel

#### Scenario: El admin concede la calidad en un evento de reunión

- **WHEN** el admin crea un evento `provider='agora'` con `interaction_mode='meeting'`
- **THEN** el checkbox de calidad se ofrece igualmente
- **AND** el de la consola móvil no

#### Scenario: Un asistente no elige calidad

- **WHEN** un asistente publica cámara en modo `meeting`
- **THEN** no dispone de este control y emite con el perfil de participante

### Requirement: Degradación de los controles no soportados por el navegador móvil

La consola SHALL detectar por capacidad los controles que el navegador no puede ofrecer y renderizarlos **deshabilitados con una explicación en es-ES**, nunca ocultos y nunca funcionales-en-apariencia:

- **Pantalla**: si `navigator.mediaDevices.getDisplayMedia` no existe, la tarjeta se muestra deshabilitada. Si existe pero la llamada falla —el caso real de Chrome para Android, donde el soporte es dependiente del dispositivo y la versión—, el error SHALL mostrarse dentro de la propia tarjeta.
- **Altavoz**: si no hay dispositivos de salida enumerables (el caso de Android, donde la salida la gobierna el sistema), la tarjeta se muestra deshabilitada indicándolo.

Un hueco vacío donde debería haber un control es indistinguible de un fallo de carga; una tarjeta deshabilitada con su motivo, no.

#### Scenario: Compartir pantalla en Chrome para Android

- **WHEN** el host abre la consola en un navegador sin soporte fiable de captura de pantalla
- **THEN** la tarjeta «Pantalla» aparece deshabilitada con un texto que explica que no está disponible en ese navegador
- **AND** pulsarla no produce ningún error de consola ni intento de captura

#### Scenario: Sin selección de salida de audio

- **WHEN** el navegador no enumera dispositivos `audiooutput`
- **THEN** la tarjeta «Altavoz» aparece deshabilitada indicando que la salida la gestiona el sistema

#### Scenario: Escritorio con soporte completo

- **WHEN** el host abre la consola en un navegador de escritorio
- **THEN** las cuatro tarjetas están operativas, incluidas «Pantalla» y «Altavoz»

### Requirement: Pantalla completa y orientación en los modos móviles

Al entrar en `console` o `preview` el sistema SHALL solicitar pantalla completa nativa sobre el contenedor de la superposición y, a continuación, SHALL intentar bloquear la orientación en horizontal; ambas son mejoras progresivas y su fallo SHALL ignorarse silenciosamente, dejando la superposición cubriendo el viewport igualmente. Al volver al modo `full` el sistema SHALL salir de la pantalla completa y liberar el bloqueo de orientación.

Perder la pantalla completa **NO SHALL** sacar al host del modo: SHALL mostrarse un control para volver a entrar. Esto diverge deliberadamente de `TheaterShell`, que cierra la vista cuando cambia `fullscreenchange`; aquí ese comportamiento expulsaría al operador de su consola en mitad de una retransmisión.

#### Scenario: Entrada en consola desde el móvil

- **WHEN** el host toca «Consola»
- **THEN** el navegador entra en pantalla completa y la barra de direcciones desaparece
- **AND** se intenta el bloqueo horizontal de la orientación

#### Scenario: Salida accidental de la pantalla completa

- **WHEN** el usuario sale de la pantalla completa con un gesto del sistema
- **THEN** el host permanece en el modo `console` con todos los controles operativos
- **AND** aparece un botón para volver a pantalla completa

#### Scenario: Navegador sin pantalla completa de elemento

- **WHEN** `requestFullscreen` no está disponible o es rechazada
- **THEN** la consola se muestra igualmente ocupando todo el viewport, sin mensaje de error

#### Scenario: Vuelta al modo completo

- **WHEN** el host vuelve a «Completa»
- **THEN** se sale de la pantalla completa y se libera el bloqueo de orientación

### Requirement: Persistencia del modo elegido

El modo de vista seleccionado SHALL guardarse en `localStorage` bajo una clave declarada en `client/lib/constants.js` y SHALL restaurarse al volver a entrar en la sala del mismo evento, de forma que recargar la página a mitad de retransmisión no obligue a rehacer la configuración. La restauración SHALL leerse desde un efecto, nunca desde el inicializador de `useState`, para no introducir discrepancias de hidratación. La pantalla completa NO SHALL restaurarse automáticamente: requiere un gesto del usuario.

#### Scenario: Recarga a mitad de evento

- **WHEN** el host está en modo `console` y recarga la página
- **THEN** vuelve al modo `console` tras reconectarse a la sala
- **AND** debe pulsar el botón de pantalla completa para volver a ella

#### Scenario: Almacenamiento no disponible

- **WHEN** `localStorage` no es accesible o está vacío
- **THEN** la sala abre en modo `full` sin error

### Requirement: Estado de la sala preservado fuera de la consola

Mientras el host está en `console` o `preview`, el chat y la presencia SHALL seguir recibiéndose y acumulándose. Al volver al modo `full` el historial de chat SHALL estar completo, sin mensajes perdidos durante la ausencia. La pizarra, si está activa, NO SHALL perder su sesión al cambiar de modo: su posición en el árbol de React SHALL permanecer estable, tal como ya exige `TheaterShell`.

#### Scenario: Mensajes recibidos durante la consola

- **WHEN** llegan mensajes de chat mientras el host está en modo `console`
- **THEN** al volver a `full` esos mensajes aparecen en el panel de chat

#### Scenario: Pizarra activa durante un cambio de modo

- **WHEN** el host tiene la pizarra activada y cambia de modo y vuelve
- **THEN** la pizarra sigue conectada y con permiso de escritura, sin haber rejoineado la sala

### Requirement: Fin del evento estando en un modo móvil

Cuando el evento termina mientras el host está en `console` o `preview`, el sistema SHALL devolverlo al modo `full` y salir de la pantalla completa, para que el estado de evento finalizado sea visible.

#### Scenario: El evento finaliza con la consola abierta

- **WHEN** el evento pasa a finalizado con el host en modo `console`
- **THEN** la superposición se cierra, se sale de pantalla completa y se muestra el estado de evento finalizado

### Requirement: Una sola fuente de lógica para los dos conjuntos de controles

La lógica de los controles de host —enumeración y cambio de dispositivos, alternancia de micrófono, cámara y pantalla, efectos de fondo, y finalización del evento— SHALL vivir en un único módulo compartido, instanciado **una sola vez** por encima del conmutador de modo. `AgoraHostControls` (vista `full`) y la consola SHALL ser dos presentaciones de ese mismo estado. Duplicar la lógica en dos componentes haría que ambos pudieran divergir en silencio, y reinstanciarla al cambiar de modo reiniciaría la enumeración de dispositivos y el procesador de fondos virtuales en cada cambio.

#### Scenario: El efecto de fondo sobrevive al cambio de vista

- **WHEN** el host aplica un desenfoque de fondo en la vista `full` y pasa a `console` y vuelve
- **THEN** el efecto sigue aplicado y el procesador no se ha vuelto a descargar ni inicializar

#### Scenario: Un cambio de dispositivo se refleja en ambas vistas

- **WHEN** el host cambia el micrófono desde la consola y vuelve a la vista `full`
- **THEN** el selector de la vista `full` muestra ese mismo dispositivo como activo
