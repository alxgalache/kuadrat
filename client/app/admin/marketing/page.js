'use client'

// Admin "Marketing" section. Hosts the manual "new author" announcement launcher
// and the audit history of marketing broadcasts (incl. the automatic ones).

import { useState, useEffect, useCallback } from 'react'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import ErrorBoundary from '@/components/ErrorBoundary'
import MarketingNewAuthorModal from '@/components/MarketingNewAuthorModal'

const KIND_LABELS = {
  new_author: 'Nuevo autor',
  auction: 'Subasta',
  draw: 'Sorteo',
  event: 'Evento',
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('es-ES', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function MarketingContent() {
  const [modalOpen, setModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSends = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminAPI.marketing.getSends({ page, limit: 20 })
      setData(res)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { loadSends() }, [loadSends])

  const sends = data?.sends || []
  const pages = data?.pagination?.pages || 1

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-gray-900">Marketing</h1>
      <p className="mt-1 text-sm text-gray-500">Comunicaciones de email a los suscriptores de la newsletter.</p>

      {/* Acciones */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900">Nuevos autores</h2>
          <p className="mt-1 text-sm text-gray-500">
            Anuncia manualmente la incorporación de un artista a la galería.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Anunciar autor
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900">Anuncios automáticos</h2>
          <p className="mt-1 text-sm text-gray-500">
            Subastas, sorteos y eventos se anuncian automáticamente al programarse. Consulta el historial abajo.
          </p>
        </div>
      </div>

      {/* Historial */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">Historial de envíos</h2>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Entidad</th>
                <th className="px-4 py-3">Asunto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Cargando…</td></tr>
              ) : sends.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin envíos todavía.</td></tr>
              ) : (
                sends.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-gray-900">{KIND_LABELS[s.kind] || s.kind}</td>
                    <td className="px-4 py-3 text-gray-500">{s.entity_id}</td>
                    <td className="px-4 py-3 text-gray-700">{s.subject || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={s.status === 'sent' ? 'font-medium text-green-700' : 'font-medium text-red-700'}>
                        {s.status === 'sent' ? 'Enviado' : 'Fallido'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(s.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-500">{page} / {pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      <MarketingNewAuthorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSent={loadSends}
      />
    </div>
  )
}

export default function MarketingPage() {
  return (
    <AuthGuard requireRole="admin">
      <ErrorBoundary>
        <MarketingContent />
      </ErrorBoundary>
    </AuthGuard>
  )
}
