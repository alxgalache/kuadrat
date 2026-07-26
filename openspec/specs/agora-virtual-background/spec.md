# agora-virtual-background

## Purpose

Efectos de fondo sobre la cámara local en las salas Agora: desenfoque del fondo real en dos intensidades y sustitución del fondo por una imagen del catálogo del repositorio. El efecto se inyecta en el pipeline del track local antes de publicarlo (`agora-extension-virtual-background`), de modo que el resto de participantes recibe ya el vídeo procesado sin señalización adicional. Disponible para el host en `broadcast` y `meeting` y para los asistentes en `meeting`; nunca sobre la pantalla compartida ni la pizarra. La preferencia se persiste en `localStorage` por dispositivo.

> Capa afectada: solo frontend (`client/hooks/useAgoraVideoEffect.js`, `client/components/events/VideoEffectsMenu.js`, `client/components/AgoraLiveRoom.js`, `client/hooks/useAgoraRoom.js`, `client/lib/virtualBackgrounds.js`, `client/lib/constants.js`, `client/public/fondos-virtuales/`). Sin cambios en `api/`, en la BD, en variables de entorno ni en el CSP. LiveKit (`EventLiveRoom.js`) queda intacto.

## Requirements

### Requirement: Efectos de fondo sobre la cámara local en salas Agora
Las salas Agora SHALL permitir a cada usuario que publica vídeo aplicar un efecto sobre su propia cámara, de entre tres tipos: **Ninguno** (sin efecto), **desenfoque del fondo real** en dos intensidades (suave e intenso) y **sustitución del fondo por una imagen** del catálogo del repositorio. El efecto SHALL aplicarse al track local **antes de publicarlo**, de forma que todos los demás participantes reciban ya el vídeo procesado sin ninguna señalización adicional ni conocimiento del efecto elegido. El efecto SHALL implementarse con la extensión oficial `agora-extension-virtual-background`, inyectada en el pipeline del track mediante `track.pipe(processor).pipe(track.processorDestination)`.

La función SHALL estar disponible para: el **host** en modo `broadcast` y en modo `meeting`, y los **asistentes** en modo `meeting`. Los asistentes de `broadcast` NO SHALL disponer de ella, porque no publican vídeo ni tienen control de cámara. El efecto NUNCA SHALL aplicarse a la pantalla compartida ni a la pizarra.

Por defecto, un usuario sin preferencia previa SHALL entrar en la sala **sin efecto**.

#### Scenario: El host aplica desenfoque en un broadcast
- **WHEN** el host de un evento Agora `broadcast` con la cámara encendida elige "Desenfoque suave"
- **THEN** su fondo real aparece desenfocado en su propia previsualización
- **AND** todos los asistentes ven el vídeo del host ya desenfocado, sin cambios en el audio ni en el chat

#### Scenario: Un asistente aplica un fondo de imagen en un meeting
- **WHEN** un asistente de un evento Agora `meeting` con la cámara encendida elige una imagen del catálogo
- **THEN** su fondo real se sustituye por esa imagen en su tile y en el de todos los demás participantes

#### Scenario: Volver a "Ninguno"
- **WHEN** un usuario con un efecto activo elige "Ninguno"
- **THEN** su vídeo vuelve a mostrar el fondo real para todos los participantes sin cortar la publicación del track

#### Scenario: La pantalla compartida no lleva efecto
- **WHEN** el host con desenfoque activo comparte pantalla
- **THEN** los asistentes ven la pantalla compartida sin ningún efecto aplicado
- **AND** al dejar de compartir, la cámara del host vuelve a mostrarse con su desenfoque activo

#### Scenario: Los asistentes de broadcast no ven el control
- **WHEN** un asistente entra a un evento Agora `broadcast`, esté o no promovido a hablante
- **THEN** no se le ofrece ningún control de efectos de fondo

