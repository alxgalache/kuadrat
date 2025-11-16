'use client'

import { useState } from 'react'

/**
 * AddressManualInput Component
 *
 * Provides manual address input fields without Google Places autocomplete
 *
 * @param {Object} props
 * @param {Object} props.value - Current address value
 * @param {Function} props.onChange - Callback when address changes
 * @param {String} props.label - Label for the address section
 * @param {String} props.defaultCountry - Default country code (e.g., 'ES')
 */
export default function AddressManualInput({
  value = {},
  onChange,
  label = 'Dirección',
  defaultCountry = 'ES'
}) {
  const handleFieldChange = (field, fieldValue) => {
    onChange({
      ...value,
      [field]: fieldValue,
      // Ensure country has a default
      country: value.country || defaultCountry,
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-900">{label}</h3>

      {/* Address Fields (Manual Input) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="address-line-1" className="block text-sm font-medium text-gray-700">
            Dirección <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="address-line-1"
            value={value.line1 || ''}
            onChange={(e) => handleFieldChange('line1', e.target.value)}
            placeholder="Calle y número"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
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
            onChange={(e) => handleFieldChange('line2', e.target.value)}
            placeholder="Opcional"
            autoComplete="off"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="postal-code" className="block text-sm font-medium text-gray-700">
            Código Postal <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="postal-code"
            value={value.postalCode || ''}
            onChange={(e) => handleFieldChange('postalCode', e.target.value)}
            placeholder="28001"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700">
            Municipio <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="city"
            value={value.city || ''}
            onChange={(e) => handleFieldChange('city', e.target.value)}
            placeholder="Madrid"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="province" className="block text-sm font-medium text-gray-700">
            Provincia <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="province"
            value={value.province || ''}
            onChange={(e) => handleFieldChange('province', e.target.value)}
            placeholder="Madrid"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700">
            País <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="country"
            value={value.country || defaultCountry}
            onChange={(e) => handleFieldChange('country', e.target.value)}
            placeholder="ES"
            maxLength={50}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 sm:text-sm"
          />
        </div>
      </div>
    </div>
  )
}
