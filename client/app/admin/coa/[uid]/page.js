'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import StatusBadge from '@/components/admin/StatusBadge'
import CoaEventsTable from '@/components/admin/CoaEventsTable'
import CoaStatusModal from '@/components/admin/CoaStatusModal'
import { ArrowLeftIcon, LockClosedIcon, PencilSquareIcon } from '@heroicons/react/20/solid'

const EVENTS_INITIAL = 25
const EVENTS_STEP = 25
const EVENTS_MAX = 200

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CoaDetailContent({ uid }) {
  const [data, setData] = useState(null)
  const [eventsLimit, setEventsLimit] = useState(EVENTS_INITIAL)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(
    async (limit) => {
      setLoading(true)
      setError('')
      setNotFound(false)
      try {
        const result = await adminAPI.coa.getByUid(uid, { events_limit: limit })
        setData(result)
      } catch (err) {
        console.error('Error loading CoA tag:', err)
        if (err.status === 404) {
          setNotFound(true)
        } else {
          setError(err.message || 'No se pudo cargar la etiqueta.')
        }
      } finally {
        setLoading(false)
      }
    },
    [uid],
  )

  useEffect(() => {
    load(eventsLimit)
  }, [load, eventsLimit])

  const handleLoadMore = () => {
    setEventsLimit((current) => Math.min(EVENTS_MAX, current + EVENTS_STEP))
  }

  const handleStatusUpdated = () => {
    // refresca todo el detalle (tag actualizado + nuevos eventos si los hubiera)
    load(eventsLimit)
  }

  if (loading && !data) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando etiqueta…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="bg-white min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Etiqueta no encontrada</h1>
          <p className="mt-2 text-sm text-gray-600">
            No hay ninguna etiqueta NFC con UID <code className="font-mono">{uid}</code>.
          </p>
          <Link
            href="/admin/coa"
            className="mt-6 inline-flex items-center gap-x-1.5 text-sm font-medium text-gray-900 hover:underline"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Volver al listado
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <Link
            href="/admin/coa"
            className="mb-6 inline-flex items-center gap-x-1.5 text-sm font-medium text-gray-700 hover:underline"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Volver al listado
          </Link>
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => load(eventsLimit)}
              className="mt-3 inline-flex items-center rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  const tag = data?.tag
  const events = data?.events || []
  if (!tag) return null

  const isLocked = Number(tag.is_permanently_locked) === 1
  const canLoadMore = eventsLimit < EVENTS_MAX && events.length >= eventsLimit
  const reachedMax = eventsLimit >= EVENTS_MAX

  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <Link
          href="/admin/coa"
          className="mb-6 inline-flex items-center gap-x-1.5 text-sm font-medium text-gray-700 hover:underline"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Volver al listado
        </Link>

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Etiqueta NFC</h1>
            <p className="mt-1 text-sm font-mono text-gray-700 break-all">{tag.uid}</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge type="tag" value={tag.status} />
              {isLocked && (
                <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                  <LockClosedIcon className="h-3.5 w-3.5" />
                  Bloqueada permanentemente
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-x-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
          >
            <PencilSquareIcon className="h-5 w-5" />
            Cambiar estado
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Datos del tag</h2>
            <dl className="mt-3 grid grid-cols-3 gap-y-3 text-sm">
              <dt className="text-gray-500">Serial</dt>
              <dd className="col-span-2 text-gray-900">{tag.serial_label || '—'}</dd>

              <dt className="text-gray-500">Último contador</dt>
              <dd className="col-span-2 text-gray-900 font-mono">{tag.last_counter ?? '—'}</dd>

              <dt className="text-gray-500">Programada</dt>
              <dd className="col-span-2 text-gray-900">
                {formatDateTime(tag.personalized_at)}
                <span className="ml-2 text-gray-400">por {tag.personalized_by || '—'}</span>
              </dd>

              <dt className="text-gray-500">Bloqueada</dt>
              <dd className="col-span-2 text-gray-900">
                {isLocked ? formatDateTime(tag.locked_at) : 'No'}
              </dd>

              <dt className="text-gray-500">Notas</dt>
              <dd className="col-span-2 whitespace-pre-wrap font-mono text-xs text-gray-700">
                {tag.notes || '—'}
              </dd>
            </dl>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Obra vinculada</h2>
            <dl className="mt-3 grid grid-cols-3 gap-y-3 text-sm">
              <dt className="text-gray-500">Nombre</dt>
              <dd className="col-span-2 text-gray-900">{tag.art_name || `Obra #${tag.art_id}`}</dd>

              <dt className="text-gray-500">Slug</dt>
              <dd className="col-span-2 text-gray-700 font-mono text-xs">{tag.art_slug || '—'}</dd>

              <dt className="text-gray-500">ID</dt>
              <dd className="col-span-2 text-gray-700 font-mono text-xs">{tag.art_id}</dd>

              <dt className="text-gray-500">Acciones</dt>
              <dd className="col-span-2">
                {tag.art_id && (
                  <Link
                    href={`/admin/products/${tag.art_id}/edit`}
                    className="text-gray-900 hover:underline"
                  >
                    Editar obra →
                  </Link>
                )}
              </dd>
            </dl>
          </section>
        </div>

        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Historial de verificaciones ({events.length})
            </h2>
            {loading && <span className="text-xs text-gray-400">Actualizando…</span>}
          </div>
          <div className="mt-4">
            <CoaEventsTable events={events} />
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>Mostrando hasta {eventsLimit} eventos.</span>
            {canLoadMore ? (
              <button
                type="button"
                onClick={handleLoadMore}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cargar más
              </button>
            ) : reachedMax ? (
              <span>Para más detalle consulta la BD.</span>
            ) : null}
          </div>
        </section>
      </div>

      <CoaStatusModal
        tag={tag}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleStatusUpdated}
      />
    </div>
  )
}

export default function CoaDetailPage() {
  const params = useParams()
  const uid = decodeURIComponent(params?.uid || '')

  return (
    <AuthGuard requireRole="admin">
      <CoaDetailContent uid={uid} />
    </AuthGuard>
  )
}
