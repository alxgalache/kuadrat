'use client'

import { useEffect, useId, useRef } from 'react'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import { LIVE_ROOM_COPY } from '@/lib/constants'

/**
 * Hoja inferior de la sala compacta: controles («Más»), participante y
 * moderación de un mensaje.
 *
 * Es HIJA del contenedor de la sala (`absolute inset-0`), nunca un portal a
 * `document.body`: la misma regla que la consola móvil del host. Con un portal,
 * el orden de apilamiento dependería de lo que haya fuera del contenedor, y la
 * hoja dejaría de verse si el contenedor entrara en pantalla completa nativa.
 *
 * Mueve el foco al panel al abrirse y lo devuelve a quien la abrió al cerrarse;
 * cierra con Escape y tocando el fondo.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {Function} props.onClose
 * @param {React.ReactNode} props.children
 */
export default function LiveRoomSheet({ open, title, onClose, children }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const titleId = useId()

  // Solo depende de `open`: `onClose` suele ser una función en línea, y volver
  // a ejecutar el efecto en cada render movería el foco una y otra vez.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    panelRef.current?.focus()
    const onKeyDown = (e) => { if (e.key === 'Escape') onCloseRef.current?.() }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous?.isConnected && typeof previous.focus === 'function') previous.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[70%] flex-col rounded-t-xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-x-3 border-b border-gray-200 pl-4">
          <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 min-w-11 flex-shrink-0 items-center justify-center px-4 text-sm text-gray-600 hover:text-gray-900"
          >
            {LIVE_ROOM_COPY.close}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

/**
 * Fila de una hoja. Con `onClick` es un botón de ≥ 48 px; deshabilitada muestra
 * su motivo en lugar de ocultarse (un hueco vacío se lee como un fallo de carga).
 */
export function LiveRoomSheetRow({ label, detail, onClick, disabled = false, reason, danger = false, chevron = false }) {
  if (disabled) {
    return (
      <div className="flex min-h-12 flex-col justify-center border-b border-gray-100 px-4 py-2 last:border-b-0">
        <span className="text-sm text-gray-400">{label}</span>
        {reason && <span className="text-xs text-gray-400">{reason}</span>}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-x-3 border-b border-gray-100 px-4 py-2 text-left last:border-b-0 hover:bg-gray-50 [touch-action:manipulation]"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm ${danger ? 'font-medium text-red-600' : 'text-gray-900'}`}>{label}</span>
        {detail && <span className="truncate text-xs text-gray-500">{detail}</span>}
      </span>
      {chevron && <ChevronRightIcon aria-hidden="true" className="size-5 flex-shrink-0 text-gray-400" />}
    </button>
  )
}
