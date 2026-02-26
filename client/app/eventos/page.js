'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { auctionsAPI } from '@/lib/api'
import AuctionCalendar from '@/components/AuctionCalendar'
import AuctionGridItem from '@/components/AuctionGridItem'

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
  const [auctionsForMonth, setAuctionsForMonth] = useState([])

  const parsedDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date()
  const [calendarYear, setCalendarYear] = useState(parsedDate.getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(parsedDate.getMonth())

  // Load auctions for visible calendar month
  const loadMonthAuctions = useCallback(async (year, month) => {
    try {
      const { from, to } = getMonthRange(year, month)
      const data = await auctionsAPI.getByDateRange(from, to)
      setAuctionsForMonth(data.auctions || [])
    } catch {
      setAuctionsForMonth([])
    }
  }, [])

  useEffect(() => {
    loadMonthAuctions(calendarYear, calendarMonth)
  }, [calendarYear, calendarMonth, loadMonthAuctions])

  useEffect(() => {
    const d = new Date(selectedDate + 'T00:00:00')
    setCalendarYear(d.getFullYear())
    setCalendarMonth(d.getMonth())
  }, [selectedDate])

  // Filter auctions for selected date
  const auctionsForDate = useMemo(() => {
    return auctionsForMonth.filter((a) => {
      const start = a.start_datetime?.split('T')[0]
      const end = a.end_datetime?.split('T')[0]
      return (start && start <= selectedDate && end && end >= selectedDate)
    })
  }, [selectedDate, auctionsForMonth])

  // Sidebar content
  const renderSidebarContent = () => (
    <div>
      <AuctionCalendar
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        auctionDates={auctionsForMonth}
      />
    </div>
  )

  // Main content — auction grid
  const renderMainContent = () => {
    if (auctionsForMonth.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay eventos programadas en el día seleccionado</p>
        </div>
      )
    }

    if (auctionsForDate.length === 0) {
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
        {auctionsForDate.map((a) => (
          <AuctionGridItem key={a.id} auction={a} />
        ))}
      </ul>
    )
  }

  return (
    <div className="bg-white min-h-[calc(100dvh-5rem-6rem)]">
      <h1 className="sr-only">Subastas de Arte</h1>
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
