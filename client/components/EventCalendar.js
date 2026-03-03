'use client'

import { useState, useMemo } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * Minimal month-view calendar that highlights days with events.
 *
 * @param {{ selectedDate: string, onSelectDate: (dateStr: string) => void, eventDates: Array<{event_datetime: string, duration_minutes: number}> }} props
 */
export default function EventCalendar({ selectedDate, onSelectDate, onMonthChange, eventDates = [] }) {
  const today = new Date()
  const todayStr = formatDateStr(today)

  const initial = selectedDate ? new Date(selectedDate + 'T00:00:00') : today
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  // Build a Set of date strings (YYYY-MM-DD) that have an event
  const eventDateSet = useMemo(() => {
    const set = new Set()
    for (const e of eventDates) {
      const d = new Date(e.event_datetime)
      set.add(formatDateStr(d))
    }
    return set
  }, [eventDates])

  // Build the calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    let startWeekday = firstDay.getDay() - 1
    if (startWeekday < 0) startWeekday = 6

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const days = []

    for (let i = 0; i < startWeekday; i++) {
      days.push(null)
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(viewYear, viewMonth, d)
      days.push({
        day: d,
        dateStr: formatDateStr(dateObj),
      })
    }

    return days
  }, [viewYear, viewMonth])

  const handlePrevMonth = () => {
    const newMonth = viewMonth === 0 ? 11 : viewMonth - 1
    const newYear = viewMonth === 0 ? viewYear - 1 : viewYear
    setViewMonth(newMonth)
    setViewYear(newYear)
    onMonthChange?.(newYear, newMonth)
  }

  const handleNextMonth = () => {
    const newMonth = viewMonth === 11 ? 0 : viewMonth + 1
    const newYear = viewMonth === 11 ? viewYear + 1 : viewYear
    setViewMonth(newMonth)
    setViewYear(newYear)
    onMonthChange?.(newYear, newMonth)
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="select-none">
      {/* Header: month navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-600"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-gray-900 capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-600"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 mb-1">
        {DAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 text-center text-sm">
        {calendarDays.map((cell, idx) => {
          if (!cell) {
            return <div key={`blank-${idx}`} />
          }

          const isSelected = cell.dateStr === selectedDate
          const isToday = cell.dateStr === todayStr
          const hasEvent = eventDateSet.has(cell.dateStr)

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate(cell.dateStr)}
              className={`
                relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm
                transition-colors duration-150
                ${isSelected ? 'bg-gray-900 text-white font-semibold' : ''}
                ${!isSelected && isToday ? 'ring-1 ring-gray-400 font-semibold text-gray-900' : ''}
                ${!isSelected && !isToday ? 'text-gray-700 hover:bg-gray-100' : ''}
              `}
            >
              {cell.day}
              {hasEvent && (
                <span
                  className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-gray-900'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Format a Date object to YYYY-MM-DD */
function formatDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
