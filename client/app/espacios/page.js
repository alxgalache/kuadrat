'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
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

function formatDateShort(datetimeStr) {
  if (!datetimeStr) return ''
  const d = new Date(datetimeStr)
  const day = d.getDate()
  const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
  return `${day} ${month}`
}

const categoryLabels = {
  masterclass: 'Masterclass',
  charla: 'Charla',
  entrevista: 'Entrevista',
  ama: 'AMA',
  video: 'Video',
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function EspaciosPage() {
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [eventsForMonth, setEventsForMonth] = useState([])
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

  // Sidebar content — Item 1: calendar only, no event list
  const renderSidebarContent = () => (
    <div>
      <EventCalendar
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        eventDates={eventsForMonth}
      />
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

    if (eventsForDate.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay eventos para este día</p>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {eventsForDate.map((event) => (
          <Link
            key={event.id}
            href={`/espacios/${event.slug}`}
            className="block group"
          >
            {/* Item 2: horizontal card with image on right + gradient — Item 3: no hover shadow */}
            <div className="rounded-lg border border-gray-200 overflow-hidden flex flex-row">
              {/* Content left (60%) */}
              <div className="flex-1 min-w-0 p-5">
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

                {/* Meta row — short date on mobile, full on sm+ */}
                <div className="mt-3 flex items-center justify-between sm:justify-start sm:gap-x-4 text-sm text-gray-500">
                  <span className="hidden sm:inline">{formatDate(event.event_datetime)}</span>
                  <span className="sm:hidden">{formatDateShort(event.event_datetime)}</span>
                  <span>{formatTime(event.event_datetime)}</span>
                  <span>{event.duration_minutes} min</span>
                  {event.host_name && (
                    <span>por <span className="font-medium text-gray-700">{event.host_name}</span></span>
                  )}
                </div>

                {/* Countdown / Status */}
                <div className="mt-3">
                  <EventCountdown
                    eventDatetime={event.event_datetime}
                    status={event.status}
                  />
                </div>
              </div>

              {/* Image right (50%) — stretches to match text content height */}
              {event.cover_image_url && (
                <div className="relative w-[50%] hidden sm:block self-stretch">
                  <img
                    src={event.cover_image_url}
                    alt={event.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    )
  }

  // Item 5: min-h to fill screen without scrollbar on short content
  return (
    <div className="bg-white min-h-[calc(100dvh-5rem-6rem)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Mobile calendar (always visible) */}
        <div className="lg:hidden mb-6">
          {renderSidebarContent()}
        </div>

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
