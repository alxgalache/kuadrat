import Image from 'next/image'
import { getArtImageUrl, getOthersImageUrl } from '@/lib/api'

function getImageUrl(product) {
  return product.product_type === 'art'
    ? getArtImageUrl(product.basename)
    : getOthersImageUrl(product.basename)
}

export default function AuctionImageMosaic({ products, productCount, priority = false }) {
  if (!products || products.length === 0) {
    return <div className="aspect-square w-full rounded-md bg-gray-200" />
  }

  if (products.length === 1) {
    return (
      <div className="aspect-square w-full rounded-md bg-gray-200 relative overflow-hidden">
        <Image
          alt={products[0].name}
          src={getImageUrl(products[0])}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          priority={priority}
        />
      </div>
    )
  }

  if (products.length === 2) {
    return (
      <div className="aspect-square w-full rounded-md overflow-hidden relative bg-gray-200">
        <div className="absolute top-0 left-0 w-[75%] h-[75%] relative">
          <Image
            alt={products[0].name}
            src={getImageUrl(products[0])}
            fill
            className="object-cover rounded-md shadow-sm bg-gray-200"
            sizes="(max-width: 640px) 37vw, 18vw"
            priority={priority}
          />
        </div>
        <div className="absolute bottom-0 right-0 w-[75%] h-[75%] relative">
          <Image
            alt={products[1].name}
            src={getImageUrl(products[1])}
            fill
            className="object-cover rounded-md shadow-sm ring-2 ring-white bg-gray-200"
            sizes="(max-width: 640px) 37vw, 18vw"
          />
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
          return (
            <div key={i} className="relative w-full h-full">
              <Image
                alt={products[i].name}
                src={getImageUrl(products[i])}
                fill
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
