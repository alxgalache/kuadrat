'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'

function EditDrawContent({ params }) {
  const unwrappedParams = use(params)
  const router = useRouter()
  const [draw, setDraw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    product_id: '',
    product_type: 'art',
    price: '',
    units: '1',
    max_participations: '',
    start_datetime: '',
    end_datetime: '',
    status: 'draft',
  })

  useEffect(() => {
    loadDraw()
  }, [])

  const loadDraw = async () => {
    try {
      const data = await adminAPI.draws.getById(unwrappedParams.id)
      const d = data.draw
      setDraw(d)
      setForm({
        name: d.name || '',
        description: d.description || '',
        product_id: String(d.product_id || ''),
        product_type: d.product_type || 'art',
        price: String(d.price || ''),
        units: String(d.units || '1'),
        max_participations: String(d.max_participations || ''),
        start_datetime: d.start_datetime ? d.start_datetime.slice(0, 16) : '',
        end_datetime: d.end_datetime ? d.end_datetime.slice(0, 16) : '',
        status: d.status || 'draft',
      })
    } catch {
      setError('No se pudo cargar el sorteo')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await adminAPI.draws.update(unwrappedParams.id, {
        ...form,
        product_id: parseInt(form.product_id, 10),
        price: parseFloat(form.price),
        units: parseInt(form.units, 10),
        max_participations: parseInt(form.max_participations, 10),
      })
      await loadDraw()
      setError('')
    } catch (err) {
      setError(err.message || 'Error al actualizar el sorteo')
    } finally {
      setSaving(false)
    }
  }

  const handleStart = async () => {
    if (!confirm('¿Estás seguro de que quieres iniciar este sorteo?')) return
    setActionLoading(true)
    try {
      await adminAPI.draws.start(unwrappedParams.id)
      await loadDraw()
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el sorteo')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('¿Estás seguro de que quieres cancelar este sorteo?')) return
    setActionLoading(true)
    try {
      await adminAPI.draws.cancel(unwrappedParams.id)
      await loadDraw()
    } catch (err) {
      setError(err.message || 'No se pudo cancelar el sorteo')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando sorteo...</p>
      </div>
    )
  }

  if (!draw) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-red-500">{error || 'Sorteo no encontrado'}</p>
      </div>
    )
  }

  const canEdit = ['draft', 'scheduled'].includes(draw.status)

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Editar sorteo</h1>
          <div className="flex gap-2">
            {draw.status === 'scheduled' && (
              <button onClick={handleStart} disabled={actionLoading} className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                Iniciar
              </button>
            )}
            {['active', 'scheduled', 'draft'].includes(draw.status) && (
              <button onClick={handleCancel} disabled={actionLoading} className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* Status and participation info */}
        <div className="mb-6 rounded-lg border border-gray-200 p-4 space-y-2">
          <p className="text-sm text-gray-500">Estado: <span className="font-medium text-gray-900">{draw.status}</span></p>
          <p className="text-sm text-gray-500">Participantes: <span className="font-medium text-gray-900">{draw.participation_count || 0}/{draw.max_participations}</span></p>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset disabled={!canEdit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre</label>
                <input type="text" name="name" value={form.name} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={3} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">ID del producto</label>
                  <input type="number" name="product_id" value={form.product_id} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo de producto</label>
                  <select name="product_type" value={form.product_type} onChange={handleChange} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50">
                    <option value="art">Arte</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Precio (€)</label>
                  <input type="number" step="0.01" name="price" value={form.price} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unidades</label>
                  <input type="number" name="units" value={form.units} onChange={handleChange} min="1" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max. participantes</label>
                  <input type="number" name="max_participations" value={form.max_participations} onChange={handleChange} min="1" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha inicio</label>
                  <input type="datetime-local" name="start_datetime" value={form.start_datetime} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha fin</label>
                  <input type="datetime-local" name="end_datetime" value={form.end_datetime} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
              </div>
            </div>
          </fieldset>

          {canEdit && (
            <div className="flex gap-4">
              <button type="submit" disabled={saving} className="flex-1 rounded-md bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:bg-gray-400">
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" onClick={() => router.push('/admin/sorteos')} className="flex-1 rounded-md border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                Volver
              </button>
            </div>
          )}

          {!canEdit && (
            <button type="button" onClick={() => router.push('/admin/sorteos')} className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50">
              Volver
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

export default function EditDrawPage({ params }) {
  return (
    <AuthGuard requireRole="admin">
      <EditDrawContent params={params} />
    </AuthGuard>
  )
}
