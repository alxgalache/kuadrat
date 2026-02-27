'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { PlusIcon, EyeIcon, PlayIcon, XMarkIcon } from '@heroicons/react/20/solid'

function DrawsPageContent() {
  const [draws, setDraws] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    loadDraws()
  }, [])

  const loadDraws = async () => {
    try {
      const data = await adminAPI.draws.getAll()
      setDraws(data.draws || [])
    } catch {
      setError('No se pudieron cargar los sorteos')
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
      active: { label: 'Activo', class: 'bg-green-100 text-green-800' },
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

  const handleStart = async (id) => {
    if (!confirm('¿Estás seguro de que quieres iniciar este sorteo?')) return
    setActionLoading(id)
    try {
      await adminAPI.draws.start(id)
      await loadDraws()
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el sorteo')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async (id) => {
    if (!confirm('¿Estás seguro de que quieres cancelar este sorteo?')) return
    setActionLoading(id)
    try {
      await adminAPI.draws.cancel(id)
      await loadDraws()
    } catch (err) {
      setError(err.message || 'No se pudo cancelar el sorteo')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando sorteos...</p>
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
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Sorteos</h1>
            <p className="mt-2 text-sm text-gray-700">
              Gestiona todos los sorteos de la plataforma
            </p>
          </div>
          <Link
            href="/admin/sorteos/nueva"
            className="inline-flex items-center gap-x-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
          >
            <PlusIcon className="-ml-0.5 h-5 w-5" />
            Nuevo sorteo
          </Link>
        </div>

        {draws.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay sorteos disponibles</p>
          </div>
        ) : (
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead>
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">Nombre</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Inicio</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Fin</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Estado</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Precio</th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {draws.map((draw) => (
                      <tr key={draw.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">{draw.name}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formatDate(draw.start_datetime)}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formatDate(draw.end_datetime)}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">{getStatusBadge(draw.status)}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">€{Number(draw.price).toFixed(2)}</td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                          <div className="flex items-center justify-end gap-x-3">
                            <Link href={`/admin/sorteos/${draw.id}`} className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600">
                              <EyeIcon className="h-5 w-5" /> Ver
                            </Link>
                            {draw.status === 'scheduled' && (
                              <button onClick={() => handleStart(draw.id)} disabled={actionLoading === draw.id} className="inline-flex items-center gap-x-1.5 text-green-700 hover:text-green-500 disabled:opacity-50">
                                <PlayIcon className="h-5 w-5" /> Iniciar
                              </button>
                            )}
                            {['active', 'scheduled', 'draft'].includes(draw.status) && (
                              <button onClick={() => handleCancel(draw.id)} disabled={actionLoading === draw.id} className="inline-flex items-center gap-x-1.5 text-red-700 hover:text-red-500 disabled:opacity-50">
                                <XMarkIcon className="h-5 w-5" /> Cancelar
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

export default function DrawsPage() {
  return (
    <AuthGuard requireRole="admin">
      <DrawsPageContent />
    </AuthGuard>
  )
}
