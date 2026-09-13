'use client'

import { useRef, useState } from 'react'
import { PaperAirplaneIcon } from '@heroicons/react/20/solid'
import { LIVE_ROOM_COPY } from '@/lib/constants'

// Salvo en compacto, con el ratón: evitar que el botón robe el foco es lo que
// mantiene el teclado virtual abierto tras enviar. Se previenen los dos eventos
// porque iOS decide el desenfoque en el `mousedown` de compatibilidad.
const keepFocus = (e) => e.preventDefault()

/**
 * Campo de escribir del chat de la sala en directo (salas Agora y pases de
 * vídeo; la sala LiveKit conserva el suyo).
 *
 * En compacto:
 * - 16 px: Safari para iOS amplía la página al enfocar un campo de menos, y la
 *   ampliación persiste tras perder el foco, desencajando el contenedor fijo.
 * - Enviar no quita el foco al campo, así que el teclado sigue abierto.
 * - Margen inferior de área segura, salvo con el teclado abierto (ahí el
 *   indicador de inicio queda detrás del teclado y el margen sería un hueco).
 *
 * `data-chat-composer` es la marca que leen useCompactRoomLayout y
 * useLiveRoomViewport (lib/liveRoomFocus.js).
 *
 * @param {object} props
 * @param {Function} props.onSend - (texto) → enviar
 * @param {boolean} [props.compact=false]
 * @param {boolean} [props.banned=false] - Expulsado del chat: aviso en lugar del campo
 * @param {boolean} [props.busy=false] - Envío en curso
 */
export default function ChatComposer({ onSend, compact = false, banned = false, busy = false }) {
  const [message, setMessage] = useState('')
  const inputRef = useRef(null)

  if (banned) {
    return (
      <div
        data-chat-composer
        className={`border-t border-gray-200 px-4 py-3 ${compact ? 'pb-[max(0.75rem,env(safe-area-inset-bottom))]' : ''}`}
      >
        <p className="text-xs text-center text-red-600 font-medium">{LIVE_ROOM_COPY.chatBanned}</p>
      </div>
    )
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const text = message.trim()
    if (!text || busy) return
    onSend(text)
    setMessage('')
    // Si aun así el navegador desenfocó el campo, recuperarlo dentro del mismo
    // gesto del usuario es lo único que permite a iOS mantener el teclado.
    if (compact && document.activeElement !== inputRef.current) inputRef.current?.focus()
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-chat-composer
      className={compact
        ? 'flex flex-shrink-0 items-center gap-x-2 border-t border-gray-200 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] group-data-[keyboard=open]/live-room:pb-2'
        : 'border-t border-gray-200 px-4 py-3 flex gap-2'}
    >
      <input
        ref={inputRef}
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={LIVE_ROOM_COPY.placeholder}
        aria-label={LIVE_ROOM_COPY.messageLabel}
        enterKeyHint="send"
        autoComplete="off"
        maxLength={2000}
        className={`min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm ${compact ? 'text-base' : 'text-sm'}`}
      />
      {compact ? (
        <button
          type="submit"
          disabled={!message.trim() || busy}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          aria-label={LIVE_ROOM_COPY.send}
          className="flex size-11 flex-shrink-0 items-center justify-center rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 [touch-action:manipulation]"
        >
          <PaperAirplaneIcon aria-hidden="true" className="size-5" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!message.trim() || busy}
          className="flex-shrink-0 inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {LIVE_ROOM_COPY.send}
        </button>
      )}
    </form>
  )
}
