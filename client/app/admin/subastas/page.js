'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { PlusIcon, EyeIcon, PlayIcon, XMarkIcon } from '@heroicons/react/20/solid'

function AuctionsPageContent() {
  const [auctions, setAuctions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    loadAuctions()
  }, [])

  const loadAuctions = async () => {
    try {
      const data = await adminAPI.auctions.getAll()
      setAuctions(data.auctions || [])
    } catch (err) {
      setError('No se pudieron cargar las subastas')
      console.error('Error loading auctions:', err)
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
      scheduled: { label: 'Programada', class: 'bg-blue-100 text-blue-800' },
      active: { label: 'Activa', class: 'bg-green-100 text-green-800' },
      finished: { label: 'Finalizada', class: 'bg-gray-900 text-white' },
      cancelled: { label: 'Cancelada', class: 'bg-red-100 text-red-800' },
    }

    const config = statusConfig[status] || { label: status, class: 'bg-gray-100 text-gray-800' }

    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.class}`}>
        {config.label}
      </span>
    )
  }

  const handleStart = async (id) => {
    if (!confirm('¿Estás seguro de que quieres iniciar esta subasta?')) return

    setActionLoading(id)
    try {
      await adminAPI.auctions.start(id)
      await loadAuctions()
    } catch (err) {
      setError(err.message || 'No se pudo iniciar la subasta')
      console.error('Error starting auction:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async (id) => {
    if (!confirm('¿Estás seguro de que quieres cancelar esta subasta?')) return

    setActionLoading(id)
    try {
      await adminAPI.auctions.cancel(id)
      await loadAuctions()
    } catch (err) {
      setError(err.message || 'No se pudo cancelar la subasta')
      console.error('Error cancelling auction:', err)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando subastas...</p>
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
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Subastas</h1>
            <p className="mt-2 text-sm text-gray-700">
              Gestiona todas las subastas de la plataforma
            </p>
          </div>
          <Link
            href="/admin/subastas/nueva"
            className="inline-flex items-center gap-x-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
          >
            <PlusIcon className="-ml-0.5 h-5 w-5" />
            Nueva subasta
          </Link>
        </div>

        {auctions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay subastas disponibles</p>
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
                        Inicio
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Fin
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Estado
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Productos
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {auctions.map((auction) => (
                      <tr key={auction.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                          {auction.name}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {formatDate(auction.start_datetime)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {formatDate(auction.end_datetime)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getStatusBadge(auction.status)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {auction.product_count || 0}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                          <div className="flex items-center justify-end gap-x-3">
                            <Link
                              href={`/admin/subastas/${auction.id}`}
                              className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                            >
                              <EyeIcon className="h-5 w-5" />
                              Ver
                            </Link>
                            {(auction.status === 'scheduled') && (
                              <button
                                onClick={() => handleStart(auction.id)}
                                disabled={actionLoading === auction.id}
                                className="inline-flex items-center gap-x-1.5 text-green-700 hover:text-green-500 disabled:opacity-50"
                              >
                                <PlayIcon className="h-5 w-5" />
                                Iniciar
                              </button>
                            )}
                            {(auction.status === 'active' || auction.status === 'scheduled' || auction.status === 'draft') && (
                              <button
                                onClick={() => handleCancel(auction.id)}
                                disabled={actionLoading === auction.id}
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

export default function AuctionsPage() {
  return (
    <AuthGuard requireRole="admin">
      <AuctionsPageContent />
    </AuthGuard>
  )
}
