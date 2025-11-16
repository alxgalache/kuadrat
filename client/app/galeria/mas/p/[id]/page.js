'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { othersAPI, ordersAPI, authAPI, authorsAPI, getOthersImageUrl } from '@/lib/api'
import { useCart } from '@/contexts/CartContext'
import { useNotification } from '@/contexts/NotificationContext'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import AuthorModal from '@/components/AuthorModal'
import ShippingSelectionModal from '@/components/ShippingSelectionModal'

export default function OthersProductDetailPage({ params }) {
  const unwrappedParams = use(params)
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purchasing, setPurchasing] = useState(false)
  const [user, setUser] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [selectedAuthor, setSelectedAuthor] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [shippingModalOpen, setShippingModalOpen] = useState(false)
  const [isHoveringCart, setIsHoveringCart] = useState(false)
  const { isInCart, addToCart, removeFromCart, getCartItem, getSellerOthersShipping } = useCart()
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
      const data = await othersAPI.getById(unwrappedParams.id)
      setProduct(data.product)
      // Set first available variant as default
      if (data.product.variations && data.product.variations.length > 0) {
        const firstAvailable = data.product.variations.find(v => v.stock > 0)
        if (firstAvailable) {
          setSelectedVariant(firstAvailable)
        } else {
          setSelectedVariant(data.product.variations[0])
        }
      }
    } catch (err) {
      setError('No se pudo cargar el producto')
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    let guestEmail = null

    // If user is not logged in, prompt for email (guest checkout)
    if (!user) {
      guestEmail = window.prompt('Introduce tu email para recibir la confirmación de compra:')

      if (!guestEmail) {
        // User cancelled
        return
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(guestEmail)) {
        showBanner('Por favor, introduce un email válido.')
        return
      }
    }

    if (!selectedVariant) {
      showBanner('Por favor, selecciona una variación')
      return
    }

    setPurchasing(true)
    try {
      // Create order items array based on quantity
      const items = Array(quantity).fill({
        type: 'other',
        id: product.id,
        variantId: selectedVariant.id,
      })

      await ordersAPI.create(items, guestEmail)
      showBanner('¡Compra exitosa! Revisa tu correo electrónico para confirmación.')

      if (user) {
        router.push('/orders')
      } else {
        // For guest checkout, redirect to gallery
        router.push('/galeria/mas')
      }
    } catch (err) {
      showBanner(err.message || 'Compra fallida. Por favor, inténtalo de nuevo.')
    } finally {
      setPurchasing(false)
    }
  }

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
    if (!selectedVariant) return

    // Check if seller already has OTHER 'others' products in cart
    // (Art products do NOT share shipping with 'others' products)
    const existingOthersShipping = getSellerOthersShipping(product.seller_id)

    if (existingOthersShipping) {
      // Auto-apply existing shipping from other 'others' products
      addToCart({
        productId: product.id,
        productType: 'other',
        name: product.name,
        price: product.price,
        basename: product.basename,
        slug: product.slug,
        sellerId: product.seller_id,
        sellerName: product.seller_full_name,
        quantity: quantity,
        variantId: selectedVariant.id,
        variantKey: selectedVariant.key || 'Opción estándar',
        shipping: existingOthersShipping,
      })

      // Show banner notification
      showBanner('Producto añadido')

      // Scroll to top to show cart animation
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      // Open shipping selection modal (first 'others' product from this seller)
      setShippingModalOpen(true)
    }
  }

  const handleShippingSelected = (shipping) => {
    if (!selectedVariant) return

    // Add to cart with shipping info
    addToCart({
      productId: product.id,
      productType: 'other',
      name: product.name,
      price: product.price,
      basename: product.basename,
      slug: product.slug,
      sellerId: product.seller_id,
      sellerName: product.seller_full_name,
      quantity: quantity,
      variantId: selectedVariant.id,
      variantKey: selectedVariant.key || 'Opción estándar',
      shipping,
    })

    // Show banner notification
    showBanner('Producto añadido')

    // Scroll to top to show cart animation
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleRemoveFromCart = () => {
    if (!selectedVariant) return
    removeFromCart(product.id, 'other', selectedVariant.id)
  }

  const handleCartButtonClick = () => {
    if (!product || !selectedVariant) return

    if (isInCart(product.id, 'other', selectedVariant.id)) {
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
        <p className="text-red-500">{error || 'Producto no encontrado'}</p>
      </div>
    )
  }

  const isSoldOut = product.is_sold === 1 || !selectedVariant || selectedVariant.stock === 0
  const totalStock = product.variations ? product.variations.reduce((sum, v) => sum + (v.stock || 0), 0) : 0

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:max-w-7xl lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          {/* Image */}
          <div className="w-full rounded-lg bg-gray-200">
            <img
              alt={product.name}
              src={getOthersImageUrl(product.basename)}
              className="w-full h-auto object-contain rounded-lg"
            />
          </div>

          {/* Product info */}
          <div className="mt-10 px-4 sm:mt-16 sm:px-0 lg:mt-0">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{product.name}</h1>

            <div className="mt-3">
              <h2 className="sr-only">Información del producto</h2>
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
              {product.seller_full_name && (
                <p className="text-lg text-gray-400">
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

            {/* Variations - NOTE: User will customize this section */}
            {product.variations && product.variations.length > 0 && product.is_sold !== 1 && totalStock > 0 && (
              <div className="mt-6">
                <label htmlFor="variation" className="block text-sm font-medium text-gray-900">
                  Selecciona una opción:
                </label>
                <select
                  id="variation"
                  value={selectedVariant?.id || ''}
                  onChange={(e) => {
                    const variant = product.variations.find(v => v.id === parseInt(e.target.value, 10))
                    setSelectedVariant(variant)
                    setQuantity(1)
                  }}
                  className="mt-2 w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:border-black focus:ring-2 focus:ring-black"
                >
                  {product.variations.map((variant) => (
                    <option key={variant.id} value={variant.id} disabled={variant.stock === 0}>
                      {variant.key ? variant.key : 'Opción estándar'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-4">
              {isSoldOut ? (
                <button
                  disabled
                  className="w-full max-w-xs flex items-center justify-center rounded-md border border-transparent bg-gray-400 px-8 py-3 text-base font-medium text-white cursor-not-allowed"
                >
                  Temporalmente no disponible
                </button>
              ) : (
                <>
                  {selectedVariant && selectedVariant.stock > 0 && (
                    <div>
                      <label htmlFor="quantity" className="block text-sm font-medium text-gray-900">
                        Cantidad:
                      </label>
                      <select
                        id="quantity"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                        className="mt-2 w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:border-black focus:ring-2 focus:ring-black"
                      >
                        {[...Array(Math.min(selectedVariant.stock, 10))].map((_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={handleCartButtonClick}
                    onMouseEnter={() => setIsHoveringCart(true)}
                    onMouseLeave={() => setIsHoveringCart(false)}
                    className={`w-full max-w-xs flex items-center justify-center rounded-md border border-transparent px-8 py-3 text-base font-medium focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-50 focus:outline-hidden transition-colors ${
                      selectedVariant && isInCart(product.id, 'other', selectedVariant.id)
                        ? isHoveringCart
                          ? 'bg-red-100 text-red-900'
                          : 'bg-gray-200 text-gray-900'
                        : 'bg-black text-white hover:bg-gray-900'
                    }`}
                  >
                    {selectedVariant && isInCart(product.id, 'other', selectedVariant.id)
                      ? isHoveringCart
                        ? 'Eliminar de la cesta'
                        : 'En la cesta'
                      : 'Añadir a la cesta'}
                  </button>
                </>
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
            type: 'others',
            seller_id: product.seller_id,
            seller_name: product.seller_full_name,
          }}
        />
      )}
    </div>
  )
}
