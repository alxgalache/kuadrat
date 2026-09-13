'use client'

import { useEffect, useRef } from 'react'
import VideoEffectsOptions from '@/components/events/VideoEffectsOptions'

/**
 * Background effects panel for the Agora room controls. Presentational only:
 * the processor lifecycle lives in hooks/useAgoraVideoEffect.js, and the option
 * list in VideoEffectsOptions (shared with the compact room's «Más» sheet).
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
          <VideoEffectsOptions status={status} effect={effect} applying={applying} onSelect={select} />
        </div>
      )}
    </div>
  )
}
