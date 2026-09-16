'use client'

import Link from 'next/link'
import { UserIcon } from '@heroicons/react/20/solid'
import BrandLogo from '@/components/BrandLogo'
import { LeaveEventButton, useLeaveEvent } from '@/components/events/LeaveEvent'
import { LIVE_ROOM_COPY, LEAVE_EVENT_COPY } from '@/lib/constants'

/**
 * «EN DIRECTO» y, si hay presencia, el número de conectados. Lo comparten la
 * barra superior (fondo claro) y los controles superpuestos de la disposición
 * horizontal (`onDark`).
 */
export function LiveIndicator({ connectedCount = null, onDark = false }) {
  return (
    <div className={`flex items-center gap-x-2 ${onDark ? 'rounded-md bg-black/60 px-2 py-1 text-white' : 'text-gray-900'}`}>
      <span aria-hidden="true" className="size-2 flex-shrink-0 rounded-full bg-red-500" />
      <span className="text-xs font-semibold tracking-wide">{LIVE_ROOM_COPY.live}</span>
      {connectedCount != null && (
        <span
          aria-label={LIVE_ROOM_COPY.connected(connectedCount)}
          className={`flex items-center gap-x-0.5 text-xs ${onDark ? 'text-gray-200' : 'text-gray-500'}`}
        >
          <UserIcon aria-hidden="true" className="size-3.5" />
          {connectedCount}
        </span>
      )}
    </div>
  )
}

/**
 * Barra superior de la sala compacta en vertical: el logo, el indicador y
 * «Salir».
 *
 * Sin título: no tiene ninguna acción asociada y ya está en la pestaña. El logo
 * es un enlace a la página de inicio, pero NUNCA navega sin preguntar: salir
 * cuesta una reconexión y, a quien emite, cortar su emisión, así que abre la misma
 * confirmación que el botón «Salir» (live-event-leave). Sin proveedor de salida
 * (no debería ocurrir), el enlace funciona como un enlace normal. Se oculta con
 * el teclado abierto.
 *
 * @param {object} props
 * @param {number|null} [props.connectedCount] - null en los pases de vídeo (sin presencia)
 */
export default function LiveRoomTopBar({ connectedCount = null }) {
  const leave = useLeaveEvent()

  const handleLogoClick = (e) => {
    if (!leave) return
    e.preventDefault()
    leave.request()
  }

  return (
    <div
      className="flex flex-shrink-0 items-center justify-between gap-x-3 border-b border-gray-200 bg-white px-4 pt-[env(safe-area-inset-top)] group-data-[keyboard=open]/live-room:hidden"
      style={{ gridArea: 'top' }}
    >
      <Link
        href="/"
        onClick={handleLogoClick}
        aria-label={LEAVE_EVENT_COPY.logoLabel}
        className="-ml-1 flex h-11 items-center px-1 [touch-action:manipulation]"
      >
        <BrandLogo className="h-5 w-auto" />
      </Link>
      <div className="flex items-center gap-x-3">
        <LiveIndicator connectedCount={connectedCount} />
        <LeaveEventButton variant="compact" />
      </div>
    </div>
  )
}
