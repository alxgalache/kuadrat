'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'

/**
 * Device enumeration + hot switching for the Agora room controls.
 * Mirrors the behavior of LiveKit's useMediaDeviceSelect for the three kinds:
 * microphones (track.setDevice), cameras (track.setDevice) and speakers
 * (applied to every remote audio track via useAgoraRoom.setSpeakerDevice).
 * Hot-plug is covered by the AgoraRTC.on*Changed callbacks.
 *
 * @param {object} params
 * @param {boolean} params.enabled - Enumerate only once inside the room
 * @param {object} params.micTrackRef - From useAgoraRoom
 * @param {object} params.camTrackRef - From useAgoraRoom
 * @param {Function} params.setSpeakerDevice - From useAgoraRoom
 */
export default function useAgoraDevices({ enabled, micTrackRef, camTrackRef, setSpeakerDevice, micEnabled = false, camEnabled = false }) {
  const [microphones, setMicrophones] = useState([])
  const [cameras, setCameras] = useState([])
  const [playbackDevices, setPlaybackDevices] = useState([])
  const [activeMicId, setActiveMicId] = useState(null)
  const [activeCamId, setActiveCamId] = useState(null)
  const [activeSpeakerId, setActiveSpeakerId] = useState(null)

  const setSpeakerDeviceRef = useRef(setSpeakerDevice)
  setSpeakerDeviceRef.current = setSpeakerDevice

  const refreshDevices = useCallback(async () => {
    try {
      // skipPermissionCheck: true → never trigger a getUserMedia permission probe on
      // enumeration. That probe is what threw AbortError on room entry with some
      // webcams. Labels appear once a track grants permission (see the effect below).
      const [mics, cams, speakers] = await Promise.all([
        AgoraRTC.getMicrophones(true).catch(() => []),
        AgoraRTC.getCameras(true).catch(() => []),
        AgoraRTC.getPlaybackDevices(true).catch(() => []),
      ])
      setMicrophones(mics)
      setCameras(cams)
      setPlaybackDevices(speakers)
      setActiveMicId((prev) => prev || mics[0]?.deviceId || null)
      setActiveCamId((prev) => prev || cams[0]?.deviceId || null)
      setActiveSpeakerId((prev) => prev || speakers[0]?.deviceId || null)
    } catch (err) {
      console.warn('Agora device enumeration error:', err)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    refreshDevices()

    // Hot-plug: refresh lists and fall back when the active device disappears
    AgoraRTC.onMicrophoneChanged = () => refreshDevices()
    AgoraRTC.onCameraChanged = () => refreshDevices()
    AgoraRTC.onPlaybackDeviceChanged = () => refreshDevices()

    return () => {
      AgoraRTC.onMicrophoneChanged = undefined
      AgoraRTC.onCameraChanged = undefined
      AgoraRTC.onPlaybackDeviceChanged = undefined
    }
  }, [enabled, refreshDevices])

  // Once the user turns on the mic/camera, media permission is granted → re-enumerate
  // to reveal the real device labels (still without triggering a permission probe).
  useEffect(() => {
    if (enabled && (micEnabled || camEnabled)) refreshDevices()
  }, [enabled, micEnabled, camEnabled, refreshDevices])

  const selectMicrophone = useCallback(async (deviceId) => {
    setActiveMicId(deviceId)
    if (micTrackRef?.current) {
      await micTrackRef.current.setDevice(deviceId)
    }
  }, [micTrackRef])

  const selectCamera = useCallback(async (deviceId) => {
    setActiveCamId(deviceId)
    if (camTrackRef?.current) {
      await camTrackRef.current.setDevice(deviceId)
    }
  }, [camTrackRef])

  const selectSpeaker = useCallback(async (deviceId) => {
    setActiveSpeakerId(deviceId)
    await setSpeakerDeviceRef.current?.(deviceId)
  }, [])

  return {
    microphones,
    cameras,
    playbackDevices,
    activeMicId,
    activeCamId,
    activeSpeakerId,
    selectMicrophone,
    selectCamera,
    selectSpeaker,
  }
}
