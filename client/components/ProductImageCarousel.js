'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/20/solid'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import ProductImageLightbox from '@/components/ProductImageLightbox'

export default function ProductImageCarousel({ images, imageType, name, priority = false }) {
  const [index, setIndex] = useState(0)
  const [ratios, setRatios] = useState({})
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const list = Array.isArray(images) ? images.filter((i) => i && i.basename) : []
  const safeIndex = list.length > 0 ? ((index % list.length) + list.length) % list.length : 0
  const current = list[safeIndex]

  const resolveUrl = (basename) =>
    imageType === 'art' ? getArtImageUrl(basename) : getOthersImageUrl(basename)

  const goPrev = () => setIndex((i) => (i - 1 + list.length) % list.length)
  const goNext = () => setIndex((i) => (i + 1) % list.length)

  // Ratio is recorded per image so the lightbox can size its panel before measuring
  const handleImageLoad = (basename) => (e) => {
    const { naturalWidth, naturalHeight } = e.target
    if (!naturalWidth || !naturalHeight) return
    setRatios((prev) => (prev[basename] ? prev : { ...prev, [basename]: naturalWidth / naturalHeight }))
  }

  return (
    <>
    <div
      className={`aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative${current ? ' cursor-pointer' : ''}`}
      onClick={current ? () => setLightboxOpen(true) : undefined}
    >
      {current && (
        <Image
          alt={name || ''}
          src={resolveUrl(current.basename)}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
          priority={priority}
          onLoad={handleImageLoad(current.basename)}
        />
      )}

      {current && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white shadow focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <MagnifyingGlassPlusIcon className="size-3.5" aria-hidden="true" />
          Ver imagen completa
        </button>
      )}

      {list.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev() }}
            aria-label="Imagen anterior"
            className="absolute top-1/2 left-2 -translate-y-1/2 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <ChevronLeftIcon className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext() }}
            aria-label="Imagen siguiente"
            className="absolute top-1/2 right-2 -translate-y-1/2 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <ChevronRightIcon className="size-5" aria-hidden="true" />
          </button>
        </>
      )}

    </div>

    {/* Rendered outside the clickable container: portal events bubble through the
        React tree and would re-trigger the open handler from inside the dialog */}
    <ProductImageLightbox
      open={lightboxOpen}
      onClose={() => setLightboxOpen(false)}
      images={list}
      imageType={imageType}
      name={name}
      initialIndex={safeIndex}
      knownRatios={ratios}
    />
    </>
  )
}
