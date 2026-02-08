'use client'

import { useState, useEffect } from 'react'

/**
 * Displays a live countdown to the event start time.
 *
 * @param {{ eventDatetime: string, status: string }} props
 */
export default function EventCountdown({ eventDatetime, status }) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!eventDatetime || status === 'finished' || status === 'cancelled') {
      setRemaining(null)
      return
    }

    const tick = () => {
      const now = Date.now()
      const target = new Date(eventDatetime).getTime()
      const diff = target - now
      if (diff <= 0) {
        setRemaining(0)
      } else {
        setRemaining(diff)
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [eventDatetime, status])

  if (status === 'active') {
    return (
      <span className="text-sm font-semibold text-green-600">
        En directo
      </span>
    )
  }

  if (status === 'finished') {
    return (
      <span className="text-sm font-semibold text-gray-500">
        Evento finalizado
      </span>
    )
  }

  if (status === 'cancelled') {
    return (
      <span className="text-sm font-semibold text-red-500">
        Evento cancelado
      </span>
    )
  }

  if (remaining === null) {
    return null
  }

  if (remaining === 0) {
    return (
      <span className="text-sm font-semibold text-gray-500">
        A punto de comenzar...
      </span>
    )
  }

  const totalSeconds = Math.floor(remaining / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const isUrgent = remaining < 60 * 60 * 1000 // less than 1 hour

  if (days > 0) {
    return (
      <span className="text-sm font-semibold text-gray-900">
        Comienza en: {days}d {hours}h {minutes}m
      </span>
    )
  }

  return (
    <span className={`text-sm font-semibold ${isUrgent ? 'text-red-600' : 'text-gray-900'}`}>
      Comienza en: {hours}h {minutes}m {seconds}s
    </span>
  )
}
