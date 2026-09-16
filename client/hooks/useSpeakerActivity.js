'use client'

import { useEffect, useRef, useState } from 'react'
import { MEETING_SPEAKER_HOLD_MS } from '@/lib/constants'

function toSnapshot(entries) {
  const snapshot = new Map()
  for (const [identity, entry] of entries) snapshot.set(identity, entry.since)
  return snapshot
}

/**
 * Quién está hablando en una reunión, con memoria: identidad → instante en que
 * EMPEZÓ a hablar. Lo consume `speakerRanks` (lib/meetingGrid.js) para llevar a
 * los primeros puestos a quien se oye.
 *
 * La entrada es la lista de identidades que ahora mismo se oyen, derivada de
 * `speakingUids` de useAgoraRoom — que a su vez sale de `volume-indicator`, el
 * evento de Agora que informa del nivel de cada usuario cada dos segundos.
 *
 * Por qué no basta con esa lista tal cual:
 * - `speakingUids` NO cambia mientras la misma persona sigue hablando (useAgoraRoom
 *   conserva el conjunto si es igual), así que no hay un «latido» por informe. Por
 *   eso quien sigue en la lista está activo sin plazo, y el plazo empieza a correr
 *   solo cuando SALE de ella.
 * - Quien deja de oírse conserva su puesto MEETING_SPEAKER_HOLD_MS: las pausas
 *   entre frases duran menos que eso, y sin memoria la rejilla se reordenaría a
 *   cada respiración.
 * - Quien vuelve a hablar dentro de ese plazo conserva su instante original, así
 *   que no adelanta a quien ya estaba hablando.
 *
 * @param {string[]} speakingIdentities
 * @returns {Map<string, number>}
 */
export default function useSpeakerActivity(speakingIdentities) {
  const entriesRef = useRef(new Map()) // identidad → { since, speaking, lastHeard }
  const [snapshot, setSnapshot] = useState(() => new Map())
  const key = [...speakingIdentities].sort().join('|')

  useEffect(() => {
    const now = Date.now()
    const speaking = new Set(key ? key.split('|') : [])
    const entries = entriesRef.current
    let changed = false

    for (const identity of speaking) {
      const entry = entries.get(identity)
      if (!entry) {
        entries.set(identity, { since: now, speaking: true, lastHeard: now })
        changed = true
      } else {
        entry.speaking = true
      }
    }
    for (const [identity, entry] of entries) {
      if (entry.speaking && !speaking.has(identity)) {
        entry.speaking = false
        entry.lastHeard = now
      }
    }

    if (changed) setSnapshot(toSnapshot(entries))
  }, [key])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      const entries = entriesRef.current
      let changed = false
      for (const [identity, entry] of entries) {
        if (!entry.speaking && now - entry.lastHeard > MEETING_SPEAKER_HOLD_MS) {
          entries.delete(identity)
          changed = true
        }
      }
      if (changed) setSnapshot(toSnapshot(entries))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return snapshot
}
