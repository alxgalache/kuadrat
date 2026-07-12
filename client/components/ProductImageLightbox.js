'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'

const MAX_SCALE = 5
const ZERO_TRANSFORM = { scale: 1, tx: 0, ty: 0 }

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

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
  const [transform, setTransform] = useState(ZERO_TRANSFORM)

  // Box that frames the image; used to measure the rect for cursor-follow zoom
  const boxRef = useRef(null)

  const list = Array.isArray(images) ? images.filter((i) => i && i.basename) : []
  const safeIndex = list.length > 0 ? ((index % list.length) + list.length) % list.length : 0
  const current = list[safeIndex]

  // Re-open always starts at the image the carousel was showing
  useEffect(() => {
    if (open) setIndex(initialIndex)
  }, [open, initialIndex])

  // Reset zoom/pan whenever the lightbox opens/closes or the visible image changes
  useEffect(() => {
    setTransform(ZERO_TRANSFORM)
  }, [open, safeIndex])

  const resolveUrl = (basename) =>
    imageType === 'art' ? getArtImageUrl(basename) : getOthersImageUrl(basename)

  const goPrev = () => setIndex((i) => (i - 1 + list.length) % list.length)
  const goNext = () => setIndex((i) => (i + 1) % list.length)

  const handleImageLoad = (basename) => (e) => {
    const { naturalWidth, naturalHeight } = e.target
    if (!naturalWidth || !naturalHeight) return
    setRatios((prev) => (prev[basename] ? prev : { ...prev, [basename]: naturalWidth / naturalHeight }))
  }

  // Translate for a given scale so the section under the cursor is the one shown:
  // as the pointer sweeps the box (fx,fy in 0..1) the image pans across its overflow.
  const transformFor = (scale, fx, fy, rect) => ({
    scale,
    tx: -fx * (scale - 1) * rect.width,
    ty: -fy * (scale - 1) * rect.height,
  })

  // Native (non-passive) wheel listener: React's onWheel is passive, so preventDefault
  // there is ignored. This stops the browser from scrolling/zooming the page and zooms
  // the image instead, keeping the section under the cursor in view.
  useEffect(() => {
    if (!open) return
    const el = boxRef.current
    if (!el) return

    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      const fy = clamp((e.clientY - rect.top) / rect.height, 0, 1)
      setTransform((t) => {
        const factor = Math.exp(-e.deltaY * 0.0015)
        const scale = clamp(t.scale * factor, 1, MAX_SCALE)
        return scale === 1 ? ZERO_TRANSFORM : transformFor(scale, fx, fy, rect)
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open])

  // Moving the cursor pans the zoomed image to the section under the pointer
  const onPointerMove = (e) => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    const fy = clamp((e.clientY - rect.top) / rect.height, 0, 1)
    setTransform((t) => (t.scale > 1 ? transformFor(t.scale, fx, fy, rect) : t))
  }

  // Leaving the image resets to the initial (unzoomed) view
  const onPointerLeave = () => {
    setTransform((t) => (t.scale > 1 ? ZERO_TRANSFORM : t))
  }

  // The panel is sized to the image's exact rendered box (aspect ratio fitted into
  // 92vw x 85vh), so clicking anywhere outside the visible image counts as an
  // outside click and closes the dialog, and the controls overlay the image itself.
  const ratio = (current && (ratios[current.basename] || knownRatios[current.basename])) || 1
  const panelStyle = {
    width: `min(92vw, calc(85vh * ${ratio}))`,
    height: `min(85vh, calc(92vw / ${ratio}))`,
  }

  const imageStyle = {
    transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
    transformOrigin: '0 0',
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
            <DialogPanel ref={boxRef} className="relative overflow-hidden" style={panelStyle}>
              <DialogTitle className="sr-only">{name ? `Imagen completa de ${name}` : 'Imagen completa'}</DialogTitle>

              {current && (
                <div
                  className="absolute inset-0 select-none touch-none"
                  style={imageStyle}
                  onPointerMove={onPointerMove}
                  onPointerLeave={onPointerLeave}
                >
                  <Image
                    alt={name || ''}
                    src={resolveUrl(current.basename)}
                    fill
                    sizes="100vw"
                    className="object-contain"
                    draggable={false}
                    onLoad={handleImageLoad(current.basename)}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute top-2 right-2 z-10 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <XMarkIcon className="size-5" aria-hidden="true" />
              </button>

              {list.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Imagen anterior"
                    className="absolute top-1/2 left-2 z-10 -translate-y-1/2 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    <ChevronLeftIcon className="size-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Imagen siguiente"
                    className="absolute top-1/2 right-2 z-10 -translate-y-1/2 size-8 rounded-full bg-white/70 hover:bg-white text-gray-900 shadow flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-500"
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