### Requirement: Control "Efectos" en la barra de controles
El control de efectos SHALL presentarse en la barra inferior de controles, **junto al interruptor de Cámara**, con la etiqueta "Efectos" y el mismo patrón visual y de interacción que el selector de dispositivos existente (`client/components/events/DeviceDropdown.js`): botón chevron que despliega un panel, cierre por clic fuera y por tecla Escape, y opción activa marcada con un check. SHALL montarse en las dos superficies con control de cámara: `AgoraHostControls` (host en broadcast y en meeting) y `MeetingSelfControls` (asistentes en meeting).

El control SHALL estar **deshabilitado mientras la cámara esté apagada** y habilitarse al encenderla. El panel SHALL listar, en este orden: "Ninguno", "Desenfoque suave", "Desenfoque intenso" y, a continuación, una rejilla de **miniaturas** de las imágenes del catálogo con su etiqueta. Las miniaturas SHALL renderizarse con `<Image>` de `next/image` con `width` y `height` explícitos, conforme a la spec `nextjs-image-usage`. Todos los textos SHALL estar en es-ES.

Cuando el catálogo de fondos esté vacío, el panel SHALL mostrar únicamente las opciones de desenfoque, sin hueco vacío ni mensaje de error.

#### Scenario: El control está deshabilitado con la cámara apagada
- **WHEN** un usuario con la cámara apagada mira la barra de controles
- **THEN** el control "Efectos" aparece deshabilitado y no se puede desplegar
- **AND** al encender la cámara, el control queda disponible

#### Scenario: Cierre del panel por clic fuera y Escape
- **WHEN** el usuario abre el panel de efectos y hace clic fuera de él, o pulsa Escape
- **THEN** el panel se cierra sin cambiar el efecto seleccionado

#### Scenario: La opción activa está marcada
- **WHEN** el usuario con "Desenfoque intenso" activo abre el panel de efectos
- **THEN** esa opción aparece marcada con el check, igual que el dispositivo activo en el selector de dispositivos

#### Scenario: Catálogo de fondos vacío
- **WHEN** no hay ninguna imagen declarada en el manifiesto del catálogo
- **THEN** el panel muestra solo "Ninguno", "Desenfoque suave" y "Desenfoque intenso"

### Requirement: Catálogo de fondos servido desde el repositorio
Las imágenes de fondo SHALL almacenarse como ficheros estáticos en `client/public/fondos-virtuales/` y declararse explícitamente en un manifiesto `client/lib/virtualBackgrounds.js` que exporte una lista de entradas `{ file, label }`, donde `file` es el nombre del fichero y `label` su etiqueta en es-ES mostrada en la UI. El orden del manifiesto SHALL ser el orden de presentación en el panel. La carpeta SHALL incluir un `README.md` que documente los requisitos de las imágenes: relación 16:9 (recomendado 1280×720), producto ancho×alto par, formato JPG o WEBP y peso orientativo por debajo de 300 KB.

La imagen que se pasa al procesador SHALL ser un `HTMLImageElement` creado en código apuntando al **fichero original** bajo `/fondos-virtuales/<file>` (no a la URL optimizada de `next/image`), y SHALL estar completamente cargada antes de invocar `setOptions`. El fondo SHALL componerse con `fit: 'cover'`, de modo que llene el encuadre sin deformarse.

Una entrada del manifiesto cuyo fichero no exista NO SHALL romper la sala: la selección de esa imagen SHALL fallar de forma controlada, mostrando un mensaje en es-ES y dejando el vídeo sin efecto.

#### Scenario: Se añade una imagen nueva al catálogo
- **WHEN** se coloca un fichero JPG 1280×720 en `client/public/fondos-virtuales/` y se declara su entrada `{ file, label }` en el manifiesto
- **THEN** tras el build la imagen aparece como miniatura seleccionable en el panel de efectos con su etiqueta en es-ES

#### Scenario: El fondo llena el encuadre sin deformarse
- **WHEN** un usuario con una webcam de relación distinta a 16:9 selecciona un fondo de imagen
- **THEN** la imagen llena el encuadre recortada y centrada, sin estirarse ni dejar franjas

