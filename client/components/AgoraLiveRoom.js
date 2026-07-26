'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { eventsAPI } from '@/lib/api'
import ConfirmDialog from '@/components/ConfirmDialog'
import DeviceDropdown from '@/components/events/DeviceDropdown'
import VideoEffectsMenu from '@/components/events/VideoEffectsMenu'
import useAgoraRoom from '@/hooks/useAgoraRoom'
import useAgoraDevices from '@/hooks/useAgoraDevices'
import useAgoraVideoEffect from '@/hooks/useAgoraVideoEffect'
import useEventRoomSocket from '@/hooks/useEventRoomSocket'

// Fastboard is heavy — load it only when the host opens the whiteboard
const WhiteboardPanel = dynamic(
  () => import('@/components/events/WhiteboardPanel'),
  { ssr: false }
)

const HOST_RTC_UID = 1

// Theater strip geometry — these MUST stay in step with the Tailwind classes
// of the strip tiles and arrows: tiles are w-16 (64px) under the sm breakpoint
// and sm:w-24 (96px) from 640px up, separated by gap-x-2 (8px); each arrow
// button renders ~32px wide plus its 8px gap.
const STRIP_TILE_W_MOBILE = 64
const STRIP_TILE_W_DESKTOP = 96
const STRIP_TILE_GAP = 8
const STRIP_ARROW_SPACE = 40
const STRIP_PADDING_X = 24 // px-3

