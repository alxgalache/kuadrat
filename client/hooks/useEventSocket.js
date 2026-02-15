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

/**
 * Custom hook for real-time event status updates and chat via Socket.IO.
 *
 * Connects to the event room and listens for start/end notifications
 * so the detail page can auto-transition to the live stream.
 * Also supports chat messaging for video-format events.
 *
 * @param {string|number} eventId - The event to subscribe to
 * @returns {{ eventStarted: boolean, eventEnded: boolean, chatMessages: Array, sendChatMessage: Function }}
 */
export default function useEventSocket(eventId) {
  const [eventStarted, setEventStarted] = useState(false)
  const [eventEnded, setEventEnded] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const socketRef = useRef(null)

  useEffect(() => {
    if (!eventId) return

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join_event', eventId)
    })

    socket.on('event_started', () => {
      setEventStarted(true)
    })

    socket.on('event_ended', () => {
      setEventEnded(true)
    })

    socket.on('chat_message', (msg) => {
      setChatMessages((prev) => [...prev, msg])
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [eventId])

  const sendChatMessage = useCallback((sender, message) => {
    if (!socketRef.current || !eventId || !message) return
    socketRef.current.emit('chat_message', { eventId, sender, message })
  }, [eventId])

  return { eventStarted, eventEnded, chatMessages, sendChatMessage }
}
