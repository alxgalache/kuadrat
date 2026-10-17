## Context

**La escena.** En un evento Agora `broadcast`, cada navegador compone la escena con `client/components/events/BroadcastStage.js`, igual para host, co-presentador y audiencia. Las fuentes son la cámara del host (uid 1), la del co-presentador, y la pizarra o la pantalla de la escena (uid 2). Sin cámaras ni contenido se pinta un `placeholder`: «Esperando al host» para el público.

**«Efectos».** `useAgoraVideoEffect` aplica desenfoque o un fondo **a la pista de cámara** antes de publicarla. Exige cámara y deja al host delante. Por eso no sirve para las portadas.

**Estado compartido de la escena.** `api/socket/eventSocket.js` guarda en memoria, por evento, la pizarra (`eventWhiteboards`) y la disposición de cámaras (`eventStageLayouts`). Se emiten a la sala `event-room-{id}`, viajan en el ACK de `join_event_room` y se borran en `broadcastEventEnded`. La pantalla compartida vive en la presencia (`entry.screenSharing`).

**Grabación.** `agoraRecordingService` graba los `broadcast` en modo `mix` con `#allstream#`, sobre un lienzo de 1920 × 1080 con fondo negro. `mixLayoutFor(screenSharing)` elige entre adaptativo (1) y vertical con la pantalla grande (2). El reconciliador compara el diseño deseado con `event_recordings.applied_layout` y llama a `updateLayout` si difieren. La columna tiene `CHECK(applied_layout IN ('adaptive','screen'))`.

**Lo que dice Agora** (documentación de Cloud Recording, consultada el 2026-10-17):

- `transcodingConfig` del `start` y `clientRequest` de `updateLayout` admiten `backgroundImage` (imagen del lienzo, recortada para llenarlo), `defaultUserBackgroundImage` y `backgroundConfig` por uid. La nota de versión dice: «You can update the background image during a recording session».
- Los ejemplos usan JPG y BMP, y `backgroundConfig` dice «Supports HTTPS, JPG and BMP formats, maximum 6 MB». PNG no se menciona.
- «If a user sends only audio, the user occupies a region.» En el diseño flotante (0), esa región es **transparente**; en el adaptativo (1) y en el vertical (2), muestra el color de fondo.
- Si un cliente web deja de enviar vídeo, se ve su último fotograma 3,5 s y después la imagen de fondo del lienzo o de su región. «If a background image is not set, the last frame is displayed»: ese es el fotograma congelado de las grabaciones actuales.
- `layoutConfig` (diseño 3) admite hasta 17 regiones con `alpha` entre 0,0 (transparente) y 1,0. Las regiones sin `uid` se asignan por orden de entrada.
- No se documenta si `updateLayout` sustituye toda la configuración o la combina con la anterior.

**Imágenes.** Las tres fuentes (`docs/cortinillas/*.png`) miden 1920 × 1080, son RGBA con alfa 255 en todo el lienzo y tienen fondo blanco. El proxy de Next (`client/proxy.js`) excluye `*.jpg` de su `matcher`, y la puerta de preproducción es un componente React, así que Agora puede descargar un JPG de `client/public` también en preproducción.

## Goals / Non-Goals

**Goals:**

- Una imagen fija que tape la escena entera, sin cámara y sin nada delante, igual para todos los roles.
- Que aparezca en la grabación con la misma regla: portada puesta, nadie delante.
- Que la ponga el host o el co-presentador, que se quite sola con cualquier acción de vídeo, y que «Inicio» esté puesta al empezar.
- Cero coste de vídeo mientras está puesta.

**Non-Goals:** los de la propuesta: `meeting`, LiveKit, pases de vídeo, portadas por evento, persistencia tras un reinicio, control desde `/admin/espacios`.

## Decisions

### 1. Superposición en cada navegador, no una pista de vídeo publicada

**Decisión:** la portada es un estado de la sala que cada navegador pinta encima de la escena. Nadie publica la imagen en el canal.

**Alternativas descartadas:**

- **Publicar un `<canvas>` con la imagen como pista de vídeo** (`captureStream`). Exige el navegador del host conectado, y «Inicio» tiene que verse antes de que llegue: incompatible con el inicio automático. Además, cada espectador pagaría una imagen fija como vídeo HD o Full HD por minuto. Y un cliente solo publica una pista de vídeo, así que habría que desplazar la cámara o usar el uid 2.
- **Agora Media Pull** con un MP4 en bucle inyectado como uid. Otro servicio facturado, otra pieza que configurar y un uid más en la escena.
- **Grabación de página web** (web page recording) de nuestra propia escena. Cambia el modelo de grabación entero y su coste.

