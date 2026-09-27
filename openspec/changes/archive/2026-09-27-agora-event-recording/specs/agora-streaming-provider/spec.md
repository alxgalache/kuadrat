## MODIFIED Requirements

### Requirement: Compartir pantalla del host (Agora)
El toggle «Pantalla» del host, y en `broadcast` también el del co-presentador (ver `agora-broadcast-cohost`), SHALL comportarse según el modo de interacción. En los dos modos la pantalla SHALL compartirse **con su audio** cuando el navegador lo permita y la persona lo elija.

**Audio de la pantalla (los dos modos).** `AgoraRTC.createScreenVideoTrack(config, withAudio)` con `withAudio = 'disable'` pide a `getDisplayMedia` sólo vídeo, y entonces Chrome no ofrece la casilla «Compartir audio» en ninguna pestaña del selector. Por eso:
- El segundo argumento SHALL ser el objeto `AGORA_SCREEN_AUDIO_CONFIG` de `client/lib/constants.js`, nunca `'disable'`. Con un objeto el SDK pide audio (`'auto'`) y la casilla aparece: en la pestaña «Pestaña» siempre, y en «Toda la pantalla» y «Ventana» donde el sistema lo admite (Windows; macOS 14.2+ con Chrome 141+).
- `AGORA_SCREEN_AUDIO_CONFIG` SHALL desactivar `AEC`, `AGC` y `ANS` (es audio de programa, no una voz) y fijar `restrictOwnAudio: true`, para que el audio de la propia página —las voces de los demás participantes— no vuelva al canal cuando se comparte la pantalla entera con el audio del sistema.
- La configuración de vídeo SHALL incluir `AGORA_SCREEN_CAPTURE_OPTIONS` (`systemAudio: 'include'`, `windowAudio: 'system'`), que el SDK pasa a `getDisplayMedia` como pistas para ofrecer también el audio del sistema.
- El SDK devuelve `[vídeo, audio]` si la persona marcó la casilla y sólo el vídeo si no. Las dos formas SHALL admitirse, y la pista de audio, cuando exista, SHALL publicarse en el mismo cliente que la de vídeo de la pantalla y cerrarse con ella.
- Safari no comparte audio de pantalla en ningún caso; Linux queda fuera de alcance por decisión.

**`interaction_mode='broadcast'` — pantalla y cámara a la vez.** Un cliente de Agora solo puede publicar una pista de vídeo: `publish()` lanza `CAN_NOT_PUBLISH_MULTIPLE_VIDEO_TRACKS` en `agora-rtc-sdk-ng@4.24.6`. Por eso la pantalla SHALL publicarse desde un **segundo cliente RTC** (`mode: 'live'`, rol `host`) unido al mismo canal con el uid `HOST_SCREEN_UID` (2). El uid 2 es **la pantalla de la escena**: una sola, que usa quien comparta de los dos presentadores, y sólo uno a la vez.

- **Token:** su token SHALL obtenerse de `POST /api/events/:id/screen-token`, que:
  - exige JWT del host del evento (`req.user.id === event.host_user_id`) o del co-presentador: un admin con asistente `is_staff = 1` en ese evento que cumpla `eventService.isBroadcastCohost`. Responde 403 a cualquier otro usuario, incluidos un admin que no entró en el evento y un antiguo admin
  - exige un evento Agora `broadcast` activo con canal, y responde 400 en `meeting`, en LiveKit o con el evento inactivo
  - responde **409** con `title: 'SCREEN_SHARE_IN_USE'` mientras el OTRO presentador tiene la pantalla según la presencia de la sala (`eventSocket.getStageScreenSharer`); a quien la tiene le sigue renovando el token
  - devuelve `{ uid: 2, rtcToken }` con rol PUBLISHER
