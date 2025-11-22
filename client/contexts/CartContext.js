'use client'

import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext()

const CART_STORAGE_KEY = 'kuadrat_cart'
const CART_TIMESTAMP_KEY = 'kuadrat_cart_timestamp'
const INACTIVITY_DAYS = 10

export function CartProvider({ children }) {
  const [cart, setCart] = useState([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [animationTrigger, setAnimationTrigger] = useState(0)

  // Initialize cart from localStorage
  useEffect(() => {
    try {
      const storedCart = localStorage.getItem(CART_STORAGE_KEY)
      const timestamp = localStorage.getItem(CART_TIMESTAMP_KEY)

      if (storedCart && timestamp) {
        const daysSinceLastUpdate = (Date.now() - parseInt(timestamp)) / (1000 * 60 * 60 * 24)

        if (daysSinceLastUpdate < INACTIVITY_DAYS) {
          setCart(JSON.parse(storedCart))
        } else {
          // Clear cart after 10 days of inactivity
          localStorage.removeItem(CART_STORAGE_KEY)
          localStorage.removeItem(CART_TIMESTAMP_KEY)
        }
      }
    } catch (error) {
      console.error('Error loading cart:', error)
    }
    setIsInitialized(true)
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (isInitialized) {
      try {
        if (cart.length > 0) {
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
          localStorage.setItem(CART_TIMESTAMP_KEY, Date.now().toString())
        } else {
          localStorage.removeItem(CART_STORAGE_KEY)
          localStorage.removeItem(CART_TIMESTAMP_KEY)
        }
      } catch (error) {
        console.error('Error saving cart:', error)
      }
    }
  }, [cart, isInitialized])

  // Generate unique cart item ID
  const generateCartItemId = (productId, productType, variantId) => {
    return variantId
      ? `${productType}_${productId}_variant_${variantId}`
      : `${productType}_${productId}`
  }

  // Check if item is in cart
  const isInCart = (productId, productType, variantId = null) => {
    const itemId = generateCartItemId(productId, productType, variantId)
    return cart.some(item => item.id === itemId)
  }

  // Get cart item
  const getCartItem = (productId, productType, variantId = null) => {
    const itemId = generateCartItemId(productId, productType, variantId)
    return cart.find(item => item.id === itemId)
  }

  // Add item to cart
  const addToCart = (item) => {
    const {
      productId,
      productType,
      name,
      price,
      basename,
      slug,
      sellerId,
      sellerName,
      quantity = 1,
      variantId = null,
      variantKey = null,
      shipping = null, // { methodId, methodName, methodType, cost, estimatedDays?, pickupAddress? }
    } = item

    const itemId = generateCartItemId(productId, productType, variantId)

    setCart(prevCart => {
      // For 'others' products with same variant, stack quantities
      const existingItemIndex = prevCart.findIndex(cartItem => cartItem.id === itemId)

      if (existingItemIndex !== -1) {
        // Item already exists, update quantity
        const updatedCart = [...prevCart]
        updatedCart[existingItemIndex] = {
          ...updatedCart[existingItemIndex],
          quantity: updatedCart[existingItemIndex].quantity + quantity
        }
        return updatedCart
      } else {
        // Add new item
        return [...prevCart, {
          id: itemId,
          productId,
          productType,
          name,
          price,
          basename,
          slug,
          sellerId,
          sellerName,
          quantity,
          variantId,
          variantKey,
          shipping,
          addedAt: Date.now()
        }]
      }
    })

    // Trigger animation
    setAnimationTrigger(prev => prev + 1)
  }

  // Remove item from cart
  const removeFromCart = (productId, productType, variantId = null) => {
    const itemId = generateCartItemId(productId, productType, variantId)
    setCart(prevCart => prevCart.filter(item => item.id !== itemId))

    // Trigger animation
    setAnimationTrigger(prev => prev + 1)
  }

  // Update item quantity
  const updateQuantity = (productId, productType, quantity, variantId = null) => {
    if (quantity <= 0) {
      removeFromCart(productId, productType, variantId)
      return
    }

    const itemId = generateCartItemId(productId, productType, variantId)
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === itemId
          ? { ...item, quantity }
          : item
      )
    )
  }

  // Clear cart
  const clearCart = () => {
    setCart([])
  }

  // Get total items count
  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  // Internal helper: build shipping aggregation per (seller, productType, method)
  // respecting maxArticles per shipment and counting total units.
  const getShippingBreakdown = () => {
    const groupsMap = new Map()

    cart.forEach((item) => {
      if (!item.shipping || !item.shipping.methodId) return

      const key = `${item.sellerId}:${item.productType}:${item.shipping.methodId}`
      const existing = groupsMap.get(key)

      const maxArticles = item.shipping.maxArticles || 1

      if (!existing) {
        groupsMap.set(key, {
          sellerId: item.sellerId,
          sellerName: item.sellerName,
          productType: item.productType,
          methodId: item.shipping.methodId,
          methodName: item.shipping.methodName,
          methodType: item.shipping.methodType,
          maxArticles,
          costPerShipment: item.shipping.cost || 0,
          totalUnits: item.quantity,
        })
      } else {
        existing.totalUnits += item.quantity
      }
    })

    const groups = Array.from(groupsMap.values()).map(group => {
      const maxArticles = group.maxArticles || 1
      const shipments = Math.ceil(group.totalUnits / maxArticles)
      const totalShipping = shipments * group.costPerShipment

      return {
        ...group,
        shipments,
        totalShipping,
      }
    })

    return groups
  }

  // Get total price (including shipping, aggregated per shipment)
  const getTotalPrice = () => {
    const productsTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0)
    const shippingTotal = getShippingBreakdown().reduce((sum, group) => sum + group.totalShipping, 0)
    return productsTotal + shippingTotal
  }

  // Get subtotal (products only, no shipping)
  const getSubtotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0)
  }

  // Get total shipping cost (aggregated per shipment)
  const getTotalShipping = () => {
    return getShippingBreakdown().reduce((sum, group) => sum + group.totalShipping, 0)
  }

  // Update shipping for a specific cart item
  const updateShipping = (productId, productType, shipping, variantId = null) => {
    const itemId = generateCartItemId(productId, productType, variantId)
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === itemId
          ? { ...item, shipping }
          : item
      )
    )
  }

  // Get all items from a specific seller
  const getItemsBySeller = (sellerId) => {
    return cart.filter(item => item.sellerId === sellerId)
  }

  // Update shipping for all items from a specific seller
  const updateSellerShipping = (sellerId, shipping) => {
    setCart(prevCart =>
      prevCart.map(item =>
        item.sellerId === sellerId
          ? { ...item, shipping }
          : item
      )
    )
  }

  // Check if seller is already in cart
  const isSellerInCart = (sellerId) => {
    return cart.some(item => item.sellerId === sellerId)
  }

  // Get existing shipping method for a seller (if any)
  const getSellerShipping = (sellerId) => {
    const sellerItem = cart.find(item => item.sellerId === sellerId)
    return sellerItem?.shipping || null
  }

  // Get existing shipping method for 'others' products from a seller
  // This is used to auto-apply shipping only for 'others' products from the same seller
  const getSellerOthersShipping = (sellerId) => {
    const sellerOthersItem = cart.find(
      item => item.sellerId === sellerId && item.productType === 'other'
    )
    return sellerOthersItem?.shipping || null
  }

  // Get existing shipping method for 'art' products from a seller
  // This is used to auto-apply shipping only for 'art' products from the same seller
  const getSellerArtShipping = (sellerId) => {
    const sellerArtItem = cart.find(
      item => item.sellerId === sellerId && item.productType === 'art'
    )
    return sellerArtItem?.shipping || null
  }

  const value = {
    cart,
    isInCart,
    getCartItem,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotalItems,
    getTotalPrice,
    getSubtotal,
    getTotalShipping,
    getShippingBreakdown,
    updateShipping,
    getItemsBySeller,
    updateSellerShipping,
    isSellerInCart,
    getSellerShipping,
    getSellerOthersShipping,
    getSellerArtShipping,
    animationTrigger,
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
