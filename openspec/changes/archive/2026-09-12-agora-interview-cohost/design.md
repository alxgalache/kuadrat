## Context

Un evento Agora `broadcast` es hoy una sala de una sola cámara, y lo es por construcción en tres capas.

**Tokens.** `getViewerToken` y `renewToken` (`api/controllers/eventController.js`) dan `publisher` a un asistente solo si `interaction_mode='meeting'` o `speaker_granted=1`. El admin entra por `POST /api/events/:id/admin-access`, que le crea una fila de asistente con `is_staff = 1`, y en `broadcast` recibe `subscriber`. Con **Co-host authentication** activo en la consola de Agora, ese token no puede publicar aunque se manipule el cliente. El diseño archivado de `admin-password-reset-and-event-access` (D6) dejó escrito que convertir al admin en co-host era otra funcionalidad, y fijó el principio que este diseño conserva: **la identidad de asistente es la moneda de todo lo que viene después**. Por eso no se abre un camino paralelo.

**Cliente RTC.** `useAgoraRoom` usa un solo `AgoraRTCClient`. Verificado en `agora-rtc-sdk-ng@4.24.6` (`AgoraRTC_N-production.js`):

```js
if (r instanceof FV && (this.localTrackMap.has(oB.LocalVideoTrack) || s
    ? new JN(XN.CAN_NOT_PUBLISH_MULTIPLE_VIDEO_TRACKS).throw() : ...
```

Un cliente publica **una** pista de vídeo. Por eso `startScreenShare` des-publica la cámara y publica la pantalla, y la interfaz asume en todas partes que el host tiene «un único track, con preferencia por la pantalla».

**Interfaz.** `BroadcastArea` (`client/components/AgoraLiveRoom.js`) pinta:
- un único `hostTrack` a pantalla completa;
- la pizarra con un mosaico `w-48` debajo;
- una rejilla de «promovidos con vídeo» con cualquier uid ≠ 1 que publique vídeo, en la que caería la cámara del admin, duplicando la pista.

`AgoraVideo` llama a `track.stop()` al desmontarse, así que una pista pintada en dos contenedores se apaga en ambos.

Hechos del SDK y de la facturación que gobiernan las decisiones:

- **`setEnabled(false)` sobre una pista publicada dispara `user-unpublished` en los remotos**, y `setEnabled(true)` dispara `user-published` (guía de migración 3.x → 4.x de Agora). La escena puede derivar «qué cámaras están encendidas» solo de `remoteUsers[].videoTrack`, sin señal adicional.
- **Agora factura a cada usuario por la suma de píxeles de los vídeos a los que está suscrito.** HD termina en 921.600 px (1280 × 720) y Full HD en 2.073.600 (1920 × 1080). CLAUDE.md documenta 3,99 $ y 8,99 $ por 1.000 min. Por encima está 2K, más cara; su precio no se pudo confirmar con el MCP de Agora.
- **Dual stream:** `enableDualStream()` en el publicador y `setRemoteVideoStreamType(uid, 0|1)` en el suscriptor. El flujo reducido por defecto es `{width:160, height:120, framerate:15, bitrate:50}` (literal del bundle): **4:3**, la misma trampa que el `480p_1` de la cámara.
- **Fastboard** coloca zoom y páginas en `.fastboard-bottom-right { position:absolute; bottom:8px; right:8px }`, justo donde irá el recuadro de cámaras.

## Goals / Non-Goals

**Goals:**

- Que el admin pueda entrevistar en cámara y en audio a un host en cualquier evento stream, sin configuración previa por evento.
- Que la composición de la escena sea idéntica para host, admin y audiencia, y que la dirija el admin.
- Que la cámara del host **no desaparezca** al compartir pantalla o activar la pizarra, en todo evento stream.
- Que compartir pantalla y usar la pizarra **no suban de banda** respecto a hoy. El sobrecoste queda acotado a los minutos con dos cámaras a tamaño completo, decisión asumida.
- Cerrar los tres caminos por los que la funcionalidad se rompería sola: el clic del host que banea al admin 24 h, la cámara duplicada en dos contenedores y la segunda presencia de host.

**Non-Goals:** ver `proposal.md`. En resumen, quedan fuera:
- más de un co-presentador visible;
- invitados no admin;
- `meeting` y LiveKit;
- pantalla o pizarra para el admin;
- la cámara del admin en la consola móvil del host;
- la composición en servidor.

## Decisions

### D1. El co-presentador se deriva; no hay columna ni configuración por evento

