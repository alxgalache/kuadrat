'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { adminAPI } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'

function NewEventPageContent() {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDatetime, setEventDatetime] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [hostUserId, setHostUserId] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [accessType, setAccessType] = useState('free')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [format, setFormat] = useState('live')
  const [contentType, setContentType] = useState('streaming')
  const [category, setCategory] = useState('charla')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoSource, setVideoSource] = useState('url') // 'url' or 'file'
  const [videoFile, setVideoFile] = useState(null)
  const [maxAttendees, setMaxAttendees] = useState('')
  const [status, setStatus] = useState('draft')

  const [sellers, setSellers] = useState([])
  const [loadingSellers, setLoadingSellers] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSellers()
  }, [])

  const loadSellers = async () => {
    try {
      const data = await adminAPI.authors.getAll()
      setSellers(data.authors || [])
    } catch (err) {
      console.error('Error loading sellers:', err)
    } finally {
      setLoadingSellers(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!title || !eventDatetime || !hostUserId || !category) {
      setError('Título, fecha, host y categoría son obligatorios')
      return
    }

    if (accessType === 'paid' && (!price || parseFloat(price) <= 0)) {
      setError('Los eventos de pago requieren un precio válido')
      return
    }

    setSaving(true)

    try {
      const result = await adminAPI.events.create({
        title,
        description,
        event_datetime: eventDatetime,
        duration_minutes: parseInt(durationMinutes, 10),
        host_user_id: parseInt(hostUserId, 10),
        cover_image_url: coverImageUrl || null,
        access_type: accessType,
        price: accessType === 'paid' ? parseFloat(price) : null,
        currency,
        format,
        content_type: contentType,
        category,
        video_url: (format === 'video' && videoSource === 'url') ? (videoUrl || null) : null,
        max_attendees: maxAttendees ? parseInt(maxAttendees, 10) : null,
        status,
      })

      // Upload video file if selected
      if (format === 'video' && videoSource === 'file' && videoFile && result.event?.id) {
        setUploading(true)
        await adminAPI.events.uploadVideo(result.event.id, videoFile)
      }

      router.push('/admin/espacios')
    } catch (err) {
      setError(err.message || 'No se pudo crear el evento')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link
            href="/admin/espacios"
            className="inline-flex items-center gap-x-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a eventos
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">
          Nuevo evento
        </h1>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* General Information */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Información general</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                  Título *
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Descripción
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                    Categoría *
                  </label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                  >
                    <option value="masterclass">Masterclass</option>
                    <option value="charla">Charla</option>
                    <option value="entrevista">Entrevista</option>
                    <option value="ama">AMA</option>
                    <option value="video">Video</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                    Estado
                  </label>
                  <select
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                  >
                    <option value="draft">Borrador</option>
                    <option value="scheduled">Programado</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Date & Time */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Fecha y hora</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="event_datetime" className="block text-sm font-medium text-gray-700">
                  Fecha y hora *
                </label>
                <input
                  type="datetime-local"
                  id="event_datetime"
                  value={eventDatetime}
                  onChange={(e) => setEventDatetime(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                  required
                />
              </div>

              <div>
                <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                  Duración (minutos)
                </label>
                <input
                  type="number"
                  id="duration"
                  min="15"
                  max="480"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                />
              </div>
            </div>
          </div>

          {/* Host */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Host</h2>

            <div>
              <label htmlFor="host" className="block text-sm font-medium text-gray-700">
                Seleccionar host (autor) *
              </label>
              {loadingSellers ? (
                <p className="mt-1 text-sm text-gray-500">Cargando autores...</p>
              ) : (
                <select
                  id="host"
                  value={hostUserId}
                  onChange={(e) => setHostUserId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.full_name} ({seller.email})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Format & Content */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Formato</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="format" className="block text-sm font-medium text-gray-700">
                  Formato
                </label>
                <select
                  id="format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                >
                  <option value="live">En directo</option>
                  <option value="video">Vídeo pregrabado</option>
                </select>
              </div>

              <div>
                <label htmlFor="contentType" className="block text-sm font-medium text-gray-700">
                  Tipo de contenido
                </label>
                <select
                  id="contentType"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                >
                  <option value="streaming">Streaming</option>
                  <option value="video">Vídeo</option>
                </select>
              </div>
            </div>

            {format === 'video' && (
              <div className="mt-4 space-y-3">
                <fieldset>
                  <legend className="block text-sm font-medium text-gray-700">Origen del vídeo</legend>
                  <div className="mt-2 flex gap-x-6">
                    <label className="flex items-center gap-x-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="videoSource"
                        value="url"
                        checked={videoSource === 'url'}
                        onChange={() => setVideoSource('url')}
                        className="h-4 w-4 border-gray-300 text-gray-900 focus:ring-black"
                      />
                      URL del vídeo
                    </label>
                    <label className="flex items-center gap-x-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="videoSource"
                        value="file"
                        checked={videoSource === 'file'}
                        onChange={() => setVideoSource('file')}
                        className="h-4 w-4 border-gray-300 text-gray-900 focus:ring-black"
                      />
                      Subir archivo
                    </label>
                  </div>
                </fieldset>

                {videoSource === 'url' ? (
                  <div key="video-url">
                    <input
                      type="url"
                      id="videoUrl"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://..."
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                    />
                  </div>
                ) : (
                  <div key="video-file">
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-gray-700"
                    />
                    <p className="mt-1 text-xs text-gray-500">MP4, WebM o MOV. Máximo 500 MB.</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="coverImageUrl" className="block text-sm font-medium text-gray-700">
                URL de imagen de portada
              </label>
              <input
                type="url"
                id="coverImageUrl"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
              />
            </div>
          </div>

          {/* Access & Pricing */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Acceso y precio</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="accessType" className="block text-sm font-medium text-gray-700">
                  Tipo de acceso
                </label>
                <select
                  id="accessType"
                  value={accessType}
                  onChange={(e) => setAccessType(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                >
                  <option value="free">Gratis</option>
                  <option value="paid">De pago</option>
                </select>
              </div>

              {accessType === 'paid' && (
                <>
                  <div>
                    <label htmlFor="price" className="block text-sm font-medium text-gray-700">
                      Precio *
                    </label>
                    <input
                      type="number"
                      id="price"
                      min="0.01"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      El precio introducido incluye un IVA del 21%.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="currency" className="block text-sm font-medium text-gray-700">
                      Moneda
                    </label>
                    <select
                      id="currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
                    >
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4">
              <label htmlFor="maxAttendees" className="block text-sm font-medium text-gray-700">
                Asistentes máximos (dejar vacío para ilimitado)
              </label>
              <input
                type="number"
                id="maxAttendees"
                min="1"
                value={maxAttendees}
                onChange={(e) => setMaxAttendees(e.target.value)}
                className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black sm:text-sm/6"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-x-4">
            <Link
              href="/admin/espacios"
              className="text-sm font-semibold text-gray-900 hover:text-gray-600"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving || uploading}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {uploading ? 'Subiendo vídeo...' : saving ? 'Guardando...' : 'Crear evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NewEventPage() {
  return (
    <AuthGuard requireRole="admin">
      <NewEventPageContent />
    </AuthGuard>
  )
}
