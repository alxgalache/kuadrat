'use client'

import { ArrowDownIcon } from '@heroicons/react/20/solid'
import { LIVE_ROOM_COPY } from '@/lib/constants'

/**
 * «Mensajes nuevos»: aparece cuando llegan mensajes mientras el usuario lee
 * más arriba (useChatAutoScroll) y baja al final al pulsarlo. El padre debe ser
 * `relative`.
 */
export default function NewMessagesButton({ visible, onClick }) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-2 left-1/2 z-10 inline-flex min-h-9 -translate-x-1/2 items-center gap-x-1 rounded-full bg-gray-900 px-3 text-xs font-semibold text-white shadow-md hover:bg-gray-700 [touch-action:manipulation]"
    >
      <ArrowDownIcon aria-hidden="true" className="size-4" />
      {LIVE_ROOM_COPY.newMessages}
    </button>
  )
}