Co-presentador = `provider='agora'` ∧ `interaction_mode='broadcast'` ∧ `is_staff=1` ∧ `users.role='admin'` para ese email **hoy**. Un único predicado en `eventService` lo consumen token, renovación y socket.

- **Por qué sin flag de evento:** el coste solo aparece cuando el admin enciende su cámara, y nadie lo hará sin querer. Un checkbox «formato entrevista» sería otro sitio donde olvidarse de algo en el directo.
- **Por qué revalidar `users.role`:** la sesión de asistente del admin vive en `localStorage` y no caduca con el rol. `is_staff` es una foto del momento del acceso, suficiente para no cobrar, pero no para conceder publicación.
- **Alternativas descartadas:**
  - `events.cohost_user_id`: configuración manual por evento para una persona que es siempre la misma.
  - Token de co-host por JWT: reabre el camino paralelo que D6 del cambio archivado descartó con razones que siguen vigentes (ocho puntos que tendrían que arrastrar la excepción).

### D2. La pantalla va en un segundo cliente con uid reservado 2

En `broadcast`, `startScreenShare` crea un segundo `AgoraRTCClient` (`mode:'live'`, rol `host`) y lo une con `HOST_SCREEN_UID = 2` y un token de `POST /api/events/:id/screen-token` (JWT del host, evento `broadcast` activo). Publica ahí la pista de pantalla. El cliente principal no toca la cámara.

- El rango 1–100 ya estaba reservado «para uso del sistema» en `agoraService`: el 2 no colisiona con ningún asistente (≥ 101).
- Un endpoint propio en vez de otra rama de `host-token` o de `renew-token`: la pantalla es opcional y de vida corta, el token solo se pide al activarla, y la renovación del segundo cliente vuelve a llamar al mismo endpoint (idempotente).
- **El cliente principal del host ignora `user-published` del uid 2.** Sin esa guarda, el host descargaría su propia pantalla: ancho de banda de bajada y resolución facturada, para pintar lo que ya tiene en local.
- **El segundo cliente no registra manejadores de suscripción.** En modo `live`, suscribirse es explícito, así que no recibe nada.
- **`meeting` conserva el intercambio:** su recuadro destacado y su rejilla asumen «un track del host». Cambiarlo es otra decisión de producto y el usuario acotó la petición a stream.
- **Alternativas descartadas:**
  - Componer cámara y pantalla en un `canvas` y publicar una sola pista: CPU del host, pérdida de calidad del texto, e imposibilidad de que cada asistente elija flujo o de que la escena cambie de disposición.
  - Mantener el intercambio: es justo lo que se quiere eliminar.

### D3. La escena se compone en cada navegador; la disposición viaja por el socket de la sala

Cada cámara y la pantalla son pistas independientes: la disposición es solo CSS alrededor de `AgoraVideo`. La disposición elegida (`'split'` | `'pip'`) vive en memoria de `eventSocket.js`, en un `Map` hermano de `eventWhiteboards` y con el mismo ciclo de vida: se entrega en la respuesta de `join_event_room`, se difunde con `stage_layout` y se descarta en `broadcastEventEnded`.

- **Por qué el socket y no los *stream messages* de Agora:** un mensaje de datos RTC lo puede emitir cualquier publicador del canal, y ahí no hay forma de validar en servidor que el emisor es el co-presentador. La sala socket ya autentica y ya es la fuente de verdad de presencia, mano levantada y pizarra.
- **Por qué no BD:** la disposición es efímera. Un reinicio del proceso la devuelve a `'split'`, y los clientes convergen en su siguiente reconexión (el `connect` vuelve a unir y trae el valor).
- **Alternativa descartada: composición en servidor** (Media Push con transcodificación). Coste por minuto, segundos de latencia y una segunda tubería que mantener.

### D4. Contenido activo ⇒ esquina siempre dividida, derivado y sin mutar el estado

Regla pura de render: si hay pantalla o pizarra, el recuadro de esquina pinta las cámaras lado a lado; si no, se usa la disposición compartida. El valor compartido **no se toca**. Vuelve solo cuando termina el contenido, y el conmutador del admin se deshabilita mientras tanto.

- **Por qué:** cumple el «cambio automático a 50/50» sin mensajes extra, sin carreras entre el `screen_share` del host y el `stage_layout` del admin, y sin decidir qué valor restaurar.
- **Alternativa descartada, elegida así por el usuario:** cambio real a `'split'` al compartir, conmutable a recuadro dentro de recuadro.

