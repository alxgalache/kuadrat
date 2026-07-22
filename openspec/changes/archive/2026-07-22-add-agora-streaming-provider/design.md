# Design: add-agora-streaming-provider

## Context

La sección Espacios/Live soporta dos formatos de evento:

- **`format='live'`** (streaming en directo): hoy 100% LiveKit. El admin inicia el evento (`POST /api/admin/events/:id/start`) y el backend crea la sala `event-{id}` (`livekitService.createRoom`). El host obtiene token con `canPublish + roomAdmin`; los asistentes token con `canPublish:false, canPublishData:true` (o `false` si `chat_banned`). La sala (`client/components/EventLiveRoom.js`) implementa: vídeo del host (screen share con preferencia sobre cámara), overlay de activación de audio, grid de tiles de participantes (iniciales + estados por color, host primero, mano levantada priorizada, local al final), levantar la mano (atributo de participante LiveKit `handRaised`), promoción/degradación server-side (`RoomServiceClient.updateParticipant`), auto-activación de micro al ser promovido, chat lateral por data channel (`useChat`) con detección de spam en cliente (>10 msgs/10 s → `report-spam`), expulsión del chat (revoca `canPublishData` + `chat_banned` en BD), detección de kick (`DisconnectReason.PARTICIPANT_REMOVED`), selector de dispositivos (`useMediaDeviceSelect` para audioinput/videoinput/audiooutput), pantalla completa, indicador de "hablando" (`useIsSpeaking`), y fin de stream (borra la sala LiveKit + broadcast Socket.IO `event_ended`).
- **`format='video'`** (pase de vídeo pregrabado): agnóstico al proveedor. `EventVideoPlayer.js` sincroniza la reproducción contra `video_started_at` + offset de reloj de servidor (modo cine, sin seek), y el chat va por Socket.IO (`chat_message` en `api/socket/eventSocket.js`). **No se toca en este cambio.**

Los flujos de acceso (registro, OTP, contraseña, pago Stripe, bans por email/IP) y el ciclo de vida (`draft→scheduled→active→finished`) son agnósticos al proveedor y no cambian.

Decisiones ya aprobadas por el usuario: (1) chat/presencia/mano levantada de eventos Agora vía **Socket.IO propio** (no RTM); (2) **`interaction_mode` por evento** (`broadcast` | `meeting`), solo Agora; (3) **pizarra como fase opcional** separable.

## Goals / Non-Goals

**Goals:**
- Paridad funcional exacta del modo `broadcast` de Agora con la experiencia LiveKit actual (misma UI/UX, mismos textos es-ES, mismos flujos de moderación).
- Modo `meeting` (solo Agora): grid de cámaras estilo Meet con auto-control de cámara/micrófono por participante.
- Ambos proveedores co-existentes e intercambiables por evento; los eventos LiveKit no cambian en nada.
- Enforcement server-side real (la audiencia no puede publicar aunque manipule el cliente).
- Pizarra interactiva como fase final separable.

**Non-Goals:**
- Migrar eventos existentes; tocar `EventVideoPlayer`/pases de vídeo; RTM/Agora Chat; Cloud Recording/RTMP; modo `meeting` en LiveKit; variables `NEXT_PUBLIC_*`.

## Decisions

### D1. SDKs y paquetes

| Uso | Paquete | Notas |
|---|---|---|
| Tokens RTC (api) | `agora-token` (oficial, AccessToken2) | Generación local, sin red. `const { RtcTokenBuilder, RtcRole } = require('agora-token')`; `RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, uid, role, tokenExpire, privilegeExpire)`; roles `RtcRole.PUBLISHER` / `RtcRole.SUBSCRIBER`. |
| REST moderación (api) | `fetch` nativo Node 20 | Basic Auth `AGORA_CUSTOMER_ID:AGORA_CUSTOMER_SECRET`. |
| Cliente RTC | `agora-rtc-sdk-ng` (Web SDK 4.x) | Import dinámico `ssr:false` (el SDK toca `window`), mismo patrón que `EventLiveRoom`. Se descarta `agora-rtc-react` para no acoplar la UI a un wrapper con menos control; los hooks propios (`useAgoraRoom`) envuelven el SDK directamente. |
| Pizarra (fase opcional) | api: `netless-token`; client: `@netless/fastboard` + `@netless/fastboard-react` | Ver D10. |

