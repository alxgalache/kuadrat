'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { ArrowLeftIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'

function EventDetailContent({ id }) {
  const router = useRouter()
  const [event, setEvent] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Edit form state
  const [sellers, setSellers] = useState([])
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEvent()
  }, [id])

  useEffect(() => {
    if (event?.status === 'active') {
      loadParticipants()
      const interval = setInterval(loadParticipants, 10000)
      return () => clearInterval(interval)
    }
  }, [event?.status])

  const loadEvent = async () => {
    try {
      const data = await adminAPI.events.getById(id)
      setEvent(data.event)
      setAttendees(data.attendees || [])
      setForm(eventToForm(data.event))
    } catch (err) {
      setError('No se pudo cargar el evento')
    } finally {
      setLoading(false)
    }
  }

  const loadParticipants = async () => {
    try {
      const data = await adminAPI.events.getParticipants(id)
      setParticipants(data.participants || [])
    } catch (err) {
      console.error('Error loading participants:', err)
    }
  }

  const eventToForm = (ev) => ({
    title: ev.title || '',
    description: ev.description || '',
    event_datetime: ev.event_datetime ? formatDatetimeLocal(ev.event_datetime) : '',
    duration_minutes: ev.duration_minutes || 60,
    host_user_id: ev.host_user_id || '',
    cover_image_url: ev.cover_image_url || '',
    access_type: ev.access_type || 'free',
    price: ev.price || '',
    currency: ev.currency || 'EUR',
    format: ev.format || 'live',
    content_type: ev.content_type || 'streaming',
    category: ev.category || 'charla',
    video_url: ev.video_url || '',
    max_attendees: ev.max_attendees || '',
    status: ev.status || 'draft',
  })

  const formatDatetimeLocal = (isoStr) => {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const enterEditMode = async () => {
    const data = await adminAPI.authors.getAll()
    setSellers(data.authors || [])
    setEditMode(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        host_user_id: parseInt(form.host_user_id, 10),
        duration_minutes: parseInt(form.duration_minutes, 10),
        price: form.access_type === 'paid' ? parseFloat(form.price) : null,
        max_attendees: form.max_attendees ? parseInt(form.max_attendees, 10) : null,
        cover_image_url: form.cover_image_url || null,
        video_url: form.video_url || null,
      }
      await adminAPI.events.update(id, payload)
      setEditMode(false)
      await loadEvent()
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el evento')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar este evento?')) return
    setActionLoading(true)
    try {
      await adminAPI.events.delete(id)
      router.push('/admin/espacios')
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el evento')
      setActionLoading(false)
    }
  }

  const handleStart = async () => {
    if (!confirm('¿Iniciar este evento?')) return
    setActionLoading(true)
    try {
      await adminAPI.events.start(id)
      await loadEvent()
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el evento')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEnd = async () => {
    if (!confirm('¿Finalizar este evento?')) return
    setActionLoading(true)
    try {
      await adminAPI.events.end(id)
      await loadEvent()
    } catch (err) {
      setError(err.message || 'No se pudo finalizar el evento')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePromote = async (identity) => {
    try {
      await adminAPI.events.promoteParticipant(id, identity)
      await loadParticipants()
    } catch (err) {
      console.error('Error promoting:', err)
    }
  }

  const handleDemote = async (identity) => {
    try {
      await adminAPI.events.demoteParticipant(id, identity)
      await loadParticipants()
    } catch (err) {
      console.error('Error demoting:', err)
    }
  }

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: 'Borrador', class: 'bg-gray-100 text-gray-800' },
      scheduled: { label: 'Programado', class: 'bg-blue-100 text-blue-800' },
      active: { label: 'En directo', class: 'bg-green-100 text-green-800' },
      finished: { label: 'Finalizado', class: 'bg-gray-900 text-white' },
      cancelled: { label: 'Cancelado', class: 'bg-red-100 text-red-800' },
    }
    const c = config[status] || { label: status, class: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${c.class}`}>
        {c.label}
      </span>
    )
  }

  const categoryLabels = {
    masterclass: 'Masterclass',
    charla: 'Charla',
    entrevista: 'Entrevista',
    ama: 'AMA',
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando evento...</p>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">Evento no encontrado</p>
      </div>
    )
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link
            href="/admin/espacios"
            className="inline-flex items-center gap-x-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a eventos
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-3 lg:gap-8">
          {/* Main content */}
          <div className="lg:col-span-2">
            {editMode ? (
              /* Edit Form */
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Título *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Descripción</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Categoría *</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                    >
                      <option value="masterclass">Masterclass</option>
                      <option value="charla">Charla</option>
                      <option value="entrevista">Entrevista</option>
                      <option value="ama">AMA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Estado</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                    >
                      <option value="draft">Borrador</option>
                      <option value="scheduled">Programado</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Fecha y hora *</label>
                    <input
                      type="datetime-local"
                      value={form.event_datetime}
                      onChange={(e) => setForm({ ...form, event_datetime: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Duración (min)</label>
                    <input
                      type="number"
                      min="15"
                      value={form.duration_minutes}
                      onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Host *</label>
                  <select
                    value={form.host_user_id}
                    onChange={(e) => setForm({ ...form, host_user_id: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                  >
                    <option value="">Seleccionar...</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Acceso</label>
                    <select
                      value={form.access_type}
                      onChange={(e) => setForm({ ...form, access_type: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                    >
                      <option value="free">Gratis</option>
                      <option value="paid">De pago</option>
                    </select>
                  </div>
                  {form.access_type === 'paid' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Precio</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={form.price}
                          onChange={(e) => setForm({ ...form, price: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Moneda</label>
                        <select
                          value={form.currency}
                          onChange={(e) => setForm({ ...form, currency: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                          <option value="GBP">GBP</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">URL imagen de portada</label>
                  <input
                    type="url"
                    value={form.cover_image_url}
                    onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Máx. asistentes</label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_attendees}
                    onChange={(e) => setForm({ ...form, max_attendees: e.target.value })}
                    className="mt-1 block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 sm:text-sm"
                  />
                </div>

                <div className="flex justify-end gap-x-3">
                  <button
                    onClick={() => setEditMode(false)}
                    className="text-sm font-semibold text-gray-900 hover:text-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div className="space-y-6">
                <div className="flex items-center gap-x-3">
                  <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
                  {getStatusBadge(event.status)}
                </div>

                {event.description && (
                  <p className="text-sm text-gray-700">{event.description}</p>
                )}

                <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-500">Fecha:</span>{' '}
                      <span className="text-gray-900">
                        {new Date(event.event_datetime).toLocaleDateString('es-ES', {
                          year: 'numeric', month: 'long', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Duración:</span>{' '}
                      <span className="text-gray-900">{event.duration_minutes} min</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Categoría:</span>{' '}
                      <span className="text-gray-900">{categoryLabels[event.category] || event.category}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Host:</span>{' '}
                      <span className="text-gray-900">{event.host_name || '-'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Acceso:</span>{' '}
                      <span className="text-gray-900">
                        {event.access_type === 'paid' ? `${event.price} ${event.currency}` : 'Gratis'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Asistentes:</span>{' '}
                      <span className="text-gray-900">
                        {attendees.length}{event.max_attendees ? ` / ${event.max_attendees}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Participant management for active events */}
                {event.status === 'active' && (
                  <div className="mt-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Participantes en sala ({participants.length})
                    </h2>
                    {participants.length === 0 ? (
                      <p className="text-sm text-gray-500">No hay participantes conectados</p>
                    ) : (
                      <div className="space-y-2">
                        {participants.map((p) => {
                          const isHost = p.identity.startsWith('host-')
                          const canPublish = p.permission?.canPublish
                          return (
                            <div key={p.identity} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                              <div className="flex items-center gap-x-3">
                                <span className="text-sm font-medium text-gray-900">{p.name || p.identity}</span>
                                {isHost && (
                                  <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                                    Host
                                  </span>
                                )}
                                {!isHost && canPublish && (
                                  <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                                    Speaker
                                  </span>
                                )}
                              </div>
                              {!isHost && (
                                <div className="flex items-center gap-x-2">
                                  {canPublish ? (
                                    <button
                                      onClick={() => handleDemote(p.identity)}
                                      className="text-xs text-red-600 hover:text-red-500"
                                    >
                                      Quitar audio/vídeo
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handlePromote(p.identity)}
                                      className="text-xs text-green-600 hover:text-green-500"
                                    >
                                      Dar audio/vídeo
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Attendees list */}
                <div className="mt-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Registrados ({attendees.length})
                  </h2>
                  {attendees.length === 0 ? (
                    <p className="text-sm text-gray-500">No hay asistentes registrados</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead>
                          <tr>
                            <th className="py-2 pr-3 text-left font-medium text-gray-500">Nombre</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Email</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Estado</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Pago</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {attendees.map((a) => (
                            <tr key={a.id}>
                              <td className="py-2 pr-3 text-gray-900">{a.first_name} {a.last_name}</td>
                              <td className="px-3 py-2 text-gray-500">{a.email}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                                  a.status === 'joined' ? 'bg-green-50 text-green-700' :
                                  a.status === 'paid' ? 'bg-blue-50 text-blue-700' :
                                  'bg-gray-50 text-gray-700'
                                }`}>
                                  {a.status === 'joined' ? 'Conectado' :
                                   a.status === 'paid' ? 'Pagado' :
                                   a.status === 'registered' ? 'Registrado' :
                                   a.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-500">
                                {a.amount_paid ? `${a.amount_paid} ${a.currency}` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar actions */}
          <div className="mt-8 lg:mt-0">
            <div className="sticky top-24 space-y-3">
              {['draft', 'scheduled'].includes(event.status) && !editMode && (
                <button
                  onClick={enterEditMode}
                  className="flex w-full items-center justify-center gap-x-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                >
                  <PencilIcon className="h-4 w-4" />
                  Editar evento
                </button>
              )}

              {event.status === 'scheduled' && (
                <button
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="flex w-full items-center justify-center gap-x-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
                >
                  Iniciar evento
                </button>
              )}

              {event.status === 'active' && (
                <button
                  onClick={handleEnd}
                  disabled={actionLoading}
                  className="flex w-full items-center justify-center gap-x-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50"
                >
                  Finalizar evento
                </button>
              )}

              {['draft', 'cancelled'].includes(event.status) && (
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="flex w-full items-center justify-center gap-x-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                  Eliminar evento
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EventDetailPage({ params }) {
  const resolvedParams = use(params)
  return (
    <AuthGuard requireRole="admin">
      <EventDetailContent id={resolvedParams.id} />
    </AuthGuard>
  )
}
