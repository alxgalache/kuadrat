# agora-streaming-provider — Delta Spec (refine-agora-live-ux)

> Refina la capability introducida por el cambio (aún sin archivar) `add-agora-streaming-provider`. Solo frontend. El modo `broadcast` y los eventos LiveKit NO cambian. Requiere archivarse **después** del cambio padre (el `MODIFIED` toma como base el requisito de meeting que introduce el padre).

## MODIFIED Requirements

### Requirement: Sala en directo Agora — modo meeting (grid de cámaras)
Con `interaction_mode='meeting'`, la disposición de cámaras SHALL depender del rol del espectador. Para los **asistentes** (no host), el **host (o su pantalla compartida) SHALL mostrarse en un recuadro destacado a todo el ancho** del contenedor (grande, `aspect-video`) y el resto de participantes **debajo, en un grid en filas de 3 tiles** (3 columnas en `md+`, 2 en móvil). Para el **host**, cuando NO comparte pantalla ni pizarra, todas las cámaras (incluida la suya, **la primera y del mismo tamaño** que las demás) SHALL mostrarse en ese mismo grid de filas de 3, sin recuadro destacado; cuando el host comparte pantalla o activa la pizarra, esta SHALL ocupar el recuadro destacado a todo el ancho con los participantes debajo. Cada tile SHALL mostrar: vídeo de cámara (o avatar de inicial si está apagada), nombre, badge de estado de micro y anillo de "hablando"; el tile propio SHALL marcarse "(Tu)". TODOS los participantes SHALL entrar como PUBLISHER con **micrófono muteado y cámara apagada por defecto**, y disponer en la barra inferior de controles propios: activar/silenciar micrófono, encender/apagar cámara y selectores de dispositivo. El host SHALL disponer además de compartir pantalla (se muestra en el recuadro destacado del host), silenciar a un participante (`force_mute`), expulsar del chat y "Finalizar evento". El **chat lateral** (mismo `ChatPanel` por Socket.IO) SHALL ocupar **siempre toda la altura disponible de la página**: la columna de medios SHALL hacer scroll interno y el chat NO SHALL cambiar de altura al compartir pantalla ni al aumentar el número de participantes. No SHALL mostrarse el botón de levantar la mano (todos pueden hablar).

#### Scenario: Taller con cámaras (host destacado + filas de 3)
- **WHEN** 8 asistentes entran a un evento Agora meeting activo
- **THEN** el host se muestra en un recuadro grande a todo el ancho y los participantes aparecen debajo en filas de 3 (avatar si su cámara está apagada), muteados por defecto
- **AND** cualquiera puede encender su cámara y des-mutearse desde su propia barra de controles

#### Scenario: Host modera un micrófono abierto
- **WHEN** el host silencia a un participante con ruido de fondo
- **THEN** el micrófono del participante queda muteado para todos y este puede volver a activarlo cuando lo necesite

#### Scenario: Pantalla compartida en meeting
- **WHEN** el host comparte pantalla en un meeting
- **THEN** la pantalla ocupa el recuadro destacado del host a todo el ancho y los participantes permanecen debajo en filas de 3
- **AND** la altura del chat lateral no cambia

#### Scenario: Chat a altura completa con muchos participantes
- **WHEN** el número de participantes crece hasta requerir scroll en la zona de cámaras
- **THEN** la columna de cámaras hace scroll interno y el chat lateral mantiene toda la altura disponible de la página (no se estira ni se encoge)

#### Scenario: Vista del host — grid de tiles iguales
- **WHEN** el host de un meeting no comparte pantalla ni tiene la pizarra activa
- **THEN** ve todas las cámaras (incluida la suya, la primera y del mismo tamaño que las demás) en el grid de filas de 3, sin recuadro destacado
- **AND** al compartir pantalla o activar la pizarra, esta pasa al recuadro destacado a todo el ancho y los participantes quedan debajo

#### Scenario: Enviar un mensaje en el chat no desplaza la página
- **WHEN** cualquier participante o el host escribe un mensaje en el chat y pulsa Enter
- **THEN** solo se desplaza el interior del chat hasta el último mensaje; la página/vista no se desplaza ni salta

