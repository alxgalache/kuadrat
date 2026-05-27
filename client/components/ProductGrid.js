'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { PlusIcon } from '@heroicons/react/20/solid'

function ProductGridItem({ product, getImageUrl, baseRoute }) {
  const [displayedBasename, setDisplayedBasename] = useState(null)
  const mainBasename = displayedBasename ?? product.thumbnail_basename ?? product.images?.[0]?.basename ?? null
  const detailHref = `${baseRoute}/p/${product.slug}`
  const variationThumbs = product.variation_thumbnails ?? []
  const showVariationsRow = variationThumbs.length >= 2

  return (
    <li className="inline-flex w-full flex-col text-center">
      <div className="group relative">
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-gray-200">
          <Link href={detailHref} aria-label={product.name} className="block size-full">
            {mainBasename && (
              <Image
                alt={product.name}
                src={getImageUrl(mainBasename)}
                fill
                className="object-cover [@media(hover:hover)]:group-hover:opacity-75"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
            )}
          </Link>
          {showVariationsRow && (
            <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
              <span className="rounded-full bg-white/80 p-1.5" aria-hidden="true">
                <PlusIcon className="size-4 text-gray-700" />
              </span>
              {variationThumbs.map((thumb) => (
                <button
                  key={thumb.id}
                  type="button"
                  title={thumb.key}
                  aria-label={`Mostrar variación ${thumb.key}`}
                  onClick={(e) => { e.stopPropagation(); setDisplayedBasename(thumb.basename) }}
                  className="size-8 overflow-hidden rounded-sm ring-1 ring-white/80 transition-transform hover:scale-110 focus:outline-2 focus:outline-offset-1 focus:outline-black"
                >
                  <Image
                    src={getImageUrl(thumb.basename)}
                    alt={thumb.key}
                    width={32}
                    height={32}
                    sizes="32px"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-6">
          <p className="text-sm text-gray-500">{product.seller_full_name}</p>
          <h3 className="mt-1 font-semibold text-gray-900">
            <Link href={detailHref}>{product.name}</Link>
          </h3>
          <p className="mt-1 text-gray-900">€{product.price.toFixed(2)}</p>
        </div>
      </div>
    </li>
  )
}

export default function ProductGrid({ products, isFading, getImageUrl, baseRoute }) {
  return (
    <div className="relative">
      <div
        className="relative w-full transition-opacity duration-300"
        style={{ opacity: isFading ? 0 : 1 }}
      >
        <ul
          role="list"
          className="px-6 grid grid-cols-2 gap-4 sm:px-6 sm:gap-8 lg:px-0 lg:grid-cols-4"
        >
          {products.map((product) => (
            <ProductGridItem
              key={product.id}
              product={product}
              getImageUrl={getImageUrl}
              baseRoute={baseRoute}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
