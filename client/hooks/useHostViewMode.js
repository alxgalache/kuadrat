'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { HOST_VIEW_MODES, HOST_VIEW_MODE_STORAGE_KEY } from '@/lib/constants'

const VALID_MODES = new Set(Object.values(HOST_VIEW_MODES))

/**
 * Modo de vista del host: completa | consola | solo vídeo.
 *
 * Además del estado, gobierna la pantalla completa nativa y el bloqueo de
 * orientación, que es la respuesta real al problema de la barra de direcciones
 * de Chrome en Android: no existe ninguna API para ocultarla en una pestaña
 * normal, pero la pantalla completa de elemento sí funciona ahí.
 *
 * @param {object} params
 * @param {boolean} params.available - El evento habilita los modos y quien mira es el host
 * @param {boolean} params.eventEnded
 */
export default function useHostViewMode({ available, eventEnded }) {
  const [mode, setMode] = useState(HOST_VIEW_MODES.FULL)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const shellRef = useRef(null)

  // Restauración de la preferencia DESDE UN EFECTO, nunca desde el
  // inicializador de useState: es la propiedad que permite renderizar esto en
  // el servidor sin discrepancias de hidratación.
  useEffect(() => {
    if (!available) return
    try {
      const stored = localStorage.getItem(HOST_VIEW_MODE_STORAGE_KEY)
      if (stored && VALID_MODES.has(stored)) setMode(stored)
    } catch { /* almacenamiento no disponible: se abre en vista completa */ }
  }, [available])

  // El evento termina: volver a la vista completa para que el estado de
  // finalizado sea visible (la superposición lo taparía).
  useEffect(() => {
    if (eventEnded) setMode(HOST_VIEW_MODES.FULL)
  }, [eventEnded])

  // Si el evento deja de habilitar los modos, no dejar al host encerrado.
  useEffect(() => {
    if (!available) setMode(HOST_VIEW_MODES.FULL)
  }, [available])

  const isOverlay = available && mode !== HOST_VIEW_MODES.FULL

  const enterFullscreen = useCallback(async () => {
    const el = shellRef.current
    if (!el?.requestFullscreen) return
    try {
      await el.requestFullscreen()
      // El bloqueo de orientación solo se concede DENTRO de pantalla completa en
      // Android, así que va después de que la promesa anterior se resuelva.
      // Ambos son mejoras progresivas: su fallo se ignora.
      await screen.orientation?.lock?.('landscape')
    } catch { /* denegado, no soportado, o el dispositivo lo ignora */ }
  }, [])

  const exitFullscreen = useCallback(() => {
    try { screen.orientation?.unlock?.() } catch { /* no soportado */ }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { /* ya fuera */ })
    }
  }, [])

  // Al entrar en un modo de superposición se pide pantalla completa; al volver
  // a la vista completa se sale y se libera la orientación.
  useEffect(() => {
    if (isOverlay) {
      enterFullscreen()
      return
    }
    exitFullscreen()
  }, [isOverlay, enterFullscreen, exitFullscreen])

  // Salir del modo al desmontar (navegar fuera con la consola abierta).
  useEffect(() => () => { exitFullscreen() }, [exitFullscreen])

  // DIVERGENCIA DELIBERADA respecto a TheaterShell, que cierra su vista cuando
  // cambia `fullscreenchange`: aquí eso expulsaría al operador de su consola en
  // mitad de una retransmisión por un gesto accidental del sistema. Solo se
  // sincroniza el estado del botón para volver a entrar; el modo NO cambia.
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const selectMode = useCallback((next) => {
    if (!VALID_MODES.has(next)) return
    setMode(next)
    try {
      localStorage.setItem(HOST_VIEW_MODE_STORAGE_KEY, next)
    } catch { /* almacenamiento no disponible: la preferencia no persiste */ }
  }, [])

  return {
    mode: available ? mode : HOST_VIEW_MODES.FULL,
    selectMode,
    isOverlay,
    isFullscreen,
    enterFullscreen,
    shellRef,
  }
}
