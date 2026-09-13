'use client'

import { useCallback } from 'react'
import { LIVE_ROOM_COPY } from '@/lib/constants'

export function HandIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M18.906 3.92194C17.8921 2.88646 16.4461 2.50452 15.0306 2.9073C14.6322 3.02066 14.2173 2.78959 14.104 2.39119C13.9906 1.99279 14.2217 1.57792 14.6201 1.46456C16.5583 0.913072 18.5747 1.43959 19.9778 2.8725C20.2676 3.16846 20.2626 3.64331 19.9666 3.9331C19.6706 4.2229 19.1958 4.2179 18.906 3.92194ZM11.1904 3.30839C10.9763 2.94131 10.3525 2.7187 9.71882 3.08085C9.08746 3.44168 8.97642 4.07772 9.18675 4.4384L11.7124 8.76952C11.9211 9.12734 11.8001 9.58656 11.4423 9.79522C11.0845 10.0039 10.6253 9.88296 10.4166 9.52514L7.89098 5.19403C7.89085 5.19381 7.8911 5.19424 7.89098 5.19403L7.04909 3.75032C6.83503 3.38324 6.21122 3.16063 5.57755 3.52278C4.94619 3.88361 4.83515 4.51965 5.04548 4.88033L8.83397 11.377C9.04263 11.7348 8.92171 12.1941 8.56389 12.4027C8.20607 12.6114 7.74685 12.4905 7.53819 12.1326L5.85442 9.24522C5.64036 8.87814 5.01655 8.65553 4.38288 9.01768C3.75152 9.37851 3.64048 10.0145 3.85081 10.3752L7.6393 16.8719C9.24824 19.631 13.2186 20.5264 16.5856 18.6021C19.9502 16.6792 21.1463 12.8377 19.5411 10.085L17.0154 5.75387C16.8013 5.3868 16.1775 5.16418 15.5439 5.52633C14.9125 5.88716 14.8015 6.5232 15.0118 6.88389L16.6956 9.7713C16.7963 9.94411 16.8239 10.15 16.7721 10.3432C16.7203 10.5365 16.5935 10.701 16.4198 10.8003C14.8774 11.6818 14.4047 13.3863 15.0799 14.5443C15.2886 14.9022 15.1677 15.3614 14.8099 15.57C14.4521 15.7787 13.9928 15.6578 13.7842 15.3C12.7249 13.4835 13.3917 11.2368 15.0475 9.92287L11.1904 3.30839ZM13.9186 5.00916L12.4861 2.55277C11.7703 1.32517 10.163 1.09928 8.97453 1.77853C8.60823 1.98787 8.29668 2.27483 8.06179 2.60775C7.26173 1.72687 5.8839 1.62001 4.83326 2.22046C3.64241 2.90104 3.03012 4.40197 3.74971 5.63596L4.75188 7.35452C4.36684 7.39635 3.98493 7.51742 3.63859 7.71536C2.44774 8.39595 1.83545 9.89687 2.55504 11.1309L6.34352 17.6275C8.45427 21.2471 13.408 22.1458 17.3299 19.9044C21.254 17.6617 22.9513 12.9554 20.8368 9.32937L18.3112 4.99825C17.5953 3.77065 15.9881 3.54476 14.7996 4.22401C14.4495 4.42406 14.1495 4.69498 13.9186 5.00916ZM4.41401 17.859C4.77183 17.6504 5.23105 17.7713 5.43971 18.1291C6.26657 19.5471 7.53066 20.6193 9.08954 21.3151C9.46779 21.4839 9.63757 21.9274 9.46875 22.3057C9.29993 22.6839 8.85645 22.8537 8.4782 22.6849C6.66668 21.8764 5.14688 20.6046 4.14393 18.8847C3.93527 18.5269 4.05619 18.0677 4.41401 17.859Z" />
    </svg>
  )
}