#### Scenario: Fichero de fondo ausente
- **WHEN** el manifiesto declara una imagen cuyo fichero no está presente y el usuario la selecciona
- **THEN** se muestra un mensaje de error en es-ES, el vídeo continúa publicándose sin efecto y la sala no se interrumpe

### Requirement: Persistencia de la preferencia de efecto por dispositivo
La selección de efecto SHALL guardarse en `localStorage` del navegador y SHALL reaplicarse automáticamente la próxima vez que el usuario encienda la cámara en cualquier sala Agora, sin intervención manual. La preferencia SHALL almacenarse en una única clave con el tipo de efecto y sus parámetros (grado de desenfoque o fichero de imagen).

Al leer la preferencia, el sistema SHALL validar que sigue siendo aplicable: si referencia una imagen que ya no existe en el manifiesto, SHALL degradarse a "Ninguno" en lugar de fallar. La lectura y la escritura SHALL tolerar que el almacenamiento no esté disponible (navegación privada) sin propagar el error a la sala.

No SHALL persistirse nada en base de datos ni en el backend: los asistentes pueden entrar como invitados sin cuenta.

#### Scenario: El efecto se reaplica en la siguiente sala
- **WHEN** un usuario que dejó "Desenfoque intenso" activo entra a otro evento Agora y enciende su cámara
- **THEN** el desenfoque intenso se aplica automáticamente y el panel lo muestra como opción activa

#### Scenario: La imagen guardada ya no existe
- **WHEN** un usuario tenía guardado un fondo de imagen que se ha retirado del manifiesto y entra en una sala
- **THEN** entra sin efecto, el panel muestra "Ninguno" como activo y no se produce ningún error

#### Scenario: Almacenamiento no disponible
- **WHEN** el navegador impide leer o escribir `localStorage`
- **THEN** la función sigue operando dentro de la sesión actual y la sala no muestra ningún error

### Requirement: Compatibilidad — móvil y navegadores no soportados
El control de efectos NO SHALL renderizarse en dispositivos móviles, donde el proveedor desaconseja expresamente esta función por rendimiento. La detección SHALL ser best-effort y sin dependencias nuevas, y SHALL resolverse de forma síncrona antes de cargar el módulo de la extensión.

En escritorio, tras cargar el módulo, el sistema SHALL evaluar `extension.checkCompatibility()`; si devuelve `false`, el panel SHALL sustituir la lista de efectos por un mensaje en es-ES indicando que el navegador no soporta la función, sin afectar al resto de controles de la sala.

#### Scenario: Asistente en móvil
- **WHEN** un asistente abre un evento Agora `meeting` desde un teléfono
- **THEN** la barra de controles muestra micrófono, cámara y selectores como hasta ahora, sin el control "Efectos"

#### Scenario: Navegador de escritorio no compatible
- **WHEN** un usuario de escritorio con un navegador no soportado abre el panel de efectos
- **THEN** el panel muestra un mensaje en es-ES de navegador no compatible
- **AND** el resto de controles de la sala sigue funcionando con normalidad

### Requirement: Carga perezosa del módulo de la extensión
El módulo `agora-extension-virtual-background` pesa unos 2,1 MB (lleva el WASM embebido en base64 y no descarga recursos externos), por lo que SHALL cargarse mediante `import()` dinámico **la primera vez que el usuario abre el panel de efectos**, nunca al montar los controles ni al encender la cámara. El módulo cargado SHALL cachearse para el resto de la sesión, de modo que aperturas posteriores del panel sean inmediatas.

Mientras el módulo se descarga o el procesador se inicializa, el panel SHALL mostrar un estado de carga en es-ES y NO SHALL aceptar selecciones. Si la carga falla, el panel SHALL mostrar un mensaje de error en es-ES y la sala SHALL continuar sin efectos.

