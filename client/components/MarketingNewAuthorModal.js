'use client'

// Admin modal to manually send the "new author" marketing broadcast.
// Lists visible authors, previews the selected author's data, and triggers the
// send. Warns when an author has already been announced (re-sending is allowed).

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { adminAPI, getAuthorImageUrl } from '@/lib/api'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

export default function MarketingNewAuthorModal({ open, onClose, onSent }) {
  const { showBanner } = useBannerNotification()

  const [authors, setAuthors] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadAuthors = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminAPI.marketing.getAnnounceAuthors()
      setAuthors(res.authors || [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los autores')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setSelectedId('')
      loadAuthors()
    }
  }, [open, loadAuthors])

  const selected = authors.find((a) => String(a.id) === String(selectedId)) || null

  const handleSend = async () => {
    if (!selected) return
    setSubmitting(true)
    setError('')
    try {
      const res = await adminAPI.marketing.announceAuthor(selected.id)
      if (res.skipped) {
        showBanner('El marketing está desactivado en este entorno; no se ha enviado nada.')
      } else {
        showBanner(`Anuncio de "${selected.full_name}" enviado correctamente.`)
      }
      if (onSent) onSent()
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo enviar el anuncio')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-gray-900/40" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between">
            <DialogTitle className="text-lg font-semibold text-gray-900">Anunciar nuevo autor</DialogTitle>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-2 text-sm text-gray-500">
            Se enviará un email al segmento de la newsletter suscrito al topic «Nuevos autores».
          </p>

          <div className="mt-5">
            <label htmlFor="author" className="block text-sm font-medium text-gray-700">Autor</label>
            <select
              id="author"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loading || submitting}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-0"
            >
              <option value="">{loading ? 'Cargando…' : 'Selecciona un autor'}</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}{a.already_announced ? ' (ya anunciado)' : ''}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="mt-5 flex items-center gap-4 rounded-lg border border-gray-200 p-4">
              {selected.profile_img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getAuthorImageUrl(selected.profile_img)}
                  alt={selected.full_name}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400">
                  Sin foto
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{selected.full_name}</p>
                {selected.location && <p className="truncate text-sm text-gray-500">{selected.location}</p>}
                {selected.already_announced && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    Este autor ya fue anunciado anteriormente. Puedes reenviarlo.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-md px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={!selected || submitting}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {submitting ? 'Enviando…' : 'Enviar anuncio'}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
