'use client'

import { useState } from 'react'
import {
  VideoCameraIcon, VideoCameraSlashIcon, ComputerDesktopIcon, PencilSquareIcon, EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline'
import LiveRoomSheet, { LiveRoomSheetRow } from '@/components/events/LiveRoomSheet'
import MobileDevicePicker from '@/components/events/MobileDevicePicker'
import VideoEffectsOptions from '@/components/events/VideoEffectsOptions'
import {
  LIVE_ROOM_COPY, AGORA_VIDEO_QUALITIES, HOST_VIEW_MODES, HOST_VIEW_MODE_LABELS,
  STAGE_LAYOUTS, STAGE_LAYOUT_LABELS, STAGE_COPY,
} from '@/lib/constants'

function MicIcon({ off, className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      {off && <path strokeLinecap="round" d="M3.75 3.75l16.5 16.5" />}
    </svg>
  )
}

/**
 * Botón de icono de 44 × 44 de la fila de controles compacta.
 *
 * Micrófono y cámara apagados van en rojo (la convención de Meet: «no estás
 * emitiendo esto»); pantalla y pizarra, que se encienden a propósito, van en
 * oscuro cuando están activas. La etiqueta accesible es el nombre del control y
 * el estado lo da `aria-pressed`.
 */
export function ControlIconButton({ kind, label, active = false, onClick }) {
  const danger = kind === 'mic' || kind === 'camera'
  const isMore = kind === 'more'
  let tone
  if (isMore) tone = 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
  else if (active) tone = danger ? 'bg-white text-gray-900 ring-gray-300 hover:bg-gray-50' : 'bg-gray-900 text-white ring-gray-900'
  else tone = danger ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'

  const iconClass = 'size-5'
  let icon
  if (kind === 'mic') icon = <MicIcon off={!active} className={iconClass} />
  else if (kind === 'camera') icon = active ? <VideoCameraIcon aria-hidden="true" className={iconClass} /> : <VideoCameraSlashIcon aria-hidden="true" className={iconClass} />
  else if (kind === 'screen') icon = <ComputerDesktopIcon aria-hidden="true" className={iconClass} />
  else if (kind === 'whiteboard') icon = <PencilSquareIcon aria-hidden="true" className={iconClass} />
  else icon = <EllipsisHorizontalIcon aria-hidden="true" className={iconClass} />

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isMore ? undefined : active}
      className={`flex size-11 flex-shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors [touch-action:manipulation] ${tone}`}
    >
      {icon}
    </button>
  )
}

/**
 * Fila de controles compacta (52 px). Los iconos se desplazan si no caben; lo
 * que va en `trailing` («Finalizar») queda fijo a la derecha, siempre visible.
 * Se oculta con el teclado abierto a través de su celda de la rejilla.
 */
export function ControlsRow({ children, error, trailing = null }) {
  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-white">
      {error && <p className="truncate px-3 pt-1.5 text-xs text-red-600">{error}</p>}
      <div className="flex h-[52px] items-center gap-x-2 px-2">
        <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-x-1.5 overflow-x-auto overscroll-x-contain">
          {children}
        </div>
        {trailing}
      </div>
    </div>
  )
}