- **Pista de pantalla:** SHALL crearse con el audio descrito arriba y con un perfil de vídeo que no supere 1792 × 1008. El perfil SHALL definirse en `client/lib/constants.js`: deja sitio a las cámaras de la esquina dentro de la banda Full HD (ver `agora-broadcast-stage`).
- **Cámara:** la cámara de quien comparte SHALL **permanecer publicada** en su cliente principal mientras se comparte.
- **Suscripciones:** el cliente principal de una página NO SHALL suscribirse a los tracks del uid 2 **mientras esa misma página los publica**, porque pinta su pantalla desde la pista local (y su audio volvería como eco). Cuando comparte el otro presentador, SHALL suscribirse como cualquier asistente. El segundo cliente NO SHALL suscribirse a nada.
- **Exclusividad:** el cliente SHALL rechazar el toggle con el motivo, sin abrir el selector del navegador, mientras la presencia indique que el otro presentador comparte. Si aun así dos clientes llegan a unirse con el uid 2, Agora desconecta al anterior con `UID_CONFLICT`; ese cliente SHALL limpiar su compartición como en «Fin» y suscribirse a la pantalla que lo sustituye.
- **Presencia:** quien comparte SHALL emitir `screen_share { active }` al cambiar y tras cada (re)unión a la sala; el servidor SHALL aceptarlo del host y del co-presentador, y de nadie más.
- **Fin:** al desactivar, sea por el toggle o por «Dejar de compartir» del navegador (evento `track-ended`), SHALL despublicarse la pista de vídeo y la de audio, cerrarlas y abandonar el canal con el segundo cliente. Lo mismo SHALL ocurrir al desmontar la sala.
- **Renovación:** ante `token-privilege-will-expire` del segundo cliente, SHALL pedirse de nuevo `screen-token` y renovarse.

**`interaction_mode='meeting'` — intercambio en un solo cliente.** Al activar, se crea la pantalla con el audio descrito arriba, se des-publica la cámara y se publican la pantalla y, si existe, su audio, que el SDK mezcla con el micrófono. Al desactivar (toggle o `track-ended`), se despublican y cierran las dos y se vuelve a publicar la cámara si estaba activa. Los asistentes ven la pantalla en el recuadro destacado del host.

#### Scenario: Presentación con cámara en un evento stream
- **WHEN** el host activa «Pantalla» con la cámara encendida en un evento `broadcast`
- **THEN** los asistentes reciben la pantalla (uid 2) y la cámara del host (uid 1) a la vez, compuestas según `agora-broadcast-stage`

#### Scenario: Compartir el audio del equipo en Windows
- **WHEN** el host, en Chrome para Windows, activa «Pantalla», elige «Toda la pantalla» y marca «Compartir audio del sistema»
- **THEN** los asistentes oyen el audio del equipo junto con la voz del host
- **AND** las voces de los demás participantes que suenan en la página del host no vuelven al canal

#### Scenario: Compartir sin audio
- **WHEN** el presentador no marca la casilla de audio en el selector
- **THEN** la pantalla se comparte sólo con vídeo, como antes

#### Scenario: Dejar de compartir desde el navegador
- **WHEN** el host detiene la compartición desde el aviso del navegador
- **THEN** el segundo cliente abandona el canal, la pantalla y su audio desaparecen para todos y la cámara del host, que nunca dejó de publicarse, vuelve a ocupar la escena

#### Scenario: El host no descarga su propia pantalla
- **WHEN** el host comparte pantalla
- **THEN** su cliente principal no se suscribe al vídeo ni al audio del uid 2 y su vista usa la pista local

#### Scenario: El host recibe la pantalla del co-presentador
- **WHEN** el co-presentador comparte pantalla
- **THEN** el host la ve en la escena y oye su audio como cualquier asistente

#### Scenario: Token de pantalla para un admin ajeno
- **WHEN** un admin que no es el host y no tiene asistente de staff en el evento llama a `POST /api/events/:id/screen-token`
- **THEN** la API responde 403

#### Scenario: Pantalla ocupada
- **WHEN** el host comparte pantalla y el co-presentador pide `screen-token`
- **THEN** la API responde 409 con `title: 'SCREEN_SHARE_IN_USE'` y no genera token

#### Scenario: Meeting conserva el intercambio
- **WHEN** el host de un evento `meeting` comparte pantalla con la cámara encendida
- **THEN** la cámara se des-publica y la pantalla ocupa el recuadro destacado, exactamente como antes de este cambio, ahora con el audio de la pantalla si se compartió
