'use client'

import { useState, useEffect, useCallback } from 'react'
import { sellerAPI } from '@/lib/api'

const INITIAL_ADDRESS = {
  name: '',
  companyName: '',
  addressLine1: '',
  addressLine2: '',
  houseNumber: '',
  city: '',
  postalCode: '',
  countryCode: 'ES',
  phoneNumber: '',
  email: '',
}

export default function PickupModal({ isOpen, onClose, orderId, defaultAddress, onSuccess }) {
  const [address, setAddress] = useState({ ...INITIAL_ADDRESS })
  const [useDefault, setUseDefault] = useState(false)
  const [timeSlotStart, setTimeSlotStart] = useState('')
  const [timeSlotEnd, setTimeSlotEnd] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [validationErrors, setValidationErrors] = useState({})

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setAddress({ ...INITIAL_ADDRESS })
      setUseDefault(false)
      setTimeSlotStart('')
      setTimeSlotEnd('')
      setSpecialInstructions('')
      setError(null)
      setValidationErrors({})
    }
  }, [isOpen])

  const handleUseDefaultToggle = useCallback((checked) => {
    setUseDefault(checked)
    if (checked && defaultAddress) {
      setAddress({
        name: defaultAddress.name || '',
        companyName: defaultAddress.companyName || '',
        addressLine1: defaultAddress.address1 || '',
        addressLine2: defaultAddress.address2 || '',
        houseNumber: defaultAddress.houseNumber || '',
        city: defaultAddress.city || '',
        postalCode: defaultAddress.postalCode || '',
        countryCode: defaultAddress.country || 'ES',
        phoneNumber: defaultAddress.phone || '',
        email: defaultAddress.email || '',
      })
    } else {
      setAddress({ ...INITIAL_ADDRESS })
    }
  }, [defaultAddress])

  const updateField = useCallback((field, value) => {
    setAddress(prev => ({ ...prev, [field]: value }))
    setValidationErrors(prev => ({ ...prev, [field]: undefined }))
  }, [])

  const validate = useCallback(() => {
    const errors = {}

    if (!address.name.trim()) errors.name = 'El nombre es obligatorio'
    if (!address.addressLine1.trim()) errors.addressLine1 = 'La dirección es obligatoria'
    if (!address.city.trim()) errors.city = 'La ciudad es obligatoria'
    if (!address.postalCode.trim()) errors.postalCode = 'El código postal es obligatorio'
    if (!address.countryCode.trim() || address.countryCode.length !== 2) errors.countryCode = 'Código de país inválido'
    if (!address.phoneNumber.trim()) errors.phoneNumber = 'El teléfono es obligatorio'
    if (!address.email.trim() || !address.email.includes('@')) errors.email = 'Email inválido'

    if (!timeSlotStart) errors.timeSlotStart = 'La fecha de inicio es obligatoria'
    if (!timeSlotEnd) errors.timeSlotEnd = 'La fecha de fin es obligatoria'

    if (timeSlotStart && timeSlotEnd) {
      const start = new Date(timeSlotStart)
      const end = new Date(timeSlotEnd)

      if (start >= end) {
        errors.timeSlotStart = 'La fecha de inicio debe ser anterior a la fecha de fin'
      }

      const diffMs = end - start
      const maxMs = 48 * 60 * 60 * 1000
      if (diffMs > maxMs) {
        errors.timeSlotEnd = 'El intervalo máximo de tiempo es de 2 días'
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }, [address, timeSlotStart, timeSlotEnd])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setError(null)

    try {
      await sellerAPI.schedulePickup(orderId, {
        address,
        timeSlotStart: new Date(timeSlotStart).toISOString(),
        timeSlotEnd: new Date(timeSlotEnd).toISOString(),
        specialInstructions: specialInstructions || undefined,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Error al programar la recogida')
    } finally {
      setLoading(false)
    }
  }, [address, timeSlotStart, timeSlotEnd, specialInstructions, orderId, validate, onSuccess, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-500/75 transition-opacity" onClick={onClose} />

        {/* Modal */}
        <div className="relative w-full max-w-lg transform rounded-lg bg-white p-6 shadow-xl transition-all">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Programar recogida</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Default address checkbox */}
            {defaultAddress && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={useDefault}
                  onChange={(e) => handleUseDefaultToggle(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                />
                Rellenar con la dirección por defecto
              </label>
            )}

            {/* Address fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text" value={address.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.name ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                />
                {validationErrors.name && <p className="mt-0.5 text-xs text-red-600">{validationErrors.name}</p>}
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Empresa</label>
                <input
                  type="text" value={address.companyName}
                  onChange={(e) => updateField('companyName', e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Dirección *</label>
                <input
                  type="text" value={address.addressLine1}
                  onChange={(e) => updateField('addressLine1', e.target.value)}
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.addressLine1 ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                />
                {validationErrors.addressLine1 && <p className="mt-0.5 text-xs text-red-600">{validationErrors.addressLine1}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Dirección 2</label>
                <input
                  type="text" value={address.addressLine2}
                  onChange={(e) => updateField('addressLine2', e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:ring-1 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
                <input
                  type="text" value={address.houseNumber}
                  onChange={(e) => updateField('houseNumber', e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:ring-1 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ciudad *</label>
                <input
                  type="text" value={address.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.city ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                />
                {validationErrors.city && <p className="mt-0.5 text-xs text-red-600">{validationErrors.city}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Código postal *</label>
                <input
                  type="text" value={address.postalCode}
                  onChange={(e) => updateField('postalCode', e.target.value)}
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.postalCode ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                />
                {validationErrors.postalCode && <p className="mt-0.5 text-xs text-red-600">{validationErrors.postalCode}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">País *</label>
                <input
                  type="text" value={address.countryCode} maxLength={2}
                  onChange={(e) => updateField('countryCode', e.target.value.toUpperCase())}
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.countryCode ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                />
                {validationErrors.countryCode && <p className="mt-0.5 text-xs text-red-600">{validationErrors.countryCode}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono *</label>
                <input
                  type="tel" value={address.phoneNumber}
                  onChange={(e) => updateField('phoneNumber', e.target.value)}
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.phoneNumber ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                />
                {validationErrors.phoneNumber && <p className="mt-0.5 text-xs text-red-600">{validationErrors.phoneNumber}</p>}
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email" value={address.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.email ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                />
                {validationErrors.email && <p className="mt-0.5 text-xs text-red-600">{validationErrors.email}</p>}
              </div>
            </div>

            {/* Time slots */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Horario de recogida</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Desde *</label>
                  <input
                    type="datetime-local" value={timeSlotStart}
                    onChange={(e) => { setTimeSlotStart(e.target.value); setValidationErrors(prev => ({ ...prev, timeSlotStart: undefined })) }}
                    className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.timeSlotStart ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                  />
                  {validationErrors.timeSlotStart && <p className="mt-0.5 text-xs text-red-600">{validationErrors.timeSlotStart}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Hasta *</label>
                  <input
                    type="datetime-local" value={timeSlotEnd}
                    onChange={(e) => { setTimeSlotEnd(e.target.value); setValidationErrors(prev => ({ ...prev, timeSlotEnd: undefined })) }}
                    className={`block w-full rounded-md border px-3 py-1.5 text-sm ${validationErrors.timeSlotEnd ? 'border-red-300' : 'border-gray-300'} focus:border-black focus:ring-1 focus:ring-black`}
                  />
                  {validationErrors.timeSlotEnd && <p className="mt-0.5 text-xs text-red-600">{validationErrors.timeSlotEnd}</p>}
                </div>
              </div>
            </div>

            {/* Special instructions */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Instrucciones especiales</label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={2}
                maxLength={500}
                className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:ring-1 focus:ring-black"
                placeholder="Indicaciones para el repartidor..."
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button" onClick={onClose}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={loading}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? 'Programando...' : 'Programar recogida'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
