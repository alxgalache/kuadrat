'use client'

import { useState, useEffect, use } from 'react'
import dynamic from 'next/dynamic'
import { eventsAPI } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import EventCountdown from '@/components/EventCountdown'
import EventAccessModal from '@/components/EventAccessModal'

// Dynamic import for EventLiveRoom (uses browser-only APIs)
const EventLiveRoom = dynamic(
  () => import('@/components/EventLiveRoom'),
  { ssr: false }
)

const categoryLabels = {
  masterclass: 'Masterclass',
  charla: 'Charla',
  entrevista: 'Entrevista',
  ama: 'AMA',
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

export default function EventDetailPage({ params }) {
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

  useEffect(() => {
    loadEvent()
  }, [slug])

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

  // Auto-connect to LiveKit when event is active and user has access
  useEffect(() => {
    if (!event || event.status !== 'active' || livekitToken) return

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
    // If event is active, connect immediately
    if (event.status === 'active') {
      connectAsViewer()
    }
  }

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

  // Active event with LiveKit room
  if (event.status === 'active' && livekitToken && livekitUrl) {
    return (
      <div className="bg-white min-h-screen">
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
          <div className="h-[calc(100vh-12rem)]">
            <EventLiveRoom
              token={livekitToken}
              serverUrl={livekitUrl}
              roomName={event.livekit_room_name}
              isHost={isHost}
            />
          </div>
        </div>
      </div>
    )
  }

  // Pre-event / finished view
  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Cover image */}
        {event.cover_image_url && (
          <div className="aspect-[2/1] rounded-lg overflow-hidden bg-gray-100 mb-8">
            <img
              src={event.cover_image_url}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Badges */}
        <div className="flex items-center gap-x-2 mb-4">
          <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700">
            {categoryLabels[event.category] || event.category}
          </span>
          {event.access_type === 'paid' ? (
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
              {event.price} {event.currency}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
              Gratis
            </span>
          )}
          {event.status === 'active' && (
            <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              En directo
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          {event.title}
        </h1>

        {/* Meta */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 text-sm text-gray-500">
          <span>{formatDate(event.event_datetime)}</span>
          <span>{formatTime(event.event_datetime)}</span>
          <span>{event.duration_minutes} min</span>
          <span>{attendeeCount} registrados</span>
        </div>

        {/* Host */}
        {event.host_name && (
          <p className="mt-3 text-sm text-gray-600">
            Presentado por <span className="font-semibold text-gray-900">{event.host_name}</span>
          </p>
        )}

        {/* Countdown */}
        <div className="mt-6">
          <EventCountdown eventDatetime={event.event_datetime} status={event.status} />
        </div>

        {/* Description */}
        {event.description && (
          <div className="mt-6">
            <p className="text-gray-700 whitespace-pre-line">{event.description}</p>
          </div>
        )}

        {/* Access section */}
        {!['finished', 'cancelled'].includes(event.status) && (
          <div className="mt-8 rounded-lg border border-gray-200 p-6">
            {hasAccess ? (
              <div className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100 mb-3">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-900">Ya tienes acceso</p>
                <p className="mt-1 text-sm text-gray-500">
                  {event.status === 'active'
                    ? 'El evento está en directo. Recargando...'
                    : 'Podrás acceder cuando el evento comience.'}
                </p>
                {event.status === 'active' && !livekitToken && (
                  <button
                    type="button"
                    onClick={connectAsViewer}
                    className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
                  >
                    Conectar al directo
                  </button>
                )}
              </div>
            ) : isHost ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">Eres el host de este evento</p>
                <p className="mt-1 text-sm text-gray-500">
                  {event.status === 'active'
                    ? 'Conectando como presentador...'
                    : 'Podrás conectar cuando el administrador inicie el evento.'}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900 mb-3">
                  {event.access_type === 'paid'
                    ? `Accede por ${event.price} ${event.currency}`
                    : 'Regístrate para acceder'}
                </p>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="rounded-md bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
                >
                  Acceder
                </button>
              </div>
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

      {/* Access Modal */}
      <EventAccessModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        event={event}
        onAccessGranted={handleAccessGranted}
      />
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