const SIZES = {
  default: {
    tile: 'w-14 h-14 text-lg',
    badge: 'h-5 w-5',
    micIcon: 'h-3 w-3',
    handIcon: 'h-3.5 w-3.5',
  },
  // 44 px con insignias de 16: la misma proporción tile/insignia (0,36) que el
  // tamaño de escritorio, para que la fila compacta se lea como el mismo
  // componente y no como otro.
  compact: {
    tile: 'size-11 text-base',
    badge: 'size-4',
    micIcon: 'size-2.5',
    handIcon: 'size-3',
  },
}

function MicBadge({ active, size }) {
  const s = SIZES[size]
  return (
    <span className={`absolute -top-1 -right-1 flex ${s.badge} items-center justify-center rounded-full ${active ? 'bg-green-500' : 'bg-red-400'}`}>
      {active ? (
        <svg className={`${s.micIcon} text-white`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      ) : (
        <svg className={`${s.micIcon} text-white`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
        </svg>
      )}
    </span>
  )
}

/**
 * Participant order of the broadcast grid, the compact row and the theater
 * strip — ONE function, so every presentation lists people identically: host
 * first, the local participant last, raised hands before the rest.
 */
export function sortParticipants(entries, selfIdentity) {
  return [...entries].sort((a, b) => {
    const aHost = a.isHost ? 1 : 0
    const bHost = b.isHost ? 1 : 0
    if (aHost !== bHost) return bHost - aHost
    const aLocal = a.identity === selfIdentity
    const bLocal = b.identity === selfIdentity
    if (aLocal && !bLocal) return 1
    if (!aLocal && bLocal) return -1
    const aHand = a.handRaised ? 1 : 0
    const bHand = b.handRaised ? 1 : 0
    return bHand - aHand
  })
}

/**
 * Publishing and microphone state of a presence entry, as every tile and the
 * participant sheet read it: local from RTC state, remote from the published
 * audio track.
 */
export function participantMediaState(entry, { isLocal, remoteByUid, localMicEnabled, amSpeaker }) {
  const remoteUser = entry.agoraUid != null ? remoteByUid.get(Number(entry.agoraUid)) : null
  return {
    canPublish: isLocal ? amSpeaker : entry.speaker,
    isMicActive: isLocal ? localMicEnabled : !!remoteUser?.hasAudio,
  }
}

/**
 * Presence-driven participant tile of Agora broadcast rooms — same states,
 * colors and order as the LiveKit ParticipantTile.
 *
 * `readOnly` renders pure state (theater strip): no click actions, name styled
 * for the dark overlay background. `size="compact"` is the 44 px tile of the
 * compact room's horizontal row: no label under it (the name is the accessible
 * label and lives in the participant sheet) and a tap calls `onSelect` instead
 * of acting, because in a row scrolled with the finger an imprecise tap used to
 * give the floor to the wrong person.
 */
export default function ParticipantTile({
  entry, isLocal, viewerIsHost, remoteByUid,
  localMicEnabled, amSpeaker, wasPromoted, onPromote, onDemote, onSelfMute,
  readOnly = false, size = 'default', onSelect,
}) {
  const isHostParticipant = entry.isHost
  // The co-presenter's tile is state only for everybody: the server refuses to
  // promote or demote staff, and a demote would ban their publishing for 24 h
  const isCoHostParticipant = !!entry.coHost
  const handRaised = entry.handRaised
  const { canPublish, isMicActive } = participantMediaState(entry, { isLocal, remoteByUid, localMicEnabled, amSpeaker })
  const s = SIZES[size]
  const compact = size === 'compact'

  const initial = isLocal ? 'T' : (entry.name || entry.identity || '?').charAt(0).toUpperCase()
  const displayName = isLocal ? LIVE_ROOM_COPY.you : (entry.name || entry.identity || '?')
  const shortName = isLocal ? LIVE_ROOM_COPY.you : (displayName.length > 12 ? displayName.slice(0, 11) + '...' : displayName)

  const handleClick = useCallback(() => {
    if (onSelect) {
      onSelect(entry)
      return
    }
    if (isHostParticipant || isCoHostParticipant) return
    if (isLocal) {
      if (canPublish && isMicActive) onSelfMute?.()
      return
    }
    if (!viewerIsHost) return
    if (canPublish) {
      onDemote?.(entry.identity)
    } else {
      onPromote?.(entry.identity)
    }
  }, [onSelect, entry, isLocal, viewerIsHost, isHostParticipant, isCoHostParticipant, canPublish, isMicActive, onSelfMute, onPromote, onDemote])

  const getTitle = () => {
    if (isHostParticipant) return `Host: ${displayName}`
    if (isCoHostParticipant) return displayName
    if (isLocal) {
      if (canPublish && isMicActive) return 'Silenciar tu micrófono'
      if (!canPublish) return 'Levanta la mano para hablar'
      return '(Tu)'
    }
    if (viewerIsHost && canPublish) return `Silenciar a ${displayName}`
    if (viewerIsHost) return `Dar la palabra a ${displayName}`
    return displayName
  }

  const getTileClasses = () => {
    if (isHostParticipant) {
      return 'bg-gray-50 text-gray-900 ring-2 ring-gray-900 cursor-default'
    }
    if (isCoHostParticipant) {
      return isMicActive
        ? 'bg-green-50 text-green-800 ring-2 ring-green-400 cursor-default'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
    }
    if (isLocal) {
      if (canPublish) {
        return isMicActive
          ? 'bg-green-50 text-green-800 ring-2 ring-green-400 cursor-pointer hover:bg-green-100'
          : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
      }
      return 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
    }
    if (canPublish) {
      return isMicActive
        ? 'bg-green-50 text-green-800 ring-2 ring-green-400 cursor-pointer hover:bg-green-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
    }
    if (wasPromoted) {
      return viewerIsHost
        ? 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
    }
    if (viewerIsHost) {
      return handRaised
        ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 cursor-pointer hover:bg-amber-100'
        : 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-pointer hover:bg-red-100'
    }
    return 'bg-red-50 text-red-800 ring-2 ring-red-400 cursor-default'
  }

  const accessibleName = isHostParticipant
    ? `${LIVE_ROOM_COPY.roleHost}: ${entry.name || ''}`.trim()
    : isLocal ? `${entry.name || ''} ${LIVE_ROOM_COPY.you}`.trim() : displayName

  const tile = (
    <button
      type="button"
      onClick={readOnly ? undefined : handleClick}
      className={`relative ${s.tile} flex-shrink-0 rounded-lg flex items-center justify-center font-semibold transition-shadow duration-300 ${getTileClasses()} ${readOnly ? '!cursor-default' : ''} ${compact ? '!cursor-pointer [touch-action:manipulation]' : ''}`}
      title={compact ? undefined : (readOnly ? (isLocal ? '(Tu)' : displayName) : getTitle())}
      aria-label={compact ? accessibleName : undefined}
    >
      <span aria-hidden={compact ? 'true' : undefined}>{initial}</span>

      {/* Hand raised icon — top left (hidden when actively speaking) */}
      {handRaised && !isLocal && !isHostParticipant && (!canPublish || !isMicActive) && (
        <span className={`absolute -top-1 -left-1 flex ${s.badge} items-center justify-center rounded-full bg-amber-400`}>
          <HandIcon className={`${s.handIcon} text-white`} />
        </span>
      )}

      {/* Mic badge (top-right) */}
      {!isHostParticipant && <MicBadge active={canPublish && isMicActive} size={size} />}
    </button>
  )

  if (compact) return tile

  return (
    <div className="flex flex-col items-center gap-1">
      {tile}
      <span className={`text-xs text-center max-w-16 truncate ${
        isHostParticipant ? (readOnly ? 'text-white font-semibold' : 'text-gray-900 font-semibold')
        : isLocal ? (readOnly ? 'text-red-400 font-medium' : 'text-red-600 font-medium')
        : (readOnly ? 'text-gray-300' : 'text-gray-600')
      }`}>{isHostParticipant ? 'Host' : shortName}</span>
    </div>
  )
}
