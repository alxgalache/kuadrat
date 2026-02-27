import Link from 'next/link'
import AuctionImageMosaic from '@/components/AuctionImageMosaic'
import AuctionBadge from '@/components/AuctionBadge'

function getAuthorText(productPreviews, sellersSummary) {
  if (!productPreviews || productPreviews.length === 0) return null

  const mainName = productPreviews[0].seller_name || 'Autor desconocido'

  if (productPreviews.length === 1) {
    return mainName
  }

  const uniqueSellers = new Set(sellersSummary?.map((s) => s.sellerId) || [])
  if (uniqueSellers.size <= 1) {
    return mainName
  }

  return `${mainName} y ${uniqueSellers.size - 1} más`
}

export default function AuctionGridItem({ auction }) {
  const { product_previews = [], product_count = 0, sellers_summary = [] } = auction
  const isSingle = product_count === 1
  const product = isSingle ? product_previews[0] : null

  return (
    <li className="inline-flex w-full flex-col text-center">
      <div className="group relative">
        {/* Image area with badge overlay */}
        <div className="relative">
          <AuctionBadge />
          <AuctionImageMosaic products={product_previews} productCount={product_count} />
        </div>

        {/* Text area */}
        <div className="mt-6">
          <p className="text-sm text-gray-500">
            {getAuthorText(product_previews, sellers_summary)}
          </p>

          <h3 className="mt-1 font-semibold text-gray-900">
            <Link href={`/eventos/subasta/${auction.id}`}>
              <span className="absolute inset-0" />
              {isSingle && product ? product.name : auction.name}
            </Link>
          </h3>

          {isSingle && product ? (
            <p className="mt-1">
              <span className="font-semibold text-gray-900">€{Number(product.current_price).toFixed(2)}</span>
              {' '}
              <span className="text-xs text-gray-400">€{Number(product.start_price).toFixed(2)}</span>
            </p>
          ) : (
            <p className="mt-1 text-gray-900">
              {product_count} {product_count === 1 ? 'item' : 'items'}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
