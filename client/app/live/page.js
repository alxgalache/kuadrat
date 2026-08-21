'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Image from 'next/image'
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
        onMonthChange={(year, month) => { setCalendarYear(year); setCalendarMonth(month) }}
        eventDates={eventsForMonth}
      />
    </div>
  )

  // Main content - stacked event cards
  const renderMainContent = () => {
    if (upcomingEvents.length === 0 && eventsForMonth.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay eventos programados en el día seleccionado</p>
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
            href={`/live/${event.slug}`}
            className="block group"
          >
            {/* Tarjeta horizontal: texto a la izquierda, imagen difuminada a la
                derecha. Sin sombra al pasar el puntero, a propósito.

                Tres arreglos sobre la versión anterior:

                · La imagen ocupaba el 50 % y ahogaba el texto en la otra mitad:
                  la fila de metadatos no cabía y partía CADA dato en dos líneas
                  («21 de agosto de / 2026», «60 / min»). Baja al 40 % y los
                  datos llevan `whitespace-nowrap`, así que se parten entre
                  ellos, nunca por dentro.
                · «En directo» salía DOS veces: como insignia arriba y otra vez
                  en el contador. Las insignias se quedan con lo que el evento
                  ES (categoría) y lo que CUESTA (precio); el estado temporal
                  —en directo, cuenta atrás, finalizado, cancelado— es del
                  contador, que además es el único que cambia solo.
                · El anfitrión estaba metido a presión en la fila de metadatos,
                  que es de tiempo. Ahora tiene su propia línea. */}
            <div className="flex flex-row overflow-hidden rounded-lg border border-gray-200 transition-colors [@media(hover:hover)]:group-hover:border-gray-300">
              {/* Contenido */}
              <div className="min-w-0 flex-1 p-5 sm:p-6">
                {/* Qué es y cuánto cuesta */}
                <div className="flex flex-wrap items-center gap-2">
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
                </div>

                <h3 className="mt-3 text-lg font-semibold tracking-tight text-gray-900 [@media(hover:hover)]:group-hover:text-gray-600">
                  {event.title}
                </h3>

                {event.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-gray-600">
                    {event.description}
                  </p>
                )}

                {/* Cuándo. Los puntos medios van marcados como decorativos: un
                    lector de pantalla no debe leer «punto» entre la fecha y la
                    hora. */}
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                  <span className="hidden whitespace-nowrap sm:inline">
                    {formatDate(event.event_datetime)}
                  </span>
                  <span className="whitespace-nowrap sm:hidden">
                    {formatDateShort(event.event_datetime)}
                  </span>
                  <span aria-hidden="true" className="text-gray-300">·</span>
                  <span className="whitespace-nowrap">{formatTime(event.event_datetime)}</span>
                  {event.duration_minutes && (
                    <>
                      <span aria-hidden="true" className="text-gray-300">·</span>
                      <span className="whitespace-nowrap">{event.duration_minutes} min</span>
                    </>
                  )}
                </div>

                {/* Quién */}
                {event.host_name && (
                  <p className="mt-1 truncate text-sm text-gray-500">
                    por <span className="font-medium text-gray-700">{event.host_name}</span>
                  </p>
                )}

                {/* Estado. Separado por un filete: es información de otra
                    naturaleza —cambia sola— y conviene que se lea aparte. */}
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <EventCountdown
                    eventDatetime={event.event_datetime}
                    status={event.status}
                  />
                </div>
              </div>

              {/* Imagen. El degradado de tres paradas la funde con el texto de
                  forma gradual; con dos, el corte se veía. */}
              {event.cover_image_url && (
                <div className="relative hidden w-2/5 self-stretch sm:block">
                  <Image
                    src={event.cover_image_url}
                    alt={event.title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 640px) 40vw, 0px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-white via-white/40 to-transparent" />
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
      <h1 className="sr-only">Eventos y Espacios de Arte</h1>
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