**Alternativa considerada**: `agora-rtc-react` (wrapper oficial React). Rechazada: añade una capa de abstracción sobre la que tendríamos que "escapar" para el flujo promote/demote con re-token y el swap cámara↔pantalla; con hooks propios el control del ciclo de vida es explícito y el bundle menor.

### D2. Modelo de datos (`api/config/database.js`)

Columnas nuevas (actualizar `CREATE TABLE` **y** añadir `safeAlter` idempotentes, patrón existente del fichero):

```sql
-- events
provider TEXT NOT NULL DEFAULT 'livekit' CHECK(provider IN ('livekit','agora'))
interaction_mode TEXT NOT NULL DEFAULT 'broadcast' CHECK(interaction_mode IN ('broadcast','meeting'))
agora_channel_name TEXT              -- se fija al iniciar el evento: 'event-{id}'
whiteboard_room_uuid TEXT            -- fase opcional pizarra (NULL si no se usa)

-- event_attendees
agora_uid INTEGER                    -- uid RTC numérico, asignado en el primer token (>= 101)
speaker_granted INTEGER NOT NULL DEFAULT 0  -- promoción vigente (broadcast): 1 = puede publicar
```

Reglas:
- `interaction_mode` solo es significativo con `provider='agora'`; para LiveKit se ignora (siempre broadcast).
- `provider` es **inmutable una vez el evento está `active` o `finished`** (el update admin ya bloquea la edición de eventos activos/finalizados, lo que lo garantiza).
- `format='video'` ignora `provider` (el pase de vídeo no usa RTC).

### D3. Identidades y uids

- Las **identidades de la API pública no cambian**: `host-{userId}` y `viewer-{attendeeId}` siguen siendo el contrato de los endpoints de moderación (`/participants/:identity/...`), igual que con LiveKit.
- Agora exige uid numérico (uint32) por canal. Convención: **host = 1** (reservados 1–100 para sistema); asistentes: `agora_uid` secuencial por evento asignado al emitir su primer token (`COALESCE(MAX(agora_uid),100)+1` sobre `event_attendees` del evento, con reintento ante colisión por carrera). El mapeo `identity ⇄ agora_uid` lo resuelve el backend; la presencia Socket.IO lo distribuye a los clientes para ligar tracks RTC (por uid) con tiles (por identity).

### D4. Tokens y enforcement (crítico)

- En la consola de Agora se activa **Co-host authentication** en el proyecto. Con ello, para publicar hace falta A LA VEZ `setClientRole('host')` en cliente **y** token generado con `RtcRole.PUBLISHER`. Un token `SUBSCRIBER` no puede publicar aunque el cliente se manipule → equivalente real del `canPublish:false` de LiveKit.
- Emisión (en `agoraService.js`, TTL 4 h — paridad con LiveKit):
  - Host: `PUBLISHER`.
  - Asistente en `broadcast`: `SUBSCRIBER` si `speaker_granted=0`; `PUBLISHER` si `speaker_granted=1`.
  - Asistente en `meeting`: `PUBLISHER` siempre.
- `POST /api/events/:id/token` y `/host-token` devuelven, si `provider='agora'`: `{ provider:'agora', appId, channel, uid, rtcToken, interactionMode }` (el `appId` viaja en runtime — mismo patrón que `livekitUrl` hoy; **sin** `NEXT_PUBLIC_*`).
- Nuevo `POST /api/events/:id/renew-token` (mismas credenciales que `/token`, o JWT de host): re-evalúa `speaker_granted`/bans y devuelve token fresco. El cliente lo invoca en `token-privilege-will-expire` y tras ser promovido/degradado.

