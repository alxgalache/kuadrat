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
  StartAudio,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { Track } from 'livekit-client'
import { eventsAPI } from '@/lib/api'

export default function EventLiveRoom({ token, serverUrl, roomName, isHost = false, eventId }) {
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
      <StartAudio
        label="Haz clic para activar el audio"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-md bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-gray-700 transition-colors"
      />
      <RoomContent isHost={isHost} eventId={eventId} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function RoomContent({ isHost, eventId }) {
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
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
    const newValue = !handRaised
    setHandRaised(newValue)
    try {
      await localParticipant.setAttributes({ handRaised: newValue ? 'true' : '' })
    } catch (err) {
      console.error('Error setting hand raise:', err)
    }
  }, [localParticipant, handRaised])

  // Auto-enable mic when promoted (viewer gets canPublish)
  const prevCanPublish = useRef(localParticipant?.permissions?.canPublish)
  useEffect(() => {
    if (!localParticipant || isHost) return
    const canPublish = localParticipant.permissions?.canPublish
    if (canPublish && !prevCanPublish.current) {
      localParticipant.setMicrophoneEnabled(true).catch(err => {
        console.warn('Could not enable mic after promotion:', err)
      })
    }
    prevCanPublish.current = canPublish
  }, [localParticipant?.permissions?.canPublish, isHost])

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
        <div className="bg-black rounded-lg overflow-hidden aspect-video w-full relative">
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
        </div>

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
        <ChatPanel />
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
// Participant grid — below host video, bigger squares with name
// ---------------------------------------------------------------------------
function ParticipantGrid({ participants, isHost, eventId }) {
  const remoteParticipants = participants.filter(p => !p.isLocal)

  // Sort: hand raised first
  const sorted = useMemo(() => {
    return [...remoteParticipants].sort((a, b) => {
      const aHand = a.attributes?.handRaised === 'true' ? 1 : 0
      const bHand = b.attributes?.handRaised === 'true' ? 1 : 0
      return bHand - aHand
    })
  }, [remoteParticipants])

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
        {sorted.map((p) => {
          const handRaised = p.attributes?.handRaised === 'true'
          const canPublish = p.permissions?.canPublish
          const isPublishing = p.audioTrackPublications?.size > 0
          const initial = (p.name || p.identity || '?').charAt(0).toUpperCase()
          const displayName = p.name || p.identity || '?'
          // Show first name + last initial, or truncate long names
          const shortName = displayName.length > 12 ? displayName.slice(0, 11) + '...' : displayName

          return (
            <div key={p.identity} className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (!isHost) return
                  if (canPublish) {
                    handleDemote(p.identity)
                  } else {
                    handlePromote(p.identity)
                  }
                }}
                className={`relative w-14 h-14 rounded-lg flex items-center justify-center text-lg font-semibold ${
                  canPublish
                    ? 'bg-green-50 text-green-800 ring-1 ring-green-300 cursor-pointer hover:bg-green-100'
                    : isHost
                      ? handRaised
                        ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 cursor-pointer hover:bg-amber-100'
                        : 'bg-gray-100 text-gray-700 cursor-pointer hover:bg-gray-200'
                      : 'bg-gray-100 text-gray-700 cursor-default'
                }`}
                title={
                  isHost && canPublish
                    ? `Silenciar a ${displayName}`
                    : isHost
                      ? `Dar la palabra a ${displayName}`
                      : displayName
                }
              >
                {initial}

                {/* Hand raised icon — top left */}
                {handRaised && (
                  <span className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l-.075 5.925m3.075-5.925v3m0-3a1.575 1.575 0 013.15 0v3m-3.15 0l-.075 3.925M14.1 7.575v3m0-3a1.575 1.575 0 013.15 0v4.725M6.9 7.575a1.575 1.575 0 00-3.15 0v6.525c0 3.06 1.827 5.625 4.725 6.825a10.49 10.49 0 006.15 0c2.898-1.2 4.725-3.765 4.725-6.825V7.575" />
                    </svg>
                  </span>
                )}

                {/* Muted icon — top right */}
                {!isPublishing && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-300">
                    <svg className="h-3 w-3 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  </span>
                )}

                {/* Speaking indicator — green ring when canPublish and publishing */}
                {canPublish && isPublishing && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  </span>
                )}
              </button>
              <span className="text-xs text-gray-600 text-center max-w-16 truncate">{shortName}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function ChatPanel() {
  const { chatMessages, send, isSending } = useChat()
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  const handleSend = (e) => {
    e.preventDefault()
    if (!message.trim() || isSending) return
    send(message.trim())
    setMessage('')
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages — inner scroll */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {chatMessages.length === 0 && (
          <p className="text-xs text-gray-400 italic">Sin mensajes todavía</p>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className="text-sm">
            <span className="font-medium text-gray-900">
              {msg.from?.name || msg.from?.identity || 'Anónimo'}
            </span>
            <span className="text-gray-600 ml-1">{msg.message}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-gray-200 px-4 py-3">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
      </form>
    </div>
  )
}
