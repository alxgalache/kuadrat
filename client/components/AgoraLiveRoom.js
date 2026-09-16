'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { eventsAPI } from '@/lib/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import DeviceDropdown from '@/components/events/DeviceDropdown'
import VideoEffectsMenu from '@/components/events/VideoEffectsMenu'
import AgoraVideo from '@/components/events/AgoraVideo'
import ToggleSwitch from '@/components/events/ToggleSwitch'
import BroadcastStage, { stageStreamTypes } from '@/components/events/BroadcastStage'
import CoHostControls, { CompactCoHostControls } from '@/components/events/CoHostControls'
import LiveRoomShell, { roomCell, stageFrame } from '@/components/events/LiveRoomShell'
import LiveRoomTopBar from '@/components/events/LiveRoomTopBar'
import LiveRoomSheet, { LiveRoomSheetRow } from '@/components/events/LiveRoomSheet'
import ParticipantTile, { HandIcon, sortParticipants } from '@/components/events/ParticipantTile'
import CompactParticipantRow from '@/components/events/CompactParticipantRow'
import CompactCameraRow from '@/components/events/CompactCameraRow'
import MeetingGrid from '@/components/events/MeetingGrid'
import useSpeakerActivity from '@/hooks/useSpeakerActivity'
import { speakerRanks } from '@/lib/meetingGrid'
import CompactHostControls from '@/components/events/CompactHostControls'
import { ControlIconButton, ControlsRow, ControlsSheet } from '@/components/events/CompactControls'
import LandscapeStageChrome, { StageChromeGroup } from '@/components/events/LandscapeStageChrome'
import ChatComposer from '@/components/events/chat/ChatComposer'
import NewMessagesButton from '@/components/events/chat/NewMessagesButton'
import useCompactRoomLayout from '@/hooks/useCompactRoomLayout'
import useAutoHideChrome from '@/hooks/useAutoHideChrome'
import useChatAutoScroll from '@/hooks/useChatAutoScroll'
import useAgoraRoom from '@/hooks/useAgoraRoom'
import useAgoraDevices from '@/hooks/useAgoraDevices'
import useAgoraVideoEffect from '@/hooks/useAgoraVideoEffect'
import useEventRoomSocket from '@/hooks/useEventRoomSocket'
import useHostMediaControls, { cameraErrorMessage } from '@/hooks/useHostMediaControls'
import useHostViewMode from '@/hooks/useHostViewMode'
import useHostVideoQuality from '@/hooks/useHostVideoQuality'
import HostConsole, { HostViewModeSwitcher, HostPreviewMode } from '@/components/events/HostConsole'
import {
  HOST_VIEW_MODES, AGORA_CAMERA_ENCODER_HOST, AGORA_CAMERA_ENCODER_PARTICIPANT, AGORA_VIDEO_QUALITIES,
  AGORA_MIC_ENCODER_HOST, AGORA_MIC_NO_PROCESSING,
  AGORA_HOST_UID, AGORA_HOST_SCREEN_UID, AGORA_LOW_STREAM_PARAMETER, AGORA_SCREEN_ENCODER_BROADCAST,
  STAGE_COPY, LIVE_ROOM_COPY,
} from '@/lib/constants'
import useScreenWakeLock from '@/hooks/useScreenWakeLock'

// Fastboard is heavy — load it only when the host opens the whiteboard
const WhiteboardPanel = dynamic(
  () => import('@/components/events/WhiteboardPanel'),
  { ssr: false }
)

// Theater strip geometry — these MUST stay in step with the Tailwind classes
// of the strip tiles and arrows: tiles are w-16 (64px) under the sm breakpoint
// and sm:w-24 (96px) from 640px up, separated by gap-x-2 (8px); each arrow
// button renders ~32px wide plus its 8px gap.
const STRIP_TILE_W_MOBILE = 64
const STRIP_TILE_W_DESKTOP = 96
const STRIP_TILE_GAP = 8
const STRIP_ARROW_SPACE = 40

// ---------------------------------------------------------------------------
// Theater mode — fullscreen overlay with a paginated participant strip
// ---------------------------------------------------------------------------
// State-driven overlay (fixed inset-0). Native browser fullscreen is requested
// on the wrapper as a progressive enhancement (iOS Safari has no element
// fullscreen; the overlay alone covers the viewport there). The wrapper is
// ALWAYS mounted around the featured media so the whiteboard never changes its
// position in the React tree — a move would destroy and rejoin the fastboard
// room, losing the writable session.
function TheaterShell({ open, onClose, normalClassName = '', normalStyle, onNormalClick, lockLandscape = false, children }) {
  const shellRef = useRef(null)
  // Leído desde una ref: cambiar de disposición con el teatro abierto no debe
  // volver a pedir la pantalla completa.
  const lockLandscapeRef = useRef(lockLandscape)
  lockLandscapeRef.current = lockLandscape

  useEffect(() => {
    if (!open) return
    const el = shellRef.current
    const locking = lockLandscapeRef.current
    if (el?.requestFullscreen) {
      el.requestFullscreen()
        // Sala compacta: horizontal. Android solo concede el bloqueo DENTRO de la
        // pantalla completa, así que va cuando esta se resuelve.
        .then(() => (locking ? screen.orientation?.lock?.('landscape') : undefined))
        .catch(() => { /* iOS / denied / unsupported */ })
    }
    // Escape must work even without native fullscreen (overlay-only mode)
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    const onFullscreenChange = () => { if (!document.fullscreenElement) onClose() }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (locking) {
        try { screen.orientation?.unlock?.() } catch { /* unsupported */ }
      }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* already out */ })
    }
  }, [open, onClose])

  return (
    <div
      ref={shellRef}
      className={open ? 'fixed inset-0 z-[60] bg-black flex flex-col' : normalClassName}
      style={open ? undefined : normalStyle}
      onClick={open ? undefined : onNormalClick}
    >
      {children}
    </div>
  )
}

