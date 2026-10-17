'use client'

import { STAGE_COVERS } from '@/lib/stageCovers'
import { STAGE_COVER_COPY } from '@/lib/constants'

function CheckIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-gray-900" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function OptionRow({ label, detail, active, onClick, large }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-x-2 w-full text-sm text-left hover:bg-gray-50 cursor-pointer ${
        large ? 'min-h-12 px-4 py-3' : 'px-3 py-2'
      }`}
    >
      {active ? <CheckIcon /> : <span className="h-4 w-4 flex-shrink-0" />}
      <span className="min-w-0">
        <span className={`block truncate ${active ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{label}</span>
        {detail && <span className="block truncate text-xs text-gray-500">{detail}</span>}
      </span>
    </button>
  )
}

/**
 * Stage cover options (agora-stage-covers): the one list every presentation
 * draws — the desktop dropdown (StageCoverMenu), the mobile console's picker
 * and the «Portadas» sheet of the compact room. The active row is the room's
 * cover, never local state: a change made by the other presenter shows here.
 *
 * @param {object} props
 * @param {string|null} props.cover - Active cover id, or null
 * @param {(id: string|null) => void} props.onSelect
 * @param {boolean} [props.large=false] - touch-sized rows
 */
export default function StageCoverOptions({ cover, onSelect, large = false }) {
  return (
    <>
      <OptionRow label={STAGE_COVER_COPY.none} active={!cover} large={large} onClick={() => onSelect(null)} />
      {STAGE_COVERS.map((option) => (
        <OptionRow
          key={option.id}
          label={option.label}
          detail={option.headline}
          active={cover === option.id}
          large={large}
          onClick={() => onSelect(option.id)}
        />
      ))}
      <p className={`border-t border-gray-100 text-xs text-gray-500 ${large ? 'px-4 py-3' : 'px-3 py-2'}`}>
        {STAGE_COVER_COPY.hint}
      </p>
    </>
  )
}
