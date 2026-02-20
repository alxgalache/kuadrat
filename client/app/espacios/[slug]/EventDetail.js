'use client'

import { useState, useEffect, useRef, useMemo, useCallback, use } from 'react'
import dynamic from 'next/dynamic'
import { eventsAPI, authorsAPI, getProtectedEventVideoUrl } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import useEventSocket from '@/hooks/useEventSocket'
import EventCountdown from '@/components/EventCountdown'
import EventAccessModal from '@/components/EventAccessModal'
import AuthorModal from '@/components/AuthorModal'
import Breadcrumbs from '@/components/Breadcrumbs'

// Dynamic imports for browser-only components
const EventLiveRoom = dynamic(
  () => import('@/components/EventLiveRoom'),
  { ssr: false }
)
const EventVideoPlayer = dynamic(
  () => import('@/components/EventVideoPlayer'),
  { ssr: false }
)

const categoryLabels = {
  masterclass: 'Masterclass',
  charla: 'Charla',
  entrevista: 'Entrevista',
  ama: 'AMA',
  video: 'Video',
}

function formatDate(datetimeStr) {
  if (!datetimeStr) return ''
  return new Date(datetimeStr).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(datetimeStr) {
  if (!datetimeStr) return ''
  return new Date(datetimeStr).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(datetimeStr) {
  if (!datetimeStr) return ''
  const d = new Date(datetimeStr)
  const day = d.getDate()
  const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
  return `${day} ${month}`
}

export default function EventDetail({ params }) {
  const resolvedParams = use(params)
  const { slug } = resolvedParams
  const { user } = useAuth()

  const [event, setEvent] = useState(null)
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)
  const [livekitToken, setLivekitToken] = useState(null)
  const [livekitUrl, setLivekitUrl] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [kicked, setKicked] = useState(false)
  const [hostAuthor, setHostAuthor] = useState(null)
  const [hostModalOpen, setHostModalOpen] = useState(false)
  const [videoToken, setVideoToken] = useState(null)
  const [videoTokenFilename, setVideoTokenFilename] = useState(null)

  // Real-time event status and chat via Socket.IO
  const { eventStarted, eventEnded, chatMessages, sendChatMessage } = useEventSocket(event?.id)

  useEffect(() => {
    loadEvent()
  }, [slug])

  // When server broadcasts event_started, re-fetch to trigger auto-connect flow
  useEffect(() => {
    if (eventStarted) {
      loadEvent()
    }
  }, [eventStarted])

  // When server broadcasts event_ended, re-fetch to show finished state
  useEffect(() => {
    if (eventEnded) {
      loadEvent()
    }
  }, [eventEnded])

  // Check for stored session
  useEffect(() => {
    if (!event) return

    const session = getStoredSession(event.id)
    if (session?.attendeeId && session?.accessToken) {
      setHasAccess(true)
    }

    // Check if current user is the host
    if (user && user.id === event.host_user_id) {
      setIsHost(true)
    }
  }, [event, user])

  // Auto-connect to LiveKit when event is active and user has access (live format only)
  useEffect(() => {
    if (!event || event.status !== 'active' || livekitToken) return
    if (event.format === 'video') return // Video events don't use LiveKit

    if (isHost) {
      connectAsHost()
    } else if (hasAccess) {
      connectAsViewer()
    }
  }, [event?.status, hasAccess, isHost])

  const loadEvent = async () => {
    try {
      const data = await eventsAPI.getBySlug(slug)
      setEvent(data.event)
      setAttendeeCount(data.attendeeCount || 0)
    } catch (err) {
      setError('Evento no encontrado')
    } finally {
      setLoading(false)
    }
  }

  const connectAsViewer = async () => {
    const session = getStoredSession(event.id)
    if (!session) return

    try {
      const data = await eventsAPI.getViewerToken(event.id, session.attendeeId, session.accessToken)
      setLivekitToken(data.token)
      setLivekitUrl(data.livekitUrl)
    } catch (err) {
      console.error('Error getting viewer token:', err)
    }
  }

  const connectAsHost = async () => {
    try {
      const data = await eventsAPI.getHostToken(event.id)
      setLivekitToken(data.token)
      setLivekitUrl(data.livekitUrl)
    } catch (err) {
      console.error('Error getting host token:', err)
    }
  }

  const handleAccessGranted = ({ attendeeId, accessToken }) => {
    setHasAccess(true)
    setModalOpen(false)
    // If event is active and live format, connect to LiveKit immediately
    if (event.status === 'active' && event.format !== 'video') {
      connectAsViewer()
    }
    // Video format events will auto-render since hasAccess is now true
  }

  const handleKicked = useCallback(() => {
    setKicked(true)
    setLivekitToken(null)
    setLivekitUrl(null)
    // Clear stored session so banned user can't reconnect
    if (event?.id) {
      try { localStorage.removeItem(`event_attendee_${event.id}`) } catch {}
    }
    // Redirect to home after a short delay
    setTimeout(() => {
      window.location.href = '/'
    }, 4000)
  }, [event?.id])

  // Fetch signed video token when user has access to a video-format event
  useEffect(() => {
    if (!event || event.format !== 'video' || !event.video_url?.startsWith('uploaded:')) return
    if (!hasAccess && !isHost) return
    fetchVideoToken()
  }, [event?.id, event?.format, event?.video_url, hasAccess, isHost])

  const fetchVideoToken = async () => {
    const session = getStoredSession(event.id)
    try {
      const data = await eventsAPI.getVideoToken(
        event.id,
        session?.attendeeId || null,
        session?.accessToken || null
      )
      setVideoToken(data.vtoken)
      setVideoTokenFilename(data.filename)
    } catch (err) {
      console.error('Error getting video token:', err)
    }
  }

  const handleViewHostAuthor = async () => {
    if (!event?.host_slug) return
    try {
      const data = await authorsAPI.getBySlug(event.host_slug)
      if (data?.author) {
        setHostAuthor(data.author)
        setHostModalOpen(true)
      }
    } catch (err) {
      console.error('Failed to load host author:', err)
    }
  }

  // Resolve video URL — external URLs used directly; uploaded files need a signed token (fetched async)
  const resolvedVideoUrl = useMemo(() => {
    if (!event?.video_url) return null
    if (event.video_url.startsWith('uploaded:')) return null // handled by video token flow
    return event.video_url
  }, [event?.video_url])

  // Protected URL for uploaded videos (requires signed vtoken)
  const protectedVideoUrl = useMemo(() => {
    if (!videoToken || !videoTokenFilename || !event?.id) return null
    return getProtectedEventVideoUrl(event.id, videoTokenFilename, videoToken)
  }, [videoToken, videoTokenFilename, event?.id])

  // The final video URL to pass to the player
  const activeVideoUrl = protectedVideoUrl || resolvedVideoUrl

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">Cargando evento...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-sm text-red-500">{error || 'Evento no encontrado'}</p>
      </div>
    )
  }

  // Active video event — synchronized video player + chat
  if (event.status === 'active' && event.format === 'video' && (hasAccess || isHost)) {
    return (
      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          {/* Event header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-x-3">
              <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
              <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                En directo
              </span>
            </div>
            <span className="text-sm text-gray-500">{attendeeCount} asistentes</span>
          </div>

          {/* Video player + chat layout */}
          {activeVideoUrl ? (
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 min-h-0">
                <EventVideoPlayer
                  videoUrl={activeVideoUrl}
                  videoStartedAt={event.video_started_at}
                  eventTitle={event.title}
                />
              </div>

              {/* Chat sidebar */}
              <VideoChatPanel
                chatMessages={chatMessages}
                sendChatMessage={sendChatMessage}
                eventId={event.id}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 mr-3" />
              <p className="text-sm text-gray-500">Cargando vídeo...</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Kicked notification
  if (kicked) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="mx-auto max-w-md px-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <p className="mt-4 text-lg font-semibold text-gray-900">Has sido expulsado del stream</p>
          <p className="mt-2 text-sm text-gray-600">
            Has sido expulsado del stream por realizar spam en el chat o comentarios inapropiados.
          </p>
          <p className="mt-4 text-xs text-gray-400">Redirigiendo a la página principal...</p>
        </div>
      </div>
    )
  }

  // Active event with LiveKit room
  if (event.status === 'active' && livekitToken && livekitUrl) {
    return (
      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          {/* Event header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-x-3">
              <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
              <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                En directo
              </span>
            </div>
            <span className="text-sm text-gray-500">{attendeeCount} asistentes</span>
          </div>

          {/* LiveKit room */}
          <div>
            <EventLiveRoom
              token={livekitToken}
              serverUrl={livekitUrl}
              roomName={event.livekit_room_name}
              isHost={isHost}
              eventId={event.id}
              onKicked={handleKicked}
            />
          </div>
        </div>
      </div>
    )
  }

  // Item 6: Pre-event / finished view — two-column layout matching art product page
  return (
    <div className="bg-white">
      <Breadcrumbs items={[
        { name: 'Espacios', href: '/espacios' },
        { name: event.title },
      ]} />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12 lg:max-w-7xl lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          {/* Left column: Cover image */}
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-200">
            {event.cover_image_url ? (
              <img
                src={event.cover_image_url}
                alt={event.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex w-full items-center justify-center">
                <p className="text-sm text-gray-400">Sin imagen</p>
              </div>
            )}
          </div>

          {/* Right column: Event info */}
          <div className="mt-10 px-4 sm:mt-16 sm:px-0 lg:mt-0">
            {/* Title */}
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {event.title}
            </h1>

            {/* Price */}
            <div className="mt-3">
              {event.access_type === 'paid' ? (
                <p className="text-3xl tracking-tight text-gray-900">
                  {event.price} {event.currency}
                </p>
              ) : (
                <p className="text-3xl tracking-tight text-gray-900">Gratis</p>
              )}
            </div>

            {/* Description */}
            {event.description && (
              <div className="mt-6">
                <div className="space-y-6 text-base text-gray-700">
                  <p className="whitespace-pre-line">{event.description}</p>
                </div>
              </div>
            )}

            {/* Meta info */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-x-2">
                <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700">
                  {categoryLabels[event.category] || event.category}
                </span>
                {event.status === 'active' && (
                  <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                    En directo
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between sm:justify-start sm:gap-x-6 text-sm text-gray-500">
                <span className="hidden sm:inline">{formatDate(event.event_datetime)}</span>
                <span className="sm:hidden">{formatDateShort(event.event_datetime)}</span>
                <span>{formatTime(event.event_datetime)}</span>
                <span>{event.duration_minutes} min</span>
                <span>{attendeeCount} registrados</span>
              </div>

              {event.host_name && (
                <p className="text-sm text-gray-600">
                  Presentado por{' '}
                  {event.host_slug ? (
                    <button
                      type="button"
                      onClick={handleViewHostAuthor}
                      className="font-semibold text-gray-900 hover:underline"
                    >
                      {event.host_name}
                    </button>
                  ) : (
                    <span className="font-semibold text-gray-900">{event.host_name}</span>
                  )}
                </p>
              )}
            </div>

            {/* Countdown */}
            <div className="mt-6">
              <EventCountdown eventDatetime={event.event_datetime} status={event.status} />
            </div>

            {/* Access section */}
            {!['finished', 'cancelled'].includes(event.status) && (
              <div className="mt-8">
                {hasAccess ? (
                  <div>
                    <div className="flex items-center gap-x-2 mb-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                        <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">Ya tienes acceso</p>
                    </div>
                    <p className="text-sm text-gray-500">
                      {event.status === 'active'
                        ? 'El evento está en directo. Recargando...'
                        : 'Podrás acceder cuando el evento comience.'}
                    </p>
                    {event.status === 'active' && !livekitToken && (
                      <button
                        type="button"
                        onClick={connectAsViewer}
                        className="mt-3 flex w-full items-center justify-center rounded-md bg-black px-8 py-3 text-base font-medium text-white hover:bg-gray-900"
                      >
                        Conectar al directo
                      </button>
                    )}
                  </div>
                ) : isHost ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Eres el host de este evento</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {event.status === 'active'
                        ? 'Conectando como presentador...'
                        : 'Podrás conectar cuando el administrador inicie el evento.'}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="flex w-full items-center justify-center rounded-md bg-black px-8 py-3 text-base font-medium text-white hover:bg-gray-900"
                  >
                    Acceder
                  </button>
                )}
              </div>
            )}

            {event.status === 'finished' && (
              <div className="mt-8 rounded-lg bg-gray-50 p-6 text-center">
                <p className="text-sm font-semibold text-gray-500">Este evento ha finalizado</p>
              </div>
            )}

            {event.status === 'cancelled' && (
              <div className="mt-8 rounded-lg bg-red-50 p-6 text-center">
                <p className="text-sm font-semibold text-red-700">Este evento ha sido cancelado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Access Modal */}
      <EventAccessModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        event={event}
        onAccessGranted={handleAccessGranted}
      />

      {/* Host author modal */}
      <AuthorModal
        author={hostAuthor}
        open={hostModalOpen}
        onClose={() => setHostModalOpen(false)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat panel for video events (uses Socket.IO instead of LiveKit)
// ---------------------------------------------------------------------------
function VideoChatPanel({ chatMessages, sendChatMessage, eventId }) {
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef(null)

  // Get sender name from stored session
  const senderName = useMemo(() => {
    const session = getStoredSession(eventId)
    if (session?.firstName && session?.lastName) {
      return `${session.firstName} ${session.lastName}`
    }
    return 'Anónimo'
  }, [eventId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  const handleSend = (e) => {
    e.preventDefault()
    if (!message.trim()) return
    sendChatMessage(senderName, message.trim())
    setMessage('')
  }

  return (
    <div className="lg:w-80 flex-shrink-0 flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white" style={{ height: 'calc(56.25vw * 0.6)', maxHeight: '500px' }}>
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
          {chatMessages.length === 0 && (
            <p className="text-xs text-gray-400 italic">Sin mensajes todavía</p>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className="text-sm">
              <span className="font-medium text-gray-900">{msg.sender}</span>
              <span className="text-gray-600 ml-1">{msg.message}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getStoredSession(eventId) {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`event_attendee_${eventId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
