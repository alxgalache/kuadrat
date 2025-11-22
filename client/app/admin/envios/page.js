'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { PencilIcon, TrashIcon, MapPinIcon, PlusIcon } from '@heroicons/react/20/solid'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

function ShippingMethodsPageContent() {
  const [methods, setMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showBanner } = useBannerNotification()

  useEffect(() => {
    loadMethods()
  }, [])

  const loadMethods = async () => {
    try {
      const data = await adminAPI.shipping.getAllMethods()
      setMethods(data.methods || [])
    } catch (err) {
      setError('No se pudieron cargar los métodos de envío')
      console.error('Error loading shipping methods:', err)
      setMethods([]) // Ensure methods is always an array even on error
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el método "${name}"? Esto también eliminará todas sus zonas asociadas.`)) {
      return
    }

    try {
      await adminAPI.shipping.deleteMethod(id)
      setMethods(methods.filter(m => m.id !== id))
    } catch (err) {
      showBanner(err.message || 'No se pudo eliminar el método de envío')
      console.error('Error deleting shipping method:', err)
    }
  }

  const getTypeBadge = (type) => {
    const typeConfig = {
      pickup: { label: 'Recogida', class: 'bg-blue-100 text-blue-800' },
      delivery: { label: 'Entrega', class: 'bg-green-100 text-green-800' },
    }

    const config = typeConfig[type] || { label: type, class: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.class}`}>
        {config.label}
      </span>
    )
  }

  const getArticleTypeBadge = (articleType) => {
    const typeConfig = {
      art: { label: 'Solo arte', class: 'bg-purple-100 text-purple-800' },
      others: { label: 'Solo otros', class: 'bg-orange-100 text-orange-800' },
      all: { label: 'Arte y otros', class: 'bg-gray-100 text-gray-800' },
    }

    const config = typeConfig[articleType] || { label: 'Arte y otros', class: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.class}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando métodos de envío...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Métodos de envío</h1>
            <p className="mt-2 text-sm text-gray-700">
              Gestiona los métodos de envío y sus zonas de cobertura
            </p>
          </div>
          <Link
            href="/admin/envios/new"
            className="inline-flex items-center gap-x-2 rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
          >
            <PlusIcon className="h-5 w-5" />
            Nuevo método
          </Link>
        </div>

        {!methods || methods.length === 0 ? (
          <div className="text-center py-12 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-500 mb-4">No hay métodos de envío disponibles</p>
            <Link
              href="/admin/envios/new"
              className="inline-flex items-center gap-x-2 rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
            >
              <PlusIcon className="h-5 w-5" />
              Crear primer método
            </Link>
          </div>
        ) : (
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead>
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                        Nombre
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Tipo
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Tipo de artículo
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Peso máx.
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Dimensiones máx.
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Días entrega
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Activo
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {methods.map((method) => (
                      <tr key={method.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-0">
                          <div className="font-medium text-gray-900">{method.name}</div>
                          {method.description && (
                            <div className="text-gray-500 max-w-xs truncate">{method.description}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getTypeBadge(method.type)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getArticleTypeBadge(method.article_type)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {method.max_weight ? `${method.max_weight}g` : '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {method.max_dimensions || '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {method.estimated_delivery_days || '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {method.is_active ? (
                            <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                          <div className="flex items-center justify-end gap-x-2">
                            <Link
                              href={`/admin/envios/${method.id}/zones`}
                              className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                              title="Gestionar zonas"
                            >
                              <MapPinIcon className="h-5 w-5" />
                              Zonas
                            </Link>
                            <Link
                              href={`/admin/envios/${method.id}/edit`}
                              className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                              title="Editar método"
                            >
                              <PencilIcon className="h-5 w-5" />
                              Editar
                            </Link>
                            <button
                              onClick={() => handleDelete(method.id, method.name)}
                              className="inline-flex items-center gap-x-1.5 text-red-600 hover:text-red-800"
                              title="Eliminar método"
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

export default function ShippingMethodsPage() {
  return (
    <AuthGuard requireRole="admin">
      <ShippingMethodsPageContent />
    </AuthGuard>
  )
}
