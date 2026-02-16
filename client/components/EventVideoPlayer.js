'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

/**
 * Synchronized video player for video-format events.
 * Calculates the current playback position based on the server's start timestamp,
 * so all viewers see the same moment regardless of when they join.
 *
 * Controls: volume + fullscreen only. No pause, seek, or progress bar.
 */
export default function EventVideoPlayer({ videoUrl, videoStartedAt, eventTitle }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(0.8)
  const [videoReady, setVideoReady] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [videoEnded, setVideoEnded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const MAX_RETRIES = 3

  // Enforce HTTPS for external URLs (S3 presigned URLs, etc.)
  const safeVideoUrl = useMemo(() => {
    if (!videoUrl) return null
    // Only enforce HTTPS for external URLs (not same-origin API calls)
    if (videoUrl.startsWith('http://') && !videoUrl.includes('localhost') && !videoUrl.includes('127.0.0.1')) {
      return videoUrl.replace('http://', 'https://')
    }
    return videoUrl
  }, [videoUrl])

  // Calculate elapsed seconds since the event started
  const getElapsedSeconds = useCallback(() => {
    if (!videoStartedAt) return 0
    return (Date.now() - new Date(videoStartedAt).getTime()) / 1000
  }, [videoStartedAt])

  // Seek to the correct position when video is ready
  useEffect(() => {
    if (!videoReady || !videoRef.current) return

    const elapsed = getElapsedSeconds()
    const video = videoRef.current

    if (elapsed < 0) return // Not started yet

    if (video.duration && elapsed >= video.duration) {
      setVideoEnded(true)
      return
    }

    video.currentTime = elapsed
    video.play().catch(() => {
      // Autoplay blocked — user will need to interact
    })
  }, [videoReady, getElapsedSeconds])

  // Periodic sync check every 30 seconds to correct drift
  useEffect(() => {
    if (!videoReady || videoEnded) return

    const interval = setInterval(() => {
      if (!videoRef.current || videoRef.current.paused) return
      const expected = getElapsedSeconds()
      const actual = videoRef.current.currentTime
      const drift = Math.abs(expected - actual)

      if (drift > 2) {
        videoRef.current.currentTime = expected
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [videoReady, videoEnded, getElapsedSeconds])

  // Check if video has ended based on elapsed time (for late joiners)
  useEffect(() => {
    const elapsed = getElapsedSeconds()
    if (videoRef.current?.duration && elapsed >= videoRef.current.duration) {
      setVideoEnded(true)
    }
  }, [getElapsedSeconds])

  // Loading timeout — if video hasn't loaded metadata within 15s, retry
  useEffect(() => {
    if (videoReady || videoError || videoEnded) return

    const timeout = setTimeout(() => {
      if (!videoReady && retryCount < MAX_RETRIES && videoRef.current) {
        console.warn(`[VideoPlayer] Load timeout, retrying (${retryCount + 1}/${MAX_RETRIES})`)
        setRetryCount(prev => prev + 1)
        // Force reload by resetting the src
        const video = videoRef.current
        video.load()
      } else if (retryCount >= MAX_RETRIES) {
        setVideoError(true)
      }
    }, 15000)

    return () => clearTimeout(timeout)
  }, [videoReady, videoError, videoEnded, retryCount])

  const handleLoadedMetadata = useCallback(() => {
    setVideoReady(true)
  }, [])

  const handleVideoEnded = useCallback(() => {
    setVideoEnded(true)
  }, [])

  const handleError = useCallback(() => {
    // Retry on error before giving up
    if (retryCount < MAX_RETRIES && videoRef.current) {
      console.warn(`[VideoPlayer] Load error, retrying (${retryCount + 1}/${MAX_RETRIES})`)
      setRetryCount(prev => prev + 1)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.load()
      }, 1000 * (retryCount + 1)) // Exponential-ish backoff
    } else {
      setVideoError(true)
    }
  }, [retryCount])

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return
    const newMuted = !muted
    setMuted(newMuted)
    videoRef.current.muted = newMuted
    // If unmuting and video is paused (autoplay was blocked), try playing
    if (!newMuted && videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
    }
  }, [muted])

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
        crossOrigin="anonymous"
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleVideoEnded}
        onError={handleError}
        className="w-full h-full object-contain"
      />

      {/* Autoplay notice — shown when muted */}
      {muted && videoReady && (
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

      {/* Loading state */}
      {!videoReady && !videoError && (
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
