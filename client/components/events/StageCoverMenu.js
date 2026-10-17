'use client'

import { useEffect, useRef } from 'react'
import StageCoverOptions from '@/components/events/StageCoverOptions'

/**
 * «Portadas» dropdown of the desktop control bars (agora-stage-covers), for
 * the host and the co-presenter. Same markup and open/close behaviour
 * (click-outside, Escape) as VideoEffectsMenu and DeviceDropdown, so the bar
 * reads as one family; unlike «Efectos» it never depends on the camera.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onToggle - (kindOrNull) → open this menu / close all
 * @param {string|null} props.cover - Active cover id, or null
 * @param {(id: string|null) => void} props.onSelect
 */
export default function StageCoverMenu({ isOpen, onToggle, cover, onSelect }) {
  const containerRef = useRef(null)

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => onToggle(isOpen ? null : 'covers')}
        aria-expanded={isOpen}
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
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[260px] max-w-[300px] py-1 z-10">
          <StageCoverOptions cover={cover} onSelect={select} />
        </div>
      )}
    </div>
  )
}
