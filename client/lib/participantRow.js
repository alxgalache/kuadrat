import { LIVE_ROOM_COPY } from '@/lib/constants'

/**
 * Orden y ventana de la fila de participantes de un evento Agora `broadcast`.
 *
 * Es la ÚNICA fuente de las dos cosas: la fila de escritorio, la fila compacta
 * y la lista completa las leen de aquí. Tres copias de un predicado es lo que
 * documenta `zoneResolver` y lo que pagó el typo `productCategory === 'others'`
 * de `ProductForm`.
 *
 * Nada de esto usa CSS `order`, al revés que las rejillas del modo `meeting`:
 * allí los recuadros llevan `<video>` de Agora y moverlos de nodo los corta;
 * aquí un cuadrado es un `<button>` con una letra, y montar un nodo por
 * asistente es justo el coste que esta fila elimina.
 */

// Escalones de prioridad. El propio usuario va SIEMPRE el último y nunca se
// promueve: su cuadrado no debe saltar bajo sus propios ojos (misma regla que
// `speakerRanks` en el modo meeting).
const TIER_HOST = 0
const TIER_COHOST = 1
const TIER_HAND = 2
const TIER_FLOOR = 3
const TIER_REST = 4
const TIER_SELF = 5

/**
 * Quién no puede caer dentro del «+N más»: el host, el co-presentador y quien
 * tiene la palabra. Decisión de producto: las manos levantadas adelantan a
 * quien tiene la palabra en el ORDEN, pero no pueden echarlo de la vista — una
 * fila en la que no está quien está hablando no sirve para lo que existe.
 */
function isGuaranteed(entry) {
  return !!(entry.isHost || entry.coHost || entry.speaker)
}

function tierOf(entry, selfIdentity) {
  if (entry.identity === selfIdentity) return TIER_SELF
  if (entry.isHost) return TIER_HOST
  if (entry.coHost) return TIER_COHOST
  // Un promovido que levanta la mano se queda en el escalón de la palabra: ya
  // la tiene. Su insignia ámbar se sigue viendo.
  if (entry.handRaised && !entry.speaker) return TIER_HAND
  if (entry.speaker) return TIER_FLOOR
  return TIER_REST
}

/**
 * Puesto de cada participante en la fila, para ordenar y para recortar.
 *
 *   0. host · 1. co-presentador
 *   2. mano levantada sin palabra, por `handRaisedAt` ASCENDENTE (cola de turno:
 *      la mano más antigua primero; sin sello, al final del escalón)
 *   3. con la palabra: primero quien se está oyendo, por el instante en que
 *      EMPEZÓ a hablar (`useSpeakerActivity`); después, orden de llegada
 *   4. el resto, orden de llegada
 *   5. el propio usuario, siempre el último
 *
 * @param {Array<object>} entries - Entradas de presencia, ya filtradas para la vista
 * @param {object} [options]
 * @param {string|null} [options.selfIdentity]
 * @param {Map<string, number>|null} [options.activity] - identidad → instante en que empezó a hablar
 * @returns {Map<string, number>} identidad → puesto
 */
export function participantRanks(entries, { selfIdentity = null, activity = null } = {}) {
  const arrival = new Map(entries.map((entry, index) => [entry.identity, index]))

  const byArrival = (a, b) => arrival.get(a.identity) - arrival.get(b.identity)

  // Comparación de dos instantes donde el menor va primero y la ausencia va
  // detrás de cualquier sello. `null` no es «hace mucho»: es «no se sabe».
  const bySince = (a, b, valueOf) => {
    const va = valueOf(a)
    const vb = valueOf(b)
    if (va != null && vb != null) return va === vb ? 0 : va - vb
    if (va != null) return -1
    if (vb != null) return 1
    return 0
  }

  const sorted = [...entries].sort((a, b) => {
    const ta = tierOf(a, selfIdentity)
    const tb = tierOf(b, selfIdentity)
    if (ta !== tb) return ta - tb
    if (ta === TIER_HAND) {
      const cmp = bySince(a, b, (entry) => entry.handRaisedAt ?? null)
      if (cmp !== 0) return cmp
    }
    if (ta === TIER_FLOOR && activity) {
      const cmp = bySince(a, b, (entry) => (activity.has(entry.identity) ? activity.get(entry.identity) : null))
      if (cmp !== 0) return cmp
    }
    return byArrival(a, b)
  })

  const ranks = new Map()
  sorted.forEach((entry, index) => ranks.set(entry.identity, index))
  return ranks
}

/**
 * Ventana visible de la fila: qué cuadrados se pintan y cuántos quedan dentro
 * del recuadro «+N más».
 *
 * `capacity` son los HUECOS que la fila pinta, **contando el del contador**. En
 * escritorio se mide con un ResizeObserver; en compacto es un tope fijo, porque
 * allí la fila sí se desplaza y el tope no está para que quepa sino para que
 * deslizar tenga fin.
 *
 * Reglas, por orden de aplicación:
 *   1. Si caben todos, se pintan todos y no hay contador.
 *   2. El último hueco es el contador.
 *   3. El cuadrado propio tiene hueco reservado, el último antes del contador.
 *   4. Los huecos restantes son PRIMERO para los escalones garantizados
 *      (host, co-presentador y quien tiene la palabra) y luego para el resto.
 *   5. La ventana se devuelve en orden de rango, con el propio al final.
 *
 * @param {object} params
 * @param {Array<object>} params.entries
 * @param {Map<string, number>} params.ranks
 * @param {string|null} [params.selfIdentity]
 * @param {number} params.capacity
 * @returns {{ tiles: Array<object>, more: number }}
 */
export function rowWindow({ entries, ranks, selfIdentity = null, capacity }) {
  const ordered = [...entries].sort(
    (a, b) => (ranks.get(a.identity) ?? 0) - (ranks.get(b.identity) ?? 0)
  )

  if (ordered.length <= capacity) return { tiles: ordered, more: 0 }
  // Una fila de un solo hueco solo puede decir cuánta gente hay.
  if (capacity <= 1) return { tiles: [], more: ordered.length }

  const self = selfIdentity ? ordered.find((entry) => entry.identity === selfIdentity) || null : null
  const rest = self ? ordered.filter((entry) => entry.identity !== selfIdentity) : ordered

  let slots = capacity - 1 - (self ? 1 : 0)
  if (slots < 0) slots = 0

  const chosen = new Set()
  for (const entry of rest) {
    if (chosen.size >= slots) break
    if (isGuaranteed(entry)) chosen.add(entry.identity)
  }
  for (const entry of rest) {
    if (chosen.size >= slots) break
    chosen.add(entry.identity)
  }

  const tiles = rest.filter((entry) => chosen.has(entry.identity))
  if (self) tiles.push(self)
  return { tiles, more: ordered.length - tiles.length }
}

/**
 * Estado de un participante en es-ES, tal como lo leen la hoja de un
 * participante y la lista completa.
 */
export function participantStateLabel(entry, { canPublish, isMicActive }) {
  if (entry.isHost) return LIVE_ROOM_COPY.roleHost
  if (entry.coHost) return LIVE_ROOM_COPY.roleCoHost
  if (canPublish) return isMicActive ? LIVE_ROOM_COPY.stateMicOn : LIVE_ROOM_COPY.stateMicOff
  if (entry.handRaised) return LIVE_ROOM_COPY.stateHandRaised
  return LIVE_ROOM_COPY.stateListening
}

/**
 * Comparación de nombres del buscador: sin mayúsculas y **sin acentos**, para
 * que «jose» encuentre a «José». En es-ES esto no es un extra.
 */
export function normalizeName(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
