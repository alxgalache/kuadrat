'use client'

import { useEffect } from 'react'

/**
 * Efectos de documento de la sala compacta, que existen solo mientras está
 * montada y se deshacen al salir:
 *
 * 1. `data-live-room` en <html>. `globals.css` bloquea con él el scroll y el
 *    sobre-desplazamiento de html y body. Sin eso, en Chrome para Android tirar
 *    hacia abajo recarga la página —expulsa de la sala y a quien emite le corta
 *    la emisión— y la barra de direcciones se retrae y mueve el layout.
 *
 * 2. `viewport-fit=cover` en la etiqueta viewport, para que `env(safe-area-*)`
 *    deje de valer 0 junto a la isla dinámica o el notch. Solo aquí: con
 *    `cover` global, todas las demás páginas se meterían bajo el notch. Se
 *    restaura la cadena ORIGINAL exacta, no una reconstruida.
 *
 *    Se aplica en caliente a propósito (design.md, D6): una navegación de
 *    cliente del App Router también actualiza esta etiqueta en caliente, así
 *    que exportarla desde el segmento no daba más garantías. Si un navegador
 *    ignorase el cambio, el fallo es cosmético: sin `cover` el propio Safari
 *    aparta el contenido de la isla.
 *
 * @param {object} params
 * @param {boolean} params.enabled - Disposición compacta activa
 */
export default function useLiveRoomDocument({ enabled }) {
  useEffect(() => {
    if (!enabled) return

    const html = document.documentElement
    html.setAttribute('data-live-room', '')

    const meta = document.querySelector('meta[name="viewport"]')
    const original = meta?.getAttribute('content') ?? null
    if (meta && original !== null && !/viewport-fit\s*=/.test(original)) {
      meta.setAttribute('content', `${original}, viewport-fit=cover`)
    }

    return () => {
      html.removeAttribute('data-live-room')
      if (meta && original !== null && meta.isConnected) {
        meta.setAttribute('content', original)
      }
    }
  }, [enabled])
}
