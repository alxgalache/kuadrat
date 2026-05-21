import { COA_FAILURE_MESSAGES } from '@/lib/constants'

/**
 * Rendered when /api/coa/verify returns any status other than 'ok', or when
 * the verification request itself fails. We never reveal cryptographic detail
 * about *why* the tap failed beyond the user-friendly message.
 *
 * The Navbar (with the gallery logo) is already rendered by LayoutWrapper,
 * so this component does not repeat any branding header.
 */
export default function CoaFailure({ status }) {
  const message = COA_FAILURE_MESSAGES[status] || COA_FAILURE_MESSAGES.malformed

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="text-center">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-red-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 shrink-0"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
                clipRule="evenodd"
              />
            </svg>
            No se ha podido verificar
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Certificado no verificado
          </h1>
          <p className="mt-6 text-sm text-gray-600 max-w-md mx-auto">{message}</p>
          <p className="mt-8 text-xs text-gray-400">
            Si crees que es un error, ponte en contacto con la galería indicando
            la fecha, la hora y el dispositivo desde el que has hecho el tap.
          </p>
        </div>
      </div>
    </main>
  )
}
