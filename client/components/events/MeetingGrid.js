'use client'

import { useEffect, useRef, useState } from 'react'
import { meetingGridColumns, meetingTileSize } from '@/lib/meetingGrid'
import { MEETING_GRID_GAP_PX } from '@/lib/constants'

/**
 * Rejilla de cámaras del host en una reunión, en escritorio y sin contenido
 * destacado: 3, 4 o 5 columnas según el número de recuadros (`meetingGridColumns`)
 * y un tamaño de recuadro que cabe a la vez en el ancho y en el alto de la columna
 * de medios (`meetingTileSize`), de modo que se ven todos sin scroll.
 *
 * Ocupa el alto restante de la columna (`flex-1 min-h-0`), la mide con un
 * ResizeObserver y centra la rejilla en horizontal. Antes de la primera medición
 * reparte el ancho a partes iguales, igual que la rejilla anterior.
 *
 * Los hijos son los recuadros; su orden visual lo fija cada uno con CSS `order`
 * (orden por actividad de voz), así que la rejilla no los reordena en el DOM.
 *
 * @param {object} props
 * @param {number} props.count - Número de recuadros
 */
export default function MeetingGrid({ count, children }) {
  const boxRef = useRef(null)
  const [box, setBox] = useState(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const columns = meetingGridColumns(count)
  const rows = Math.max(1, Math.ceil(count / columns))
  const tile = box ? meetingTileSize({ ...box, columns, rows, gap: MEETING_GRID_GAP_PX }) : null

  return (
    <div ref={boxRef} className="min-h-0 w-full flex-1">
      <div
        className="grid justify-center"
        style={{
          gap: `${MEETING_GRID_GAP_PX}px`,
          gridTemplateColumns: tile ? `repeat(${columns}, ${tile}px)` : `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