## ADDED Requirements

### Requirement: Pantalla completa de la pantalla compartida (Agora)
Los asistentes SHALL poder poner en pantalla completa el vídeo destacado del host mediante un botón superpuesto sobre su recuadro, usando la Fullscreen API del navegador sobre el contenedor del track de vídeo Agora (`element.requestFullscreen()`), sin API específica de Agora. En navegadores que no permiten fullscreen de elementos arbitrarios (iOS Safari) SHALL usarse el fallback `webkitEnterFullscreen()` sobre el `<video>` del track. En `meeting`, el botón SHALL mostrarse sobre el recuadro destacado del host **solo cuando el host comparte pantalla**. En `broadcast`, el botón de pantalla completa del viewer (paridad LiveKit) SHALL apuntar al recuadro del vídeo del host (pantalla o cámara) siempre que el host publique vídeo.

#### Scenario: Asistente maximiza la pantalla compartida (meeting)
- **WHEN** el host está compartiendo pantalla en un meeting y un asistente pulsa el botón de pantalla completa sobre el recuadro destacado
- **THEN** la pantalla compartida ocupa toda la pantalla del dispositivo del asistente
- **AND** al salir de pantalla completa, la sala vuelve al layout anterior sin recargar

#### Scenario: Meeting sin pantalla compartida, sin botón
- **WHEN** en un meeting el host no está compartiendo pantalla
- **THEN** no se muestra el botón de pantalla completa sobre el recuadro destacado del host

#### Scenario: Viewer maximiza el vídeo del host (broadcast)
- **WHEN** un asistente de un broadcast pulsa el botón de pantalla completa sobre el vídeo del host (esté mostrando cámara o pantalla)
- **THEN** ese vídeo ocupa toda la pantalla del dispositivo del asistente

### Requirement: Enumeración de dispositivos sin probe de permisos en la entrada (Agora)
La enumeración de dispositivos de `client/hooks/useAgoraDevices.js` NO SHALL disparar una solicitud de permiso de medios (`getUserMedia`) al montarse los controles de la sala. `AgoraRTC.getMicrophones()`/`getCameras()`/`getPlaybackDevices()` SHALL invocarse con `skipPermissionCheck: true` (o diferirse hasta que el usuario abra un selector o encienda un dispositivo); las etiquetas de dispositivo SHALL re-enumerarse tras crear el primer track (una vez concedido el permiso de forma natural). El resultado SHALL ser que entrar a un evento `meeting` no genere errores `AbortError` / "getUserMedia unexpected error" en consola.

#### Scenario: Entrar a un meeting no dispara getUserMedia
- **WHEN** un participante entra a un evento Agora meeting activo sin haber encendido cámara ni micrófono
- **THEN** no se solicita permiso de cámara/micrófono ni aparece ningún error de `getUserMedia` en consola

#### Scenario: Etiquetas de dispositivo tras conceder permiso
- **WHEN** el participante enciende por primera vez su micrófono o cámara
- **THEN** los selectores de dispositivo pasan a mostrar las etiquetas reales de los dispositivos

### Requirement: Arranque de cámara robusto ante fallos de dispositivo (Agora, best-effort)
Al encender la cámara o cambiar de fuente de vídeo, si `AgoraRTC.createCameraVideoTrack()` / `track.setDevice()` falla con `NotReadableError` / `NOT_READABLE` ("Could not start video source"), la sala SHALL reintentar una vez con la configuración por defecto y, si persiste, SHALL mostrar un mensaje es-ES claro (p. ej. "No se pudo iniciar la cámara; puede estar en uso por otra aplicación") sin romper el resto de la sala. Esta garantía es **best-effort**: algunas webcams externas incompatibles a nivel de SO/driver PUEDEN seguir sin poder publicar vídeo (las cámaras integradas funcionan).

#### Scenario: Fallo de arranque de cámara con mensaje claro
- **WHEN** un participante enciende una webcam que el navegador no consigue iniciar (`NotReadableError`)
- **THEN** tras un reintento fallido ve un mensaje es-ES explicando que la cámara no se pudo iniciar, y el resto de la sala (audio, chat, ver a otros) sigue funcionando
