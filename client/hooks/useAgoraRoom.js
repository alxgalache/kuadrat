'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import { AGORA_SPEAKING_VOLUME_THRESHOLD } from '@/lib/constants'

// Only imported from components that are themselves dynamic ssr:false
// (agora-rtc-sdk-ng touches window at import time).

// Some external webcams throw NotReadableError ("Could not start video source") on
// the first getUserMedia (transient device contention). Best-effort: retry the same
// device once after a short delay before surfacing the error. Hardware-incompatible
// cameras may still fail (integrated webcams work).
async function createCameraTrackWithRetry(deviceId, encoderConfig) {
  // `encoderConfig` NO es opcional en la práctica: sin él el SDK aplica su
  // defecto `480p_1` (640 × 480), es decir 4:3, y publica casi cuadrado.
  const opts = {}
  if (deviceId) opts.cameraId = deviceId
  if (encoderConfig) opts.encoderConfig = encoderConfig
  try {
    return await AgoraRTC.createCameraVideoTrack(opts)
  } catch (err) {
    if (err?.code !== 'NOT_READABLE' && err?.name !== 'NotReadableError') throw err
    await new Promise((resolve) => setTimeout(resolve, 300))
    return AgoraRTC.createCameraVideoTrack(opts)
  }
}

/**
 * Full Agora RTC lifecycle for an event room.
 *
 * Handles join/leave, local mic/camera/screen publication, remote
 * subscriptions (audio auto-played), the speaking indicator
 * (volume-indicator), token renewal (token-privilege-will-expire),
 * kick detection (UID_BANNED) and blocked-autoplay detection.
 *
 * @param {object} params
 * @param {boolean} params.enabled
 * @param {string} params.appId
 * @param {string} params.channel
 * @param {number} params.uid
 * @param {string} params.rtcToken
 * @param {'host'|'audience'} params.initialRole - Agora client role at join
 * @param {Function} params.renewToken - async () => ({ rtcToken }) fresh token for the CURRENT role
 * @param {Function} [params.onKicked] - connection dropped with reason UID_BANNED
 * @param {string|object} params.cameraEncoderConfig - Perfil de codificación de
 *   la cámara local. Obligatorio en la práctica: sin él el SDK usa `480p_1`
 *   (640 × 480, 4:3) y publica casi cuadrado. Ver AGORA_CAMERA_ENCODER_* en
 *   lib/constants.js.
 */
