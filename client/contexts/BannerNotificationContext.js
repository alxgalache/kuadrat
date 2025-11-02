'use client'

import { createContext, useContext, useState, useCallback } from 'react'

const BannerNotificationContext = createContext(undefined)

export function BannerNotificationProvider({ children }) {
  const [banner, setBanner] = useState(null)

  const showBanner = useCallback((message) => {
    const id = Date.now() + Math.random()
    const newBanner = {
      id,
      message,
    }

    setBanner(newBanner)

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      dismissBanner()
    }, 5000)

    return id
  }, [])

  const dismissBanner = useCallback(() => {
    setBanner(null)
  }, [])

  const value = {
    banner,
    showBanner,
    dismissBanner,
  }

  return (
    <BannerNotificationContext.Provider value={value}>
      {children}
    </BannerNotificationContext.Provider>
  )
}

export function useBannerNotification() {
  const context = useContext(BannerNotificationContext)
  if (context === undefined) {
    throw new Error('useBannerNotification debe ser usado dentro de un BannerNotificationProvider')
  }
  return context
}
