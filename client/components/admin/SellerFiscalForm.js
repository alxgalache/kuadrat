'use client'

/**
 * SellerFiscalForm — Change #1: stripe-connect-accounts
 *
 * Admin form to capture the fiscal/tax data of a seller required for
 *   creating a Stripe connected account (format-only prechecks).
 *
 * Validation mirrors `api/validators/fiscalSchemas.js` so typos are caught
 * client-side before the request hits the backend. Real KYC still happens
 * in Stripe during the onboarding flow.
 */
import { useState, useEffect } from 'react'
import { adminAPI } from '@/lib/api'
import { useNotification } from '@/contexts/NotificationContext'

// Must match the regexes in api/validators/fiscalSchemas.js.
const DNI_REGEX = /^\d{8}[A-Z]$/
const NIE_REGEX = /^[XYZ]\d{7}[A-Z]$/
const CIF_REGEX = /^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/
const POSTAL_CODE_REGEX = /^\d{5}$/

function validateTaxId(value) {
  if (!value) return 'Campo obligatorio'
  const v = value.trim().toUpperCase()
  if (DNI_REGEX.test(v) || NIE_REGEX.test(v) || CIF_REGEX.test(v)) return ''
  return 'DNI, NIE o CIF español no válido'
}

const EMPTY_FORM = {
  tax_status: 'autonomo',
  tax_id: '',
  fiscal_full_name: '',
  fiscal_address_line1: '',
  fiscal_address_line2: '',
  fiscal_address_postal_code: '',
  fiscal_address_city: '',
  fiscal_address_province: '',
  fiscal_address_country: 'ES',
  irpf_retention_rate: '',
}

function sellerToForm(seller) {
  if (!seller) return { ...EMPTY_FORM }
  return {
    tax_status: seller.tax_status || 'autonomo',
    tax_id: seller.tax_id || '',
    fiscal_full_name: seller.fiscal_full_name || '',
    fiscal_address_line1: seller.fiscal_address_line1 || '',
    fiscal_address_line2: seller.fiscal_address_line2 || '',
    fiscal_address_postal_code: seller.fiscal_address_postal_code || '',
    fiscal_address_city: seller.fiscal_address_city || '',
    fiscal_address_province: seller.fiscal_address_province || '',
    fiscal_address_country: seller.fiscal_address_country || 'ES',
    irpf_retention_rate:
      seller.irpf_retention_rate !== null && seller.irpf_retention_rate !== undefined
        ? String(seller.irpf_retention_rate)
        : '',
  }
}

