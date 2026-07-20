'use client'

/**
 * React 19 removed the legacy `ReactDOM.render` and `ReactDOM.unmountComponentAtNode`.
 * The Agora Interactive Whiteboard (`white-web-sdk` 2.16.x) still calls them internally
 * when it binds its container — under React 19 this throws
 * `TypeError: render is not a function` / `[fastboard] An error occurred while binding
 * container`, leaving the board visible but NOT drawable. We re-map the legacy APIs onto
 * `createRoot` so the SDK keeps working.
 *
 * Imported for its side effect (before `@netless/fastboard`) from WhiteboardPanel, which
 * is itself a client-only dynamic import — so this only loads when the whiteboard opens.
 *
 * `react-dom` 19 is CJS, so the default import is the shared, mutable `module.exports`
 * object; patching it is visible to white-web-sdk's own `require('react-dom')`.
 */

import ReactDOM, { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

if (ReactDOM && typeof ReactDOM.render !== 'function') {
  // One React root per container node (legacy render() reused the container).
  const roots = new WeakMap()

  try {
    ReactDOM.render = function render(element, container, callback) {
      let root = roots.get(container)
      if (!root) {
        root = createRoot(container)
        roots.set(container, root)
      }
      // Legacy render() mounted synchronously; flushSync keeps that contract for the
      // SDK code that reads the DOM right after rendering. Fall back to async render if
      // flushSync is unavailable in this context.
      try {
        flushSync(() => root.render(element))
      } catch {
        root.render(element)
      }
      if (typeof callback === 'function') callback()
      return null
    }

    ReactDOM.unmountComponentAtNode = function unmountComponentAtNode(container) {
      const root = roots.get(container)
      if (root) {
        root.unmount()
        roots.delete(container)
        return true
      }
      return false
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('No se pudo aplicar el shim legacy de react-dom para la pizarra:', err)
  }
}
