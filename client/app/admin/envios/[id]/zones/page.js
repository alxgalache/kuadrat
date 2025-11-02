'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { ArrowLeftIcon, PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

function ZonesManagementContent() {
  const params = useParams()
  const [method, setMethod] = useState(null)
  const [zones, setZones] = useState([])
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingZone, setEditingZone] = useState(null)
  const [formData, setFormData] = useState({
    seller_id: '',
    country: 'ES',
    postal_code: '',
    cost: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const { showBanner } = useBannerNotification()

  useEffect(() => {
    if (params.id) {
      loadData()
    }
  }, [params.id])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      // Load method, zones, and sellers in parallel
      const [methodData, zonesData, sellersData] = await Promise.all([
        adminAPI.shipping.getMethodById(params.id),
        adminAPI.shipping.getZones(params.id),
        adminAPI.authors.getAll(),
      ])

      setMethod(methodData.method)
      setZones(zonesData.zones)
      setSellers(sellersData.authors)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos')
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!formData.seller_id) {
      setError('Selecciona un vendedor')
      return
    }

    if (!formData.country) {
      setError('El país es requerido')
      return
    }

    // For pickup methods, cost should always be 0
    const cost = method.type === 'pickup' ? 0 : parseFloat(formData.cost) || 0

    setSubmitting(true)

    try {
      const zoneData = {
        seller_id: parseInt(formData.seller_id, 10),
        country: formData.country.trim(),
        postal_code: formData.postal_code.trim() || null,
        cost,
      }

      if (editingZone) {
        // Update existing zone
        await adminAPI.shipping.updateZone(editingZone.id, zoneData)
      } else {
        // Create new zone
        await adminAPI.shipping.createZone(params.id, zoneData)
      }

      // Reload zones
      const zonesData = await adminAPI.shipping.getZones(params.id)
      setZones(zonesData.zones)

      // Reset form
      setShowForm(false)
      setEditingZone(null)
      setFormData({
        seller_id: '',
        country: 'ES',
        postal_code: '',
        cost: '',
      })
    } catch (err) {
      setError(err.message || 'No se pudo guardar la zona')
      console.error('Error saving zone:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (zone) => {
    setEditingZone(zone)
    setFormData({
      seller_id: zone.seller_id.toString(),
      country: zone.country,
      postal_code: zone.postal_code || '',
      cost: zone.cost.toString(),
    })
    setShowForm(true)
  }

  const handleDelete = async (zone) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar esta zona?`)) {
      return
    }

    try {
      await adminAPI.shipping.deleteZone(zone.id)
      setZones(zones.filter(z => z.id !== zone.id))
    } catch (err) {
      showBanner(err.message || 'No se pudo eliminar la zona')
      console.error('Error deleting zone:', err)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingZone(null)
    setFormData({
      seller_id: '',
      country: 'ES',
      postal_code: '',
      cost: '',
    })
    setError('')
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando zonas...</p>
      </div>
    )
  }

  if (error && !method) {
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
            Zonas de envío
          </h1>
          {method && (
            <p className="mt-2 text-sm text-gray-700">
              Método: <span className="font-medium">{method.name}</span>
              {' · '}
              Tipo: <span className="font-medium">{method.type === 'pickup' ? 'Recogida' : 'Entrega'}</span>
            </p>
          )}
        </div>

        {/* Add zone button */}
        {!showForm && (
          <div className="mb-6">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-x-2 rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
            >
              <PlusIcon className="h-5 w-5" />
              Nueva zona
            </button>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="mb-8 rounded-lg bg-gray-50 p-6 ring-1 ring-black ring-opacity-5">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              {editingZone ? 'Editar zona' : 'Nueva zona'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-red-50 p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Seller */}
                <div>
                  <label htmlFor="seller_id" className="block text-sm font-medium text-gray-900">
                    Vendedor <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="seller_id"
                    name="seller_id"
                    value={formData.seller_id}
                    onChange={handleChange}
                    required
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                  >
                    <option value="">Selecciona un vendedor</option>
                    {sellers.map(seller => (
                      <option key={seller.id} value={seller.id}>
                        {seller.full_name || seller.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Country */}
                <div>
                  <label htmlFor="country" className="block text-sm font-medium text-gray-900">
                    País <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="country"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    required
                    maxLength={2}
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm uppercase"
                    placeholder="ES"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Código de país ISO (2 letras)
                  </p>
                </div>

                {/* Postal code */}
                <div>
                  <label htmlFor="postal_code" className="block text-sm font-medium text-gray-900">
                    Código postal
                  </label>
                  <input
                    type="text"
                    id="postal_code"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleChange}
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
                    placeholder="Dejar vacío para todo el país"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Opcional. Si se omite, aplica a todo el país.
                  </p>
                </div>

                {/* Cost */}
                <div>
                  <label htmlFor="cost" className="block text-sm font-medium text-gray-900">
                    Costo (€) {method?.type === 'pickup' && <span className="text-gray-500">(siempre 0 para recogida)</span>}
                  </label>
                  <input
                    type="number"
                    id="cost"
                    name="cost"
                    value={formData.cost}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    disabled={method?.type === 'pickup'}
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Guardando...' : editingZone ? 'Guardar cambios' : 'Crear zona'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Zones list */}
        {zones.length === 0 ? (
          <div className="text-center py-12 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-500">No hay zonas configuradas para este método</p>
          </div>
        ) : (
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead>
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                        Vendedor
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        País
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Código postal
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Costo
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {zones.map((zone) => (
                      <tr key={zone.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                          {zone.seller_name || `ID: ${zone.seller_id}`}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {zone.country}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {zone.postal_code || 'Todo el país'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                          €{zone.cost.toFixed(2)}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                          <div className="flex items-center justify-end gap-x-2">
                            <button
                              onClick={() => handleEdit(zone)}
                              className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                              title="Editar zona"
                            >
                              <PencilIcon className="h-5 w-5" />
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(zone)}
                              className="inline-flex items-center gap-x-1.5 text-red-600 hover:text-red-800"
                              title="Eliminar zona"
                            >
                              <TrashIcon className="h-5 w-5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ZonesManagementPage() {
  return (
    <AuthGuard requireRole="admin">
      <ZonesManagementContent />
    </AuthGuard>
  )
}
