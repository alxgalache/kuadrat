'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { auctionsAPI, drawsAPI } from '@/lib/api'
import AuctionCalendar from '@/components/AuctionCalendar'
import AuctionGridItem from '@/components/AuctionGridItem'
import DrawGridItem from '@/components/DrawGridItem'

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


// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function SubastasPage() {
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [eventsForMonth, setEventsForMonth] = useState([])

  const parsedDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date()
  const [calendarYear, setCalendarYear] = useState(parsedDate.getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(parsedDate.getMonth())

  // Load auctions and draws for visible calendar month
  const loadMonthEvents = useCallback(async (year, month) => {
    try {
      const { from, to } = getMonthRange(year, month)
      const [auctionData, drawData] = await Promise.all([
        auctionsAPI.getByDateRange(from, to),
        drawsAPI.getByDateRange(from, to),
      ])

      const auctions = (auctionData.auctions || []).map((a) => ({ ...a, _type: 'auction' }))
      const draws = (drawData.draws || []).map((d) => ({ ...d, _type: 'draw' }))

      setEventsForMonth([...auctions, ...draws])
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
    return eventsForMonth.filter((a) => {
      const start = a.start_datetime?.split('T')[0]
      const end = a.end_datetime?.split('T')[0]
      return (start && start <= selectedDate && end && end >= selectedDate)
    })
  }, [selectedDate, eventsForMonth])

  // Sidebar content
  const renderSidebarContent = () => (
    <div>
      <AuctionCalendar
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        auctionDates={eventsForMonth}
      />
    </div>
  )

  // Main content — events grid
  const renderMainContent = () => {
    if (eventsForMonth.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay eventos programadas en el día seleccionado</p>
        </div>
      )
    }

    if (eventsForDate.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay eventos para este dia</p>
        </div>
      )
    }

    return (
      <ul
        role="list"
        className="grid grid-cols-2 gap-4 sm:gap-8 lg:grid-cols-4"
      >
        {eventsForDate.map((item) =>
          item._type === 'draw' ? (
            <DrawGridItem key={`draw-${item.id}`} draw={item} />
          ) : (
            <AuctionGridItem key={`auction-${item.id}`} auction={item} />
          )
        )}
      </ul>
    )
  }

  return (
    <div className="bg-white min-h-[calc(100dvh-5rem-6rem)]">
      <h1 className="sr-only">Eventos</h1>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
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
