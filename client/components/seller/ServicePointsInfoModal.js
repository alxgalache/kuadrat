'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { shippingAPI } from '@/lib/api'
import { loadGoogleMaps } from '@/lib/googleMaps'
import useDebounce from '@/hooks/useDebounce'

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function formatAllOpeningTimes(openingTimes) {
  if (!openingTimes) return null
  return DAY_NAMES.map((name, idx) => {
    const slots = openingTimes[String(idx)]
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return { day: name, hours: 'Cerrado' }
    }
    const ranges = slots.map(t => typeof t === 'string' ? t : `${t.start || t.open || '?'}-${t.end || t.close || '?'}`)
    return { day: name, hours: ranges.join(', ') }
  })
}

export default function ServicePointsInfoModal({ isOpen, onClose, carrier, country, postalCode }) {
  const [servicePoints, setServicePoints] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [postalInput, setPostalInput] = useState(postalCode || '')
  const [highlighted, setHighlighted] = useState(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(false)

  const debouncedPostal = useDebounce(postalInput, 500)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const cardRefsMap = useRef({})

  // Reset postal input when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setPostalInput(postalCode || '')
    }
  }, [isOpen, postalCode])

  // Fetch service points
  const fetchServicePoints = useCallback((postal) => {
    if (!carrier || !country || !postal || postal.length < 4) return
    setLoading(true)
    setError(null)

    shippingAPI.getServicePoints(carrier, country, postal)
      .then(res => {
        setServicePoints(res.servicePoints || [])
        setHighlighted(null)
      })
      .catch(() => {
        setError('No se pudieron cargar los puntos de recogida.')
      })
      .finally(() => setLoading(false))
  }, [carrier, country])

  // Trigger fetch on debounced postal change
  useEffect(() => {
    if (isOpen && debouncedPostal && debouncedPostal.length >= 4) {
      fetchServicePoints(debouncedPostal)
    }
  }, [isOpen, debouncedPostal, fetchServicePoints])

  // Load Google Maps
  useEffect(() => {
    if (!isOpen) return
    loadGoogleMaps('places,marker')
      .then(() => setMapReady(true))
      .catch(() => setMapError(true))
  }, [isOpen])

  // Render map + markers
  useEffect(() => {
    if (!mapReady || servicePoints.length === 0 || !mapContainerRef.current) return

    const map = new window.google.maps.Map(mapContainerRef.current, {
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    })
    mapRef.current = map

    const bounds = new window.google.maps.LatLngBounds()
    const markers = servicePoints.map(sp => {
      const position = { lat: parseFloat(sp.latitude), lng: parseFloat(sp.longitude) }
      bounds.extend(position)

      const marker = new window.google.maps.Marker({
        position,
        map,
        title: sp.name,
      })

      marker.addListener('click', () => {
        setHighlighted(sp.id)
        map.panTo(position)
        cardRefsMap.current[sp.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })

      return { marker, sp }
    })
    markersRef.current = markers

    map.fitBounds(bounds)
    if (servicePoints.length === 1) {
      window.google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom() > 15) map.setZoom(15)
      })
    }

    return () => {
      markers.forEach(({ marker }) => {
        window.google.maps.event.clearInstanceListeners(marker)
        marker.setMap(null)
      })
      markersRef.current = []
    }
  }, [mapReady, servicePoints])

  // Update marker icons when highlight changes
  useEffect(() => {
    if (!mapReady || markersRef.current.length === 0) return
    const selectedIcon = 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'

    markersRef.current.forEach(({ marker, sp }) => {
      marker.setIcon(highlighted === sp.id ? selectedIcon : undefined)
    })
  }, [highlighted, mapReady])

  // Handle card click: highlight + pan map
  const handleCardClick = (sp) => {
    setHighlighted(sp.id)
    if (mapRef.current) {
      mapRef.current.panTo({ lat: parseFloat(sp.latitude), lng: parseFloat(sp.longitude) })
    }
  }

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Puntos de entrega
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Postal code search */}
        <div className="border-b border-gray-200 px-4 py-2">
          <label className="block text-xs text-gray-500 mb-1">Código postal</label>
          <input
            type="text"
            value={postalInput}
            onChange={(e) => setPostalInput(e.target.value)}
            placeholder="Introduce un código postal"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col">
          {loading && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                <p className="mt-2 text-sm text-gray-500">Cargando puntos de recogida...</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-1 items-center justify-center px-4">
              <div className="text-center">
                <p className="text-sm text-red-600">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchServicePoints(debouncedPostal)}
                  className="mt-2 text-sm font-medium text-gray-900 underline"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {!loading && !error && servicePoints.length === 0 && (
            <div className="flex flex-1 items-center justify-center px-4">
              <p className="text-sm text-gray-500">
                No hay puntos de recogida disponibles en esta zona.
              </p>
            </div>
          )}

          {!loading && !error && servicePoints.length > 0 && (
            <>
              {/* Map */}
              {mapError ? (
                <div className="flex h-[40%] shrink-0 items-center justify-center border-b border-gray-200 bg-gray-50">
                  <p className="text-xs text-gray-400">No se pudo cargar el mapa</p>
                </div>
              ) : !mapReady ? (
                <div className="flex h-[40%] shrink-0 items-center justify-center border-b border-gray-200 bg-gray-50">
                  <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                </div>
              ) : (
                <div
                  ref={mapContainerRef}
                  className="h-[40%] shrink-0 border-b border-gray-200"
                />
              )}

              {/* List */}
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {servicePoints.map(sp => {
                  const isHighlighted = highlighted === sp.id
                  const schedule = formatAllOpeningTimes(sp.openingTimes)

                  return (
                    <div
                      key={sp.id}
                      ref={el => { cardRefsMap.current[sp.id] = el }}
                      onClick={() => handleCardClick(sp)}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        isHighlighted ? 'border-black bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{sp.name}</div>
                      <div className="text-xs text-gray-500">{sp.address}</div>
                      <div className="text-xs text-gray-500">{sp.postalCode} {sp.city}</div>
                      {sp.distance != null && (
                        <div className="mt-0.5 text-xs text-gray-400">
                          {sp.distance < 1000
                            ? `${sp.distance} m`
                            : `${(sp.distance / 1000).toFixed(1)} km`
                          }
                        </div>
                      )}
                      {schedule && (
                        <div className="mt-2 space-y-0.5">
                          {schedule.map(({ day, hours }) => (
                            <div key={day} className="flex text-xs">
                              <span className="w-24 shrink-0 text-gray-500">{day}</span>
                              <span className="text-gray-600">{hours}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
