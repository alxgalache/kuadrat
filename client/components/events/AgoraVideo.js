'use client'

import { useEffect, useRef } from 'react'

/**
 * Plays a local or remote Agora video track into a div.
 *
 * AN AGORA TRACK PLAYS IN ONE CONTAINER AT A TIME: unmounting an instance calls
 * `track.stop()`, which blanks any other element the same track was playing
 * in. Every layout that moves a track (theater, host view modes, the broadcast
 * stage) relies on rendering it in exactly one AgoraVideo.
 *
 * `mirror` follows the SDK default when omitted: Agora MIRRORS a local camera
 * preview and never mirrors remote tracks. That is the right convention for a
 * front-camera self-view and the wrong one for the host's video, which goes out
 * as captured: with a phone's rear camera on a tripod the host saw their own
 * framing reversed — and any text in shot unreadable — while attendees received
 * it correctly. Only the host's video turns it off; meeting tiles and the
 * co-presenter's self-view keep the mirrored preview.
 */
export default function AgoraVideo({ track, className, fit = 'contain', mirror }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!track || !el) return
    try {
      track.play(el, mirror === undefined ? { fit } : { fit, mirror })
    } catch (err) {
      console.warn('Agora video play error:', err)
    }
    return () => {
      try { track.stop() } catch { /* already stopped */ }
    }
  }, [track, fit, mirror])

  return <div ref={containerRef} className={className} />
}
