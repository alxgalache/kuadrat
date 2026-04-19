# Tasks — fix-video-event-playback-sync

> **Lectura previa obligatoria:** `proposal.md` y `design.md` de este change.

## Fase 1 — Backend: reloj del servidor

- [ ] 1.1 En `api/controllers/eventController.js::getEventBySlug`, añadir `serverNow: new Date().toISOString()` al objeto de respuesta, junto a `event` y `attendeeCount`.
- [ ] 1.2 Verificar que ningún otro consumidor de ese endpoint falla por el campo extra (es aditivo, no rompe nada).
- [ ] 1.3 Probar con `curl` contra un evento existente y confirmar que el JSON incluye `serverNow` con formato ISO.

## Fase 2 — Frontend: cálculo del offset en EventDetail

- [ ] 2.1 En `client/app/live/[slug]/EventDetail.js`, añadir estado `serverTimeOffset` (number, default 0).
- [ ] 2.2 Dentro de `loadEvent`, tras recibir `data = await eventsAPI.getBySlug(slug)`, calcular:
  - `const receivedAt = Date.now()`
  - `const serverMs = data.serverNow ? new Date(data.serverNow).getTime() : receivedAt`
  - `setServerTimeOffset(serverMs - receivedAt)`
- [ ] 2.3 Pasar `serverTimeOffset` como prop al `<EventVideoPlayer ... serverTimeOffset={serverTimeOffset} />` (solo en la rama `format === 'video'`).
- [ ] 2.4 Verificar que el componente sigue funcionando si `serverNow` no viene (fallback: offset = 0).

## Fase 3 — Frontend: reescritura de EventVideoPlayer

Todos los cambios en `client/components/EventVideoPlayer.js`.

- [ ] 3.1 Aceptar nueva prop `serverTimeOffset` (default 0).
- [ ] 3.2 Modificar `getElapsedSeconds` para usar `Date.now() + serverTimeOffset` como "ahora".
- [ ] 3.3 Añadir estado `seekReady` (boolean, default false).
- [ ] 3.4 Reescribir el `useEffect` de seek inicial:
  - Dependencias: `[videoReady, getElapsedSeconds]` (sin cambios).
  - Al ejecutarse y `videoReady && videoRef.current && elapsed >= 0 && (elapsed < duration)`:
    - Registrar `video.addEventListener('seeked', handleSeeked, { once: true })`.
    - Asignar `video.currentTime = elapsed`.
  - `handleSeeked` marca `setSeekReady(true)` y llama `video.play().catch(() => {})`.
  - Cleanup: `removeEventListener('seeked', handleSeeked)`.
- [ ] 3.5 Añadir `useEffect` que resetea `videoReady`, `seekReady`, `videoError`, `videoEnded`, `retryCount` cuando cambia `safeVideoUrl`.
- [ ] 3.6 Añadir `style={{ opacity: seekReady ? 1 : 0, transition: 'opacity 150ms ease-in' }}` al elemento `<video>`.
- [ ] 3.7 Mantener visible el spinner "Cargando vídeo..." mientras `!videoReady || !seekReady`.
- [ ] 3.8 Modificar `toggleMute`: al desmutear, recalcular `expected`, si `drift > 1s` reasignar `currentTime`, después `play()` si está paused. Respetar el check de `elapsed >= duration`.
- [ ] 3.9 Modificar el setInterval de drift: pasar de 30 000 ms a 10 000 ms, umbral de 2 s. Mantener la guardia de `paused`.
- [ ] 3.10 Añadir listeners `waiting` y `playing` al elemento `<video>`:
  - En `waiting`, marcar `isBuffering = true` (ref local, no state para evitar re-renders).
  - En `playing`, si venía de `waiting`, recalcular `expected` y si `drift > 1s` reasignar `currentTime`.
- [ ] 3.11 Ampliar el timeout de carga actual (15 s) para cubrir también el caso `videoReady && !seekReady`. Si tras 15 s seguimos sin `seekReady`, incrementar `retryCount` y llamar `video.load()`.
- [ ] 3.12 Mantener el comportamiento de `videoEnded` al alcanzar el fin (sin loop). Mantener la UI "El vídeo ha finalizado".
- [ ] 3.13 Limpiar warnings: el `useEffect` de "check if video has ended based on elapsed time" puede simplificarse — si elapsed > duration al montar, se gestiona en el efecto de seek inicial.

## Fase 4 — Pruebas manuales

- [ ] 4.1 En pre, crear evento `format='video'` con un archivo subido (MP4 ~100 MB).
- [ ] 4.2 Iniciar el evento desde `/admin/espacios`. Esperar 2 minutos.
- [ ] 4.3 Abrir `/live/<slug>` en Chrome desktop y registrarse (flujo modal normal).
- [ ] 4.4 Verificar: tras el spinner, el vídeo aparece **directamente** en la posición correcta. No se ve frame de posición 0.
- [ ] 4.5 Desmutear: no debe haber rewind ni re-reproducción; el audio empieza en el punto actual.
- [ ] 4.6 Ctrl+Shift+R: mismo comportamiento — el vídeo arranca en la nueva posición correcta sin flash de pos. 0.
- [ ] 4.7 Abrir el mismo evento en una segunda pestaña. Comparar: ambas deben estar dentro de ±2 s.
- [ ] 4.8 DevTools → Network → "Slow 3G" durante 10 s, luego restaurar. Verificar que el vídeo salta al instante correcto (modo cine) y no se queda atrás.
- [ ] 4.9 Repetir 4.3–4.8 con un evento cuya `video_url` apunte a `https://cdn.140d.art/guias/guia_basica.mp4` (u otra URL CDN existente).
- [ ] 4.10 Probar en Firefox y Safari (al menos un navegador adicional).
- [ ] 4.11 Probar en móvil (Chrome Android o Safari iOS) — verificar que `playsInline` sigue funcionando y el seek no rompe.
- [ ] 4.12 Esperar hasta que `elapsed > duration` y entrar — debe aparecer el estado "El vídeo ha finalizado".
- [ ] 4.13 Verificar que el admin puede iniciar, ver y finalizar el evento sin regresiones.

## Fase 5 — Code review y merge

- [ ] 5.1 Revisar que no quedan `console.log` espurios.
- [ ] 5.2 Revisar que `logger` no se usa en cliente (cliente usa `console.warn` en casos justificados, como ya hace el código actual).
- [ ] 5.3 Commit con mensaje siguiendo el estilo del repo.
- [ ] 5.4 Push a la rama `staging` y pedir review.
- [ ] 5.5 Tras merge a `main`, archivar este change OpenSpec.
