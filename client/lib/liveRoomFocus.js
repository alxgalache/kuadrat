// Marca del campo de escribir del chat de la sala en directo. La leen dos hooks
// que tienen que coincidir: useCompactRoomLayout, que congela la disposición
// mientras se escribe, y useLiveRoomViewport, que decide si el teclado está
// abierto. Un selector escrito dos veces a mano es lo que acaba divergiendo.
export const CHAT_COMPOSER_SELECTOR = '[data-chat-composer]'

export function isChatComposerFocused() {
  if (typeof document === 'undefined') return false
  const el = document.activeElement
  return !!el?.closest?.(CHAT_COMPOSER_SELECTOR)
}
