# Design — fix-video-event-playback-sync

## 1. Contexto del problema

El componente `client/components/EventVideoPlayer.js` implementa un "pase de cine online": todos los espectadores ven el mismo fotograma al mismo tiempo, calculado a partir de `events.video_started_at` (ISO timestamp persistido cuando el admin inicia el evento).

El flujo actual es:

```
                                 ┌────────────────────┐
<video src preload="auto" muted> │ browser carga      │
                                 │ bytes desde pos. 0 │
                                 └─────────┬──────────┘
                                           ▼
                                 onLoadedMetadata (HAVE_METADATA)
                                           │
                                           ▼
                                 videoReady = true
                                           │
                                           ▼
 useEffect ejecuta:         video.currentTime = elapsed   ← dispara seek async
                            video.play()                  ← inmediato, sin esperar
                                           │
                                           ▼
     El navegador reproduce lo ya bufereado (pos 0) mientras resuelve el Range
     request para la posición objetivo. El usuario ve el inicio y oye el audio
     desde 0 (si desmuteó) hasta que llega el 'seeked' y la reproducción salta.
```

El comportamiento varía ligeramente según navegador, pero el patrón es consistente en Chromium.

## 2. Principios de diseño

1. **Fuente única de verdad**: el tiempo transcurrido siempre se calcula contra `events.video_started_at` + offset de reloj servidor. Nunca se persisten "últimas posiciones" en localStorage.
2. **Cine estricto**: ante cualquier drift detectado (al entrar, al desmutear, al recuperar tras buffering, en el tick periódico), se re-seekea al instante del servidor. El usuario no "recupera" contenido perdido.
3. **Nunca mostrar un frame incorrecto**: el elemento `<video>` permanece con `opacity: 0` hasta que el evento `seeked` confirme que la posición correcta está cargada.
4. **Tolerar autoplay policy sin degradar UX**: si `play()` falla por falta de gesture, el overlay de unmute (existente) sigue sirviendo como gate. Al pulsar unmute se re-seekea y se reintenta play.
5. **Mínimo cambio en backend**: solo añadir `serverNow` a la respuesta del endpoint que ya se consume. Sin nuevas rutas ni cambios de esquema.

## 3. Reloj del servidor

### Decisión

El endpoint `GET /api/events/:slug` (controlador `eventController.getEventBySlug`) devuelve un campo adicional `serverNow` con el timestamp ISO del servidor.

```json
{
  "success": true,
  "event": { ... },
  "attendeeCount": 42,
  "serverNow": "2026-04-18T22:41:44.123Z"
}
```

El cliente calcula:

```javascript
const receivedAt = Date.now()                    // momento del parseo de la respuesta
const serverMs = new Date(data.serverNow).getTime()
const serverTimeOffset = serverMs - receivedAt    // positivo si servidor va adelantado
```

A partir de ese momento, cualquier cálculo de "ahora según servidor" es `Date.now() + serverTimeOffset`.

### Alternativas descartadas

- **NTP-like multi-muestreo** (varias peticiones, mediana). Overkill: latencia típica <200 ms, y el producto tolera ±1–2 s.
- **WebSocket periódico con `server_tick`**. Más correcto pero introduce una nueva ruta de mensajería y estado. No compensa la ganancia.
- **Usar `Date.parse(response.headers['Date'])`**. No accesible desde `fetch` si el servidor no expone `Date` via `Access-Control-Expose-Headers`. Evitamos dependencias de CORS.

## 4. Secuencia seek → play → show

### Decisión

El `useEffect` disparado por `videoReady` asume el flujo siguiente:

```
videoReady = true (onLoadedMetadata)
     │
     ▼
  elapsed = getElapsedSeconds()   ← usa serverTimeOffset
     │
     ├── elapsed < 0        → return (evento aún no empezó; no debería darse
     │                              porque el servidor lo inicia)
     ├── elapsed >= duration→ setVideoEnded(true); return
     │
     ▼
  video.addEventListener('seeked', handleSeeked, { once: true })
  video.currentTime = elapsed
     │
     ▼
  (navegador hace Range request, buffer en posición elapsed, emite 'seeked')
     │
     ▼
  handleSeeked:
     setSeekReady(true)              ← esto activa opacity: 1
     video.play().catch(() => {})    ← si falla, el overlay de mute gestiona
```

