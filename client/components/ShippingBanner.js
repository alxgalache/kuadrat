'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/20/solid'

export default function ShippingBanner() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if banner was previously dismissed
    const isDismissed = localStorage.getItem('shippingBannerDismissed')
    if (!isDismissed) {
      setIsVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    localStorage.setItem('shippingBannerDismissed', 'true')
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className="relative flex items-center gap-x-6 bg-black px-6 py-2.5 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/10 sm:px-3.5 sm:before:flex-1">
      <p className="text-sm/6 text-white">
          <strong className="font-semibold">Información sobre envíos</strong>
          <svg viewBox="0 0 2 2" aria-hidden="true" className="mx-2 inline size-0.5 fill-current">
            <circle r={1} cx={1} cy={1} />
          </svg>
          El envío para obras de arte estará disponible próximamente. Por el momento solo está disponible la opción de recogida presencial.
      </p>
      <div className="flex flex-1 justify-end">
        <button
          type="button"
          onClick={handleDismiss}
          className="-m-3 p-3 focus-visible:outline-offset-4"
        >
          <span className="sr-only">Dismiss</span>
          <XMarkIcon aria-hidden="true" className="size-5 text-white" />
        </button>
      </div>
    </div>
  )
}
