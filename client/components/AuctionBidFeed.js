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
    <div ref={feedRef} className="max-h-72 overflow-y-auto py-4">
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-2.5 top-0 bottom-0 w-px bg-gray-200" />

        {bids.map((bid, index) => (
          <div
            key={`${bid.created_at}-${index}`}
            className="relative mb-4 last:mb-0 transition-opacity duration-300"
            style={{
              animation: index === 0 ? 'fadeSlideIn 0.3s ease-out' : 'none',
            }}
          >
            {/* Circle dot */}
            <div className="absolute -left-3.5 top-1 h-3 w-3 rounded-full border-2 border-gray-900 bg-white" />

            <div className="ml-2">
              <p className="text-sm text-gray-900">
                <span className="font-semibold">{bid.buyer_first_name}</span>{' '}
                {' realizo una puja de '}
                <span className="font-semibold">{formatCurrency(bid.amount)}</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {relativeTime(bid.created_at)}
              </p>
            </div>
          </div>
        ))}
      </div>

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
  const then = new Date(dateStr).getTime()
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