### Por qué registrar `seeked` con `{ once: true }`

- Evita fugas de listener si el componente se desmonta antes del `seeked`.
- Se vuelve a registrar si por alguna razón el efecto reejecuta (p. ej. cambio de URL).

### Timeout de carga

Se mantiene el timeout actual de 15 s con 3 reintentos, pero se amplía para cubrir también el caso "metadata cargó pero `seeked` no llega". Si tras 15 s desde `videoReady` seguimos sin `seekReady`, se considera fallido el seek y se reintenta `video.load()`.

## 5. Ocultación visual hasta `seekReady`

### Decisión

El `<video>` se renderiza con `style={{ opacity: seekReady ? 1 : 0 }}` y una transición CSS opcional (fade-in 150 ms). El spinner de "Cargando vídeo..." se muestra mientras `!videoReady || !seekReady`, superpuesto al elemento.

### Alternativa descartada

- **Desmontar el `<video>` y remontarlo cuando todo esté listo**. Complicado porque se perdería el buffer cargado; empeoraría tiempos.
- **Canvas como cortina**. Innecesario dado que `opacity: 0` no detiene la decodificación pero sí oculta el frame; suficiente para el objetivo.

## 6. Re-seek al desmutear

### Decisión

`toggleMute` ya existe. Se modifica así:

```javascript
const toggleMute = () => {
  if (!videoRef.current) return
  const nextMuted = !muted
  setMuted(nextMuted)
  videoRef.current.muted = nextMuted

  if (!nextMuted) {
    // Corrige cualquier drift acumulado antes de reanudar
    const expected = getElapsedSeconds()
    if (videoRef.current.duration && expected >= videoRef.current.duration) {
      setVideoEnded(true)
      return
    }
    const drift = Math.abs(expected - videoRef.current.currentTime)
    if (drift > 1) {
      videoRef.current.currentTime = expected
    }
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
    }
  }
}
```

### Nota

Re-seek aquí no necesita esperar `seeked` porque el usuario ya está "viendo" el video y el toggle es una acción explícita; un posible micro-stutter es aceptable.

## 7. Modo cine estricto — recuperación tras buffering

### Decisión

Se añaden dos escuchas:

- **`playing`** tras un `waiting`: cuando el navegador acababa de buffering y vuelve a decodificar, comprobar drift `>1s` y re-seekar al tiempo del servidor.
- **`seeked` tardíos** (no el del boot): ignorar. Solo reaccionamos al `waiting → playing`.

Adicionalmente, el tick periódico pasa de 30 s a **10 s** con umbral `>2 s`:

```javascript
setInterval(() => {
  if (!videoRef.current || videoRef.current.paused) return
  const expected = getElapsedSeconds()
  const actual = videoRef.current.currentTime
  if (Math.abs(expected - actual) > 2) {
    videoRef.current.currentTime = expected
  }
}, 10000)
```

### Por qué 10 s / umbral 2 s

- 10 s es lo bastante frecuente para que un usuario con pérdida intermitente no acumule minutos de atraso, pero no tan frecuente como para provocar jank visible si el drift oscila alrededor del umbral.
- El umbral 2 s evita rebotes si el navegador reporta `currentTime` con pequeñas variaciones (±0.2 s) entre ticks.

## 8. Reset al cambiar `videoUrl`

Cuando `safeVideoUrl` cambia (p. ej. token de vídeo renovado), el `<video>` recarga desde cero. El estado interno del componente debe seguirlo:

```javascript
useEffect(() => {
  // Reset cuando la URL cambia
  setVideoReady(false)
  setSeekReady(false)
  setVideoError(false)
  setVideoEnded(false)
  setRetryCount(0)
}, [safeVideoUrl])
```

Esto garantiza que el siguiente `loadedmetadata` vuelva a disparar el flujo de seek.

## 9. Compatibilidad con fuentes de vídeo

### Uploads propios (`uploaded:<filename>`)

- El backend sirve con `Cache-Control: no-store`, `Accept-Ranges: bytes`, `Content-Disposition: inline`.
- Soporte de Range requests completo en `GET /api/events/:id/video/:filename`.
- El token firmado (`vtoken`) expira en 2 h. Para sesiones largas, considerar refrescar el token; queda **fuera de alcance** de este change.

### URLs externas (S3/CDN)

