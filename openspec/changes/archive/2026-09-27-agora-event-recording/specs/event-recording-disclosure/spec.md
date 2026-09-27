## ADDED Requirements

### Requirement: Ninguna indicación de grabación en la interfaz del evento

Ninguna superficie que vean los asistentes o el host SHALL mostrar texto, mensaje, insignia ni elemento visual alguno que indique que un evento se graba: ni la ficha del evento (`client/app/live/[slug]/EventDetail.js`), ni el modal de acceso (`client/components/EventAccessModal.js`), ni la sala en ninguna de sus presentaciones (cabecera de escritorio, `client/components/events/LiveRoomTopBar.js`, `client/components/events/LandscapeStageChrome.js`) ni la consola móvil del host (`client/components/events/HostConsole.js`).

La grabación SHALL comunicarse únicamente en la política de privacidad y en las normas de los eventos, que el asistente acepta al registrarse (ver «Aceptación de la política al registrarse»). Las pantallas de administración (`/admin/espacios`) sí la muestran, porque son las que la gestionan.

#### Scenario: Asistente en un stream grabado
- **WHEN** un asistente entra en un evento `broadcast` grabado y activo, en cualquier disposición
- **THEN** NO SHALL ver ninguna referencia a la grabación

#### Scenario: Registro en una reunión grabada
- **WHEN** alguien abre el modal de acceso de una reunión grabada
- **THEN** NO SHALL ver ningún aviso de grabación

#### Scenario: Consola móvil del host
- **WHEN** el host opera un evento grabado desde la consola móvil
- **THEN** la consola NO SHALL mostrar ninguna referencia a la grabación

### Requirement: El flag de grabación no viaja en las respuestas públicas

`GET /api/events` y `GET /api/events/:slug` (`api/controllers/eventController.js`) SHALL omitir `recording_enabled` de cada evento que devuelven. Las respuestas de administración (`/api/admin/events`) SHALL conservarlo. Así, la grabación no se puede deducir ni siquiera inspeccionando la red del navegador.

#### Scenario: Ficha pública de un evento grabado
- **WHEN** alguien pide `GET /api/events/:slug` de un evento con `recording_enabled = 1`
- **THEN** el objeto `event` de la respuesta NO SHALL tener la propiedad `recording_enabled`

#### Scenario: Ficha de admin
- **WHEN** el admin pide `GET /api/admin/events/:id` del mismo evento
- **THEN** la respuesta SHALL traer `recording_enabled = 1`

### Requirement: Aceptación de la política al registrarse

La casilla obligatoria del registro en un evento (`client/components/EventAccessModal.js`) SHALL decir «Acepto las normas y términos para la participación en eventos en directo y la política de privacidad», con un enlace a `/legal/normas-eventos` en «normas y términos para la participación en eventos en directo» y otro a `/legal/politica-de-privacidad` en «política de privacidad», los dos en una pestaña nueva.

#### Scenario: Registro
- **WHEN** alguien se registra en cualquier evento
- **THEN** SHALL aceptar en la misma casilla las normas de los eventos y la política de privacidad, con un enlace a cada una

### Requirement: Textos legales de la grabación

`client/app/legal/politica-de-privacidad/page.js` SHALL incluir un apartado propio, «Grabación de eventos en directo», con el ancla `#grabacion-de-eventos`, que diga:
- **Que los eventos pueden grabarse**, que se informa en esa política aceptada al registrarse y que no se muestra un aviso distinto en cada evento.
- **Qué se graba**: la imagen y la voz de quienes intervienen. En un stream, el host, el co-presentador y los asistentes a los que se da la palabra (al recibirla se activa su micrófono, que pueden silenciar, y su imagen sólo si activan la cámara). En una reunión, todo participante mientras tenga la cámara o el micrófono activados. Nunca el chat ni a quien sólo mira y escucha.
- **Finalidad**: permitir consultar y reutilizar el contenido del evento.
- **Base legal**: para el host y el co-presentador, la relación que les une con la galería para impartir el evento. Para los asistentes que intervienen, su consentimiento, que prestan al pedir la palabra o activar la cámara o el micrófono sabiendo, por esa política, que el evento puede grabarse. Se puede asistir sin ser grabado.
- **Encargados del tratamiento**: Agora, que realiza la grabación en su región europea, y Amazon Web Services, que la almacena en la Unión Europea.
- **Conservación**: 30 días naturales desde el evento, tras los cuales se elimina automáticamente.
- **Derechos**: además de los generales, la posibilidad de pedir en info@140d.art la supresión anticipada de su intervención.

`client/app/legal/normas-eventos/page.js` SHALL resumir en su apartado «Grabación de Eventos» que los eventos pueden grabarse, a quién se graba en cada modo y el plazo de 30 días, y enlazar al ancla del apartado de la política de privacidad para el resto.

#### Scenario: Consulta de las normas
- **WHEN** alguien sigue el enlace de las normas al apartado de grabación
- **THEN** SHALL llegar al apartado de grabación de la política de privacidad

#### Scenario: Plazo coherente
- **WHEN** se leen la política de privacidad y las normas de los eventos
- **THEN** las dos SHALL decir el mismo plazo de 30 días

#### Scenario: Sin promesas de avisos
- **WHEN** se leen la política de privacidad y las normas de los eventos
- **THEN** ninguna SHALL afirmar que se muestra un aviso de grabación en la ficha, en el acceso o durante el evento
