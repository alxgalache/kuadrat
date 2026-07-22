# agora-whiteboard — Delta Spec (refine-agora-theater-strip-and-whiteboard-images)

> Amplía la capability en vuelo introducida por `add-agora-streaming-provider` y refinada por `refine-agora-live-ux` y `refine-agora-fullscreen-and-grid` (los tres sin archivar). Frontend (`WhiteboardPanel.js`) + backend (endpoint de subida/servido de imágenes de pizarra). Requiere archivarse **después** de los tres cambios padres.

## ADDED Requirements

### Requirement: Inserción de imágenes en la pizarra
La pizarra SHALL permitir insertar imágenes en el lienzo a los usuarios con rol writer efectivo: el **host** siempre, y los **asistentes** cuando su rol es writer ("Todos escriben" activo en meeting). La inserción SHALL ofrecer dos orígenes desde un control propio superpuesto a la pizarra (visible solo para writers): **subida de un fichero desde el dispositivo** (PNG, JPG o WEBP, hasta 10MB) y **pegado de la URL de una imagen externa** (http/https). La imagen insertada SHALL aparecer en el lienzo para **todos** los participantes en tiempo real, y SHALL comportarse como un elemento del lienzo: los writers SHALL poder seleccionarla, moverla y redimensionarla con la herramienta de selección, y los readers SHALL verla sin poder manipularla. Los mensajes de la UI SHALL estar en es-ES.

#### Scenario: El host sube una imagen desde su dispositivo
- **WHEN** el host pulsa el control de insertar imagen, elige un fichero JPG válido de su equipo y confirma
- **THEN** la imagen se sube al servidor y se inserta en el lienzo de la pizarra
- **AND** todos los participantes la ven aparecer en tiempo real

#### Scenario: Un asistente writer inserta una imagen por URL
- **WHEN** en un meeting con "Todos escriben" activo un asistente pega la URL http(s) de una imagen externa y confirma
- **THEN** la imagen se inserta en el lienzo y todos los participantes la ven

#### Scenario: Mover y redimensionar una imagen insertada
- **WHEN** un writer selecciona una imagen del lienzo con la herramienta de selección y la arrastra o redimensiona
- **THEN** el cambio de posición/tamaño se propaga a todos los participantes en tiempo real

#### Scenario: Un reader no puede insertar ni manipular imágenes
- **WHEN** un asistente con rol reader (broadcast, o meeting sin "Todos escriben") visualiza la pizarra con imágenes
- **THEN** ve las imágenes y sus movimientos en tiempo real, pero no dispone del control de insertar ni puede seleccionarlas o moverlas

#### Scenario: Fichero no válido rechazado
- **WHEN** un writer intenta subir un fichero que no es PNG/JPG/WEBP o supera los 10MB
- **THEN** la subida se rechaza y se muestra un mensaje de error claro en es-ES sin afectar a la pizarra

### Requirement: Subida y servido de imágenes de pizarra en el backend
El backend SHALL exponer un endpoint de subida de imagen de pizarra asociado al evento que SHALL validar: que el evento existe y está **activo**, que la **pizarra está activa**, que el solicitante está autorizado (host autenticado por JWT, o asistente por `attendeeId` + `accessToken`) y que su **rol efectivo es writer** (host siempre; asistente solo con "Todos escriben" activo en meeting). El fichero SHALL almacenarse con nombre UUID bajo el prefijo `whiteboard/` siguiendo el patrón de almacenamiento existente (S3 cuando está configurado, disco local como fallback), sin registro en base de datos. La respuesta SHALL incluir la **URL pública absoluta** de la imagen, apta para `insertImage`. El backend SHALL servir las imágenes de pizarra en un endpoint público de lectura con cabeceras de caché, de modo que cualquier participante (incluidos asistentes sin cuenta) pueda cargarlas desde el lienzo durante toda la vida de la sala.

#### Scenario: Subida autorizada de un writer
- **WHEN** el host (o un asistente writer con credenciales válidas) sube una imagen PNG válida al endpoint con la pizarra activa
- **THEN** el fichero se almacena con nombre UUID bajo `whiteboard/` y la respuesta incluye la URL pública absoluta de la imagen

#### Scenario: Subida rechazada a un asistente sin rol writer
- **WHEN** un asistente intenta subir una imagen cuando "Todos escriben" no está activo
- **THEN** el backend responde con error de autorización y no almacena el fichero

#### Scenario: Subida rechazada con la pizarra inactiva o el evento no activo
- **WHEN** se intenta subir una imagen de pizarra con la pizarra desactivada o el evento finalizado
- **THEN** el backend rechaza la petición con un error claro y no almacena el fichero

#### Scenario: Cualquier participante carga la imagen servida
- **WHEN** el navegador de un asistente sin cuenta solicita la URL pública de una imagen de pizarra existente
- **THEN** el backend la sirve con cabeceras de caché y la imagen se muestra en el lienzo

### Requirement: Panel de apps de fastboard oculto
La UI de la pizarra para writers NO SHALL mostrar el botón/panel de apps de fastboard-ui (que expone las apps integradas de Netless como "Code" y "Countdown"). El resto de la toolbar de edición (herramientas de dibujo, deshacer/rehacer, zoom, páginas) SHALL permanecer sin cambios. Los readers SHALL seguir sin toolbar, como hasta ahora.

#### Scenario: Writer sin panel de apps
- **WHEN** el host o un asistente writer abre la pizarra
- **THEN** la toolbar de edición se muestra completa pero sin el botón de apps (no hay acceso a "Code" ni "Countdown")

#### Scenario: Reader sin cambios
- **WHEN** un asistente reader visualiza la pizarra
- **THEN** sigue viendo el lienzo limpio sin toolbar, como en el comportamiento vigente
