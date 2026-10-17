/**
 * Client mirror of `api/utils/stageCovers.js` (agora-stage-covers): the three
 * stage covers of an Agora broadcast, same ids and same files. The two change
 * together, and a published file is never overwritten — a new design ships
 * as the next `-vN` in client/public/cortinillas/ and both catalogues move to
 * it. In use: `-v2`, the dark covers (the white `-v1` blended into the page).
 */

export const STAGE_COVERS = [
  { id: 'inicio', label: 'Inicio', src: '/cortinillas/inicio-v2.jpg', headline: 'Empezamos en breve' },
  { id: 'intermedio', label: 'Intermedio', src: '/cortinillas/intermedio-v2.jpg', headline: 'Volvemos enseguida' },
  { id: 'final', label: 'Final', src: '/cortinillas/final-v2.jpg', headline: 'Gracias por acompañarnos' },
]

/** The cover with this id, or null (no cover, or an id this build does not know). */
export function stageCoverById(id) {
  return STAGE_COVERS.find((cover) => cover.id === id) || null
}

/** Mirror of the server's predicate: covers exist only on an Agora broadcast stage. */
export function supportsStageCovers({ provider, interaction_mode: interactionMode, format } = {}) {
  return provider === 'agora' && interactionMode === 'broadcast' && format === 'live'
}
