/**
 * Shared Google Maps script loader (singleton).
 *
 * Ensures the Maps JS API is loaded at most once, regardless of how many
 * components request it.  The first caller determines which libraries are
 * included; subsequent calls resolve immediately once the script is ready.
 */

let loading = false
let loaded = false
const callbacks = []

/**
 * Load the Google Maps JavaScript API.
 *
 * @param {string} [libraries='places'] - Comma-separated list of libraries
 *   to include (e.g. 'places,marker').
 * @returns {Promise<void>} Resolves when `window.google.maps` is available.
 */
export function loadGoogleMaps(libraries = 'places') {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (loaded && window.google?.maps) {
      resolve()
      return
    }

    // Currently loading – queue up
    if (loading) {
      callbacks.push({ resolve, reject })
      return
    }

    // Check for an existing script tag (e.g. injected by a third party)
    const existing = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    )
    if (existing) {
      loading = true
      callbacks.push({ resolve, reject })

      const poll = () => {
        if (window.google?.maps) {
          loaded = true
          loading = false
          callbacks.forEach(cb => cb.resolve())
          callbacks.length = 0
        } else {
          setTimeout(poll, 100)
        }
      }
      poll()
      return
    }

    // First load
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured'))
      return
    }

    loading = true
    callbacks.push({ resolve, reject })

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries}&language=es&loading=async`
    script.async = true
    script.defer = true
    script.id = 'google-maps-script'

    script.onload = () => {
      loaded = true
      loading = false
      callbacks.forEach(cb => cb.resolve())
      callbacks.length = 0
    }

    script.onerror = () => {
      loading = false
      const err = new Error('Failed to load Google Maps script')
      callbacks.forEach(cb => cb.reject(err))
      callbacks.length = 0
    }

    document.head.appendChild(script)
  })
}
