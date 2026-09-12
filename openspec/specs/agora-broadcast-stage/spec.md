# agora-broadcast-stage

## Purpose

La escena de un evento Agora `broadcast`, idéntica para host, co-presentador y audiencia. Cubre las fuentes (cámara del host, cámara del co-presentador, pizarra o pantalla compartida) y las disposiciones (una cámara, dividida, recuadro, contenido con recuadro de esquina). También el recorte, el espejo y el anillo de voz por cámara, la colocación de los recuadros y del botón de teatro, la regla de una pista por contenedor, el teatro con la escena completa y el flujo reducido (dual stream) que contiene el coste de las cámaras de la esquina.

> Capa afectada: frontend (`client/`), con apoyo del token de pantalla y de la disposición compartida definidos en `agora-streaming-provider` y `agora-broadcast-cohost`. **Sin cambios de esquema de BD.** Aplica a **todo** evento `provider='agora'` + `interaction_mode='broadcast'`, haya co-presentador o no. `meeting` y LiveKit quedan fuera.

## Requirements
### Requirement: Fuentes de la escena

La escena de un evento stream SHALL componerse a partir de tres fuentes, resueltas igual para cualquier rol:

- **Cámara del host**:
  - para el host, su pista de cámara local si está encendida
  - para el resto, el vídeo remoto del uid `HOST_UID` (1)
- **Cámara del co-presentador**:
  - para el co-presentador, su pista local si está encendida
  - para el resto, el vídeo remoto del **primer** participante de la presencia con `coHost: true` que esté publicando vídeo
  - un segundo co-presentador con cámara SHALL oírse pero no mostrarse
- **Contenido**:
  - la pizarra si está activa
  - si no, la pantalla del host: su pista local para el host, el vídeo remoto del uid `HOST_SCREEN_UID` (2) para el resto
  - con pizarra y pantalla a la vez, la pizarra SHALL tener prioridad, como hoy

La composición SHALL implementarse en un componente dedicado bajo `client/components/events/`, consumido por `BroadcastArea` de `client/components/AgoraLiveRoom.js`. Los identificadores de uid reservados SHALL vivir en `client/lib/constants.js`.

#### Scenario: Host sin co-presentador
- **WHEN** en un evento stream sin admin el host tiene la cámara encendida
- **THEN** la cámara del host es la única fuente y la escena se ve exactamente como hoy

#### Scenario: Dos admins con cámara
- **WHEN** dos co-presentadores tienen la cámara encendida
- **THEN** la escena muestra solo al que entró primero en la sala, y el audio de ambos se oye

### Requirement: Disposiciones de la escena

La escena SHALL conservar el contenedor 16:9 actual y elegir la disposición así:

| Contenido | Cámaras encendidas | Disposición |
|---|---|---|
| no | 0 | Marcador actual: «Tu vista de presentador» para el host, «Esperando al host...» para el resto |
| no | 1 (host o co-presentador) | Esa cámara al 100 %, ajustada sin recorte, exactamente como hoy |
| no | 2, disposición `'split'` | Dos mitades verticales: host a la izquierda, co-presentador a la derecha |
| no | 2, disposición `'pip'` | Host al 100 % sin recorte; co-presentador en recuadro 16:9 en la esquina inferior derecha |
| sí | 0 | Contenido al 100 %, sin recuadro |
| sí | 1 | Contenido al 100 % y esa cámara en recuadro 16:9 en la esquina inferior derecha |
| sí | 2 | Contenido al 100 % y recuadro de esquina con las dos cámaras lado a lado (host a la izquierda), **sea cual sea la disposición elegida** |

Los cambios de fuente (encender o apagar una cámara, empezar o dejar de compartir, activar la pizarra, cambiar la disposición) SHALL reflejarse sin recargar y sin interrumpir el audio.

#### Scenario: Entra la cámara del admin
- **WHEN** el host emite con cámara y el admin enciende la suya con disposición `'split'`
- **THEN** todos los participantes ven la escena dividida: host a la izquierda y admin a la derecha