### D5. Moderación server-side (equivalencias LiveKit → Agora)

| Acción actual (LiveKit) | Implementación Agora |
|---|---|
| `updateParticipant` promote (`canPublish:true` + borra `handRaised`) | `speaker_granted=1` + eliminar kicking rule de publicación si existiera + Socket.IO `promoted` al objetivo → el cliente pide `renew-token` (PUBLISHER), hace `setClientRole('host')`, publica micro (auto-on, paridad) y el servidor limpia su mano levantada en presencia |
| `updateParticipant` demote (`canPublish:false`) | `speaker_granted=0` + **kicking rule** `POST https://api.agora.io/dev/v1/kicking-rule` `{appid, cname, uid, privileges:['publish_audio','publish_video'], time:1440}` (enforcement duro, máx. 24 h) + Socket.IO `demoted` → cliente des-publica y vuelve a `audience` |
| `mutePublishedTrack` (admin) | Socket.IO `force_mute` → el cliente silencia su micro (soft-mute; ver Risks R4) |
| `removeParticipant` (hoy sin uso user-facing) | Capacidad en `agoraService.kickUser` (kicking rule `join_channel`); sin endpoint nuevo (paridad: hoy tampoco hay kick expuesto). El cliente detecta `connection-state-change` con razón `UID_BANNED` → mismo flujo `onKicked` |
| `listParticipants` (admin) | Presencia Socket.IO del backend (autoritativa: identidades, nombres, mano, speaker). Sin dependencia del REST `GET /dev/v1/channel/user/...` (queda documentado como herramienta de diagnóstico) |
| Borrar sala al finalizar | No existe/no hace falta: canales Agora son implícitos. `event_ended` por Socket.IO → clientes hacen `client.leave()`. Los tokens dejan de emitirse (evento no `active`) |

La gestión de kicking rules guarda `ruleId` en memoria (`Map cname:uid → ruleId`) con recuperación vía `GET /dev/v1/kicking-rule?appid=` si el proceso reinicia.

### D6. Sala de evento Socket.IO (solo eventos Agora)

Ampliar `api/socket/eventSocket.js` con una **sala autenticada** por evento (`event-room-{eventId}`), coexistiendo con la sala pública actual `event-{eventId}` (notificaciones start/end y chat de pases de vídeo, que no cambian):

- `join_event_room { eventId, attendeeId, accessToken }` (asistente) o `{ eventId, hostToken: JWT }` (host/admin). El servidor re-valida como el endpoint de token (evento activo+agora, acceso, pago, bans email/IP). ACK: presencia completa + tu identidad. Rechazo: `room_join_denied`.
- Presencia: entrada `{ identity, name, isHost, agoraUid, handRaised, speaker, chatBanned }`; broadcasts `presence_joined` / `presence_left` / `presence_updated`. Resuelve la **invisibilidad de la audiencia** de Agora (los no-publicadores no aparecen como `remoteUsers` en RTC) y alimenta el grid de tiles y el contador "N conectados".
- Chat: `event_chat_message { text }` → el servidor **descarta** si `chat_banned` (enforcement server-side, más fuerte que el filtro cliente de LiveKit, misma UX) → broadcast `{ identity, name, message, timestamp }`. Sin historial para quien entra tarde (paridad con LiveKit). Detección de spam **en servidor** (mismos umbrales: >10 mensajes/10 s → auto chat-ban + ban email/IP, como `report-spam`).
- Mano levantada: `hand_raise { raised }` → actualiza presencia + broadcast (paridad con el atributo LiveKit).
- Moderación saliente: `promoted` / `demoted` / `force_mute` / `chat_banned` (dirigidos por identity).
- Desconexión del socket ⇒ `presence_left` (el RTC puede sobrevivir unos segundos; la presencia manda en la UI).

