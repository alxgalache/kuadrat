'use client'

import { useMemo, useState } from 'react'
import { participantMediaState } from '@/components/events/ParticipantTile'
import { participantStateLabel, normalizeName } from '@/lib/participantRow'
import { LIVE_ROOM_COPY, PARTICIPANT_LIST_MAX_ROWS } from '@/lib/constants'

/**
 * Lista completa de participantes de un evento `broadcast`, que abre el
 * recuadro «+N más» de la fila.
 *
 * Es lo que hace admisible truncar la fila: sin ella, el host solo podría
 * actuar sobre quien cupiera, y quien no hubiera levantado la mano sería
 * inalcanzable en una sala de trescientas personas.
 *
 * Una sola implementación con dos envoltorios — la hoja inferior en la sala
 * compacta y un panel en línea en escritorio —, nunca un portal a
 * `document.body`: la misma regla que la consola móvil del host.
 *
 * Detalles que no son cosméticos:
 * - **Las acciones son botones con su texto, no la fila entera.** La regla de la
 *   sala compacta (un toque impreciso no debe dar la palabra a otra persona) se
 *   cumple mejor con un botón etiquetado que apilando una segunda hoja.
 * - **No se cierra al actuar:** el host da la palabra a varias personas seguidas.
 * - **El buscador va a 16 px** porque por debajo iOS amplía la página, y la
 *   ampliación persiste.
 * - **Tope de filas pintadas.** Mil filas en el DOM de una sala con vídeo se
 *   notan; la respuesta es buscar, no desplazarse.
 */
export default function ParticipantList({
  entries, ranks, selfIdentity, remoteByUid, viewerIsHost,
  localMicEnabled, amSpeaker, onPromote, onDemote, onSelfMute,
}) {
  const [query, setQuery] = useState('')

  const ordered = useMemo(
    () => [...entries].sort((a, b) => (ranks.get(a.identity) ?? 0) - (ranks.get(b.identity) ?? 0)),
    [entries, ranks]
  )

  const filtered = useMemo(() => {
    const needle = normalizeName(query.trim())
    if (!needle) return ordered
    return ordered.filter((entry) => normalizeName(entry.name || entry.identity).includes(needle))
  }, [ordered, query])

  const shown = filtered.slice(0, PARTICIPANT_LIST_MAX_ROWS)

  return (
    <>
      <div className="flex-shrink-0 border-b border-gray-200 p-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={LIVE_ROOM_COPY.searchParticipants}
          aria-label={LIVE_ROOM_COPY.searchParticipants}
          className="block w-full rounded-md border-0 px-3 py-2 text-base text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900"
        />
      </div>

      {shown.length === 0 && (
        <p className="px-4 py-3 text-sm text-gray-500">{LIVE_ROOM_COPY.noParticipantsFound}</p>
      )}

      <ul className="divide-y divide-gray-100">
        {shown.map((entry) => (
          <ParticipantListRow
            key={entry.identity}
            entry={entry}
            isLocal={entry.identity === selfIdentity}
            viewerIsHost={viewerIsHost}
            remoteByUid={remoteByUid}
            localMicEnabled={localMicEnabled}
            amSpeaker={amSpeaker}
            onPromote={onPromote}
            onDemote={onDemote}
            onSelfMute={onSelfMute}
          />
        ))}
      </ul>

      {filtered.length > shown.length && (
        <p className="px-4 py-2 text-xs text-gray-500">
          {LIVE_ROOM_COPY.listTruncated(shown.length, filtered.length)}
        </p>
      )}
    </>
  )
}

function ParticipantListRow({
  entry, isLocal, viewerIsHost, remoteByUid, localMicEnabled, amSpeaker,
  onPromote, onDemote, onSelfMute,
}) {
  const media = participantMediaState(entry, { isLocal, remoteByUid, localMicEnabled, amSpeaker })
  // El host, el co-presentador y el personal de la galería no son objetivo de
  // moderación: el servidor los rechaza con 400, así que tampoco se ofrece.
  const protectedTarget = entry.isHost || entry.coHost || entry.staff

  let action = null
  if (!protectedTarget) {
    if (isLocal) {
      if (media.canPublish && media.isMicActive) {
        action = { label: LIVE_ROOM_COPY.muteSelf, run: onSelfMute }
      }
    } else if (viewerIsHost) {
      action = media.canPublish
        ? { label: LIVE_ROOM_COPY.removeFloor, run: () => onDemote(entry.identity), danger: true }
        : { label: LIVE_ROOM_COPY.giveFloor, run: () => onPromote(entry.identity) }
    }
  }

  const name = entry.name || entry.identity || '?'
  const displayName = isLocal ? `${name} ${LIVE_ROOM_COPY.you}` : name

  return (
    <li className="flex min-h-12 items-center gap-x-3 px-4 py-2">
      <span
        aria-hidden="true"
        className={`flex size-8 flex-shrink-0 items-center justify-center rounded-md text-sm font-semibold ${
          entry.handRaised && !media.canPublish
            ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300'
            : media.canPublish
              ? 'bg-green-50 text-green-800 ring-1 ring-green-300'
              : 'bg-gray-50 text-gray-600 ring-1 ring-gray-300'
        }`}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-gray-900">{displayName}</span>
        <span className="truncate text-xs text-gray-500">{participantStateLabel(entry, media)}</span>
      </span>
      {action && (
        <button
          type="button"
          onClick={action.run}
          className={`flex-shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 [touch-action:manipulation] ${
            action.danger
              ? 'bg-white text-red-600 ring-red-300 hover:bg-red-50'
              : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
          }`}
        >
          {action.label}
        </button>
      )}
    </li>
  )
}
