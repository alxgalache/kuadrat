'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  LiveKitRoom,
  VideoTrack,
  RoomAudioRenderer,
  useParticipants,
  useTracks,
  useChat,
  useLocalParticipant,
  useIsSpeaking,
  useRoomContext,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { Track, RoomEvent, DisconnectReason } from 'livekit-client'
import { eventsAPI } from '@/lib/api'

// Spam threshold: more than this many messages in the given window triggers a kick
const SPAM_MAX_MESSAGES = 10
const SPAM_WINDOW_MS = 10000

export default function EventLiveRoom({ token, serverUrl, roomName, isHost = false, eventId, onKicked }) {
  if (!token || !serverUrl) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <p className="text-sm text-gray-500">Conectando a la sala...</p>
      </div>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect={true}
      audio={false}
      video={false}
      onMediaDeviceFailure={(failure) => {
        console.warn('Media device failure:', failure)
      }}
      className="h-full"
    >
      <AudioActivationOverlay />
      <RoomContent isHost={isHost} eventId={eventId} onKicked={onKicked} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

// ---------------------------------------------------------------------------
// Audio activation overlay — modal that prompts the user to enable audio
// (required by browsers that block autoplay until user interaction)
// ---------------------------------------------------------------------------
function AudioActivationOverlay() {
  const room = useRoomContext()
  const [canPlay, setCanPlay] = useState(room.canPlaybackAudio)

  useEffect(() => {
    const update = () => setCanPlay(room.canPlaybackAudio)
    room.on(RoomEvent.AudioPlaybackStatusChanged, update)
    return () => room.off(RoomEvent.AudioPlaybackStatusChanged, update)
  }, [room])

  if (canPlay) return null

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
          onClick={() => room.startAudio()}
          className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        >
          Haz clic para activar el audio
        </button>
      </div>
    </div>
  )
}

