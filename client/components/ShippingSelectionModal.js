'use client'

import { useState, useEffect, useRef } from 'react'
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

  // Load pickup methods whenever the modal is opened for a product *or* the
  // product actually changes.
  //
  // IMPORTANT: we deliberately depend on stable identifiers (product.id and
  // product.type) instead of the whole `product` object. On the callers
  // side, `product` is often passed as an inline object literal, so any
  // parent re-render would create a new object reference even if it
  // represents the same product. If we subscribed to the full `product`
  // object, those benign re-renders would incorrectly reset the internal
  // selection state and reload the shipping methods.
  //
  // This behaviour was particularly visible on mobile/touch devices: the
  // first tap on the delivery card triggered a re-render higher in the
  // tree, the `product` prop reference changed, and this effect ran again
  // while the modal was still open. As a result, the user's selection was
  // cleared and the shipping options were reloaded, so the delivery card
  // only appeared to be selectable from the *second* tap onwards.
  //
  // By keying this effect on `open`, `product.id` and `product.type` only,
  // we ensure that state is reset when the modal truly opens or when the
  // underlying product changes, but not on unrelated parent re-renders.
  useEffect(() => {
    if (open && product) {
      // Reset transient state on each open so we always start from a clean slate
      setSelectedType(null)
      setSelectedMethod(null)
      setDeliveryMethods([])
      setPostalCode('')
      setError('')
      setPostalCodeError('')
      loadPickupMethods()
    }
  }, [open, product?.id, product?.type])


  const loadPickupMethods = async () => {
    try {
      setLoading(true)
      setError('')

      const data = await shippingAPI.getAvailableForProduct(
        product.id,
        product.type
      )

      setPickupMethods(data.pickup || [])
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
        maxArticles: method.max_articles ?? 1,
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
        maxArticles: method.max_articles ?? 1,
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

      {/* Scrollable container so the whole modal (including header and footer
          actions) remains accessible on small screens when the content is
          taller than the viewport. */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
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
                      onClick={() => handleSelectPickup(method)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleSelectPickup(method)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`group relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg p-4 cursor-pointer ${
                        selectedType === 'pickup' && selectedMethod === method.id
                          ? 'border border-black bg-gray-50'
                          : 'border border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {/* Keep a hidden input only for form semantics; visually no radio shown */}
                      <input
                        type="radio"
                        name="shipping-method"
                        value={method.id}
                        checked={selectedType === 'pickup' && selectedMethod === method.id}
                        onChange={() => handleSelectPickup(method)}
                        className="sr-only"
                        tabIndex={-1}
                      />
                      {/* Left column: content */}
                      <div className="flex-1">
                        <span className="block text-sm font-medium text-gray-900">
                          {method.name}
                        </span>
                        {method.description && (
                          <span className="mt-1 block text-sm text-gray-500">
                            {method.description}
                          </span>
                        )}
                        {method.pickup_address && (
                          <div className="mt-2 text-sm text-gray-700">
                            <p className="font-medium">Dirección de recogida:</p>
                            <p>{method.pickup_address}</p>
                            <p>
                              {method.pickup_city} {method.pickup_postal_code}
                            </p>
                            {method.pickup_instructions && (
                              <p className="mt-1 text-xs text-gray-600">{method.pickup_instructions}</p>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Right column: cost + check icon */}
                      <div className="mt-1 flex w-full items-center gap-2 justify-start sm:mt-0 sm:w-auto sm:justify-end">
                        <span className="text-sm font-semibold text-gray-900">Gratis</span>
                        <CheckCircleIcon
                          className={`h-5 w-5 ${
                            selectedType === 'pickup' && selectedMethod === method.id
                              ? 'text-black'
                              : 'invisible'
                          }`}
                        />
                      </div>
                    </label>
                  ))}

                  {/* Delivery option */}
                  <div
                      onClick={handleSelectDelivery}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleSelectDelivery()
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`group relative flex flex-col rounded-lg p-4 cursor-pointer ${
                        selectedType === 'delivery'
                          ? 'border border-black bg-gray-50'
                          : 'border border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {/* Header row: two columns */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="block text-sm font-medium text-gray-900">Envío a domicilio</span>
                        {selectedType === 'delivery' && (
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                            <label htmlFor="postal-code" className="block text-sm font-medium text-gray-700">
                              Código postal
                            </label>
                            <div className="flex w-full gap-2 sm:w-auto">
                              <input
                                id="postal-code"
                                name="postal-code"
                                type="text"
                                autoComplete="postal-code"
                                value={postalCode}
                                onChange={handlePostalCodeChange}
                                placeholder="28001"
                                className="block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-base text-gray-900 placeholder:text-gray-400 sm:text-sm/6 outline-none"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  loadDeliveryMethods()
                                }}
                                disabled={!postalCode || loadingDelivery}
                                className="shrink-0 rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {loadingDelivery ? 'Buscando...' : 'Buscar'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Errors related to postal code */}
                      {selectedType === 'delivery' && postalCodeError && (
                        <p className="mt-2 text-sm text-red-600">{postalCodeError}</p>
                      )}

                      {/* Delivery methods */}
                      {selectedType === 'delivery' && deliveryMethods.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {deliveryMethods.map((method) => {
                            const isSelected = selectedMethod === method.id
                            return (
                              <div
                                key={method.id}
                                className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md p-3 cursor-pointer ${
                                  isSelected
                                    ? 'border border-black bg-white'
                                    : 'border border-gray-200 bg-white hover:border-gray-300'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSelectDeliveryMethod(method)
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    handleSelectDeliveryMethod(method)
                                  }
                                }}
                              >
                                <div className="flex-1">
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
                                <div className="ml-0 flex w-full items-center gap-2 justify-start sm:ml-3 sm:w-auto sm:justify-end">
                                  <span className="text-sm font-semibold text-gray-900">
                                    €{method.cost.toFixed(2)}
                                  </span>
                                  <CheckCircleIcon className={`h-5 w-5 ${isSelected ? 'text-black' : 'invisible'}`} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
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
                  className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Añadir a la cesta
                </button>
              </div>
            </div>
          )}
        </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
