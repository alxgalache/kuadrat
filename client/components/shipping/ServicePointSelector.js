'use client'

import { useState, useEffect } from 'react'
import { shippingAPI } from '@/lib/api'

export default function ServicePointSelector({ carrier, country, postalCode, onSelect, selectedId }) {
  const [servicePoints, setServicePoints] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!carrier || !country || !postalCode) return

    let cancelled = false
    setLoading(true)
    setError(null)

    shippingAPI.getServicePoints(carrier, country, postalCode)
      .then(res => {
        if (cancelled) return
        setServicePoints(res.data || [])
      })
      .catch(err => {
        if (cancelled) return
        setError('No se pudieron cargar los puntos de recogida')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [carrier, country, postalCode])

  if (loading) {
    return (
      <div className="mt-3 text-sm text-gray-500">
        Cargando puntos de recogida...
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-3 text-sm text-red-600">{error}</div>
    )
  }

  if (servicePoints.length === 0) {
    return (
      <div className="mt-3 text-sm text-gray-500">
        No hay puntos de recogida disponibles en esta zona.
      </div>
    )
  }

  return (
    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
      {servicePoints.map(sp => (
        <label
          key={sp.id}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
            selectedId === sp.id ? 'border-black bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
          }`}
        >
          <input
            type="radio"
            name="servicePoint"
            checked={selectedId === sp.id}
            onChange={() => onSelect(sp)}
            className="mt-0.5 h-4 w-4 border-gray-300 text-black focus:ring-black"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900">{sp.name}</div>
            <div className="text-xs text-gray-500">{sp.street} {sp.house_number}</div>
            <div className="text-xs text-gray-500">{sp.postal_code} {sp.city}</div>
            {sp.distance && (
              <div className="mt-1 text-xs text-gray-400">
                {sp.distance < 1000
                  ? `${sp.distance} m`
                  : `${(sp.distance / 1000).toFixed(1)} km`
                }
              </div>
            )}
          </div>
        </label>
      ))}
    </div>
  )
}
