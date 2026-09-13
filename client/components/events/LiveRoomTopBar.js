'use client'

import { UserIcon } from '@heroicons/react/20/solid'
import BrandLogo from '@/components/BrandLogo'
import { LIVE_ROOM_COPY } from '@/lib/constants'

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
 * Barra superior de la sala compacta en vertical: el logo y el indicador.
 *
 * Sin título y sin más controles: no hay ninguna acción asociada al título y ya
 * está en la pestaña. El logo NO es un enlace: salir cuesta una reconexión y, a
 * quien emite, cortar la emisión; la salida sigue siendo el «atrás» del
 * navegador. Se oculta con el teclado abierto.
 *
 * @param {object} props
 * @param {number|null} [props.connectedCount] - null en los pases de vídeo (sin presencia)
 */
export default function LiveRoomTopBar({ connectedCount = null }) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-between gap-x-3 border-b border-gray-200 bg-white px-4 pt-[env(safe-area-inset-top)] group-data-[keyboard=open]/live-room:hidden"
      style={{ gridArea: 'top' }}
    >
      <div className="flex h-11 items-center">
        <BrandLogo className="h-5 w-auto" />
      </div>
      <LiveIndicator connectedCount={connectedCount} />
    </div>
  )
}
