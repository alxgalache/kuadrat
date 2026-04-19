'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

/**
 * Synchronized video player for video-format events.
 * Calculates playback position from the server's start timestamp plus a
 * client/server clock offset, so all viewers share the same moment regardless
 * of when they join. Waits for the browser `seeked` event before starting
 * playback and revealing the frame — avoids the pre-fix flash of position 0.
 *
 * Controls: volume + fullscreen only. No pause, seek, or progress bar.
 */
export default function EventVideoPlayer({
  videoUrl,
  videoStartedAt,
  eventTitle,
  serverTimeOffset = 0,
}) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const wasWaitingRef = useRef(false)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(0.8)
  const [videoReady, setVideoReady] = useState(false)
  const [seekReady, setSeekReady] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [videoEnded, setVideoEnded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const MAX_RETRIES = 3

  // Enforce HTTPS for external URLs (S3 presigned URLs, CDN, etc.)
  const safeVideoUrl = useMemo(() => {
    if (!videoUrl) return null
    if (videoUrl.startsWith('http://') && !videoUrl.includes('localhost') && !videoUrl.includes('127.0.0.1')) {
      return videoUrl.replace('http://', 'https://')
    }
    return videoUrl
  }, [videoUrl])

  // Server-synchronized elapsed seconds since the event started
  const getElapsedSeconds = useCallback(() => {
    if (!videoStartedAt) return 0
    const now = Date.now() + serverTimeOffset
    return (now - new Date(videoStartedAt).getTime()) / 1000
  }, [videoStartedAt, serverTimeOffset])

  // Reset sync state whenever the source URL changes (e.g. token refresh).
  // Also force an explicit `load()` — for some cross-origin videos (notably
  // CloudFront) the implicit load triggered by React setting the `src`
  // attribute leaves the media element in a state where `seeked` never
  // fires after the initial `currentTime` assignment. Calling `load()`
  // replicates the successful path that our retry takes, but eagerly.
  useEffect(() => {
    setVideoReady(false)
    setSeekReady(false)
    setVideoError(false)
    setVideoEnded(false)
    setRetryCount(0)
    if (videoRef.current && safeVideoUrl) {
      videoRef.current.load()
    }
  }, [safeVideoUrl])

  // seek → wait `seeked` → play → reveal
  useEffect(() => {
    if (!videoReady || !videoRef.current) return
    if (seekReady) return

    const video = videoRef.current
    const elapsed = getElapsedSeconds()

    if (elapsed < 0) return
    if (video.duration && elapsed >= video.duration) {
      setVideoEnded(true)
      return
    }

    const handleSeeked = () => {
      setSeekReady(true)
      video.play().catch(() => {
        // Autoplay blocked — the unmute overlay below is the gate
      })
    }

    video.addEventListener('seeked', handleSeeked, { once: true })
    video.currentTime = elapsed

    return () => {
      video.removeEventListener('seeked', handleSeeked)
    }
  }, [videoReady, seekReady, getElapsedSeconds])

  // Cinema-mode drift correction every 10 s while playing
  useEffect(() => {
    if (!seekReady || videoEnded) return

    const interval = setInterval(() => {
      const video = videoRef.current
      if (!video || video.paused) return
      const expected = getElapsedSeconds()
      if (video.duration && expected >= video.duration) {
        setVideoEnded(true)
        return
      }
      if (Math.abs(expected - video.currentTime) > 2) {
        video.currentTime = expected
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [seekReady, videoEnded, getElapsedSeconds])

  // Cinema-mode recovery: after buffering, jump to the server-expected position
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onWaiting = () => {
      wasWaitingRef.current = true
    }
    const onPlaying = () => {
      if (!wasWaitingRef.current || !seekReady) return
      wasWaitingRef.current = false
      const expected = getElapsedSeconds()
      if (video.duration && expected >= video.duration) {
        setVideoEnded(true)
        return
      }
      if (Math.abs(expected - video.currentTime) > 1) {
        video.currentTime = expected
      }
    }

    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    return () => {
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
    }
  }, [seekReady, getElapsedSeconds])

  // Timeout covers both "metadata never loads" and "seek never completes"
  useEffect(() => {
    if (seekReady || videoError || videoEnded) return

    const timeout = setTimeout(() => {
      if (!videoRef.current) return
      if (retryCount < MAX_RETRIES) {
        console.warn(`[VideoPlayer] Load/seek timeout, retrying (${retryCount + 1}/${MAX_RETRIES})`)
        setRetryCount((prev) => prev + 1)
        setVideoReady(false)
        setSeekReady(false)
        videoRef.current.load()
      } else {
        setVideoError(true)
      }
    }, 15000)

    return () => clearTimeout(timeout)
  }, [seekReady, videoError, videoEnded, retryCount, safeVideoUrl])

  const handleLoadedMetadata = useCallback(() => {
    setVideoReady(true)
  }, [])

  const handleVideoEnded = useCallback(() => {
    setVideoEnded(true)
  }, [])

  const handleError = useCallback(() => {
    if (retryCount < MAX_RETRIES && videoRef.current) {
      console.warn(`[VideoPlayer] Load error, retrying (${retryCount + 1}/${MAX_RETRIES})`)
      setRetryCount((prev) => prev + 1)
      setVideoReady(false)
      setSeekReady(false)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.load()
      }, 1000 * (retryCount + 1))
    } else {
      setVideoError(true)
    }
  }, [retryCount])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const nextMuted = !muted
    setMuted(nextMuted)
    video.muted = nextMuted

    if (!nextMuted) {
      // Re-sync on unmute — absorbs any drift accumulated while the tab was muted
      const expected = getElapsedSeconds()
      if (video.duration && expected >= video.duration) {
        setVideoEnded(true)
        return
      }
      if (Math.abs(expected - video.currentTime) > 1) {
        video.currentTime = expected
      }
      if (video.paused) {
        video.play().catch(() => {})
      }
    }
  }, [muted, getElapsedSeconds])

  const handleVolumeChange = useCallback((e) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (videoRef.current) {
      videoRef.current.volume = val
      if (val > 0 && muted) {
        setMuted(false)
        videoRef.current.muted = false
      } else if (val === 0) {
        setMuted(true)
        videoRef.current.muted = true
      }
    }
  }, [muted])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current.requestFullscreen().catch(() => {})
    }
  }, [])

  if (videoEnded) {
    return (
      <div className="bg-black rounded-lg overflow-hidden aspect-video w-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg font-semibold">El vídeo ha finalizado</p>
          <p className="text-gray-400 text-sm mt-1">{eventTitle}</p>
        </div>
      </div>
    )
  }

  if (videoError) {
    return (
      <div className="bg-black rounded-lg overflow-hidden aspect-video w-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm">No se pudo reproducir el vídeo</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-lg overflow-hidden aspect-video w-full group"
    >
      <video
        ref={videoRef}
        src={safeVideoUrl}
        muted={muted}
        playsInline
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleVideoEnded}
        onError={handleError}
        style={{ opacity: seekReady ? 1 : 0, transition: 'opacity 150ms ease-in' }}
        className="w-full h-full object-contain"
      />

      {/* Autoplay notice — shown once playback is ready but still muted */}
      {muted && seekReady && (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity"
        >
          <div className="rounded-full bg-white/90 p-4">
            <svg className="h-8 w-8 text-gray-900" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          </div>
        </button>
      )}

      {/* Loading state — shown until seek completes */}
      {!seekReady && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white text-sm">Cargando vídeo...</p>
        </div>
      )}

      {/* Controls bar — appears on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex items-center justify-between">
          {/* Volume controls */}
          <div className="flex items-center gap-x-2">
            <button
              type="button"
              onClick={toggleMute}
              className="text-white hover:text-gray-300 transition-colors"
            >
              {muted ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          {/* Fullscreen button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="text-white hover:text-gray-300 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
