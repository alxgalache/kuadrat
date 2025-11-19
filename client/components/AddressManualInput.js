'use client'

import { useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/16/solid'

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
  defaultCountry = 'ES',
  // New: personal info section support
  personalInfo = { fullName: '', email: '', phone: '' },
  onPersonalInfoChange = () => { },
  showPersonalSection = false,
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
          <div className="mt-2 grid grid-cols-1">
            <select
              id="country"
              name="country"
              value={value.country !== undefined ? value.country : defaultCountry}
              onChange={(e) => handleFieldChange('country', e.target.value)}
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
