'use client'

import { useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { COA_TAG_STATUSES } from '@/lib/constants'

const STATUS_OPTIONS = ['active', 'revoked', 'lost', 'damaged']
const MIN_NOTES_LENGTH = 10

export default function CoaStatusModal({ tag, isOpen, onClose, onSuccess }) {
  const [status, setStatus] = useState(tag?.status || 'active')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setStatus(tag?.status || 'active')
      setNotes('')
      setError('')
      setValidationError('')
      setSubmitting(false)
    }
  }, [isOpen, tag])

  if (!isOpen || !tag) return null

  const statusChanged = status !== tag.status
  const trimmedNotes = notes.trim()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setValidationError('')
    setError('')

    if (statusChanged && trimmedNotes.length < MIN_NOTES_LENGTH) {
      setValidationError(
        `Las notas son obligatorias al cambiar el estado (≥${MIN_NOTES_LENGTH} caracteres).`,
      )
      return
    }

    setSubmitting(true)
    try {
      const payload = { status }
      if (trimmedNotes) payload.notes = trimmedNotes
      const result = await adminAPI.coa.updateStatus(tag.uid, payload)
      onSuccess?.(result)
      onClose?.()
    } catch (err) {
      console.error('Error updating tag status:', err)
      setError(err.message || 'No se pudo actualizar el estado.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coa-status-modal-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <form onSubmit={handleSubmit}>
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 id="coa-status-modal-title" className="text-lg font-semibold text-gray-900">
              Cambiar estado de la etiqueta
            </h2>
            <p className="mt-1 text-xs font-mono text-gray-500 break-all">{tag.uid}</p>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div>
              <label htmlFor="coa-modal-status" className="block text-sm font-medium text-gray-900">
                Estado
              </label>
              <select
                id="coa-modal-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 bg-white py-2 pl-3 pr-10 text-sm shadow-sm focus:border-gray-900 focus:ring-gray-900"
                disabled={submitting}
              >
                {STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {COA_TAG_STATUSES[value]?.label || value}
                    {value === tag.status ? ' (actual)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="coa-modal-notes" className="block text-sm font-medium text-gray-900">
                Notas / motivo {statusChanged && <span className="text-red-600">*</span>}
              </label>
              <textarea
                id="coa-modal-notes"
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  statusChanged
                    ? 'Obligatorio al cambiar el estado. Describe el motivo (caso, incidencia, contexto).'
                    : 'Opcional. Si dejas vacío, la operación es idempotente y no se añade nada al historial.'
                }
                className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 text-sm shadow-sm focus:border-gray-900 focus:ring-gray-900"
                disabled={submitting}
              />
              {statusChanged && (
                <p className="mt-1 text-xs text-gray-500">
                  Mínimo {MIN_NOTES_LENGTH} caracteres.
                </p>
              )}
            </div>

            {validationError && (
              <div className="rounded-md bg-amber-50 p-3">
                <p className="text-sm text-amber-800">{validationError}</p>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {submitting ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