// ---------------------------------------------------------------------------
// Theater mode — fullscreen overlay with a paginated participant strip
// ---------------------------------------------------------------------------
// State-driven overlay (fixed inset-0). Native browser fullscreen is requested
// on the wrapper as a progressive enhancement (iOS Safari has no element
// fullscreen; the overlay alone covers the viewport there). The wrapper is
// ALWAYS mounted around the featured media so the whiteboard never changes its
// position in the React tree — a move would destroy and rejoin the fastboard
// room, losing the writable session.
function TheaterShell({ open, onClose, normalClassName = '', children }) {
  const shellRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const el = shellRef.current
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => { /* iOS / denied */ })
    // Escape must work even without native fullscreen (overlay-only mode)
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    const onFullscreenChange = () => { if (!document.fullscreenElement) onClose() }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* already out */ })
    }
  }, [open, onClose])

  return (
    <div ref={shellRef} className={open ? 'fixed inset-0 z-[60] bg-black flex flex-col' : normalClassName}>
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
    <div className="absolute top-3 right-3 z-20 flex gap-x-2">
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
function TheaterStrip({ entries, visible, renderTile }) {
  const [start, setStart] = useState(0)
  const [capacity, setCapacity] = useState(1)
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
      const width = el.clientWidth - STRIP_PADDING_X
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

  const windowEntries = useMemo(() => {
    if (!paged) return entries
    return Array.from({ length: Math.min(capacity, count) }, (_, i) => entries[(start + i) % count])
  }, [entries, paged, start, capacity, count])

  if (!visible || count === 0) return null

  return (
    <div ref={containerRef} className="flex-shrink-0 flex items-center justify-center gap-x-2 px-3 pb-3 pt-2">
      {paged && (
        <button
          type="button"
          onClick={() => setStart((s) => ((s - capacity) % count + count) % count)}
          className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors flex-shrink-0"
          title="Participantes anteriores"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}
      <div className="flex items-end gap-x-2">
        {windowEntries.map(renderTile)}
      </div>
      {paged && (
        <button
          type="button"
          onClick={() => setStart((s) => (s + capacity) % count)}
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
function cameraErrorMessage(err) {
  if (err?.code === 'NOT_JOINED') return 'Conectando a la sala, espera un momento...'
  if (err?.code === 'NOT_READABLE' || err?.name === 'NotReadableError') {
    return 'No se pudo iniciar la cámara; puede estar en uso por otra aplicación'
  }
  return 'No se encontró la cámara'
}

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
  eventEnded = false,
}) {
  const isMeeting = interactionMode === 'meeting'

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

  const room = useAgoraRoom({
    enabled: !!(appId && channel && rtcToken),
    appId,
    channel,
    uid,
    rtcToken,
    initialRole: isHost || isMeeting ? 'host' : 'audience',
    renewToken,
    onKicked,
  })

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

  const handleHostBanFromChat = useCallback(async (identity) => {
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

  return (
    <>
      {room.autoplayBlocked && <AudioActivationOverlay onActivate={room.resumeAudio} />}

      {room.joinError && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{room.joinError}</p>
        </div>
      )}

      {/* Meeting fills the available viewport height (media column scrolls
          internally, chat keeps full height); broadcast keeps the LiveKit-parity
          two-column layout with the chat height synced to the media area. */}
      <div className={`flex flex-col lg:flex-row gap-4 ${isMeeting ? 'lg:h-[calc(100dvh-10rem)] lg:min-h-0' : ''}`}>
        {/* Left column: media area + controls */}
        <div
          className={`flex-1 min-h-0 flex flex-col ${isMeeting ? 'lg:overflow-y-auto' : ''}`}
          ref={videoAreaRef}
        >
          {isMeeting ? (
            <MeetingArea
              room={room}
              socket={socket}
              selfPresence={selfPresence}
              remoteByUid={remoteByUid}
              isHost={isHost}
              eventId={eventId}
              localUid={uid}
              eventEnded={eventEnded}
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
              room={room}
              socket={socket}
              selfPresence={selfPresence}
              remoteByUid={remoteByUid}
              nameByUid={nameByUid}
              isHost={isHost}
              amSpeaker={amSpeaker}
              eventId={eventId}
              localUid={uid}
              eventEnded={eventEnded}
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

        {/* Chat sidebar — meeting: full height of the row; broadcast: synced to media area */}
        <div
          className={`lg:w-80 flex-shrink-0 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white ${
            isMeeting ? 'h-[60vh] lg:h-auto' : ''
          }`}
          style={!isMeeting && videoAreaHeight ? { height: videoAreaHeight, maxHeight: videoAreaHeight } : undefined}
        >
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
            <p className="text-xs text-gray-500">{socket.presence.length} conectados</p>
          </div>
          <ChatPanel
            chatMessages={filteredMessages}
            onSend={socket.sendChatMessage}
            isHost={isHost}
            isChatBanned={socket.selfChatBanned}
            onHostBanFromChat={handleHostBanFromChat}
          />
        </div>
      </div>
    </>
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
          Haz clic para activar el audio
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agora track renderer — plays a local/remote video track into a div
// ---------------------------------------------------------------------------
function AgoraVideo({ track, className, fit = 'contain' }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!track || !el) return
    try {
      track.play(el, { fit })
    } catch (err) {
      console.warn('Agora video play error:', err)
    }
    return () => {
      try { track.stop() } catch { /* already stopped */ }
    }
  }, [track, fit])

  return <div ref={containerRef} className={className} />
}

// ---------------------------------------------------------------------------
// Broadcast mode — LiveKit parity
// ---------------------------------------------------------------------------
function BroadcastArea({
  room, socket, selfPresence, remoteByUid, nameByUid,
  isHost, amSpeaker, eventId, localUid, eventEnded,
  whiteboardElement, whiteboard,
}) {
  const hostRemote = remoteByUid.get(HOST_RTC_UID)

  const [theaterOpen, setTheaterOpen] = useState(false)
  const [stripVisible, setStripVisible] = useState(true)
  const closeTheater = useCallback(() => setTheaterOpen(false), [])
  const openTheater = useCallback(() => setTheaterOpen(true), [])

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

  // Host area track: local preview for the host (screen preferred), the
  // host's single published track for viewers (screen replaces camera)
  const hostTrack = isHost
    ? (room.screenEnabled ? room.screenTrackRef.current : (room.camEnabled ? room.camTrackRef.current : null))
    : (hostRemote?.videoTrack || null)

  const hostSpeaking = isHost
    ? room.speakingUids.has(localUid) || room.speakingUids.has(0)
    : room.speakingUids.has(HOST_RTC_UID)

  // Promoted viewers publishing video (rare but supported: camera after promotion)
  const promotedVideoUsers = room.remoteUsers.filter(
    (u) => Number(u.uid) !== HOST_RTC_UID && u.videoTrack
  )

  const handRaised = !!selfPresence?.handRaised
  const toggleHandRaise = () => socket.setHandRaised(!handRaised)

  return (
    <>
      <TheaterShell open={theaterOpen} onClose={closeTheater}>
        {whiteboardElement ? (
          <>
            {/* Whiteboard takes the main area; host video shrinks to a tile
                (audio keeps flowing untouched) */}
            <div className={theaterOpen
              ? 'relative flex-1 min-h-0 bg-white'
              : 'rounded-lg overflow-hidden aspect-video w-full relative border border-gray-200 bg-white'}
            >
              {whiteboardElement}
              {/* Theater for the whiteboard — host and viewers alike */}
              {!theaterOpen && (
                <TheaterButton onOpen={openTheater} className="absolute top-2 right-2 z-10" />
              )}
            </div>
            {!theaterOpen && (
              <div className="mt-3 flex">
                <div
                  className={`bg-black rounded-lg overflow-hidden aspect-video w-48 relative transition-shadow duration-300 ${
                    hostSpeaking ? 'ring-2 ring-green-400' : ''
                  }`}
                  style={hostSpeaking ? { animation: 'speaking-pulse 1.5s ease-in-out infinite' } : undefined}
                >
                  {hostTrack ? (
                    <AgoraVideo track={hostTrack} className="w-full h-full" fit="cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-white text-xs">{isHost ? 'Tu cámara' : 'Host'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
        /* Host video */
        <div
          className={`relative transition-shadow duration-300 ${
            theaterOpen ? 'flex-1 min-h-0 bg-black' : 'bg-black rounded-lg overflow-hidden aspect-video w-full'
          } ${hostSpeaking ? 'ring-2 ring-green-400' : ''}`}
          style={hostSpeaking ? { animation: 'speaking-pulse 1.5s ease-in-out infinite' } : undefined}
        >
          {hostTrack ? (
            <AgoraVideo track={hostTrack} className="w-full h-full" fit="contain" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              {isHost ? (
                <>
                  <p className="text-white text-sm">Tu vista de presentador</p>
                  <p className="text-gray-400 text-xs">Activa tu cámara con el control de abajo</p>
                </>
              ) : (
                <p className="text-white text-sm">Esperando al host...</p>
              )}
            </div>
          )}

          {/* Theater on the host video (screen or camera) — viewers only */}
          {!theaterOpen && !isHost && hostTrack && (
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
            {/* Broadcast strip: the avatar+mic tiles of the normal view (state only) */}
            <TheaterStrip
              entries={stripEntries}
              visible={stripVisible}
              renderTile={(p) => (
                <AgoraParticipantTile
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
        <SpeakingPulseStyle />
      </TheaterShell>

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
          <AgoraHostControls room={room} eventId={eventId} endLabel="Finalizar stream" whiteboard={whiteboard} />
        </div>
      )}

      {/* Hand raise for viewers */}
      {!isHost && (
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
  )
}

// ---------------------------------------------------------------------------
// Host controls (broadcast + meeting extras) — same layout as EventLiveRoom
// ---------------------------------------------------------------------------
function AgoraHostControls({ room, eventId, endLabel, whiteboard }) {
  const [deviceError, setDeviceError] = useState('')
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [openDeviceMenu, setOpenDeviceMenu] = useState(null)

  const devices = useAgoraDevices({
    enabled: true,
    micTrackRef: room.micTrackRef,
    camTrackRef: room.camTrackRef,
    setSpeakerDevice: room.setSpeakerDevice,
    micEnabled: room.micEnabled,
    camEnabled: room.camEnabled,
  })

  const videoEffect = useAgoraVideoEffect({
    camTrackRef: room.camTrackRef,
    camTrackVersion: room.camTrackVersion,
    camEnabled: room.camEnabled,
  })

  // Same state as the device dropdowns, so only one menu is ever open. Opening
  // the effects panel is what triggers the extension download.
  const toggleEffectsMenu = useCallback((kind) => {
    setOpenDeviceMenu(kind)
    if (kind === 'effects') videoEffect.ensureLoaded()
  }, [videoEffect])

  const toggleMic = useCallback(async () => {
    setDeviceError('')
    try {
      await room.setMicrophoneEnabled(!room.micEnabled, devices.activeMicId)
    } catch (err) {
      console.warn('Microphone error:', err)
      setDeviceError(err?.code === 'NOT_JOINED' ? 'Conectando a la sala, espera un momento...' : 'No se encontró el micrófono')
    }
  }, [room, devices.activeMicId])

  const toggleCamera = useCallback(async () => {
    setDeviceError('')
    try {
      await room.setCameraEnabled(!room.camEnabled, devices.activeCamId)
    } catch (err) {
      console.warn('Camera error:', err)
      setDeviceError(cameraErrorMessage(err))
    }
  }, [room, devices.activeCamId])

  const toggleScreenShare = useCallback(async () => {
    setDeviceError('')
    try {
      if (room.screenEnabled) {
        await room.stopScreenShare()
      } else {
        await room.startScreenShare()
      }
    } catch (err) {
      console.warn('Screen share error:', err)
      setDeviceError(err?.code === 'NOT_JOINED' ? 'Conectando a la sala, espera un momento...' : 'No se pudo compartir pantalla')
    }
  }, [room])

  const handleEndStream = async () => {
    setIsEnding(true)
    try {
      await eventsAPI.endEvent(eventId)
      window.location.reload()
    } catch (err) {
      console.error('Error ending stream:', err)
      setDeviceError('Error al finalizar el evento')
      setIsEnding(false)
      setShowEndConfirm(false)
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

function ToggleSwitch({ checked, onChange }) {
  return (
    <label className="relative inline-block w-11 h-6 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="absolute inset-0 bg-gray-200 rounded-full transition-colors duration-200 ease-in-out peer-checked:bg-gray-800 peer-disabled:opacity-50 peer-disabled:pointer-events-none" />
      <span className="absolute top-1/2 start-0.5 -translate-y-1/2 size-5 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out peer-checked:translate-x-full" />
    </label>
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

function HandIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M18.906 3.92194C17.8921 2.88646 16.4461 2.50452 15.0306 2.9073C14.6322 3.02066 14.2173 2.78959 14.104 2.39119C13.9906 1.99279 14.2217 1.57792 14.6201 1.46456C16.5583 0.913072 18.5747 1.43959 19.9778 2.8725C20.2676 3.16846 20.2626 3.64331 19.9666 3.9331C19.6706 4.2229 19.1958 4.2179 18.906 3.92194ZM11.1904 3.30839C10.9763 2.94131 10.3525 2.7187 9.71882 3.08085C9.08746 3.44168 8.97642 4.07772 9.18675 4.4384L11.7124 8.76952C11.9211 9.12734 11.8001 9.58656 11.4423 9.79522C11.0845 10.0039 10.6253 9.88296 10.4166 9.52514L7.89098 5.19403C7.89085 5.19381 7.8911 5.19424 7.89098 5.19403L7.04909 3.75032C6.83503 3.38324 6.21122 3.16063 5.57755 3.52278C4.94619 3.88361 4.83515 4.51965 5.04548 4.88033L8.83397 11.377C9.04263 11.7348 8.92171 12.1941 8.56389 12.4027C8.20607 12.6114 7.74685 12.4905 7.53819 12.1326L5.85442 9.24522C5.64036 8.87814 5.01655 8.65553 4.38288 9.01768C3.75152 9.37851 3.64048 10.0145 3.85081 10.3752L7.6393 16.8719C9.24824 19.631 13.2186 20.5264 16.5856 18.6021C19.9502 16.6792 21.1463 12.8377 19.5411 10.085L17.0154 5.75387C16.8013 5.3868 16.1775 5.16418 15.5439 5.52633C14.9125 5.88716 14.8015 6.5232 15.0118 6.88389L16.6956 9.7713C16.7963 9.94411 16.8239 10.15 16.7721 10.3432C16.7203 10.5365 16.5935 10.701 16.4198 10.8003C14.8774 11.6818 14.4047 13.3863 15.0799 14.5443C15.2886 14.9022 15.1677 15.3614 14.8099 15.57C14.4521 15.7787 13.9928 15.6578 13.7842 15.3C12.7249 13.4835 13.3917 11.2368 15.0475 9.92287L11.1904 3.30839ZM13.9186 5.00916L12.4861 2.55277C11.7703 1.32517 10.163 1.09928 8.97453 1.77853C8.60823 1.98787 8.29668 2.27483 8.06179 2.60775C7.26173 1.72687 5.8839 1.62001 4.83326 2.22046C3.64241 2.90104 3.03012 4.40197 3.74971 5.63596L4.75188 7.35452C4.36684 7.39635 3.98493 7.51742 3.63859 7.71536C2.44774 8.39595 1.83545 9.89687 2.55504 11.1309L6.34352 17.6275C8.45427 21.2471 13.408 22.1458 17.3299 19.9044C21.254 17.6617 22.9513 12.9554 20.8368 9.32937L18.3112 4.99825C17.5953 3.77065 15.9881 3.54476 14.7996 4.22401C14.4495 4.42406 14.1495 4.69498 13.9186 5.00916ZM4.41401 17.859C4.77183 17.6504 5.23105 17.7713 5.43971 18.1291C6.26657 19.5471 7.53066 20.6193 9.08954 21.3151C9.46779 21.4839 9.63757 21.9274 9.46875 22.3057C9.29993 22.6839 8.85645 22.8537 8.4782 22.6849C6.66668 21.8764 5.14688 20.6046 4.14393 18.8847C3.93527 18.5269 4.05619 18.0677 4.41401 17.859Z" />
    </svg>
  )
}

function MutedMicBadge() {
  return (
    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-400">
      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
      </svg>
    </span>
  )
}

function ActiveMicBadge() {
  return (
    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    </span>
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

  const sorted = useMemo(() => {
    return [...gridEntries].sort((a, b) => {
      const aHost = a.isHost ? 1 : 0
      const bHost = b.isHost ? 1 : 0
      if (aHost !== bHost) return bHost - aHost
      const aLocal = a.identity === selfIdentity
      const bLocal = b.identity === selfIdentity
      if (aLocal && !bLocal) return 1
      if (!aLocal && bLocal) return -1
      const aHand = a.handRaised ? 1 : 0
      const bHand = b.handRaised ? 1 : 0
      return bHand - aHand
    })
  }, [gridEntries, selfIdentity])

  const handlePromote = useCallback(async (identity) => {
    try {
      await eventsAPI.promoteParticipant(eventId, identity)
    } catch (err) {
      console.error('Error promoting participant:', err)
    }
  }, [eventId])

  const handleDemote = useCallback(async (identity) => {
    try {
      await eventsAPI.demoteParticipant(eventId, identity)
    } catch (err) {
      console.error('Error demoting participant:', err)
    }
  }, [eventId])

  if (sorted.length === 0) return null

  return (
    <div className="mt-3 landscape:max-md:max-h-[30vh] landscape:max-md:overflow-y-auto pr-1">
      <div className="flex flex-wrap gap-2">
        {sorted.map((p) => (
          <AgoraParticipantTile
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

// `readOnly` renders the tile as pure state (theater strip): no click actions,
// name styled for the dark overlay background.
function AgoraParticipantTile({
  entry, isLocal, viewerIsHost, remoteByUid, speakingUids,
  localMicEnabled, amSpeaker, wasPromoted, onPromote, onDemote, onSelfMute,
  readOnly = false,
}) {
  const isHostParticipant = entry.isHost
  const handRaised = entry.handRaised
  const canPublish = isLocal ? amSpeaker : entry.speaker

  // Mic state: local from RTC state; remote from the published audio track
  const remoteUser = entry.agoraUid != null ? remoteByUid.get(Number(entry.agoraUid)) : null
  const isMicActive = isLocal ? localMicEnabled : !!remoteUser?.hasAudio

  const initial = isLocal ? 'T' : (entry.name || entry.identity || '?').charAt(0).toUpperCase()
  const displayName = isLocal ? '(Tu)' : (entry.name || entry.identity || '?')
  const shortName = isLocal ? '(Tu)' : (displayName.length > 12 ? displayName.slice(0, 11) + '...' : displayName)

  const handleClick = useCallback(() => {
    if (isHostParticipant) return
    if (isLocal) {
      if (canPublish && isMicActive) onSelfMute?.()
      return
    }
    if (!viewerIsHost) return
    if (canPublish) {
      onDemote?.(entry.identity)
    } else {
      onPromote?.(entry.identity)
    }
  }, [isLocal, viewerIsHost, isHostParticipant, canPublish, isMicActive, onSelfMute, onPromote, onDemote, entry.identity])

  const getTitle = () => {
    if (isHostParticipant) return `Host: ${displayName}`
    if (isLocal) {
      if (canPublish && isMicActive) return 'Silenciar tu micrófono'
      if (!canPublish) return 'Levanta la mano para hablar'
      return '(Tu)'
    }
    if (viewerIsHost && canPublish) return `Silenciar a ${displayName}`
    if (viewerIsHost) return `Dar la palabra a ${displayName}`
    return displayName
  }

  const getTileClasses = () => {
    if (isHostParticipant) {
      return 'bg-gray-50 text-gray-900 ring-2 ring-gray-900 cursor-default'
    }
    if (isLocal) {
      if (canPublish) {
        return isMicActive
          ? 'bg-green-50 text-green-800 ring-2 ring-green-400 cursor-pointer hover:bg-green-100'
          : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
      }
      return 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
    }
    if (canPublish) {
      return isMicActive
        ? 'bg-green-50 text-green-800 ring-2 ring-green-400 cursor-pointer hover:bg-green-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
    }
    if (wasPromoted) {
      return viewerIsHost
        ? 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
    }
    if (viewerIsHost) {
      return handRaised
        ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 cursor-pointer hover:bg-amber-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
    }
    return 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={readOnly ? undefined : handleClick}
        className={`relative w-14 h-14 rounded-lg flex items-center justify-center text-lg font-semibold transition-shadow duration-300 ${getTileClasses()} ${readOnly ? '!cursor-default' : ''}`}
        title={readOnly ? (isLocal ? '(Tu)' : displayName) : getTitle()}
      >
        {initial}

        {/* Hand raised icon — top left (hidden when actively speaking) */}
        {handRaised && !isLocal && !isHostParticipant && (!canPublish || !isMicActive) && (
          <span className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400">
            <HandIcon className="h-3.5 w-3.5 text-white" />
          </span>
        )}

        {/* Mic badge (top-right) */}
        {!isHostParticipant && (canPublish && isMicActive ? <ActiveMicBadge /> : <MutedMicBadge />)}
      </button>
      <span className={`text-xs text-center max-w-16 truncate ${
        isHostParticipant ? (readOnly ? 'text-white font-semibold' : 'text-gray-900 font-semibold')
        : isLocal ? (readOnly ? 'text-red-400 font-medium' : 'text-red-600 font-medium')
        : (readOnly ? 'text-gray-300' : 'text-gray-600')
      }`}>{isHostParticipant ? 'Host' : shortName}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Meeting mode — Meet-style grid of large tiles, self-serve controls for all
// ---------------------------------------------------------------------------
function MeetingArea({ room, socket, selfPresence, remoteByUid, isHost, eventId, localUid, eventEnded, whiteboardElement, whiteboard }) {
  const hostEntry = socket.presence.find((p) => p.isHost)
  const hostScreenSharing = !whiteboardElement && !!hostEntry?.screenSharing

  // Attendees always see the host featured full-width. The host only gets a big
  // featured area when there's something to highlight — the whiteboard or a shared
  // screen; otherwise the host watches everyone in an equal grid (own tile first),
  // which is better for interacting with all participants.
  const showFeatured = !!whiteboardElement || hostScreenSharing || !isHost

  const [theaterOpen, setTheaterOpen] = useState(false)
  const [stripVisible, setStripVisible] = useState(true)
  const closeTheater = useCallback(() => setTheaterOpen(false), [])
  const openTheater = useCallback(() => setTheaterOpen(true), [])

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
    : (remoteByUid.get(HOST_RTC_UID)?.videoTrack || null)

  const hostSpeaking = isHost
    ? (room.speakingUids.has(localUid) || room.speakingUids.has(0))
    : room.speakingUids.has(HOST_RTC_UID)

  // Featured layout → the grid holds everyone except the host. Host equal-grid →
  // everyone, host tile first.
  const gridEntries = showFeatured
    ? socket.presence.filter((p) => !p.isHost)
    : [...socket.presence].sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0))

  return (
    <>
      {showFeatured && (
        <TheaterShell open={theaterOpen} onClose={closeTheater} normalClassName="mb-3 flex-shrink-0">
          {whiteboardElement ? (
            <div className={theaterOpen
              ? 'relative flex-1 min-h-0 bg-white'
              : 'rounded-lg overflow-hidden aspect-video w-full relative border border-gray-200 bg-white'}
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
                theaterOpen ? 'flex-1 min-h-0 bg-black' : 'bg-black rounded-lg overflow-hidden aspect-video w-full'
              } ${hostSpeaking ? 'ring-2 ring-green-400' : ''}`}
              style={hostSpeaking ? { animation: 'speaking-pulse 1.5s ease-in-out infinite' } : undefined}
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
                entries={stripEntries}
                visible={stripVisible}
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
        </TheaterShell>
      )}

      {/* Camera tiles — rows of 5 square tiles (all breakpoints); unmounted
          while the theater is open so each track has a single container */}
      {!theaterOpen && gridEntries.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {gridEntries.map((p) => (
            <MeetingTile
              key={p.identity}
              entry={p}
              isLocal={p.identity === socket.selfIdentity}
              room={room}
              remoteByUid={remoteByUid}
              speakingUids={room.speakingUids}
              viewerIsHost={isHost}
              localUid={localUid}
              onForceMute={() => socket.requestForceMute(p.identity)}
            />
          ))}
        </div>
      )}

      {/* Bottom control bar: self-serve controls for everyone */}
      <div className="mt-3 flex-shrink-0">
        {isHost ? (
          <AgoraHostControls room={room} eventId={eventId} endLabel="Finalizar evento" whiteboard={whiteboard} />
        ) : (
          <MeetingSelfControls room={room} />
        )}
      </div>
      <SpeakingPulseStyle />
    </>
  )
}

function MeetingTile({ entry, isLocal, room, remoteByUid, speakingUids, viewerIsHost, localUid, onForceMute }) {
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
      style={speaking ? { animation: 'speaking-pulse 1.5s ease-in-out infinite' } : undefined}
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
function MeetingSelfControls({ room }) {
  const [deviceError, setDeviceError] = useState('')
  const [openDeviceMenu, setOpenDeviceMenu] = useState(null)

  const devices = useAgoraDevices({
    enabled: true,
    micTrackRef: room.micTrackRef,
    camTrackRef: room.camTrackRef,
    setSpeakerDevice: room.setSpeakerDevice,
    micEnabled: room.micEnabled,
    camEnabled: room.camEnabled,
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
function ChatPanel({ chatMessages, onSend, isHost, isChatBanned, onHostBanFromChat }) {
  const [message, setMessage] = useState('')
  const messagesContainerRef = useRef(null)
  const [openMenuFor, setOpenMenuFor] = useState(null)
  const menuRef = useRef(null)

  // Keep the newest message visible by scrolling ONLY the inner container.
  // scrollIntoView also scrolls the page/window, which jumped the whole layout
  // down when sending a message in the viewport-height meeting layout.
  useEffect(() => {
    const el = messagesContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chatMessages.length])

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

  const handleSend = (e) => {
    e.preventDefault()
    if (!message.trim() || isChatBanned) return
    onSend(message.trim())
    setMessage('')
  }

  const handleBanFromChat = (identity) => {
    setOpenMenuFor(null)
    onHostBanFromChat?.(identity)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages — inner scroll */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {chatMessages.length === 0 && (
          <p className="text-xs text-gray-400 italic">Sin mensajes todavía</p>
        )}
        {chatMessages.map((msg, i) => {
          const senderIdentity = msg.identity
          const isHostMsg = senderIdentity?.startsWith('host-')
          return (
            <div key={i} className="text-sm flex items-start gap-x-1">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">
                  {msg.name || senderIdentity || 'Anónimo'}
                </span>
                <span className="text-gray-600 ml-1 break-words">{msg.message}</span>
              </div>
              {/* Three-dot menu — host only, not for host messages */}
              {isHost && !isHostMsg && senderIdentity && (
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
                        Expulsar del chat
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Input or chat-banned warning */}
      {isChatBanned ? (
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs text-center text-red-600 font-medium">
            Has sido expulsado del chat por comportamiento inapropiado.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSend} className="border-t border-gray-200 px-4 py-3 flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="flex-shrink-0 inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Enviar
          </button>
        </form>
      )}
    </div>
  )
}
