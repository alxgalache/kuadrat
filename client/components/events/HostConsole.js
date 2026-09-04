'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import MobileDevicePicker from '@/components/events/MobileDevicePicker'
import { HOST_CONSOLE_COPY, HOST_VIEW_MODES, HOST_VIEW_MODE_LABELS } from '@/lib/constants'

const MIC_LEVEL_POLL_MS = 100

/**
 * Consola de operación del host para móvil en horizontal.
 *
 * Presupuesto de diseño: debe caber entero, sin scroll de página, en 900 × 300
 * px CSS —lo que deja Chrome en un Pixel 9 Pro horizontal con la barra de
 * direcciones visible— y seguir siendo usable en 640 × 280.
 *
 * Prioriza los CONTROLES sobre el vídeo (el encuadre se ajusta antes de
 * empezar): vídeo al ~40 % del ancho, tarjetas táctiles de ≥48 px en el resto.
 * A la inversa, en una pantalla de 640 px las tarjetas caerían a ~40 px de alto
 * justo en el dispositivo más difícil.
 *
 * Es una PRESENTACIÓN de `useHostMediaControls`, no una segunda copia de la
 * lógica: recibe el mismo objeto que consume `AgoraHostControls`.
 */
export default function HostConsole({
  room,
  hostControls,
  connectedCount,
  videoElement,
  modeSwitcher,
}) {
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [picker, setPicker] = useState(null) // 'audioinput' | 'videoinput' | 'audiooutput'

  const {
    devices, deviceError, isEnding,
    toggleMic, toggleCamera, toggleScreenShare, selectDevice, endEvent,
    screenShareSupported, speakerSelectionSupported,
  } = hostControls

  const handleEndStream = async () => {
    const ok = await endEvent()
    if (!ok) setShowEndConfirm(false)
  }

  const handlePick = useCallback((kind) => async (device) => {
    await selectDevice(kind)(device)
    setPicker(null)
  }, [selectDevice])

  const pickerConfig = {
    audioinput: { title: HOST_CONSOLE_COPY.mic, devices: devices.microphones, activeId: devices.activeMicId },
    videoinput: { title: HOST_CONSOLE_COPY.camera, devices: devices.cameras, activeId: devices.activeCamId },
    audiooutput: { title: HOST_CONSOLE_COPY.speaker, devices: devices.playbackDevices, activeId: devices.activeSpeakerId },
  }[picker]

  return (
    <div className="relative flex h-full w-full flex-col bg-gray-900 text-white">
      {/* Cabecera */}
      <div className="flex flex-shrink-0 items-center justify-between gap-x-3 px-3 py-2">
        <div className="flex min-w-0 items-center gap-x-2">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
          <span className="text-xs font-semibold tracking-wide">{HOST_CONSOLE_COPY.live}</span>
          <span className="truncate text-xs text-gray-400">
            · {HOST_CONSOLE_COPY.connected(connectedCount)}
          </span>
        </div>
        {modeSwitcher}
      </div>

      {/* Cuerpo: vídeo a la izquierda, tarjetas a la derecha */}
      <div className="flex min-h-0 flex-1 gap-x-3 px-3">
        <div className="flex w-[40%] max-w-[46%] flex-shrink-0 flex-col gap-y-2">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-black">
            {videoElement}
          </div>
          <MicLevelMeter room={room} />
        </div>

        {/* Único elemento con scroll: si el alto no llega, se desplazan las
            tarjetas, nunca la cabecera, el vídeo ni «Finalizar stream». */}
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto">
          <ControlCard
            label={HOST_CONSOLE_COPY.mic}
            active={room.micEnabled}
            onToggle={toggleMic}
            onPickSource={() => setPicker('audioinput')}
          />
          <ControlCard
            label={HOST_CONSOLE_COPY.camera}
            active={room.camEnabled}
            onToggle={toggleCamera}
            onPickSource={() => setPicker('videoinput')}
          />
          <ControlCard
            label={HOST_CONSOLE_COPY.speaker}
            // En Android no hay selección de salida: la tarjeta se muestra
            // deshabilitada explicándolo, nunca oculta — un hueco vacío se lee
            // como un fallo de carga.
            disabled={!speakerSelectionSupported}
            disabledReason={HOST_CONSOLE_COPY.speakerUnsupported}
            onPickSource={() => setPicker('audiooutput')}
          />
          <ControlCard
            label={HOST_CONSOLE_COPY.screen}
            active={room.screenEnabled}
            // getDisplayMedia no existe en la mayoría de navegadores móviles y
            // en Chrome para Android no es fiable. Si existe pero falla, el
            // error llega por `deviceError` y se pinta abajo.
            disabled={!screenShareSupported}
            disabledReason={HOST_CONSOLE_COPY.screenUnsupported}
            onToggle={toggleScreenShare}
          />
        </div>
      </div>

      {/* Pie: error y finalizar, separado de las tarjetas */}
      <div className="flex flex-shrink-0 items-center justify-between gap-x-3 px-3 py-2">
        <span className="min-w-0 truncate text-xs text-red-400">{deviceError}</span>
        <button
          type="button"
          onClick={() => setShowEndConfirm(true)}
          className="min-h-11 flex-shrink-0 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500"
        >
          {HOST_CONSOLE_COPY.endStream}
        </button>
      </div>

      <MobileDevicePicker
        open={!!picker}
        title={pickerConfig?.title || ''}
        devices={pickerConfig?.devices || []}
        activeDeviceId={pickerConfig?.activeId || null}
        onSelect={picker ? handlePick(picker) : () => {}}
        onClose={() => setPicker(null)}
      />

      <ConfirmDialog
        open={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={handleEndStream}
        title={HOST_CONSOLE_COPY.endStream}
        message="¿Estás seguro de que quieres finalizar el stream? Esta acción terminará el evento para todos los participantes."
        confirmText={isEnding ? 'Finalizando...' : 'Finalizar'}
        cancelText="Cancelar"
        type="danger"
      />
    </div>
  )
}

/**
 * Selector de modo. Presente en los TRES modos: sin él, el host puede quedarse
 * encerrado en una superposición. No se restringe por tamaño de viewport —
 * hacerlo impediría probar la consola desde el escritorio antes de un evento,
 * que es justo cuando conviene probarla.
 */
export function HostViewModeSwitcher({ mode, onSelect, isFullscreen, onEnterFullscreen }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-x-1">
      {Object.values(HOST_VIEW_MODES).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          aria-pressed={mode === value}
          className={`min-h-9 rounded-md px-2 text-xs font-medium transition-colors ${
            mode === value
              ? 'bg-white text-gray-900'
              : 'bg-white/10 text-gray-200 hover:bg-white/20'
          }`}
        >
          {HOST_VIEW_MODE_LABELS[value]}
        </button>
      ))}
      {/* Perder la pantalla completa NO saca del modo (ver useHostViewMode);
          este botón es la forma de volver a ella. */}
      {mode !== HOST_VIEW_MODES.FULL && !isFullscreen && (
        <button
          type="button"
          onClick={onEnterFullscreen}
          aria-label={HOST_CONSOLE_COPY.enterFullscreen}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-gray-200 hover:bg-white/20"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
      )}
    </div>
  )
}

