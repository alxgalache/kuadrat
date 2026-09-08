## Context

`useAgoraRoom.js` crea la pista de micrófono en una sola línea, sin configuración, y la pista vive toda la sesión: `setMicrophoneEnabled(false)` llama a `setEnabled(false)`, nunca a `close()`. Lo que se decida al crearla es lo que se emite hasta que se recargue la página.

Tres hechos del SDK instalado (`agora-rtc-sdk-ng@4.24.6`) gobiernan el diseño. Los tres se comprobaron leyendo `rtc-sdk_en.d.ts` y `AgoraRTC_N-production.js`, porque la documentación publicada no coincide con el código en el punto decisivo:

**El defecto documentado no existe.** La referencia afirma «The SDK uses `music_standard` by default», pero el constructor hace `super(e, t.encoderConfig ? Uk(t.encoderConfig) : {}, ...)`. Sin `encoderConfig`, `_encoderConfig` es `{}`, y el munging de SDP escribe cada parámetro bajo su propio guardián:

```js
const r = t._encoderConfig;   // {}
r && ( r.bitrate    && (fmtp.maxaveragebitrate = ...),
       r.sampleRate && (fmtp.maxplaybackrate   = ...),
       r.stereo     && (fmtp.stereo = "1", ...) )
```

Ninguno se escribe. No es «music_standard»: es Opus sin declarar, al defecto de Chrome.

**Las constraints de canal y muestreo dependen del mismo campo.** `channelCount`, `sampleRate` y `sampleSize` solo entran en `getUserMedia` dentro de `if (e.encoderConfig)`. Los flags 3A entran por separado, y solo si vienen definidos: `void 0 !== e.AEC && (t.echoCancellation = e.AEC)`. Al no pasarse ninguno, se aplican los defectos del navegador, que son los tres a `true`.

**Cambiar de micrófono conserva la configuración.** `setDevice` reconstruye desde `this._constraints` (`n.audio = hM({}, this._constraints)`), así que el perfil y el 3A sobreviven al cambio de dispositivo. Es lo contrario de la cámara, donde `setDevice` obligó a reafirmar el perfil. No hace falta —ni es posible— reaplicar nada en audio.

Del lado de Chromium, `media/audio/android/aaudio_stream_wrapper.cc` elige el *input preset* de Android a partir de un único bit: si se pide cancelación de eco, `AAUDIO_INPUT_PRESET_VOICE_COMMUNICATION`; si no, `AAUDIO_INPUT_PRESET_GENERIC`. `opensles_input.cc` hace lo mismo en la ruta antigua (`no_effects_ ? CAMCORDER : VOICE_COMMUNICATION`). De los tres flags, **solo `AEC` cambia la ruta de captura en Android**; `ANS` y `AGC` gobiernan etapas software de Chrome.

## Goals / Non-Goals

**Goals:**

- Que el host emita con la ruta de captura de medios y no con la de llamadas.
- Que el enrutado priorice el receptor USB sobre el micrófono interno del teléfono.
- Que Opus viaje declarado a 128 kbps en lugar de al defecto del navegador.
- Que el caso mayoritario —conferencia, presentación, concierto— salga bien **sin que nadie marque nada**.
- Que el caso interactivo con altavoz siga siendo posible, con una casilla y sin regresión.

**Non-Goals:**

- Estéreo, en cualquiera de sus formas. Ver `proposal.md`.
- Asistentes, participantes promocionados, `interaction_mode='meeting'` y LiveKit: sin cambios.
- Selector en vivo: el audio no tiene setter de codificación.
- Medir o mostrar el bitrate real en la interfaz.

## Decisions

### 1. El defecto es la fidelidad; la casilla es la excepción

Es la decisión central y va contra el instinto conservador de «opt-in y no rompo nada». La justifica la asimetría de los dos errores, no una preferencia estética:

```
  Olvido marcar la casilla          Olvido activar la fidelidad
  en un evento con altavoz          en una conferencia
  ────────────────────────          ───────────────────────────
  Síntoma: eco                      Síntoma: suena a teléfono
  Lo oye: todo el mundo, ya         Lo oye: nadie en la sala; el
  Se arregla: en directo, con         host no monitoriza su emisión
    unos auriculares                Se arregla: nunca. Se descubre
  Coste: unos segundos                al revisar la grabación
                                    Coste: el evento entero
```