Con la superposición, la portada funciona sin nadie conectado, no factura vídeo y la escena no cambia de estructura.

### 2. El estado vive en la memoria de `eventSocket`, como la disposición de cámaras

**Decisión:** `eventStageCovers` sigue el ciclo de vida de `eventStageLayouts`: `stage_cover` hacia la sala, valor en el ACK y borrado al terminar el evento.

**Alternativa:** una columna `events.stage_cover`. Sobreviviría a un reinicio, pero añade una escritura en la BD por cada cambio y otro sitio donde puede divergir del socket. Un reinicio de la API durante un evento ya pierde la pizarra y la disposición, y se acepta igual aquí: el host vuelve a poner la portada.

### 3. En la grabación: diseño personalizado con ventanas transparentes y la portada de fondo

**Decisión:** con portada, `mixLayoutFor` devuelve `mixedVideoLayout: 3`, 17 regiones que cubren el lienzo con `alpha: 0`, y `backgroundImage` con la URL de la portada.

Por qué así, y no solo `backgroundImage` sobre el diseño de siempre:

- En el adaptativo, la región de un usuario que solo envía audio muestra el **color** de fondo: el host con el micro abierto taparía la portada de negro.
- En el flotante, la región de solo audio es transparente, pero un usuario que acaba de apagar la cámara deja 3,5 s su último fotograma encima.
- Las regiones transparentes no dejan ver a nadie en ningún caso, el audio sigue en la mezcla y la regla es literalmente la de la sala: «no se ve nada delante».

Las 17 regiones son el máximo de Agora, así que ningún publicador queda sin una región transparente.

**Respaldo**, si la geometría real en preproducción no se comporta así: el diseño flotante con el mismo `backgroundImage`. Se ajusta solo `mixLayoutFor`.

### 4. `backgroundImage` explícito en todo diseño (fondo neutro negro)

**Decisión:** todos los diseños llevan `backgroundImage`: la portada o `grabacion/fondo-negro-v1.jpg`.

Si `updateLayout` combinara la configuración con la anterior, volver al adaptativo sin `backgroundImage` dejaría la portada en el lienzo, a la vista en las franjas del diseño y en las cámaras apagadas. Enviar `""` podría ser un 400, y la tarea quedaría reintentando para siempre con la portada puesta. Una URL válida funciona con las dos semánticas.

**Efecto secundario aceptado:** según la documentación, quien apaga la cámara deja de aparecer congelado y pasa a negro tras 3,5 s. Es mejor que hoy, y coincide con lo que ve el público en la sala.

Las tareas ya en marcha al desplegar no cambian: su diseño deseado sin portada coincide con el aplicado.

### 5. Columna `applied_cover`, no ampliar `applied_layout`

El `CHECK` de `applied_layout` está en el `CREATE TABLE` y SQLite no lo amplía en la tabla de producción: escribir `'cover:inicio'` fallaría allí y en ninguna base de test. Se añade `applied_cover TEXT` sin `CHECK`, con `safeAlter`. Lo deseado es `{ layout: 'adaptive'|'screen', cover }`, y se compara campo a campo.

### 6. Un lector de la escena, `getStageState`, en lugar de `isStageScreenSharing`

**Decisión:** el reconciliador recibe un único lector que devuelve `{ screenSharing, cover }`.

Con dos lectores separados, el día que un llamador pase solo uno, el diseño se calcularía con la mitad de la escena: un `screen_share` revertiría una portada en curso. La regla «sin lector, el diseño no se toca» se conserva con un solo lector. `isStageScreenSharing` y `getStageScreenSharer` siguen expuestos para `screen-token`.

### 7. JPG versionados en `client/public`, servidos desde `CLIENT_URL`

La conversión desde PNG es sin pérdida visible, porque no hay transparencia. JPG es el formato que cita Agora, y pesa menos para el público. Se sirven como los iconos del email de calendario: `client/public/...`, con `-v1` en el nombre, porque un recurso publicado con caché inmutable nunca se sobrescribe (invariante de `CLAUDE.md`). Los originales siguen en `docs/cortinillas/`, versionados.

### 8. Vaciar la escena es una reacción al mensaje, no a la elección

**Decisión:** quien elige una portada solo emite `stage_cover`. Cada presentador apaga lo suyo al **recibir** el mensaje, también como eco de su propia elección.

Es un solo camino de código, y cubre el caso que la elección local no puede cubrir: el co-presentador pone «Intermedio» y es el navegador del **host** el que tiene que apagar su cámara, su pantalla y la pizarra.

El ACK de unión no apaga nada, porque al unirse no se publica nada. Así, recargar la página con una portada puesta no tiene efectos.

