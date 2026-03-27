'use client'

import { useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import ServicePointSelector from './ServicePointSelector'

export default function SellerShippingGroup({
  seller,
  deliveryAddress,
  selection,
  onSelect,
  defaultExpanded = true,
}) {
  const { sellerId, sellerName, deliveryOptions, pickupOption, deliveryError } = seller
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showServicePoints, setShowServicePoints] = useState(false)
  const [servicePointOption, setServicePointOption] = useState(null)

  const handleOptionSelect = (option) => {
    if (option.requiresServicePoint) {
      setServicePointOption(option)
      setShowServicePoints(true)
      // Don't finalize selection until service point is chosen
    } else {
      setShowServicePoints(false)
      setServicePointOption(null)
      onSelect(sellerId, {
        optionId: option.id,
        type: option.type,
        carrier: option.carrier?.name || '',
        cost: option.price || 0,
        shippingOptionCode: option.shippingOptionCode || '',
        servicePointId: null,
        name: option.name || option.carrier?.name || '',
      })
    }
  }

  const handleServicePointSelect = (sp) => {
    if (!servicePointOption) return
    onSelect(sellerId, {
      optionId: servicePointOption.id,
      type: servicePointOption.type,
      carrier: servicePointOption.carrier?.name || '',
      cost: servicePointOption.price || 0,
      shippingOptionCode: servicePointOption.shippingOptionCode || '',
      servicePointId: sp.id,
      name: `${servicePointOption.carrier?.name || ''} - ${sp.name}`,
    })
  }

  const handlePickupSelect = () => {
    setShowServicePoints(false)
    setServicePointOption(null)
    onSelect(sellerId, {
      optionId: 'pickup',
      type: 'pickup',
      carrier: '',
      cost: 0,
      shippingOptionCode: '',
      servicePointId: null,
      name: 'Recogida en persona',
    })
  }

  const isSelected = (optionId) => selection?.optionId === optionId

  return (
    <div className="rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center justify-between p-4"
      >
        <h4 className="text-sm font-semibold text-gray-900">
          {sellerName || 'Vendedor'}
          <span className="ml-2 text-xs font-normal text-gray-500">
            ({seller.productCount} {seller.productCount === 1 ? 'producto' : 'productos'})
          </span>
          {selection && (
            <span className="ml-2 text-xs font-normal text-green-600">
              {selection.name}
            </span>
          )}
        </h4>
        <ChevronDownIcon
          className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="space-y-2 px-4 pb-4">
          {deliveryError && deliveryOptions.length === 0 && (
            <div className="rounded-md bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                No se pudieron obtener las opciones de envío a domicilio. Si lo necesitas, contacta con el vendedor o escribe a info@140d.art
              </p>
            </div>
          )}

          <div className="max-h-[216px] space-y-2 overflow-y-auto pr-1">
            {deliveryOptions.map(option => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                  isSelected(option.id) ? 'border-black bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={`shipping-${sellerId}`}
                    checked={isSelected(option.id)}
                    onChange={() => handleOptionSelect(option)}
                    className="h-4 w-4 border-gray-300 text-black focus:ring-black"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {option.name || option.carrier?.name || 'Envío'}
                      {option.requiresServicePoint && (
                        <span className="ml-1 text-xs text-gray-500">(punto de recogida)</span>
                      )}
                    </div>
                    {option.estimatedDays != null && (
                      <div className="text-xs text-gray-500">
                        Tiempo de entrega: {option.estimatedDays === 1 ? '1 día' : `${option.estimatedDays} días`}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-900">
                  {option.price > 0 ? `${option.price.toFixed(2)} €` : 'Gratis'}
                </div>
              </label>
            ))}
          </div>

          {/* Service Point Selector */}
          {showServicePoints && servicePointOption && (
            <ServicePointSelector
              carrier={servicePointOption.carrier?.code || ''}
              country={deliveryAddress?.country || 'ES'}
              postalCode={deliveryAddress?.postalCode || ''}
              onSelect={handleServicePointSelect}
              selectedId={selection?.servicePointId}
            />
          )}

          {/* Pickup option */}
          {pickupOption && (
            <label
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                isSelected('pickup') ? 'border-black bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name={`shipping-${sellerId}`}
                  checked={isSelected('pickup')}
                  onChange={handlePickupSelect}
                  className="h-4 w-4 border-gray-300 text-black focus:ring-black"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">Recogida en persona</div>
                  <div className="text-xs text-gray-500">
                    {pickupOption.address}, {pickupOption.city}
                  </div>
                  {pickupOption.instructions && (
                    <div className="text-xs text-gray-400">{pickupOption.instructions}</div>
                  )}
                </div>
              </div>
              <div className="text-sm font-medium text-green-600">Gratis</div>
            </label>
          )}

          {deliveryOptions.length === 0 && !pickupOption && (
            <p className="text-sm text-gray-500">
              No hay opciones de envío disponibles para esta dirección.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
