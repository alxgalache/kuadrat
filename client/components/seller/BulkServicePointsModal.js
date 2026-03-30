'use client'

import { useState, useEffect } from 'react'
import ServicePointsInfoModal from '@/components/seller/ServicePointsInfoModal'

function formatCarrierName(code) {
  if (!code) return ''
  return code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function BulkServicePointsModal({ isOpen, onClose, carriers, orders }) {
  const [selectedCarrier, setSelectedCarrier] = useState('')

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedCarrier('')
    }
  }, [isOpen])

  // Find initial postal code from first matching order
  const getInitialPostalCode = (carrier) => {
    const order = orders.find(o => o.items?.some(i => i.sendcloudCarrierCode === carrier))
    return order?.deliveryAddress?.postalCode || ''
  }

  // Find country from first matching order
  const getInitialCountry = (carrier) => {
    const order = orders.find(o => o.items?.some(i => i.sendcloudCarrierCode === carrier))
    return order?.deliveryAddress?.country || 'ES'
  }

  if (!isOpen) return null

  // If carrier is selected, show ServicePointsInfoModal directly
  if (selectedCarrier) {
    return (
      <ServicePointsInfoModal
        isOpen={true}
        onClose={onClose}
        carrier={selectedCarrier}
        country={getInitialCountry(selectedCarrier)}
        postalCode={getInitialPostalCode(selectedCarrier)}
      />
    )
  }

  // Carrier selection step
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500/75 transition-opacity" onClick={onClose} />

        <div className="relative w-full max-w-sm transform rounded-lg bg-white p-6 shadow-xl transition-all">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Consultar puntos de entrega</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selecciona el transportista</label>
              <select
                value={selectedCarrier}
                onChange={(e) => setSelectedCarrier(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:ring-1 focus:ring-black"
              >
                <option value="">-- Seleccionar --</option>
                {carriers.map(c => (
                  <option key={c} value={c}>{formatCarrierName(c)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
