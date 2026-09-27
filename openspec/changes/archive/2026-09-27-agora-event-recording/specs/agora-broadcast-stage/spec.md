## MODIFIED Requirements

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
  - si no, la pantalla de la escena (uid `HOST_SCREEN_UID`, 2), la comparta el host o el co-presentador: para quien la comparte, su pista local; para el resto, host incluido cuando comparte el co-presentador, el vídeo remoto del uid 2
  - con pizarra y pantalla a la vez, la pizarra SHALL tener prioridad, como hoy

La composición SHALL implementarse en un componente dedicado bajo `client/components/events/`, consumido por `BroadcastArea` de `client/components/AgoraLiveRoom.js`. Los identificadores de uid reservados SHALL vivir en `client/lib/constants.js`.

#### Scenario: Host sin co-presentador
- **WHEN** en un evento stream sin admin el host tiene la cámara encendida
- **THEN** la cámara del host es la única fuente y la escena se ve exactamente como hoy

#### Scenario: Dos admins con cámara
- **WHEN** dos co-presentadores tienen la cámara encendida
- **THEN** la escena muestra solo al que entró primero en la sala, y el audio de ambos se oye

#### Scenario: Pantalla del co-presentador
- **WHEN** el co-presentador comparte pantalla
- **THEN** todos, host incluido, ven esa pantalla como contenido de la escena, con las cámaras en la esquina
