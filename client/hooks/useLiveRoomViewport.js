'use client'

import { useEffect } from 'react'
import { LIVE_ROOM_KEYBOARD_SHRINK_RATIO } from '@/lib/constants'
import { isChatComposerFocused } from '@/lib/liveRoomFocus'

function orientationKey() {
  return screen.orientation?.type || (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
}

/**
 * Ajusta el contenedor de la sala compacta al área VISIBLE real.
 *
 * `100dvh` absorbe las barras del navegador pero no el teclado: ni Safari ni
 * Chrome para Android (que desde la versión 108 solo redimensiona el viewport
 * visual) encogen el viewport de layout al abrirlo, y el campo del chat quedaba
 * detrás del teclado. `visualViewport` sí lo refleja, arriba o abajo que esté la
 * barra de direcciones.
 *
 * Escribe `--room-h` y `--room-top` directamente sobre el nodo, NUNCA en estado
 * de React: la animación del teclado dispara decenas de eventos y la sala es un
 * árbol grande. Por la misma razón marca `data-keyboard="open"` como atributo,
 * y son las clases `group-data-[keyboard=open]/live-room:*` las que pliegan.
 *
 * Teclado abierto = campo del chat enfocado Y alto visible por debajo de
 * LIVE_ROOM_KEYBOARD_SHRINK_RATIO del máximo observado en la orientación actual.
 *
 * @param {object} params
 * @param {boolean} params.enabled - Disposición compacta activa
 * @param {{ current: HTMLElement | null }} params.ref - Nodo del contenedor
 */
export default function useLiveRoomViewport({ enabled, ref }) {
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    const vv = window.visualViewport
    let frame = 0
    let baseline = 0
    let orientation = orientationKey()

    const apply = () => {
      frame = 0
      const height = vv ? vv.height : window.innerHeight
      const top = vv ? vv.offsetTop : 0

      const currentOrientation = orientationKey()
      if (currentOrientation !== orientation) {
        orientation = currentOrientation
        baseline = 0
      }
      baseline = Math.max(baseline, height)

      el.style.setProperty('--room-h', `${Math.round(height)}px`)
      el.style.setProperty('--room-top', `${Math.round(top)}px`)

      const keyboardOpen = isChatComposerFocused() && height < baseline * LIVE_ROOM_KEYBOARD_SHRINK_RATIO
      if (keyboardOpen) el.setAttribute('data-keyboard', 'open')
      else el.removeAttribute('data-keyboard')
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }

    // Safari puede dejar `scrollY > 0` tras cerrar el teclado incluso con el
    // documento en `overflow: hidden`. El foco se evalúa un tick después: en
    // `focusout` todavía apunta al campo.
    const handleFocusOut = () => {
      setTimeout(() => {
        if (!isChatComposerFocused()) {
          window.scrollTo(0, 0)
          schedule()
        }
      }, 0)
    }

    apply()
    vv?.addEventListener('resize', schedule)
    vv?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv?.removeEventListener('resize', schedule)
      vv?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', handleFocusOut)
      el.style.removeProperty('--room-h')
      el.style.removeProperty('--room-top')
      el.removeAttribute('data-keyboard')
    }
  }, [enabled, ref])
}
