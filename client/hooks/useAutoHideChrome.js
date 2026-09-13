'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { LIVE_ROOM_CHROME_HIDE_MS } from '@/lib/constants'

/**
 * Controles superpuestos que se ocultan solos: los de la escena en horizontal y
 * la barra del reproductor de vídeo en pantallas táctiles.
 *
 * Visibles al empezar; se ocultan tras LIVE_ROOM_CHROME_HIDE_MS sin interacción.
 * `reveal` los muestra y reinicia la cuenta; `toggle` es el toque sobre la
 * escena. Con `pinned` no se ocultan nunca (la pizarra en escena: ahí un toque
 * pertenece al lienzo). Con `enabled` falso se comportan como siempre visibles.
 *
 * @param {object} [params]
 * @param {boolean} [params.enabled=true]
 * @param {boolean} [params.pinned=false]
 */
export default function useAutoHideChrome({ enabled = true, pinned = false } = {}) {
  const [visible, setVisible] = useState(true)
  const visibleRef = useRef(true)
  const timerRef = useRef(null)
  const active = enabled && !pinned

  const setShown = useCallback((next) => {
    visibleRef.current = next
    setVisible(next)
  }, [])

  const startTimer = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setShown(false), LIVE_ROOM_CHROME_HIDE_MS)
  }, [setShown])

  useEffect(() => {
    if (!active) {
      clearTimeout(timerRef.current)
      setShown(true)
      return
    }
    startTimer()
    return () => clearTimeout(timerRef.current)
  }, [active, startTimer, setShown])

  const reveal = useCallback(() => {
    setShown(true)
    if (active) startTimer()
  }, [active, startTimer, setShown])

  const toggle = useCallback(() => {
    if (!active) return
    if (visibleRef.current) {
      clearTimeout(timerRef.current)
      setShown(false)
    } else {
      reveal()
    }
  }, [active, reveal, setShown])

  return { visible: !active || visible, reveal, toggle }
}
