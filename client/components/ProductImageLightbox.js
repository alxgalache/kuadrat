'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment, useEffect, useState } from 'react'
import Image from 'next/image'
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'

export default function ProductImageLightbox({
  open,
  onClose,
  images,
  imageType,
  name,
  initialIndex = 0,
  knownRatios = {},
}) {
  const [index, setIndex] = useState(initialIndex)
  const [ratios, setRatios] = useState({})

  const list = Array.isArray(images) ? images.filter((i) => i && i.basename) : []
  const safeIndex = list.length > 0 ? ((index % list.length) + list.length) % list.length : 0
  const current = list[safeIndex]

  // Re-open always starts at the image the carousel was showing
  useEffect(() => {
    if (open) setIndex(initialIndex)
  }, [open, initialIndex])

  const resolveUrl = (basename) =>
    imageType === 'art' ? getArtImageUrl(basename) : getOthersImageUrl(basename)

  const goPrev = () => setIndex((i) => (i - 1 + list.length) % list.length)
  const goNext = () => setIndex((i) => (i + 1) % list.length)

  const handleImageLoad = (basename) => (e) => {
    const { naturalWidth, naturalHeight } = e.target
    if (!naturalWidth || !naturalHeight) return
    setRatios((prev) => (prev[basename] ? prev : { ...prev, [basename]: naturalWidth / naturalHeight }))
  }

  // The panel is sized to the image's exact rendered box (aspect ratio fitted into
  // 92vw x 85vh), so clicking anywhere outside the visible image counts as an
  // outside click and closes the dialog, and the controls overlay the image itself.
  const ratio = (current && (ratios[current.basename] || knownRatios[current.basename])) || 1
  const panelStyle = {
    width: `min(92vw, calc(85vh * ${ratio}))`,
    height: `min(85vh, calc(92vw / ${ratio}))`,
  }

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-20">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-black/70" />
        </TransitionChild>

        <div className="fixed inset-0 z-20 flex items-center justify-center">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="relative" style={panelStyle}>
              <DialogTitle className="sr-only">{name ? `Imagen completa de ${name}` : 'Imagen completa'}</DialogTitle>

              {current && (
                <Image
                  alt={name || ''}
                  src={resolveUrl(current.basename)}
                  fill
                  sizes="100vw"
                  className="object-contain"
                  onLoad={handleImageLoad(current.basename)}
                />
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute top-2 right-2 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <XMarkIcon className="size-5" aria-hidden="true" />
              </button>

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
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
