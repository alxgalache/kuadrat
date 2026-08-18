'use client'

import Link from 'next/link'
import { useCookieConsent } from '@/contexts/CookieConsentContext'

/**
 * Banner de consentimiento de cookies.
 *
 * Los dos botones tienen el MISMO peso visual a propósito. La versión anterior
 * ofrecía "Aceptar todas" como botón sólido y el rechazo como enlace de texto;
 * la guía de la AEPD exige que rechazar sea tan sencillo como aceptar, y un
 * enlace discreto frente a un botón negro no lo es. Por el mismo motivo no hay
 * aspa de cerrar: cerrar sin decidir dejaría al visitante sin elección y sin
 * banner, y el estado resultante ("no ha decidido") no autoriza nada, con lo
 * que solo serviría para esconder la pregunta.
 *
 * El estado vive en CookieConsentContext; este componente es solo la interfaz.
 */
export default function CookieBanner() {
  const { bannerVisible, acceptAll, acceptNecessaryOnly } = useCookieConsent()

  if (!bannerVisible) return null

  return (
    // `data-cookie-banner` es el asidero de la regla de globals.css que lo
    // oculta antes del primer pintado a quien ya decidió; el banner viaja en el
    // HTML del servidor para no ser el elemento que retrasa el LCP.
    <div data-cookie-banner className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-6 pb-6">
      <div className="pointer-events-auto max-w-xl border border-gray-300 rounded-xl bg-white p-6 shadow-lg outline-1 outline-gray-900/10">
        <p className="text-sm/6 text-gray-900">
          Usamos cookies propias y de terceros. Las necesarias hacen funcionar el sitio
          (sesión, carrito y pagos) y no se pueden desactivar. Las de publicidad nos permiten
          medir los resultados de nuestras campañas. Puedes aceptarlas
          todas o quedarte solo con las necesarias. Más información en nuestra{' '}
          <Link
            href="/legal/politica-de-cookies"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-black hover:text-gray-800"
          >
            Política de Cookies
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
          >
            Aceptar todas
          </button>
          <button
            type="button"
            onClick={acceptNecessaryOnly}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
          >
            Solo las necesarias
          </button>
        </div>
      </div>
    </div>
  )
}
