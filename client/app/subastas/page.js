'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { auctionsAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import useAuctionSocket from '@/hooks/useAuctionSocket'
import AuctionCalendar from '@/components/AuctionCalendar'
import AuctionCountdown from '@/components/AuctionCountdown'
import AuctionBidFeed from '@/components/AuctionBidFeed'
import BidModal from '@/components/BidModal'
import { SafeProductDescription } from '@/components/SafeHTML'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(datetimeStr) {
  if (!datetimeStr) return ''
  return new Date(datetimeStr).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
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

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Month range for calendar fetching */
function getMonthRange(year, month) {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function getImageUrl(product) {
  if (product.product_type === 'art') {
    return getArtImageUrl(product.basename)
  }
  return getOthersImageUrl(product.basename)
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function SubastasPage() {
  // Core state
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [auctionsForMonth, setAuctionsForMonth] = useState([])
  const [auctionsForDate, setAuctionsForDate] = useState([])
  const [selectedAuction, setSelectedAuction] = useState(null)
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
  const [loadingAuction, setLoadingAuction] = useState(false)
  const [bidModalOpen, setBidModalOpen] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  // Calendar tracking
  const parsedDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date()
  const [calendarYear, setCalendarYear] = useState(parsedDate.getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(parsedDate.getMonth())

  // Real-time data
  const { bids, prices, endDatetime, isEnded, isConnected } = useAuctionSocket(selectedAuction?.id)

  // Sorted products
  const products = useMemo(() => {
    if (!selectedAuction?.products) return []
    return [...selectedAuction.products].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }, [selectedAuction])

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
  const effectiveEndDatetime = endDatetime || selectedAuction?.end_datetime
  const auctionEnded = isEnded || (selectedAuction?.status === 'finished')

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
    if (!selectedAuction || !currentProduct) {
      setHistoricalBids([])
      return
    }
    const productId = currentProduct.art_id ?? currentProduct.other_id
    auctionsAPI.getProductBids(selectedAuction.id, productId, currentProduct.product_type, 50)
      .then((data) => setHistoricalBids(data.bids || []))
      .catch(() => setHistoricalBids([]))
  }, [selectedAuction?.id, currentProduct?.art_id, currentProduct?.other_id, currentProduct?.product_type])

  // Combined bids: real-time first, then historical (deduplicated)
  const allBids = useMemo(() => {
    const rtSet = new Set(productBids.map((b) => `${b.amount}-${b.created_at}`))
    const deduped = historicalBids.filter((b) => !rtSet.has(`${b.amount}-${b.created_at}`))
    return [...productBids, ...deduped]
  }, [productBids, historicalBids])

  // ------ Load auctions for the visible calendar month ------
  const loadMonthAuctions = useCallback(async (year, month) => {
    try {
      const { from, to } = getMonthRange(year, month)
      const data = await auctionsAPI.getByDateRange(from, to)
      setAuctionsForMonth(data.auctions || [])
    } catch {
      setAuctionsForMonth([])
    }
  }, [])

  // Initial load + whenever calendar month changes
  useEffect(() => {
    loadMonthAuctions(calendarYear, calendarMonth)
  }, [calendarYear, calendarMonth, loadMonthAuctions])

  // Sync calendar month when selectedDate changes
  useEffect(() => {
    const d = new Date(selectedDate + 'T00:00:00')
    setCalendarYear(d.getFullYear())
    setCalendarMonth(d.getMonth())
  }, [selectedDate])

  // ------ Filter auctions for selected date ------
  useEffect(() => {
    const matching = auctionsForMonth.filter((a) => {
      const start = a.start_datetime?.split('T')[0]
      const end = a.end_datetime?.split('T')[0]
      return (start && start <= selectedDate && end && end >= selectedDate)
    })
    setAuctionsForDate(matching)

    // Auto-select first auction if current selection isn't in the list
    if (matching.length > 0) {
      const currentStillValid = selectedAuction && matching.some((a) => a.id === selectedAuction.id)
      if (!currentStillValid) {
        loadAuctionDetail(matching[0].id)
      }
    } else {
      setSelectedAuction(null)
      setSelectedProductIndex(0)
    }
  }, [selectedDate, auctionsForMonth])

  // ------ Load full auction detail ------
  const loadAuctionDetail = async (id) => {
    setLoadingAuction(true)
    try {
      const data = await auctionsAPI.getById(id)
      setSelectedAuction(data.auction || null)
      setSelectedProductIndex(0)
    } catch {
      setSelectedAuction(null)
    } finally {
      setLoadingAuction(false)
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

  // ------ Render sidebar content (shared desktop/mobile) ------
  const renderSidebarContent = () => (
    <div>
      <AuctionCalendar
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        auctionDates={auctionsForMonth}
      />

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-900">
          Subastas para el {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
        </h3>

        {auctionsForDate.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No hay subastas para este dia</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {auctionsForDate.map((a) => {
              const isActive = selectedAuction?.id === a.id
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      loadAuctionDetail(a.id)
                      setMobileFilterOpen(false)
                    }}
                    className={`w-full text-left rounded-lg p-3 transition-colors ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">{a.name}</p>
                    <p className={`mt-0.5 text-xs ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                      {formatDateTimeRange(a.start_datetime, a.end_datetime)}
                    </p>
                    {a.product_count > 0 && (
                      <p className={`mt-1 text-xs ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                        {a.product_count} pieza{a.product_count !== 1 ? 's' : ''}
                      </p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )

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

  // ------ Main content ------
  const renderMainContent = () => {
    if (loadingAuction) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">Cargando subasta...</p>
        </div>
      )
    }

    if (!selectedAuction) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">Selecciona una subasta del calendario</p>
        </div>
      )
    }

    if (products.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-500">Esta subasta no tiene productos</p>
        </div>
      )
    }

    return (
      <div>
        {/* Product navigation */}
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

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: image */}
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

          {/* Right: product info + bid controls */}
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">{currentProduct?.name}</h2>

            {currentProduct?.seller_name && (
              <p className="mt-1 text-sm text-gray-500">{currentProduct.seller_name}</p>
            )}

            {currentProduct?.description && (
              <div className="mt-3 text-sm text-gray-700">
                <SafeProductDescription html={currentProduct.description} />
              </div>
            )}

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
            <div className="mt-6">
              {auctionEnded ? (
                <div className="rounded-md bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600">
                  Subasta finalizada
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setBidModalOpen(true)}
                  className="w-full rounded-md bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 sm:w-auto"
                >
                  Pujar {formatCurrency(displayNextBid)}
                </button>
              )}
            </div>

            {/* Connection indicator */}
            {selectedAuction && (
              <div className="mt-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-400">
                  {isConnected ? 'En directo' : 'Conectando...'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bid feed */}
        <div className="mt-10">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Historial de pujas</h3>
          <AuctionBidFeed bids={allBids} />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">Subastas</h1>

        {/* Mobile: filter toggle */}
        <div className="lg:hidden mb-4">
          <button
            type="button"
            onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            {mobileFilterOpen ? (
              <>
                <XMarkIcon className="h-5 w-5" /> Cerrar filtro
              </>
            ) : (
              <>
                <FunnelIcon className="h-5 w-5" /> Calendario y subastas
              </>
            )}
          </button>
        </div>

        {/* Mobile sidebar (collapsible) */}
        {mobileFilterOpen && (
          <div className="lg:hidden mb-6 rounded-lg border border-gray-200 p-4">
            {renderSidebarContent()}
          </div>
        )}

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-80 shrink-0">
            <div className="sticky top-8">
              {renderSidebarContent()}
            </div>
          </aside>

          {/* Main content area */}
          <main className="flex-1 min-w-0">
            {renderMainContent()}
          </main>
        </div>
      </div>

      {/* Bid modal */}
      <BidModal
        isOpen={bidModalOpen}
        onClose={() => setBidModalOpen(false)}
        auction={selectedAuction}
        product={productForModal}
        onBidPlaced={() => {
          setBidModalOpen(false)
          // Reload auction to get updated prices
          if (selectedAuction) {
            loadAuctionDetail(selectedAuction.id)
          }
        }}
      />
    </div>
  )
}
