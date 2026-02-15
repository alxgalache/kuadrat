'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { auctionsAPI } from '@/lib/api'
import AuctionCalendar from '@/components/AuctionCalendar'

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

function formatDateTimeRange(startStr, endStr) {
  if (!startStr || !endStr) return ''
  const start = new Date(startStr)
  const end = new Date(endStr)

  const formatDate = (d) => d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  })
  const formatTimeOnly = (d) => d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${formatDate(start)} ${formatTimeOnly(start)} - ${formatDate(end)} ${formatTimeOnly(end)}`
}

function formatDateShort(datetimeStr) {
  if (!datetimeStr) return ''
  const d = new Date(datetimeStr)
  const day = d.getDate()
  const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
  return `${day} ${month}`
}

function formatTime(datetimeStr) {
  if (!datetimeStr) return ''
  return new Date(datetimeStr).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatProductSellers(productCount, sellersSummary) {
  if (!sellersSummary || sellersSummary.length === 0) {
    return `${productCount} pieza${productCount !== 1 ? 's' : ''}`
  }

  const mainSeller = sellersSummary[0]
  const mainName = mainSeller.sellerName || 'Autor desconocido'
  const otherSellersCount = sellersSummary.length - 1

  if (otherSellersCount === 0) {
    return `${productCount} pieza${productCount !== 1 ? 's' : ''} de ${mainName}`
  }

  return `${productCount} piezas de ${mainName} y ${otherSellersCount} más`
}

const statusLabels = {
  active: { label: 'En curso', bg: 'bg-green-50', text: 'text-green-700' },
  scheduled: { label: 'Programada', bg: 'bg-blue-50', text: 'text-blue-700' },
  finished: { label: 'Finalizada', bg: 'bg-gray-100', text: 'text-gray-600' },
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

  // Main content — auction cards
  const renderMainContent = () => {
    if (auctionsForMonth.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay subastas programadas en el día seleccionado</p>
        </div>
      )
    }

    if (auctionsForDate.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">No hay subastas para este dia</p>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {auctionsForDate.map((a) => {
          const status = statusLabels[a.status] || statusLabels.scheduled
          return (
            <Link
              key={a.id}
              href={`/subastas/${a.id}`}
              className="block group"
            >
              <div className="rounded-lg border border-gray-200 overflow-hidden p-5">
                {/* Badges row */}
                <div className="flex items-center gap-x-2 mb-2">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}>
                    {status.label}
                  </span>
                  {a.product_count > 0 && (
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {formatProductSellers(a.product_count, a.sellers_summary)}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-600">
                  {a.name}
                </h3>

                {/* Meta row */}
                <div className="mt-3 flex items-center justify-between sm:justify-start sm:gap-x-4 text-sm text-gray-500">
                  <span className="hidden sm:inline">{formatDateTimeRange(a.start_datetime, a.end_datetime)}</span>
                  <span className="sm:hidden">{formatDateShort(a.start_datetime)}</span>
                  <span className="sm:hidden">{formatTime(a.start_datetime)}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    )
  }

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
