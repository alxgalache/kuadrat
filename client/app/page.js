import Link from 'next/link'
import CookieBanner from '@/components/CookieBanner'

export default function Home() {
  return (
    <div className="bg-white relative">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance text-gray-900 sm:text-5xl">
          Descubre obras únicas. Apoya a artistas reales.
        </h2>
        <div className="mt-10 flex items-center gap-x-6">
          <Link
            href="/galeria"
            className="rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            Explorar
          </Link>
          <Link href="/registro" className="text-sm/6 font-semibold text-gray-900">
            Publica tus obras <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
      {/* Cookie banner must only appear on the home page */}
      <CookieBanner />
    </div>
  )
}
