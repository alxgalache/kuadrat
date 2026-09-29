'use client'

import { useState, useEffect } from 'react'
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
 * Public, unauthenticated Socket.IO room of an event: only the start/end
 * notifications, so the detail page can move into (and out of) the live room.
 *
 * It no longer carries chat (live-event-access-hardening): the video pass chat
 * used to travel here, readable and writable by anyone with the page open.
 * It now goes through the authenticated room (useEventRoomSocket).
 *
 * @param {string|number} eventId - The event to subscribe to
 * @returns {{ eventStarted: boolean, eventEnded: boolean }}
 */
export default function useEventSocket(eventId) {
  const [eventStarted, setEventStarted] = useState(false)
  const [eventEnded, setEventEnded] = useState(false)

  useEffect(() => {
    if (!eventId) return

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      socket.emit('join_event', eventId)
    })

    socket.on('event_started', () => {
      setEventStarted(true)
    })

    socket.on('event_ended', () => {
      setEventEnded(true)
    })

    return () => {
      socket.disconnect()
    }
  }, [eventId])

  return { eventStarted, eventEnded }
}
