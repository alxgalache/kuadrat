## ADDED Requirements

### Requirement: Insignia «Grabando» en la sala

Mientras un evento esté `active` y sea grabable según el predicado de `client/lib/eventRecording.js`, todas las presentaciones de la sala Agora SHALL mostrar una insignia «Grabando» con un punto rojo, para todos los roles (host, co-presentador y asistentes): la cabecera de escritorio de `client/app/live/[slug]/EventDetail.js`, la barra superior compacta (`client/components/events/LiveRoomTopBar.js`), el cromo horizontal (`client/components/events/LandscapeStageChrome.js`) y la consola del host (`client/components/events/HostConsole.js`). SHALL implementarse con un único componente, `client/components/events/RecordingBadge.js`.

La insignia SHALL reflejar la **configuración** del evento, no el estado de la tarea en Agora: no hay señal de estado hasta los navegadores, y el error posible —avisar de una grabación que ha fallado— es el que nunca perjudica la privacidad de nadie. La insignia SHALL llevar `aria-label` con el texto completo del aviso.

#### Scenario: Asistente en un stream grabado
- **WHEN** un asistente entra en un evento `broadcast` grabado y activo
- **THEN** SHALL ver la insignia «Grabando» en la disposición en que esté

#### Scenario: Evento LiveKit
- **WHEN** un evento LiveKit tiene `recording_enabled = 1`
- **THEN** su sala NO SHALL mostrar la insignia

#### Scenario: Consola móvil del host
- **WHEN** el host opera un evento grabado desde la consola móvil
- **THEN** la consola SHALL mostrar la insignia

### Requirement: Aviso antes del acceso

Cuando un evento sea grabable, la ficha del evento en `client/app/live/[slug]/EventDetail.js` (antes de entrar) y el modal `client/components/EventAccessModal.js` SHALL mostrar un aviso con el texto de su modo:
- `broadcast`: «Este evento se graba (audio y vídeo). Si el host te da la palabra, tu voz —y tu imagen, si activas la cámara— quedarán en la grabación, que se conserva 30 días.»
- `meeting`: «Esta reunión se graba (audio y vídeo). Tu imagen y tu voz quedarán grabadas mientras tengas la cámara o el micrófono activados. La grabación se conserva 30 días.»

Los textos SHALL vivir en `EVENT_RECORDING_COPY` de `client/lib/constants.js` y enlazar a la política de privacidad.

#### Scenario: Registro en una reunión grabada
- **WHEN** alguien abre el modal de acceso de una reunión grabada
- **THEN** SHALL ver el aviso de `meeting` antes de completar el acceso

#### Scenario: Evento sin grabación
- **WHEN** alguien abre la ficha de un evento sin la casilla marcada
- **THEN** NO SHALL ver ningún aviso de grabación

### Requirement: Textos legales de la grabación

`client/app/legal/politica-de-privacidad/page.js` SHALL incluir un apartado propio, «Grabación de eventos en directo», con ancla enlazable, que diga:
- **Qué se graba**: la imagen y la voz de quienes intervienen en un evento marcado como grabado —en un stream, el host, el co-presentador y los asistentes a los que se da la palabra; en una reunión, todo participante mientras tenga la cámara o el micrófono activados—. Nunca el chat ni a los asistentes que sólo miran.
- **Finalidad**: permitir consultar y reutilizar el contenido del evento.
- **Base legal**: para el host y el co-presentador, la relación que les une con la galería para impartir el evento; para los asistentes que intervienen, su consentimiento, que prestan al activar la cámara o el micrófono tras el aviso previo. Se puede asistir sin ser grabado.
- **Encargados del tratamiento**: Agora, que realiza la grabación en su región europea, y Amazon Web Services, que la almacena en la Unión Europea.
- **Conservación**: 30 días naturales desde el evento, tras los cuales se elimina automáticamente.
- **Derechos**: además de los generales, la posibilidad de pedir en info@140d.art la supresión anticipada de su intervención.

La fecha de «Última actualización» SHALL actualizarse. `client/app/legal/normas-eventos/page.js` SHALL indicar que los eventos marcados se graban, que se avisa antes de entrar y durante el evento, y que la grabación se conserva 30 días. El aviso previo de acceso SHALL enlazar al ancla del apartado.

#### Scenario: Consulta de la política
- **WHEN** alguien sigue el enlace del aviso de grabación
- **THEN** SHALL llegar al apartado de grabación de la política de privacidad

#### Scenario: Plazo coherente
- **WHEN** se leen la política, las normas y los avisos de acceso
- **THEN** los tres SHALL decir el mismo plazo de 30 días
