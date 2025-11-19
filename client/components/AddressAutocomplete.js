'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDownIcon } from '@heroicons/react/16/solid'

// Global flags to prevent multiple script loads
let googleMapsScriptLoading = false
let googleMapsScriptLoaded = false
const googleMapsCallbacks = []

/**
 * AddressAutocomplete Component
 *
 * Provides a Google Places Autocomplete input with map visualization
 *
 * @param {Object} props
 * @param {Object} props.value - Current address value
 * @param {Function} props.onChange - Callback when address changes
 * @param {String} props.label - Label for the address section
 * @param {String} props.defaultCountry - Default country code (e.g., 'ES')
 * @param {Boolean} props.showMap - Whether to show the Google Maps widget (default: true)
 */
export default function AddressAutocomplete({
  value = {},
  onChange,
  label = 'Dirección',
  defaultCountry = 'ES',
  showMap = true,
  // New: personal info section support
  personalInfo = { fullName: '', email: '', phone: '' },
  onPersonalInfoChange = () => { },
  showPersonalSection = false,
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState('')
  const [inputReadOnly, setInputReadOnly] = useState(true)
  const autocompleteInputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)

  // Load Google Maps Script (singleton pattern to load only once)
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      setError('Google Maps API key not configured. Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your environment variables.')
      return
    }

    // If already fully loaded, set state immediately
    if (googleMapsScriptLoaded && window.google && window.google.maps && window.google.maps.places) {
      setIsLoaded(true)
      return
    }

    // If currently loading, add callback to be notified when ready
    if (googleMapsScriptLoading) {
      googleMapsCallbacks.push(() => setIsLoaded(true))
      return
    }

    // Check if script tag already exists in DOM
    const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')
    if (existingScript) {
      // Script exists, wait for it to load
      googleMapsScriptLoading = true
      googleMapsCallbacks.push(() => setIsLoaded(true))

      const checkLoaded = () => {
        if (window.google && window.google.maps && window.google.maps.places) {
          googleMapsScriptLoaded = true
          googleMapsScriptLoading = false
          // Notify all waiting components
          googleMapsCallbacks.forEach(cb => cb())
          googleMapsCallbacks.length = 0
        } else {
          setTimeout(checkLoaded, 100)
        }
      }
      checkLoaded()
      return
    }

    // Load script for the first time
    googleMapsScriptLoading = true
    googleMapsCallbacks.push(() => setIsLoaded(true))

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es`
    script.async = true
    script.defer = true
    script.id = 'google-maps-script' // Add ID for easier detection

    script.onload = () => {
      googleMapsScriptLoaded = true
      googleMapsScriptLoading = false
      // Notify all waiting components
      googleMapsCallbacks.forEach(cb => cb())
      googleMapsCallbacks.length = 0
    }

    script.onerror = () => {
      googleMapsScriptLoading = false
      setError('Error al cargar Google Maps. Por favor, verifica tu clave API y la configuración de restricciones en Google Cloud Console.')
    }

    document.head.appendChild(script)

    // DON'T cleanup the script - let it persist for all components
  }, [])

  // Initialize Autocomplete and Map
  useEffect(() => {
    if (!isLoaded || !autocompleteInputRef.current) return
    if (showMap && !mapRef.current) return

    try {
      // Initialize Map (only if showMap is true)
      if (showMap && mapRef.current) {
        const defaultCenter = { lat: 40.4168, lng: -3.7038 } // Madrid, Spain
        const mapInstance = new window.google.maps.Map(mapRef.current, {
          center: value.lat && value.lng ? { lat: value.lat, lng: value.lng } : defaultCenter,
          zoom: value.lat && value.lng ? 15 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        mapInstanceRef.current = mapInstance

        // Initialize marker
        if (value.lat && value.lng) {
          markerRef.current = new window.google.maps.Marker({
            position: { lat: value.lat, lng: value.lng },
            map: mapInstance,
            title: value.line1 || 'Ubicación seleccionada',
          })
        }
      }

      // Initialize Autocomplete
      const autocomplete = new window.google.maps.places.Autocomplete(
        autocompleteInputRef.current,
        {
          types: ['address'],
          componentRestrictions: { country: defaultCountry },
          fields: [
            'address_components',
            'formatted_address',
            'geometry',
            'name',
          ],
        }
      )
      autocompleteRef.current = autocomplete

      // Handle place selection
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()

        if (!place.geometry || !place.geometry.location) {
          setError('No se encontró información de ubicación para esta dirección')
          return
        }

        // Extract address components
        const addressComponents = place.address_components || []
        const addressData = {
          line1: '',
          line2: value.line2 || '', // Keep existing line2
          postalCode: '',
          city: '',
          province: '',
          country: defaultCountry,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        }

        // Build address line 1
        let streetNumber = ''
        let route = ''

        addressComponents.forEach(component => {
          const types = component.types

          if (types.includes('street_number')) {
            streetNumber = component.long_name
          }
          if (types.includes('route')) {
            route = component.long_name
          }
          if (types.includes('postal_code')) {
            addressData.postalCode = component.long_name
          }
          if (types.includes('locality')) {
            addressData.city = component.long_name
          }
          if (types.includes('administrative_area_level_2')) {
            if (!addressData.city) {
              addressData.city = component.long_name
            }
          }
          if (types.includes('administrative_area_level_1')) {
            addressData.province = component.long_name
          }
          if (types.includes('country')) {
            addressData.country = component.long_name
          }
        })

        // Construct address line 1
        if (route) {
          addressData.line1 = streetNumber ? `${route}, ${streetNumber}` : route
        } else {
          addressData.line1 = place.name || place.formatted_address?.split(',')[0] || ''
        }

        // Update map (only if showMap is true)
        if (showMap && mapInstanceRef.current) {
          const location = place.geometry.location
          mapInstanceRef.current.setCenter(location)
          mapInstanceRef.current.setZoom(15)

          // Update or create marker
          if (markerRef.current) {
            markerRef.current.setPosition(location)
          } else {
            markerRef.current = new window.google.maps.Marker({
              position: location,
              map: mapInstanceRef.current,
              title: addressData.line1,
            })
          }
        }

        // Call onChange with parsed address
        onChange(addressData)
        setError('')
      })
    } catch (err) {
      console.error('Error initializing Google Maps:', err)
      setError('Error al inicializar el mapa')
    }
  }, [isLoaded, defaultCountry, value.lat, value.lng])

  const handleLine2Change = (e) => {
    onChange({
      ...value,
      line2: e.target.value,
    })
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500">Cargando mapa...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Información personal */}
      {showPersonalSection && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold underline text-gray-900">Información personal</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="full-name" className="block text-sm font-medium text-gray-700">
                Nombre completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="full-name"
                value={personalInfo.fullName || ''}
                onChange={(e) => onPersonalInfoChange({ ...personalInfo, fullName: e.target.value })}
                placeholder="Nombre y apellidos"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                value={personalInfo.email || ''}
                onChange={(e) => onPersonalInfoChange({ ...personalInfo, email: e.target.value })}
                placeholder="tu@email.com"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="phone"
                value={personalInfo.phone || ''}
                onChange={(e) => onPersonalInfoChange({ ...personalInfo, phone: e.target.value })}
                placeholder="+34681096432"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
              />
            </div>
          </div>
        </div>
      )}

      <h3 className="text-sm font-bold underline text-gray-900">{label}</h3>

      {/* Google Map - Only show if showMap is true */}
      {showMap && (
        <div
          ref={mapRef}
          className="h-64 w-full rounded-lg border border-gray-300"
          style={{ minHeight: '256px' }}
        />
      )}

      {/* Autocomplete Input */}
      <div>
        <label htmlFor="address-autocomplete" className="block text-sm font-medium text-gray-700">
          Buscar dirección
        </label>
        <input
          ref={autocompleteInputRef}
          type="search"
          id="address-autocomplete"
          name="search_query"
          placeholder="Escribe tu dirección completa..."
          autoComplete="chrome-off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="false"
          data-form-type="other"
          data-lpignore="true"
          readOnly={inputReadOnly}
          onFocus={(e) => {
            // Remove readonly on focus to allow typing
            // This tricks Chrome into not showing autofill
            if (inputReadOnly) {
              setInputReadOnly(false)
            }
          }}
          onBlur={() => {
            // Re-enable readonly when field loses focus
            // This prevents autofill from showing when clicking back
            setTimeout(() => setInputReadOnly(true), 200)
          }}
          onClick={() => {
            // Remove readonly immediately on click
            setInputReadOnly(false)
          }}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Comienza a escribir y selecciona tu dirección de la lista
        </p>
      </div>

      {/* Address Fields (Auto-filled from Google) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="address-line-1" className="block text-sm font-medium text-gray-700">
            Dirección
          </label>
          <input
            type="text"
            id="address-line-1"
            value={value.line1 || ''}
            onChange={(e) => {
              // Clear all dependent fields when user manually modifies
              onChange({
                line1: e.target.value,
                line2: value.line2 || '',
                postalCode: '',
                city: '',
                province: '',
                country: defaultCountry,
                lat: null,
                lng: null,
              })
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:bg-white focus:ring-2 focus:ring-gray-900 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="address-line-2" className="block text-sm font-medium text-gray-700">
            Línea de dirección 2 (Piso, puerta, etc.)
          </label>
          <input
            type="text"
            id="address-line-2"
            name="address-line-2"
            value={value.line2 || ''}
            onChange={handleLine2Change}
            placeholder="Opcional"
            autoComplete="off"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="postal-code" className="block text-sm font-medium text-gray-700">
            Código Postal
          </label>
          <input
            type="text"
            id="postal-code"
            value={value.postalCode || ''}
            onChange={(e) => {
              // Clear all dependent fields when user manually modifies
              onChange({
                line1: value.line1 || '',
                line2: value.line2 || '',
                postalCode: e.target.value,
                city: '',
                province: '',
                country: defaultCountry,
                lat: null,
                lng: null,
              })
            }}
            disabled
            className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:bg-white focus:ring-2 focus:ring-gray-900 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700">
            Municipio
          </label>
          <input
            type="text"
            id="city"
            value={value.city || ''}
            disabled
            className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:bg-white focus:ring-2 focus:ring-gray-900 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="province" className="block text-sm font-medium text-gray-700">
            Provincia
          </label>
          <input
            type="text"
            id="province"
            value={value.province || ''}
            disabled
            className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:bg-white focus:ring-2 focus:ring-gray-900 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700">
            País
          </label>
          <div className="mt-2 grid grid-cols-1">
            <select
              id="country"
              name="country"
              value={value.country || defaultCountry}
              onChange={(e) => onChange({ ...value, country: e.target.value })}
              className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 sm:text-sm/6"
            >
              <option value="ES">España</option>
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