#### Scenario: El host apaga su cámara durante la entrevista
- **WHEN** con la escena dividida el host apaga su cámara
- **THEN** la cámara del admin pasa a ocupar el 100 % de la escena

#### Scenario: Recuadro
- **WHEN** con las dos cámaras encendidas la disposición es `'pip'`
- **THEN** el host ocupa toda la escena y el admin aparece en pequeño en la esquina inferior derecha

#### Scenario: El host comparte pantalla en una entrevista
- **WHEN** con las dos cámaras encendidas y la disposición `'pip'` el host empieza a compartir pantalla
- **THEN** la pantalla ocupa la escena y la esquina muestra host y admin lado a lado
- **AND** al dejar de compartir, la escena vuelve a `'pip'`

#### Scenario: Presentación con cámara, sin admin
- **WHEN** en un evento sin co-presentador el host comparte pantalla con la cámara encendida
- **THEN** los asistentes ven la pantalla y la cámara del host en la esquina inferior derecha

#### Scenario: Pizarra con cámaras
- **WHEN** el host activa la pizarra con las dos cámaras encendidas
- **THEN** la pizarra ocupa la escena y la esquina muestra las dos cámaras lado a lado

### Requirement: Recorte, espejo y anillo de voz por cámara

- **Recorte:**
  - una cámara al 100 % SHALL ajustarse sin recorte (`fit: 'contain'`)
  - cada mitad de la escena dividida, el recuadro del co-presentador en `'pip'` y cada cámara del recuadro de esquina SHALL rellenar su hueco recortando centrado (`fit: 'cover'`)
- **Espejo:**
  - la cámara local del host SHALL reproducirse sin espejo (`mirror: false`) en todas las disposiciones, como hoy
  - la cámara local del co-presentador SHALL conservar el espejo por defecto del SDK en su propia vista
  - las cámaras remotas nunca se espejan
- **Anillo de voz:** el anillo verde pulsante SHALL dibujarse sobre el hueco de la persona que habla, en lugar de sobre toda la escena:
  - la mitad del host o la del co-presentador
  - el recuadro
  - la cámara correspondiente de la esquina

  Con una sola cámara al 100 %, el anillo SHALL rodear la escena como hoy.

#### Scenario: Vista dividida sin deformación
- **WHEN** la escena está dividida
- **THEN** cada mitad muestra la parte central de su vídeo 16:9, sin bandas y sin deformar la imagen

#### Scenario: Habla el entrevistador
- **WHEN** con la escena dividida el admin habla
- **THEN** solo su mitad muestra el anillo verde

### Requirement: Colocación de recuadros y botón de teatro

- **Tamaños:** el recuadro de `'pip'` y el de esquina SHALL anclarse abajo a la derecha, con un margen interior, y medirse como fracción del ancho de la escena. Los valores SHALL vivir en `client/lib/constants.js`.
- **Sobre la pizarra:** el recuadro de esquina SHALL colocarse **por encima** de los controles inferiores derechos de fastboard (zoom y páginas: `.fastboard-bottom-right`, `bottom: 8px; right: 8px`), para que el host pueda seguir usándolos. El mismo desplazamiento SHALL aplicarse a todos los roles, de modo que la zona tapada del lienzo sea la misma para todos.
- **Botón de teatro:** SHALL situarse en la esquina **superior** derecha de la escena, donde ya está sobre la pizarra, para no competir nunca con los recuadros.

#### Scenario: El host usa el zoom de la pizarra con cámaras
- **WHEN** la pizarra está activa con el recuadro de esquina visible
- **THEN** los controles de zoom y de páginas de fastboard quedan visibles y pulsables

#### Scenario: Botón de teatro visible en recuadro
- **WHEN** un asistente mira una escena en `'pip'`
- **THEN** el botón de pantalla completa aparece arriba a la derecha, sin solaparse con el recuadro del admin

### Requirement: Una pista, un contenedor

