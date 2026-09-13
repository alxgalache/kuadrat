'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { LIVE_ROOM_CHAT_STICK_THRESHOLD_PX } from '@/lib/constants'

/**
 * Autodesplazamiento del chat de la sala en directo, en todos los tamaños.
 *
 * Antes la lista saltaba al final con CADA mensaje nuevo, y en un chat activo
 * eso impedía leer hacia atrás: el dedo o la rueda subían y el siguiente
 * mensaje devolvía la lista abajo. Ahora solo sigue al final si el usuario ya
 * estaba ahí (a LIVE_ROOM_CHAT_STICK_THRESHOLD_PX o menos) o si el mensaje es
 * suyo; en otro caso `hasNew` activa el botón «Mensajes nuevos».
 *
 * Desplaza SOLO el contenedor (`scrollTop`). `scrollIntoView` desplaza también
 * los ancestros, la página incluida: con el documento bloqueado de la sala
 * compacta, ese desplazamiento del viewport visual descoloca el contenedor fijo.
 *
 * @param {object} params
 * @param {Array} params.messages - Lista mostrada, ya filtrada
 * @param {Function} [params.isOwn] - (mensaje) → true si lo ha enviado este cliente
 */
export default function useChatAutoScroll({ messages, isOwn }) {
  const containerRef = useRef(null)
  const stuckRef = useRef(true)
  const countRef = useRef(0)
  const [hasNew, setHasNew] = useState(false)

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
    stuckRef.current = true
    setHasNew(false)
  }, [])

  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stuckRef.current = distance <= LIVE_ROOM_CHAT_STICK_THRESHOLD_PX
    if (stuckRef.current) setHasNew(false)
  }, [])

  // En layout effect: se coloca antes de pintar, sin un fotograma con el
  // mensaje nuevo fuera de la vista. `stuckRef` refleja la posición ANTERIOR al
  // mensaje, que es exactamente la pregunta.
  useLayoutEffect(() => {
    const count = messages.length
    const previous = countRef.current
    countRef.current = count
    if (count === 0 || count <= previous) return

    if (previous === 0 || stuckRef.current || isOwn?.(messages[count - 1])) {
      scrollToBottom()
    } else {
      setHasNew(true)
    }
  }, [messages, isOwn, scrollToBottom])

  // Si la lista encoge (se abre el teclado, gira el móvil) estando al final,
  // debe seguir mostrando el último mensaje.
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (stuckRef.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { containerRef, onScroll, hasNew, scrollToBottom }
}
