'use client'

import Image from 'next/image'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import useImageLoaded from '@/hooks/useImageLoaded'
import ImageLoadingPlaceholder from '@/components/ImageLoadingPlaceholder'

function getImageUrl(product) {
  const basename = product.thumbnail_basename || product.images?.[0]?.basename || product.basename
  if (!basename) return null
  return product.product_type === 'art'
    ? getArtImageUrl(basename)
    : getOthersImageUrl(basename)
}

/**
 * Una celda del mosaico, con su propio indicador de carga.
 *
 * Cada celda lo gestiona por su cuenta y no hay uno solo para el mosaico
 * entero: las imágenes llegan por separado, y un indicador único seguiría
 * girando encima de las celdas ya pintadas hasta que llegara la última.
 */
function MosaicCell({ url, alt, sizes, className, priority = false }) {
  const loader = useImageLoaded(url)

  return (
    <>
      <ImageLoadingPlaceholder show={loader.showLoader} />
      {url && (
        <Image
          ref={loader.ref}
          alt={alt}
          src={url}
          fill
          className={className}
          sizes={sizes}
          priority={priority}
          onLoad={loader.onLoad}
          onError={loader.onError}
        />
      )}
    </>
  )
}

export default function AuctionImageMosaic({ products, productCount, priority = false }) {
  if (!products || products.length === 0) {
    return <div className="aspect-square w-full rounded-md bg-gray-200" />
  }

  if (products.length === 1) {
    const url = getImageUrl(products[0])
    return (
      <div className="aspect-square w-full rounded-md bg-gray-200 relative overflow-hidden">
        <MosaicCell
          url={url}
          alt={products[0].name}
          className="object-cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          priority={priority}
        />
      </div>
    )
  }

  if (products.length === 2) {
    const url0 = getImageUrl(products[0])
    const url1 = getImageUrl(products[1])
    return (
      <div className="aspect-square w-full rounded-md overflow-hidden relative bg-gray-200">
        <div className="absolute top-0 left-0 w-[75%] h-[75%]">
          <div className="relative w-full h-full">
            <MosaicCell
              url={url0}
              alt={products[0].name}
              className="object-cover rounded-md shadow-sm bg-gray-200"
              sizes="(max-width: 640px) 37vw, 18vw"
              priority={priority}
            />
          </div>
        </div>
        <div className="absolute bottom-0 right-0 w-[75%] h-[75%]">
          <div className="relative w-full h-full">
            <MosaicCell
              url={url1}
              alt={products[1].name}
              className="object-cover rounded-md shadow-sm ring-2 ring-white bg-gray-200"
              sizes="(max-width: 640px) 37vw, 18vw"
            />
          </div>
        </div>
      </div>
    )
  }

  const remaining = productCount - 3
  const cells = [0, 1, 2, 3]

  return (
    <div className="aspect-square w-full rounded-md overflow-hidden grid grid-cols-2 grid-rows-2 gap-0.5">
      {cells.map((i) => {
        if (i < products.length && !(productCount > 4 && i === 3)) {
          const url = getImageUrl(products[i])
          return (
            <div key={i} className="relative w-full h-full bg-gray-200">
              <MosaicCell
                url={url}
                alt={products[i].name}
                className="object-cover bg-gray-200"
                sizes="(max-width: 640px) 25vw, (max-width: 1024px) 16vw, 12vw"
                priority={priority && i === 0}
              />
            </div>
          )
        }

        if (productCount > 4 && i === 3) {
          return (
            <div key={i} className="w-full h-full bg-gray-200 flex items-center justify-center">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-700 text-white text-sm font-medium">
                +{remaining}
              </span>
            </div>
          )
        }

        return <div key={i} className="w-full h-full bg-gray-200" />
      })}
    </div>
  )
}