#### Scenario: Quien no usa la función no descarga el módulo
- **WHEN** un usuario entra en una sala Agora, enciende su cámara y nunca abre el panel de efectos
- **THEN** el bundle de la extensión no se descarga en ningún momento

#### Scenario: Primera apertura del panel
- **WHEN** el usuario abre el panel de efectos por primera vez en la sesión
- **THEN** el panel muestra un estado de carga en es-ES hasta que la extensión está lista
- **AND** en aperturas posteriores el panel aparece ya listo, sin estado de carga

#### Scenario: Fallo de carga del módulo
- **WHEN** la descarga del módulo de la extensión falla
- **THEN** el panel muestra un mensaje de error en es-ES y el resto de la sala (vídeo, audio, chat) continúa sin verse afectado

### Requirement: Ciclo de vida del procesador frente al track de cámara
El procesador SHALL reconciliarse con el track de cámara local, que `useAgoraRoom` crea de forma perezosa en el primer encendido, conserva entre apagados (`setEnabled(false)`) y destruye en `becomeAudience()` y en el teardown de la sala. Para que la reconciliación sea observable desde React, `useAgoraRoom` SHALL exponer una señal que cambie cada vez que el track de cámara **se crea o se destruye**, y el hook de efectos SHALL reaccionar a ella: enganchar el procesador y aplicar el efecto vigente cuando aparece un track nuevo, y liberar el procesador (`unpipe` + `release`) cuando el track desaparece.

El procesador SHALL liberarse explícitamente al degradar a audiencia (`becomeAudience()`), al abandonar la sala y al desmontar el hook, de modo que no queden recursos WASM enganchados a tracks cerrados. Apagar y volver a encender la cámara NO SHALL requerir reinicializar el procesador. Al seleccionar "Ninguno" el procesador SHALL deshabilitarse pero permanecer inicializado, para que reactivar un efecto sea inmediato.

`setOptions()` SHALL invocarse siempre **antes** de `enable()`: habilitar el procesador sin opciones previas hace que el SDK aplique un desenfoque de grado 1 por defecto, que no es la selección del usuario.

#### Scenario: Apagar y encender la cámara conserva el efecto
- **WHEN** un usuario con un efecto activo apaga su cámara y la vuelve a encender
- **THEN** el efecto reaparece aplicado sin volver a inicializar la extensión y sin estado de carga

#### Scenario: Degradación a audiencia y vuelta a hablar
- **WHEN** un participante de broadcast con efecto activo es degradado a audiencia y más tarde vuelve a ser promovido y enciende su cámara
- **THEN** el procesador anterior queda liberado al degradarse
- **AND** al volver a publicar vídeo, el efecto guardado se aplica de nuevo sobre el track nuevo

#### Scenario: Salir de la sala libera los recursos
- **WHEN** un usuario con efecto activo abandona la sala o cierra la página
- **THEN** el procesador se libera junto con el track, sin dejar recursos enganchados

#### Scenario: Cambio de cámara en caliente
- **WHEN** un usuario con un efecto activo cambia de webcam desde el selector de dispositivos
- **THEN** el vídeo continúa publicándose con el mismo efecto aplicado sobre la cámara nueva

### Requirement: Degradación ante sobrecarga del equipo
El sistema SHALL enganchar el callback `onoverload` del procesador. Cuando se dispare, SHALL desactivar el efecto automáticamente, reflejarlo en el panel ("Ninguno" pasa a ser la opción activa) y mostrar un aviso en es-ES en el mismo hueco de mensajes que ya usan los errores de dispositivo de la barra de controles. La **preferencia guardada NO SHALL sobrescribirse**, de modo que una sobrecarga puntual no haga perder al usuario su elección en la siguiente sala.

#### Scenario: El equipo no da abasto
- **WHEN** el procesador reporta sobrecarga mientras un usuario tiene un efecto activo
- **THEN** el efecto se desactiva solo, el vídeo sigue publicándose con el fondo real y el usuario ve un aviso en es-ES
- **AND** al entrar en la siguiente sala, su preferencia anterior sigue guardada