/**
 * Modo «solo vídeo»: la imagen publicada a sangre. Sirve para comprobar el
 * encuadre desde lejos con el teléfono a 185 cm en el trípode. El selector de
 * modo se mantiene siempre alcanzable.
 */
export function HostPreviewMode({ videoElement, modeSwitcher }) {
  return (
    <div className="relative h-full w-full bg-black">
      {videoElement}
      <div className="absolute right-3 top-3 z-10 rounded-md bg-black/60 p-1">
        {modeSwitcher}
      </div>
    </div>
  )
}

/**
 * Tarjeta de control. Toda la superficie es pulsable (≥48 px de alto) y el
 * acceso a la fuente es un segundo objetivo táctil independiente, para no
 * obligar a acertar en un icono pequeño con el teléfono en un trípode.
 */
function ControlCard({ label, active, onToggle, onPickSource, disabled = false, disabledReason }) {
  if (disabled) {
    return (
      <div className="flex min-h-[3.5rem] flex-col justify-center rounded-md bg-gray-800/60 px-3 py-2">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className="text-[11px] leading-tight text-gray-500">{disabledReason}</span>
      </div>
    )
  }

  return (
    <div className={`flex min-h-[3.5rem] items-stretch overflow-hidden rounded-md ${active ? 'bg-white/15' : 'bg-gray-800'}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2 text-left disabled:cursor-default"
      >
        <span className="truncate text-sm font-medium text-white">{label}</span>
        {onToggle && (
          <span className={`text-[11px] ${active ? 'text-green-400' : 'text-gray-400'}`}>
            {active ? 'Activado' : 'Desactivado'}
          </span>
        )}
      </button>
      {onPickSource && (
        <button
          type="button"
          onClick={onPickSource}
          aria-label={`${HOST_CONSOLE_COPY.chooseSource}: ${label}`}
          className="flex w-12 flex-shrink-0 items-center justify-center border-l border-white/10 text-gray-300 hover:bg-white/10"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      )}
    </div>
  )
}

/**
 * Medidor de nivel del micrófono local.
 *
 * Es el añadido de mayor valor de la consola para este montaje: el error caro
 * es retransmitir una hora con el micrófono del teléfono en vez del receptor
 * USB, y sin esto nada en pantalla lo delata.
 *
 * Con el micrófono apagado se muestra EN REPOSO, no oculto: un hueco vacío y un
 * nivel cero con el micrófono encendido son dos situaciones distintas.
 */
function MicLevelMeter({ room }) {
  const [level, setLevel] = useState(0)
  const micEnabled = room.micEnabled
  const micTrackRef = room.micTrackRef

  useEffect(() => {
    if (!micEnabled) {
      setLevel(0)
      return
    }
    const id = setInterval(() => {
      try {
        const value = micTrackRef.current?.getVolumeLevel?.()
        setLevel(typeof value === 'number' ? value : 0)
      } catch {
        setLevel(0)
      }
    }, MIC_LEVEL_POLL_MS)
    return () => clearInterval(id)
  }, [micEnabled, micTrackRef])

  // getVolumeLevel devuelve 0–1 pero se mueve en la parte baja del rango con
  // voz normal; la raíz reparte la señal útil por todo el ancho de la barra.
  const percent = Math.min(100, Math.round(Math.sqrt(level) * 100))

  return (
    <div className="flex flex-shrink-0 items-center gap-x-2">
      <span className="text-[11px] text-gray-400">
        {micEnabled ? HOST_CONSOLE_COPY.micLevel : HOST_CONSOLE_COPY.micLevelOff}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-700">
        <div
          className={`h-full transition-[width] duration-100 ${micEnabled ? 'bg-green-400' : 'bg-gray-600'}`}
          style={{ width: micEnabled ? `${percent}%` : '0%' }}
        />
      </div>
    </div>
  )
}
