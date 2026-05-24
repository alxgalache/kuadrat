'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import StatusBadge from '@/components/admin/StatusBadge'
import useDebounce from '@/hooks/useDebounce'
import { DEBOUNCE_SEARCH, ADMIN_PAGE_SIZE } from '@/lib/constants'
import { EyeIcon, LockClosedIcon, XMarkIcon } from '@heroicons/react/20/solid'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CoaListContent() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [artIdFilter, setArtIdFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, DEBOUNCE_SEARCH)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: ADMIN_PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      if (artIdFilter) params.art_id = artIdFilter
      const result = await adminAPI.coa.list(params)
      setData(result)
    } catch (err) {
      console.error('Error loading CoA tags:', err)
      setError(err.message || 'No se pudieron cargar las etiquetas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, artIdFilter])

  const handleStatusChange = (value) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handleArtIdSubmit = (event) => {
    event.preventDefault()
    setArtIdFilter(artIdFilter.trim())
    setPage(1)
  }

  const filteredTags = useMemo(() => {
    const tags = data?.tags || []
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return tags
    return tags.filter((t) => {
      const uid = (t.uid || '').toLowerCase()
      const serial = (t.serial_label || '').toLowerCase()
      return uid.includes(q) || serial.includes(q)
    })
  }, [data, debouncedSearch])

  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 }

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Certificados de Autenticidad (CoA)</h1>
          <p className="mt-2 text-sm text-gray-700">
            Gestiona las etiquetas NFC NTAG 424 DNA vinculadas a las obras. La programación inicial se hace
            offline con <code className="rounded bg-gray-100 px-1 text-xs">scripts/nfc-personalization/</code>.
          </p>
        </div>

        {/* Filtros */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="coa-status" className="block text-sm font-medium text-gray-900">
              Estado
            </label>
            <select
              id="coa-status"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm"
            >
              <option value="">Todos</option>
              <option value="active">Activas</option>
              <option value="revoked">Revocadas</option>
              <option value="lost">Perdidas</option>
              <option value="damaged">Dañadas</option>
            </select>
          </div>

          <div>
            <label htmlFor="coa-search" className="block text-sm font-medium text-gray-900">
              Buscar UID o serial
            </label>
            <input
              id="coa-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="04A1B2... o GAL-2026-0007"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Filtra la página actual.</p>
          </div>

          <form onSubmit={handleArtIdSubmit}>
            <label htmlFor="coa-art-id" className="block text-sm font-medium text-gray-900">
              Filtrar por ID de obra (art_id)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="coa-art-id"
                type="number"
                min="1"
                value={artIdFilter}
                onChange={(e) => setArtIdFilter(e.target.value)}
                placeholder="42"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              {artIdFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setArtIdFilter('')
                    setPage(1)
                  }}
                  className="inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  aria-label="Limpiar filtro de obra"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              El ID aparece en la URL de la edición de la obra (<code>/admin/products/&lt;id&gt;/edit</code>).
            </p>
          </form>
        </div>

        {/* Cuerpo */}
        {loading ? (
          <p className="py-12 text-center text-gray-500">Cargando etiquetas…</p>
        ) : error ? (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50"
            >
              Reintentar
            </button>
          </div>
        ) : filteredTags.length === 0 ? (
          <p className="py-12 text-center text-gray-500">
            No hay etiquetas que coincidan con los filtros.
          </p>
        ) : (
          <>
            <div className="mt-2 flow-root">
              <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead>
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                          UID
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Serial
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Obra
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Estado
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Cont.
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Lock
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Programada
                        </th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredTags.map((tag) => (
                        <tr key={tag.uid}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-xs font-mono text-gray-900 sm:pl-0">
                            {(tag.uid || '').slice(0, 14)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-700">
                            {tag.serial_label || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-700">
                            {tag.art_id ? (
                              <Link
                                href={`/admin/products/${tag.art_id}/edit`}
                                className="text-gray-900 hover:underline"
                              >
                                {tag.art_name || `Obra #${tag.art_id}`}
                              </Link>
                            ) : (
                              '—'
                            )}
                            {tag.art_slug && (
                              <span className="ml-2 text-xs text-gray-400">/{tag.art_slug}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <StatusBadge type="tag" value={tag.status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-700">
                            {tag.last_counter ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-700">
                            {Number(tag.is_permanently_locked) === 1 ? (
                              <LockClosedIcon
                                className="h-4 w-4 text-gray-700"
                                aria-label="Bloqueada permanentemente"
                              />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-xs text-gray-500">
                            <div>{formatDate(tag.personalized_at)}</div>
                            <div className="text-gray-400">{tag.personalized_by || '—'}</div>
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                            <Link
                              href={`/admin/coa/${encodeURIComponent(tag.uid)}`}
                              className="inline-flex items-center gap-x-1.5 text-gray-900 hover:text-gray-600"
                            >
                              <EyeIcon className="h-5 w-5" />
                              Ver
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Paginación */}
            {pagination.pages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Página {pagination.page} de {pagination.pages} · {pagination.total} etiquetas
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function CoaListPage() {
  return (
    <AuthGuard requireRole="admin">
      <CoaListContent />
    </AuthGuard>
  )
}
