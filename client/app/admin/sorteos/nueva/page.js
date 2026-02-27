'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'

function CreateDrawContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await adminAPI.draws.create({
        ...form,
        product_id: parseInt(form.product_id, 10),
        price: parseFloat(form.price),
        units: parseInt(form.units, 10),
        max_participations: parseInt(form.max_participations, 10),
      })
      router.push('/admin/sorteos')
    } catch (err) {
      setError(err.message || 'Error al crear el sorteo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">Nuevo sorteo</h1>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Descripción</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={3} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">ID del producto</label>
              <input type="number" name="product_id" value={form.product_id} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Tipo de producto</label>
              <select name="product_type" value={form.product_type} onChange={handleChange} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="art">Arte</option>
                <option value="other">Otro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Precio (€)</label>
              <input type="number" step="0.01" name="price" value={form.price} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Unidades</label>
              <input type="number" name="units" value={form.units} onChange={handleChange} min="1" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Max. participantes</label>
              <input type="number" name="max_participations" value={form.max_participations} onChange={handleChange} min="1" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha inicio</label>
              <input type="datetime-local" name="start_datetime" value={form.start_datetime} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha fin</label>
              <input type="datetime-local" name="end_datetime" value={form.end_datetime} onChange={handleChange} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Estado inicial</label>
            <select name="status" value={form.status} onChange={handleChange} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="draft">Borrador</option>
              <option value="scheduled">Programado</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button type="submit" disabled={loading} className="flex-1 rounded-md bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:bg-gray-400">
              {loading ? 'Creando...' : 'Crear sorteo'}
            </button>
            <button type="button" onClick={() => router.push('/admin/sorteos')} className="flex-1 rounded-md border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CreateDrawPage() {
  return (
    <AuthGuard requireRole="admin">
      <CreateDrawContent />
    </AuthGuard>
  )
}
