'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import {
  AGORA_VIDEO_EFFECT_STORAGE_KEY,
  AGORA_BLUR_DEGREE_SOFT,
  AGORA_BLUR_DEGREE_STRONG,
  AGORA_BACKGROUNDS_BASE_PATH,
} from '@/lib/constants'
import { isKnownBackground } from '@/lib/virtualBackgrounds'

// Only imported from components that are themselves dynamic ssr:false
// (agora-rtc-sdk-ng touches window at import time), so window is always available.

export const EFFECT_NONE = { type: 'none' }

// ── Lazy module loading ─────────────────────────────────────
// The extension bundle is ~2.1MB (the WASM travels base64-embedded inside it, so
// nothing is fetched from a CDN). It is imported on demand and cached here for the
// rest of the page's life. AgoraRTC.registerExtensions must run exactly once.
let extensionPromise = null

function loadExtension() {
  if (!extensionPromise) {
    extensionPromise = import('agora-extension-virtual-background')
      .then((mod) => {
        const VirtualBackgroundExtension = mod.default || mod
        const extension = new VirtualBackgroundExtension()
        AgoraRTC.registerExtensions([extension])
        return extension
      })
      .catch((err) => {
        // Do not cache the failure: let a later attempt retry the download
        extensionPromise = null
        throw err
      })
  }
  return extensionPromise
}

// ── Device gate ─────────────────────────────────────────────
// Agora explicitly advises against virtual background on mobile browsers. Detection
// is best-effort and dependency-free: UA-CH where available (Chromium), otherwise
// touch-only pointers (a desktop touchscreen also reports a fine pointer, so it is
// correctly treated as desktop; tablets are treated as mobile, which is intended).
function isMobileDevice() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  if (typeof navigator.userAgentData?.mobile === 'boolean') return navigator.userAgentData.mobile
  if (typeof window.matchMedia !== 'function') return false
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(any-pointer: fine)').matches
  )
}

// ── Persistence ─────────────────────────────────────────────
function readStoredEffect() {
  try {
    const raw = window.localStorage.getItem(AGORA_VIDEO_EFFECT_STORAGE_KEY)
    if (!raw) return EFFECT_NONE
    const parsed = JSON.parse(raw)
    if (parsed?.type === 'blur') {
      return {
        type: 'blur',
        blurDegree:
          parsed.blurDegree === AGORA_BLUR_DEGREE_STRONG
            ? AGORA_BLUR_DEGREE_STRONG
            : AGORA_BLUR_DEGREE_SOFT,
      }
    }
    // A background dropped from the manifest degrades to "none" instead of failing
    if (parsed?.type === 'img' && isKnownBackground(parsed.file)) {
      return { type: 'img', file: parsed.file }
    }
    return EFFECT_NONE
  } catch {
    // Unavailable storage (private mode) or corrupt value
    return EFFECT_NONE
  }
}

function writeStoredEffect(effect) {
  try {
    window.localStorage.setItem(AGORA_VIDEO_EFFECT_STORAGE_KEY, JSON.stringify(effect))
  } catch {
    /* storage unavailable: the effect still applies for this session */
  }
}

export function isSameEffect(a, b) {
  if (!a || !b || a.type !== b.type) return false
  if (a.type === 'blur') return a.blurDegree === b.blurDegree
  if (a.type === 'img') return a.file === b.file
  return true
}

/**
 * Background effects (blur / image) over the local camera in Agora rooms.
 *
 * Mounted from the two surfaces that own a camera control — AgoraHostControls
 * (host in broadcast and meeting) and MeetingSelfControls (meeting attendees) —
 * mirroring how useAgoraDevices is used. Both are stable mounts.
 *
 * The processor is a stateful resource bound to the camera track, which useAgoraRoom
 * keeps in a ref: reconciliation is driven by `camTrackVersion`, which changes only
 * when the track object is created or destroyed.
 *
 * @param {object} params
 * @param {object} params.camTrackRef - From useAgoraRoom
 * @param {number} params.camTrackVersion - From useAgoraRoom
 * @param {boolean} params.camEnabled - From useAgoraRoom
 */
