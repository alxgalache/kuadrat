'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'

export default function ProductImageCarousel({ images, imageType, name, priority = false }) {
  const [index, setIndex] = useState(0)

  const list = Array.isArray(images) ? images.filter((i) => i && i.basename) : []
  const safeIndex = list.length > 0 ? ((index % list.length) + list.length) % list.length : 0
  const current = list[safeIndex]

  const resolveUrl = (basename) =>
    imageType === 'art' ? getArtImageUrl(basename) : getOthersImageUrl(basename)

  const goPrev = () => setIndex((i) => (i - 1 + list.length) % list.length)
  const goNext = () => setIndex((i) => (i + 1) % list.length)

  return (
    <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative">
      {current && (
        <Image
          alt={name || ''}
          src={resolveUrl(current.basename)}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
          priority={priority}
        />
      )}

      {list.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Imagen anterior"
            className="absolute top-1/2 left-2 -translate-y-1/2 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <ChevronLeftIcon className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Imagen siguiente"
            className="absolute top-1/2 right-2 -translate-y-1/2 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <ChevronRightIcon className="size-5" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  )
}
