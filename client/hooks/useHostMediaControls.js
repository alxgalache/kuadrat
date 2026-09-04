'use client'

import { useState, useCallback, useMemo } from 'react'
import { eventsAPI } from '@/lib/api'
import useAgoraDevices from '@/hooks/useAgoraDevices'
import useAgoraVideoEffect from '@/hooks/useAgoraVideoEffect'
import { AGORA_VIDEO_QUALITIES } from '@/lib/constants'

/**
 * Estado y acciones de los controles de host de una sala Agora, en un solo
 * sitio. `AgoraHostControls` (vista completa) y `HostConsole` (consola móvil)
 * son DOS PRESENTACIONES DE ESTE MISMO ESTADO, nunca dos copias de la lógica.
 *
 * Dos razones, y ninguna es estética:
 *
 * 1. Duplicar la lógica crea dos verdades que divergen en silencio. Es el error
 *    que documenta `zoneResolver` y que costó la caída del 16/08/2026.
 * 2. Este hook se instancia UNA SOLA VEZ, por encima del conmutador de modo. Si
 *    cada presentación instanciara el suyo, cambiar de vista destruiría y
 *    recrearía `useAgoraVideoEffect` —reiniciando el procesador de fondos
 *    virtuales, 2,1 MB de WASM— y `useAgoraDevices` volvería a enumerar,
 *    perdiendo la fuente seleccionada en cada cambio.
 *
 * @param {object} params
 * @param {boolean} params.enabled - Solo el host tiene controles. Nunca llamar
 *   al hook condicionalmente: las reglas de los hooks lo prohíben.
 * @param {object} params.room - El objeto de `useAgoraRoom`
 * @param {string} params.eventId
 * @param {string|object} params.cameraEncoderConfig - Perfil 16:9 de la cámara,
 *   reaplicado al cambiar de dispositivo (ver lib/constants.js)
 * @param {object} params.videoQuality - El objeto de `useHostVideoQuality`
 */
export default function useHostMediaControls({ enabled, room, eventId, cameraEncoderConfig, videoQuality }) {
  const [deviceError, setDeviceError] = useState('')
  const [isEnding, setIsEnding] = useState(false)

  const devices = useAgoraDevices({
    enabled,
    micTrackRef: room.micTrackRef,
    camTrackRef: room.camTrackRef,
    setSpeakerDevice: room.setSpeakerDevice,
    micEnabled: room.micEnabled,
    camEnabled: room.camEnabled,
    cameraEncoderConfig,
  })

  const videoEffect = useAgoraVideoEffect({
    camTrackRef: room.camTrackRef,
    camTrackVersion: room.camTrackVersion,
    camEnabled: room.camEnabled,
  })

  const toggleMic = useCallback(async () => {
    setDeviceError('')
    try {
      await room.setMicrophoneEnabled(!room.micEnabled, devices.activeMicId)
    } catch (err) {
      console.warn('Microphone error:', err)
      setDeviceError(err?.code === 'NOT_JOINED' ? 'Conectando a la sala, espera un momento...' : 'No se encontró el micrófono')
    }
  }, [room, devices.activeMicId])

  const toggleCamera = useCallback(async () => {
    setDeviceError('')
    try {
      await room.setCameraEnabled(!room.camEnabled, devices.activeCamId)
    } catch (err) {
      console.warn('Camera error:', err)
      setDeviceError(cameraErrorMessage(err))
    }
  }, [room, devices.activeCamId])

  const toggleScreenShare = useCallback(async () => {
    setDeviceError('')
    try {
      if (room.screenEnabled) {
        await room.stopScreenShare()
      } else {
        await room.startScreenShare()
      }
    } catch (err) {
      console.warn('Screen share error:', err)
      setDeviceError(err?.code === 'NOT_JOINED' ? 'Conectando a la sala, espera un momento...' : 'No se pudo compartir pantalla')
    }
  }, [room])

  const selectDevice = useCallback((kind) => async (device) => {
    try {
      if (kind === 'audioinput') await devices.selectMicrophone(device.deviceId)
      else if (kind === 'videoinput') await devices.selectCamera(device.deviceId)
      else await devices.selectSpeaker(device.deviceId)
    } catch (err) {
      console.warn('Device switch error:', err)
      setDeviceError('Error al cambiar el dispositivo')
    }
  }, [devices])

  // Cambio de calidad en caliente: `setEncoderConfiguration` reconfigura el
  // codificador de la pista ya publicada, así que no hay que republicar y los
  // asistentes no ven ningún corte. Sin cámara encendida no hay nada que
  // reconfigurar — el perfil nuevo se aplicará al crear la pista, porque
  // `cameraEncoderConfig` también deriva de esta misma preferencia.
  const selectVideoQuality = useCallback(async (id) => {
    const level = AGORA_VIDEO_QUALITIES.find((q) => q.id === id)
    if (!level) return
    videoQuality?.setQuality(id)
    const track = room.camTrackRef.current
    if (!track) return
    setDeviceError('')
    try {
      await track.setEncoderConfiguration(level.encoderConfig)
    } catch (err) {
      console.warn('Video quality error:', err)
      setDeviceError('No se pudo cambiar la calidad de vídeo')
    }
  }, [videoQuality, room])

  const endEvent = useCallback(async () => {
    setIsEnding(true)
    try {
      await eventsAPI.endEvent(eventId)
      window.location.reload()
      return true
    } catch (err) {
      console.error('Error ending stream:', err)
      setDeviceError('Error al finalizar el evento')
      setIsEnding(false)
      return false
    }
  }, [eventId])

  // Detección de capacidad compartida por las dos presentaciones, para que
  // ambas decidan igual qué controles puede ofrecer este navegador.
  //
  // `getDisplayMedia` no existe en muchos navegadores móviles y en Chrome para
  // Android su soporte es «dependiente del dispositivo y la versión, no
  // fiable»: por eso además de esta comprobación hay que seguir mostrando el
  // error de la llamada cuando la función existe pero falla.
  const screenShareSupported = useMemo(() => (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  ), [])

  // En Android la salida de audio la gobierna el sistema: `setSinkId` y la
  // enumeración de `audiooutput` son de escritorio, así que la lista llega
  // vacía. No es un fallo de carga y la interfaz debe decirlo, no ocultarlo.
  const speakerSelectionSupported = devices.playbackDevices.length > 0

  return {
    devices,
    videoEffect,
    deviceError,
    setDeviceError,
    isEnding,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    selectDevice,
    endEvent,
    videoQuality: videoQuality?.quality,
    videoQualityLevel: videoQuality?.level,
    selectVideoQuality,
    screenShareSupported,
    speakerSelectionSupported,
  }
}

// Única definición, consumida por este hook y por `MeetingSelfControls`. Un
// track de cámara puede fallar por estar en uso por otra aplicación (algunas
// webcams externas); es distinto de no encontrar el dispositivo.
export function cameraErrorMessage(err) {
  if (err?.code === 'NOT_JOINED') return 'Conectando a la sala, espera un momento...'
  if (err?.code === 'NOT_READABLE' || err?.name === 'NotReadableError') {
    return 'No se pudo iniciar la cámara; puede estar en uso por otra aplicación'
  }
  return 'No se encontró la cámara'
}