Dos de los tres usos reales de `broadcast` (conferencia en sala, concierto) **nunca** activan el audio de las manos levantadas: la interacción es por chat escrito. En esos casos el AEC no cancela nada —no hay audio remoto reproduciéndose— y solo degrada. Hacerlos opt-in sería pedir una acción manual para el 100 % de los eventos en los que la calidad importa.

*Alternativa descartada:* casilla «Audio de alta calidad» desactivada por defecto. No introduce regresiones, pero deja el defecto en el estado que ya falló, y traslada al operador la carga de recordar algo que no puede verificar durante el evento.

### 2. La casilla describe la sala, no el ajuste

El nombre de columna dice qué hace (`host_echo_cancellation`), porque quien lea `database.js` necesita saberlo; la etiqueta dice cuándo marcarla («El host escuchará a los invitados por altavoz»), porque el admin no sabe qué es un AEC pero sí si va a haber auriculares.

Su condición de visibilidad es `provider='agora'` **e** `interaction_mode='broadcast'` —más estrecha que la de `allow_host_video_quality`, y deliberadamente—: en `meeting` todos los asistentes publican audio y el 3A no se toca en ningún caso, así que ofrecer la casilla ahí sugeriría un efecto que no tiene.

### 3. Con el flag activo se omiten las claves, no se pasan a `true`

Parecen equivalentes y no lo son. En Chrome, `pN() && e.ANS && (t.googHighpassFilter = e.ANS)`: pasar `ANS: true` explícitamente añade un filtro paso alto que el camino actual **no** activa. La rama «con cancelación de eco» construye por tanto un objeto **sin** las tres claves, que es el comportamiento de hoy byte a byte.

```js
// una sola función, dos ramas, ninguna duplicación de criterio
const micTrackConfig = isHost
  ? { encoderConfig: AGORA_MIC_ENCODER_HOST,
      ...(hostEchoCancellation ? {} : { AEC: false, ANS: false, AGC: false }) }
  : undefined
```

### 4. El `encoderConfig` se aplica en las dos ramas

El bitrate y el procesado son ejes independientes. Un evento interactivo con altavoz sigue mereciendo 128 kbps en lugar de ~32; renunciar a la mitad de la mejora por marcar una casilla que trata de otra cosa sería acoplar dos decisiones que no lo están.

### 5. Los asistentes se quedan exactamente como están

Un participante promocionado está en hardware desconocido, en una sala desconocida, oyendo al host por sus propios altavoces: es **quien más necesita** el AEC, y es su AEC —no el del host— lo que impide que se oiga a sí mismo con retardo. Además 128 kbps sobre el micrófono integrado de un portátil es ancho de banda tirado.

Esto reproduce la asimetría por rol que la capacidad ya tiene en vídeo (`AGORA_CAMERA_ENCODER_HOST` frente a `_PARTICIPANT`), y el parámetro nuevo entra por el mismo sitio: `useAgoraRoom` ya recibe `cameraEncoderConfig` elegido por rol en `AgoraLiveRoom`. `micTrackConfig` se le pone al lado.

### 6. El perfil se congela al crear la pista, y hay que decirlo

`ILocalAudioTrack` expone `setVolume` y `getVolumeLevel`, y nada más: **no existe `setEncoderConfiguration` para audio**. Cambiar el perfil exige `close()`, crear y republicar, o sea un corte. Consecuencias que la implementación debe respetar y el código debe dejar escritas:

- El flag debe estar disponible **antes** de que el host active el micrófono. Llega en el objeto del evento, así que lo está.
- Cambiar la casilla a mitad de evento no surte efecto hasta que se recree la pista (una recarga). Es el mismo límite que ya documenta la cámara, cuya resolución de captura queda fijada en el primer encendido.
- Apagar y encender el micrófono **no** recrea la pista (`setEnabled`), así que el perfil es estable durante toda la sesión.

### 7. La columna y el ritual de cuatro sitios

`host_echo_cancellation INTEGER NOT NULL DEFAULT 0`, en el `CREATE TABLE` **y** en un `safeAlter`. `DEFAULT 0` sin backfill, y aquí el defecto `0` significa «sin cancelación de eco», es decir **la ruta buena**: los eventos existentes mejoran solos, que es lo que se quiere.

Omitir cualquiera de los cuatro sitios deja la casilla **guardando en silencio nada**: los dos esquemas Zod, el `toFlag` de las dos ramas del controlador, la lista de columnas del `INSERT` y el array `allowedFields` del `UPDATE`. `api/tests/eventHostFlags.test.js` ya recorre esos cuatro puntos por nombre para los dos flags existentes; el nuevo entra en la misma batería.

