import Image from 'next/image'
import Link from 'next/link'
import CookieBanner from '@/components/CookieBanner'
import StoryVideo from '@/components/StoryVideo'

const IS_PUBLISHED = process.env.PUBLISHED_VISIBLE === 'true' || process.env.PUBLISHED_VISIBLE === '1'
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export default async function Home() {
  // Fetch story videos from the API (S3-backed)
  let storyVideos = []
  try {
    const res = await fetch(`${API_URL}/stories/videos`, { next: { revalidate: 3600 } })
    if (res.ok) {
      const data = await res.json()
      storyVideos = data.videos || []
    }
  } catch {
    // Story videos are decorative — fail silently
  }
  // Coming soon page (shown when app is not published)
  if (!IS_PUBLISHED) {
    return (
      <div className="bg-white relative">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <Image
            alt="140d Galería de Arte"
            src="/brand/140d.svg"
            width={160}
            height={40}
            className="h-10 w-auto mb-8"
            priority
          />
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance text-gray-900 sm:text-5xl">
            Próximamente...
          </h1>
          <div className="mt-10 flex items-center gap-x-6">
            <a href="mailto:info@140d.art" className="text-sm/6 font-semibold text-gray-900">
              Más información <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Normal home page (shown when app is published)
  return (
    <div className="bg-white relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col lg:flex-row lg:items-start lg:gap-x-16">
        <div className="flex-1 sm:pt-32 py-12">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance text-gray-900 sm:text-5xl">
            Descubre obras únicas. Apoya a artistas reales.
          </h1>
          <div className="mt-10 flex items-center gap-x-6">
            <Link
              href="/galeria"
              className="rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              Explorar
            </Link>
            <Link href="/contacto" className="text-sm/6 font-semibold text-gray-900">
              Publica tus obras <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <div className="lg:mt-12 flex-1 flex justify-center">
          <StoryVideo videos={storyVideos} />
        </div>
      </div>
      {/* Cookie banner must only appear on the home page */}
      <CookieBanner />
    </div>
  )
}