```
 sin contenido, 'split'       sin contenido, 'pip'         pantalla o pizarra
┌────────────┬────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│            │            │  │                         │  │                         │
│    HOST    │   ADMIN    │  │          HOST           │  │   PANTALLA / PIZARRA    │
│  (cover)   │  (cover)   │  │        (contain)        │  │                         │
│            │            │  │              ┌────────┐ │  │         ┌──────┬──────┐ │
│            │            │  │              │ ADMIN  │ │  │         │ HOST │ADMIN │ │
└────────────┴────────────┘  └──────────────┴────────┴─┘  └─────────┴──────┴──────┴─┘
```

### D5. Coste: dual stream 480 × 270 para la esquina y pantalla a 1792 × 1008

| Escena del asistente | Suscripciones | px | Banda |
|---|---|---|---|
| Una cámara (hoy) | cam 720p | 921.600 | HD |
| Dividida o recuadro | 2 × cam 720p | 1.843.200 | Full HD (asumido) |
| Pantalla, sin admin | pantalla ≤ 1792×1008 + cam reducida | ≤ 1.935.936 | Full HD (= hoy) |
| Pantalla + admin | pantalla ≤ 1792×1008 + 2 × cam reducida | ≤ 2.065.536 | Full HD (= hoy) |
| Pizarra + dos cámaras | 2 × cam reducida | 259.200 | HD (= hoy) |

- **480 × 270 y no el defecto:** 160 × 120 es 4:3 y, recortado a una mitad 8:9 de un recuadro de ~300 px, es ilegible.
- **1792 × 1008 y no 1920 × 1080:** una pantalla 1080p llena Full HD hasta el último píxel, y cualquier cámara encima cruza a 2K. 1792 × 1008 conserva 16:9 y deja 267.264 px para dos flujos reducidos. La merma de nitidez del texto es inapreciable. Una pantalla 16:10 captura por debajo del límite en ancho y queda aún más holgada.
- **El recuadro de `'pip'` usa el flujo completo:** host 720p + cualquier cosa ya es Full HD (921.600 + 57.600 = 979.200 lo cruza), así que reducirlo solo empeoraría la imagen del admin sin ahorrar nada.
- **Activación:** tras `join()` resuelto, antes de publicar la cámara, en los clientes que emiten en `broadcast` (host y co-presentador): `setLowStreamParameter(AGORA_LOW_STREAM_PARAMETER)` y luego `enableDualStream()`. `publish()` añade el `LocalVideoLowTrack` si el modo dual ya está activo al publicar (visto en el bundle).
- **Suscriptor:** un efecto de `useAgoraRoom` recibe el mapa `{ uid → 0|1 }` que calcula la escena y llama a `setRemoteVideoStreamType` solo cuando el valor de un uid cambia.

### D6. Controles del co-presentador: misma instancia de `useHostMediaControls`, otra presentación

`useHostMediaControls` se habilita para host **o** co-presentador y sigue instanciándose una vez en `AgoraLiveRoom`. El co-presentador lo consume a través de un componente de presentación nuevo con micrófono, cámara, altavoces y disposición.

- Sin `videoQuality` habilitada: `selectVideoQuality` sale `null`, igual que hoy con el flag del evento a 0.
- No se renderizan pantalla, pizarra, efectos ni fin.
- `useAgoraVideoEffect` se sigue instanciando dentro del hook, pero la extensión solo se descarga al abrir su panel, y ese panel no existe para el co-presentador: coste cero.
- **Alternativa descartada:** reutilizar `MeetingSelfControls`. Tiene su propia instancia de `useAgoraDevices`, una segunda copia de la lógica que la spec `agora-host-mobile-console` prohíbe.

**Perfiles del co-presentador:**
- **Cámara:** `AGORA_CAMERA_ENCODER_HOST` (720p).
- **Micrófono:** `high_quality` **con** el 3A del navegador. El perfil de 128 kbps no cuesta nada, porque el audio tiene tarifa plana. El 3A se queda porque el admin oirá al host casi siempre por altavoces de portátil; es la misma razón por la que los asistentes lo conservan en `agora-host-audio-fidelity`.

### D7. Protección del staff en el servidor, no solo en la interfaz