### D7. Componente de sala Agora (`client/components/AgoraLiveRoom.js`)

Componente nuevo, hermano de `EventLiveRoom.js` (que **no se modifica**, salvo la extracción de mínimos presentacionales compartidos, ver D9). `EventDetail.js` elige por `event.provider`. Hook central `client/hooks/useAgoraRoom.js` (join/leave, tracks, roles, renovación, eventos RTC) + `useEventRoomSocket.js` (presencia/chat/mano/moderación).

**Modo `broadcast` — paridad 1:1 con la UI actual**: mismo layout dos columnas (vídeo + chat lateral con altura sincronizada), área de vídeo del host con "Esperando al host..."/"Tu vista de presentador", overlay "Activar audio" (disparado por `AgoraRTC.onAutoplayFailed`, mismo modal), grid de promovidos con sus cámaras, grid de tiles por iniciales con los mismos estados/colores/badges/orden y acciones por clic (promote/demote del host, self-mute del promovido), botón "Levantar mano"/"Bajar mano", controles de host (toggles micro/cámara/pantalla + selectores de dispositivo + "Finalizar stream" con confirmación), pantalla completa para viewers, indicador de "hablando" vía `client.enableAudioVolumeIndicator()` + evento `volume-indicator` (nivel > umbral ⇒ anillo verde pulsante; cadencia 2 s, ver R5).

**Modo `meeting`**: layout repensado tipo Meet — grid responsivo de tiles grandes (1/2/3/4 columnas según asistentes; aforo máx. 16), cada tile con vídeo (o avatar de inicial si cámara off), nombre, badge de micro y anillo de "hablando"; barra inferior de controles para TODOS (micro, cámara, selectores de dispositivo; host además: pantalla, pizarra en fase opcional, "Finalizar evento"); chat lateral idéntico (mismo `ChatPanel` vía Socket.IO); moderación del host disponible (silenciar a un participante → `force_mute`; expulsar del chat). Todos entran como `PUBLISHER` con micro **muteado y cámara apagada por defecto** (evita el caos de entrada; cada uno enciende lo suyo).

**Screen share (host)**: swap en un solo cliente — al activar "Pantalla": `createScreenVideoTrack()` → `unpublish(cámara)` → `publish(pantalla)`; al parar (toggle o "Dejar de compartir" del navegador, evento `track-ended`): vuelta a la cámara si estaba activa. Paridad visual garantizada: la UI actual solo muestra un track del host (pantalla con preferencia). **Alternativa rechazada**: segundo cliente RTC con uid dedicado para pantalla+cámara simultáneas (limitación Web SDK: un cliente = un track de vídeo); complica uids, presencia y facturación sin beneficio visible en esta UI.

### D8. Ciclo de vida y endpoints (backend)

- `startEvent` (admin): rama `provider='agora'` → sin llamada externa (canales implícitos): fija `agora_channel_name='event-{id}'`, `status='active'`, broadcast `event_started` (igual que hoy). LiveKit conserva su rama intacta.
- `endEvent` (host y admin): rama Agora → `status='finished'` + `finished_at` + `event_ended` (los clientes hacen `leave()`); sin borrado de sala. LiveKit intacto.
- `getViewerToken`/`getHostToken`: mismas validaciones actuales; bifurcan la respuesta por `provider` (LiveKit: `{token, roomName, livekitUrl}` sin cambios; Agora: D4). El asistente pasa a `joined` igual que hoy.
- `promote`/`demote` (público-host y admin) y `mute` (admin): bifurcan por proveedor (LiveKit: código actual intacto; Agora: D5).
- Nuevo `POST /api/events/:id/renew-token` (limiter general; validador Zod nuevo en `api/validators/eventSchemas.js`).
- Validadores: `createEventSchema`/`updateEventSchema` aceptan `provider` y `interaction_mode` (enums Zod); regla: `interaction_mode='meeting'` ⇒ `provider='agora'` y `max_attendees` obligatorio ≤ 16.
- `api/config/env.js`: grupo `agora { appId, appCertificate, customerId, customerSecret }` con `optional(...)` (mismo patrón que `livekit`); `agoraService` lanza error claro si se usa sin configurar. Fase pizarra: grupo `agoraWhiteboard { appIdentifier, ak, sk, region }`.

