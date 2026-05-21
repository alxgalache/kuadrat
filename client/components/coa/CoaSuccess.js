import Image from 'next/image'
import { getArtImageUrl } from '@/lib/api'
import CoaDescription from '@/components/coa/CoaDescription'

/**
 * Rendered when /api/coa/verify returns status='ok'.
 *
 * Layout:
 *  - Full-width header: verified badge + title + verification counter
 *  - Two-column section: image (left) | artwork info (right)
 *
 * The Navbar (with the gallery logo) is already rendered by LayoutWrapper,
 * so this component does not repeat any branding header.
 *
 * Description is delegated to <CoaDescription> (client component) so that
 * DOMPurify can sanitize HTML on the client side.
 */
export default function CoaSuccess({ art, counter }) {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">

        {/* ── Full-width verification badge ───────────────────── */}
        <div className="mb-8">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-green-700 mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 shrink-0"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.704 5.29a.75.75 0 0 1 .006 1.06l-7.5 7.566a.75.75 0 0 1-1.066 0L3.29 9.06a.75.75 0 1 1 1.06-1.06l4.32 4.32 6.97-7.03a.75.75 0 0 1 1.064-.006Z"
                clipRule="evenodd"
              />
            </svg>
            Certificado verificado
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Certificado de Autenticidad
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Verificación nº {counter} de este certificado.
          </p>
        </div>

        {/* ── Two-column: image | info ─────────────────────────── */}
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start">

          {/* Image — left column, constrained width */}
          {art.basename && (
            <div className="w-full sm:w-56 md:w-72 shrink-0">
              <div className="overflow-hidden rounded-sm bg-gray-50">
                <Image
                  src={getArtImageUrl(art.basename)}
                  alt={art.name}
                  width={400}
                  height={500}
                  className="h-auto w-full object-contain"
                  priority
                  unoptimized
                />
              </div>
            </div>
          )}

          {/* Info — right column */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold tracking-tight leading-snug">
              {art.name}
            </h2>

            {art.artistName && (
              <p className="mt-1 text-sm text-gray-500">{art.artistName}</p>
            )}

            {art.description && (
              <div className="mt-4">
                <CoaDescription html={art.description} />
              </div>
            )}

            {/* Metadata grid */}
            {(art.type || art.dimensions) && (
              <dl className="mt-6 grid grid-cols-1 gap-y-3 sm:grid-cols-2 border-t border-gray-100 pt-5">
                {art.type && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-400 font-medium">
                      Tipo
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700">{art.type}</dd>
                  </div>
                )}
                {art.dimensions && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-400 font-medium">
                      Dimensiones
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700">{art.dimensions}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-12 text-xs text-gray-400">
          Si crees que este certificado se está usando de forma fraudulenta,
          ponte en contacto con la galería.
        </p>
      </div>
    </main>
  )
}
