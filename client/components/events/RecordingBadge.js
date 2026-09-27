'use client'

import { EVENT_RECORDING_COPY } from '@/lib/constants'

/**
 * «Grabando» (agora-event-recording). The one badge every presentation of a
 * recorded Agora room shows while the event is live, for every role.
 *
 * It reflects the event's CONFIGURATION, not the live state of the Agora task:
 * there is no recording-state signal down to the browsers, and the only
 * possible mistake — announcing a recording that has failed — is the one that
 * never harms anybody's privacy. The admin learns about failures by email.
 *
 * On very narrow screens the word collapses to the dot; `aria-label` keeps the
 * full notice for screen readers either way.
 *
 * @param {object} props
 * @param {boolean} [props.onDark] - Over video (landscape chrome, host console)
 */
export default function RecordingBadge({ onDark = false }) {
  return (
    <span
      role="img"
      aria-label={EVENT_RECORDING_COPY.badgeAria}
      title={EVENT_RECORDING_COPY.badgeAria}
      className={`inline-flex flex-shrink-0 items-center gap-x-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
        onDark ? 'bg-red-600/90 text-white' : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20'
      }`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${onDark ? 'bg-white' : 'bg-red-600'}`} />
      <span aria-hidden="true" className="max-[359px]:hidden">{EVENT_RECORDING_COPY.badge}</span>
    </span>
  )
}
