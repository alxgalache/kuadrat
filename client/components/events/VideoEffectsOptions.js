'use client'

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

function OptionRow({ label, active, disabled, onClick, large }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-x-2 w-full text-sm text-left hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        large ? 'min-h-12 px-4 py-3' : 'px-3 py-2'
      }`}
    >
      {active ? <CheckIcon /> : <span className="h-4 w-4 flex-shrink-0" />}
      <span className={`truncate ${active ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{label}</span>
    </button>
  )
}

/**
 * Background effect options: the one list both presentations draw — the
 * dropdown next to the camera toggle (VideoEffectsMenu) and the «Efectos» entry
 * of the compact room's «Más» sheet. Same options, order and active check in
 * both; `large` only enlarges the touch targets.
 *
 * @param {object} props
 * @param {string} props.status - idle | loading | ready | unsupported | error
 * @param {object} props.effect - { type: 'none' | 'blur' | 'img', blurDegree?, file? }
 * @param {boolean} props.applying - a selection is being applied
 * @param {Function} props.onSelect - (effect) → apply and persist
 * @param {boolean} [props.large=false] - touch-sized rows (compact sheet)
 */
export default function VideoEffectsOptions({ status, effect, applying, onSelect, large = false }) {
  const pad = large ? 'px-4 py-3' : 'px-3 py-2'
  // 'idle' only shows before the first load kicks in; the list is not usable until ready
  const loading = status === 'loading' || status === 'idle'

  if (status === 'unsupported') {
    return <p className={`text-sm text-gray-500 ${pad}`}>Tu navegador no admite los efectos de fondo.</p>
  }
  if (status === 'error') {
    return <p className={`text-sm text-gray-500 ${pad}`}>No se pudieron cargar los efectos. Vuelve a intentarlo.</p>
  }
  if (loading) {
    return <p className={`text-sm text-gray-400 italic ${pad}`}>Cargando efectos...</p>
  }

  return (
    <>
      <OptionRow
        label="Ninguno"
        active={effect.type === 'none'}
        disabled={applying}
        large={large}
        onClick={() => onSelect({ type: 'none' })}
      />
      <OptionRow
        label="Desenfoque suave"
        active={effect.type === 'blur' && effect.blurDegree === AGORA_BLUR_DEGREE_SOFT}
        disabled={applying}
        large={large}
        onClick={() => onSelect({ type: 'blur', blurDegree: AGORA_BLUR_DEGREE_SOFT })}
      />
      <OptionRow
        label="Desenfoque intenso"
        active={effect.type === 'blur' && effect.blurDegree === AGORA_BLUR_DEGREE_STRONG}
        disabled={applying}
        large={large}
        onClick={() => onSelect({ type: 'blur', blurDegree: AGORA_BLUR_DEGREE_STRONG })}
      />

      {/* Image catalog — hidden entirely while the manifest is empty */}
      {VIRTUAL_BACKGROUNDS.length > 0 && (
        <>
          <div className="my-1 border-t border-gray-100" />
          <div className={`grid grid-cols-3 gap-2 ${pad}`}>
            {VIRTUAL_BACKGROUNDS.map((bg) => {
              const active = effect.type === 'img' && effect.file === bg.file
              return (
                <button
                  key={bg.file}
                  type="button"
                  onClick={() => onSelect({ type: 'img', file: bg.file })}
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
  )
}
