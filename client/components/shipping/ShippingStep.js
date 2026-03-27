'use client'

import { useState, useEffect, useCallback } from 'react'
import { useCart } from '@/contexts/CartContext'
import { shippingAPI } from '@/lib/api'
import { SENDCLOUD_ENABLED_ART, SENDCLOUD_ENABLED_OTHERS } from '@/lib/constants'
import SellerShippingGroup from './SellerShippingGroup'

export default function ShippingStep({ deliveryAddress }) {
  const { cart, shippingSelections, setSendcloudShipping } = useCart()
  const [sellerGroups, setSellerGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchShippingOptions = useCallback(async () => {
    // Build items for Sendcloud-enabled product types only
    const sendcloudItems = cart.filter(item => {
      if (item.productType === 'art' && SENDCLOUD_ENABLED_ART) return true
      if ((item.productType === 'other' || item.productType === 'others') && SENDCLOUD_ENABLED_OTHERS) return true
      return false
    })

    if (sendcloudItems.length === 0) {
      setSellerGroups([])
      return
    }

    const items = sendcloudItems.map(item => ({
      productId: item.productId,
      productType: item.productType,
      quantity: item.quantity,
      sellerId: item.sellerId,
      weight: item.weight || 0,
      dimensions: item.dimensions || null,
      canCopack: item.canCopack ?? true,
    }))

    setLoading(true)
    setError(null)

    try {
      const res = await shippingAPI.getShippingOptions(items, {
        country: deliveryAddress.country || 'ES',
        postalCode: deliveryAddress.postalCode || '',
        city: deliveryAddress.city || '',
        address: deliveryAddress.line1 || deliveryAddress.address || '',
      })
      setSellerGroups(res.sellers || [])
    } catch (err) {
      setError('No se pudieron cargar las opciones de envío. Inténtalo de nuevo.')
      setSellerGroups([])
    } finally {
      setLoading(false)
    }
  }, [cart, deliveryAddress])

  useEffect(() => {
    fetchShippingOptions()
  }, [fetchShippingOptions])

  const handleSelect = useCallback((sellerId, selection) => {
    setSendcloudShipping(sellerId, selection)
  }, [setSendcloudShipping])

  // Check if all seller groups have a selection
  const allSelected = sellerGroups.length > 0 && sellerGroups.every(
    seller => shippingSelections[seller.sellerId]
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Opciones de envío</h3>
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
          <span className="ml-3 text-sm text-gray-500">Calculando opciones de envío...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Opciones de envío</h3>
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
          <button
            onClick={fetchShippingOptions}
            className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-900"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (sellerGroups.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Opciones de envío</h3>
      <p className="text-sm text-gray-500">
        Selecciona un método de envío para cada vendedor.
      </p>
      <div className="space-y-4">
        {sellerGroups.map(seller => (
          <SellerShippingGroup
            key={seller.sellerId}
            seller={seller}
            deliveryAddress={deliveryAddress}
            selection={shippingSelections[seller.sellerId] || null}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  )
}