- S3 soporta Range requests por defecto.
- `crossOrigin="anonymous"` requiere CORS en el bucket; si falta, el elemento puede fallar silenciosamente. Se documenta pero no se modifica (responsabilidad de infra).
- Sin token, sin expiración; la URL es estable durante toda la sesión.

La lógica de sync es **idéntica** para ambos; lo único que cambia es la `src` del `<video>`.

## 10. Diagrama de estados (cliente)

```
 ┌─────────────┐       loadEvent resuelve
 │  INITIAL    │─────────────────────────────┐
 │ loading=true│                             │
 └─────────────┘                             ▼
                                       ┌─────────────┐
                                       │  EVENT_READY│
                                       │ event!=null │
                                       │ offset calc │
                                       └──────┬──────┘
                                              │ activeVideoUrl disponible
                                              ▼
                                       ┌──────────────┐
                                       │ VIDEO_LOADING│
                                       │ opacity=0    │
                                       │ spinner      │
                                       └──────┬───────┘
                                              │ loadedmetadata
                                              ▼
                                       ┌──────────────┐
                                       │ SEEKING      │
                                       │ videoReady=T │
                                       │ opacity=0    │
                                       │ spinner      │
                                       └──────┬───────┘
                                              │ 'seeked' event
                                              ▼
                                       ┌──────────────┐
                                       │ PLAYING      │
                                       │ seekReady=T  │
                                       │ opacity=1    │
                                       │ play() ok    │
                                       └──────┬───────┘
                                              │ elapsed>=duration
                                              ▼
                                       ┌──────────────┐
                                       │ ENDED        │
                                       │ videoEnded=T │
                                       └──────────────┘
```

## 11. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| `seeked` no se emite nunca (bug del navegador, red caída al iniciar) | Vídeo en negro permanente | Timeout de 15 s fuerza `video.load()` + reintento; tras 3 intentos se muestra estado de error |
| Offset de reloj gigantesco (reloj cliente incorrecto por varios días) | `elapsed` podría ser negativo o `> duration` | Chequeo `elapsed < 0 → return`, `elapsed >= duration → setVideoEnded` ya presentes; se muestra "Cargando..." o "Vídeo finalizado" según caso |
| CORS del CDN mal configurado con `crossOrigin="anonymous"` | Vídeo no carga | Fuera de alcance; se deja un comentario en el código y queda como tarea de infra |
| `currentTime` reporta valores ligeramente distintos al asignado | Drift falso detectado | Umbral de 1 s (unmute) y 2 s (tick) absorbe estos desvíos |
| Cambio de vídeo durante la reproducción (p. ej. admin edita URL) | No definido en cine estricto | Reset del estado al cambiar `safeVideoUrl` garantiza re-seek limpio |
| Token de vídeo firmado expira mid-stream (2 h) | Vídeo deja de cargar nuevos bytes | Fuera de alcance; documentado |

## 12. Decisiones tomadas con el usuario

1. **Tolerancia entre dispositivos**: ±1–2 s aceptable.
2. **Buffering**: modo cine estricto (al recuperar red, saltar al tiempo de servidor; se pierde el trozo bufereado).
3. **Vídeo finalizado**: al llegar al final no hace loop, se muestra el estado "El vídeo ha finalizado" actual.
4. **Audio al desmutear**: corte seco, sin fade-in.
5. **El hecho de que hoy el vídeo no arranque hasta pulsar unmute** queda cubierto por el mismo fix: al completarse el `seeked`, `play()` se llama con el video ya muted, cumpliendo la política de autoplay del navegador. Si aun así fallase por alguna razón (navegador con autoplay muy restrictivo), el overlay de unmute sigue siendo la "puerta" y al pulsarlo se desmutea + re-seek + play.

## 13. Plan de rollout

1. Merge a `staging`.
2. Prueba manual con vídeo subido + vídeo CDN (p. ej. `https://cdn.140d.art/guias/guia_basica.mp4`) en Chrome, Firefox y Safari.
3. Prueba en móvil (Chrome Android, Safari iOS) verificando `playsInline`.
4. Prueba con throttle de red (DevTools → Slow 3G) para forzar buffering y confirmar modo cine.
5. Merge a `main` y deploy.

Sin migración de datos, sin flags de feature — el cambio es puramente de secuenciación en el cliente.
