# Fidelidad de audio del host en retransmisiones Agora

## Why

El audio del host suena **apagado, «como un teléfono»**, en retransmisiones grabadas con equipo profesional (receptor inalámbrico por USB-C a un Pixel 9 Pro en trípode). No es la red, ni el micrófono: es una línea de `client/hooks/useAgoraRoom.js`.

```js
const track = await AgoraRTC.createMicrophoneAudioTrack(
  deviceId ? { microphoneId: deviceId } : undefined
)
```

Sin `encoderConfig` y sin los flags `AEC`/`ANS`/`AGC`. Es el mismo defecto que el 4:3 de la cámara, y produce **dos fallos independientes**, ambos verificados en el bundle instalado de `agora-rtc-sdk-ng@4.24.6` y en el código fuente de Chromium, no inferidos de las pruebas:

**1. La ruta de captura de Android es la de las llamadas de voz.** El SDK traduce `AEC` a la constraint `echoCancellation`; al no recibirla, se aplica el defecto del navegador (`true`). Y Chromium decide con eso el *input preset* de Android (`media/audio/android/aaudio_stream_wrapper.cc`, literal):

```cpp
// Set AAUDIO_INPUT_PRESET_VOICE_COMMUNICATION when we need echo
// cancellation. Otherwise, we use AAUDIO_INPUT_PRESET_GENERIC to ensure
// standard audio routing (e.g. prioritizing USB or wired headsets over the
// internal phone microphone).
```

En Android `AEC: false` no desactiva un filtro: **cambia la ruta de captura entera**. `VOICE_COMMUNICATION` es la cadena que el sistema reserva para llamadas —limitación de banda, supresión de ruido y control de ganancia afinados para voz telefónica—, y es literalmente el sonido que se está describiendo. El mismo comentario revela un segundo efecto: con ese preset el enrutado pasa por la selección de «communication device» del sistema, mientras que `GENERIC` existe **para** priorizar el USB. **Es posible que en alguna retransmisión el teléfono estuviera emitiendo con su propio micrófono interno y el receptor no entrara siquiera.**

**2. Opus viaja sin configurar.** El constructor de la pista hace `super(e, t.encoderConfig ? Uk(t.encoderConfig) : {}, ...)`, es decir `_encoderConfig = {}`. El munging de SDP solo escribe `maxaveragebitrate`, `maxplaybackrate` y `stereo` si esos campos existen, así que **no se escribe ninguno**: pese a que la documentación afirma que «the SDK uses `music_standard` by default», en la práctica no se declara nada y Chrome negocia Opus mono a su bitrate por defecto (~32 kbps, adaptativo hacia abajo). El techo disponible sin tocar nada más es **128 kbps**.

Corregirlo **no cuesta dinero**: Agora factura el audio a 0,99 $/1000 min de forma plana, sin tramos por bitrate, muestreo ni canales — a diferencia del vídeo, donde 1080p cuesta 2,25× y obligó a fijar 720p por defecto. El coste es ~96 kbps más de subida junto a los 2-4 Mbps del vídeo.

## What Changes

### Perfil de audio explícito para el host

- Toda pista de micrófono **del host** de una sala Agora pasa a crearse con `encoderConfig: 'high_quality'` (48 kHz, mono, 128 kbps), constante nueva `AGORA_MIC_ENCODER_HOST` en `client/lib/constants.js`, hermana de `AGORA_CAMERA_ENCODER_HOST`.
- `useAgoraRoom` gana un parámetro `micTrackConfig`, exactamente análogo al `cameraEncoderConfig` que ya recibe, elegido por rol en `AgoraLiveRoom`.
- **Los asistentes no cambian.** Un participante promocionado emite desde hardware desconocido en una sala desconocida, oyendo al host por sus altavoces: necesita el 3A y no se beneficia de 128 kbps. Misma asimetría por rol que `AGORA_CAMERA_ENCODER_HOST` / `_PARTICIPANT`.

### Desactivación del 3A por defecto, con una salida por evento

- Por defecto, la pista del host se crea con `AEC: false, ANS: false, AGC: false`.
- Nueva columna `events.host_echo_cancellation` (INTEGER, `NOT NULL DEFAULT 0`), expuesta como checkbox **«El host escuchará a los invitados por altavoz»** en los formularios de creación y edición, visible solo con `provider='agora'` e `interaction_mode='broadcast'`.
- Con el flag a `1`, la configuración de la pista **omite las tres claves** en lugar de pasarlas a `true`. No es lo mismo: pasar `ANS: true` explícitamente añade además `googHighpassFilter` en Chrome, que hoy no se activa. Omitirlas reproduce el comportamiento actual byte a byte.
- El `encoderConfig` se aplica en **las dos ramas**. El bitrate es independiente del 3A: incluso con cancelación de eco, 128 kbps es mejor que ~32.

### El defecto va en el sentido seguro, y esa es la decisión de diseño

Los tres usos reales del modo `broadcast` son:

| Uso | Audio de manos levantadas | 3A |
|---|---|---|
| Conferencia / presentación en sala | nunca se activa; interacción por chat escrito | **off** |
| Concierto en directo | nunca se activa | **off** |
| Retransmisión tipo Twitch con invitados | sí, y el host puede oírlos por altavoz | **on** si hay altavoz |

El discriminante **no es el tipo de evento sino si el host va a reproducir en voz alta el audio de los invitados**, y solo el tercer caso puede necesitarlo. El defecto se elige por la asimetría de los dos errores posibles:

- Olvidar marcar la casilla en un evento interactivo con altavoz → **eco**, audible al instante y corregible en directo poniéndose auriculares.
- Olvidar activar la fidelidad en una conferencia → **el evento entero suena a teléfono**, el host no lo oye (no monitoriza su propia emisión) y se descubre después. Irrecuperable. Es exactamente el fallo que ya ocurrió.

Un error se detecta y se arregla en cinco segundos; el otro arruina la grabación en silencio. El caso común debe salir bien sin que nadie recuerde marcar nada.

## Capabilities

### Modified Capabilities

- `agora-streaming-provider`: gana el perfil de codificación de audio explícito por rol —hermano exacto del perfil de cámara 16:9 que ya especifica—, la desactivación del procesado 3A del navegador en la pista del host, y la columna `events.host_echo_cancellation` que la revierte por evento. Los requisitos existentes no cambian: un evento sin la casilla marcada emite mejor audio y todo lo demás igual.

## Impact

**Base de datos** — `api/config/database.js`: `host_echo_cancellation INTEGER NOT NULL DEFAULT 0` en el `CREATE TABLE events` **y** su `safeAlter` (las bases existentes no se recrean).

**API** — el ritual de cuatro sitios que `allow_mobile_host_console` y `allow_host_video_quality` ya recorrieron: `api/validators/eventSchemas.js` (create y update), `api/controllers/eventAdminController.js` (`toFlag` en ambos), `api/services/eventService.js` (columnas del `INSERT` y `allowedFields` del `UPDATE`). El camino de lectura no necesita nada: `getEventBySlug` hace `SELECT e.*`.

**Cliente** — `client/hooks/useAgoraRoom.js` (parámetro `micTrackConfig`), `client/components/AgoraLiveRoom.js` (elección por rol y propagación del flag), `client/lib/constants.js` (`AGORA_MIC_ENCODER_HOST` y textos es-ES), `client/app/live/[slug]/EventDetail.js` (propagación), formularios `client/app/admin/espacios/nuevo/page.js` y `client/app/admin/espacios/[id]/page.js`.

**Sin impacto** en variables de entorno, CSP, Sentry, Socket.IO, tokens RTC, LiveKit, `interaction_mode='meeting'` ni asistentes. **Sin impacto en facturación**: el audio de Agora tiene tarifa plana.

## Non-goals

- **Estéreo.** Descartado con evidencia, no por alcance. Chrome en Android captura mono: `audio_manager_android.cc` elige el layout de entrada tras `base::FeatureList::IsEnabled(features::kAudioStereoInputStreamParameters)`, y esa bandera está `FEATURE_DISABLED_BY_DEFAULT` en `media/audio/audio_features.cc`, marcada todavía como experimento. Además, dos micrófonos de solapa panoramizados duro **no son estéreo**: son dos monos discretos, cansados en auriculares, y el peor caso posible para la codificación Mid/Side de Opus. Y los presets lo confirman: `standard_stereo` da ~32 kbps por canal frente a los 128 de `high_quality` mono. **Mono es la elección correcta con uno y con dos micrófonos**, y el receptor debe ir en modo Mono (con un solo transmisor, el modo Stereo deja un canal en silencio y la mezcla a mono cuesta 6 dB de nivel).
- **Estéreo desde un portátil.** Chrome de escritorio sí captura estéreo con el AEC desactivado y admite `high_quality_stereo` (192 kbps), el techo más alto de todos los caminos. Es la vía para un concierto con exigencia máxima, pero es otra decisión de producto —qué equipo lleva el host— y otro conjunto de modos de fallo. Se documenta aquí para que nadie la vuelva a derivar desde cero.
- **App nativa Android/iOS.** Evaluada y descartada. El SDK nativo tiene un techo de audio **más bajo**: `MUSIC_HIGH_QUALITY` son 96 kbps mono y `MUSIC_HIGH_QUALITY_STEREO` 128, frente a los 128 y 192 del SDK web. Aportaría control de captura y ejecución en segundo plano, a cambio de un segundo cliente que mantener para siempre y para una sola persona por evento.
- **Media Gateway (ingesta RTMP/SRT).** Descartada: añade segundos de latencia, incompatible con el caso interactivo, y parte la consola del host en dos dispositivos.
- **Extensión AI Denoiser.** Va en dirección contraria (más procesado, facturado aparte) y destruiría precisamente lo que este cambio busca conservar.
- **Selector de calidad de audio en vivo.** Imposible: `ILocalAudioTrack` expone solo `setVolume` y `getVolumeLevel`; no existe `setEncoderConfiguration` para audio. El perfil queda congelado al crear la pista.