`resolveAgoraAttendee`, `banFromChat` y `reportSpam` rechazan `is_staff = 1` con 400 antes de cualquier escritura. La casilla del co-presentador no tiene `onClick` y el chat no ofrece «Expulsar del chat» sobre sus mensajes, pero la garantía es el servidor. Hoy degradar crea una *kicking rule* de 24 h que solo retira una re-promoción, y la re-promoción también quedará rechazada: un clic accidental dejaría al admin sin publicar el resto del día.

- Aplica a **todo** staff y no solo al co-presentador: es más simple, y ningún flujo legítimo modera al dueño de la plataforma.
- El socket exime al co-presentador del antispam automático, que banea email **e IP**. En una entrevista presencial, esa IP podría ser la del estudio del artista.

### D8. Solo el host del evento es host, en `renewToken` y en `join_event_room`

Se retira la rama `decoded.role === 'admin'` de ambos:
- `renewToken` emitía tokens `HOST_UID` a cualquier admin; el cambio archivado lo dejó anotado como código muerto.
- `authenticateJoin` daba a un admin JWT `isHost: true, agoraUid: 1`.

Ningún cliente usa hoy esas ramas: `EventDetail` solo marca `isHost` si `user.id === host_user_id`, y el panel admin lee la presencia del servidor, no la sala. Con un co-presentador en la sala dejarían de ser inocuas: una segunda presencia de host rompe la resolución de «la cámara del host» y habilita `whiteboard_toggle`, `screen_share` y `moderate_force_mute` desde un admin.

### D9. Recuadros, pizarra y botón de teatro

- **Tamaños:** el recuadro de `'pip'` arranca en ~26 % del ancho de la escena y el de esquina en ~34 % (dos mitades 8:9 dentro de un 16:9), ambos con margen de 8–12 px. Viven en `constants.js` y se ajustan a ojo en la verificación.
- **Con la pizarra:** la esquina sube por encima de `.fastboard-bottom-right` (~56 px). El desplazamiento es igual para todos los roles, porque fastboard escala el lienzo al contenedor 16:9 y así la zona tapada es la misma para quien escribe y para quien mira.
- **Botón de teatro:** pasa a la esquina superior derecha en toda la escena, donde ya está sobre la pizarra.

### D10. Un solo co-presentador visible

La escena toma el primer `coHost` de la presencia que tenga vídeo. El orden de la presencia es el de entrada: `presence_joined` añade al final y la respuesta de unión conserva el orden del `Map`. Los demás co-presentadores se oyen.

**Alternativa descartada:** rejilla de N cámaras. Es otro producto, cruza a 2K con tres cámaras y el usuario ha pedido dos.

## Risks / Trade-offs

- **[Host a 1080p con admin en cámara]** Si el evento permite elegir calidad y el host elige 1080p, la entrevista suma 2.995.200 px y cruza a 2K. → Documentado en CLAUDE.md junto al flag. No se fuerza un tope automático: el flag ya es una concesión consciente del admin, y el admin es quien entrevista.
- **[Safari 17.2 no cambia al flujo reducido]** Es un problema conocido del SDK: esos asistentes reciben la cámara de la esquina a tamaño completo y cruzan a 2K mientras hay pantalla compartida. → Asumido: afecta solo a esos asistentes y solo durante esos minutos.
- **[Publicador sin soporte de dual stream]** La esquina se sirve a tamaño completo y el efecto es el mismo que el anterior. → Se registra un aviso en consola, sin error visible.
- **[Pizarra y pantalla a la vez]** La pizarra tiene prioridad y la pantalla no se pinta, pero los asistentes siguen suscritos al uid 2 y lo pagan. → Caso raro y preexistente (hoy la pantalla se veía en el mosaico pequeño). Se anota: la mejora sería desuscribir el vídeo del uid 2 mientras no se pinta.
- **[Eco en entrevistas remotas]** El host emite por defecto **sin** cancelación de eco (`host_echo_cancellation = 0`, `agora-host-audio-fidelity`). En una entrevista oye al admin continuamente; si lo hace por altavoz, la voz del admin vuelve al canal. → Procedimiento operativo, no código:
  - el host usa auricular, o el admin marca «El host escuchará a los invitados por altavoz» en ese evento;
  - el admin usa auriculares o conserva su AEC, que ya va activo;
  - **entrevista en la misma sala:** una sola cadena de audio. El admin deja su micrófono apagado y habla por el micrófono del host, o los dos van con auriculares. Dos micrófonos abiertos y un altavoz en la misma habitación acoplan.

  La ayuda del checkbox se amplía para mencionar las entrevistas.
