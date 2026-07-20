# Proposal: add-agora-streaming-provider

## Why

La sección "Espacios/Live" depende de un único proveedor de streaming (LiveKit). Se necesita un segundo proveedor, **Agora**, plenamente co-existente e intercambiable por evento, por dos motivos: (1) resiliencia y flexibilidad comercial ante costes/límites del proveedor único, y (2) habilitar un modo de interacción adicional tipo "reunión" (grid de cámaras estilo Meet/Teams, con auto-control de cámara y micrófono por participante) que Agora cubre bien y que hoy no existe, útil para talleres reducidos frente a los streams masivos actuales.

## What Changes

- **Selección de proveedor por evento**: al crear/editar un evento en el admin, se elige `provider` (`livekit` | `agora`). Los eventos existentes y el valor por defecto siguen siendo `livekit` (cero impacto retroactivo).
- **Modo de interacción por evento (solo Agora)**: nuevo campo `interaction_mode` (`broadcast` | `meeting`):
  - `broadcast` = paridad exacta con la experiencia LiveKit actual: todos los participantes muteados por defecto, levantar la mano, el host concede/retira la palabra, host con cámara/micro/compartir pantalla/selector de dispositivos, chat lateral con moderación (expulsión de chat, anti-spam), expulsión de sala.
  - `meeting` = grid de cámaras estilo Meet: cada participante puede encender/apagar su webcam y mutearse/des-mutearse; pensado para talleres de pocas personas (aforo recomendado ≤ 16; límite técnico de Agora: 17 emisores de vídeo simultáneos).
- **Servicio backend Agora** (`api/services/agoraService.js`): generación de tokens RTC (paquete oficial `agora-token`, AccessToken2, roles PUBLISHER/SUBSCRIBER), y moderación server-side vía API REST de Agora (kicking rules: bloquear `publish_audio`/`publish_video`/`join_channel`; listado de usuarios del canal).
- **Sala en tiempo real por Socket.IO para eventos Agora** (`api/socket/eventSocket.js` ampliado): presencia autenticada con nombres (la audiencia de Agora es invisible en el canal RTC al no publicar), chat con enforcement de `chat_banned` en servidor, estado de mano levantada y órdenes de moderación (promote/demote/kick). Los eventos LiveKit no cambian: siguen usando los mecanismos nativos de LiveKit.
- **Componente de sala Agora** (`client/components/AgoraLiveRoom.js`): UI/UX calcada de `EventLiveRoom.js` en modo `broadcast` (mismo layout, tiles, chat, controles y textos es-ES) y layout de grid de cámaras en modo `meeting`.
- **Endpoints de token unificados**: `POST /api/events/:id/token` y `/host-token` devuelven credenciales según el `provider` del evento (para Agora: `appId`, `channel`, `uid`, `rtcToken`); renovación de token para sesiones largas.
- **Cambio de esquema de BD** (`api/config/database.js`): columnas nuevas en `events` — `provider`, `interaction_mode`, `agora_channel_name` (+ `safeAlter` idempotente, patrón existente).
- **Fase opcional — Pizarra interactiva (Agora Interactive Whiteboard)**: toggle del host en eventos Agora para compartir una pizarra (Fastboard SDK); backend crea la sala de pizarra vía REST y emite room tokens (writer para host, reader para asistentes; en modo `meeting`, opción de escritura para todos). Fase final claramente separable: puede omitirse sin afectar al resto.
- **Sin cambios** en: pases de vídeo pregrabado (`EventVideoPlayer` y su sincronización tipo cine son agnósticos al proveedor), flujos de acceso (registro, OTP, contraseña, pago), emails, payouts y schedulers.

## Capabilities

### New Capabilities
- `agora-streaming-provider`: selección de proveedor por evento, tokens y ciclo de vida de canal Agora, sala en directo Agora en modos `broadcast` (paridad LiveKit) y `meeting` (grid de cámaras), chat/presencia/mano levantada vía Socket.IO con moderación server-side, integración en admin (formulario, participantes, moderación) y configuración/entorno.
- `agora-whiteboard`: pizarra interactiva compartida en eventos Agora (fase opcional y separable): credenciales y sala de pizarra, tokens de sala, toggle del host y visualización para asistentes.

### Modified Capabilities
- (ninguna — las specs existentes `host-device-selector`, `live-events-ux-improvements`, `event-email-verification`, `event-password-access`, `event-payouts` y `live-event-announcement` describen requisitos de la experiencia LiveKit o flujos agnósticos al proveedor, que no cambian; los requisitos equivalentes para Agora se definen en la nueva capability)

## Impact

- **Capas afectadas**: backend y frontend.
- **Esquema de BD**: SÍ — columnas nuevas en `events` (actualizar `CREATE TABLE` en `api/config/database.js` + líneas `safeAlter`, siguiendo el patrón vigente del fichero).
- **Dependencias nuevas**:
  - api: `agora-token` (generación de tokens, sin llamadas de red); llamadas REST a `api.agora.io` con `fetch` nativo (sin SDK).
  - client: `agora-rtc-sdk-ng` (Web SDK 4.x; import dinámico solo en cliente, igual que se hace con LiveKit).
  - client (fase opcional pizarra): `@netless/fastboard` (+ wrapper React).
- **Variables de entorno** (todas server-side, sin `NEXT_PUBLIC_*`: el `appId` viaja al cliente en la respuesta del endpoint de token, mismo patrón que `livekitUrl` hoy): `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET`; pizarra: `AGORA_WHITEBOARD_APP_IDENTIFIER`, `AGORA_WHITEBOARD_AK`, `AGORA_WHITEBOARD_SK`, `AGORA_WHITEBOARD_REGION`.
- **Configuración en consola Agora** (manual, documentada en design.md): App ID + App Certificate, activar **Co-host authentication** (imprescindible: hace que el rol del token se aplique de verdad y la audiencia no pueda publicar), credenciales RESTful (Customer ID/Secret) y, para la fase opcional, activar Whiteboard (región UE).
- **APIs**: `POST /api/events/:id/token`, `/host-token` (respuesta condicionada por proveedor), nuevos `POST /api/events/:id/renew-token` y endpoints de moderación reutilizados (`promote`/`demote`/`mute` pasan a ser conscientes del proveedor); admin: `GET /api/admin/events/:id/participants` consciente del proveedor.
- **Socket.IO**: `api/socket/eventSocket.js` gana salas autenticadas de evento (presencia, chat moderado, mano levantada, señales de moderación) usadas solo por eventos Agora.

## Non-goals

- No se elimina ni se degrada LiveKit; no se migran eventos existentes.
- No se usa Agora Signaling (RTM) ni Agora Chat: el tiempo real auxiliar va por nuestro Socket.IO (decisión aprobada).
- No se implementa grabación en la nube (Cloud Recording), RTMP/Media Push ni streaming a terceros.
- No cambian los pases de vídeo pregrabado (reproductor sincronizado y su chat Socket.IO actual).
- No se añaden variables `NEXT_PUBLIC_*` ni build-args de Docker (todo server-side en runtime).
- El modo `meeting` no se habilita para LiveKit (queda como posible cambio futuro).