### D9. Admin UI

- `client/app/admin/espacios/nuevo/page.js` y `[id]/page.js`: en la sección "Formato", con `format='live'`: select "Proveedor de streaming" (`LiveKit` | `Agora`, defecto LiveKit); con `provider='agora'`: select "Modo de interacción" (`Stream (mano levantada)` | `Reunión (cámaras)`) y, si `meeting`, aforo obligatorio ≤ 16 con ayuda "Límite técnico de Agora: 17 emisores de vídeo simultáneos".
- Detalle admin de evento activo Agora: la lista "Participantes en sala" se alimenta del nuevo `GET /api/admin/events/:id/participants` (rama Agora: presencia Socket.IO del backend) con las mismas acciones promote/demote/mute.
- Extracción presentacional mínima compartida: dropdown de dispositivos (`client/components/events/DeviceDropdown.js`, solo markup) usado por el `DeviceSelector` actual (LiveKit, lógica intacta) y por el selector Agora (lógica en `useAgoraDevices.js`: `AgoraRTC.getMicrophones()/getCameras()/getPlaybackDevices()`, `track.setDevice()`, altavoces vía `audioTrack.setPlaybackDevice()`, hot-plug con `AgoraRTC.onMicrophoneChanged/onCameraChanged/onPlaybackDeviceChanged`). Tarea marcada de riesgo por tocar un componente estable.

### D10. Fase opcional — Pizarra interactiva (Agora Interactive Whiteboard)

Viable y documentado; fase final separable (puede omitirse íntegra sin afectar al resto).

- **Flujo**: el host pulsa "Pizarra" → backend (lazy) crea la sala si no existe (`POST https://api.netless.link/v5/rooms`, headers `token: <SDK Token>`, `region: <AGORA_WHITEBOARD_REGION>`) y guarda `whiteboard_room_uuid`; genera room tokens por rol (host: `writer`; asistentes: `reader`; en `meeting`, opción "todos escriben" = `writer`) con `netless-token` (AK/SK, server-side); Socket.IO `whiteboard_toggle {active}` → los clientes montan `createFastboard({ sdkConfig:{appIdentifier, region}, joinRoom:{ uid, uuid, roomToken } })` + `mount()`. La pizarra ocupa el área principal (el vídeo del host pasa a tile reducido; el audio no se interrumpe).
- **Endpoint**: `POST /api/events/:id/whiteboard-token` (mismas credenciales que `/token`) → `{ appIdentifier, region, uuid, roomToken, role }`.
- **Credenciales**: App Identifier + AK/SK se obtienen al activar Whiteboard en la consola (región UE, p. ej. `eu`). El SDK Token se genera **siempre en servidor** con AK/SK (los generados en consola son de alto privilegio, solo para pruebas).
- Creación lazy = coste cero para eventos que no usan pizarra (facturación por minuto-usuario aparte).

### D11. Configuración en la consola de Agora (pasos manuales, cuenta ya creada)