**Micrófonos (decisión del operador):** se silencian también. Los dos errores no pesan igual. Olvidar el micrófono abierto en un intermedio emite y graba una conversación privada, y el host no lo nota. Volver a abrirlo para hablar sobre «Final» cuesta un clic. Encender el micrófono no quita la portada.

### 9. Quitar la portada al completarse la acción, en el cliente

La cámara no es visible para el servidor (es RTC), así que la regla «una acción de vídeo quita la portada» solo puede vivir en el cliente. Vive en un único sitio, `useHostMediaControls`, para cámara y pantalla, y en el `toggleWhiteboard` de la sala para la pizarra.

Se emite `null` **después** de que la acción salga bien: una cámara que no arranca no debe dejar la escena sin portada. Mientras tanto, la superposición tapa la cámara recién publicada, y en la grabación lo tapan las regiones transparentes.

**Alternativa:** que el servidor quite la portada al ver `screen_share` o `whiteboard_toggle` activos. Repartiría la regla en dos sitios y seguiría sin cubrir la cámara.

### 10. Host y co-presentador (decisión del operador)

La regla de las entrevistas reserva al host la pizarra, los efectos y la calidad, porque dos operadores producen estados incompatibles. La portada es un único valor en el servidor, y gana el último que la cambia. El admin podrá poner «Intermedio» en una entrevista, o quitar «Inicio» si el host tarda en llegar. Se modifica el requisito de controles del co-presentador.

### 11. «Inicio» en el camino de inicio compartido

`setStageCover(id, 'inicio')` se llama después de guardar `active` y antes de `broadcastEventStarted` y `triggerReconcile`. Así la primera tarea de grabación arranca ya con la portada, sin un `updateLayout` inmediato.

Si `event-auto-start` ya está aplicado, va en su función de inicio compartida. Si no, va en `eventAdminController.startEvent`, y `event-auto-start` la hereda al extraer esa función.

### 12. Presentación

**`BroadcastStage`:** la portada es su **último** hijo, `absolute inset-0`, por encima de los recuadros (`z-10`) y por debajo del botón del teatro (`z-20`). Es un `<img>` con `object-contain` sobre `bg-white`, porque las portadas tienen fondo blanco y el teatro en un móvil apaisado no es 16:9. Las capas de abajo no se desmontan, por las reglas de «una pista, un contenedor» y de la pizarra como primer hijo.

**Menú:** `StageCoverMenu` (escritorio) y unas opciones compartidas, `StageCoverOptions`, que reutilizan la consola y la hoja compacta, igual que `VideoEffectsMenu` con `VideoEffectsOptions`. A diferencia de «Efectos», se muestra en móvil, porque no procesa nada.

## Risks / Trade-offs

- **[La geometría de 17 regiones superpuestas y transparentes no está probada]** → Se verifica con la primera grabación en preproducción: portada visible, nadie delante, audio presente. Si falla, se usa el respaldo flotante (Decisión 3).
- **[Agora aplica la imagen «only after the image is successfully downloaded»]** → La primera vez puede tardar unos segundos. Son unos 200 KB servidos por nginx. La comprobación de preproducción mide el retraso.
- **[El fondo neutro cambia las grabaciones sin portada]** → Una cámara apagada se verá negra y no congelada. Es deliberado, y queda en la regla y en la guía de grabaciones.
- **[Un reinicio de la API quita la portada]** → Igual que la pizarra y la disposición. El host la vuelve a poner.
- **[Carrera entre poner la portada y encender una cámara]** → El servidor ordena los mensajes y gana el último. Cualquier orden converge a «portada con la escena vacía» o a «sin portada».
- **[Silenciar el micrófono del co-presentador puede sorprenderle]** → Lo dice la ayuda del menú. Abrirlo de nuevo no quita la portada.
- **[El cliente no tiene runner de tests]** → La escena, el menú, el vaciado y la grabación se verifican a mano con la matriz de `tasks.md`. La API se cubre con Jest.

## Migration Plan

1. Desplegar API y cliente juntos (`./deploy/deploy.sh`). `initializeDatabase()` añade `applied_cover` con `safeAlter`, sin rellenar datos.
2. Los JPG se publican con el cliente. La API no los necesita hasta que haya una grabación con portada.
3. **Vuelta atrás:** revertir el código. La columna se queda, sin efecto. Los JPG no se borran, porque una grabación en curso podría estar usándolos.

## Open Questions

Ninguna bloqueante. Quedan dos cosas por medir, no por decidir:

- la geometría real del diseño de portada en Agora;
- si `updateLayout` sustituye o combina la configuración.

La segunda no cambia el diseño (Decisión 4).
