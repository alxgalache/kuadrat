'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * Minimal month-view calendar that highlights days with auctions.
 *
 * @param {{ selectedDate: string, onSelectDate: (dateStr: string) => void, auctionDates: Array<{start_datetime: string, end_datetime: string, id: number|string}> }} props
 */
export default function AuctionCalendar({ selectedDate, onSelectDate, onMonthChange, auctionDates = [] }) {
  // «Hoy» y el mes visible NO pueden decidirse durante el render.
  //
  // Esta página se prerrenderiza durante `docker build` y se sirve estática: una
  // fecha calculada aquí queda congelada en el HTML con el día de la compilación
  // y se sirve así hasta el siguiente despliegue —comprobado: el HTML llevaba el
  // día 11 marcado—. Y en desarrollo discrepa igualmente, porque el contenedor
  // corre en UTC y el navegador en Europe/Madrid, así que entre las 00:00 y las
  // 02:00 locales no coinciden ni en el día.
  //
  // Fijándolas en un efecto, que no corre en el servidor, el HTML servido no
  // afirma ninguna fecha y no hay nada con lo que discrepar. Es la misma regla
  // que el proyecto ya aplica a `localStorage` y al indicador de carga de
  // imágenes: nada que dependa del reloj o del navegador sale de un
  // inicializador de `useState`.
  const [todayStr, setTodayStr] = useState(null)

  // Año y mes viajan JUNTOS en un solo estado, y no en dos, porque al cambiar de
  // mes el año depende del mes: separados no hay forma de actualizarlos a la vez
  // a partir del valor anterior. Ver `cambiarMes`.
  const [view, setView] = useState(null) // { year, month } · month 0-indexed
  const viewRef = useRef(null)

  useEffect(() => {
    setTodayStr(formatDateStr(new Date()))
  }, [])

  // El mes visible se engancha a la fecha elegida la primera vez que llega; a
  // partir de ahí lo gobiernan las flechas.
  useEffect(() => {
    if (!selectedDate || viewRef.current) return
    const d = new Date(selectedDate + 'T00:00:00')
    const inicial = { year: d.getFullYear(), month: d.getMonth() }
    viewRef.current = inicial
    setView(inicial)
  }, [selectedDate])

  const listo = view !== null
  const viewYear = view?.year
  const viewMonth = view?.month

  // Build a Set of date strings (YYYY-MM-DD) that have an auction
  const auctionDateSet = useMemo(() => {
    const set = new Set()
    for (const a of auctionDates) {
      // An auction may span multiple days; mark every day in the range
      const start = new Date(a.start_datetime)
      const end = new Date(a.end_datetime)
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      while (d <= endDay) {
        set.add(formatDateStr(d))
        d.setDate(d.getDate() + 1)
      }
    }
    return set
  }, [auctionDates])

  // Build the calendar grid
  const calendarDays = useMemo(() => {
    // Armazón mientras no hay mes: seis filas vacías, la altura máxima que puede
    // ocupar un mes, para que el relleno posterior no empuje lo que hay debajo.
    if (!listo) return Array.from({ length: 42 }, () => null)

    const firstDay = new Date(viewYear, viewMonth, 1)
    // Day of week: JS returns 0=Sun ... 6=Sat; we want Mon=0 ... Sun=6
    let startWeekday = firstDay.getDay() - 1
    if (startWeekday < 0) startWeekday = 6

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const days = []

    // Fill leading blanks
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
  }, [listo, viewYear, viewMonth])

  // El salto se calcula sobre `viewRef`, no sobre el estado.
  //
  // Dos pulsaciones dentro del mismo lote de React leen las dos el mismo `view`
  // del cierre, calculan el mismo mes y avanzan uno solo. La ref se adelanta
  // dentro del propio manejador, así que la segunda parte de donde dejó la
  // primera. No vale un actualizador funcional: `onMonthChange` es un efecto
  // secundario y no puede vivir dentro de uno (React lo invoca dos veces en
  // desarrollo), y meterlo en un `useEffect` tampoco, porque las páginas lo
  // pasan como función en línea y su identidad cambia en cada render.
  //
  // Contar en meses absolutos evita el caso de borde de diciembre y enero.
  const cambiarMes = (delta) => {
    const actual = viewRef.current
    if (!actual) return
    const total = actual.year * 12 + actual.month + delta
    const siguiente = { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
    viewRef.current = siguiente
    setView(siguiente)
    onMonthChange?.(siguiente.year, siguiente.month)
  }

  const handlePrevMonth = () => cambiarMes(-1)
  const handleNextMonth = () => cambiarMes(1)

  const monthLabel = listo
    ? new Date(viewYear, viewMonth, 1).toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric',
      })
    : '\u00A0'

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
            return <div key={`blank-${idx}`} className="h-8" />
          }

          const isSelected = cell.dateStr === selectedDate
          const isToday = cell.dateStr === todayStr
          const hasAuction = auctionDateSet.has(cell.dateStr)

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
              {hasAuction && (
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
