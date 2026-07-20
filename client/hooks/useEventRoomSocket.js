'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { getAuthToken } from '@/lib/api'

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
 * Authenticated Socket.IO room for Agora live events (`event-room-{eventId}`).
 *
 * Provides the presence list (source of truth for the participant grid and
 * the "N conectados" counter — Agora audiences are invisible on the RTC
 * channel), the moderated chat, hand raising, and the incoming moderation
 * signals (promoted / demoted / force_mute / chat_banned).
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {boolean} params.isHost - Host/admin joins with the JWT; attendees with their credentials
 * @param {string|null} params.attendeeId
 * @param {string|null} params.accessToken
 * @param {boolean} params.enabled - Connect only when the room is actually mounted
 * @param {Function} [params.onPromoted] - This client was granted the floor
 * @param {Function} [params.onDemoted] - This client lost the floor
 * @param {Function} [params.onForceMute] - Host/admin asked this client to mute
 * @param {Function} [params.onJoinDenied] - Join rejected ({ reason })
 */
export default function useEventRoomSocket({
  eventId,
  isHost = false,
  attendeeId = null,
  accessToken = null,
  enabled = true,
  onPromoted,
  onDemoted,
  onForceMute,
  onJoinDenied,
}) {
  const [presence, setPresence] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [selfIdentity, setSelfIdentity] = useState(null)
  const [selfChatBanned, setSelfChatBanned] = useState(false)
  const [joined, setJoined] = useState(false)
  // Whiteboard toggle state (optional phase): { active, everyoneWrites }
  const [whiteboard, setWhiteboard] = useState({ active: false, everyoneWrites: false })
  const socketRef = useRef(null)
  const selfIdentityRef = useRef(null)

  // Keep callbacks in refs so socket listeners never need re-binding
  const callbacksRef = useRef({})
  callbacksRef.current = { onPromoted, onDemoted, onForceMute, onJoinDenied }

  useEffect(() => {
    if (!eventId || !enabled) return
    if (!isHost && (!attendeeId || !accessToken)) return

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    const joinRoom = () => {
      const payload = isHost
        ? { eventId, hostToken: getAuthToken() }
        : { eventId, attendeeId, accessToken }
      socket.emit('join_event_room', payload, (response) => {
        if (!response?.ok) {
          setJoined(false)
          callbacksRef.current.onJoinDenied?.(response || {})
          return
        }
        selfIdentityRef.current = response.identity
        setSelfIdentity(response.identity)
        setSelfChatBanned(!!response.chatBanned)
        setPresence(response.presence || [])
        setWhiteboard({
          active: !!response.whiteboard?.active,
          everyoneWrites: !!response.whiteboard?.everyoneWrites,
        })
        setJoined(true)
      })
    }

    // (Re)join on every connect — covers the initial connection and
    // Socket.IO auto-reconnections alike
    socket.on('connect', joinRoom)

    socket.on('presence_joined', (entry) => {
      setPresence((prev) => {
        const rest = prev.filter((p) => p.identity !== entry.identity)
        return [...rest, entry]
      })
    })

    socket.on('presence_left', ({ identity }) => {
      setPresence((prev) => prev.filter((p) => p.identity !== identity))
    })

    socket.on('presence_updated', (entry) => {
      setPresence((prev) => prev.map((p) => (p.identity === entry.identity ? entry : p)))
    })

    socket.on('event_chat_message', (msg) => {
      setChatMessages((prev) => [...prev, msg])
    })

    socket.on('chat_banned', ({ identity }) => {
      if (identity === selfIdentityRef.current) {
        setSelfChatBanned(true)
      }
    })

    // Targeted moderation signals (the server only emits these to us)
    socket.on('promoted', () => callbacksRef.current.onPromoted?.())
    socket.on('demoted', () => callbacksRef.current.onDemoted?.())
    socket.on('force_mute', () => callbacksRef.current.onForceMute?.())

    socket.on('whiteboard_toggle', (state) => {
      setWhiteboard({ active: !!state?.active, everyoneWrites: !!state?.everyoneWrites })
    })

    socket.on('room_join_denied', (denial) => {
      setJoined(false)
      callbacksRef.current.onJoinDenied?.(denial || {})
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setJoined(false)
      setPresence([])
      setChatMessages([])
      setSelfIdentity(null)
      selfIdentityRef.current = null
    }
  }, [eventId, enabled, isHost, attendeeId, accessToken])

  const sendChatMessage = useCallback((text) => {
    if (!socketRef.current || !text?.trim()) return
    socketRef.current.emit('event_chat_message', { text: text.trim() })
  }, [])

  const setHandRaised = useCallback((raised) => {
    if (!socketRef.current) return
    socketRef.current.emit('hand_raise', { raised: !!raised })
  }, [])

  // Host only (server-validated): flag screen sharing in presence
  const setScreenSharing = useCallback((active) => {
    if (!socketRef.current) return
    socketRef.current.emit('screen_share', { active: !!active })
  }, [])

  // Host only (server-validated): soft-mute a participant from a tile menu
  const requestForceMute = useCallback((identity) => {
    if (!socketRef.current || !identity) return
    socketRef.current.emit('moderate_force_mute', { identity })
  }, [])

  // Host only (server-validated): whiteboard on/off + "everyone writes" flag
  const toggleWhiteboard = useCallback((active, everyoneWrites = false) => {
    if (!socketRef.current) return
    socketRef.current.emit('whiteboard_toggle', { active: !!active, everyoneWrites: !!everyoneWrites })
  }, [])

  return {
    joined,
    presence,
    chatMessages,
    selfIdentity,
    selfChatBanned,
    whiteboard,
    sendChatMessage,
    setHandRaised,
    setScreenSharing,
    requestForceMute,
    toggleWhiteboard,
  }
}