function SegmentRow({ label, hint, options, value, onSelect, disabled = false }) {
  return (
    <div className="border-b border-gray-100 px-4 py-3 last:border-b-0">
      <p className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      <div className="mt-2 flex gap-x-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            disabled={disabled}
            aria-pressed={value === option.id}
            className={`min-h-11 flex-1 rounded-md px-2 text-xs font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation] ${
              value === option.id
                ? 'bg-gray-900 text-white ring-gray-900'
                : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SwitchRow({ label, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-x-3 border-b border-gray-100 px-4 py-2 text-left last:border-b-0 hover:bg-gray-50 [touch-action:manipulation]"
    >
      <span className="text-sm text-gray-900">{label}</span>
      <span className={`relative inline-block h-6 w-11 flex-shrink-0 rounded-full transition-colors ${checked ? 'bg-gray-800' : 'bg-gray-200'}`}>
        <span className={`absolute top-1/2 start-0.5 size-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-full' : ''}`} />
      </span>
    </button>
  )
}

const activeDeviceLabel = (list, id) => list.find((d) => d.deviceId === id)?.label || ''

/**
 * Hoja «Más» de la sala compacta: lo que no cabe en la fila de controles.
 *
 * Una sola implementación para host, co-presentador y asistente de reunión:
 * cada uno pasa solo las secciones que le corresponden. Los datos y las
 * funciones de cambio vienen de la instancia única de sus hooks
 * (useHostMediaControls o los de MeetingSelfControls); esta hoja no enumera ni
 * cambia dispositivos por su cuenta.
 *
 * La elección de fuente usa `MobileDevicePicker` (filas grandes, hijo del
 * contenedor): al tocar «Micrófono» la hoja se cierra y se abre la lista.
 *
 * @param {object} props
 * @param {object} props.devices - El objeto de useAgoraDevices
 * @param {Function} props.onSelectDevice - (kind) → async (device)
 * @param {boolean} props.speakerSupported
 * @param {boolean} [props.screenUnsupported] - Muestra «Pantalla» deshabilitada con el motivo
 * @param {{value, onSelect}|null} [props.quality]
 * @param {{videoEffect, camEnabled}|null} [props.effects] - Solo si videoEffect.supported
 * @param {{value, onChange}|null} [props.everyoneWrites]
 * @param {{value, onChange, locked}|null} [props.stageLayout]
 * @param {{mode, onSelect}|null} [props.hostView]
 */
export function ControlsSheet({
  open, onClose, devices, onSelectDevice, speakerSupported,
  screenUnsupported = false, quality = null, effects = null,
  everyoneWrites = null, stageLayout = null, hostView = null,
}) {
  const [picker, setPicker] = useState(null) // 'audioinput' | 'videoinput' | 'audiooutput'
  const [effectsOpen, setEffectsOpen] = useState(false)

  const openPicker = (kind) => {
    onClose()
    setPicker(kind)
  }

  const pickerConfig = {
    audioinput: { title: LIVE_ROOM_COPY.mic, devices: devices.microphones, activeId: devices.activeMicId },
    videoinput: { title: LIVE_ROOM_COPY.camera, devices: devices.cameras, activeId: devices.activeCamId },
    audiooutput: { title: LIVE_ROOM_COPY.speaker, devices: devices.playbackDevices, activeId: devices.activeSpeakerId },
  }[picker]

  return (
    <>
      <LiveRoomSheet open={open} title={LIVE_ROOM_COPY.moreOptions} onClose={onClose}>
        <LiveRoomSheetRow
          label={LIVE_ROOM_COPY.mic}
          detail={activeDeviceLabel(devices.microphones, devices.activeMicId)}
          chevron
          onClick={() => openPicker('audioinput')}
        />
        <LiveRoomSheetRow
          label={LIVE_ROOM_COPY.camera}
          detail={activeDeviceLabel(devices.cameras, devices.activeCamId)}
          chevron
          onClick={() => openPicker('videoinput')}
        />
        {speakerSupported ? (
          <LiveRoomSheetRow
            label={LIVE_ROOM_COPY.speaker}
            detail={activeDeviceLabel(devices.playbackDevices, devices.activeSpeakerId)}
            chevron
            onClick={() => openPicker('audiooutput')}
          />
        ) : (
          <LiveRoomSheetRow label={LIVE_ROOM_COPY.speaker} disabled reason={LIVE_ROOM_COPY.speakerUnsupported} />
        )}
        {screenUnsupported && (
          <LiveRoomSheetRow label={LIVE_ROOM_COPY.screen} disabled reason={LIVE_ROOM_COPY.screenUnsupported} />
        )}
        {quality && (
          <SegmentRow
            label={LIVE_ROOM_COPY.quality}
            options={AGORA_VIDEO_QUALITIES.map((level) => ({ id: level.id, label: level.short }))}
            value={quality.value}
            onSelect={quality.onSelect}
          />
        )}
        {effects && (effects.camEnabled ? (
          <LiveRoomSheetRow
            label={LIVE_ROOM_COPY.effects}
            chevron
            onClick={() => {
              effects.videoEffect.ensureLoaded()
              onClose()
              setEffectsOpen(true)
            }}
          />
        ) : (
          <LiveRoomSheetRow label={LIVE_ROOM_COPY.effects} disabled reason={LIVE_ROOM_COPY.cameraOffForEffects} />
        ))}
        {everyoneWrites && (
          <SwitchRow label={LIVE_ROOM_COPY.everyoneWrites} checked={everyoneWrites.value} onChange={everyoneWrites.onChange} />
        )}
        {stageLayout && (
          <SegmentRow
            label={LIVE_ROOM_COPY.stageLayout}
            hint={stageLayout.locked ? STAGE_COPY.lockedHint : null}
            options={[STAGE_LAYOUTS.SPLIT, STAGE_LAYOUTS.PIP].map((mode) => ({ id: mode, label: STAGE_LAYOUT_LABELS[mode] }))}
            value={stageLayout.value}
            onSelect={stageLayout.onChange}
            disabled={stageLayout.locked}
          />
        )}
        {hostView && (
          <SegmentRow
            label={LIVE_ROOM_COPY.hostView}
            options={Object.values(HOST_VIEW_MODES).map((mode) => ({ id: mode, label: HOST_VIEW_MODE_LABELS[mode] }))}
            value={hostView.mode}
            onSelect={(mode) => {
              onClose()
              hostView.onSelect(mode)
            }}
          />
        )}
      </LiveRoomSheet>

      {effects && (
        <LiveRoomSheet open={effectsOpen} title={LIVE_ROOM_COPY.effects} onClose={() => setEffectsOpen(false)}>
          <VideoEffectsOptions
            large
            status={effects.videoEffect.status}
            effect={effects.videoEffect.effect}
            applying={effects.videoEffect.applying}
            onSelect={(next) => {
              effects.videoEffect.selectEffect(next)
              setEffectsOpen(false)
            }}
          />
        </LiveRoomSheet>
      )}

      <MobileDevicePicker
        open={!!picker}
        title={pickerConfig?.title || ''}
        devices={pickerConfig?.devices || []}
        activeDeviceId={pickerConfig?.activeId || null}
        onSelect={async (device) => {
          await onSelectDevice(picker)(device)
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
    </>
  )
}