Una pista de vídeo de Agora solo se reproduce en un contenedor a la vez: desmontar un segundo `AgoraVideo` llama a `track.stop()` y apagaría el primero. Por eso:

- Las cámaras y la pantalla que pinta la escena NO SHALL pintarse en ningún otro sitio. La rejilla de «participantes promovidos con vídeo» de `BroadcastArea` SHALL excluir los uids 1 y 2 y los de todo participante con `coHost: true`.
- Con el teatro abierto, la escena SHALL pintarse solo dentro del teatro, como hoy.
- Con la consola móvil del host o su vista «Solo vídeo» activas, la escena del árbol normal NO SHALL pintar ningún vídeo. La superposición sigue mostrando el encuadre propio del host, sin cambios.

#### Scenario: La cámara del admin no se duplica
- **WHEN** el admin enciende la cámara
- **THEN** aparece en la escena y no aparece en la rejilla de participantes promovidos

#### Scenario: Consola móvil con entrevista
- **WHEN** el host usa la consola móvil mientras el admin tiene la cámara encendida
- **THEN** la consola muestra la cámara del host y la emisión de ambos continúa sin cortes para la audiencia

### Requirement: Teatro con la escena completa

El modo teatro de `broadcast` SHALL mostrar la **misma** composición (una cámara, dividida, recuadro, o contenido con esquina) a pantalla completa, con la banda de participantes actual. Los puntos de entrada SHALL ser los actuales:

- el co-presentador y los asistentes, sobre la escena siempre que tenga vídeo o contenido
- el host, sobre la pizarra

La salida SHALL seguir siendo por botón, Escape o abandono del fullscreen nativo. El fin del evento SHALL seguir cerrando el teatro.

#### Scenario: Entrevista a pantalla completa
- **WHEN** un asistente abre el teatro durante una entrevista dividida
- **THEN** ve las dos mitades a pantalla completa con la banda de participantes debajo
- **AND** si el admin cambia a `'pip'` mientras tanto, el teatro cambia de disposición sin cerrarse

### Requirement: Flujo reducido para las cámaras de la esquina

Las cámaras del host y del co-presentador en `broadcast` SHALL publicarse en **dual stream**. Tras unirse al canal como publicador y antes de publicar la cámara, cada cliente SHALL:

1. llamar a `setLowStreamParameter` con `AGORA_LOW_STREAM_PARAMETER` (480 × 270, 16:9, 15 fps), definido en `client/lib/constants.js`;
2. llamar a `enableDualStream()`.

El flujo reducido por defecto del SDK es 160 × 120, es decir 4:3, y NO SHALL usarse.

Cada suscriptor SHALL pedir con `setRemoteVideoStreamType(uid, 1)` el flujo reducido de toda cámara remota que esté pintando en el **recuadro de esquina**. Para el resto de casos SHALL pedir el completo (`0`): cámara al 100 %, mitades de la escena dividida y recuadro de `'pip'`. La selección SHALL actualizarse en cada cambio de disposición. La pantalla (uid 2) NO SHALL usar dual stream.

Si el navegador del publicador no admite dual stream, la emisión SHALL continuar con un único flujo, sin error visible y con un aviso en consola.

#### Scenario: Pantalla con cámara del host, coste acotado
- **WHEN** el host comparte pantalla con la cámara encendida
- **THEN** cada asistente recibe la pantalla y el flujo de 480 × 270 de la cámara del host

#### Scenario: Vuelta a la cámara grande
- **WHEN** el host deja de compartir pantalla y su cámara pasa al 100 %
- **THEN** los asistentes vuelven a recibir el flujo completo de la cámara del host

#### Scenario: Pizarra con dos cámaras
- **WHEN** la pizarra está activa con las dos cámaras encendidas
- **THEN** cada asistente recibe el flujo reducido de ambas cámaras

#### Scenario: Navegador del host sin dual stream
- **WHEN** `enableDualStream()` falla con `NOT_SUPPORTED` en el navegador del host
- **THEN** la cámara se publica igualmente y la sala funciona con normalidad
