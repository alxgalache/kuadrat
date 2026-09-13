'use client'

import { useEffect, useRef } from 'react'

/**
 * Confirmación destructiva DENTRO de la superposición o del contenedor que la
 * muestra, nunca en un portal.
 *
 * No usa el `ConfirmDialog` compartido a propósito: aquél está construido sobre
 * el `Dialog` de Headless UI, que se monta en un portal colgado de
 * `document.body`. En la consola móvil del host eso lo dejaba fuera del elemento
 * en pantalla completa —el navegador solo pinta ese subárbol— y por debajo de su
 * `z-[60]`: un «Finalizar stream» que no hacía nada. La sala compacta sigue la
 * misma regla por lo mismo, así que la usan las dos.
 *
 * El padre debe ser `relative`, `absolute` o `fixed`: se coloca `absolute inset-0`.
 */
export default function InlineConfirm({
  open,
  title,
  message,
  confirmText,
  cancelText = 'Cancelar',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => { if (e.key === 'Escape') onCancelRef.current?.() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-3"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-xs leading-snug text-gray-600">{message}</p>
        <div className="mt-3 flex justify-end gap-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-md bg-white px-4 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
