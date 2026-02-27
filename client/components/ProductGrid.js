import Image from 'next/image'
import Link from 'next/link'

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
            <li key={product.id} className="inline-flex w-full flex-col text-center">
              <div className="group relative">
                <div className="aspect-square w-full rounded-md bg-gray-200 relative overflow-hidden">
                  <Image
                    alt={product.name}
                    src={getImageUrl(product.basename)}
                    fill
                    className="object-cover group-hover:opacity-75"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                </div>
                <div className="mt-6">
                  <p className="text-sm text-gray-500">{product.seller_full_name}</p>
                  <h3 className="mt-1 font-semibold text-gray-900">
                    <Link href={`${baseRoute}/p/${product.slug}`}>
                      <span className="absolute inset-0" />
                      {product.name}
                    </Link>
                  </h3>
                  <p className="mt-1 text-gray-900">€{product.price.toFixed(2)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
