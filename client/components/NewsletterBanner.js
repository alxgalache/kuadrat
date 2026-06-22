'use client'

import { useEffect, useState, useCallback } from 'react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import NewsletterSubscribeModal from '@/components/NewsletterSubscribeModal'
import { NEWSLETTER_ENABLED, NEWSLETTER_COPY, NEWSLETTER_BANNER_DISMISSED_KEY } from '@/lib/constants'

// Owns the newsletter subscribe modal globally plus the first-visit bottom
// banner. The footer icon opens the modal by dispatching `open-newsletter-modal`
// (same window-event pattern as the cart drawer).
export default function NewsletterBanner() {
  const [modalOpen, setModalOpen] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(false)

  // First visit: show the banner unless it was dismissed before.
  useEffect(() => {
    if (!NEWSLETTER_ENABLED) return
    try {
      if (!window.localStorage.getItem(NEWSLETTER_BANNER_DISMISSED_KEY)) {
        setBannerVisible(true)
      }
    } catch {
      setBannerVisible(true)
    }
  }, [])

  // Let other components (the footer icon) open the modal.
  useEffect(() => {
    if (!NEWSLETTER_ENABLED) return
    const open = () => setModalOpen(true)
    window.addEventListener('open-newsletter-modal', open)
    return () => window.removeEventListener('open-newsletter-modal', open)
  }, [])

  const dismissBanner = useCallback(() => {
    setBannerVisible(false)
    try {
      window.localStorage.setItem(NEWSLETTER_BANNER_DISMISSED_KEY, '1')
    } catch {
      // ignore storage errors — the banner stays hidden for this session anyway
    }
  }, [])

  // Engaging with the banner CTA opens the modal and retires the banner.
  const openFromBanner = useCallback(() => {
    setModalOpen(true)
    dismissBanner()
  }, [dismissBanner])

  if (!NEWSLETTER_ENABLED) return null

  return (
    <>
      {bannerVisible && (
        // Rendered in normal flow AFTER the footer (see layout.js), so it always
        // sits below the footer content and never overlaps it, at any width.
        <div className="flex items-center gap-x-6 bg-gray-900 px-6 py-3 sm:px-3.5">
          <p className="text-sm/6 text-white">
            {NEWSLETTER_COPY.bannerText}{' '}
            <button
              type="button"
              onClick={openFromBanner}
              className="font-semibold underline underline-offset-2 hover:text-gray-200"
            >
              {NEWSLETTER_COPY.bannerCta}&nbsp;<span aria-hidden="true">&rarr;</span>
            </button>
          </p>
          <div className="flex flex-1 justify-end">
            <button
              type="button"
              onClick={dismissBanner}
              className="-m-3 p-3 focus-visible:-outline-offset-4"
            >
              <span className="sr-only">Cerrar</span>
              <XMarkIcon aria-hidden="true" className="size-5 text-white" />
            </button>
          </div>
        </div>
      )}

      <NewsletterSubscribeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