1. **Proyecto**: Console → Projects → crear/usar proyecto en modo seguro ("Secured mode: App ID + Token"). Copiar **App ID** → `AGORA_APP_ID`.
2. **App Certificate**: Edit del proyecto → habilitar **Primary Certificate**. Copiar → `AGORA_APP_CERTIFICATE`.
3. **Co-host authentication**: Edit del proyecto → ALL FEATURES → **Co-Host authentication** → Enable (tarda ~5 min en propagar). **Imprescindible** para que el rol del token se aplique (sin esto, cualquier asistente podría publicar).
4. **RESTful API**: Console → Account/Settings → **RESTful API** → Generate → copiar **Customer ID** y **Customer Secret** → `AGORA_CUSTOMER_ID` / `AGORA_CUSTOMER_SECRET` (Basic Auth de kicking rules y diagnóstico de canal).
5. *(Fase pizarra)* Edit del proyecto → ALL FEATURES → **Whiteboard** → Enable (elegir región UE) → Basic information: copiar **App Identifier**, **AK**, **SK** → `AGORA_WHITEBOARD_APP_IDENTIFIER` / `AGORA_WHITEBOARD_AK` / `AGORA_WHITEBOARD_SK`; `AGORA_WHITEBOARD_REGION=eu`.
6. Añadir las variables a `/.env`, `api/.env.example` (documentadas) y al despliegue (compose profiles prod/staging — solo servicio api; **no** hay build-args de cliente).

## Risks / Trade-offs

- **[R1] Co-host authentication sin activar** → la audiencia podría publicar con cualquier token. Mitigación: paso 3 de D11 documentado como bloqueante; verificación manual en el plan de pruebas (intentar publicar con token SUBSCRIBER debe fallar); log de arranque si `agora` configurado.
- **[R2] Kicking rules limitadas a 24 h y por uid** → un degradado podría re-publicar pasado ese tiempo o con otro uid. Mitigación: el enforcement primario es el token (`speaker_granted` en renovaciones); la regla es cinturón-y-tirantes; los uids los asigna el backend.
- **[R3] Estado de promociones/reglas en memoria + Socket.IO sin adapter multi-instancia** → igual que hoy (subastas/eventos ya asumen instancia única de api). `speaker_granted` persiste en BD, así que un reinicio no rompe permisos; solo se pierde el mapa de ruleIds (recuperable vía REST list).
- **[R4] `force_mute` es soft (cooperación del cliente)** frente al mute server-side de LiveKit. Mitigación: para silenciar con enforcement duro el host puede degradar (kicking rule). Diferencia asumida y documentada; UX idéntica en el camino feliz.
- **[R5] Indicador de "hablando" con cadencia de 2 s** (`volume-indicator`) frente al `isSpeaking` casi instantáneo de LiveKit. Asumido: misma señal visual, ligeramente menos reactiva.
- **[R6] Autoplay bloqueado por el navegador** → overlay "Activar audio" sobre `onAutoplayFailed` (paridad con el actual).
- **[R7] `meeting` con >17 emisores de vídeo** → validación dura `max_attendees ≤ 16` en Zod + formulario admin.
- **[R8] SSR/Next**: `agora-rtc-sdk-ng` no es SSR-safe → import dinámico `ssr:false` (patrón ya usado con LiveKit).
- **[R9] Pizarra: producto y facturación aparte** → fase opcional, creación lazy de salas, y toda credencial solo en servidor.

## Migration Plan

1. Deploy backend + frontend (columnas aditivas vía `safeAlter`; `provider` defecto `'livekit'` ⇒ comportamiento idéntico hasta que el admin cree un evento Agora).
2. Configurar consola Agora (D11 pasos 1–4) y variables de entorno del api; reiniciar.
3. Evento de prueba Agora `broadcast` (gratis, draft→scheduled→active) validando el checklist de paridad; después uno `meeting`.
4. *(Opcional)* Activar Whiteboard (D11 paso 5) y aplicar la fase de pizarra.
5. **Rollback**: dejar de crear eventos Agora (o editarlos a `livekit` mientras estén `draft`/`scheduled`). Las columnas nuevas son inertes para LiveKit. Sin migración de datos reversible necesaria.

## Open Questions

- Ninguna bloqueante (las tres decisiones de producto están aprobadas). Pendiente solo de implementación: confirmar en la consola del usuario que el plan de la cuenta permite activar Whiteboard en región UE antes de aplicar la fase opcional.
