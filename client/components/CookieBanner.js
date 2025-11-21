'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cookie_consent'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const consent = window.sessionStorage.getItem(STORAGE_KEY)
      if (consent === 'accepted') {
        setVisible(false)
      } else {
        setVisible(true)
      }
    } catch (e) {
      // If sessionStorage is not available, still show the banner
      setVisible(true)
    }
  }, [])

  const handleAccept = () => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(STORAGE_KEY, 'accepted')
      }
    } catch (e) {
      // Ignore storage errors; we still hide the banner for this session
    }
    setVisible(false)
  }

  const handleReject = () => {
    // Do not persist anything; banner will reappear on reload as requested
    setVisible(false)
  }

  if (!visible) return null

  // Markup and Tailwind classes copied exactly from the provided snippet
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 px-6 pb-6">
      <div className="pointer-events-auto max-w-xl border border-gray-300 rounded-xl bg-white p-6 shadow-lg outline-1 outline-gray-900/10">
        <p className="text-sm/6 text-gray-900">
            Usamos cookies propias y de terceros para mejorar tu experiencia de navegación, analizar tu uso del sitio web y mostrarte publicidad relevante.
            Puedes aceptar todas las cookies, rechazarlas o configurar tus preferencias. Más información en nuestra {' '}
          <a href="#" className="font-semibold text-black hover:text-indigo-800">
            Política de Cookies
          </a>
          .
        </p>
        <div className="mt-4 flex items-center gap-x-5">
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
          >
            Aceptar todas
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="text-sm/6 font-semibold text-gray-900 hover:text-gray-700"
          >
            Rechazar todas
          </button>
        </div>
      </div>
    </div>
  )
}