export default function useAgoraVideoEffect({ camTrackRef, camTrackVersion, camEnabled }) {
  // Resolved once, synchronously: on mobile the control is never rendered, so the
  // module is never even considered.
  const supported = useMemo(() => !isMobileDevice(), [])

  const [effect, setEffect] = useState(EFFECT_NONE)
  const [status, setStatus] = useState('idle') // idle | loading | ready | unsupported | error
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState('')

  const processorRef = useRef(null)
  const pipedTrackRef = useRef(null)
  const imageCacheRef = useRef(new Map())
  const mountedRef = useRef(true)
  const loadedRef = useRef(false)

  // Serializes processor work: fast clicks and a track swap landing mid-apply must
  // not interleave init/pipe/enable calls (same pattern as useAgoraRoom's teardown
  // chain). The stored promise never rejects, so the chain never stalls.
  const queueRef = useRef(Promise.resolve())
  const enqueue = useCallback((fn) => {
    const result = queueRef.current.then(() => fn())
    queueRef.current = result.catch(() => {})
    return result
  }, [])

  // Restore the persisted preference once, on the client
  useEffect(() => {
    if (!supported) return
    const stored = readStoredEffect()
    if (stored.type !== 'none') setEffect(stored)
  }, [supported])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const releaseProcessor = useCallback(async () => {
    const processor = processorRef.current
    const piped = pipedTrackRef.current
    processorRef.current = null
    pipedTrackRef.current = null
    if (!processor) return
    processor.onoverload = undefined
    // The track may already be closed (becomeAudience / room teardown close it
    // before this runs): unpipe is best-effort, release is what frees the WASM.
    try { piped?.unpipe?.() } catch { /* track already closed */ }
    try { await processor.release() } catch { /* already released */ }
  }, [])

  const loadBackgroundImage = useCallback(async (file) => {
    const cached = imageCacheRef.current.get(file)
    if (cached) return cached
    const img = new Image()
    // Original file, NOT the next/image optimized URL: setOptions needs a raw
    // HTMLImageElement. Same origin, so no crossOrigin needed.
    img.src = `${AGORA_BACKGROUNDS_BASE_PATH}${file}`
    await img.decode() // rejects on 404 or decode failure
    imageCacheRef.current.set(file, img)
    return img
  }, [])

  const handleOverload = useCallback(() => {
    // The machine cannot keep up. Drop the effect rather than let the video freeze,
    // but keep the stored preference: a one-off overload should not cost the user
    // their choice in the next room.
    enqueue(async () => {
      try { await processorRef.current?.disable() } catch { /* already off */ }
    })
    if (!mountedRef.current) return
    setEffect(EFFECT_NONE)
    setMessage('Tu equipo no puede con el efecto de fondo y se ha desactivado.')
  }, [enqueue])

  // Ensures the extension is downloaded and compatible. Returns the extension, or
  // null when it is unusable (state already reflected in `status`).
  // Kept dependency-free (readiness tracked in a ref, not in `status`) so that
  // applyEffect stays stable: reading `status` here would make an unrelated camera
  // toggle flick an open panel back to its loading state.
  const ensureExtension = useCallback(async () => {
    if (!loadedRef.current) setStatus('loading')
    try {
      const extension = await loadExtension()
      if (!extension.checkCompatibility()) {
        if (mountedRef.current) setStatus('unsupported')
        return null
      }
      loadedRef.current = true
      if (mountedRef.current) setStatus('ready')
      return extension
    } catch (err) {
      console.warn('Virtual background extension failed to load:', err)
      if (mountedRef.current) setStatus('error')
      return null
    }
  }, [])

  // Applies `next` to the current camera track, creating and piping the processor
  // on first use. Always setOptions BEFORE enable: enabling cold makes the SDK fall
  // back to blur degree 1, which is not what the user picked.
  const applyEffect = useCallback(async (next) => {
    const track = camTrackRef?.current
    if (!track) return

    const extension = await ensureExtension()
    if (!extension) return

    if (!processorRef.current) {
      const processor = extension.createProcessor()
      await processor.init()
      processor.onoverload = handleOverload
      processorRef.current = processor
    }
    const processor = processorRef.current

    if (pipedTrackRef.current !== track) {
      try { pipedTrackRef.current?.unpipe?.() } catch { /* previous track closed */ }
      track.pipe(processor).pipe(track.processorDestination)
      pipedTrackRef.current = track
    }

    if (next.type === 'none') {
      await processor.disable()
      return
    }
    if (next.type === 'blur') {
      processor.setOptions({ type: 'blur', blurDegree: next.blurDegree })
    } else {
      const source = await loadBackgroundImage(next.file)
      processor.setOptions({ type: 'img', source, fit: 'cover' })
    }
    await processor.enable()
  }, [camTrackRef, ensureExtension, handleOverload, loadBackgroundImage])

  // ── Reconciliation ────────────────────────────────────────
  // Runs on: effect selection, camera on/off, and camera track create/destroy.
  // Applying an effect requires downloading the extension, so this deliberately
  // stays inert while the effect is "none" and no processor exists — that is the
  // path of a user who never touched the feature, and it must not fetch 2.1MB.
  // A user with a stored effect has used the feature before, so auto-reapplying it
  // (and downloading the module) is what they asked for.
  useEffect(() => {
    if (!supported) return
    if (effect.type === 'none' && !processorRef.current) return

    const track = camTrackRef?.current
    if (!track) {
      // Track destroyed (becomeAudience / left the room): drop the processor
      if (processorRef.current) enqueue(releaseProcessor)
      return
    }
    if (!camEnabled) return

    setApplying(true)
    enqueue(() => applyEffect(effect))
      // No success handler clearing `message`: falling back to "none" after a
      // failure re-runs this effect, and a success here would wipe the warning
      // before the user reads it. Messages are cleared on the next selection.
      .catch((err) => {
        console.warn('Virtual background error:', err)
        if (!mountedRef.current) return
        setMessage(
          effect.type === 'img'
            ? 'No se pudo cargar el fondo elegido.'
            : 'No se pudo aplicar el efecto de fondo.'
        )
        setEffect(EFFECT_NONE)
      })
      .finally(() => {
        if (mountedRef.current) setApplying(false)
      })
    // camTrackVersion is the signal that the track object itself changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, effect, camEnabled, camTrackVersion])

  // Release on unmount (leaving the room)
  useEffect(() => {
    return () => { enqueue(releaseProcessor) }
  }, [enqueue, releaseProcessor])

  // Called when the panel opens: starts the download so the list can render
  const ensureLoaded = useCallback(() => {
    if (!supported || status === 'ready' || status === 'unsupported') return
    ensureExtension()
  }, [supported, status, ensureExtension])

  const selectEffect = useCallback((next) => {
    setMessage('')
    setEffect(next)
    writeStoredEffect(next)
  }, [])

  return {
    supported,
    status,
    effect,
    applying,
    message,
    ensureLoaded,
    selectEffect,
  }
}