export default function useAgoraRoom({
  enabled,
  appId,
  channel,
  uid,
  rtcToken,
  initialRole,
  renewToken,
  onKicked,
  cameraEncoderConfig,
}) {
  const clientRef = useRef(null)
  const micTrackRef = useRef(null)
  const camTrackRef = useRef(null)
  const screenTrackRef = useRef(null)
  const cameraWasOnRef = useRef(false)
  const speakerDeviceIdRef = useRef(null)

  const [joined, setJoined] = useState(false)
  const [joinError, setJoinError] = useState(null)
  const [remoteUsers, setRemoteUsers] = useState([])
  const [speakingUids, setSpeakingUids] = useState(() => new Set())
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [micEnabled, setMicEnabled] = useState(false)
  const [camEnabled, setCamEnabled] = useState(false)
  const [screenEnabled, setScreenEnabled] = useState(false)
  // Bumped whenever the camera track object is created or destroyed. camTrackRef
  // is a ref, so nothing re-renders when the track is swapped; consumers that own
  // a resource bound to the track (useAgoraVideoEffect's background processor)
  // reconcile off this counter. Toggling the camera off/on does NOT bump it —
  // the track survives via setEnabled(false).
  const [camTrackVersion, setCamTrackVersion] = useState(0)
  const [clientRole, setClientRole] = useState(initialRole)
  const joinedRef = useRef(false)

  // Publishing before join() resolves throws INVALID_OPERATION deep in the
  // SDK; guard with a typed error so the controls can show a friendly state.
  const assertJoined = useCallback(() => {
    if (!clientRef.current || !joinedRef.current) {
      const err = new Error('Aún no conectado a la sala')
      err.code = 'NOT_JOINED'
      throw err
    }
  }, [])

  const renewTokenRef = useRef(renewToken)
  renewTokenRef.current = renewToken
  const onKickedRef = useRef(onKicked)
  onKickedRef.current = onKicked

  // Serializes mount/unmount cycles: React StrictMode double-mounts effects
  // in dev, and joining while the previous client's leave() is still in
  // flight makes the SDK throw a local UID_CONFLICT (same uid, same page).
  // Each cleanup stores its async teardown here; the next join awaits it.
  const teardownRef = useRef(Promise.resolve())

  // ── Join / leave lifecycle ────────────────────────────────
  useEffect(() => {
    if (!enabled || !appId || !channel || !rtcToken || uid == null) return

    let cancelled = false
    let joinPromise = null
    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' })
    clientRef.current = client

    const syncRemotes = () => {
      if (!cancelled) setRemoteUsers([...client.remoteUsers])
    }

    const handleUserPublished = async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType)
        if (mediaType === 'audio' && user.audioTrack) {
          if (speakerDeviceIdRef.current) {
            user.audioTrack.setPlaybackDevice(speakerDeviceIdRef.current).catch(() => {})
          }
          user.audioTrack.play()
        }
      } catch (err) {
        console.warn('Agora subscribe error:', err)
      }
      syncRemotes()
    }

    AgoraRTC.onAutoplayFailed = () => {
      if (!cancelled) setAutoplayBlocked(true)
    }

    client.on('user-published', handleUserPublished)
    client.on('user-unpublished', syncRemotes)
    client.on('user-joined', syncRemotes)
    client.on('user-left', syncRemotes)

    client.on('volume-indicator', (volumes) => {
      if (cancelled) return
      const speaking = new Set(
        volumes.filter((v) => v.level > AGORA_SPEAKING_VOLUME_THRESHOLD).map((v) => v.uid)
      )
      setSpeakingUids((prev) => {
        if (prev.size === speaking.size && [...speaking].every((id) => prev.has(id))) return prev
        return speaking
      })
    })

    client.on('token-privilege-will-expire', async () => {
      try {
        const data = await renewTokenRef.current?.()
        if (data?.rtcToken) await client.renewToken(data.rtcToken)
      } catch (err) {
        console.warn('Agora token renewal failed:', err)
      }
    })

    client.on('connection-state-change', (curState, prevState, reason) => {
      if (reason === 'UID_BANNED') {
        onKickedRef.current?.()
      }
    })

    const join = async () => {
      // Wait until the previous client of this hook fully left the channel
      // (StrictMode remount) so our uid is free again
      try { await teardownRef.current } catch { /* previous leave failed */ }
      if (cancelled) return
      try {
        await client.setClientRole(initialRole === 'host' ? 'host' : 'audience')
        joinPromise = client.join(appId, channel, rtcToken, uid)
        await joinPromise
        if (!cancelled) {
          joinedRef.current = true
          setClientRole(initialRole)
          setJoined(true)
          setJoinError(null)
          client.enableAudioVolumeIndicator()
          syncRemotes()
        }
      } catch (err) {
        // Our own cleanup aborting a pending join is not an error
        if (cancelled || err?.code === 'OPERATION_ABORTED') return
        console.error('Agora join error:', err)
        setJoinError(
          err?.code === 'UID_CONFLICT'
            ? 'Ya hay una conexión activa con tu usuario (¿otra pestaña abierta?). Cierra las demás pestañas y recarga la página.'
            : 'No se pudo conectar al directo. Comprueba tu conexión y recarga la página.'
        )
      }
    }
    join()

    return () => {
      cancelled = true
      joinedRef.current = false
      AgoraRTC.onAutoplayFailed = () => {}
      client.removeAllListeners()
      const hadCamTrack = !!camTrackRef.current
      for (const ref of [micTrackRef, camTrackRef, screenTrackRef]) {
        try { ref.current?.close() } catch { /* already closed */ }
        ref.current = null
      }
      if (hadCamTrack) setCamTrackVersion((v) => v + 1)
      cameraWasOnRef.current = false
      clientRef.current = null
      // Chain the async teardown (settle any pending join, then leave) so the
      // next mount can await a fully released uid
      teardownRef.current = (async () => {
        try { await joinPromise } catch { /* aborted/failed join */ }
        try { await client.leave() } catch { /* never joined */ }
      })()
      setJoined(false)
      setJoinError(null)
      setRemoteUsers([])
      setSpeakingUids(new Set())
      setMicEnabled(false)
      setCamEnabled(false)
      setScreenEnabled(false)
    }
    // Intentionally NOT keyed on rtcToken: renewals happen via client.renewToken
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, appId, channel, uid])

  // ── Local microphone ──────────────────────────────────────
  const setMicrophoneEnabled = useCallback(async (on, deviceId = null) => {
    const client = clientRef.current
    if (!client) return
    if (on) {
      assertJoined()
      if (!micTrackRef.current) {
        const track = await AgoraRTC.createMicrophoneAudioTrack(
          deviceId ? { microphoneId: deviceId } : undefined
        )
        micTrackRef.current = track
        await client.publish(track)
      } else {
        await micTrackRef.current.setEnabled(true)
      }
      setMicEnabled(true)
    } else {
      if (micTrackRef.current) {
        await micTrackRef.current.setEnabled(false)
      }
      setMicEnabled(false)
    }
  }, [assertJoined])

  // ── Local camera ──────────────────────────────────────────
  const setCameraEnabled = useCallback(async (on, deviceId = null) => {
    const client = clientRef.current
    if (!client) return
    if (on) {
      assertJoined()
      if (!camTrackRef.current) {
        const track = await createCameraTrackWithRetry(deviceId, cameraEncoderConfig)
        camTrackRef.current = track
        setCamTrackVersion((v) => v + 1)
        // While screen sharing, the camera stays unpublished (single video
        // slot; screen has priority — design D7)
        if (!screenTrackRef.current) {
          await client.publish(track)
        }
      } else {
        await camTrackRef.current.setEnabled(true)
      }
      setCamEnabled(true)
    } else {
      if (camTrackRef.current) {
        await camTrackRef.current.setEnabled(false)
      }
      setCamEnabled(false)
    }
  }, [assertJoined, cameraEncoderConfig])

  // ── Screen share (swap with camera on a single client) ────
  const stopScreenShare = useCallback(async () => {
    const client = clientRef.current
    const screenTrack = screenTrackRef.current
    if (!client || !screenTrack) return
    screenTrackRef.current = null
    try {
      await client.unpublish(screenTrack)
    } catch { /* already unpublished */ }
    try { screenTrack.close() } catch { /* already closed */ }
    setScreenEnabled(false)

    // Return to the camera if it was active when sharing started
    if (cameraWasOnRef.current && camTrackRef.current) {
      try {
        await camTrackRef.current.setEnabled(true)
        await client.publish(camTrackRef.current)
        setCamEnabled(true)
      } catch (err) {
        console.warn('Could not restore camera after screen share:', err)
      }
    }
    cameraWasOnRef.current = false
  }, [])

  const startScreenShare = useCallback(async () => {
    const client = clientRef.current
    if (!client || screenTrackRef.current) return
    assertJoined()

    const screenTrack = await AgoraRTC.createScreenVideoTrack({}, 'disable')
    cameraWasOnRef.current = camEnabled

    // Swap: unpublish the camera, publish the screen
    if (camTrackRef.current && camEnabled) {
      try { await client.unpublish(camTrackRef.current) } catch { /* not published */ }
      await camTrackRef.current.setEnabled(false)
      setCamEnabled(false)
    }
    screenTrackRef.current = screenTrack
    await client.publish(screenTrack)
    setScreenEnabled(true)

    // Browser "Stop sharing" button
    screenTrack.on('track-ended', () => {
      stopScreenShare()
    })
  }, [camEnabled, stopScreenShare, assertJoined])

  // ── Role transitions (broadcast promote / demote) ─────────
  const becomeSpeaker = useCallback(async ({ autoEnableMic = false } = {}) => {
    const client = clientRef.current
    if (!client) return
    const data = await renewTokenRef.current?.()
    if (data?.rtcToken) await client.renewToken(data.rtcToken)
    await client.setClientRole('host')
    setClientRole('host')
    if (autoEnableMic) {
      await setMicrophoneEnabled(true)
    }
  }, [setMicrophoneEnabled])

  const becomeAudience = useCallback(async () => {
    const client = clientRef.current
    if (!client) return
    const hadCamTrack = !!camTrackRef.current
    for (const ref of [micTrackRef, camTrackRef, screenTrackRef]) {
      if (ref.current) {
        try { await client.unpublish(ref.current) } catch { /* not published */ }
        try { ref.current.close() } catch { /* already closed */ }
        ref.current = null
      }
    }
    if (hadCamTrack) setCamTrackVersion((v) => v + 1)
    setMicEnabled(false)
    setCamEnabled(false)
    setScreenEnabled(false)
    try {
      const data = await renewTokenRef.current?.()
      if (data?.rtcToken) await client.renewToken(data.rtcToken)
    } catch { /* keep going: role change is what matters */ }
    await client.setClientRole('audience')
    setClientRole('audience')
  }, [])

  // ── Speakers (playback device) for all remote audio ───────
  const setSpeakerDevice = useCallback(async (deviceId) => {
    speakerDeviceIdRef.current = deviceId
    const client = clientRef.current
    if (!client) return
    for (const user of client.remoteUsers) {
      if (user.audioTrack) {
        try { await user.audioTrack.setPlaybackDevice(deviceId) } catch { /* unsupported */ }
      }
    }
  }, [])

  const resumeAudio = useCallback(() => {
    // Any user gesture unblocks the audio context; the SDK resumes on its own
    setAutoplayBlocked(false)
  }, [])

  return {
    joined,
    joinError,
    clientRole,
    remoteUsers,
    speakingUids,
    autoplayBlocked,
    resumeAudio,
    micEnabled,
    camEnabled,
    screenEnabled,
    setMicrophoneEnabled,
    setCameraEnabled,
    startScreenShare,
    stopScreenShare,
    becomeSpeaker,
    becomeAudience,
    setSpeakerDevice,
    // Track refs for self-view rendering and hot device switching
    micTrackRef,
    camTrackRef,
    screenTrackRef,
    // Changes when the camera track object itself is created/destroyed
    camTrackVersion,
  }
}
