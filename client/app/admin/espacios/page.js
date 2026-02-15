'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { PlusIcon, EyeIcon, PlayIcon, StopIcon, XMarkIcon } from '@heroicons/react/20/solid'

function EventsPageContent() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    try {
      const data = await adminAPI.events.getAll()
      setEvents(data.events || [])
    } catch (err) {
      setError('No se pudieron cargar los eventos')
      console.error('Error loading events:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'Borrador', class: 'bg-gray-100 text-gray-800' },
      scheduled: { label: 'Programado', class: 'bg-blue-100 text-blue-800' },
      active: { label: 'En directo', class: 'bg-green-100 text-green-800' },
      finished: { label: 'Finalizado', class: 'bg-gray-900 text-white' },
      cancelled: { label: 'Cancelado', class: 'bg-red-100 text-red-800' },
    }
    const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.class}`}>
        {config.label}
      </span>
    )
  }

  const getCategoryBadge = (category) => {
    const labels = {
      masterclass: 'Masterclass',
      charla: 'Charla',
      entrevista: 'Entrevista',
      ama: 'AMA',
      video: 'Video',
    }
    return (
      <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700">
        {labels[category] || category}
      </span>
    )
  }

  const getAccessBadge = (accessType, price, currency) => {
    if (accessType === 'paid') {
      return (
        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
          {price} {currency}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
        Gratis
      </span>
    )
  }

  const handleStart = async (id) => {
    if (!confirm('¿Estás seguro de que quieres iniciar este evento?')) return
    setActionLoading(id)
    try {
      await adminAPI.events.start(id)
      await loadEvents()
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el evento')
    } finally {
      setActionLoading(null)
    }
  }

  const handleEnd = async (id) => {
    if (!confirm('¿Estás seguro de que quieres finalizar este evento?')) return
    setActionLoading(id)
    try {
      await adminAPI.events.end(id)
      await loadEvents()
    } catch (err) {
      setError(err.message || 'No se pudo finalizar el evento')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async (id) => {
    if (!confirm('¿Estás seguro de que quieres cancelar este evento?')) return
    setActionLoading(id)
    try {
      await adminAPI.events.cancel(id)
      await loadEvents()
    } catch (err) {
      setError(err.message || 'No se pudo cancelar el evento')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando eventos...</p>
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
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Espacios</h1>
            <p className="mt-2 text-sm text-gray-700">
              Gestiona los eventos en directo de la plataforma
            </p>
          </div>
          <Link
            href="/admin/espacios/nuevo"
            className="inline-flex items-center gap-x-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
          >
            <PlusIcon className="-ml-0.5 h-5 w-5" />
            Nuevo evento
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay eventos disponibles</p>
          </div>
        ) : (
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead>
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                        Título
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Fecha
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Categoría
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Acceso
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Host
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Estado
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                          {event.title}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {formatDate(event.event_datetime)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getCategoryBadge(event.category)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getAccessBadge(event.access_type, event.price, event.currency)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {event.host_name || '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getStatusBadge(event.status)}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                          <div className="flex items-center justify-end gap-x-3">
                            <Link
                              href={`/admin/espacios/${event.id}`}
                              className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                            >
                              <EyeIcon className="h-5 w-5" />
                              Ver
                            </Link>
                            {event.status === 'scheduled' && (
                              <button
                                onClick={() => handleStart(event.id)}
                                disabled={actionLoading === event.id}
                                className="inline-flex items-center gap-x-1.5 text-green-700 hover:text-green-500 disabled:opacity-50"
                              >
                                <PlayIcon className="h-5 w-5" />
                                Iniciar
                              </button>
                            )}
                            {event.status === 'active' && (
                              <button
                                onClick={() => handleEnd(event.id)}
                                disabled={actionLoading === event.id}
                                className="inline-flex items-center gap-x-1.5 text-amber-700 hover:text-amber-500 disabled:opacity-50"
                              >
                                <StopIcon className="h-5 w-5" />
                                Finalizar
                              </button>
                            )}
                            {['draft', 'scheduled'].includes(event.status) && (
                              <button
                                onClick={() => handleCancel(event.id)}
                                disabled={actionLoading === event.id}
                                className="inline-flex items-center gap-x-1.5 text-red-700 hover:text-red-500 disabled:opacity-50"
                              >
                                <XMarkIcon className="h-5 w-5" />
                                Cancelar
                              </button>
                            )}
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

export default function EventsPage() {
  return (
    <AuthGuard requireRole="admin">
      <EventsPageContent />
    </AuthGuard>
  )
}
