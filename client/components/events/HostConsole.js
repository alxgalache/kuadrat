'use client'

import { useState, useEffect, useCallback } from 'react'
import MobileDevicePicker from '@/components/events/MobileDevicePicker'
import { HOST_CONSOLE_COPY, HOST_VIEW_MODES, HOST_VIEW_MODE_LABELS, AGORA_VIDEO_QUALITIES } from '@/lib/constants'

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
    videoQuality, selectVideoQuality,
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
          <QualitySelector quality={videoQuality} onSelect={selectVideoQuality} />
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

      {/* Confirmación PROPIA de la consola, no el ConfirmDialog compartido.
          Aquél usa Headless UI, que renderiza en un portal colgado de
          `document.body`, y ahí queda invisible por dos motivos independientes:
          cae FUERA del elemento en pantalla completa (el navegador solo pinta
          ese subárbol) y su `z-50` pierde contra el `z-[60]` de la
          superposición. El resultado era un botón que no hacía nada. */}
      <ConsoleConfirm
        open={showEndConfirm}
        title={HOST_CONSOLE_COPY.endStream}
        message={HOST_CONSOLE_COPY.endStreamConfirm}
        confirmText={isEnding ? HOST_CONSOLE_COPY.ending : HOST_CONSOLE_COPY.confirmEnd}
        busy={isEnding}
        onConfirm={handleEndStream}
        onCancel={() => setShowEndConfirm(false)}
      />
    </div>
  )
}

/**
 * Calidad de emisión: control segmentado de un solo toque, bajo la
 * previsualización que modifica.
 *
 * Tres opciones no justifican un panel a pantalla completa como el de las
 * fuentes —serían dos toques para elegir entre tres— y las etiquetas son la
 * propia resolución, que es lo único que el host necesita saber para decidir.
 * Vive en la columna del vídeo y no en la rejilla de tarjetas para no añadir
 * una tercera fila: el presupuesto de 300 px de alto sigue intacto.
 */
function QualitySelector({ quality, onSelect }) {
  if (!onSelect) return null
  return (
    <div className="flex flex-shrink-0 items-center gap-x-2">
      <span className="text-[11px] text-gray-400">{HOST_CONSOLE_COPY.quality}</span>
      <div className="flex flex-1 gap-x-1">
        {AGORA_VIDEO_QUALITIES.map((level) => (
          <button
            key={level.id}
            type="button"
            onClick={() => onSelect(level.id)}
            aria-pressed={quality === level.id}
            title={`${level.label} — ${level.detail}`}
            className={`min-h-11 flex-1 rounded-md text-xs font-medium transition-colors ${
              quality === level.id
                ? 'bg-white text-gray-900'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {level.short}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Confirmación destructiva dentro de la propia superposición.
 *
 * No usa el `ConfirmDialog` compartido a propósito: aquél está construido sobre
 * el `Dialog` de Headless UI, que se monta en un portal colgado de
 * `document.body`. Eso lo deja fuera del elemento que está en pantalla completa
 * —el navegador solo pinta ese subárbol— y además por debajo del `z-[60]` de la
 * consola. Cualquier interfaz que la consola necesite mostrar tiene que ser
 * hija suya, igual que `MobileDevicePicker`.
 */
function ConsoleConfirm({ open, title, message, confirmText, busy, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-3"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-xs leading-snug text-gray-600">{message}</p>
        <div className="mt-3 flex justify-end gap-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-md bg-white px-4 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            {HOST_CONSOLE_COPY.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {confirmText}
          </button>
        </div>
      </div>
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