- **[Tres codificaciones en el equipo del host]** Cámara 720p, flujo reducido 480 × 270 y pantalla 1792 × 1008 a 30 fps (el `1080p_2` que el SDK ya aplicaba por omisión, con el techo rebajado). → Asumible en portátil. La consola móvil no comparte pantalla (Chrome Android no lo soporta), así que en el teléfono solo se añade el flujo reducido.
- **[Doble pestaña del host]** El uid 2 también da `UID_CONFLICT`. → Mismo mensaje y misma causa que ya cubre el uid 1.
- **[*Kicking rule* previa sobre el uid del admin]** Solo existiría si el host lo hubiera degradado antes de este cambio, cosa imposible: nunca fue `speaker`, y un clic sobre un no-speaker llama a promover. → Sin mitigación en código.
- **[Reinicio del API a mitad de entrevista]** La disposición vuelve a `'split'`. → Aceptable: un clic del admin la restablece.
- **[Recorte en la vista dividida]** Se pierde ~50 % del ancho de cada imagen. Si el host enseña obra a su lado, puede quedar fuera. → Elegido así. El admin puede pasar a `'pip'`, que muestra el encuadre completo del host.
- **[Ruido de Sentry del SDK en iOS, visto en la verificación: 140D-CLIENT-1Y]** Al cambiar de cámara en un iPad (Chrome, motor WebKit) llegó un `AbortError: The operation was aborted.` sin pila, como rechazo sin capturar.
  - **Origen:** el reproductor de vídeo de `agora-rtc-sdk-ng` escucha el fin de una interrupción de audio de iOS (`SM.on(IOS_INTERRUPTION_END, autoResumeAfterInterruption)`) y reanuda el `<video>` con un `play()` sin `.catch`. La sustitución de pista que hace `setDevice` reasigna `srcObject` inmediatamente después, lo que aborta ese `play()`.
  - **Por qué no es nuestro:** el siguiente `play()` del propio SDK sí se captura y deja el vídeo funcionando. No es un defecto de este cambio, porque `setDevice` ya existía para el host y en `meeting`.
  - **Descartado:** `checkVideoTrackIsActive`, que tiene otro `play()` sin capturar, es una API pública que el SDK no invoca internamente.
  - → **Mitigación:** filtro `beforeSend` en `client/instrumentation-client.js`, con el predicado en `client/lib/sentryNoise.js`. Exige a la vez un `AbortError` con el mensaje exacto de WebKit, un rechazo sin capturar y una página `/live/…`. No se usa `ignoreErrors`, porque el mismo mensaje de WebKit es el de cualquier `AbortSignal` abortado sin motivo.

## Migration Plan

1. **Sin migración de datos:** ninguna columna nueva. La disposición y la condición de co-presentador son derivadas o efímeras.
2. **API y cliente se despliegan juntos** (`./deploy/deploy.sh` ya lo hace). Un cliente nuevo contra una API vieja no encuentra `screen-token` y no puede compartir pantalla. Un cliente viejo contra una API nueva sigue funcionando: los campos `coHost` y `stageLayout` son aditivos, y las ramas retiradas no las usaba nadie.
3. **La consola de Agora debe seguir con Co-host authentication activo.** Es la garantía de que un `subscriber` no publica, y ahora también de que el uid 2 solo publica con el token del host.
4. **Rollback:** revertir el commit y redesplegar. No queda estado persistido que limpiar. Las *kicking rules* no se tocan en ningún camino nuevo.

## Open Questions

- **Tamaños finales de los recuadros** (D9): se fijan a ojo en la verificación en dispositivo, sobre todo en móvil vertical, donde la escena mide ~360 px de ancho.
- ~~**Perfil por defecto de la pantalla.**~~ Resuelto al implementar. Sin `encoderConfig`, `createScreenVideoTrack` aplica `"1080p_2"` = `Ak(1920, 1080, 30)`: techo de 1920 × 1080, **30 fps** y sin bitrate fijo. `AGORA_SCREEN_ENCODER_BROADCAST` conserva los 30 fps y la ausencia de bitrate, y solo rebaja el techo a 1792 × 1008. El flujo reducido va a 300 kbps, a ajustar si se ve blando en la verificación.
- **Activar el dual stream solo al compartir.** Si `enableDualStream()` funciona después de `publish()` en 4.24.6, el flujo reducido podría activarse solo cuando hace falta (contenido activo) y ahorrar ~350 kbps de subida al host el resto del tiempo. Se verifica y, si funciona, se deja como mejora posterior, no como parte de este cambio.
