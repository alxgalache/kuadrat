'use client'

import { useRef, useState } from 'react'
import ParticipantTile, { HandIcon, MoreParticipantsTile, participantMediaState } from '@/components/events/ParticipantTile'
import ParticipantList from '@/components/events/ParticipantList'
import LiveRoomSheet, { LiveRoomSheetRow } from '@/components/events/LiveRoomSheet'
import { participantStateLabel, rowWindow } from '@/lib/participantRow'
import { BROADCAST_ROW_COMPACT_MAX, LIVE_ROOM_COPY } from '@/lib/constants'

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
 *   actúa directamente. Por eso esta fila, al revés que la de escritorio, no
 *   congela su orden bajo el puntero: no hay acción que equivocar.
 * - La fila se corta en BROADCAST_ROW_COMPACT_MAX cuadrados y cierra con el
 *   recuadro «+N más», que abre la lista completa. El tope no está para que
 *   quepan, sino para que deslizar tenga fin: con cientos de asistentes, el
 *   scroll sin fin era el problema.
 *
 * Mismo orden, colores y estados que la fila de escritorio: el cuadrado, el
 * orden (`participantRanks`) y la ventana (`rowWindow`) son los mismos.
 */
export default function CompactParticipantRow({
  entries, ranks, selfIdentity, remoteByUid, viewerIsHost,
  localMicEnabled, amSpeaker, showHand, handRaised, onToggleHand,
  onPromote, onDemote, onSelfMute,
}) {
  // null | { kind: 'participant', identity } | { kind: 'list' }
  const [sheet, setSheet] = useState(null)

  // Identities that were ever promoted (red styling after demotion) — same
  // bookkeeping as the desktop row
  const everSpeakerRef = useRef(new Set())
  for (const p of entries) {
    if (p.speaker && !p.isHost) everSpeakerRef.current.add(p.identity)
  }

  // Un hueco más que el tope: el del contador. Así, con exactamente 21
  // asistentes se ven los 21 en lugar de 20 y un «+1 más».
  const { tiles, more } = rowWindow({
    entries,
    ranks,
    selfIdentity,
    capacity: BROADCAST_ROW_COMPACT_MAX + 1,
  })

  const selected = sheet?.kind === 'participant'
    ? entries.find((p) => p.identity === sheet.identity) || null
    : null
  const listOpen = sheet?.kind === 'list'
  const closeSheet = () => setSheet(null)

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
        {tiles.map((p) => (
          <ParticipantTile
            key={p.identity}
            size="compact"
            entry={p}
            isLocal={p.identity === selfIdentity}
            viewerIsHost={viewerIsHost}
            remoteByUid={remoteByUid}
            localMicEnabled={localMicEnabled}
            amSpeaker={amSpeaker}
            wasPromoted={everSpeakerRef.current.has(p.identity)}
            onSelect={(entry) => setSheet({ kind: 'participant', identity: entry.identity })}
          />
        ))}
        {more > 0 && (
          <MoreParticipantsTile
            size="compact"
            count={more}
            total={entries.length}
            expanded={listOpen}
            onClick={() => setSheet({ kind: 'list' })}
          />
        )}
      </div>

      <LiveRoomSheet open={!!selected} title={selectedTitle} onClose={closeSheet}>
        {sheetBody}
      </LiveRoomSheet>

      <LiveRoomSheet
        open={listOpen}
        title={`${LIVE_ROOM_COPY.participants} (${entries.length})`}
        onClose={closeSheet}
      >
        {listOpen && (
          <ParticipantList
            entries={entries}
            ranks={ranks}
            selfIdentity={selfIdentity}
            remoteByUid={remoteByUid}
            viewerIsHost={viewerIsHost}
            localMicEnabled={localMicEnabled}
            amSpeaker={amSpeaker}
            onPromote={onPromote}
            onDemote={onDemote}
            onSelfMute={onSelfMute}
          />
        )}
      </LiveRoomSheet>
    </div>
  )
}
