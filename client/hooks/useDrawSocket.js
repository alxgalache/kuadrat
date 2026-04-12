'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

const getSocketUrl = () => {
  try {
    const url = new URL(API_URL)
    return url.origin
  } catch {
    return API_URL.replace(/\/api\/?$/, '')
  }
}
const SOCKET_URL = getSocketUrl()

const COUNTDOWN_THRESHOLD_MS = 12 * 60 * 60 * 1000 // 12 hours

/**
 * Custom hook for real-time draw updates via Socket.IO.
 *
 * Connects to the draw room, listens for draw_ended events,
 * and provides a countdown timer when < 12 hours remain.
 *
 * @param {string|number} drawId - The draw to subscribe to
 * @param {string} endDatetime - ISO 8601 end datetime of the draw
 * @returns {{ drawEnded: boolean, timeRemaining: { hours: number, minutes: number, seconds: number } | null, isConnected: boolean }}
 */
export default function useDrawSocket(drawId, endDatetime) {
  const [drawEnded, setDrawEnded] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef(null)
  const intervalRef = useRef(null)

  const calculateTimeRemaining = useCallback(() => {
    if (!endDatetime) return null
    const end = new Date(endDatetime).getTime()
    const now = Date.now()
    const diff = end - now

    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true }
    if (diff > COUNTDOWN_THRESHOLD_MS) return null

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
    return { hours, minutes, seconds, expired: false }
  }, [endDatetime])

  useEffect(() => {
    if (!drawId) return

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      socket.emit('join-draw', drawId)
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('draw_ended', () => {
      setDrawEnded(true)
    })

    return () => {
      socket.emit('leave-draw', drawId)
      socket.disconnect()
      socketRef.current = null
    }
  }, [drawId])

  // Countdown interval
  useEffect(() => {
    if (drawEnded) {
      setTimeRemaining(null)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const tick = () => {
      const remaining = calculateTimeRemaining()
      if (remaining?.expired) {
        setDrawEnded(true)
        setTimeRemaining(null)
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        return
      }
      setTimeRemaining(remaining)
    }

    tick()
    intervalRef.current = setInterval(tick, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [endDatetime, drawEnded, calculateTimeRemaining])

  return { drawEnded, timeRemaining, isConnected }
}
