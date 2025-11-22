'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'

function EditShippingMethodContent() {
  const params = useParams()
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'delivery',
    article_type: 'all',
    max_weight: '',
    max_dimensions: '',
    estimated_delivery_days: '',
    is_active: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (params.id) {
      loadMethod()
    }
  }, [params.id])

  const loadMethod = async () => {
    try {
      const data = await adminAPI.shipping.getMethodById(params.id)
      const method = data.method

      setFormData({
        name: method.name || '',
        description: method.description || '',
        type: method.type || 'delivery',
        article_type: method.article_type || 'all',
        max_weight: method.max_weight || '',
        max_dimensions: method.max_dimensions || '',
        estimated_delivery_days: method.estimated_delivery_days || '',
        is_active: method.is_active === 1,
      })
    } catch (err) {
      setError(err.message || 'No se pudo cargar el método de envío')
      console.error('Error loading shipping method:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!formData.name.trim()) {
      setError('El nombre es requerido')
      return
    }

    // Validate dimensions format if provided
    if (formData.max_dimensions && formData.max_dimensions.trim()) {
      const dimensionsRegex = /^\d+x\d+x\d+$/
      if (!dimensionsRegex.test(formData.max_dimensions.trim())) {
        setError('Las dimensiones deben estar en formato "LxWxH" (ej: 30x20x10)')
        return
      }
    }

    setSaving(true)

    try {
      const methodData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        type: formData.type,
        article_type: formData.article_type,
        max_weight: formData.max_weight ? parseInt(formData.max_weight, 10) : null,
        max_dimensions: formData.max_dimensions.trim() || null,
        estimated_delivery_days: formData.estimated_delivery_days ? parseInt(formData.estimated_delivery_days, 10) : null,
        is_active: formData.is_active,
      }

      await adminAPI.shipping.updateMethod(params.id, methodData)
      router.push('/admin/envios')
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el método de envío')
      console.error('Error updating shipping method:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando método de envío...</p>
      </div>
    )
  }

  if (error && !formData.name) {
    return (
      <div className="bg-white min-h-screen">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <Link
            href="/admin/envios"
            className="inline-flex items-center gap-x-2 text-sm font-semibold text-gray-900 hover:text-gray-600 mb-8"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Volver a métodos de envío
          </Link>
          <p className="text-red-500 mt-4">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Back button */}
        <Link
          href="/admin/envios"
          className="inline-flex items-center gap-x-2 text-sm font-semibold text-gray-900 hover:text-gray-600 mb-8"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Volver a métodos de envío
        </Link>

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Editar método de envío
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Modifica la información del método de envío
          </p>
        </div>

        {/* Form */}
        <div className="mx-auto max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-900">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                placeholder="ej: Envío estándar España"
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-900">
                Descripción
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                placeholder="Descripción opcional del método de envío"
              />
            </div>

            {/* Type */}
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-900">
                Tipo <span className="text-red-500">*</span>
              </label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                required
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
              >
                <option value="delivery">Entrega a domicilio</option>
                <option value="pickup">Recogida en tienda</option>
              </select>
            </div>

            {/* Article type */}
            <div>
              <label htmlFor="article_type" className="block text-sm font-medium text-gray-900">
                Tipo de artículo <span className="text-red-500">*</span>
              </label>
              <select
                id="article_type"
                name="article_type"
                value={formData.article_type}
                onChange={handleChange}
                required
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
              >
                <option value="all">Arte y otros productos</option>
                <option value="art">Solo arte</option>
                <option value="others">Solo otros productos</option>
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Define para qué tipos de artículos se puede usar este método de envío.
              </p>
            </div>

            {/* Max weight */}
            <div>
              <label htmlFor="max_weight" className="block text-sm font-medium text-gray-900">
                Peso máximo (gramos)
              </label>
              <input
                type="number"
                id="max_weight"
                name="max_weight"
                value={formData.max_weight}
                onChange={handleChange}
                min="1"
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                placeholder="ej: 5000"
              />
              <p className="mt-1 text-sm text-gray-500">
                Peso máximo que puede manejar este método. Dejar vacío si no hay límite.
              </p>
            </div>

            {/* Max dimensions */}
            <div>
              <label htmlFor="max_dimensions" className="block text-sm font-medium text-gray-900">
                Dimensiones máximas
              </label>
              <input
                type="text"
                id="max_dimensions"
                name="max_dimensions"
                value={formData.max_dimensions}
                onChange={handleChange}
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                placeholder="ej: 30x20x10"
              />
              <p className="mt-1 text-sm text-gray-500">
                Formato: LxWxH en centímetros. Dejar vacío si no hay límite.
              </p>
            </div>

            {/* Estimated delivery days */}
            <div>
              <label htmlFor="estimated_delivery_days" className="block text-sm font-medium text-gray-900">
                Días estimados de entrega
              </label>
              <input
                type="number"
                id="estimated_delivery_days"
                name="estimated_delivery_days"
                value={formData.estimated_delivery_days}
                onChange={handleChange}
                min="1"
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                placeholder="ej: 3"
              />
              <p className="mt-1 text-sm text-gray-500">
                Número de días que toma la entrega estimada.
              </p>
            </div>

            {/* Is active */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <label htmlFor="is_active" className="ml-3 block text-sm font-medium text-gray-900">
                Método activo
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-x-3 pt-6 border-t border-gray-200">
              <Link
                href="/admin/envios"
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function EditShippingMethodPage() {
  return (
    <AuthGuard requireRole="admin">
      <EditShippingMethodContent />
    </AuthGuard>
  )
}
