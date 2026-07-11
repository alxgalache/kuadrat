'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import ProductImageLightbox from '@/components/ProductImageLightbox'

// Images within this tolerance of a 1:1 ratio are treated as square (no crop indicator)
const SQUARE_RATIO_TOLERANCE = 0.02

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

  const handleImageLoad = (basename) => (e) => {
    const { naturalWidth, naturalHeight } = e.target
    if (!naturalWidth || !naturalHeight) return
    setRatios((prev) => (prev[basename] ? prev : { ...prev, [basename]: naturalWidth / naturalHeight }))
  }

  // Unknown ratio (not loaded yet) is treated as square: no pill, no lightbox trigger
  const currentRatio = current ? ratios[current.basename] : null
  const isCropped = currentRatio != null && Math.abs(currentRatio - 1) > SQUARE_RATIO_TOLERANCE
  const isVertical = isCropped && currentRatio < 1

  return (
    <>
    <div
      className={`aspect-square w-full overflow-hidden rounded-lg bg-gray-200 relative${isCropped ? ' cursor-pointer' : ''}`}
      onClick={isCropped ? () => setLightboxOpen(true) : undefined}
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

      {isCropped && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white shadow focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-3.5"
            aria-hidden="true"
          >
            {isVertical
              ? <rect x="6" y="3" width="8" height="14" rx="1.5" />
              : <rect x="3" y="6" width="14" height="8" rx="1.5" />}
          </svg>
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
