'use client'

import { useMemo, useRef, useState } from 'react'
import ParticipantTile, { HandIcon, sortParticipants, participantMediaState } from '@/components/events/ParticipantTile'
import LiveRoomSheet, { LiveRoomSheetRow } from '@/components/events/LiveRoomSheet'
import { LIVE_ROOM_COPY } from '@/lib/constants'

function participantStateLabel(entry, { canPublish, isMicActive }) {
  if (entry.isHost) return LIVE_ROOM_COPY.roleHost
  if (entry.coHost) return LIVE_ROOM_COPY.roleCoHost
  if (canPublish) return isMicActive ? LIVE_ROOM_COPY.stateMicOn : LIVE_ROOM_COPY.stateMicOff
  if (entry.handRaised) return LIVE_ROOM_COPY.stateHandRaised
  return LIVE_ROOM_COPY.stateListening
}

/**
 * Fila de participantes de un stream (`broadcast`) en la sala compacta.
 *
 * - El botón de mano va FUERA del contenedor con scroll: si se desplazara con la
 *   fila, quien quiere pedir la palabra tendría que volver al principio.
 * - `py-2` no es estético: `overflow-x: auto` recorta también el eje Y y las
 *   insignias sobresalen 4 px.
 * - `overscroll-behavior-x: contain`: en Chrome para Android, seguir deslizando
 *   al final de un contenedor dispara la navegación hacia atrás.
 * - Tocar un cuadrado abre su hoja (nombre, estado y acciones del rol); nunca
 *   actúa directamente.
 *
 * Mismo orden, colores y estados que la rejilla de escritorio: el tile y la
 * función de orden son los mismos (ParticipantTile).
 */
export default function CompactParticipantRow({
  presence, selfIdentity, remoteByUid, speakingUids, viewerIsHost,
  localMicEnabled, amSpeaker, showHand, handRaised, onToggleHand,
  onPromote, onDemote, onSelfMute,
}) {
  const [selectedIdentity, setSelectedIdentity] = useState(null)

  // Identities that were ever promoted (red styling after demotion) — same
  // bookkeeping as the desktop grid
  const everSpeakerRef = useRef(new Set())
  for (const p of presence) {
    if (p.speaker && !p.isHost) everSpeakerRef.current.add(p.identity)
  }

  const entries = useMemo(
    () => sortParticipants(viewerIsHost ? presence.filter((p) => !p.isHost) : presence, selfIdentity),
    [presence, viewerIsHost, selfIdentity]
  )

  const selected = selectedIdentity ? presence.find((p) => p.identity === selectedIdentity) || null : null
  const closeSheet = () => setSelectedIdentity(null)

  let sheetBody = null
  if (selected) {
    const isLocal = selected.identity === selfIdentity
    const media = participantMediaState(selected, { isLocal, remoteByUid, localMicEnabled, amSpeaker })
    const protectedTarget = selected.isHost || selected.coHost || selected.staff
    const actions = []
    if (!protectedTarget) {
      if (isLocal) {
        if (media.canPublish && media.isMicActive) {
          actions.push({ label: LIVE_ROOM_COPY.muteSelf, run: onSelfMute })
        }
      } else if (viewerIsHost) {
        actions.push(media.canPublish
          ? { label: LIVE_ROOM_COPY.removeFloor, run: () => onDemote(selected.identity), danger: true }
          : { label: LIVE_ROOM_COPY.giveFloor, run: () => onPromote(selected.identity) })
      }
    }
    sheetBody = (
      <>
        <p className="border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
          {participantStateLabel(selected, media)}
        </p>
        {actions.map((action) => (
          <LiveRoomSheetRow
            key={action.label}
            label={action.label}
            danger={action.danger}
            onClick={() => { action.run?.(); closeSheet() }}
          />
        ))}
      </>
    )
  }

  const selectedTitle = selected
    ? (selected.identity === selfIdentity ? `${selected.name || ''} ${LIVE_ROOM_COPY.you}`.trim() : (selected.name || LIVE_ROOM_COPY.participant))
    : ''

  return (
    <div className="flex h-[60px] flex-shrink-0 items-center border-b border-gray-200 bg-white">
      {showHand && (
        <div className="flex h-full flex-shrink-0 items-center border-r border-gray-200 px-2">
          <button
            type="button"
            onClick={onToggleHand}
            aria-pressed={handRaised}
            aria-label={handRaised ? LIVE_ROOM_COPY.lowerHand : LIVE_ROOM_COPY.raiseHand}
            className={`flex size-11 items-center justify-center rounded-lg ring-1 [touch-action:manipulation] ${
              handRaised
                ? 'bg-amber-100 text-amber-800 ring-amber-300'
                : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
            }`}
          >
            <HandIcon className="size-5" />
          </button>
        </div>
      )}

      <div className="scrollbar-hide flex h-full min-w-0 flex-1 items-center gap-x-2 overflow-x-auto overscroll-x-contain px-2 py-2">
        {entries.map((p) => (
          <ParticipantTile
            key={p.identity}
            size="compact"
            entry={p}
            isLocal={p.identity === selfIdentity}
            viewerIsHost={viewerIsHost}
            remoteByUid={remoteByUid}
            speakingUids={speakingUids}
            localMicEnabled={localMicEnabled}
            amSpeaker={amSpeaker}
            wasPromoted={everSpeakerRef.current.has(p.identity)}
            onSelect={(entry) => setSelectedIdentity(entry.identity)}
          />
        ))}
      </div>

      <LiveRoomSheet open={!!selected} title={selectedTitle} onClose={closeSheet}>
        {sheetBody}
      </LiveRoomSheet>
    </div>
  )
}
