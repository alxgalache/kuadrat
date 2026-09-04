'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AGORA_VIDEO_QUALITIES,
  AGORA_VIDEO_QUALITY_DEFAULT,
  AGORA_VIDEO_QUALITY_STORAGE_KEY,
} from '@/lib/constants'

/**
 * Calidad de emisión elegida por el host (alta | media | baja).
 *
 * Solo guarda la preferencia y deriva el perfil de codificación: aplicarla en
 * caliente sobre la pista es cosa de `useHostMediaControls`, que es quien tiene
 * la sala. Esa separación existe porque el perfil hace falta ANTES de que la
 * sala exista —`useAgoraRoom` lo necesita para crear la pista de cámara— y
 * pedirle aquí la referencia a la pista sería una dependencia circular.
 *
 * La preferencia se lee DESDE UN EFECTO, nunca desde el inicializador de
 * `useState`: es la regla que mantiene el árbol libre de discrepancias de
 * hidratación.
 *
 * @param {object} params
 * @param {boolean} params.enabled - Solo el host elige calidad
 */
export default function useHostVideoQuality({ enabled }) {
  const [quality, setQualityState] = useState(AGORA_VIDEO_QUALITY_DEFAULT)

  useEffect(() => {
    if (!enabled) return
    try {
      const stored = localStorage.getItem(AGORA_VIDEO_QUALITY_STORAGE_KEY)
      if (stored && AGORA_VIDEO_QUALITIES.some((q) => q.id === stored)) {
        setQualityState(stored)
      }
    } catch { /* almacenamiento no disponible: se queda en el defecto */ }
  }, [enabled])

  const setQuality = useCallback((id) => {
    if (!AGORA_VIDEO_QUALITIES.some((q) => q.id === id)) return
    setQualityState(id)
    try {
      localStorage.setItem(AGORA_VIDEO_QUALITY_STORAGE_KEY, id)
    } catch { /* la preferencia no persiste, pero la sesión sí la usa */ }
  }, [])

  const level = useMemo(
    () => AGORA_VIDEO_QUALITIES.find((q) => q.id === quality) || AGORA_VIDEO_QUALITIES[1],
    [quality]
  )

  return { quality, level, encoderConfig: level.encoderConfig, setQuality }
}
