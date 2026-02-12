'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

// Extract just the origin (protocol + host) from the API URL
const getSocketUrl = () => {
  try {
    const url = new URL(API_URL)
    return url.origin
  } catch {
    // Fallback for malformed URLs - try simple string replacement
    return API_URL.replace(/\/api\/?$/, '')
  }
}
const SOCKET_URL = getSocketUrl()

/**
 * Custom hook for real-time auction updates via Socket.IO.
 *
 * Connects to the auction room, listens for bid/price/timing events,
 * and exposes reactive state for the consuming component.
 *
 * @param {string|number} auctionId - The auction to subscribe to
 * @returns {{ bids: Array, prices: Map, endDatetime: string|null, isEnded: boolean, isConnected: boolean }}
 */
export default function useAuctionSocket(auctionId) {
  const [bids, setBids] = useState([])
  const [prices, setPrices] = useState(new Map())
  const [endDatetime, setEndDatetime] = useState(null)
  const [isEnded, setIsEnded] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef(null)

  // Stable setter for price map entries
  const updatePrice = useCallback((productId, productType, newPrice, nextBidAmount) => {
    setPrices((prev) => {
      const next = new Map(prev)
      next.set(`${productId}-${productType}`, { newPrice, nextBidAmount })
      return next
    })
  }, [])

  useEffect(() => {
    if (!auctionId) return

    // Debug: log the socket URL being used
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.log('[useAuctionSocket] Connecting to:', SOCKET_URL)
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      // Join the auction-specific room
      socket.emit('join-auction', auctionId)
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    // A new bid was placed
    socket.on('new_bid', (data) => {
      const bid = {
        buyer_first_name: data.buyerFirstName,
        amount: data.amount,
        created_at: data.createdAt,
        productId: data.productId,
        productType: data.productType,
      }
      setBids((prev) => [bid, ...prev])
    })

    // Product price updated
    socket.on('price_update', (data) => {
      updatePrice(data.productId, data.productType, data.newPrice, data.nextBidAmount)
    })

    // Auction end time extended (anti-snipe)
    socket.on('auction_extended', (data) => {
      setEndDatetime(data.newEndDatetime)
    })

    // Auction has ended
    socket.on('auction_ended', () => {
      setIsEnded(true)
    })

    // Auction has started
    socket.on('auction_started', () => {
      setIsEnded(false)
    })

    // Periodic countdown sync from server
    socket.on('countdown_sync', (data) => {
      if (data.endDatetime) {
        setEndDatetime(data.endDatetime)
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [auctionId, updatePrice])

  return { bids, prices, endDatetime, isEnded, isConnected }
}
