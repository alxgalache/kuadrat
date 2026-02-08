'use client'

import { useState, useCallback, useMemo } from 'react'
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

/**
 * LiveKit-based live room component for events.
 *
 * Shows:
 * - Host video (main area)
 * - Promoted viewer tiles grid
 * - Chat
 * - Hand raise button
 */
export default function EventLiveRoom({ token, serverUrl, roomName, isHost = false }) {
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
      <RoomContent isHost={isHost} />
      <RoomAudioRenderer />
      <StartAudio label="Haz clic para activar el audio" />
    </LiveKitRoom>
  )
}

function RoomContent({ isHost }) {
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

  // Separate host and promoted viewer tracks
  const hostTracks = useMemo(() => {
    return tracks.filter(t =>
      t.participant?.identity?.startsWith('host-') &&
      (t.source === Track.Source.Camera || t.source === Track.Source.ScreenShare)
    )
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

  return (
    <div className="flex flex-col lg:flex-row h-full gap-4">
      {/* Main video area (3/4) */}
      <div className="flex-1 min-h-0">
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
                  <p className="text-gray-400 text-xs">Activa tu cámara con el botón de abajo</p>
                </>
              ) : (
                <p className="text-white text-sm">Esperando al host...</p>
              )}
            </div>
          )}
        </div>

        {/* Promoted viewers grid */}
        {promotedTracks.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {promotedTracks.map((trackRef) => (
              <div
                key={trackRef.participant.identity + '-' + trackRef.source}
                className="bg-black rounded-lg overflow-hidden aspect-video"
              >
                <VideoTrack trackRef={trackRef} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 left-1 bg-black/50 rounded px-1.5 py-0.5">
                  <span className="text-xs text-white">{trackRef.participant.name || trackRef.participant.identity}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Controls for host */}
        {isHost && (
          <div className="mt-3 flex items-center gap-x-3">
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
              <span className="text-base">{handRaised ? '✋' : '🤚'}</span>
              {handRaised ? 'Bajar mano' : 'Levantar mano'}
            </button>
          </div>
        )}
      </div>

      {/* Chat sidebar (1/4) */}
      <div className="lg:w-80 flex-shrink-0 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
          <p className="text-xs text-gray-500">{participants.length} conectados</p>
        </div>
        <ChatPanel />
      </div>
    </div>
  )
}

function HostControls() {
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant()
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

  return (
    <>
      <button
        type="button"
        onClick={toggleMic}
        className={`inline-flex items-center gap-x-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm ${
          isMicrophoneEnabled
            ? 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
            : 'bg-red-100 text-red-700 ring-1 ring-red-300'
        }`}
      >
        {isMicrophoneEnabled ? '🎙️ Micro on' : '🔇 Micro off'}
      </button>
      <button
        type="button"
        onClick={toggleCamera}
        className={`inline-flex items-center gap-x-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm ${
          isCameraEnabled
            ? 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
            : 'bg-red-100 text-red-700 ring-1 ring-red-300'
        }`}
      >
        {isCameraEnabled ? '📷 Cámara on' : '📷 Cámara off'}
      </button>
      {deviceError && (
        <span className="text-xs text-red-600">{deviceError}</span>
      )}
    </>
  )
}

function ChatPanel() {
  const { chatMessages, send, isSending } = useChat()
  const [message, setMessage] = useState('')

  const handleSend = (e) => {
    e.preventDefault()
    if (!message.trim() || isSending) return
    send(message.trim())
    setMessage('')
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
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
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-gray-200 px-4 py-3 flex gap-x-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 rounded-md border-gray-300 text-sm shadow-sm focus:border-gray-500 focus:ring-gray-500"
        />
        <button
          type="submit"
          disabled={!message.trim() || isSending}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