function TheaterButton({ onOpen, className = '' }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors ${className}`}
      title="Pantalla completa"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
      </svg>
    </button>
  )
}

// Overlay chrome: hide/show the strip + exit theater (top-right corner, clear
// of the fastboard toolbar which lives on the left/bottom edges)
function TheaterChrome({ stripVisible, onToggleStrip, onClose }) {
  return (
    <div
      className="absolute z-20 flex gap-x-2"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))', right: 'max(0.75rem, env(safe-area-inset-right))' }}
    >
      <button
        type="button"
        onClick={onToggleStrip}
        className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
        title={stripVisible ? 'Ocultar participantes' : 'Mostrar participantes'}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          {stripVisible ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          )}
        </svg>
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
        title="Salir de pantalla completa"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// Bottom strip: sliding window of as many current-size tiles as the width can
// hold (arrows included when pagination is needed), with endless (modulo)
// rotation in blocks of the visible count. Keeping the component mounted while
// hidden preserves the pagination position; only the visible window mounts
// tiles (bounded video decode cost with 16 attendees).
//
// `reorderOnFirstPage` (reuniones, orden por actividad de voz): `entries` llega
// ya ordenado por quién habla, y ese orden solo se aplica EN VIVO en la primera
// página (la ventana que empieza en el primer participante) o cuando caben
// todos sin paginar. Al pasar de página se congela el orden de ese instante —si
// no, las páginas cambiarían de contenido sin tocar las flechas y quien miraba a
// alguien lo vería desaparecer—; quien llega mientras tanto va al final. Al
// volver a la primera página se reanuda. Dentro de la ventana el DOM sigue un
// orden estable y la colocación la da CSS `order`: ningún vídeo cambia de nodo.
function TheaterStrip({ entries, visible, renderTile, reorderOnFirstPage = false }) {
  const [start, setStart] = useState(0)
  const [capacity, setCapacity] = useState(1)
  // Identidades en el orden congelado mientras se navega fuera de la primera página
  const [frozenOrder, setFrozenOrder] = useState(null)
  const containerRef = useRef(null)
  const count = entries.length

  // Recompute how many tiles fit whenever the strip (viewport) resizes or the
  // participant count crosses the pagination threshold
  useEffect(() => {
    if (!visible) return
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const tileW = window.innerWidth >= 640 ? STRIP_TILE_W_DESKTOP : STRIP_TILE_W_MOBILE
      const fits = (w) => Math.max(1, Math.floor((w + STRIP_TILE_GAP) / (tileW + STRIP_TILE_GAP)))
      // Padding lateral real: con el área segura (compacto, horizontal) ya no es fijo
      const styles = window.getComputedStyle(el)
      const width = el.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight)
      let next = fits(width)
      // Arrows only take space when this many tiles still need pagination
      if (count > next) next = fits(width - 2 * STRIP_ARROW_SPACE)
      setCapacity(next)
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, count])

  const paged = count > capacity

  // Sin paginación hay una sola página: vuelve al principio y nada queda congelado
  useEffect(() => {
    if (!paged) {
      setStart(0)
      setFrozenOrder(null)
    }
  }, [paged])

  const orderedEntries = useMemo(() => {
    if (!reorderOnFirstPage || !frozenOrder) return entries
    const byIdentity = new Map(entries.map((entry) => [entry.identity, entry]))
    const result = []
    for (const identity of frozenOrder) {
      const entry = byIdentity.get(identity)
      if (entry) {
        result.push(entry)
        byIdentity.delete(identity)
      }
    }
    for (const entry of entries) {
      if (byIdentity.has(entry.identity)) result.push(entry)
    }
    return result
  }, [entries, reorderOnFirstPage, frozenOrder])

  const goTo = useCallback((next) => {
    if (reorderOnFirstPage) {
      if (next === 0) setFrozenOrder(null)
      else if (frozenOrder === null) setFrozenOrder(orderedEntries.map((entry) => entry.identity))
    }
    setStart(next)
  }, [reorderOnFirstPage, frozenOrder, orderedEntries])

  const windowEntries = useMemo(() => {
    if (!paged) return orderedEntries
    return Array.from({ length: Math.min(capacity, count) }, (_, i) => orderedEntries[(start + i) % count])
  }, [orderedEntries, paged, start, capacity, count])

  if (!visible || count === 0) return null

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 flex items-center justify-center gap-x-2 pt-2"
      style={{
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      {paged && (
        <button
          type="button"
          onClick={() => goTo(((start - capacity) % count + count) % count)}
          className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors flex-shrink-0"
          title="Participantes anteriores"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}
      <div className="flex items-end gap-x-2">
        {reorderOnFirstPage
          // Stable DOM order (by identity) + CSS `order` for the visual position
          ? windowEntries
              .map((entry, position) => ({ entry, position }))
              .sort((a, b) => (a.entry.identity < b.entry.identity ? -1 : a.entry.identity > b.entry.identity ? 1 : 0))
              .map(({ entry, position }) => (
                <div key={entry.identity} style={{ order: position }}>
                  {renderTile(entry)}
                </div>
              ))
          : windowEntries.map(renderTile)}
      </div>
      {paged && (
        <button
          type="button"
          onClick={() => goTo((start + capacity) % count)}
          className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors flex-shrink-0"
          title="Participantes siguientes"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}
    </div>
  )
}

// Compact square camera tile for the meeting theater strip (no moderation menu)
function TheaterMeetingTile({ entry, isLocal, room, remoteByUid, speakingUids, localUid }) {
  const remoteUser = entry.agoraUid != null ? remoteByUid.get(Number(entry.agoraUid)) : null
  const videoTrack = isLocal
    ? (room.camEnabled ? room.camTrackRef.current : null)
    : (remoteUser?.videoTrack || null)
  const micActive = isLocal ? room.micEnabled : !!remoteUser?.hasAudio
  const speaking = speakingUids.has(isLocal ? localUid : Number(entry.agoraUid))

  const initial = (entry.name || '?').charAt(0).toUpperCase()
  const displayName = isLocal ? `${entry.name} (Tu)` : entry.name

  return (
    <div
      className={`w-16 h-16 sm:w-24 sm:h-24 flex-shrink-0 bg-gray-900 rounded-lg overflow-hidden relative transition-shadow duration-300 ${
        speaking ? 'ring-2 ring-green-400' : ''
      }`}
      style={speaking ? { animation: 'speaking-pulse 1.5s ease-in-out infinite' } : undefined}
      title={displayName}
    >
      {videoTrack ? (
        <AgoraVideo track={videoTrack} className="w-full h-full" fit="cover" />
      ) : (
        <div className="flex items-center justify-center h-full">
          <span className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-gray-700 text-sm sm:text-lg font-semibold text-white">
            {initial}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 flex items-center gap-x-1 bg-black/50 px-1 py-0.5">
        <span className="text-[10px] text-white truncate flex-1">{displayName}</span>
        {micActive ? (
          <svg className="h-2.5 w-2.5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        ) : (
          <svg className="h-2.5 w-2.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        )}
      </div>
    </div>
  )
}

// Camera errors → clear es-ES messages. NOT_READABLE is a device/driver failure
// (some external webcams); distinct from a missing device.
// La definición vive ahora en useHostMediaControls (importada arriba).

/**
 * Live room for Agora events. Sibling of EventLiveRoom (LiveKit), selected by
 * EventDetail on event.provider. `broadcast` mode replicates the LiveKit
 * UI/UX 1:1; `meeting` mode renders a Meet-style camera grid where everyone
 * controls their own mic/camera.
 *
 * Presence, chat, hand raising and moderation signals ride on the
 * authenticated Socket.IO room (Agora audiences are invisible on RTC).
 */
export default function AgoraLiveRoom({
  appId,
  channel,
  uid,
  rtcToken,
  interactionMode = 'broadcast',
  isHost = false,
  eventId,
  onKicked,
  whiteboardAvailable = false,
  allowMobileHostConsole = false,
  allowHostVideoQuality = false,
  hostEchoCancellation = false,
  isCoHost = false,
  isAdmin = false,
  eventEnded = false,
}) {
  const isMeeting = interactionMode === 'meeting'
  // The admin interviewing the host (agora-broadcast-cohost). Broadcast only:
  // in a meeting everybody already publishes and the server never flags it.
  const coHostMode = isCoHost && !isHost && !isMeeting

  // Disposición (openspec/changes/live-event-mobile-layout). Una sola lectura
  // del criterio para toda la sala; el árbol es el mismo en todas.
  const { compact, landscape } = useCompactRoomLayout()
  // Panel lateral del horizontal compacto: oculto por defecto para quien solo
  // mira (primero el vídeo), visible para quien emite (sus controles viven ahí).
  // Vuelve a su valor por defecto en cada entrada en horizontal: no se persiste.
  const panelOpenByDefault = isHost || coHostMode || isMeeting
  const [panelOpen, setPanelOpen] = useState(panelOpenByDefault)
  useEffect(() => {
    if (landscape) setPanelOpen(panelOpenByDefault)
  }, [landscape, panelOpenByDefault])
  const togglePanel = useCallback(() => setPanelOpen((open) => !open), [])
  const layout = useMemo(
    () => ({ compact, landscape, panelOpen, togglePanel }),
    [compact, landscape, panelOpen, togglePanel]
  )

  // Attendee session (socket join credentials + token renewal)
  const attendeeSession = useMemo(() => {
    try {
      const raw = localStorage.getItem(`event_attendee_${eventId}`)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }, [eventId])

  const renewToken = useCallback(async () => {
    return eventsAPI.renewToken(
      eventId,
      isHost ? null : attendeeSession?.attendeeId,
      isHost ? null : attendeeSession?.accessToken
    )
  }, [eventId, isHost, attendeeSession])

  // 16:9 explícito: el defecto del SDK (`480p_1`) es 640 × 480, o sea 4:3, y
  // publicaba el vídeo casi cuadrado en cualquier cámara. El host va a 720p
  // porque su vídeo puede verse a pantalla completa; el resto a 360p, que es
  // el tamaño real de un mosaico y evita 17 emisores en alta en modo reunión.
  // La calidad del host es elegible durante la retransmisión; el resto de
  // participantes emiten siempre con el perfil de mosaico.
  const videoQuality = useHostVideoQuality({ enabled: isHost && allowHostVideoQuality })
  // El co-presentador emite a 720p fija: es la otra mitad de la escena, no un
  // mosaico, y no tiene selector de calidad.
  const cameraEncoderConfig = isHost
    ? videoQuality.encoderConfig
    : coHostMode ? AGORA_CAMERA_ENCODER_HOST : AGORA_CAMERA_ENCODER_PARTICIPANT

  // Misma asimetría por rol que el vídeo, y por el mismo motivo. Sin
  // `encoderConfig` el SDK deja Opus sin declarar (~32 kbps) pese a documentar
  // `music_standard`; el perfil se aplica en las DOS ramas porque el bitrate y
  // el procesado son ejes independientes.
  //
  // El 3A se desactiva salvo que el evento pida lo contrario. Con el flag
  // activo las tres claves SE OMITEN en lugar de pasarse a `true`: no es lo
  // mismo, porque pasar `ANS: true` explícitamente añade además
  // `googHighpassFilter` en Chrome, que el camino por defecto no activa.
  // Omitirlas reproduce el comportamiento anterior byte a byte.
  //
  // Los asistentes se quedan en `undefined`: es SU cancelación de eco la que
  // impide que se oigan a sí mismos con retardo al escuchar al host por
  // altavoz, y 128 kbps sobre el micrófono integrado de un portátil es ancho
  // de banda tirado.
  const micTrackConfig = useMemo(() => {
    // Co-presentador: el perfil de 128 kbps (el audio no cuesta más) pero CON
    // el 3A del navegador — las claves se omiten, no se pasan a `true`. Oye al
    // host por sus altavoces y es su cancelación de eco la que impide devolver
    // esa voz al canal.
    if (coHostMode) return { encoderConfig: AGORA_MIC_ENCODER_HOST }
    if (!isHost) return undefined
    // El perfil sí aplica a las dos modalidades. El 3A NO: en `meeting` hay
    // hasta 17 emisores de audio y el host oye a todos, así que quitarle la
    // cancelación de eco provocaría acoplamiento para toda la sala. Por eso la
    // casilla del evento tampoco se ofrece ahí.
    if (isMeeting) return { encoderConfig: AGORA_MIC_ENCODER_HOST }
    return {
      encoderConfig: AGORA_MIC_ENCODER_HOST,
      ...(hostEchoCancellation ? {} : AGORA_MIC_NO_PROCESSING),
    }
  }, [isHost, isMeeting, hostEchoCancellation, coHostMode])

  // Host of a broadcast only: the screen goes on a second client (uid 2) so the
  // camera stays on air. Meeting keeps swapping camera and screen.
  const getScreenToken = useCallback(() => eventsAPI.getScreenToken(eventId), [eventId])
  const broadcastPublisher = !isMeeting && (isHost || coHostMode)

  const room = useAgoraRoom({
    enabled: !!(appId && channel && rtcToken),
    appId,
    channel,
    uid,
    rtcToken,
    initialRole: isHost || isMeeting || coHostMode ? 'host' : 'audience',
    renewToken,
    onKicked,
    cameraEncoderConfig,
    micTrackConfig,
    screenShareMode: isHost && !isMeeting ? 'separate-client' : 'swap',
    getScreenToken,
    screenEncoderConfig: AGORA_SCREEN_ENCODER_BROADCAST,
    // Dual stream for the cameras the stage may draw small in its corner
    lowStreamParameter: broadcastPublisher ? AGORA_LOW_STREAM_PARAMETER : undefined,
  })


  // Controles de host: UNA SOLA instancia, por encima del conmutador de modo.
  // Montarla dentro de cada presentación reiniciaría el procesador de fondos
  // virtuales y la enumeración de dispositivos en cada cambio de vista. El
  // co-presentador consume la misma instancia con una presentación restringida
  // (CoHostControls); sin `videoQuality` habilitada no tiene selector.
  const hostControls = useHostMediaControls({ enabled: isHost || coHostMode, room, eventId, cameraEncoderConfig, videoQuality })

  // Incoming moderation (targeted at this client by the server)
  const roomRef = useRef(room)
  roomRef.current = room

  const handlePromoted = useCallback(() => {
    // Parity with LiveKit: promotion auto-enables the microphone
    roomRef.current.becomeSpeaker({ autoEnableMic: true }).catch((err) => {
      console.warn('Error becoming speaker:', err)
    })
  }, [])

  const handleDemoted = useCallback(() => {
    roomRef.current.becomeAudience().catch((err) => {
      console.warn('Error becoming audience:', err)
    })
  }, [])

  const handleForceMute = useCallback(() => {
    roomRef.current.setMicrophoneEnabled(false).catch(() => {})
  }, [])

  const socket = useEventRoomSocket({
    eventId,
    isHost,
    attendeeId: attendeeSession?.attendeeId || null,
    accessToken: attendeeSession?.accessToken || null,
    enabled: true,
    onPromoted: handlePromoted,
    onDemoted: handleDemoted,
    onForceMute: handleForceMute,
  })

  const selfPresence = useMemo(
    () => socket.presence.find((p) => p.identity === socket.selfIdentity) || null,
    [socket.presence, socket.selfIdentity]
  )
  const amSpeaker = isHost || !!selfPresence?.speaker

  // Staff cannot be moderated (the server answers 400): the chat menu is not
  // offered on their messages. `staff` covers the admin in a meeting, where they
  // are not a co-presenter.
  const protectedIdentities = useMemo(
    () => new Set(socket.presence.filter((p) => p.coHost || p.staff).map((p) => p.identity)),
    [socket.presence]
  )
  // The host and any admin ban from the chat (event-chat-admin-moderation); the
  // server authorises the CURRENT role on every call.
  const canModerateChat = isHost || isAdmin

  // Rejoining as an already-promoted speaker (page refresh): switch the RTC
  // role without auto-enabling the mic (live promotions go through onPromoted)
  const speakerSyncRef = useRef(false)
  useEffect(() => {
    if (isMeeting || isHost || !socket.joined || !selfPresence) return
    if (speakerSyncRef.current) return
    speakerSyncRef.current = true
    if (selfPresence.speaker && roomRef.current.clientRole === 'audience') {
      roomRef.current.becomeSpeaker({ autoEnableMic: false }).catch(() => {})
    }
  }, [isMeeting, isHost, socket.joined, selfPresence])

  // Keep the presence screen-sharing flag in sync (host only; lets meeting
  // grids feature the shared screen)
  const setScreenSharing = socket.setScreenSharing
  useEffect(() => {
    if (!isHost) return
    setScreenSharing(room.screenEnabled)
  }, [isHost, room.screenEnabled, setScreenSharing])

  // agoraUid → RTC remote user / presence name lookups
  const remoteByUid = useMemo(() => {
    const map = new Map()
    for (const u of room.remoteUsers) map.set(Number(u.uid), u)
    return map
  }, [room.remoteUsers])

  const nameByUid = useMemo(() => {
    const map = new Map()
    for (const p of socket.presence) {
      if (p.agoraUid != null) map.set(Number(p.agoraUid), p.name)
    }
    return map
  }, [socket.presence])

  // Chat: hide messages from currently chat-banned identities (parity with
  // the LiveKit client-side filter; the server already stops future ones)
  const bannedIdentitiesRef = useRef(new Set())
  const bannedVersion = useMemo(() => {
    let changed = false
    for (const p of socket.presence) {
      if (p.chatBanned && !bannedIdentitiesRef.current.has(p.identity)) {
        bannedIdentitiesRef.current.add(p.identity)
        changed = true
      }
    }
    return changed ? bannedIdentitiesRef.current.size : bannedIdentitiesRef.current.size
  }, [socket.presence])

  const filteredMessages = useMemo(() => {
    if (bannedIdentitiesRef.current.size === 0) return socket.chatMessages
    return socket.chatMessages.filter((m) => !bannedIdentitiesRef.current.has(m.identity))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.chatMessages, bannedVersion])

  const handleBanFromChat = useCallback(async (identity) => {
    try {
      await eventsAPI.banFromChat(eventId, identity)
    } catch (err) {
      console.error('Error banning from chat:', err)
    }
  }, [eventId])

  // ── Whiteboard (optional phase) ───────────────────────────
  // The host activates → lazy room creation via whiteboard-token → socket
  // broadcast → everyone mounts. Credentials are refetched when the
  // "everyone writes" flag changes the attendee's expected role.
  const whiteboardState = socket.whiteboard

  // La pantalla no debe apagarse mientras se emite (host y co-presentador, sin
  // depender de la consola móvil) NI mientras un asistente está viendo algo:
  // Agora pinta el vídeo remoto en <video> silenciados, y con eso no se puede
  // contar con que el navegador mantenga la pantalla encendida. Sin nada que
  // ver («Esperando al host...») no se pide.
  const hasSomethingToWatch = whiteboardState.active || room.remoteUsers.some((u) => !!u.videoTrack)
  useScreenWakeLock({ enabled: !eventEnded && (isHost || coHostMode || hasSomethingToWatch) })
  const [wbCreds, setWbCreds] = useState(null)
  const wbFetchingRef = useRef(false)

  const fetchWhiteboardCreds = useCallback(async () => {
    const data = await eventsAPI.getWhiteboardToken(
      eventId,
      isHost ? null : attendeeSession?.attendeeId,
      isHost ? null : attendeeSession?.accessToken
    )
    setWbCreds(data)
    return data
  }, [eventId, isHost, attendeeSession])

  useEffect(() => {
    if (!whiteboardState.active) {
      setWbCreds(null)
      return
    }
    const expectedRole = isHost || (isMeeting && whiteboardState.everyoneWrites) ? 'writer' : 'reader'
    if (wbCreds?.role === expectedRole) return
    if (wbFetchingRef.current) return
    wbFetchingRef.current = true
    fetchWhiteboardCreds()
      .catch((err) => console.warn('Error obteniendo token de pizarra:', err))
      .finally(() => { wbFetchingRef.current = false })
  }, [whiteboardState.active, whiteboardState.everyoneWrites, wbCreds, isHost, isMeeting, fetchWhiteboardCreds])

  const handleWhiteboardToggle = useCallback(async () => {
    if (whiteboardState.active) {
      socket.toggleWhiteboard(false, whiteboardState.everyoneWrites)
      setWbCreds(null)
    } else {
      try {
        // Fetch first: creates the room lazily so attendees find it ready
        await fetchWhiteboardCreds()
        socket.toggleWhiteboard(true, whiteboardState.everyoneWrites)
      } catch (err) {
        console.error('Error activando la pizarra:', err)
      }
    }
  }, [whiteboardState.active, whiteboardState.everyoneWrites, socket, fetchWhiteboardCreds])

  const handleEveryoneWritesChange = useCallback((value) => {
    socket.toggleWhiteboard(whiteboardState.active, value)
  }, [socket, whiteboardState.active])

  // Device image upload for the whiteboard insert-image control (writers);
  // the backend re-validates the effective writer role on every upload
  const handleWhiteboardImageUpload = useCallback(async (file) => {
    return eventsAPI.uploadWhiteboardImage(
      eventId,
      file,
      isHost ? null : attendeeSession?.attendeeId,
      isHost ? null : attendeeSession?.accessToken
    )
  }, [eventId, isHost, attendeeSession])

  const whiteboardElement = whiteboardState.active && wbCreds ? (
    <WhiteboardPanel
      key={`${wbCreds.uuid}:${wbCreds.role}`}
      appIdentifier={wbCreds.appIdentifier}
      region={wbCreds.region}
      uuid={wbCreds.uuid}
      roomToken={wbCreds.roomToken}
      uid={wbCreds.uid || socket.selfIdentity || String(uid)}
      writable={wbCreds.role === 'writer'}
      displayName={selfPresence?.name || ''}
      onUploadImage={handleWhiteboardImageUpload}
    />
  ) : null

  // Chat sidebar height synced to the media area (ignoring fullscreen)
  const videoAreaRef = useRef(null)
  const [videoAreaHeight, setVideoAreaHeight] = useState(null)
  useEffect(() => {
    if (!videoAreaRef.current) return
    const observer = new ResizeObserver((entries) => {
      if (document.fullscreenElement) return
      for (const entry of entries) {
        setVideoAreaHeight(entry.contentRect.height)
      }
    })
    observer.observe(videoAreaRef.current)
    return () => observer.disconnect()
  }, [])

  if (!appId || !channel || !rtcToken) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <p className="text-sm text-gray-500">Conectando a la sala...</p>
      </div>
    )
  }

  const chatCell = roomCell('chat', layout)

  return (
    // Un solo árbol en todas las disposiciones (LiveRoomShell): en escritorio el
    // contenedor y los envoltorios intermedios son `contents` y la vista es la de
    // siempre; en compacto escena, filas y chat son celdas de su rejilla.
    <LiveRoomShell compact={compact} landscape={landscape} panelOpen={panelOpen}>
      {room.autoplayBlocked && <AudioActivationOverlay onActivate={room.resumeAudio} />}

      {compact && !landscape && <LiveRoomTopBar connectedCount={socket.presence.length} />}

      {room.joinError && (
        <div className={compact ? 'absolute inset-x-0 top-0 z-30 bg-red-50 px-4 py-3' : 'mb-4 rounded-md bg-red-50 p-4'}>
          <p className="text-sm text-red-700">{room.joinError}</p>
        </div>
      )}

      {/* Meeting fills the available viewport height (media column scrolls
          internally, chat keeps full height); broadcast keeps the LiveKit-parity
          two-column layout with the chat height synced to the media area. */}
      <div className={compact ? 'contents' : `flex flex-col lg:flex-row gap-4 ${isMeeting ? 'lg:h-[calc(100dvh-10rem)] lg:min-h-0' : ''}`}>
        {/* Left column: media area + controls */}
        <div
          className={compact ? 'contents' : `flex-1 min-h-0 flex flex-col ${isMeeting ? 'lg:overflow-y-auto' : ''}`}
          ref={videoAreaRef}
        >
          {isMeeting ? (
            <MeetingArea
              hostControls={hostControls}
              room={room}
              socket={socket}
              selfPresence={selfPresence}
              remoteByUid={remoteByUid}
              isHost={isHost}
              eventId={eventId}
              localUid={uid}
              eventEnded={eventEnded}
              layout={layout}
              whiteboardElement={whiteboardElement}
              whiteboard={{
                available: whiteboardAvailable,
                active: whiteboardState.active,
                everyoneWrites: whiteboardState.everyoneWrites,
                onToggle: handleWhiteboardToggle,
                onEveryoneWritesChange: handleEveryoneWritesChange,
                showEveryoneWrites: true,
              }}
            />
          ) : (
            <BroadcastArea
              hostControls={hostControls}
              allowMobileHostConsole={allowMobileHostConsole}
              room={room}
              socket={socket}
              selfPresence={selfPresence}
              remoteByUid={remoteByUid}
              nameByUid={nameByUid}
              isHost={isHost}
              isCoHost={coHostMode}
              amSpeaker={amSpeaker}
              eventId={eventId}
              localUid={uid}
              eventEnded={eventEnded}
              layout={layout}
              whiteboardElement={whiteboardElement}
              whiteboard={{
                available: whiteboardAvailable,
                active: whiteboardState.active,
                everyoneWrites: whiteboardState.everyoneWrites,
                onToggle: handleWhiteboardToggle,
                onEveryoneWritesChange: handleEveryoneWritesChange,
                showEveryoneWrites: false,
              }}
            />
          )}
        </div>

        {/* Chat — meeting: full height of the row; broadcast: synced to media
            area; compact: the rest of the shell, composer at the bottom */}
        <div
          className={compact ? chatCell.className : `lg:w-80 flex-shrink-0 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white ${
            isMeeting ? 'h-[60vh] lg:h-auto' : ''
          }`}
          style={compact ? chatCell.style : (!isMeeting && videoAreaHeight ? { height: videoAreaHeight, maxHeight: videoAreaHeight } : undefined)}
        >
          {!compact && (
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
              <p className="text-xs text-gray-500">{socket.presence.length} conectados</p>
            </div>
          )}
          <ChatPanel
            chatMessages={filteredMessages}
            onSend={socket.sendChatMessage}
            canModerate={canModerateChat}
            selfIdentity={socket.selfIdentity}
            protectedIdentities={protectedIdentities}
            isChatBanned={socket.selfChatBanned}
            onBanFromChat={handleBanFromChat}
            compact={compact}
          />
        </div>
      </div>
    </LiveRoomShell>
  )
}

// ---------------------------------------------------------------------------
// Audio activation overlay — same modal as EventLiveRoom (autoplay blocked)
// ---------------------------------------------------------------------------
function AudioActivationOverlay({ onActivate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-7 w-7 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Activar audio</h3>
        <p className="text-sm text-gray-500 mb-6">
          Tu navegador requiere una interacción para reproducir el audio del evento.
        </p>
        <button
          type="button"
          onClick={onActivate}
          className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        >
          {LIVE_ROOM_COPY.activateAudio}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Broadcast mode — LiveKit parity
// ---------------------------------------------------------------------------
function BroadcastArea({
  room, socket, selfPresence, remoteByUid, nameByUid,
  isHost, isCoHost, amSpeaker, eventId, localUid, eventEnded,
  whiteboardElement, whiteboard, hostControls, allowMobileHostConsole, layout,
}) {
  const hostRemote = remoteByUid.get(AGORA_HOST_UID)
  const { compact, landscape, panelOpen, togglePanel } = layout
  const stageCell = roomCell('stage', layout)
  const rowsCell = roomCell('rows', layout)
  const frame = stageFrame(layout)

  const [theaterOpen, setTheaterOpen] = useState(false)
  const [stripVisible, setStripVisible] = useState(true)
  const closeTheater = useCallback(() => setTheaterOpen(false), [])
  const openTheater = useCallback(() => setTheaterOpen(true), [])

  // Controles superpuestos de la escena en horizontal compacto. Fijos con la
  // pizarra en escena: ahí un toque pertenece al lienzo.
  const chrome = useAutoHideChrome({ enabled: compact && landscape && !theaterOpen, pinned: !!whiteboardElement })

  // Modos de vista del host (completa | consola | solo vídeo). Solo existen si
  // el evento los habilita y quien mira es el host.
  const viewMode = useHostViewMode({
    available: isHost && allowMobileHostConsole,
    eventEnded,
  })
  const inOverlay = viewMode.isOverlay

  // Event ended while in theater: close it (TheaterShell's cleanup also exits
  // native fullscreen) so the "Evento finalizado" dialog is visible
  useEffect(() => {
    if (eventEnded) setTheaterOpen(false)
  }, [eventEnded])

  // Dos superposiciones a pantalla completa a la vez se pelearían; al entrar en
  // un modo móvil se cierra el modo teatro.
  useEffect(() => {
    if (inOverlay) setTheaterOpen(false)
  }, [inOverlay])

  // Theater strip: everyone except the host (featured above)
  const stripEntries = useMemo(
    () => socket.presence.filter((p) => !p.isHost),
    [socket.presence]
  )

  // Video of the host's mobile view modes: their own local preview, screen
  // preferred — the console shows what the host is sending
  const publishedHostTrack = isHost
    ? (room.screenEnabled ? room.screenTrackRef.current : (room.camEnabled ? room.camTrackRef.current : null))
    : (hostRemote?.videoTrack || null)

  // ── Stage sources (spec agora-broadcast-stage) ──────────────
  // Una pista de Agora solo puede reproducirse en un contenedor a la vez: si el
  // árbol normal (oculto) y la superposición montaran ambos su AgoraVideo, el
  // desmontaje de uno llamaría a track.stop() y apagaría el del otro. Mientras
  // hay superposición, el vídeo lo pinta ella y solo ella: la escena no pinta
  // ninguno. La pizarra no es una pista y sigue montada en su sitio.
  const hostCameraTrack = isHost
    ? (room.camEnabled ? room.camTrackRef.current : null)
    : (hostRemote?.videoTrack || null)
  const hostScreenTrack = isHost
    ? (room.screenEnabled ? room.screenTrackRef.current : null)
    : (remoteByUid.get(AGORA_HOST_SCREEN_UID)?.videoTrack || null)

  // Co-presenters in join order. The stage shows the first one publishing
  // video, so every viewer resolves the same person.
  const coHostEntries = useMemo(
    () => socket.presence.filter((p) => p.coHost && p.agoraUid != null),
    [socket.presence]
  )
  let coHostCameraTrack = null
  let coHostIsLocal = false
  let coHostUid = null
  for (const entry of coHostEntries) {
    const local = entry.identity === socket.selfIdentity
    const track = local
      ? (room.camEnabled ? room.camTrackRef.current : null)
      : (remoteByUid.get(Number(entry.agoraUid))?.videoTrack || null)
    if (track) {
      coHostCameraTrack = track
      coHostIsLocal = local
      coHostUid = Number(entry.agoraUid)
      break
    }
  }

  const hostSpeaking = isHost
    ? room.speakingUids.has(localUid) || room.speakingUids.has(0)
    : room.speakingUids.has(AGORA_HOST_UID)
  const coHostSpeaking = coHostIsLocal
    ? room.speakingUids.has(localUid) || room.speakingUids.has(0)
    : coHostUid != null && room.speakingUids.has(coHostUid)

  const stageHostCamera = {
    key: 'host',
    track: inOverlay ? null : hostCameraTrack,
    speaking: hostSpeaking,
    mirror: false, // the host's framing goes out as captured (tripod rear camera)
  }
  const stageCoHostCamera = {
    key: 'cohost',
    track: inOverlay ? null : coHostCameraTrack,
    speaking: coHostSpeaking,
    mirror: undefined, // SDK default: own preview mirrored, remotes never
  }
  const stageContent = whiteboardElement
    ? { kind: 'whiteboard', element: whiteboardElement }
    : (hostScreenTrack && !inOverlay ? { kind: 'screen', track: hostScreenTrack } : null)
  const hasStageContent = !!whiteboardElement || !!hostScreenTrack

  // Theater entry points as before: over the whiteboard for everyone, over any
  // video or content for everyone but the host
  const showTheaterButton = !theaterOpen && (
    !!whiteboardElement ||
    (!isHost && !!(stageHostCamera.track || stageCoHostCamera.track || stageContent))
  )

  const stagePlaceholder = (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      {isHost ? (
        <>
          <p className="text-white text-sm">{STAGE_COPY.presenterTitle}</p>
          <p className="text-gray-400 text-xs">{STAGE_COPY.presenterHint}</p>
        </>
      ) : (
        <p className="text-white text-sm">{STAGE_COPY.waitingHost}</p>
      )}
    </div>
  )

  // Dual stream subscription: the low stream for remote cameras drawn in the
  // corner, the high one otherwise. Re-applied when remote users change so a
  // camera that arrives late gets the right stream; the hook only calls the
  // SDK for uids whose type actually changed.
  const remoteCameraUids = []
  if (!isHost) remoteCameraUids.push(AGORA_HOST_UID)
  for (const entry of coHostEntries) {
    if (entry.identity !== socket.selfIdentity) remoteCameraUids.push(Number(entry.agoraUid))
  }
  const streamTypesKey = JSON.stringify(stageStreamTypes(remoteCameraUids, hasStageContent))
  const setRemoteStreamTypes = room.setRemoteStreamTypes
  useEffect(() => {
    setRemoteStreamTypes(JSON.parse(streamTypesKey))
  }, [streamTypesKey, room.remoteUsers, setRemoteStreamTypes])

  // Elemento de vídeo de los modos móviles. `stop()` sobre una pista LOCAL
  // detiene la reproducción, no la publicación: por eso mover el vídeo entre
  // modos no corta la emisión para los asistentes.
  const overlayVideo = publishedHostTrack
    ? <AgoraVideo track={publishedHostTrack} className="w-full h-full" fit="contain" mirror={false} />
    : (
      <div className="flex h-full items-center justify-center px-2 text-center">
        <p className="text-xs text-gray-400">Activa tu cámara en los controles</p>
      </div>
    )

  const modeSwitcher = isHost && allowMobileHostConsole ? (
    <HostViewModeSwitcher
      mode={viewMode.mode}
      onSelect={viewMode.selectMode}
      isFullscreen={viewMode.isFullscreen}
      onEnterFullscreen={viewMode.enterFullscreen}
    />
  ) : null

  // Promoted viewers publishing video (rare but supported: camera after
  // promotion). Never the stage's own tracks — the host's camera (uid 1) and
  // screen (uid 2) or a co-presenter: a track plays in one container only.
  const coHostUids = new Set(coHostEntries.map((p) => Number(p.agoraUid)))
  const promotedVideoUsers = room.remoteUsers.filter((u) => {
    const remoteUid = Number(u.uid)
    return remoteUid !== AGORA_HOST_UID &&
      remoteUid !== AGORA_HOST_SCREEN_UID &&
      !coHostUids.has(remoteUid) &&
      u.videoTrack
  })

  const handRaised = !!selfPresence?.handRaised
  const toggleHandRaise = () => socket.setHandRaised(!handRaised)

  const handlePromote = useCallback((identity) => promoteParticipant(eventId, identity), [eventId])
  const handleDemote = useCallback((identity) => demoteParticipant(eventId, identity), [eventId])

  return (
    // El envoltorio está SIEMPRE montado y solo cambia de className, igual que
    // TheaterShell: es lo que impide que la pizarra cambie de posición en el
    // árbol de React, lo que la desconectaría de su sala de fastboard.
    // `contents` fuera de la superposición: el envoltorio desaparece del
    // layout y sus hijos vuelven a ser hijos directos del contenedor flex del
    // padre, de modo que la vista completa queda exactamente como estaba.
    <div ref={viewMode.shellRef} className={inOverlay ? 'fixed inset-0 z-[60] bg-gray-900' : 'contents'}>
      {/* Árbol normal. Se OCULTA (no se desmonta) mientras hay superposición:
          desmontarlo sacaría la pizarra de su posición en el árbol. Igual que
          el envoltorio de fuera, es `contents` cuando no estorba. */}
      <div className={inOverlay ? 'hidden' : 'contents'}>
      <TheaterShell
        open={theaterOpen}
        onClose={closeTheater}
        normalClassName={stageCell.className}
        normalStyle={stageCell.style}
        onNormalClick={compact && landscape ? chrome.toggle : undefined}
        lockLandscape={compact}
      >
        {/* One stage for every role: single camera, split or picture-in-picture
            interview, or whiteboard / screen with the cameras in the corner.
            Its content layer keeps the whiteboard at a fixed tree position. */}
        <BroadcastStage
          hostCamera={stageHostCamera}
          coHostCamera={stageCoHostCamera}
          content={stageContent}
          layout={socket.stageLayout}
          theaterOpen={theaterOpen}
          placeholder={stagePlaceholder}
          frame={frame}
          theaterButton={compact && landscape && !theaterOpen ? (
            <StageChromeGroup visible={chrome.visible} panelOpen={panelOpen} onTogglePanel={togglePanel}>
              {showTheaterButton ? <TheaterButton onOpen={openTheater} /> : null}
            </StageChromeGroup>
          ) : (showTheaterButton ? <TheaterButton onOpen={openTheater} /> : null)}
        />

        {theaterOpen && (
          <>
            <TheaterChrome
              stripVisible={stripVisible}
              onToggleStrip={() => setStripVisible((v) => !v)}
              onClose={closeTheater}
            />
            {/* Broadcast strip: the avatar+mic tiles of the normal view (state only) */}
            <TheaterStrip
              entries={stripEntries}
              visible={stripVisible}
              renderTile={(p) => (
                <ParticipantTile
                  key={p.identity}
                  entry={p}
                  isLocal={p.identity === socket.selfIdentity}
                  viewerIsHost={false}
                  remoteByUid={remoteByUid}
                  speakingUids={room.speakingUids}
                  localMicEnabled={room.micEnabled}
                  amSpeaker={amSpeaker}
                  wasPromoted={false}
                  readOnly
                />
              )}
            />
          </>
        )}
        {compact && landscape && !theaterOpen && (
          <LandscapeStageChrome
            visible={chrome.visible}
            connectedCount={socket.presence.length}
            bottomLeft={!isHost && !isCoHost && !panelOpen ? (
              <button
                type="button"
                onClick={toggleHandRaise}
                aria-pressed={handRaised}
                aria-label={handRaised ? LIVE_ROOM_COPY.lowerHand : LIVE_ROOM_COPY.raiseHand}
                className={`flex size-11 items-center justify-center rounded-lg text-white [touch-action:manipulation] ${
                  handRaised ? 'bg-amber-500' : 'bg-black/60 hover:bg-black/80'
                }`}
              >
                <HandIcon className="size-5" />
              </button>
            ) : null}
            bottomLeftPinned={handRaised}
          />
        )}
        {compact && !landscape && !theaterOpen && (isHost || isCoHost) && room.camEnabled && <PortraitBadge />}
        <SpeakingPulseStyle />
      </TheaterShell>

      {/* Filas bajo la escena. En escritorio el envoltorio es `contents` y sus
          hijos son los de siempre; en compacto es la celda `rows` de la rejilla. */}
      <div className={compact ? rowsCell.className : 'contents'} style={rowsCell.style}>
        {compact ? (
          !theaterOpen && (
            <>
              {promotedVideoUsers.length > 0 && (
                <CompactPromotedRow users={promotedVideoUsers} nameByUid={nameByUid} />
              )}
              <CompactParticipantRow
                presence={socket.presence}
                selfIdentity={socket.selfIdentity}
                remoteByUid={remoteByUid}
                speakingUids={room.speakingUids}
                viewerIsHost={isHost}
                localMicEnabled={room.micEnabled}
                amSpeaker={amSpeaker}
                showHand={!isHost && !isCoHost}
                handRaised={handRaised}
                onToggleHand={toggleHandRaise}
                onPromote={handlePromote}
                onDemote={handleDemote}
                onSelfMute={() => room.setMicrophoneEnabled(false)}
              />
              {(isHost || isCoHost) && !landscape && !room.camEnabled && <OrientationHint />}
              {isHost && (
                <CompactHostControls
                  room={room}
                  hostControls={hostControls}
                  endLabel="Finalizar stream"
                  whiteboard={whiteboard}
                  hostView={allowMobileHostConsole ? { mode: viewMode.mode, onSelect: viewMode.selectMode } : null}
                />
              )}
              {isCoHost && (
                <CompactCoHostControls
                  room={room}
                  hostControls={hostControls}
                  layout={socket.stageLayout}
                  onLayoutChange={socket.setStageLayout}
                  layoutLocked={hasStageContent}
                />
              )}
            </>
          )
        ) : (
          <>
      {/* Promoted viewers grid */}
      {!theaterOpen && promotedVideoUsers.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {promotedVideoUsers.map((u) => (
            <div
              key={u.uid}
              className="bg-black rounded-lg overflow-hidden aspect-video relative"
            >
              <AgoraVideo track={u.videoTrack} className="w-full h-full" fit="cover" />
              <div className="absolute bottom-1 left-1 bg-black/50 rounded px-1.5 py-0.5">
                <span className="text-xs text-white">{nameByUid.get(Number(u.uid)) || u.uid}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Participant grid — below host video (unmounted while the theater is
          open: its tiles reappear in the theater strip) */}
      {!theaterOpen && (
        <AgoraParticipantGrid
          presence={socket.presence}
          selfIdentity={socket.selfIdentity}
          remoteByUid={remoteByUid}
          speakingUids={room.speakingUids}
          viewerIsHost={isHost}
          eventId={eventId}
          localMicEnabled={room.micEnabled}
          amSpeaker={amSpeaker}
          onSelfMute={() => room.setMicrophoneEnabled(false)}
        />
      )}

      {/* Toggle controls for host */}
      {isHost && (
        <div className="mt-3">
          <AgoraHostControls room={room} hostControls={hostControls} endLabel="Finalizar stream" whiteboard={whiteboard} />
        </div>
      )}

      {/* Co-presenter: microphone, camera, speakers and the camera layout */}
      {isCoHost && (
        <div className="mt-3">
          <CoHostControls
            room={room}
            hostControls={hostControls}
            layout={socket.stageLayout}
            onLayoutChange={socket.setStageLayout}
            layoutLocked={hasStageContent}
          />
        </div>
      )}

      {/* Entrada a los modos móviles desde la vista completa. Sobre fondo claro,
          así que el conmutador va dentro de una barra oscura propia. */}
      {modeSwitcher && (
        <div className="mt-3 flex items-center gap-x-3 rounded-md bg-gray-900 px-3 py-2">
          <span className="text-xs text-gray-400">Vista del host</span>
          {modeSwitcher}
        </div>
      )}

      {/* Hand raise for viewers (the co-presenter already has the floor) */}
      {!isHost && !isCoHost && (
        <div className="mt-3">
          <button
            type="button"
            onClick={toggleHandRaise}
            className={`inline-flex items-center gap-x-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm ${
              handRaised
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
            }`}
          >
            <HandIcon className="h-4 w-4" />
            {handRaised ? 'Bajar mano' : 'Levantar mano'}
          </button>
        </div>
      )}
          </>
        )}
      </div>
      </div>

      {inOverlay && (
        viewMode.mode === HOST_VIEW_MODES.CONSOLE ? (
          <HostConsole
            room={room}
            hostControls={hostControls}
            connectedCount={socket.presence.length}
            videoElement={overlayVideo}
            modeSwitcher={modeSwitcher}
          />
        ) : (
          <HostPreviewMode videoElement={overlayVideo} modeSwitcher={modeSwitcher} />
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Host controls (broadcast + meeting extras) — same layout as EventLiveRoom
// ---------------------------------------------------------------------------
function AgoraHostControls({ room, hostControls, endLabel, whiteboard }) {
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [openDeviceMenu, setOpenDeviceMenu] = useState(null)

  // Todo el estado y las acciones vienen de useHostMediaControls, instanciado
  // una sola vez en AgoraLiveRoom: esta vista y la consola móvil son dos
  // presentaciones del mismo estado. Lo único propio de esta presentación es
  // qué menú está abierto y el diálogo de confirmación.
  const {
    devices, videoEffect, deviceError, isEnding,
    toggleMic, toggleCamera, toggleScreenShare, selectDevice: selectDeviceFn, endEvent,
    videoQuality, selectVideoQuality,
  } = hostControls

  // Same state as the device dropdowns, so only one menu is ever open. Opening
  // the effects panel is what triggers the extension download.
  const toggleEffectsMenu = useCallback((kind) => {
    setOpenDeviceMenu(kind)
    if (kind === 'effects') videoEffect.ensureLoaded()
  }, [videoEffect])

  const handleEndStream = async () => {
    const ok = await endEvent()
    if (!ok) setShowEndConfirm(false)
  }

  const selectDevice = (kind) => async (device) => {
    await selectDeviceFn(kind)(device)
    setOpenDeviceMenu(null)
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* gap-y: this row wraps once there are enough controls (Efectos, Pizarra)
            or the viewport narrows — without it the wrapped lines touch */}
        <div className="flex items-center gap-x-6 gap-y-3 flex-wrap">
          <div className="relative flex items-center gap-x-2">
            <span className="text-sm text-gray-700">Micrófono</span>
            <ToggleSwitch checked={room.micEnabled} onChange={toggleMic} />
            <DeviceDropdown
              kind="audioinput"
              isOpen={openDeviceMenu === 'audioinput'}
              onToggle={setOpenDeviceMenu}
              devices={devices.microphones}
              activeDeviceId={devices.activeMicId}
              onSelect={selectDevice('audioinput')}
            />
          </div>
          <div className="relative flex items-center gap-x-2">
            <span className="text-sm text-gray-700">Cámara</span>
            <ToggleSwitch checked={room.camEnabled} onChange={toggleCamera} />
            <DeviceDropdown
              kind="videoinput"
              isOpen={openDeviceMenu === 'videoinput'}
              onToggle={setOpenDeviceMenu}
              devices={devices.cameras}
              activeDeviceId={devices.activeCamId}
              onSelect={selectDevice('videoinput')}
            />
          </div>
          {videoEffect.supported && (
            <div className="relative flex items-center gap-x-2">
              <span className="text-sm text-gray-700">Efectos</span>
              <VideoEffectsMenu
                isOpen={openDeviceMenu === 'effects'}
                onToggle={toggleEffectsMenu}
                disabled={!room.camEnabled}
                status={videoEffect.status}
                effect={videoEffect.effect}
                applying={videoEffect.applying}
                onSelect={videoEffect.selectEffect}
              />
            </div>
          )}
          {devices.playbackDevices.length > 0 && (
            <div className="relative flex items-center gap-x-2">
              <span className="text-sm text-gray-700">Altavoces</span>
              <DeviceDropdown
                kind="audiooutput"
                isOpen={openDeviceMenu === 'audiooutput'}
                onToggle={setOpenDeviceMenu}
                devices={devices.playbackDevices}
                activeDeviceId={devices.activeSpeakerId}
                onSelect={selectDevice('audiooutput')}
              />
            </div>
          )}
          <div className="flex items-center gap-x-2">
            <span className="text-sm text-gray-700">Pantalla</span>
            <ToggleSwitch checked={room.screenEnabled} onChange={toggleScreenShare} />
          </div>
          {/* Mismo control que la consola, mismo estado: la calidad elegida en
              una vista es la que muestra la otra. */}
          {selectVideoQuality && (
            <div className="flex items-center gap-x-2">
              <span className="text-sm text-gray-700">Calidad</span>
              <div className="flex gap-x-1">
                {AGORA_VIDEO_QUALITIES.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => selectVideoQuality(level.id)}
                    aria-pressed={videoQuality === level.id}
                    title={`${level.label} — ${level.detail}`}
                    className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                      videoQuality === level.id
                        ? 'bg-gray-900 text-white ring-gray-900'
                        : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {level.short}
                  </button>
                ))}
              </div>
            </div>
          )}
          {whiteboard?.available && (
            <div className="flex items-center gap-x-2">
              <span className="text-sm text-gray-700">Pizarra</span>
              <ToggleSwitch checked={whiteboard.active} onChange={whiteboard.onToggle} />
            </div>
          )}
          {whiteboard?.available && whiteboard.showEveryoneWrites && whiteboard.active && (
            <label className="flex items-center gap-x-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={whiteboard.everyoneWrites}
                onChange={(e) => whiteboard.onEveryoneWritesChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-black"
              />
              Todos escriben
            </label>
          )}
          {deviceError && (
            <span className="text-xs text-red-600">{deviceError}</span>
          )}
          {videoEffect.message && (
            <span className="text-xs text-red-600">{videoEffect.message}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowEndConfirm(true)}
          className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 whitespace-nowrap"
        >
          {endLabel}
        </button>
      </div>

      <ConfirmDialog
        open={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={handleEndStream}
        title={endLabel}
        message="¿Estás seguro de que quieres finalizar el stream? Esta acción terminará el evento para todos los participantes."
        confirmText={isEnding ? 'Finalizando...' : 'Finalizar'}
        cancelText="Cancelar"
        type="danger"
      />
    </>
  )
}

function SpeakingPulseStyle() {
  return (
    <style jsx global>{`
      @keyframes speaking-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
        50% { box-shadow: 0 0 0 5px rgba(74, 222, 128, 0.15); }
      }
    `}</style>
  )
}

async function promoteParticipant(eventId, identity) {
  try {
    await eventsAPI.promoteParticipant(eventId, identity)
  } catch (err) {
    console.error('Error promoting participant:', err)
  }
}

async function demoteParticipant(eventId, identity) {
  try {
    await eventsAPI.demoteParticipant(eventId, identity)
  } catch (err) {
    console.error('Error demoting participant:', err)
  }
}

// Aviso para quien emite desde un móvil en vertical: la orientación de captura
// queda fijada al activar la cámara por primera vez (la pista se reutiliza).
function OrientationHint() {
  return (
    <p className="border-b border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500">
      {LIVE_ROOM_COPY.orientationHint}
    </p>
  )
}

// Etiqueta sobre la propia escena de quien emite en vertical. Nunca la ve la
// audiencia: se pinta solo en la vista de quien publica.
function PortraitBadge() {
  return (
    <span className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
      {LIVE_ROOM_COPY.portraitBadge}
    </span>
  )
}

// Promoted viewers publishing video, as a horizontal row in the compact room
function CompactPromotedRow({ users, nameByUid }) {
  return (
    <div className="scrollbar-hide flex flex-shrink-0 gap-x-2 overflow-x-auto overscroll-x-contain border-b border-gray-200 bg-white p-2">
      {users.map((u) => (
        <div key={u.uid} className="relative aspect-video h-16 flex-shrink-0 overflow-hidden rounded-md bg-black">
          <AgoraVideo track={u.videoTrack} className="h-full w-full" fit="cover" />
          <span className="absolute bottom-0.5 left-0.5 max-w-[calc(100%-0.25rem)] truncate rounded bg-black/50 px-1 text-[10px] text-white">
            {nameByUid.get(Number(u.uid)) || u.uid}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Participant grid (broadcast) — presence-driven, same states/colors/order as
// the LiveKit ParticipantGrid
// ---------------------------------------------------------------------------
function AgoraParticipantGrid({
  presence, selfIdentity, remoteByUid, speakingUids, viewerIsHost,
  eventId, localMicEnabled, amSpeaker, onSelfMute,
}) {
  // Track identities that were ever promoted (red styling after demotion)
  const everSpeakerRef = useRef(new Set())
  for (const p of presence) {
    if (p.speaker && !p.isHost) everSpeakerRef.current.add(p.identity)
  }

  // Host view: exclude host from grid (they see their own video above)
  const gridEntries = viewerIsHost ? presence.filter((p) => !p.isHost) : presence

  const sorted = useMemo(() => sortParticipants(gridEntries, selfIdentity), [gridEntries, selfIdentity])

  const handlePromote = useCallback((identity) => promoteParticipant(eventId, identity), [eventId])
  const handleDemote = useCallback((identity) => demoteParticipant(eventId, identity), [eventId])

  if (sorted.length === 0) return null

  return (
    <div className="mt-3 landscape:max-md:max-h-[30vh] landscape:max-md:overflow-y-auto pr-1">
      <div className="flex flex-wrap gap-2">
        {sorted.map((p) => (
          <ParticipantTile
            key={p.identity}
            entry={p}
            isLocal={p.identity === selfIdentity}
            viewerIsHost={viewerIsHost}
            remoteByUid={remoteByUid}
            speakingUids={speakingUids}
            localMicEnabled={localMicEnabled}
            amSpeaker={amSpeaker}
            wasPromoted={everSpeakerRef.current.has(p.identity)}
            onPromote={handlePromote}
            onDemote={handleDemote}
            onSelfMute={onSelfMute}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Meeting mode — Meet-style grid of large tiles, self-serve controls for all
// ---------------------------------------------------------------------------
function MeetingArea({ room, socket, selfPresence, remoteByUid, isHost, eventId, localUid, eventEnded, whiteboardElement, whiteboard, hostControls, layout }) {
  const { compact, landscape, panelOpen, togglePanel } = layout
  const stageCell = roomCell('stage', layout)
  const rowsCell = roomCell('rows', layout)
  const frame = stageFrame(layout)
  const hostEntry = socket.presence.find((p) => p.isHost)
  const hostScreenSharing = !whiteboardElement && !!hostEntry?.screenSharing

  // Attendees always see the host featured full-width. The host only gets a big
  // featured area when there's something to highlight — the whiteboard or a shared
  // screen; otherwise the host watches everyone in an equal grid (own tile first),
  // which is better for interacting with all participants.
  // Compact: everyone, host included, gets the featured box — sixteen equal
  // squares in portrait leave either tiny tiles or no chat.
  const showFeatured = compact || !!whiteboardElement || hostScreenSharing || !isHost

  const [theaterOpen, setTheaterOpen] = useState(false)
  const [stripVisible, setStripVisible] = useState(true)
  const closeTheater = useCallback(() => setTheaterOpen(false), [])
  const openTheater = useCallback(() => setTheaterOpen(true), [])

  // Controles superpuestos en horizontal compacto (fijos con la pizarra)
  const chrome = useAutoHideChrome({ enabled: compact && landscape && !theaterOpen, pinned: !!whiteboardElement })

  // The featured area can disappear live (the host stops sharing / closes the
  // whiteboard and drops to the equal grid): nothing left to feature
  useEffect(() => {
    if (theaterOpen && !showFeatured) setTheaterOpen(false)
  }, [theaterOpen, showFeatured])

  // Event ended while in theater: close it (TheaterShell's cleanup also exits
  // native fullscreen) so the "Evento finalizado" dialog is visible
  useEffect(() => {
    if (eventEnded) setTheaterOpen(false)
  }, [eventEnded])

  // Theater strip: everyone except the host (featured above)
  const stripEntries = useMemo(
    () => socket.presence.filter((p) => !p.isHost),
    [socket.presence]
  )

  // Host's own featured track (screen has priority over camera); the host sees their
  // own track, everyone else sees the host's remote track.
  const hostVideoTrack = isHost
    ? (room.screenEnabled ? room.screenTrackRef.current : (room.camEnabled ? room.camTrackRef.current : null))
    : (remoteByUid.get(AGORA_HOST_UID)?.videoTrack || null)

  const hostSpeaking = isHost
    ? (room.speakingUids.has(localUid) || room.speakingUids.has(0))
    : room.speakingUids.has(AGORA_HOST_UID)

  // Featured layout → the grid holds everyone except the host. Host equal-grid →
  // everyone, host tile first.
  const gridEntries = showFeatured
    ? socket.presence.filter((p) => !p.isHost)
    : [...socket.presence].sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0))

  // Orden por actividad de voz: quien tiene el micrófono abierto y se oye pasa a
  // los primeros puestos — detrás del host en su propia rejilla. Sale de
  // `volume-indicator` (Agora informa del nivel de cada usuario cada dos
  // segundos; es lo mismo que pinta el anillo verde). El propio usuario no se
  // mueve, para que su recuadro no salte bajo sus ojos. Se aplica con CSS
  // `order`: ningún vídeo cambia de nodo en el DOM.
  const speakingIdentities = socket.presence
    .filter((p) => (
      !p.isHost &&
      p.identity !== socket.selfIdentity &&
      p.agoraUid != null &&
      room.speakingUids.has(Number(p.agoraUid)) &&
      !!remoteByUid.get(Number(p.agoraUid))?.hasAudio
    ))
    .map((p) => p.identity)
  const speakerActivity = useSpeakerActivity(speakingIdentities)
  const ranks = speakerRanks(gridEntries, speakerActivity, {
    pinnedIdentity: showFeatured ? null : (hostEntry?.identity ?? null),
    selfIdentity: socket.selfIdentity,
  })
  // Theater strip: the same speaker order. TheaterStrip applies it live only on
  // its first page and freezes it while the user pages through the rest.
  const orderedStripEntries = [...stripEntries].sort(
    (a, b) => (ranks.get(a.identity) ?? 0) - (ranks.get(b.identity) ?? 0)
  )

  return (
    <>
      {showFeatured && (
        <TheaterShell
          open={theaterOpen}
          onClose={closeTheater}
          normalClassName={compact ? stageCell.className : 'mb-3 flex-shrink-0'}
          normalStyle={stageCell.style}
          onNormalClick={compact && landscape ? chrome.toggle : undefined}
          lockLandscape={compact}
        >
          {whiteboardElement ? (
            <div
              className={theaterOpen
                ? 'relative flex-1 min-h-0 bg-white'
                : frame ? `${frame.className} bg-white` : 'rounded-lg overflow-hidden aspect-video w-full relative border border-gray-200 bg-white'}
              style={!theaterOpen && frame ? frame.style : undefined}
            >
              {whiteboardElement}
              {/* Theater for the whiteboard — host and attendees alike */}
              {!theaterOpen && (
                <TheaterButton onOpen={openTheater} className="absolute top-2 right-2 z-10" />
              )}
            </div>
          ) : (
            <div
              className={`relative transition-shadow duration-300 ${
                theaterOpen ? 'flex-1 min-h-0 bg-black' : frame ? `${frame.className} bg-black` : 'bg-black rounded-lg overflow-hidden aspect-video w-full'
              } ${hostSpeaking ? 'ring-2 ring-green-400' : ''}`}
              style={{
                ...(!theaterOpen && frame ? frame.style : {}),
                ...(hostSpeaking ? { animation: 'speaking-pulse 1.5s ease-in-out infinite' } : {}),
              }}
            >
              {hostVideoTrack ? (
                <AgoraVideo track={hostVideoTrack} className="w-full h-full" fit="contain" />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-3xl font-semibold text-white">
                    {(hostEntry?.name || 'H').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="absolute bottom-1 left-1 bg-black/50 rounded px-1.5 py-0.5">
                <span className="text-xs text-white">
                  {hostEntry?.name || 'Host'}{hostScreenSharing ? ' — pantalla' : ''}
                </span>
              </div>
              {/* Theater whenever the featured area has content (camera or screen) */}
              {!theaterOpen && hostVideoTrack && (
                <TheaterButton onOpen={openTheater} className="absolute bottom-2 right-2" />
              )}
            </div>
          )}
          {theaterOpen && (
            <>
              <TheaterChrome
                stripVisible={stripVisible}
                onToggleStrip={() => setStripVisible((v) => !v)}
                onClose={closeTheater}
              />
              {/* Meeting strip: compact square camera tiles */}
              <TheaterStrip
                entries={orderedStripEntries}
                visible={stripVisible}
                reorderOnFirstPage
                renderTile={(p) => (
                  <TheaterMeetingTile
                    key={p.identity}
                    entry={p}
                    isLocal={p.identity === socket.selfIdentity}
                    room={room}
                    remoteByUid={remoteByUid}
                    speakingUids={room.speakingUids}
                    localUid={localUid}
                  />
                )}
              />
            </>
          )}
          {compact && landscape && !theaterOpen && (
            <LandscapeStageChrome
              visible={chrome.visible}
              connectedCount={socket.presence.length}
              topRight={<StageChromeGroup visible={chrome.visible} panelOpen={panelOpen} onTogglePanel={togglePanel} />}
            />
          )}
          {compact && !landscape && !theaterOpen && isHost && room.camEnabled && !whiteboardElement && !room.screenEnabled && (
            <PortraitBadge />
          )}
        </TheaterShell>
      )}

      <div className={compact ? rowsCell.className : 'contents'} style={rowsCell.style}>
        {compact ? (
          !theaterOpen && gridEntries.length > 0 && (
            <CompactCameraRow
              entries={gridEntries}
              selfIdentity={socket.selfIdentity}
              room={room}
              remoteByUid={remoteByUid}
              speakingUids={room.speakingUids}
              localUid={localUid}
              viewerIsHost={isHost}
              onForceMute={socket.requestForceMute}
              ranks={ranks}
            />
          )
        ) : (
          <>
      {/* Camera tiles (desktop), unmounted while the theater is open so each
          track has a single container.
          - Host with nothing featured: an equal grid of 3, 4 or 5 columns sized
            to the column's width AND height, so every tile is visible without
            scrolling (MeetingGrid, lib/meetingGrid.js).
          - Featured content above (attendees, or the host sharing): rows of 5.
          Speakers move forward through CSS `order` in both. */}
      {!theaterOpen && gridEntries.length > 0 && (() => {
        const tiles = gridEntries.map((p) => (
          <MeetingTile
            key={p.identity}
            entry={p}
            isLocal={p.identity === socket.selfIdentity}
            room={room}
            remoteByUid={remoteByUid}
            speakingUids={room.speakingUids}
            viewerIsHost={isHost}
            localUid={localUid}
            order={ranks.get(p.identity)}
            onForceMute={() => socket.requestForceMute(p.identity)}
          />
        ))
        return showFeatured
          ? <div className="grid grid-cols-5 gap-2">{tiles}</div>
          : <MeetingGrid count={gridEntries.length}>{tiles}</MeetingGrid>
      })()}

          </>
        )}

        {compact && isHost && !landscape && !room.camEnabled && <OrientationHint />}

        {/* Bottom control bar: self-serve controls for everyone. MeetingSelfControls
            stays mounted across layouts: it owns its device and effect hooks. */}
        <div className={compact ? '' : 'mt-3 flex-shrink-0'}>
          {isHost ? (
            compact
              ? <CompactHostControls room={room} hostControls={hostControls} endLabel="Finalizar evento" whiteboard={whiteboard} />
              : <AgoraHostControls room={room} hostControls={hostControls} endLabel="Finalizar evento" whiteboard={whiteboard} />
          ) : (
            <MeetingSelfControls room={room} compact={compact} />
          )}
        </div>
      </div>
      <SpeakingPulseStyle />
    </>
  )
}

function MeetingTile({ entry, isLocal, room, remoteByUid, speakingUids, viewerIsHost, localUid, onForceMute, order }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const remoteUser = entry.agoraUid != null ? remoteByUid.get(Number(entry.agoraUid)) : null
  const videoTrack = isLocal
    ? (room.camEnabled ? room.camTrackRef.current : null)
    : (remoteUser?.videoTrack || null)
  const micActive = isLocal ? room.micEnabled : !!remoteUser?.hasAudio
  const speaking = speakingUids.has(isLocal ? localUid : Number(entry.agoraUid))

  const initial = (entry.name || '?').charAt(0).toUpperCase()
  const displayName = isLocal ? `${entry.name} (Tu)` : entry.name

  return (
    <div
      className={`bg-black rounded-lg overflow-hidden aspect-square relative transition-shadow duration-300 ${
        speaking ? 'ring-2 ring-green-400' : ''
      }`}
      style={{
        ...(order != null ? { order } : {}),
        ...(speaking ? { animation: 'speaking-pulse 1.5s ease-in-out infinite' } : {}),
      }}
    >
      {videoTrack ? (
        <AgoraVideo track={videoTrack} className="w-full h-full" fit="cover" />
      ) : (
        <div className="flex items-center justify-center h-full">
          <span className="flex h-10 w-10 text-lg sm:h-16 sm:w-16 sm:text-2xl items-center justify-center rounded-full bg-gray-700 font-semibold text-white">
            {initial}
          </span>
        </div>
      )}

      {/* Name + mic badge */}
      <div className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] flex items-center gap-x-1.5 bg-black/50 rounded px-1.5 py-0.5">
        <span className="text-xs text-white truncate">{displayName}</span>
        {micActive ? (
          <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        ) : (
          <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        )}
      </div>

      {/* Host moderation menu (silence a noisy participant) */}
      {viewerIsHost && !isLocal && !entry.isHost && (
        <div className="absolute top-1 right-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-md bg-black/50 p-1 text-white/80 hover:text-white hover:bg-black/70"
            title="Opciones"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-20 min-w-max rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onForceMute() }}
                className="block w-full px-4 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
              >
                Silenciar micrófono
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Meeting self controls for non-host participants (mic, camera, devices)
function MeetingSelfControls({ room, compact = false }) {
  const [deviceError, setDeviceError] = useState('')
  const [openDeviceMenu, setOpenDeviceMenu] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const devices = useAgoraDevices({
    enabled: true,
    micTrackRef: room.micTrackRef,
    camTrackRef: room.camTrackRef,
    setSpeakerDevice: room.setSpeakerDevice,
    micEnabled: room.micEnabled,
    camEnabled: room.camEnabled,
    // Un asistente de reunión publica con el perfil de participante; al cambiar
    // de cámara hay que reafirmarlo o la trasera puede volver a 4:3.
    cameraEncoderConfig: AGORA_CAMERA_ENCODER_PARTICIPANT,
  })

  const videoEffect = useAgoraVideoEffect({
    camTrackRef: room.camTrackRef,
    camTrackVersion: room.camTrackVersion,
    camEnabled: room.camEnabled,
  })

  // Same state as the device dropdowns, so only one menu is ever open. Opening
  // the effects panel is what triggers the extension download.
  const toggleEffectsMenu = (kind) => {
    setOpenDeviceMenu(kind)
    if (kind === 'effects') videoEffect.ensureLoaded()
  }

  const toggleMic = async () => {
    setDeviceError('')
    try {
      await room.setMicrophoneEnabled(!room.micEnabled, devices.activeMicId)
    } catch (err) {
      console.warn('Microphone error:', err)
      setDeviceError(err?.code === 'NOT_JOINED' ? 'Conectando a la sala, espera un momento...' : 'No se encontró el micrófono')
    }
  }

  const toggleCamera = async () => {
    setDeviceError('')
    try {
      await room.setCameraEnabled(!room.camEnabled, devices.activeCamId)
    } catch (err) {
      console.warn('Camera error:', err)
      setDeviceError(cameraErrorMessage(err))
    }
  }

  const selectDevice = (kind) => async (device) => {
    try {
      if (kind === 'audioinput') await devices.selectMicrophone(device.deviceId)
      else if (kind === 'videoinput') await devices.selectCamera(device.deviceId)
      else await devices.selectSpeaker(device.deviceId)
    } catch (err) {
      console.warn('Device switch error:', err)
      setDeviceError('Error al cambiar el dispositivo')
    }
    setOpenDeviceMenu(null)
  }

  // Compact presentation of the SAME hooks: switching layout never re-creates
  // them (the effect processor is 2.1 MB of WASM)
  if (compact) {
    return (
      <>
        <ControlsRow error={deviceError || videoEffect.message}>
          <ControlIconButton kind="mic" label={LIVE_ROOM_COPY.mic} active={room.micEnabled} onClick={toggleMic} />
          <ControlIconButton kind="camera" label={LIVE_ROOM_COPY.camera} active={room.camEnabled} onClick={toggleCamera} />
          <ControlIconButton kind="more" label={LIVE_ROOM_COPY.moreOptions} onClick={() => setSheetOpen(true)} />
        </ControlsRow>
        <ControlsSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          devices={devices}
          onSelectDevice={selectDevice}
          speakerSupported={devices.playbackDevices.length > 0}
          effects={videoEffect.supported ? { videoEffect, camEnabled: room.camEnabled } : null}
        />
      </>
    )
  }

  return (
    // gap-y: this row wraps on narrow viewports — without it the lines touch
    <div className="flex items-center gap-x-6 gap-y-3 flex-wrap">
      <div className="relative flex items-center gap-x-2">
        <span className="text-sm text-gray-700">Micrófono</span>
        <ToggleSwitch checked={room.micEnabled} onChange={toggleMic} />
        <DeviceDropdown
          kind="audioinput"
          isOpen={openDeviceMenu === 'audioinput'}
          onToggle={setOpenDeviceMenu}
          devices={devices.microphones}
          activeDeviceId={devices.activeMicId}
          onSelect={selectDevice('audioinput')}
        />
      </div>
      <div className="relative flex items-center gap-x-2">
        <span className="text-sm text-gray-700">Cámara</span>
        <ToggleSwitch checked={room.camEnabled} onChange={toggleCamera} />
        <DeviceDropdown
          kind="videoinput"
          isOpen={openDeviceMenu === 'videoinput'}
          onToggle={setOpenDeviceMenu}
          devices={devices.cameras}
          activeDeviceId={devices.activeCamId}
          onSelect={selectDevice('videoinput')}
        />
      </div>
      {videoEffect.supported && (
        <div className="relative flex items-center gap-x-2">
          <span className="text-sm text-gray-700">Efectos</span>
          <VideoEffectsMenu
            isOpen={openDeviceMenu === 'effects'}
            onToggle={toggleEffectsMenu}
            disabled={!room.camEnabled}
            status={videoEffect.status}
            effect={videoEffect.effect}
            applying={videoEffect.applying}
            onSelect={videoEffect.selectEffect}
          />
        </div>
      )}
      {devices.playbackDevices.length > 0 && (
        <div className="relative flex items-center gap-x-2">
          <span className="text-sm text-gray-700">Altavoces</span>
          <DeviceDropdown
            kind="audiooutput"
            isOpen={openDeviceMenu === 'audiooutput'}
            onToggle={setOpenDeviceMenu}
            devices={devices.playbackDevices}
            activeDeviceId={devices.activeSpeakerId}
            onSelect={selectDevice('audiooutput')}
          />
        </div>
      )}
      {deviceError && (
        <span className="text-xs text-red-600">{deviceError}</span>
      )}
      {videoEffect.message && (
        <span className="text-xs text-red-600">{videoEffect.message}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat — same UI as EventLiveRoom's ChatPanel over the Socket.IO room
// ---------------------------------------------------------------------------
function ChatPanel({ chatMessages, onSend, canModerate, selfIdentity, isChatBanned, onBanFromChat, protectedIdentities, compact = false }) {
  const [openMenuFor, setOpenMenuFor] = useState(null)
  const [sheetTarget, setSheetTarget] = useState(null) // compact: { identity, name }
  const menuRef = useRef(null)

  // Own message: the list follows it even if the user was reading further up.
  // Scrolling happens ONLY inside the list (see useChatAutoScroll).
  const isOwn = useCallback((msg) => !!msg && !!selfIdentity && msg.identity === selfIdentity, [selfIdentity])
  const { containerRef, onScroll, hasNew, scrollToBottom } = useChatAutoScroll({ messages: chatMessages, isOwn })

  // Close three-dot menu when clicking outside
  useEffect(() => {
    if (openMenuFor === null) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuFor(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuFor])

  // Host or admin (event-chat-admin-moderation) — never on the host's messages,
  // on staff (the server answers 400) or on one's own
  const canModerateMessage = (identity) => (
    canModerate &&
    !!identity &&
    !identity.startsWith('host-') &&
    identity !== selfIdentity &&
    !protectedIdentities?.has(identity)
  )

  const handleBanFromChat = (identity) => {
    setOpenMenuFor(null)
    setSheetTarget(null)
    onBanFromChat?.(identity)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages — inner scroll */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={containerRef}
          onScroll={onScroll}
          className={`flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0 ${compact ? 'overscroll-y-contain' : ''}`}
        >
          {chatMessages.length === 0 && (
            <p className="text-xs text-gray-400 italic">{LIVE_ROOM_COPY.emptyChat}</p>
          )}
          {chatMessages.map((msg, i) => {
            const senderIdentity = msg.identity
            const senderName = msg.name || senderIdentity || 'Anónimo'
            return (
              <div key={i} className="text-sm flex items-start gap-x-1">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{senderName}</span>
                  <span className="text-gray-600 ml-1 break-words">{msg.message}</span>
                </div>
                {canModerateMessage(senderIdentity) && (compact ? (
                  // Compact: a touch-sized target opening a sheet — a dropdown
                  // inside this scroll container is clipped on the last messages
                  <button
                    type="button"
                    onClick={() => setSheetTarget({ identity: senderIdentity, name: senderName })}
                    aria-label={LIVE_ROOM_COPY.messageOptions}
                    className="-my-1.5 -mr-2 flex size-8 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-600 [touch-action:manipulation]"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                ) : (
                  <div className="relative flex-shrink-0 mt-0.5" ref={openMenuFor === i ? menuRef : null}>
                    <button
                      type="button"
                      onClick={() => setOpenMenuFor(openMenuFor === i ? null : i)}
                      className="text-gray-300 hover:text-gray-500 p-0.5 rounded"
                      title="Opciones"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {openMenuFor === i && (
                      <div className="absolute right-0 top-5 z-20 min-w-max rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => handleBanFromChat(senderIdentity)}
                          className="block w-full px-4 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                        >
                          {LIVE_ROOM_COPY.banFromChat}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <NewMessagesButton visible={hasNew} onClick={scrollToBottom} />
      </div>

      {/* Input or chat-banned warning */}
      <ChatComposer onSend={onSend} compact={compact} banned={isChatBanned} />

      {compact && (
        <LiveRoomSheet open={!!sheetTarget} title={sheetTarget?.name || ''} onClose={() => setSheetTarget(null)}>
          <LiveRoomSheetRow
            label={LIVE_ROOM_COPY.banFromChat}
            danger
            onClick={() => sheetTarget && handleBanFromChat(sheetTarget.identity)}
          />
        </LiveRoomSheet>
      )}
    </div>
  )
}
