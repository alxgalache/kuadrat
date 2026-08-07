'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  GRID_RESTORE_HISTORY_KEY,
  GRID_RESTORE_MAX_SNAPSHOTS,
  GRID_RESTORE_STORAGE_PREFIX,
  GRID_RESTORE_TTL_MS,
} from '@/lib/constants'

/**
 * Restauración de la posición del scroll en los grids con scroll infinito
 * (galería y tienda, incluidas sus rutas por autor).
 *
 * Al abrir el detalle de un producto se guarda una instantánea
 * ({ pages, productId, scrollY }) asociada a la ENTRADA DEL HISTORIAL del grid:
 * el id de esa entrada vive en `window.history.state` y la instantánea en
 * `sessionStorage`. Volver a esa entrada concreta (atrás/adelante) es lo único
 * que dispara la restauración; entrar al grid desde el menú, desde un enlace
 * externo o cambiando de filtro crea una entrada nueva, sin id previo, y por
 * tanto se comporta como siempre.
 *
 * Todo acceso al almacenamiento y al historial está aislado en try/catch: si
 * algo falla la funcionalidad se desactiva en silencio y el grid funciona con
 * su comportamiento habitual.
 */

function getStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function isValidSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  if (!Number.isInteger(snapshot.pages) || snapshot.pages < 1) return false
  if (!Number.isFinite(snapshot.scrollY)) return false
  if (!Number.isFinite(snapshot.savedAt)) return false
  if (Date.now() - snapshot.savedAt > GRID_RESTORE_TTL_MS) return false
  return true
}

function readSnapshot(storage, id) {
  if (!storage || !id) return null
  try {
    const raw = storage.getItem(GRID_RESTORE_STORAGE_PREFIX + id)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isValidSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

function removeSnapshot(storage, id) {
  if (!storage || !id) return
  try {
    storage.removeItem(GRID_RESTORE_STORAGE_PREFIX + id)
  } catch {
    /* almacenamiento no disponible: nada que limpiar */
  }
}

/**
 * Purga las instantáneas caducadas y recorta las sobrantes, dejando sitio para
 * la que está a punto de escribirse.
 */
function purgeSnapshots(storage) {
  const entries = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (!key || !key.startsWith(GRID_RESTORE_STORAGE_PREFIX)) continue
    let savedAt = 0
    try {
      savedAt = JSON.parse(storage.getItem(key))?.savedAt ?? 0
    } catch {
      savedAt = 0
    }
    entries.push({ key, savedAt })
  }

  const now = Date.now()
  const fresh = []
  entries.forEach((entry) => {
    if (!entry.savedAt || now - entry.savedAt > GRID_RESTORE_TTL_MS) {
      storage.removeItem(entry.key)
    } else {
      fresh.push(entry)
    }
  })

  fresh
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(Math.max(GRID_RESTORE_MAX_SNAPSHOTS - 1, 0))
    .forEach((entry) => storage.removeItem(entry.key))
}

function writeSnapshot(storage, id, snapshot) {
  if (!storage || !id) return
  try {
    purgeSnapshots(storage)
    storage.setItem(GRID_RESTORE_STORAGE_PREFIX + id, JSON.stringify(snapshot))
  } catch {
    /* cuota llena o almacenamiento bloqueado: sin restauración */
  }
}

function readHistoryId() {
  if (typeof window === 'undefined') return null
  try {
    const id = window.history.state?.[GRID_RESTORE_HISTORY_KEY]
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

/**
 * Marca la entrada actual del historial. El estado existente se FUSIONA, nunca
 * se reemplaza: el App Router guarda ahí sus propias claves internas y perderlas
 * rompería su navegación.
 */
function assignHistoryId() {
  if (typeof window === 'undefined') return null
  const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  try {
    window.history.replaceState(
      { ...window.history.state, [GRID_RESTORE_HISTORY_KEY]: id },
      ''
    )
  } catch {
    return null
  }
  return id
}

function escapeAttributeValue(value) {
  const raw = String(value)
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw)
  }
  return raw.replace(/["\\]/g, '\\$&')
}

/**
 * Centra el producto pulsado en pantalla. Si ya no está en el listado (vendido,
 * despublicado o reordenado) se cae al desplazamiento guardado, que es la única
 * referencia que queda.
 */
function scrollToSnapshot(snapshot) {
  if (typeof window === 'undefined') return
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight
  )

  let target = null
  if (snapshot.productId !== null && snapshot.productId !== undefined) {
    const element = document.querySelector(
      `[data-product-id="${escapeAttributeValue(snapshot.productId)}"]`
    )
    if (element) {
      const rect = element.getBoundingClientRect()
      target = rect.top + window.scrollY - (window.innerHeight - rect.height) / 2
    }
  }
  if (target === null) target = snapshot.scrollY

  window.scrollTo({
    top: Math.min(Math.max(target, 0), maxScroll),
    left: 0,
    behavior: 'instant',
  })
}

export function useGridScrollRestoration() {
  const historyIdRef = useRef(null)
  const snapshotRef = useRef(undefined)
  const loadedPagesRef = useRef(1)
  const rafRef = useRef(null)

  // Lectura en el render (no mutación): `useGalleryProducts` necesita la
  // instantánea ya en su efecto de montaje. El primer render devuelve lo mismo
  // con o sin instantánea (la pantalla de carga), así que no hay desajuste de
  // hidratación.
  if (snapshotRef.current === undefined) {
    const id = readHistoryId()
    historyIdRef.current = id
    snapshotRef.current = id ? readSnapshot(getStorage(), id) : null
  }

  // El borrado va en un efecto, no en el render: el doble render de StrictMode
  // en desarrollo consumiría la instantánea antes de que llegue a usarse.
  useEffect(() => {
    if (historyIdRef.current) {
      if (snapshotRef.current) removeSnapshot(getStorage(), historyIdRef.current)
    } else {
      historyIdRef.current = assignHistoryId()
    }
  }, [])

  useEffect(() => () => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
  }, [])

  const setLoadedPages = useCallback((pages) => {
    if (Number.isInteger(pages) && pages > 0) loadedPagesRef.current = pages
  }, [])

  const onProductOpen = useCallback((productId, event) => {
    // Abrir en pestaña nueva no cambia la página actual: marcar la entrada
    // dejaría armada una restauración para una navegación que no ocurre.
    if (
      event &&
      (event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey)
    ) {
      return
    }

    const storage = getStorage()
    if (!storage) return

    if (!historyIdRef.current) historyIdRef.current = assignHistoryId()
    if (!historyIdRef.current) return

    writeSnapshot(storage, historyIdRef.current, {
      pages: loadedPagesRef.current,
      productId,
      scrollY: window.scrollY,
      savedAt: Date.now(),
    })
  }, [])

  const applyRestore = useCallback(() => {
    const snapshot = snapshotRef.current
    if (!snapshot) return
    scrollToSnapshot(snapshot)
    // Segunda pasada idempotente para absorber cualquier reflow tardío
    // (barra lateral de autores, fuentes) sin depender de las imágenes, cuya
    // altura ya está reservada por la tarjeta.
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      scrollToSnapshot(snapshot)
    })
  }, [])

  return useMemo(
    () => ({
      snapshot: snapshotRef.current,
      setLoadedPages,
      onProductOpen,
      applyRestore,
    }),
    [setLoadedPages, onProductOpen, applyRestore]
  )
}
