'use client'

import { useEffect } from 'react'
import { HOST_CONSOLE_COPY } from '@/lib/constants'

/**
 * Selector de fuente para la consola móvil: un panel que ocupa la superposición
 * completa, con filas grandes.
 *
 * NO reutiliza `DeviceDropdown`: aquél se posiciona `top-full` bajo su
 * disparador y, con los ~300 px de alto que deja Chrome en horizontal, abierto
 * desde una tarjeta de la segunda fila la lista cae fuera de la pantalla. Los
 * datos y las funciones de cambio sí son los mismos (`useHostMediaControls`);
 * lo único distinto es la presentación.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title - Etiqueta del control (Micrófono, Cámara, Altavoz)
 * @param {Array} props.devices - [{ deviceId, label }]
 * @param {string|null} props.activeDeviceId
 * @param {Function} props.onSelect - (device) → cambiar a esta fuente
 * @param {Function} props.onClose
 */
export default function MobileDevicePicker({ open, title, devices, activeDeviceId, onSelect, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    // El toque fuera cierra; el clic dentro no se propaga hasta aquí.
    <div
      className="absolute inset-0 z-30 flex flex-col bg-black/80 p-3"
      onClick={onClose}
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2">
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm text-gray-600 hover:bg-gray-100"
          >
            {HOST_CONSOLE_COPY.close}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {devices.length === 0 ? (
            <p className="px-3 py-4 text-sm italic text-gray-400">{HOST_CONSOLE_COPY.noDevices}</p>
          ) : (
            devices.map((device, index) => {
              const isActive = device.deviceId === activeDeviceId
              return (
                <button
                  key={device.deviceId}
                  type="button"
                  onClick={() => onSelect(device)}
                  className="flex min-h-12 w-full items-center gap-x-2 border-b border-gray-100 px-3 py-3 text-left last:border-b-0 hover:bg-gray-50"
                >
                  {isActive ? (
                    <svg className="h-5 w-5 flex-shrink-0 text-gray-900" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span className="h-5 w-5 flex-shrink-0" />
                  )}
                  <span className={`truncate text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                    {device.label || `Dispositivo ${index + 1}`}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
