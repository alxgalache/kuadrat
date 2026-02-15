'use client'

import { useEffect, useRef } from 'react'

/**
 * Real-time bid feed displayed as a vertical timeline.
 *
 * @param {{ bids: Array<{ buyer_first_name: string, amount: number, created_at: string }> }} props
 */
export default function AuctionBidFeed({ bids = [] }) {
  const feedRef = useRef(null)

  // Scroll to top when new bids arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0
    }
  }, [bids.length])

  if (bids.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-gray-400">
        Todavia no hay pujas para este producto
      </div>
    )
  }

  return (
    <div ref={feedRef} className="max-h-72 overflow-y-auto">
      <ul role="list" className="space-y-6">
        {bids.map((bid, index) => (
          <li
            key={`${bid.created_at}-${index}`}
            className="relative flex gap-x-4"
            style={{
              animation: index === 0 ? 'fadeSlideIn 0.3s ease-out' : 'none',
            }}
          >
            <div
              className={`absolute top-0 left-0 flex w-6 justify-center ${
                index === bids.length - 1 ? 'h-6' : '-bottom-6'
              }`}
            >
              <div className="w-px bg-gray-200" />
            </div>

            <div className="relative flex size-6 flex-none items-center justify-center bg-white">
              <div className="size-1.5 rounded-full bg-gray-100 ring ring-gray-300" />
            </div>

            <p className="flex-auto py-0.5 text-xs/5 text-gray-500">
              <span className="font-medium text-gray-900">{bid.buyer_first_name}</span>
              {' realizo una puja de '}
              <span className="font-medium text-gray-900">{formatCurrency(bid.amount)}</span>
            </p>
            <time className="mr-2 flex-none py-0.5 text-xs/5 text-gray-500">
              {relativeTime(bid.created_at)}
            </time>
          </li>
        ))}
      </ul>

      {/* Animation keyframe injected once */}
      <style jsx>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

/** Format a numeric amount as euros */
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Produce a Spanish relative-time string */
function relativeTime(dateStr) {
  const now = Date.now()
  // DB stores CURRENT_TIMESTAMP in UTC; append 'Z' so JS parses as UTC
  const normalized = dateStr && !dateStr.endsWith('Z') && !dateStr.includes('+') ? dateStr + 'Z' : dateStr
  const then = new Date(normalized).getTime()
  const diffMs = now - then

  if (diffMs < 0) return 'ahora'

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'hace unos segundos'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`

  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}
