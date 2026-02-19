'use client'

import { useState, useEffect } from 'react'

/**
 * Displays a live countdown to the auction end time.
 *
 * @param {{ endDatetime: string, isEnded: boolean }} props
 */
export default function AuctionCountdown({ endDatetime, isEnded }) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!endDatetime || isEnded) {
      setRemaining(null)
      return
    }

    const tick = () => {
      const now = Date.now()
      const end = new Date(endDatetime).getTime()
      const diff = end - now
      if (diff <= 0) {
        setRemaining(0)
      } else {
        setRemaining(diff)
      }
    }

    // Run immediately, then every second
    tick()
    const interval = setInterval(tick, 1000)

    return () => clearInterval(interval)
  }, [endDatetime, isEnded])

  if (isEnded || remaining === 0) {
    return (
      <span className="text-sm font-semibold text-gray-500">
        Subasta finalizada
      </span>
    )
  }

  if (remaining === null) {
    return null
  }

  const totalSeconds = Math.floor(remaining / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const isUrgent = remaining < 5 * 60 * 1000 // less than 5 minutes

  const timeStr = days > 0
    ? `${days}d ${hours}h ${minutes}m ${seconds}s`
    : `${hours}h ${minutes}m ${seconds}s`

  return (
    <span className={`text-sm font-semibold ${isUrgent ? 'text-red-600' : 'text-gray-900'}`}>
      Termina en: {timeStr}
    </span>
  )
}
