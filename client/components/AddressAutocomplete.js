'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { loadGoogleMaps } from '@/lib/googleMaps'

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
  const [phoneDropdownOpen, setPhoneDropdownOpen] = useState(false)
  const [selectedCountryCode, setSelectedCountryCode] = useState('+34')
  const autocompleteInputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const phoneDropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (phoneDropdownRef.current && !phoneDropdownRef.current.contains(event.target)) {
        setPhoneDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Initialize country code from existing phone value
  useEffect(() => {
    if (personalInfo.phone) {
      if (personalInfo.phone.startsWith('+1')) {
        setSelectedCountryCode('+1')
      } else if (personalInfo.phone.startsWith('+34')) {
        setSelectedCountryCode('+34')
      }
    }
  }, [])

  // Load Google Maps Script via shared singleton loader
  useEffect(() => {
    loadGoogleMaps('places')
      .then(() => setIsLoaded(true))
      .catch(() => {
        setError('Error al cargar Google Maps. Por favor, verifica tu clave API y la configuración de restricciones en Google Cloud Console.')
      })
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
              <div className="mt-1 flex items-center -space-x-px shadow-sm rounded-md" ref={phoneDropdownRef}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPhoneDropdownOpen(!phoneDropdownOpen)}
                    className="inline-flex items-center shrink-0 z-10 bg-white border border-gray-300 rounded-l-md text-sm px-3 py-2 text-gray-900 hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  >
                    {selectedCountryCode === '+34' ? (
                      <svg className="w-4 h-4 me-1.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="7" fill="#AA151B"/>
                        <mask id="mask-spain" style={{maskType: 'alpha'}} maskUnits="userSpaceOnUse" x="1" y="1" width="14" height="14">
                          <circle cx="8" cy="8" r="7" fill="white"/>
                        </mask>
                        <g mask="url(#mask-spain)">
                          <path d="M1 4h14v8H1z" fill="#F1BF00"/>
                          <path d="M1 1h14v3H1z" fill="#AA151B"/>
                          <path d="M1 12h14v3H1z" fill="#AA151B"/>
                        </g>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 me-1.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.00013 14.6666C11.6821 14.6666 14.667 11.6818 14.667 7.99992C14.667 4.31802 11.6821 1.33325 8.00013 1.33325C4.31811 1.33325 1.33325 4.31802 1.33325 7.99992C1.33325 11.6818 4.31811 14.6666 8.00013 14.6666Z" fill="white"/>
                        <path d="M7.71167 7.99975H14.6678C14.6678 7.39807 14.5876 6.8152 14.4382 6.26074H7.71167V7.99975Z" fill="#D80027"/>
                        <path d="M7.71167 4.52172H13.6894C13.2813 3.85583 12.7596 3.26726 12.1512 2.78271H7.71167V4.52172Z" fill="#D80027"/>
                        <path d="M8.00053 14.6667C9.56944 14.6667 11.0115 14.1244 12.1502 13.2175H3.85083C4.98958 14.1244 6.43162 14.6667 8.00053 14.6667Z" fill="#D80027"/>
                        <path d="M2.31233 11.4784H13.689C14.0167 10.9438 14.2708 10.3594 14.4379 9.73926H1.56348C1.73059 10.3594 1.98469 10.9438 2.31233 11.4784V11.4784Z" fill="#D80027"/>
                        <path d="M4.42123 2.37426H5.02873L4.46365 2.78478L4.6795 3.44902L4.11445 3.03851L3.5494 3.44902L3.73584 2.87519C3.23832 3.28961 2.80224 3.77514 2.44289 4.31614H2.63754L2.27784 4.57745C2.2218 4.67093 2.16806 4.7659 2.11655 4.86227L2.28831 5.3909L1.96786 5.15808C1.8882 5.32684 1.81534 5.49941 1.74985 5.67557L1.93908 6.25802H2.63754L2.07246 6.66853L2.28831 7.33278L1.72326 6.92226L1.38479 7.16818C1.35091 7.4405 1.33325 7.71788 1.33325 7.99939H7.9996C7.9996 4.31781 7.9996 3.88378 7.9996 1.33325C6.68268 1.33325 5.45506 1.71525 4.42123 2.37426V2.37426ZM4.6795 7.33278L4.11445 6.92226L3.5494 7.33278L3.76524 6.66853L3.20017 6.25802H3.89862L4.11445 5.59377L4.33027 6.25802H5.02873L4.46365 6.66853L4.6795 7.33278ZM4.46365 4.72666L4.6795 5.3909L4.11445 4.98039L3.5494 5.3909L3.76524 4.72666L3.20017 4.31614H3.89862L4.11445 3.6519L4.33027 4.31614H5.02873L4.46365 4.72666ZM7.07068 7.33278L6.50563 6.92226L5.94058 7.33278L6.15643 6.66853L5.59135 6.25802H6.28981L6.50563 5.59377L6.72146 6.25802H7.41991L6.85484 6.66853L7.07068 7.33278ZM6.85484 4.72666L7.07068 5.3909L6.50563 4.98039L5.94058 5.3909L6.15643 4.72666L5.59135 4.31614H6.28981L6.50563 3.6519L6.72146 4.31614H7.41991L6.85484 4.72666ZM6.85484 2.78478L7.07068 3.44902L6.50563 3.03851L5.94058 3.44902L6.15643 2.78478L5.59135 2.37426H6.28981L6.50563 1.71002L6.72146 2.37426H7.41991L6.85484 2.78478Z" fill="#1A47B8"/>
                      </svg>
                    )}
                    {selectedCountryCode}
                    <svg className="w-4 h-4 ms-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7"/>
                    </svg>
                  </button>
                  {phoneDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-300 rounded-md shadow-lg w-56">
                      <ul className="p-2 text-sm text-gray-900 font-medium">
                        <li>
                          <button
                            type="button"
                            onClick={() => {
                              const currentPhone = personalInfo.phone || ''
                              const phoneWithoutPrefix = currentPhone.startsWith(selectedCountryCode)
                                ? currentPhone.substring(selectedCountryCode.length)
                                : currentPhone
                              const digits = phoneWithoutPrefix.replace(/\D/g, '')
                              setSelectedCountryCode('+34')
                              setPhoneDropdownOpen(false)
                              onPersonalInfoChange({ ...personalInfo, phone: '+34' + digits })
                            }}
                            className="inline-flex items-center w-full p-2 hover:bg-gray-100 rounded-md text-left"
                          >
                            <svg className="w-4 h-4 me-1.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="8" cy="8" r="7" fill="#AA151B"/>
                              <mask id="mask-spain-dropdown" style={{maskType: 'alpha'}} maskUnits="userSpaceOnUse" x="1" y="1" width="14" height="14">
                                <circle cx="8" cy="8" r="7" fill="white"/>
                              </mask>
                              <g mask="url(#mask-spain-dropdown)">
                                <path d="M1 4h14v8H1z" fill="#F1BF00"/>
                                <path d="M1 1h14v3H1z" fill="#AA151B"/>
                                <path d="M1 12h14v3H1z" fill="#AA151B"/>
                              </g>
                            </svg>
                            España (+34)
                          </button>
                        </li>
                        {/* TODO: Add more countries */}
                        {/* <li>
                          <button
                            type="button"
                            onClick={() => {
                              const currentPhone = personalInfo.phone || ''
                              const phoneWithoutPrefix = currentPhone.startsWith(selectedCountryCode)
                                ? currentPhone.substring(selectedCountryCode.length)
                                : currentPhone
                              const digits = phoneWithoutPrefix.replace(/\D/g, '')
                              setSelectedCountryCode('+1')
                              setPhoneDropdownOpen(false)
                              onPersonalInfoChange({ ...personalInfo, phone: '+1' + digits })
                            }}
                            className="inline-flex items-center w-full p-2 hover:bg-gray-100 rounded-md text-left"
                          >
                            <svg className="w-4 h-4 me-1.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M8.00013 14.6666C11.6821 14.6666 14.667 11.6818 14.667 7.99992C14.667 4.31802 11.6821 1.33325 8.00013 1.33325C4.31811 1.33325 1.33325 4.31802 1.33325 7.99992C1.33325 11.6818 4.31811 14.6666 8.00013 14.6666Z" fill="white"/>
                              <path d="M7.71167 7.99975H14.6678C14.6678 7.39807 14.5876 6.8152 14.4382 6.26074H7.71167V7.99975Z" fill="#D80027"/>
                              <path d="M7.71167 4.52172H13.6894C13.2813 3.85583 12.7596 3.26726 12.1512 2.78271H7.71167V4.52172Z" fill="#D80027"/>
                              <path d="M8.00053 14.6667C9.56944 14.6667 11.0115 14.1244 12.1502 13.2175H3.85083C4.98958 14.1244 6.43162 14.6667 8.00053 14.6667Z" fill="#D80027"/>
                              <path d="M2.31233 11.4784H13.689C14.0167 10.9438 14.2708 10.3594 14.4379 9.73926H1.56348C1.73059 10.3594 1.98469 10.9438 2.31233 11.4784V11.4784Z" fill="#D80027"/>
                              <path d="M4.42123 2.37426H5.02873L4.46365 2.78478L4.6795 3.44902L4.11445 3.03851L3.5494 3.44902L3.73584 2.87519C3.23832 3.28961 2.80224 3.77514 2.44289 4.31614H2.63754L2.27784 4.57745C2.2218 4.67093 2.16806 4.7659 2.11655 4.86227L2.28831 5.3909L1.96786 5.15808C1.8882 5.32684 1.81534 5.49941 1.74985 5.67557L1.93908 6.25802H2.63754L2.07246 6.66853L2.28831 7.33278L1.72326 6.92226L1.38479 7.16818C1.35091 7.4405 1.33325 7.71788 1.33325 7.99939H7.9996C7.9996 4.31781 7.9996 3.88378 7.9996 1.33325C6.68268 1.33325 5.45506 1.71525 4.42123 2.37426V2.37426ZM4.6795 7.33278L4.11445 6.92226L3.5494 7.33278L3.76524 6.66853L3.20017 6.25802H3.89862L4.11445 5.59377L4.33027 6.25802H5.02873L4.46365 6.66853L4.6795 7.33278ZM4.46365 4.72666L4.6795 5.3909L4.11445 4.98039L3.5494 5.3909L3.76524 4.72666L3.20017 4.31614H3.89862L4.11445 3.6519L4.33027 4.31614H5.02873L4.46365 4.72666ZM7.07068 7.33278L6.50563 6.92226L5.94058 7.33278L6.15643 6.66853L5.59135 6.25802H6.28981L6.50563 5.59377L6.72146 6.25802H7.41991L6.85484 6.66853L7.07068 7.33278ZM6.85484 4.72666L7.07068 5.3909L6.50563 4.98039L5.94058 5.3909L6.15643 4.72666L5.59135 4.31614H6.28981L6.50563 3.6519L6.72146 4.31614H7.41991L6.85484 4.72666ZM6.85484 2.78478L7.07068 3.44902L6.50563 3.03851L5.94058 3.44902L6.15643 2.78478L5.59135 2.37426H6.28981L6.50563 1.71002L6.72146 2.37426H7.41991L6.85484 2.78478Z" fill="#1A47B8"/>
                            </svg>
                            United States (+1)
                          </button>
                        </li> */}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="relative w-full">
                  <input
                    type="tel"
                    id="phone"
                    value={personalInfo.phone?.startsWith(selectedCountryCode) ? personalInfo.phone.substring(selectedCountryCode.length) : personalInfo.phone || ''}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '')
                      onPersonalInfoChange({ ...personalInfo, phone: selectedCountryCode + digits })
                    }}
                    placeholder={selectedCountryCode === '+34' ? '666012345' : '2020123456'}
                    className="w-full z-20 bg-white border border-gray-300 text-gray-900 text-sm rounded-r-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 block px-3 py-2"
                  />
                </div>
              </div>
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
          <div className="mt-1 grid grid-cols-1">
            <select
              id="country"
              name="country"
              value={value.country || defaultCountry}
              onChange={(e) => onChange({ ...value, country: e.target.value })}
              className="col-start-1 row-start-1 w-full appearance-none border border-gray-300 rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 sm:text-sm/6"
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
