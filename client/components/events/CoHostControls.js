'use client'

import { useState } from 'react'
import DeviceDropdown from '@/components/events/DeviceDropdown'
import ToggleSwitch from '@/components/events/ToggleSwitch'
import { STAGE_LAYOUTS, STAGE_LAYOUT_LABELS, STAGE_COPY } from '@/lib/constants'

/**
 * Control bar of the co-presenter (the admin interviewing the host) in an
 * Agora broadcast event.
 *
 * Deliberately narrow: microphone, camera, speakers and the camera layout. No
 * screen share, whiteboard, effects, quality or "Finalizar stream" — two people
 * operating those at once produce incompatible states.
 *
 * A PRESENTATION of `useHostMediaControls`, instantiated once in AgoraLiveRoom
 * exactly as for the host, never a second copy of the device logic.
 *
 * @param {object} props
 * @param {object} props.room - From useAgoraRoom
 * @param {object} props.hostControls - From useHostMediaControls
 * @param {'split'|'pip'} props.layout - Shared layout (useEventRoomSocket)
 * @param {Function} props.onLayoutChange - (mode) => void, server-validated
 * @param {boolean} props.layoutLocked - Content on stage: cameras go together in the corner
 */
export default function CoHostControls({ room, hostControls, layout, onLayoutChange, layoutLocked }) {
  const [openDeviceMenu, setOpenDeviceMenu] = useState(null)
  const { devices, deviceError, toggleMic, toggleCamera, selectDevice: selectDeviceFn } = hostControls

  const selectDevice = (kind) => async (device) => {
    await selectDeviceFn(kind)(device)
    setOpenDeviceMenu(null)
  }

  return (
    // gap-y: this row wraps on narrow viewports — without it the lines touch
    <div className="flex items-center gap-x-6 gap-y-3 flex-wrap">
      <div className="relative flex items-center gap-x-2">
        <span className="text-sm text-gray-700">Micrófono</span>
        <ToggleSwitch checked={room.micEnabled} onChange={toggleMic} />
        <DeviceDropdown
          kind="audioinput"
          isOpen={openDeviceMenu === 'audioinput'}
          onToggle={setOpenDeviceMenu}
          devices={devices.microphones}
          activeDeviceId={devices.activeMicId}
          onSelect={selectDevice('audioinput')}
        />
      </div>
      <div className="relative flex items-center gap-x-2">
        <span className="text-sm text-gray-700">Cámara</span>
        <ToggleSwitch checked={room.camEnabled} onChange={toggleCamera} />
        <DeviceDropdown
          kind="videoinput"
          isOpen={openDeviceMenu === 'videoinput'}
          onToggle={setOpenDeviceMenu}
          devices={devices.cameras}
          activeDeviceId={devices.activeCamId}
          onSelect={selectDevice('videoinput')}
        />
      </div>
      {devices.playbackDevices.length > 0 && (
        <div className="relative flex items-center gap-x-2">
          <span className="text-sm text-gray-700">Altavoces</span>
          <DeviceDropdown
            kind="audiooutput"
            isOpen={openDeviceMenu === 'audiooutput'}
            onToggle={setOpenDeviceMenu}
            devices={devices.playbackDevices}
            activeDeviceId={devices.activeSpeakerId}
            onSelect={selectDevice('audiooutput')}
          />
        </div>
      )}
      <div className="flex items-center gap-x-2">
        <span className="text-sm text-gray-700">{STAGE_COPY.layout}</span>
        <div className="flex gap-x-1">
          {[STAGE_LAYOUTS.SPLIT, STAGE_LAYOUTS.PIP].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onLayoutChange(mode)}
              disabled={layoutLocked}
              aria-pressed={layout === mode}
              className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                layout === mode
                  ? 'bg-gray-900 text-white ring-gray-900'
                  : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
              }`}
            >
              {STAGE_LAYOUT_LABELS[mode]}
            </button>
          ))}
        </div>
        {layoutLocked && (
          <span className="text-xs text-gray-500">{STAGE_COPY.lockedHint}</span>
        )}
      </div>
      {deviceError && (
        <span className="text-xs text-red-600">{deviceError}</span>
      )}
    </div>
  )
}