### 8. Nada de esto se configura en el navegador ni en el teléfono

Merece decirse porque la cadena cruza tres capas y es fácil leerlo como un ajuste de sistema:

```
  client/hooks/useAgoraRoom.js          ← el ÚNICO sitio que se toca
        │  createMicrophoneAudioTrack({ AEC:false, encoderConfig:'high_quality' })
        ▼
  agora-rtc-sdk-ng  → constraints de getUserMedia + fmtp del SDP
        ▼
  Chrome            → elige AAUDIO_INPUT_PRESET_GENERIC
        ▼
  Android           → ruta de medios, enrutado que prioriza el USB
```

No hay `chrome://flags`, ni ajuste en el Pixel, ni configuración en la consola de Agora. Lo único no-código del cambio es **operativo**: el receptor inalámbrico debe ir en modo **Mono**.

## Risks / Trade-offs

- **[Eco en un evento interactivo cuya casilla nadie marcó]** → Es el riesgo aceptado a cambio del defecto correcto. Se mitiga con el texto de ayuda del formulario y con la nota operativa de que el retorno al host debe ir por auricular, que además es la práctica habitual de retransmisión. Detectable y corregible en directo.
- **[Sin AGC, el nivel queda bajo o satura]** → Menor de lo que parece: Chromium evita deliberadamente `AAUDIO_INPUT_PRESET_UNPROCESSED` «because the lack of automatic gain control results in quiet, sometimes silent, streams», de modo que el preset `GENERIC` conserva una ganancia básica del sistema. Se cubre además con el medidor de nivel que la consola móvil ya muestra, y con el ajuste de ganancia y la pista de seguridad del propio receptor.
- **[La mejora no se puede medir todavía]** → El receptor definitivo no ha llegado y los micrófonos anteriores se devolvieron por mal funcionamiento, así que parte del audio malo observado pudo ser el hardware. El diagnóstico **no depende de esas pruebas**: está verificado en el código de Chromium y del SDK. Aun así, la verificación en dispositivo es obligatoria antes de cerrar el cambio.
- **[El cliente sigue sin runner de tests]** → La creación de la pista y la elección por rol se verifican a mano en dispositivo. La mitad de API (columna, validadores, persistencia en create y update) sí queda cubierta, en la batería que ya existe.
- **[Un bitrate mayor no sobrevive a una red mala]** → `maxaveragebitrate` es un techo, no un suelo: bajo congestión Opus seguirá degradando, pero partiendo de 128 y no de 32. Agora ya activa `useinbandfec=1` siempre. La palanca real contra un recinto con mala subida ya está construida: bajar el vídeo a 480p con el selector de calidad.
- **[Alguien «arregla» esto más adelante volviendo a activar el 3A]** → El motivo tiene que quedar en el código, no solo aquí. El comentario junto a `AGORA_MIC_ENCODER_HOST` debe nombrar el preset de Android y por qué `AEC: false` no es «quitar la cancelación de eco» sino «cambiar de ruta de captura».

## Migration Plan

Un solo despliegue, sin coordinación entre servicios: la columna es aditiva con defecto `0`, la API nueva sirve clientes viejos (que ignoran el campo) y el cliente nuevo sirve eventos viejos (flag `0` → fidelidad, que es el comportamiento deseado). No hay orden obligatorio entre `api` y `client`.

Reversión: marcar la casilla en el evento devuelve el 3A actual sin desplegar nada. Para revertir también el bitrate haría falta un despliegue, pero el bitrate no tiene modo de fallo conocido.

Activación y verificación, en este orden:

1. Receptor inalámbrico en modo **Mono**, conectado por USB-C al teléfono.
2. Comprobar en `chrome://inspect` → `chrome://webrtc-internals` del dispositivo que el bitrate de audio sube y que `getSettings()` de la pista nombra el receptor y no el micrófono interno.
3. Evento de prueba con un segundo cliente escuchando, comparando con una grabación anterior.
4. Solo después, un evento real.

## Open Questions

- ¿Merece la pena exponer el bitrate de audio en la consola móvil del host, junto al medidor de nivel? Diría que no —es un número que no habilita ninguna acción durante el evento—, pero se decide tras la primera retransmisión con el equipo definitivo.
- Para conciertos con exigencia máxima, ¿se adopta el portátil con `high_quality_stereo` como procedimiento? Requiere decidir qué equipo lleva el host y un flag de estéreo con sus propios modos de fallo. Se pospone hasta que haya un concierto planificado.