export default function SellerFiscalForm({ seller, onUpdate }) {
  const { showSuccess, showApiError } = useNotification()
  const [form, setForm] = useState(() => sellerToForm(seller))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Keep the form in sync when the parent refetches the seller.
  useEffect(() => {
    setForm(sellerToForm(seller))
    setErrors({})
  }, [seller])

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function validateAll() {
    const errs = {}
    if (!form.tax_status) errs.tax_status = 'Campo obligatorio'

    const taxIdErr = validateTaxId(form.tax_id)
    if (taxIdErr) errs.tax_id = taxIdErr

    if (!form.fiscal_full_name.trim()) errs.fiscal_full_name = 'Campo obligatorio'
    if (!form.fiscal_address_line1.trim()) errs.fiscal_address_line1 = 'Campo obligatorio'

    if (!POSTAL_CODE_REGEX.test(form.fiscal_address_postal_code)) {
      errs.fiscal_address_postal_code = 'Código postal español: 5 dígitos'
    }
    if (!form.fiscal_address_city.trim()) errs.fiscal_address_city = 'Campo obligatorio'
    if (!form.fiscal_address_province.trim()) errs.fiscal_address_province = 'Campo obligatorio'

    if (form.irpf_retention_rate !== '') {
      const rate = Number(form.irpf_retention_rate)
      if (Number.isNaN(rate) || rate < 0 || rate > 0.5) {
        errs.irpf_retention_rate = 'Valor entre 0 y 0.5'
      }
    }

    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validateAll()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    const payload = {
      tax_status: form.tax_status,
      tax_id: form.tax_id.trim().toUpperCase(),
      fiscal_full_name: form.fiscal_full_name.trim(),
      fiscal_address_line1: form.fiscal_address_line1.trim(),
      fiscal_address_line2: form.fiscal_address_line2.trim() || null,
      fiscal_address_postal_code: form.fiscal_address_postal_code.trim(),
      fiscal_address_city: form.fiscal_address_city.trim(),
      fiscal_address_province: form.fiscal_address_province.trim(),
      fiscal_address_country: form.fiscal_address_country.trim().toUpperCase() || 'ES',
    }
    if (form.irpf_retention_rate !== '') {
      payload.irpf_retention_rate = Number(form.irpf_retention_rate)
    }

    setSaving(true)
    try {
      await adminAPI.sellerFiscal.update(seller.id, payload)
      showSuccess('Datos fiscales guardados', 'La información fiscal del artista se actualizó.')
      onUpdate?.()
    } catch (err) {
      showApiError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Datos fiscales</h2>
        <p className="mt-1 text-sm text-gray-500">
          Información fiscal del artista. Se usa para crear la cuenta conectada en Stripe y
          para el informe fiscal trimestral de la gestoría.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Tax status */}
        <div>
          <label htmlFor="tax_status" className="block text-sm font-medium text-gray-900">
            Situación fiscal
          </label>
          <select
            id="tax_status"
            value={form.tax_status}
            onChange={(e) => handleChange('tax_status', e.target.value)}
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          >
            <option value="autonomo">Autónomo</option>
            <option value="sociedad">Sociedad</option>
          </select>
          {errors.tax_status && <p className="mt-1 text-xs text-red-600">{errors.tax_status}</p>}
        </div>

        {/* Tax ID */}
        <div>
          <label htmlFor="tax_id" className="block text-sm font-medium text-gray-900">
            DNI / NIE / CIF
          </label>
          <input
            id="tax_id"
            type="text"
            value={form.tax_id}
            onChange={(e) => handleChange('tax_id', e.target.value.toUpperCase())}
            placeholder="00000000T"
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          />
          {errors.tax_id && <p className="mt-1 text-xs text-red-600">{errors.tax_id}</p>}
        </div>

        {/* Full name */}
        <div className="sm:col-span-2">
          <label htmlFor="fiscal_full_name" className="block text-sm font-medium text-gray-900">
            Nombre completo o razón social
          </label>
          <input
            id="fiscal_full_name"
            type="text"
            value={form.fiscal_full_name}
            onChange={(e) => handleChange('fiscal_full_name', e.target.value)}
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          />
          {errors.fiscal_full_name && <p className="mt-1 text-xs text-red-600">{errors.fiscal_full_name}</p>}
        </div>

        {/* Address line 1 */}
        <div className="sm:col-span-2">
          <label htmlFor="fiscal_address_line1" className="block text-sm font-medium text-gray-900">
            Dirección fiscal
          </label>
          <input
            id="fiscal_address_line1"
            type="text"
            value={form.fiscal_address_line1}
            onChange={(e) => handleChange('fiscal_address_line1', e.target.value)}
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          />
          {errors.fiscal_address_line1 && <p className="mt-1 text-xs text-red-600">{errors.fiscal_address_line1}</p>}
        </div>

        {/* Address line 2 */}
        <div className="sm:col-span-2">
          <label htmlFor="fiscal_address_line2" className="block text-sm font-medium text-gray-900">
            Dirección (línea 2) <span className="text-gray-500 font-normal">(opcional)</span>
          </label>
          <input
            id="fiscal_address_line2"
            type="text"
            value={form.fiscal_address_line2}
            onChange={(e) => handleChange('fiscal_address_line2', e.target.value)}
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          />
        </div>

        {/* Postal code */}
        <div>
          <label htmlFor="fiscal_address_postal_code" className="block text-sm font-medium text-gray-900">
            Código postal
          </label>
          <input
            id="fiscal_address_postal_code"
            type="text"
            maxLength={5}
            value={form.fiscal_address_postal_code}
            onChange={(e) => handleChange('fiscal_address_postal_code', e.target.value.replace(/\D/g, ''))}
            placeholder="28001"
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          />
          {errors.fiscal_address_postal_code && (
            <p className="mt-1 text-xs text-red-600">{errors.fiscal_address_postal_code}</p>
          )}
        </div>

        {/* City */}
        <div>
          <label htmlFor="fiscal_address_city" className="block text-sm font-medium text-gray-900">
            Ciudad
          </label>
          <input
            id="fiscal_address_city"
            type="text"
            value={form.fiscal_address_city}
            onChange={(e) => handleChange('fiscal_address_city', e.target.value)}
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          />
          {errors.fiscal_address_city && <p className="mt-1 text-xs text-red-600">{errors.fiscal_address_city}</p>}
        </div>

        {/* Province */}
        <div>
          <label htmlFor="fiscal_address_province" className="block text-sm font-medium text-gray-900">
            Provincia
          </label>
          <input
            id="fiscal_address_province"
            type="text"
            value={form.fiscal_address_province}
            onChange={(e) => handleChange('fiscal_address_province', e.target.value)}
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          />
          {errors.fiscal_address_province && (
            <p className="mt-1 text-xs text-red-600">{errors.fiscal_address_province}</p>
          )}
        </div>

        {/* Country */}
        <div>
          <label htmlFor="fiscal_address_country" className="block text-sm font-medium text-gray-900">
            País (ISO-2)
          </label>
          <input
            id="fiscal_address_country"
            type="text"
            maxLength={2}
            value={form.fiscal_address_country}
            readOnly
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-500 shadow-xs ring-1 ring-inset ring-gray-200 bg-gray-50 text-sm"
          />
        </div>

        {/* IRPF rate */}
        <div>
          <label
            htmlFor="irpf_retention_rate"
            className="block text-sm font-medium text-gray-900"
            title="Out of scope v1 — campo preparado para futuro. No se aplica todavía."
          >
            Retención IRPF <span className="text-gray-500 font-normal">(opcional, v1 no aplica)</span>
          </label>
          <input
            id="irpf_retention_rate"
            type="number"
            step="0.01"
            min="0"
            max="0.5"
            value={form.irpf_retention_rate}
            onChange={(e) => handleChange('irpf_retention_rate', e.target.value)}
            placeholder="0.15"
            className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black text-sm"
          />
          {errors.irpf_retention_rate && (
            <p className="mt-1 text-xs text-red-600">{errors.irpf_retention_rate}</p>
          )}
        </div>

        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando…' : 'Guardar datos fiscales'}
          </button>
        </div>
      </form>
    </section>
  )
}
