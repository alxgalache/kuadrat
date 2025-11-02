'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { shippingAPI } from '@/lib/api'
import { postcodeValidator } from 'postcode-validator'

export default function ShippingSelectionModal({
  open,
  onClose,
  onSelect,
  product, // { id, type: 'art' | 'others', seller_id, seller_name }
}) {
  const [selectedType, setSelectedType] = useState(null) // 'pickup' | 'delivery'
  const [selectedMethod, setSelectedMethod] = useState(null)
  const [pickupMethods, setPickupMethods] = useState([])
  const [deliveryMethods, setDeliveryMethods] = useState([])
  const [country, setCountry] = useState('ES') // Default to Spain
  const [postalCode, setPostalCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingDelivery, setLoadingDelivery] = useState(false)
  const [error, setError] = useState('')
  const [postalCodeError, setPostalCodeError] = useState('')

  // Load pickup methods on mount
  useEffect(() => {
    if (open && product) {
      loadPickupMethods()
    }
  }, [open, product])


  const loadPickupMethods = async () => {
    try {
      setLoading(true)
      setError('')

      const data = await shippingAPI.getAvailableForProduct(
        product.id,
        product.type
      )

      setPickupMethods(data.pickup || [])

      // Auto-select if only one pickup method
      if (data.pickup && data.pickup.length === 1) {
        setSelectedType('pickup')
        setSelectedMethod(data.pickup[0].id)
      }
    } catch (err) {
      console.error('Error loading shipping methods:', err)
      setError('No se pudieron cargar los métodos de envío')
    } finally {
      setLoading(false)
    }
  }

  const loadDeliveryMethods = async () => {
    if (!country || !postalCode) return

    // Validate postal code format
    try {
      const isValid = postcodeValidator(postalCode, country)
      if (!isValid) {
        setPostalCodeError('Código postal inválido')
        return
      }
    } catch (err) {
      setPostalCodeError('Código postal inválido')
      return
    }

    setPostalCodeError('')

    try {
      setLoadingDelivery(true)
      setError('')

      const data = await shippingAPI.getAvailableForProduct(
        product.id,
        product.type,
        country,
        postalCode
      )

      setDeliveryMethods(data.delivery || [])

      // Auto-select if only one delivery method
      if (data.delivery && data.delivery.length === 1) {
        setSelectedMethod(data.delivery[0].id)
      } else if (data.delivery && data.delivery.length === 0) {
        setError('No hay métodos de envío disponibles para este código postal')
      }
    } catch (err) {
      console.error('Error loading delivery methods:', err)
      setError('No se pudieron cargar los métodos de entrega')
      setDeliveryMethods([])
    } finally {
      setLoadingDelivery(false)
    }
  }

  const handlePostalCodeChange = (e) => {
    const value = e.target.value.trim()
    setPostalCode(value)
    setPostalCodeError('')

    // Clear delivery methods when postal code changes
    setDeliveryMethods([])
    if (selectedType === 'delivery') {
      setSelectedMethod(null)
    }
  }

  const handlePostalCodeBlur = () => {
    if (postalCode && selectedType === 'delivery') {
      loadDeliveryMethods()
    }
  }

  const handleSelectPickup = (method) => {
    setSelectedType('pickup')
    setSelectedMethod(method.id)
  }

  const handleSelectDelivery = () => {
    setSelectedType('delivery')
    setSelectedMethod(null)
    setDeliveryMethods([])
  }

  const handleSelectDeliveryMethod = (method) => {
    setSelectedMethod(method.id)
  }

  const handleConfirm = () => {
    if (!selectedMethod) {
      setError('Por favor selecciona un método de envío')
      return
    }

    let shippingData

    if (selectedType === 'pickup') {
      const method = pickupMethods.find(m => m.id === selectedMethod)
      shippingData = {
        methodId: method.id,
        methodName: method.name,
        methodType: 'pickup',
        cost: method.cost,
        estimatedDays: method.estimated_delivery_days,
        pickupAddress: method.pickup_address,
        pickupCity: method.pickup_city,
        pickupPostalCode: method.pickup_postal_code,
        pickupCountry: method.pickup_country,
        pickupInstructions: method.pickup_instructions,
      }
    } else {
      const method = deliveryMethods.find(m => m.id === selectedMethod)
      shippingData = {
        methodId: method.id,
        methodName: method.name,
        methodType: 'delivery',
        cost: method.cost,
        estimatedDays: method.estimated_delivery_days,
        deliveryCountry: country,
        deliveryPostalCode: postalCode,
      }
    }

    onSelect(shippingData)
    onClose()
  }

  const handleClose = () => {
    // Reset state
    setSelectedType(null)
    setSelectedMethod(null)
    setDeliveryMethods([])
    setPostalCode('')
    setError('')
    setPostalCodeError('')
    onClose()
  }

  if (!product) return null

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-2xl w-full rounded-lg bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Seleccionar método de envío
            </DialogTitle>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center">
              <p className="text-gray-500">Cargando métodos de envío...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Shipping options */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-900 mb-4">
                  Selecciona cómo recibirás tu pedido
                </legend>

                <div className="space-y-4">
                  {/* Pickup methods */}
                  {pickupMethods.map((method) => (
                    <label
                      key={method.id}
                      className={`group relative flex rounded-lg border p-4 cursor-pointer ${
                        selectedType === 'pickup' && selectedMethod === method.id
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="shipping-method"
                        value={method.id}
                        checked={selectedType === 'pickup' && selectedMethod === method.id}
                        onChange={() => handleSelectPickup(method)}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="block text-sm font-medium text-gray-900">
                            {method.name}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">
                            Gratis
                          </span>
                        </div>
                        {method.description && (
                          <span className="mt-1 block text-sm text-gray-500">
                            {method.description}
                          </span>
                        )}
                        {method.pickup_address && (
                          <div className="mt-2 text-sm text-gray-600">
                            <p className="font-medium">Dirección de recogida:</p>
                            <p>{method.pickup_address}</p>
                            <p>{method.pickup_city} {method.pickup_postal_code}</p>
                            {method.pickup_instructions && (
                              <p className="mt-1 text-xs text-gray-500">{method.pickup_instructions}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <CheckCircleIcon
                        className={`h-5 w-5 ml-3 flex-shrink-0 ${
                          selectedType === 'pickup' && selectedMethod === method.id
                            ? 'text-gray-900'
                            : 'invisible'
                        }`}
                      />
                    </label>
                  ))}

                  {/* Delivery option */}
                  {pickupMethods.length > 0 && (
                    <label
                      className={`group relative flex flex-col rounded-lg border p-4 cursor-pointer ${
                        selectedType === 'delivery'
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-1">
                          <input
                            type="radio"
                            name="shipping-type"
                            value="delivery"
                            checked={selectedType === 'delivery'}
                            onChange={handleSelectDelivery}
                            className="h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-900"
                          />
                          <span className="ml-3 block text-sm font-medium text-gray-900">
                            Envío a domicilio
                          </span>
                        </div>
                      </div>

                      {selectedType === 'delivery' && (
                        <div className="mt-4 ml-7 space-y-4">
                          {/* Postal code input */}
                          <div>
                            <label htmlFor="postal-code" className="block text-sm font-medium text-gray-700">
                              Código postal
                            </label>
                            <div className="mt-1 flex gap-2">
                              <input
                                type="text"
                                id="postal-code"
                                value={postalCode}
                                onChange={handlePostalCodeChange}
                                onBlur={handlePostalCodeBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    loadDeliveryMethods()
                                  }
                                }}
                                placeholder="28001"
                                className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                              />
                              <button
                                type="button"
                                onClick={loadDeliveryMethods}
                                disabled={!postalCode || loadingDelivery}
                                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {loadingDelivery ? 'Buscando...' : 'Buscar'}
                              </button>
                            </div>
                            {postalCodeError && (
                              <p className="mt-1 text-sm text-red-600">{postalCodeError}</p>
                            )}
                          </div>

                          {/* Delivery methods */}
                          {deliveryMethods.length > 0 && (
                            <div className="space-y-2">
                              {deliveryMethods.map((method) => (
                                <label
                                  key={method.id}
                                  className={`flex items-center justify-between rounded-md border p-3 cursor-pointer ${
                                    selectedMethod === method.id
                                      ? 'border-gray-900 bg-white'
                                      : 'border-gray-200 bg-white hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex items-center flex-1">
                                    <input
                                      type="radio"
                                      name="delivery-method"
                                      value={method.id}
                                      checked={selectedMethod === method.id}
                                      onChange={() => handleSelectDeliveryMethod(method)}
                                      className="h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-900"
                                    />
                                    <div className="ml-3 flex-1">
                                      <span className="block text-sm font-medium text-gray-900">
                                        {method.name}
                                      </span>
                                      {method.description && (
                                        <span className="block text-sm text-gray-500">
                                          {method.description}
                                        </span>
                                      )}
                                      {method.estimated_delivery_days && (
                                        <span className="block text-xs text-gray-500">
                                          Entrega en {method.estimated_delivery_days} días
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="ml-3 text-sm font-semibold text-gray-900">
                                    €{method.cost.toFixed(2)}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </label>
                  )}
                </div>
              </fieldset>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!selectedMethod}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Añadir al carrito
                </button>
              </div>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
