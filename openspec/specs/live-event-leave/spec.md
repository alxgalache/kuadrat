# live-event-leave Specification

## Purpose
TBD - created by archiving change live-event-mobile-layout. Update Purpose after archive.

## Requirements

### Requirement: Botón «Salir del evento» en todas las salas

Toda sala en directo SHALL ofrecer la acción «Salir del evento», en escritorio y en la disposición compacta de `live-event-mobile-layout`. Aplica a Agora `broadcast`, Agora `meeting`, LiveKit y el pase de vídeo (`format='video'`).

La acción SHALL presentarse:
- **en escritorio**, como botón secundario junto al número de asistentes, en la cabecera de la sala de `client/app/live/[slug]/EventDetail.js`;
- **en la sala LiveKit**, que no tiene disposición compacta, en esa misma cabecera en todos los tamaños;
- **en la sala compacta vertical**, en el extremo derecho de la barra superior, como «Salir» con etiqueta accesible «Salir del evento»;
- **en la sala compacta horizontal**, junto al indicador «EN DIRECTO» de los controles superpuestos.

Pulsarla NO SHALL navegar: SHALL abrir la confirmación de salida. No SHALL ofrecerse en el modo teatro ni en la consola móvil del host; ahí se vuelve primero a la vista normal. Los textos SHALL vivir en `LEAVE_EVENT_COPY` de `client/lib/constants.js`.

#### Scenario: Asistente en escritorio
- **WHEN** un asistente está en la sala de un stream Agora en escritorio
- **THEN** la cabecera muestra el botón «Salir del evento» junto al número de asistentes

#### Scenario: Asistente en móvil
- **WHEN** un asistente está en la sala compacta de una reunión en un móvil en vertical
- **THEN** la barra superior muestra «Salir» a la derecha del indicador «EN DIRECTO»

#### Scenario: Evento LiveKit en móvil
- **WHEN** un asistente está en la sala de un evento LiveKit desde un móvil
- **THEN** ve la cabecera con el título y el botón «Salir del evento»

#### Scenario: Pase de vídeo
- **WHEN** un asistente ve un pase de vídeo en escritorio o en móvil
- **THEN** dispone de «Salir del evento» en la cabecera o en la barra superior

### Requirement: El logo de la sala compacta lleva a la página de inicio con confirmación

En la barra superior de la sala compacta, el logo de 140d SHALL ser un enlace a la página de inicio (`/`), con etiqueta accesible «Ir a la página de inicio». Pulsarlo SHALL abrir la misma confirmación de salida que el botón, y NO SHALL navegar sin ella.

#### Scenario: Tocar el logo
- **WHEN** un asistente en la sala compacta toca el logo de 140d
- **THEN** aparece la confirmación de salida y la página no cambia todavía

### Requirement: Confirmación de salida

La confirmación SHALL mostrar el título «Salir del evento», un mensaje según el rol de quien sale y las opciones «Confirmar» y «Cancelar».

**Mensajes:**
- **Asistente** (también en una reunión y en un pase de vídeo): «Vas a salir del evento y volver a la página de inicio. Podrás volver a entrar mientras siga en directo.»
- **Host:** avisa de que su emisión se detendrá para los asistentes, de que el evento seguirá activo y de que para terminarlo para todos se usa «Finalizar».
- **Co-presentador:** avisa de que dejará de emitir y de que el evento seguirá activo.

**Acciones:**
- «Confirmar» SHALL llevar a la página de inicio con navegación de cliente. La sala se desmonta y sus limpiezas abandonan el canal RTC, cierran el socket de la sala, liberan el bloqueo de pantalla y retiran `data-live-room` y `viewport-fit=cover` del documento.
- «Cancelar», tocar fuera y Escape SHALL cerrar la confirmación, dejando al usuario en la sala sin ningún cambio.
- Salir NO SHALL finalizar el evento, ni para el host.

**Dónde se pinta:**
- Dentro de la sala compacta, SHALL ser hija del contenedor (`LiveRoomShell`, con `InlineConfirm`) y no un portal.
- En los demás casos, SHALL usar el `ConfirmDialog` común.

Estado y acciones SHALL vivir en un único proveedor, `LeaveEventProvider` de `client/components/events/LeaveEvent.js`, instanciado en `EventDetail.js`, de modo que el logo y el botón abren la misma confirmación.

#### Scenario: Confirmar la salida
- **WHEN** un asistente pulsa «Salir del evento» y después «Confirmar»
- **THEN** llega a la página de inicio
- **AND** deja de figurar en la presencia de la sala

#### Scenario: Cancelar la salida
- **WHEN** un asistente pulsa «Salir del evento» y después «Cancelar»
- **THEN** la confirmación se cierra y sigue en la sala viendo y oyendo el evento sin cortes

#### Scenario: El host sale sin finalizar
- **WHEN** el host pulsa «Salir del evento»
- **THEN** la confirmación le avisa de que su emisión se detendrá pero el evento seguirá activo
- **AND** al confirmar, el evento sigue en estado activo

#### Scenario: Volver a entrar
- **WHEN** un asistente que salió vuelve a la página del evento mientras sigue en directo
- **THEN** se conecta de nuevo con su sesión guardada, sin volver a registrarse
