'use client'

import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { LiveIndicator } from '@/components/events/LiveRoomTopBar'
import { LIVE_ROOM_COPY } from '@/lib/constants'

const fade = (visible) => `transition-opacity duration-200 motion-reduce:transition-none ${
  visible ? 'opacity-100' : 'pointer-events-none opacity-0'
}`

// Los controles no deben propagar su toque a la escena: allí un toque alterna la
// visibilidad y los ocultaría justo al usarlos.
const stop = (e) => e.stopPropagation()

/**
 * Conmutador del panel lateral, pensado para ir en el MISMO grupo que el botón
 * de teatro (la ranura `theaterButton` de BroadcastStage), de modo que los dos
 * no puedan solaparse.
 */
export function PanelToggleButton({ panelOpen, onToggle }) {
  return (
    <button
      type="button"
      onClick={(e) => { stop(e); onToggle() }}
      aria-expanded={panelOpen}
      aria-label={panelOpen ? LIVE_ROOM_COPY.hideChat : LIVE_ROOM_COPY.showChat}
      className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors [touch-action:manipulation]"
    >
      <ChatBubbleLeftRightIcon aria-hidden="true" className="size-5" />
    </button>
  )
}

/**
 * Grupo superior derecho de la escena en horizontal: conmutador del panel y,
 * detrás, lo que haya (botón de teatro).
 */
export function StageChromeGroup({ visible, panelOpen, onTogglePanel, children }) {
  return (
    <div className={`flex items-center gap-x-2 ${fade(visible)}`} onClick={stop}>
      <PanelToggleButton panelOpen={panelOpen} onToggle={onTogglePanel} />
      {children}
    </div>
  )
}

/**
 * Controles superpuestos de la escena en la disposición horizontal compacta: el
 * indicador «EN DIRECTO» arriba a la izquierda y, abajo a la izquierda, lo que
 * se pase en `bottomLeft` (la mano del asistente con el panel oculto).
 *
 * Posicionados SUMANDO el área segura: un `absolute` se mide desde el borde del
 * relleno de su celda, que ya incluye la franja de la isla dinámica.
 *
 * @param {object} props
 * @param {boolean} props.visible - useAutoHideChrome
 * @param {number|null} props.connectedCount
 * @param {React.ReactNode} [props.topRight] - Si la escena no tiene ranura propia
 * @param {React.ReactNode} [props.bottomLeft]
 * @param {boolean} [props.bottomLeftPinned] - Visible aunque el resto se oculte (mano levantada)
 */
export default function LandscapeStageChrome({ visible, connectedCount, topRight = null, bottomLeft = null, bottomLeftPinned = false }) {
  return (
    <>
      <div
        className={`absolute z-20 ${fade(visible)}`}
        style={{ top: '0.5rem', left: 'calc(env(safe-area-inset-left) + 0.5rem)' }}
      >
        <LiveIndicator connectedCount={connectedCount} onDark />
      </div>
      {topRight && (
        <div
          className="absolute z-20"
          style={{ top: '0.5rem', right: 'calc(env(safe-area-inset-right) + 0.5rem)' }}
          onClick={stop}
        >
          {topRight}
        </div>
      )}
      {bottomLeft && (
        <div
          className={`absolute z-20 ${fade(visible || bottomLeftPinned)}`}
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)', left: 'calc(env(safe-area-inset-left) + 0.5rem)' }}
          onClick={stop}
        >
          {bottomLeft}
        </div>
      )}
    </>
  )
}
