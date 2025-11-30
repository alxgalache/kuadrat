'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

export default function RateLimitHandler() {
  const { showBanner } = useBannerNotification()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const handleRateLimit = (event) => {
      // If already on home page, just show the banner
      if (pathname === '/') {
        showBanner(event.detail.message)
      } else {
        // Redirect to home page first, then show banner after navigation
        router.push('/')
        // Use a small delay to ensure navigation completes before showing banner
        setTimeout(() => {
          showBanner(event.detail.message)
        }, 100)
      }
    }

    window.addEventListener('api-rate-limit', handleRateLimit)

    return () => {
      window.removeEventListener('api-rate-limit', handleRateLimit)
    }
  }, [showBanner, router, pathname])

  return null
}
