'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { FunnelIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { eventsAPI } from '@/lib/api'
import EventCalendar from '@/components/EventCalendar'
import EventCountdown from '@/components/EventCountdown'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonthRange(year, month) {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function formatTime(datetimeStr) {
  if (!datetimeStr) return ''
  return new Date(datetimeStr).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(datetimeStr) {
  if (!datetimeStr) return ''
  return new Date(datetimeStr).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const categoryLabels = {
  masterclass: 'Masterclass',
  charla: 'Charla',
  entrevista: 'Entrevista',
  ama: 'AMA',
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function EspaciosPage() {
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [eventsForMonth, setEventsForMonth] = useState([])
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  const parsedDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date()
  const [calendarYear, setCalendarYear] = useState(parsedDate.getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(parsedDate.getMonth())

  // Load events for visible calendar month
  const loadMonthEvents = useCallback(async (year, month) => {
    try {
      const { from, to } = getMonthRange(year, month)
      const data = await eventsAPI.getByDateRange(from, to)
      setEventsForMonth(data.events || [])
    } catch {
      setEventsForMonth([])
    }
  }, [])

  useEffect(() => {
    loadMonthEvents(calendarYear, calendarMonth)
  }, [calendarYear, calendarMonth, loadMonthEvents])

  useEffect(() => {
    const d = new Date(selectedDate + 'T00:00:00')
    setCalendarYear(d.getFullYear())
    setCalendarMonth(d.getMonth())
  }, [selectedDate])

  // Filter events for selected date
  const eventsForDate = useMemo(() => {
    return eventsForMonth.filter((e) => {
      const eventDate = e.event_datetime?.split('T')[0]
      return eventDate === selectedDate
    })
  }, [selectedDate, eventsForMonth])

  // All upcoming events (for the right column)
  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return eventsForMonth
      .filter((e) => new Date(e.event_datetime) >= now || e.status === 'active')
      .sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime))
  }, [eventsForMonth])

  // Sidebar content
  const renderSidebarContent = () => (
    <div>
      <EventCalendar
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        eventDates={eventsForMonth}
      />

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-900">
          Eventos para el {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
        </h3>

        {eventsForDate.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No hay eventos para este día</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {eventsForDate.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/espacios/${e.slug}`}
                  onClick={() => setMobileFilterOpen(false)}
                  className="block w-full text-left rounded-lg p-3 bg-gray-200 text-gray-900 hover:bg-gray-300 transition-colors"
                >
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatTime(e.event_datetime)} · {e.duration_minutes} min
                  </p>
                  <div className="mt-1 flex items-center gap-x-2">
                    <span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                      {categoryLabels[e.category] || e.category}
                    </span>
                    {e.access_type === 'paid' ? (
                      <span className="text-xs text-amber-700 font-medium">{e.price} {e.currency}</span>
                    ) : (
                      <span className="text-xs text-green-700 font-medium">Gratis</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  // Main content - stacked event cards
  const renderMainContent = () => {
    if (upcomingEvents.length === 0 && eventsForMonth.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay eventos programados este mes</p>
        </div>
      )
    }

    const displayEvents = eventsForDate.length > 0 ? eventsForDate : upcomingEvents

    if (displayEvents.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay eventos para este día. Prueba otra fecha.</p>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {displayEvents.map((event) => (
          <Link
            key={event.id}
            href={`/espacios/${event.slug}`}
            className="block group"
          >
            <div className="rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              {/* Cover image */}
              {event.cover_image_url && (
                <div className="aspect-[3/1] bg-gray-100 overflow-hidden">
                  <img
                    src={event.cover_image_url}
                    alt={event.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              )}

              <div className="p-5">
                {/* Badges row */}
                <div className="flex items-center gap-x-2 mb-2">
                  <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                    {categoryLabels[event.category] || event.category}
                  </span>
                  {event.access_type === 'paid' ? (
                    <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {event.price} {event.currency}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      Gratis
                    </span>
                  )}
                  {event.status === 'active' && (
                    <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      En directo
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-600">
                  {event.title}
                </h3>

                {/* Description excerpt */}
                {event.description && (
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                    {event.description}
                  </p>
                )}

                {/* Meta row */}
                <div className="mt-3 flex items-center gap-x-4 text-sm text-gray-500">
                  <span>{formatDate(event.event_datetime)}</span>
                  <span>{formatTime(event.event_datetime)}</span>
                  <span>{event.duration_minutes} min</span>
                </div>

                {/* Host */}
                {event.host_name && (
                  <p className="mt-1 text-sm text-gray-500">
                    por <span className="font-medium text-gray-700">{event.host_name}</span>
                  </p>
                )}

                {/* Countdown / Status */}
                <div className="mt-3">
                  <EventCountdown
                    eventDatetime={event.event_datetime}
                    status={event.status}
                  />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Mobile: filter toggle */}
        <div className="lg:hidden mb-4">
          <button
            type="button"
            onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            {mobileFilterOpen ? (
              <>
                <XMarkIcon className="h-5 w-5" /> Cerrar filtro
              </>
            ) : (
              <>
                <FunnelIcon className="h-5 w-5" /> Calendario y eventos
              </>
            )}
          </button>
        </div>

        {/* Mobile sidebar (collapsible) */}
        {mobileFilterOpen && (
          <div className="lg:hidden mb-6 rounded-lg border border-gray-200 p-4">
            {renderSidebarContent()}
          </div>
        )}

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-8">
              {renderSidebarContent()}
            </div>
          </aside>

          {/* Main content area */}
          <main className="flex-1 min-w-0">
            {renderMainContent()}
          </main>
        </div>
      </div>
    </div>
  )
}
