import {
  MEETING_GRID_COLUMN_OPTIONS,
  MEETING_GRID_MAX_ROWS,
  MEETING_GRID_MIN_TILE_PX,
} from '@/lib/constants'

/**
 * Columnas de la rejilla de cámaras del host en una reunión (escritorio, sin
 * contenido destacado): la MENOR de MEETING_GRID_COLUMN_OPTIONS (3, 4, 5) que
 * reparta los recuadros en MEETING_GRID_MAX_ROWS filas como máximo.
 *
 *   1-9 recuadros → 3 columnas · 10-12 → 4 · 13-15 → 5 · 16-17 → 5 (4 filas)
 *
 * Menos columnas es más grande: en una reunión ver las caras es la función, así
 * que la rejilla solo se densifica cuando hace falta para no pasar de 3 filas.
 * Con 16-17 recuadros (el máximo de la modalidad) no hay opción de la lista que
 * quepa en 3; se usa la última y `meetingTileSize` los encoge para que la cuarta
 * fila siga viéndose sin scroll.
 *
 * @param {number} count - Recuadros en la rejilla, el del host incluido
 * @returns {number}
 */
export function meetingGridColumns(count) {
  for (const columns of MEETING_GRID_COLUMN_OPTIONS) {
    if (Math.ceil(count / columns) <= MEETING_GRID_MAX_ROWS) return columns
  }
  return MEETING_GRID_COLUMN_OPTIONS[MEETING_GRID_COLUMN_OPTIONS.length - 1]
}

/**
 * Lado del recuadro cuadrado que cabe a la vez en el ancho Y en el alto de la
 * caja: el ancho limita en ventanas estrechas, el alto en las panorámicas (tres
 * filas de 330 px no caben en una columna de 740). Sin alto medido (caja sin
 * altura definida), manda el ancho.
 *
 * @param {object} params
 * @param {number} params.width - Ancho disponible (px)
 * @param {number} params.height - Alto disponible (px)
 * @param {number} params.columns
 * @param {number} params.rows
 * @param {number} params.gap - Separación entre recuadros (px)
 * @returns {number} px enteros
 */
export function meetingTileSize({ width, height, columns, rows, gap }) {
  const byWidth = (width - (columns - 1) * gap) / columns
  const byHeight = height > 0 ? (height - (rows - 1) * gap) / rows : byWidth
  return Math.max(MEETING_GRID_MIN_TILE_PX, Math.floor(Math.min(byWidth, byHeight)))
}

/**
 * Puesto de cada recuadro de una reunión, para CSS `order`:
 *
 *   1. `pinnedIdentity` (el propio host en su rejilla), siempre el primero;
 *   2. quienes están hablando o hablaron hace poco (useSpeakerActivity), por el
 *      momento en que EMPEZARON a hablar — no por el último que habló, que en un
 *      diálogo intercambiaría los dos recuadros a cada frase;
 *   3. el resto, en el orden de la lista (el de llegada).
 *
 * `selfIdentity` nunca se promueve: el propio recuadro no salta bajo los ojos de
 * quien habla.
 *
 * @param {Array<{identity: string}>} entries
 * @param {Map<string, number>} activity - identidad → instante en que empezó a hablar
 * @param {object} [options]
 * @param {string|null} [options.pinnedIdentity]
 * @param {string|null} [options.selfIdentity]
 * @returns {Map<string, number>} identidad → puesto
 */
export function speakerRanks(entries, activity, { pinnedIdentity = null, selfIdentity = null } = {}) {
  const ranks = new Map()
  let next = 0

  if (pinnedIdentity && entries.some((entry) => entry.identity === pinnedIdentity)) {
    ranks.set(pinnedIdentity, next++)
  }

  const speakers = entries
    .filter((entry) => (
      entry.identity !== pinnedIdentity &&
      entry.identity !== selfIdentity &&
      activity.has(entry.identity)
    ))
    .sort((a, b) => activity.get(a.identity) - activity.get(b.identity))
  for (const entry of speakers) ranks.set(entry.identity, next++)

  for (const entry of entries) {
    if (!ranks.has(entry.identity)) ranks.set(entry.identity, next++)
  }
  return ranks
}
