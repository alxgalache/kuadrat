'use client'

import { useSyncExternalStore } from 'react'
import { LIVE_ROOM_COMPACT_QUERY, LIVE_ROOM_LANDSCAPE_QUERY } from '@/lib/constants'
import { isChatComposerFocused } from '@/lib/liveRoomFocus'

// Bits del valor compartido: primitivo estable, que es lo que exige
// useSyncExternalStore de getSnapshot (un objeto nuevo en cada lectura
// provocaría un bucle de renders).
const COMPACT = 1
const LANDSCAPE = 2

let snapshot = null
let compactQuery = null
let landscapeQuery = null
const listeners = new Set()

function read() {
  if (typeof window === 'undefined' || !window.matchMedia) return 0
  const compact = window.matchMedia(LIVE_ROOM_COMPACT_QUERY).matches
  const landscape = compact && window.matchMedia(LIVE_ROOM_LANDSCAPE_QUERY).matches
  return (compact ? COMPACT : 0) | (landscape ? LANDSCAPE : 0)
}

function recompute() {
  // Congelado mientras se escribe: los navegadores que redimensionan el
  // viewport de layout con el teclado cambian el resultado de las dos consultas
  // justo al abrirlo, y reordenar la sala bajo los dedos de quien escribe es
  // peor que esperar a que termine.
  if (isChatComposerFocused()) return
  const next = read()
  if (next === snapshot) return
  snapshot = next
  for (const listener of listeners) listener()
}

// `activeElement` aún apunta al campo durante `focusout`: se evalúa un tick
// después, cuando el foco ya ha salido.
function handleFocusOut() {
  setTimeout(recompute, 0)
}

function subscribe(listener) {
  listeners.add(listener)
  if (listeners.size === 1) {
    compactQuery = window.matchMedia(LIVE_ROOM_COMPACT_QUERY)
    landscapeQuery = window.matchMedia(LIVE_ROOM_LANDSCAPE_QUERY)
    compactQuery.addEventListener('change', recompute)
    landscapeQuery.addEventListener('change', recompute)
    document.addEventListener('focusout', handleFocusOut)
    // Sin suscriptores no se escuchaba nada: el valor puede estar viejo.
    // React vuelve a leer getSnapshot tras suscribirse, así que basta con
    // actualizarlo sin notificar.
    snapshot = read()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      compactQuery?.removeEventListener('change', recompute)
      landscapeQuery?.removeEventListener('change', recompute)
      document.removeEventListener('focusout', handleFocusOut)
      compactQuery = null
      landscapeQuery = null
    }
  }
}

function getSnapshot() {
  if (snapshot === null) snapshot = read()
  return snapshot
}

// En el servidor no hay viewport: siempre escritorio. Con useSyncExternalStore
// React usa este valor durante la hidratación y re-renderiza después con el
// real, así que `EventDetail` (renderizado en servidor) nunca discrepa.
function getServerSnapshot() {
  return 0
}

/**
 * Disposición de la sala en directo: `{ compact, landscape }`.
 *
 * Única lectura de LIVE_ROOM_COMPACT_QUERY y LIVE_ROOM_LANDSCAPE_QUERY. Todos
 * los componentes que la usan comparten el mismo valor, también el congelado
 * mientras el campo del chat tiene el foco.
 */
export default function useCompactRoomLayout() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    compact: (value & COMPACT) === COMPACT,
    landscape: (value & LANDSCAPE) === LANDSCAPE,
  }
}
