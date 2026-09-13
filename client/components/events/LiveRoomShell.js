'use client'

import { useRef } from 'react'
import useLiveRoomDocument from '@/hooks/useLiveRoomDocument'
import useLiveRoomViewport from '@/hooks/useLiveRoomViewport'
import { LIVE_ROOM_PANEL_WIDTH, LIVE_ROOM_STAGE_MAX_HEIGHT_RATIO } from '@/lib/constants'

const PORTRAIT_TEMPLATE = {
  gridTemplateAreas: '"top" "stage" "rows" "chat"',
  gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
  gridTemplateColumns: 'minmax(0, 1fr)',
}

/**
 * Contenedor de la sala en directo compacta (openspec/changes/live-event-mobile-layout).
 *
 * UN SOLO ÁRBOL EN TODAS LAS DISPOSICIONES. Siempre es este mismo `div`:
 * - En escritorio su clase es `contents`: desaparece del layout y la vista queda
 *   exactamente como antes.
 * - En compacto es un `fixed` con rejilla, y los envoltorios intermedios de la
 *   sala pasan también a `contents`, de modo que escena, filas y chat son ítems
 *   de esta rejilla y se colocan con `grid-area` (ver `roomCell`).
 *
 * Nunca un componente distinto por disposición: cruzar el umbral (girar una
 * tablet, redimensionar) desmontaría la escena, y mover la pizarra en el árbol
 * de React destruye y rejoinea su sala de fastboard.
 *
 * - `z-40`: por encima de la navbar y la página; por debajo de lo global a
 *   `z-50` («Evento finalizado», notificaciones, cookies, «Activar audio»).
 * - NUNCA `transform`: convertiría en relativos a este contenedor a sus
 *   descendientes `fixed` (teatro, consola). El desplazamiento va con `top`.
 * - `--room-h` / `--room-top` los escribe useLiveRoomViewport desde
 *   `visualViewport`; `100dvh` es solo el valor antes de la primera medición.
 *
 * @param {object} props
 * @param {boolean} props.compact
 * @param {boolean} props.landscape
 * @param {boolean} [props.panelOpen=true] - Panel lateral en horizontal
 */
export default function LiveRoomShell({ compact, landscape, panelOpen = true, children }) {
  const ref = useRef(null)
  useLiveRoomDocument({ enabled: compact })
  useLiveRoomViewport({ enabled: compact, ref })

  if (!compact) {
    return <div ref={ref} className="contents">{children}</div>
  }

  const template = landscape
    ? {
        gridTemplateAreas: '"stage rows" "stage chat"',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gridTemplateColumns: panelOpen ? `minmax(0, 1fr) ${LIVE_ROOM_PANEL_WIDTH}` : 'minmax(0, 1fr) 0px',
      }
    : PORTRAIT_TEMPLATE

  return (
    <div
      ref={ref}
      className={`group/live-room fixed inset-x-0 z-40 grid overflow-hidden ${landscape ? 'bg-black' : 'bg-white'}`}
      style={{ top: 'var(--room-top, 0px)', height: 'var(--room-h, 100dvh)', ...template }}
    >
      {children}
    </div>
  )
}

/**
 * Clase y estilo de una celda de la rejilla del contenedor compacto.
 * Fuera de compacto no aporta nada: el elemento conserva su layout de escritorio.
 *
 * @param {'stage'|'rows'|'chat'} area
 * @param {{compact: boolean, landscape: boolean, panelOpen?: boolean}} layout
 * @returns {{className: string, style: object|undefined}}
 */
export function roomCell(area, { compact, landscape, panelOpen = true }) {
  if (!compact) return { className: '', style: undefined }

  const style = { gridArea: area }
  let className = 'min-h-0 min-w-0'

  if (area === 'stage') {
    // Fondo negro: en horizontal la franja del área segura se funde con la escena
    className += ' relative flex items-center justify-center bg-black'
    if (landscape) {
      className += ' live-room-stage-box'
      style.paddingLeft = 'env(safe-area-inset-left)'
      if (!panelOpen) style.paddingRight = 'env(safe-area-inset-right)'
    }
    return { className, style }
  }

  className += ' bg-white'
  if (area === 'rows') className += ' group-data-[keyboard=open]/live-room:hidden'
  if (area === 'chat') className += ' flex flex-col'
  if (landscape) {
    className += ' border-l border-gray-200'
    style.paddingRight = 'env(safe-area-inset-right)'
    // Oculto sin desmontar: el chat conserva su posición y sus mensajes, y
    // `visibility: hidden` saca sus campos del orden de tabulación.
    if (!panelOpen) className += ' invisible'
  }
  return { className, style }
}

/**
 * Marco 16:9 de la escena en compacto (BroadcastStage, recuadro destacado de la
 * reunión o reproductor de vídeo). Devuelve `null` fuera de compacto: cada
 * componente conserva su marco de escritorio.
 *
 * - Vertical: a todo el ancho y nunca más alto que la mitad del contenedor; si
 *   el tope limita, el marco se centra sobre el fondo negro de su celda. Es lo
 *   que encoge la escena sola al abrir el teclado.
 * - Horizontal: encajado en ancho y alto con unidades de contenedor
 *   (`.live-room-stage-fit`). `object-fit: contain` no serviría: los recuadros de
 *   esquina y el botón de teatro se posicionan respecto a este marco.
 */
export function stageFrame({ compact, landscape }) {
  if (!compact) return null
  if (landscape) return { className: 'live-room-stage-fit relative overflow-hidden', style: undefined }
  return {
    className: 'relative aspect-video overflow-hidden',
    style: { width: `min(100%, calc(var(--room-h, 100dvh) * ${LIVE_ROOM_STAGE_MAX_HEIGHT_RATIO} * 16 / 9))` },
  }
}