function RoomContent({ isHost, eventId, onKicked }) {
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const room = useRoomContext()
  const { chatMessages, send, isSending } = useChat()
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  const [handRaised, setHandRaised] = useState(false)
  const videoAreaRef = useRef(null)
  const [videoAreaHeight, setVideoAreaHeight] = useState(null)
  const [chatBannedIdentities, setChatBannedIdentities] = useState(new Set())
  const messageTimestamps = useRef({})
  const chatBannedRef = useRef(new Set())

  // Read attendee session from localStorage for spam reporting
  const attendeeSession = useMemo(() => {
    try {
      const raw = localStorage.getItem(`event_attendee_${eventId}`)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }, [eventId])

  // Detect kick (PARTICIPANT_REMOVED disconnect reason)
  useEffect(() => {
    if (!room || isHost) return
    const handleDisconnect = (reason) => {
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
        onKicked?.()
      }
    }
    room.on(RoomEvent.Disconnected, handleDisconnect)
    return () => room.off(RoomEvent.Disconnected, handleDisconnect)
  }, [room, isHost, onKicked])

  // Spam detection: track message frequency per identity
  const prevMsgCount = useRef(0)
  useEffect(() => {
    if (chatMessages.length <= prevMsgCount.current) {
      prevMsgCount.current = chatMessages.length
      return
    }
    // Process only new messages
    const newMessages = chatMessages.slice(prevMsgCount.current)
    prevMsgCount.current = chatMessages.length

    const now = Date.now()
    for (const msg of newMessages) {
      const identity = msg.from?.identity
      if (!identity || chatBannedRef.current.has(identity)) continue

      if (!messageTimestamps.current[identity]) {
        messageTimestamps.current[identity] = []
      }
      messageTimestamps.current[identity].push(now)
      // Remove timestamps outside the window
      messageTimestamps.current[identity] = messageTimestamps.current[identity].filter(
        t => now - t <= SPAM_WINDOW_MS
      )
      // Check threshold
      if (messageTimestamps.current[identity].length > SPAM_MAX_MESSAGES) {
        handleSpamDetected(identity)
      }
    }
  }, [chatMessages.length])

  const handleSpamDetected = useCallback(async (identity) => {
    if (chatBannedRef.current.has(identity)) return
    chatBannedRef.current.add(identity)
    setChatBannedIdentities(prev => new Set([...prev, identity]))

    try {
      await eventsAPI.reportSpam(
        eventId,
        identity,
        attendeeSession?.attendeeId,
        attendeeSession?.accessToken
      )
    } catch (err) {
      console.error('Error reporting spam:', err)
    }
  }, [eventId, attendeeSession])

  // Host can manually ban a participant from chat
  const handleHostBanFromChat = useCallback(async (identity) => {
    if (chatBannedRef.current.has(identity)) return
    chatBannedRef.current.add(identity)
    setChatBannedIdentities(prev => new Set([...prev, identity]))
    try {
      await eventsAPI.banFromChat(eventId, identity)
    } catch (err) {
      console.error('Error banning from chat:', err)
    }
  }, [eventId])

  // Filter messages: exclude chat-banned identities
  const filteredMessages = useMemo(() => {
    if (chatBannedIdentities.size === 0) return chatMessages
    return chatMessages.filter(msg => !chatBannedIdentities.has(msg.from?.identity))
  }, [chatMessages, chatBannedIdentities])

  // Detect if local user has been chat-banned (canPublishData revoked)
  const isLocalChatBanned = localParticipant?.permissions?.canPublishData === false

  // Measure the host video area height to sync chat height
  // Ignore height changes while in fullscreen to avoid broken chat height on exit
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

  // Find host participant for speaking detection
  const hostParticipant = useMemo(() => {
    return participants.find(p => p.identity?.startsWith('host-'))
  }, [participants])

  // Prefer screen share over camera for host
  const hostTracks = useMemo(() => {
    const all = tracks.filter(t =>
      t.participant?.identity?.startsWith('host-') &&
      (t.source === Track.Source.Camera || t.source === Track.Source.ScreenShare)
    )
    const screenShare = all.find(t => t.source === Track.Source.ScreenShare)
    if (screenShare) return [screenShare, ...all.filter(t => t !== screenShare)]
    return all
  }, [tracks])

  const promotedTracks = useMemo(() => {
    return tracks.filter(t =>
      !t.participant?.identity?.startsWith('host-') &&
      t.participant?.permissions?.canPublish &&
      (t.source === Track.Source.Camera || t.source === Track.Source.ScreenShare)
    )
  }, [tracks])

  const toggleHandRaise = useCallback(async () => {
    if (!localParticipant) return
    if (localParticipant.permissions?.canUpdateMetadata === false) return
    const newValue = !handRaised
    setHandRaised(newValue)
    try {
      await localParticipant.setAttributes({ handRaised: newValue ? 'true' : '' })
    } catch (err) {
      console.warn('Error setting hand raise:', err)
      setHandRaised(!newValue) // revert on failure
    }
  }, [localParticipant, handRaised])

  // Auto-enable mic and lower hand when promoted (viewer gets canPublish)
  // The server clears the handRaised attribute during promotion, so we only
  // need to update React state here.
  const prevCanPublish = useRef(localParticipant?.permissions?.canPublish)
  useEffect(() => {
    if (!localParticipant || isHost) return
    const canPublish = localParticipant.permissions?.canPublish
    if (canPublish && !prevCanPublish.current) {
      localParticipant.setMicrophoneEnabled(true).catch(err => {
        console.warn('Could not enable mic after promotion:', err)
      })
      if (handRaised) {
        setHandRaised(false)
      }
    }
    prevCanPublish.current = canPublish
  }, [localParticipant?.permissions?.canPublish, isHost, handRaised])

  // Fullscreen for viewer
  const handleFullscreen = useCallback(() => {
    if (!videoAreaRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      videoAreaRef.current.requestFullscreen().catch(err => {
        console.warn('Fullscreen error:', err)
      })
    }
  }, [])

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left column: video + participant grid + controls */}
      <div className="flex-1 min-h-0 flex flex-col" ref={videoAreaRef}>
        {/* Host video */}
        <HostVideoContainer participant={hostParticipant}>
          {hostTracks.length > 0 ? (
            <VideoTrack
              trackRef={hostTracks[0]}
              className="w-full h-full object-contain"
            />
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

          {/* Fullscreen button for non-host */}
          {!isHost && (
            <button
              type="button"
              onClick={handleFullscreen}
              className="absolute bottom-2 right-2 rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
              title="Pantalla completa"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </button>
          )}
        </HostVideoContainer>

        {/* Promoted viewers grid */}
        {promotedTracks.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {promotedTracks.map((trackRef) => (
              <div
                key={trackRef.participant.identity + '-' + trackRef.source}
                className="bg-black rounded-lg overflow-hidden aspect-video relative"
              >
                <VideoTrack trackRef={trackRef} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 left-1 bg-black/50 rounded px-1.5 py-0.5">
                  <span className="text-xs text-white">{trackRef.participant.name || trackRef.participant.identity}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Participant grid — below host video */}
        <ParticipantGrid
          participants={participants}
          isHost={isHost}
          eventId={eventId}
        />

        {/* Toggle controls for host */}
        {isHost && (
          <div className="mt-3">
            <HostControls />
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
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l-.075 5.925m3.075-5.925v3m0-3a1.575 1.575 0 013.15 0v3m-3.15 0l-.075 3.925M14.1 7.575v3m0-3a1.575 1.575 0 013.15 0v4.725M6.9 7.575a1.575 1.575 0 00-3.15 0v6.525c0 3.06 1.827 5.625 4.725 6.825a10.49 10.49 0 006.15 0c2.898-1.2 4.725-3.765 4.725-6.825V7.575" />
              </svg>
              {handRaised ? 'Bajar mano' : 'Levantar mano'}
            </button>
          </div>
        )}
      </div>

      {/* Chat sidebar — height synced with video area */}
      <div
        className="lg:w-80 flex-shrink-0 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white"
        style={videoAreaHeight ? { height: videoAreaHeight, maxHeight: videoAreaHeight } : undefined}
      >
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
          <p className="text-xs text-gray-500">{participants.length} conectados</p>
        </div>
        <ChatPanel
          chatMessages={filteredMessages}
          send={send}
          isSending={isSending}
          isHost={isHost}
          isChatBanned={isLocalChatBanned}
          onHostBanFromChat={handleHostBanFromChat}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle switches for mic, camera, screen share
// ---------------------------------------------------------------------------
function HostControls() {
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant()
  const [deviceError, setDeviceError] = useState('')

  const toggleCamera = useCallback(async () => {
    if (!localParticipant) return
    setDeviceError('')
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled)
    } catch (err) {
      console.warn('Camera error:', err)
      setDeviceError('No se encontró la cámara')
    }
  }, [localParticipant, isCameraEnabled])

  const toggleMic = useCallback(async () => {
    if (!localParticipant) return
    setDeviceError('')
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
    } catch (err) {
      console.warn('Microphone error:', err)
      setDeviceError('No se encontró el micrófono')
    }
  }, [localParticipant, isMicrophoneEnabled])

  const toggleScreenShare = useCallback(async () => {
    if (!localParticipant) return
    setDeviceError('')
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled)
    } catch (err) {
      console.warn('Screen share error:', err)
      setDeviceError('No se pudo compartir pantalla')
    }
  }, [localParticipant, isScreenShareEnabled])

  return (
    <div className="flex items-center gap-x-6 flex-wrap">
      <div className="flex items-center gap-x-2">
        <span className="text-sm text-gray-700">Micrófono</span>
        <ToggleSwitch checked={isMicrophoneEnabled} onChange={toggleMic} />
      </div>
      <div className="flex items-center gap-x-2">
        <span className="text-sm text-gray-700">Cámara</span>
        <ToggleSwitch checked={isCameraEnabled} onChange={toggleCamera} />
      </div>
      <div className="flex items-center gap-x-2">
        <span className="text-sm text-gray-700">Pantalla</span>
        <ToggleSwitch checked={isScreenShareEnabled} onChange={toggleScreenShare} />
      </div>
      {deviceError && (
        <span className="text-xs text-red-600">{deviceError}</span>
      )}
    </div>
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

// ---------------------------------------------------------------------------
// Host video container with speaking animation
// ---------------------------------------------------------------------------
function HostVideoContainer({ participant, children }) {
  if (!participant) {
    return (
      <div className="bg-black rounded-lg overflow-hidden aspect-video w-full relative">
        {children}
        <SpeakingPulseStyle />
      </div>
    )
  }
  return (
    <HostVideoContainerInner participant={participant}>
      {children}
    </HostVideoContainerInner>
  )
}

function HostVideoContainerInner({ participant, children }) {
  const isSpeaking = useIsSpeaking(participant)

  return (
    <div
      className={`bg-black rounded-lg overflow-hidden aspect-video w-full relative transition-shadow duration-300 ${
        isSpeaking ? 'ring-2 ring-green-400' : ''
      }`}
      style={isSpeaking ? { animation: 'speaking-pulse 1.5s ease-in-out infinite' } : undefined}
    >
      {children}
      <SpeakingPulseStyle />
    </div>
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

// ---------------------------------------------------------------------------
// Participant grid — includes local user tile with "(Tu)" label
// For viewers: also includes the host tile (black styling, no controls)
// ---------------------------------------------------------------------------
function ParticipantGrid({ participants, isHost, eventId }) {
  // Host view: exclude host from grid (they see their own video above)
  // Viewer view: include all participants (host + viewers)
  const gridParticipants = isHost
    ? participants.filter(p => !p.identity?.startsWith('host-'))
    : participants

  // Sort: host first (viewer view only), local participant last, hand raised first among others
  const sorted = useMemo(() => {
    return [...gridParticipants].sort((a, b) => {
      // Host always first
      const aHost = a.identity?.startsWith('host-') ? 1 : 0
      const bHost = b.identity?.startsWith('host-') ? 1 : 0
      if (aHost !== bHost) return bHost - aHost
      // Local always at the end
      if (a.isLocal && !b.isLocal) return 1
      if (!a.isLocal && b.isLocal) return -1
      // Hand raised first
      const aHand = a.attributes?.handRaised === 'true' ? 1 : 0
      const bHand = b.attributes?.handRaised === 'true' ? 1 : 0
      return bHand - aHand
    })
  }, [gridParticipants])

  const handlePromote = useCallback(async (identity) => {
    if (!isHost || !eventId) return
    try {
      await eventsAPI.promoteParticipant(eventId, identity)
    } catch (err) {
      console.error('Error promoting participant:', err)
    }
  }, [isHost, eventId])

  const handleDemote = useCallback(async (identity) => {
    if (!isHost || !eventId) return
    try {
      await eventsAPI.demoteParticipant(eventId, identity)
    } catch (err) {
      console.error('Error demoting participant:', err)
    }
  }, [isHost, eventId])

  if (sorted.length === 0) return null

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {sorted.map((p) => (
          <ParticipantTile
            key={p.identity}
            participant={p}
            isHost={isHost}
            onPromote={handlePromote}
            onDemote={handleDemote}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual participant tile
// ---------------------------------------------------------------------------
function ParticipantTile({ participant: p, isHost, onPromote, onDemote }) {
  const isSpeaking = useIsSpeaking(p)
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()

  const isLocal = p.isLocal
  const isHostParticipant = p.identity?.startsWith('host-')
  const handRaised = p.attributes?.handRaised === 'true'
  const canPublish = p.permissions?.canPublish

  // Track if this participant was ever promoted (to show red after demotion)
  const wasPromoted = useRef(false)
  if (canPublish) wasPromoted.current = true

  // Determine mic state:
  // - Local user: use isMicrophoneEnabled from useLocalParticipant (reactive)
  // - Remote user: check audio track publications for non-muted tracks
  const isMicActive = isLocal
    ? isMicrophoneEnabled
    : (() => {
        if (!p.audioTrackPublications || p.audioTrackPublications.size === 0) return false
        for (const pub of p.audioTrackPublications.values()) {
          if (!pub.isMuted) return true
        }
        return false
      })()

  const initial = isLocal ? 'T' : (p.name || p.identity || '?').charAt(0).toUpperCase()
  const displayName = isLocal ? '(Tu)' : (p.name || p.identity || '?')
  const shortName = isLocal ? '(Tu)' : (displayName.length > 12 ? displayName.slice(0, 11) + '...' : displayName)

  const handleSelfMute = useCallback(async () => {
    if (!localParticipant || !isLocal) return
    try {
      await localParticipant.setMicrophoneEnabled(false)
    } catch (err) {
      console.warn('Error muting self:', err)
    }
  }, [localParticipant, isLocal])

  const handleClick = useCallback(() => {
    // Host tile: no click action for viewers
    if (isHostParticipant) return
    if (isLocal) {
      // Local user: only allow self-mute when promoted and mic is on
      if (canPublish && isMicActive) {
        handleSelfMute()
      }
      return
    }
    if (!isHost) return
    if (canPublish) {
      onDemote(p.identity)
    } else {
      onPromote(p.identity)
    }
  }, [isLocal, isHost, isHostParticipant, canPublish, isMicActive, handleSelfMute, onPromote, onDemote, p.identity])

  const getTitle = () => {
    if (isHostParticipant) return `Host: ${displayName}`
    if (isLocal) {
      if (canPublish && isMicActive) return 'Silenciar tu micrófono'
      if (!canPublish) return 'Levanta la mano para hablar'
      return '(Tu)'
    }
    if (isHost && canPublish) return `Silenciar a ${displayName}`
    if (isHost) return `Dar la palabra a ${displayName}`
    return displayName
  }

  // Build tile classes based on role and state
  const getTileClasses = () => {
    // Host participant tile (visible to viewers): black styling, no interactivity
    if (isHostParticipant) {
      return 'bg-gray-50 text-gray-900 ring-2 ring-gray-900 cursor-default'
    }
    // Local user tile
    if (isLocal) {
      if (canPublish) {
        return isMicActive
          ? 'bg-green-50 text-green-800 ring-2 ring-green-400 cursor-pointer hover:bg-green-100'
          : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
      }
      return 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
    }
    // Remote promoted participant: green (mic on) or red (mic off)
    if (canPublish) {
      return isMicActive
        ? 'bg-green-50 text-green-800 ring-2 ring-green-400 cursor-pointer hover:bg-green-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
    }
    // Remote demoted (was promoted before): red styling like muted speaker
    if (wasPromoted.current) {
      return isHost
        ? 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
    }
    // Remote non-promoted: red muted styling (host can click to promote)
    if (isHost) {
      return handRaised
        ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 cursor-pointer hover:bg-amber-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
    }
    return 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
  }

  // Mic icon for top-right badge
  const renderMicBadge = () => {
    // Host tile: no mic badge
    if (isHostParticipant) return null

    // Active mic icon (green for all promoted users)
    if (canPublish && isMicActive) {
      return (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </span>
      )
    }

    // Muted/crossed-out icon: promoted but mic off, OR not promoted
    if (canPublish && !isMicActive) {
      return (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-400">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        </span>
      )
    }

    // Demoted (was promoted): red muted icon
    if (wasPromoted.current) {
      return (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-400">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        </span>
      )
    }

    // Never promoted: red muted icon (matches muted state)
    return (
      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-400">
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
        </svg>
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        className={`relative w-14 h-14 rounded-lg flex items-center justify-center text-lg font-semibold transition-shadow duration-300 ${getTileClasses()}`}
        title={getTitle()}
      >
        {initial}

        {/* Hand raised icon — top left (hidden when actively speaking) */}
        {handRaised && !isLocal && !isHostParticipant && (!canPublish || !isMicActive) && (
          <span className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400">
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l-.075 5.925m3.075-5.925v3m0-3a1.575 1.575 0 013.15 0v3m-3.15 0l-.075 3.925M14.1 7.575v3m0-3a1.575 1.575 0 013.15 0v4.725M6.9 7.575a1.575 1.575 0 00-3.15 0v6.525c0 3.06 1.827 5.625 4.725 6.825a10.49 10.49 0 006.15 0c2.898-1.2 4.725-3.765 4.725-6.825V7.575" />
            </svg>
          </span>
        )}

        {/* Mic badge (top-right) */}
        {renderMicBadge()}
      </button>
      <span className={`text-xs text-center max-w-16 truncate ${
        isHostParticipant ? 'text-gray-900 font-semibold'
        : isLocal ? 'text-red-600 font-medium'
        : 'text-gray-600'
      }`}>{isHostParticipant ? 'Host' : shortName}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function ChatPanel({ chatMessages, send, isSending, isHost, isChatBanned, onHostBanFromChat }) {
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef(null)
  const [openMenuFor, setOpenMenuFor] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
    if (!message.trim() || isSending || isChatBanned) return
    send(message.trim())
    setMessage('')
  }

  const handleBanFromChat = (identity, index) => {
    setOpenMenuFor(null)
    onHostBanFromChat?.(identity)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages — inner scroll */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {chatMessages.length === 0 && (
          <p className="text-xs text-gray-400 italic">Sin mensajes todavía</p>
        )}
        {chatMessages.map((msg, i) => {
          const senderIdentity = msg.from?.identity
          const isHostMsg = senderIdentity?.startsWith('host-')
          return (
            <div key={i} className="text-sm flex items-start gap-x-1">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">
                  {msg.from?.name || senderIdentity || 'Anónimo'}
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
                        onClick={() => handleBanFromChat(senderIdentity, i)}
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
        <div ref={messagesEndRef} />
      </div>

      {/* Input or chat-banned warning */}
      {isChatBanned ? (
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs text-center text-red-600 font-medium">
            Has sido expulsado del chat por comportamiento inapropiado.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSend} className="border-t border-gray-200 px-4 py-3">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
        </form>
      )}
    </div>
  )
}
