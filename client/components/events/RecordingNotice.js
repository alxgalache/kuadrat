'use client'

import Link from 'next/link'
import { VideoCameraIcon } from '@heroicons/react/20/solid'
import { EVENT_RECORDING_COPY } from '@/lib/constants'
import { isEventRecorded, isPerParticipantRecording } from '@/lib/eventRecording'

/**
 * The notice given BEFORE entering a recorded event (agora-event-recording):
 * on the event page and in the access modal. The wording follows the mode,
 * because it states who is recorded: in a stream only whoever is given the
 * floor, in a meeting everybody with a camera or microphone on. Nothing
 * renders for an event that is not recorded, or that is already over.
 */
export default function RecordingNotice({ event, className = '' }) {
  if (!isEventRecorded(event)) return null
  if (['finished', 'cancelled'].includes(event.status)) return null

  const text = isPerParticipantRecording(event)
    ? EVENT_RECORDING_COPY.noticeMeeting
    : EVENT_RECORDING_COPY.noticeBroadcast

  return (
    <div className={`flex gap-x-2 rounded-md bg-gray-50 p-3 ring-1 ring-inset ring-gray-200 ${className}`}>
      <VideoCameraIcon aria-hidden="true" className="mt-0.5 size-4 flex-shrink-0 text-red-600" />
      <p className="text-sm text-gray-700">
        {text}{' '}
        <Link
          href={EVENT_RECORDING_COPY.privacyHref}
          className="font-medium text-gray-900 underline hover:text-gray-700"
        >
          {EVENT_RECORDING_COPY.noticeLink}
        </Link>
      </p>
    </div>
  )
}
