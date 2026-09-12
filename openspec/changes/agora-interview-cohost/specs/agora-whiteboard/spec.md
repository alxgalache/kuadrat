# agora-whiteboard

> Capa afectada: frontend (`client/`). **Sin cambios de esquema de BD.** La composición de las cámaras sobre la pizarra está en `agora-broadcast-stage`.

## MODIFIED Requirements

### Requirement: Toggle del host y visualización compartida
El host de un evento Agora SHALL disponer de un toggle «Pizarra» en sus controles. Al activarlo, el servidor SHALL emitir `whiteboard_toggle { active: true }` por la sala Socket.IO y todos los clientes SHALL montar la pizarra ocupando el área principal, con el audio ininterrumpido. El montaje es Fastboard con su API vanilla: `createFastboard({ sdkConfig: { appIdentifier, region }, joinRoom: { uid, uuid, roomToken } })` + `mount`, paquetes `@netless/fastboard` y `@netless/fastboard-ui`, con import dinámico `ssr:false`.

Con la pizarra activa, las cámaras se muestran según el modo de interacción:

- **`interaction_mode='broadcast'`:** las cámaras encendidas (host y, si lo hay, co-presentador) SHALL mostrarse en el **recuadro de la esquina inferior derecha sobre la pizarra**, según `agora-broadcast-stage`, en lugar del mosaico que hoy aparece debajo. El recuadro SHALL quedar por encima de los controles inferiores derechos de fastboard.
- **`interaction_mode='meeting'`:** la disposición SHALL ser la actual.

Al desactivarla, los clientes SHALL desmontar la pizarra y restaurar la escena de vídeo. El host SHALL poder escribir, añadir imágenes y usar las herramientas estándar de Fastboard; los asistentes SHALL ver los trazos en tiempo real.

#### Scenario: Pizarra en directo
- **WHEN** el host de un evento stream activa la pizarra con la cámara encendida y dibuja un esquema
- **THEN** todos los asistentes ven la pizarra en el área principal con los trazos en tiempo real, la cámara del host en la esquina inferior derecha, y siguen oyendo al host

#### Scenario: Pizarra sin cámaras encendidas
- **WHEN** el host activa la pizarra con la cámara apagada y sin co-presentador con cámara
- **THEN** la pizarra ocupa el área principal y no se muestra ningún recuadro

#### Scenario: El host sigue usando los controles de fastboard
- **WHEN** el host usa el zoom o el cambio de página de la pizarra con el recuadro de cámaras visible
- **THEN** los controles responden con normalidad, sin quedar tapados por el recuadro

#### Scenario: Vuelta al vídeo
- **WHEN** el host desactiva la pizarra
- **THEN** todos los clientes restauran la escena de vídeo sin recargar la página
