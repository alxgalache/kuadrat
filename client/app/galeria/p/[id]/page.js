'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { artAPI, ordersAPI, authAPI, authorsAPI, getArtImageUrl } from '@/lib/api'
import { useCart } from '@/contexts/CartContext'
import { useNotification } from '@/contexts/NotificationContext'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import AuthorModal from '@/components/AuthorModal'
import ShippingSelectionModal from '@/components/ShippingSelectionModal'

export default function ArtProductDetailPage({ params }) {
  const unwrappedParams = use(params)
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purchasing, setPurchasing] = useState(false)
  const [user, setUser] = useState(null)
  const [selectedAuthor, setSelectedAuthor] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [shippingModalOpen, setShippingModalOpen] = useState(false)
  const [isHoveringCart, setIsHoveringCart] = useState(false)
  const { isInCart, addToCart, removeFromCart, isSellerInCart, getSellerShipping } = useCart()
  const { showSuccess } = useNotification()
  const { showBanner } = useBannerNotification()
  const router = useRouter()

  useEffect(() => {
    const currentUser = authAPI.getCurrentUser()
    setUser(currentUser)
    loadProduct()
  }, [])

  const loadProduct = async () => {
    try {
      const data = await artAPI.getById(unwrappedParams.id)
      setProduct(data.product)
    } catch (err) {
      setError('No se pudo cargar la obra')
    } finally {
      setLoading(false)
    }
  }

  // NOTE: Legacy direct purchase flow (without Revolut) has been removed.
  // The gallery page now relies solely on the cart + checkout drawer flow.

  const handleViewAuthorBio = async () => {
    if (!product?.seller_slug) {
      console.warn('No seller_slug available for this product')
      return
    }

    try {
      const authorData = await authorsAPI.getBySlug(product.seller_slug)
      if (authorData?.author) {
        setSelectedAuthor(authorData.author)
        setModalOpen(true)
      } else {
        console.error('No author data received')
      }
    } catch (err) {
      console.error('Failed to load author:', err)
      // Still try to show some error to the user
      showBanner('No se pudo cargar la información del autor')
    }
  }

  const handleAddToCart = () => {
    // Art products ALWAYS require shipping selection (no auto-apply)
    // Each art product has its own specific shipping method and costs
    setShippingModalOpen(true)
  }

  const handleShippingSelected = (shipping) => {
    // Add to cart with shipping info
    addToCart({
      productId: product.id,
      productType: 'art',
      name: product.name,
      price: product.price,
      basename: product.basename,
      slug: product.slug,
      sellerId: product.seller_id,
      sellerName: product.seller_full_name,
      quantity: 1,
      shipping,
    })

    // Show banner notification
    showBanner('Producto añadido')

    // Scroll to top to show cart animation
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleRemoveFromCart = () => {
    removeFromCart(product.id, 'art')
  }

  const handleCartButtonClick = () => {
    if (!product) return

    if (isInCart(product.id, 'art')) {
      // Scroll to top smoothly to show cart animation
      window.scrollTo({ top: 0, behavior: 'smooth' })
      handleRemoveFromCart()
    } else {
      handleAddToCart()
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'Obra no encontrada'}</p>
      </div>
    )
  }

  const isSoldOut = product.is_sold === 1

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:max-w-7xl lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          {/* Image */}
          <div className="w-full rounded-lg bg-gray-200">
            <img
              alt={product.name}
              src={getArtImageUrl(product.basename)}
              className="w-full h-auto object-contain rounded-lg"
            />
          </div>

          {/* Product info */}
          <div className="mt-10 px-4 sm:mt-16 sm:px-0 lg:mt-0">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{product.name}</h1>

            <div className="mt-3">
              <h2 className="sr-only">Información de la obra</h2>
              <p className="text-3xl tracking-tight text-gray-900">€{product.price.toFixed(2)}</p>
            </div>

            <div className="mt-6">
              <h3 className="sr-only">Descripción</h3>
              <div
                className="space-y-6 text-base text-gray-700 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>

            <div className="mt-6">
              <p className="text-lg text-gray-400">
                  <span className="font-medium">Soporte:</span>{' '}
                  {product.type}
              </p>
              {product.seller_full_name && (
                <p className="text-lg text-gray-400 mt-1">
                  <span className="font-medium">Autor:</span>{' '}
                  <button
                    onClick={handleViewAuthorBio}
                    className="text-gray-400 hover:text-gray-500 hover:underline"
                  >
                    {product.seller_full_name}
                  </button>
                </p>
              )}
            </div>

            <div className="mt-10 flex flex-col gap-4">
              {isSoldOut ? (
                <button
                  disabled
                  className="flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent bg-gray-400 px-8 py-3 text-base font-medium text-white cursor-not-allowed sm:w-full"
                >
                  Temporalmente no disponible
                </button>
              ) : (
                <button
                  onClick={handleCartButtonClick}
                  onMouseEnter={() => setIsHoveringCart(true)}
                  onMouseLeave={() => setIsHoveringCart(false)}
                  className={`flex max-w-xs flex-1 items-center justify-center rounded-md border border-transparent px-8 py-3 text-base font-medium focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-50 focus:outline-hidden sm:w-full transition-colors ${
                    isInCart(product.id, 'art')
                      ? isHoveringCart
                        ? 'bg-red-100 text-red-900'
                        : 'bg-gray-200 text-gray-900'
                      : 'bg-black text-white hover:bg-gray-900'
                  }`}
                >
                  {isInCart(product.id, 'art')
                    ? isHoveringCart
                      ? 'Eliminar de la cesta'
                      : 'En la cesta'
                    : 'Añadir a la cesta'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Author bio modal */}
      <AuthorModal
        author={selectedAuthor}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      {/* Shipping selection modal */}
      {product && (
        <ShippingSelectionModal
          open={shippingModalOpen}
          onClose={() => setShippingModalOpen(false)}
          onSelect={handleShippingSelected}
          product={{
            id: product.id,
            type: 'art',
            seller_id: product.seller_id,
            seller_name: product.seller_full_name,
          }}
        />
      )}
    </div>
  )
}
