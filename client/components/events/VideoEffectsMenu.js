'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { VIRTUAL_BACKGROUNDS } from '@/lib/virtualBackgrounds'
import { AGORA_BLUR_DEGREE_SOFT, AGORA_BLUR_DEGREE_STRONG, AGORA_BACKGROUNDS_BASE_PATH } from '@/lib/constants'

const THUMB_WIDTH = 80
const THUMB_HEIGHT = 45 // 16:9, matching the catalog's required aspect ratio

function CheckIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-gray-900" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function OptionRow({ label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-x-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {active ? <CheckIcon /> : <span className="h-4 w-4 flex-shrink-0" />}
      <span className={`truncate ${active ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{label}</span>
    </button>
  )
}

/**
 * Background effects panel for the Agora room controls. Presentational only:
 * the processor lifecycle lives in hooks/useAgoraVideoEffect.js.
 *
 * Mirrors DeviceDropdown's markup and open/close behavior (click-outside, Escape)
 * so the control bar reads as one family.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onToggle - (kindOrNull) → open this menu / close all
 * @param {boolean} props.disabled - camera off: nothing to apply the effect to
 * @param {string} props.status - idle | loading | ready | unsupported | error
 * @param {object} props.effect - { type: 'none' | 'blur' | 'img', blurDegree?, file? }
 * @param {boolean} props.applying - a selection is being applied
 * @param {Function} props.onSelect - (effect) → apply and persist
 */
export default function VideoEffectsMenu({ isOpen, onToggle, disabled, status, effect, applying, onSelect }) {
  const containerRef = useRef(null)

  // Close on click-outside and Escape (same behavior as DeviceDropdown)
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

  const select = (next) => {
    onSelect(next)
    onToggle(null)
  }

  // 'idle' only shows before the first load kicks in; the list is not usable until ready
  const loading = status === 'loading' || status === 'idle'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => onToggle(isOpen ? null : 'effects')}
        disabled={disabled}
        className="p-1 cursor-pointer text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-500"
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
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[260px] max-w-[300px] py-1 z-10">
          {status === 'unsupported' ? (
            <p className="text-sm text-gray-500 px-3 py-2">Tu navegador no admite los efectos de fondo.</p>
          ) : status === 'error' ? (
            <p className="text-sm text-gray-500 px-3 py-2">No se pudieron cargar los efectos. Vuelve a intentarlo.</p>
          ) : loading ? (
            <p className="text-sm text-gray-400 italic px-3 py-2">Cargando efectos...</p>
          ) : (
            <>
              <OptionRow
                label="Ninguno"
                active={effect.type === 'none'}
                disabled={applying}
                onClick={() => select({ type: 'none' })}
              />
              <OptionRow
                label="Desenfoque suave"
                active={effect.type === 'blur' && effect.blurDegree === AGORA_BLUR_DEGREE_SOFT}
                disabled={applying}
                onClick={() => select({ type: 'blur', blurDegree: AGORA_BLUR_DEGREE_SOFT })}
              />
              <OptionRow
                label="Desenfoque intenso"
                active={effect.type === 'blur' && effect.blurDegree === AGORA_BLUR_DEGREE_STRONG}
                disabled={applying}
                onClick={() => select({ type: 'blur', blurDegree: AGORA_BLUR_DEGREE_STRONG })}
              />

              {/* Image catalog — hidden entirely while the manifest is empty */}
              {VIRTUAL_BACKGROUNDS.length > 0 && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <div className="grid grid-cols-3 gap-2 px-3 py-2">
                    {VIRTUAL_BACKGROUNDS.map((bg) => {
                      const active = effect.type === 'img' && effect.file === bg.file
                      return (
                        <button
                          key={bg.file}
                          type="button"
                          onClick={() => select({ type: 'img', file: bg.file })}
                          disabled={applying}
                          title={bg.label}
                          className={`relative rounded overflow-hidden cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            active ? 'ring-2 ring-gray-900' : 'ring-1 ring-gray-200 hover:ring-gray-400'
                          }`}
                        >
                          <Image
                            src={`${AGORA_BACKGROUNDS_BASE_PATH}${bg.file}`}
                            alt={bg.label}
                            width={THUMB_WIDTH}
                            height={THUMB_HEIGHT}
                            className="object-cover"
                          />
                          <span className="sr-only">{bg.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
