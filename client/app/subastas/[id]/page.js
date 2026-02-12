'use client'

import { useState, useEffect, useMemo, use } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'
import { auctionsAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import useAuctionSocket from '@/hooks/useAuctionSocket'
import AuctionCountdown from '@/components/AuctionCountdown'
import AuctionBidFeed from '@/components/AuctionBidFeed'
import BidModal from '@/components/BidModal'
import { SafeProductDescription } from '@/components/SafeHTML'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDateTimeRange(startStr, endStr) {
  if (!startStr || !endStr) return ''
  const start = new Date(startStr)
  const end = new Date(endStr)

  const formatDate = (d) => d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  })
  const formatTimeOnly = (d) => d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${formatDate(start)} ${formatTimeOnly(start)} - ${formatDate(end)} ${formatTimeOnly(end)}`
}

function getImageUrl(product) {
  if (product.product_type === 'art') {
    return getArtImageUrl(product.basename)
  }
  return getOthersImageUrl(product.basename)
}

function stripHtmlTags(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '')
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function SubastaDetailPage({ params }) {
  const resolvedParams = use(params)
  const { id } = resolvedParams

  const [auction, setAuction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
  const [bidModalOpen, setBidModalOpen] = useState(false)

  // Real-time data
  const { bids, prices, endDatetime, isEnded, isConnected } = useAuctionSocket(auction?.id)

  // Sorted products
  const products = useMemo(() => {
    if (!auction?.products) return []
    return [...auction.products].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }, [auction])

  const currentProduct = products[selectedProductIndex] || null

  // Real-time price for current product
  const realtimeData = useMemo(() => {
    if (!currentProduct) return null
    const key = `${currentProduct.art_id ?? currentProduct.other_id}-${currentProduct.product_type}`
    return prices.get(key) || null
  }, [currentProduct, prices])

  const displayPrice = realtimeData?.newPrice ?? currentProduct?.current_price ?? 0
  const displayNextBid = realtimeData?.nextBidAmount ?? ((currentProduct?.current_price ?? 0) + (currentProduct?.step_new_bid ?? 0))

  // Effective end datetime from socket or auction
  const effectiveEndDatetime = endDatetime || auction?.end_datetime
  const auctionEnded = isEnded || (auction?.status === 'finished')

  // Bids filtered for current product
  const productBids = useMemo(() => {
    if (!currentProduct) return []
    const productId = currentProduct.art_id ?? currentProduct.other_id
    const productType = currentProduct.product_type
    return bids.filter((b) => b.productId === productId && b.productType === productType)
  }, [bids, currentProduct])

  // Historical bids (loaded once per product)
  const [historicalBids, setHistoricalBids] = useState([])

  useEffect(() => {
    if (!auction || !currentProduct) {
      setHistoricalBids([])
      return
    }
    const productId = currentProduct.art_id ?? currentProduct.other_id
    auctionsAPI.getProductBids(auction.id, productId, currentProduct.product_type, 50)
      .then((data) => setHistoricalBids(data.bids || []))
      .catch(() => setHistoricalBids([]))
  }, [auction?.id, currentProduct?.art_id, currentProduct?.other_id, currentProduct?.product_type])

  // Combined bids: real-time first, then historical (deduplicated)
  const allBids = useMemo(() => {
    const rtSet = new Set(productBids.map((b) => `${b.amount}-${b.created_at}`))
    const deduped = historicalBids.filter((b) => !rtSet.has(`${b.amount}-${b.created_at}`))
    return [...productBids, ...deduped]
  }, [productBids, historicalBids])

  // ------ Load auction ------
  useEffect(() => {
    loadAuction()
  }, [id])

  const loadAuction = async () => {
    try {
      const data = await auctionsAPI.getById(id)
      setAuction(data.auction || null)
    } catch {
      setError('Subasta no encontrada')
    } finally {
      setLoading(false)
    }
  }

  // ------ Product with real-time overlay for bid modal ------
  const productForModal = useMemo(() => {
    if (!currentProduct) return null
    return {
      ...currentProduct,
      current_price: displayPrice,
      step_new_bid: currentProduct.step_new_bid,
    }
  }, [currentProduct, displayPrice])

  // ------ Product navigation ------
  const handlePrevProduct = () => {
    if (selectedProductIndex > 0) {
      setSelectedProductIndex((i) => i - 1)
    }
  }

  const handleNextProduct = () => {
    if (selectedProductIndex < products.length - 1) {
      setSelectedProductIndex((i) => i + 1)
    }
  }

  // ------ Loading / Error states ------
  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">Cargando subasta...</p>
      </div>
    )
  }

  if (error || !auction) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-sm text-red-500">{error || 'Subasta no encontrada'}</p>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">Esta subasta no tiene productos</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Auction header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{auction.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {formatDateTimeRange(auction.start_datetime, auction.end_datetime)}
          </p>
        </div>

        {/* Product navigation */}
        {products.length > 1 && (
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={handlePrevProduct}
              disabled={selectedProductIndex === 0}
              className="p-1 inline-flex items-center gap-1 text-sm font-medium text-gray-900 hover:text-gray-600 disabled:text-gray-300 disabled:cursor-default"
            >
              <ChevronLeftIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Anterior</span>
            </button>

            <span className="text-sm font-medium text-gray-900 text-center">
              <span className="hidden sm:inline">{currentProduct?.name} </span>
              ({selectedProductIndex + 1} de {products.length})
            </span>

            <button
              type="button"
              onClick={handleNextProduct}
              disabled={selectedProductIndex === products.length - 1}
              className="p-1 inline-flex items-center gap-1 text-sm font-medium text-gray-900 hover:text-gray-600 disabled:text-gray-300 disabled:cursor-default"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Three-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Column 1: Product image */}
          <div className="lg:col-span-3">
            <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
              {currentProduct?.basename ? (
                <img
                  src={getImageUrl(currentProduct)}
                  alt={currentProduct.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400 text-sm">
                  Sin imagen
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Product info + bid controls */}
          <div className="lg:col-span-5 flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">{currentProduct?.name}</h2>

            {currentProduct?.seller_name && (
              <p className="mt-1 text-sm text-gray-500">{currentProduct.seller_name}</p>
            )}

            {currentProduct?.description && (() => {
              const plainText = stripHtmlTags(currentProduct.description)
              if (plainText.length > 350) {
                return (
                  <div className="mt-4 text-sm text-gray-700">
                    <p>{plainText.substring(0, 350)}(...)</p>
                  </div>
                )
              }
              return (
                <div className="mt-3 text-sm text-gray-700">
                  <SafeProductDescription html={currentProduct.description} />
                </div>
              )
            })()}

            {currentProduct?.shipping_observations && (
              <div className="mt-3 rounded-md bg-amber-50 p-3">
                <p className="text-sm text-amber-800">{currentProduct.shipping_observations}</p>
              </div>
            )}

            {/* Price */}
            <div className="mt-6">
              <p className="text-xs font-medium uppercase text-gray-500">Precio actual</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{formatCurrency(displayPrice)}</p>
            </div>

            {/* Countdown */}
            <div className="mt-4">
              <AuctionCountdown endDatetime={effectiveEndDatetime} isEnded={auctionEnded} />
            </div>

            {/* Bid button / ended message */}
            <div className="mt-4">
              {auctionEnded ? (
                <div className="rounded-md bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600">
                  Subasta finalizada
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setBidModalOpen(true)}
                  className="w-full rounded-md bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
                >
                  Pujar {formatCurrency(displayNextBid)}
                </button>
              )}
            </div>
          </div>

          {/* Column 3: Bid history */}
          <div className="lg:col-span-4">
            <div className="flex items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Historial de pujas</h3>
              {auction && !auctionEnded && (
                <div className="ml-3 flex items-center gap-1.5">
                  {isConnected ? (
                    <span className="inline-flex items-center gap-x-1.5 rounded-md px-2 text-xs font-medium text-gray-900 inset-ring inset-ring-gray-400">
                      <svg viewBox="0 0 6 6" aria-hidden="true" className="size-1.5 fill-red-500 animate-ping">
                        <circle r={3} cx={3} cy={3} />
                      </svg>
                      LIVE
                    </span>
                  ) : (
                    <>
                      <span className="h-3 w-3 rounded-full bg-gray-300" />
                      <span className="text-xs text-gray-400">Conectando...</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <AuctionBidFeed bids={allBids} />
          </div>
        </div>
      </div>

      {/* Bid modal */}
      <BidModal
        isOpen={bidModalOpen}
        onClose={() => setBidModalOpen(false)}
        auction={auction}
        product={productForModal}
        livePriceData={realtimeData}
        onBidPlaced={() => {
          setBidModalOpen(false)
          loadAuction()
        }}
      />
    </div>
  )
}
