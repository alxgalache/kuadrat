'use client'

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { adminAPI } from '@/lib/api'

function parseCarriers(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try { return JSON.parse(value) } catch { return [] }
  }
  return []
}

const EMPTY_FORM = {
  sender_name: '',
  sender_company_name: '',
  sender_address_1: '',
  sender_address_2: '',
  sender_house_number: '',
  sender_city: '',
  sender_postal_code: '',
  sender_country: 'ES',
  sender_phone: '',
  sender_email: '',
  first_mile: 'dropoff',
  preferred_carriers: [],
  excluded_carriers: [],
  vat_number: '',
  self_packs: false,
}

const SendcloudConfigSection = forwardRef(function SendcloudConfigSection({ authorId }, ref) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [carrierOptions, setCarrierOptions] = useState([])
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // Fetch shipping methods from backend (Sendcloud API)
  useEffect(() => {
    adminAPI.authors.getShippingMethods()
      .then(res => setCarrierOptions(res.data || []))
      .catch(() => setCarrierOptions([]))
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const data = await adminAPI.authors.getSendcloudConfig(authorId)
      if (data) {
        setConfig(data)
        setForm({
          sender_name: data.sender_name || '',
          sender_company_name: data.sender_company_name || '',
          sender_address_1: data.sender_address_1 || '',
          sender_address_2: data.sender_address_2 || '',
          sender_house_number: data.sender_house_number || '',
          sender_city: data.sender_city || '',
          sender_postal_code: data.sender_postal_code || '',
          sender_country: data.sender_country || 'ES',
          sender_phone: data.sender_phone || '',
          sender_email: data.sender_email || '',
          first_mile: data.first_mile || 'dropoff',
          preferred_carriers: parseCarriers(data.preferred_carriers),
          excluded_carriers: parseCarriers(data.excluded_carriers),
          vat_number: data.vat_number || '',
          self_packs: !!data.self_packs,
        })
      }
    } catch (err) {
      if (err.status !== 404) {
        setError('No se pudo cargar la configuración de Sendcloud')
      }
    } finally {
      setLoading(false)
    }
  }, [authorId])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Expose form data to parent via ref
  useImperativeHandle(ref, () => ({
    getFormData() {
      return {
        data: { ...form },
        isNew: !config,
      }
    },
    hasData() {
      // Check if any field differs from defaults (excluding sender_country and first_mile which have non-empty defaults)
      return (
        form.sender_name.trim() !== '' ||
        form.sender_company_name.trim() !== '' ||
        form.sender_address_1.trim() !== '' ||
        form.sender_address_2.trim() !== '' ||
        form.sender_house_number.trim() !== '' ||
        form.sender_city.trim() !== '' ||
        form.sender_postal_code.trim() !== '' ||
        form.sender_phone.trim() !== '' ||
        form.sender_email.trim() !== '' ||
        form.preferred_carriers.length > 0 ||
        form.excluded_carriers.length > 0 ||
        form.vat_number.trim() !== '' ||
        form.self_packs === true
      )
    },
    markSaved(savedData) {
      setConfig({ ...config, ...savedData })
    },
  }), [form, config])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleCarrierToggle = (field, code) => {
    setForm(prev => {
      const current = prev[field]
      const updated = current.includes(code)
        ? current.filter(c => c !== code)
        : [...current, code]
      return { ...prev, [field]: updated }
    })
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Cargando configuración de Sendcloud...</div>
  }

  const inputClass = 'mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:ring-black'

  return (
    <div className="border-t border-gray-200 pt-8 mt-8">
      <h3 className="text-base font-semibold text-gray-900">Configuración de envío Sendcloud</h3>
      <p className="mt-1 text-sm text-gray-500">Dirección del remitente y preferencias de envío para este vendedor.</p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-6">
        {/* Sender Info */}
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-900">Nombre del remitente</label>
          <input type="text" value={form.sender_name} onChange={e => handleChange('sender_name', e.target.value)}
            className={inputClass} />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-900">Empresa</label>
          <input type="text" value={form.sender_company_name} onChange={e => handleChange('sender_company_name', e.target.value)}
            className={inputClass} />
        </div>

        {/* Address */}
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-900">Dirección (línea 1)</label>
          <input type="text" value={form.sender_address_1} onChange={e => handleChange('sender_address_1', e.target.value)}
            className={inputClass} />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-900">Dirección (línea 2)</label>
          <input type="text" value={form.sender_address_2} onChange={e => handleChange('sender_address_2', e.target.value)}
            className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-900">Número</label>
          <input type="text" value={form.sender_house_number} onChange={e => handleChange('sender_house_number', e.target.value)}
            className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-900">Ciudad</label>
          <input type="text" value={form.sender_city} onChange={e => handleChange('sender_city', e.target.value)}
            className={inputClass} />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-gray-900">Código postal</label>
          <input type="text" value={form.sender_postal_code} onChange={e => handleChange('sender_postal_code', e.target.value)}
            className={inputClass} />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-gray-900">País</label>
          <input type="text" value={form.sender_country} onChange={e => handleChange('sender_country', e.target.value)}
            className={inputClass} />
        </div>

        {/* Contact */}
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-900">Teléfono del remitente</label>
          <input type="tel" value={form.sender_phone} onChange={e => handleChange('sender_phone', e.target.value)}
            className={inputClass} />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-900">Email del remitente</label>
          <input type="email" value={form.sender_email} onChange={e => handleChange('sender_email', e.target.value)}
            className={inputClass} />
        </div>

        {/* VAT & Self Packs */}
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-900">NIF/CIF (VAT)</label>
          <input type="text" value={form.vat_number} onChange={e => handleChange('vat_number', e.target.value)}
            placeholder="Ej: ESB12345678"
            className={inputClass} />
        </div>
        <div className="sm:col-span-3 flex items-end pb-1">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.self_packs} onChange={e => handleChange('self_packs', e.target.checked)}
              className="size-4 rounded border-gray-300 text-black" />
            <span className="text-sm text-gray-700">Empaqueta él mismo</span>
          </label>
        </div>

        {/* First Mile */}
        <div className="sm:col-span-3">
          <label className="block text-sm font-medium text-gray-900">Primera milla</label>
          <select value={form.first_mile} onChange={e => handleChange('first_mile', e.target.value)}
            className={inputClass}>
            <option value="dropoff">Entrega en oficina</option>
            <option value="pickup">Recogida a domicilio</option>
            <option value="pickup_dropoff">Ambos</option>
          </select>
        </div>

        {/* Preferred Carriers */}
        <div className="sm:col-span-6 mt-4">
          <h4 className="text-sm font-semibold text-gray-900">Transportistas preferidos</h4>
          <p className="text-xs text-gray-500">Dejar vacío para mostrar todos los disponibles.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {carrierOptions.map(c => (
              <label key={c.code} className="flex items-center gap-2">
                <input type="checkbox" checked={form.preferred_carriers.includes(c.code)}
                  onChange={() => handleCarrierToggle('preferred_carriers', c.code)}
                  className="size-4 rounded border-gray-300 text-black" />
                <span className="text-sm text-gray-700">{c.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Excluded Carriers */}
        <div className="sm:col-span-6 mt-4">
          <h4 className="text-sm font-semibold text-gray-900">Transportistas excluidos</h4>
          <p className="text-xs text-gray-500">Transportistas que no se ofrecerán para este vendedor.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {carrierOptions.map(c => (
              <label key={c.code} className="flex items-center gap-2">
                <input type="checkbox" checked={form.excluded_carriers.includes(c.code)}
                  onChange={() => handleCarrierToggle('excluded_carriers', c.code)}
                  className="size-4 rounded border-gray-300 text-black" />
                <span className="text-sm text-gray-700">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})

export default SendcloudConfigSection
