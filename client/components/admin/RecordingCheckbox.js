'use client'

import { useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { EVENT_RECORDING_COPY } from '@/lib/constants'

/**
 * «Grabar el evento (audio y vídeo)» for the create and edit forms
 * (agora-event-recording). One component so the two screens cannot drift.
 * The caller renders it only when `supportsRecording()` holds; here it only
 * asks the server whether this environment can record at all, and disables
 * itself when it cannot — a checkbox that saves and records nothing is the
 * silent failure the server refuses at startup too.
 */
export default function RecordingCheckbox({ checked, onChange, interactionMode }) {
  const [available, setAvailable] = useState(null)

  useEffect(() => {
    let cancelled = false
    adminAPI.events.getRecordingAvailability()
      .then((data) => { if (!cancelled) setAvailable(!!data.recordingAvailable) })
      .catch(() => { if (!cancelled) setAvailable(false) })
    return () => { cancelled = true }
  }, [])

  const disabled = available === false
  const modeHelp = interactionMode === 'meeting'
    ? EVENT_RECORDING_COPY.helpMeeting
    : EVENT_RECORDING_COPY.helpBroadcast

  return (
    <label
      className={`flex items-start gap-x-2 text-sm ${disabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled || available === null}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-black disabled:opacity-50"
      />
      <span>
        {EVENT_RECORDING_COPY.checkboxLabel}
        <span className="block text-xs text-gray-500">
          {disabled ? EVENT_RECORDING_COPY.unavailable : `${modeHelp} ${EVENT_RECORDING_COPY.helpCommon}`}
        </span>
      </span>
    </label>
  )
}
