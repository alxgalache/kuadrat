'use client'

import { useEffect, useRef } from 'react'

/**
 * Presentational device dropdown shared by the LiveKit DeviceSelector
 * (EventLiveRoom) and the Agora selectors (AgoraLiveRoom). Pure markup +
 * open/close DOM behavior (click-outside / Escape); device enumeration and
 * switching live in the callers.
 *
 * @param {object} props
 * @param {string} props.kind - 'audioinput' | 'videoinput' | 'audiooutput' (opaque key for onToggle)
 * @param {boolean} props.isOpen
 * @param {Function} props.onToggle - (kindOrNull) → open this menu / close all
 * @param {Array} props.devices - [{ deviceId, label }]
 * @param {string|null} props.activeDeviceId
 * @param {Function} props.onSelect - (device) → switch to this device
 */
export default function DeviceDropdown({ kind, isOpen, onToggle, devices, activeDeviceId, onSelect }) {
  const containerRef = useRef(null)

  // Close on click-outside and Escape
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onToggle(null)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onToggle(null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onToggle])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => onToggle(isOpen ? null : kind)}
        className="p-1 cursor-pointer text-gray-500 hover:text-gray-700"
      >
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] max-w-[300px] py-1 z-10">
          {devices.length === 0 ? (
            <p className="text-sm text-gray-400 italic px-3 py-2">No se encontraron dispositivos</p>
          ) : (
            devices.map((device, index) => {
              const isActive = device.deviceId === activeDeviceId
              const label = device.label || `Dispositivo ${index + 1}`
              return (
                <button
                  key={device.deviceId}
                  type="button"
                  onClick={() => onSelect(device)}
                  className="flex items-center gap-x-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 cursor-pointer"
                >
                  {isActive ? (
                    <svg className="h-4 w-4 flex-shrink-0 text-gray-900" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className={`truncate ${isActive ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                    {label}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
