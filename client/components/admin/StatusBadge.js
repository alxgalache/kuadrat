'use client'

import { COA_TAG_STATUSES, COA_EVENT_STATUSES } from '@/lib/constants'

const FALLBACK = { label: '', className: 'bg-gray-100 text-gray-800' }

export default function StatusBadge({ type, value }) {
  const dict = type === 'event' ? COA_EVENT_STATUSES : COA_TAG_STATUSES
  const config = dict[value] || { ...FALLBACK, label: value || '—' }

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}
