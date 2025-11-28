'use client'

import { useEffect } from 'react'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

export default function RateLimitHandler() {
  const { showBanner } = useBannerNotification()

  useEffect(() => {
    const handleRateLimit = (event) => {
      showBanner(event.detail.message)
    }

    window.addEventListener('api-rate-limit', handleRateLimit)

    return () => {
      window.removeEventListener('api-rate-limit', handleRateLimit)
    }
  }, [showBanner])

  return null
}
