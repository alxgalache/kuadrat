'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { adminAPI, getAuthorImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useNotification } from '@/contexts/NotificationContext'
import { PencilIcon, EyeIcon, PlusIcon, EnvelopeIcon, KeyIcon } from '@heroicons/react/20/solid'

function AdminPageContent() {
  const [authors, setAuthors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resendingFor, setResendingFor] = useState(null)
  const [resettingFor, setResettingFor] = useState(null)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkSending, setBulkSending] = useState(false)
  const { showSuccess, showError, showApiError } = useNotification()

  const activatedCount = authors.filter((a) => a.is_activated).length

  useEffect(() => {
    loadAuthors()
  }, [])

  const loadAuthors = async () => {
    try {
      const data = await adminAPI.authors.getAll()
      setAuthors(data.authors)
    } catch (err) {
      setError('No se pudieron cargar los autores')
      console.error('Error loading authors:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleResendInvitation = async (authorId, e) => {
    e.preventDefault()
    e.stopPropagation()

    if (resendingFor) return

    setResendingFor(authorId)
    try {
      await adminAPI.authors.resendInvitation(authorId)
      showSuccess('Enviado', 'Se ha reenviado el email de invitación')
    } catch (err) {
      showApiError(err)
    } finally {
      setResendingFor(null)
    }
  }

  const handleSendPasswordReset = async (authorId, e) => {
    e.preventDefault()
    e.stopPropagation()

    if (resettingFor) return

    setResettingFor(authorId)
    try {
      await adminAPI.authors.sendPasswordReset(authorId)
      showSuccess('Enviado', 'Se ha enviado el email para cambiar la contraseña')
    } catch (err) {
      showApiError(err)
    } finally {
      setResettingFor(null)
    }
  }

  const handleSendPasswordResetAll = async () => {
    setBulkDialogOpen(false)
    if (bulkSending) return

    setBulkSending(true)
    try {
      const result = await adminAPI.authors.sendPasswordResetAll()

      if (result.failed > 0) {
        // The failed addresses go in the `errors` list so the admin can retry
        // those one by one with the individual button.
        showError(
          'Envío incompleto',
          `Se han enviado ${result.sent} de ${result.total} emails. Reenvía los siguientes de forma individual:`,
          result.failedEmails
        )
      } else {
        showSuccess('Enviado', `Se han enviado ${result.sent} de ${result.total} emails`)
      }
    } catch (err) {
      showApiError(err)
    } finally {
      setBulkSending(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando autores...</p>
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
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Autores</h1>
            <p className="mt-2 text-sm text-gray-700">
              Gestiona los autores y sus productos
            </p>
          </div>
          <div className="flex items-center gap-x-3">
            {activatedCount > 0 && (
              <button
                type="button"
                onClick={() => setBulkDialogOpen(true)}
                disabled={bulkSending}
                className="inline-flex items-center gap-x-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                <KeyIcon className="size-5 text-gray-400" aria-hidden="true" />
                {bulkSending ? 'Enviando...' : 'Enviar cambio de contraseña a todos'}
              </button>
            )}
            <Link
              href="/admin/autores/nuevo"
              className="inline-flex items-center gap-x-2 rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              <PlusIcon className="size-5" aria-hidden="true" />
              Nuevo autor
            </Link>
          </div>
        </div>

        <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {authors.map((author) => (
            <li
              key={author.id}
              className={`col-span-1 flex flex-col divide-y divide-gray-200 rounded-lg bg-white text-center shadow ring-1 ${
                author.is_activated ? 'ring-black ring-opacity-5' : 'ring-amber-400 ring-opacity-50'
              }`}
            >
              <div className="flex flex-1 flex-col p-8 relative">
                {/* Non-activated indicator */}
                {!author.is_activated && (
                  <div className="absolute top-2 right-2">
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                      Pendiente
                    </span>
                  </div>
                )}
                <Image
                  alt={author.full_name || author.email}
                  src={author.profile_img ? getAuthorImageUrl(author.profile_img) : `https://ui-avatars.com/api/?name=${encodeURIComponent(author.full_name || author.email)}&background=random&size=128`}
                  width={128}
                  height={128}
                  className={`mx-auto size-32 shrink-0 rounded-full ${!author.is_activated ? 'opacity-60' : ''}`}
                />
                <h3 className="mt-6 text-sm font-medium text-gray-900">{author.full_name || author.email}</h3>
                {!author.is_activated && (
                  <p className="mt-1 text-xs text-amber-600">No ha configurado su contraseña</p>
                )}
              </div>
              <div>
                <div className="-mt-px flex divide-x divide-gray-200">
                  <div className="flex w-0 flex-1">
                    <Link
                      href={`/admin/authors/${author.id}`}
                      className="relative -mr-px inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-bl-lg border border-transparent py-4 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      <EyeIcon aria-hidden="true" className="size-5 text-gray-400" />
                      Ver
                    </Link>
                  </div>
                  {!author.is_activated ? (
                    // Never activated: the invitation is what they need, not a
                    // password reset — they have no password to reset.
                    <div className="-ml-px flex w-0 flex-1">
                      <button
                        onClick={(e) => handleResendInvitation(author.id, e)}
                        disabled={resendingFor === author.id}
                        className="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-br-lg border border-transparent py-4 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        <EnvelopeIcon aria-hidden="true" className="size-5 text-amber-500" />
                        {resendingFor === author.id ? 'Enviando...' : 'Reenviar'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="-ml-px flex w-0 flex-1">
                        <Link
                          href={`/admin/authors/${author.id}/edit`}
                          className="relative inline-flex w-0 flex-1 items-center justify-center gap-x-2 border border-transparent py-4 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                        >
                          <PencilIcon aria-hidden="true" className="size-5 text-gray-400" />
                          Editar
                        </Link>
                      </div>
                      <div className="-ml-px flex w-0 flex-1">
                        <button
                          onClick={(e) => handleSendPasswordReset(author.id, e)}
                          disabled={resettingFor === author.id}
                          title="Enviar al artista un enlace para cambiar su contraseña"
                          className="relative inline-flex w-0 flex-1 items-center justify-center gap-x-2 rounded-br-lg border border-transparent py-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <KeyIcon aria-hidden="true" className="size-5 text-gray-400" />
                          {resettingFor === author.id ? 'Enviando...' : 'Contraseña'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {authors.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay autores disponibles</p>
          </div>
        )}
      </div>

      {/* Issuing a new link overwrites the previous one, so a second click
          kills any link the artists are holding. That has to be said out loud
          before the request goes out. */}
      <ConfirmDialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        onConfirm={handleSendPasswordResetAll}
        title="Enviar cambio de contraseña a todos los artistas"
        message={`Se enviará un email a los ${activatedCount} artistas que ya tienen contraseña configurada, con un enlace válido durante 24 horas. Cualquier enlace enviado anteriormente dejará de funcionar.`}
        confirmText="Enviar a todos"
        cancelText="Cancelar"
        type="warning"
      />
    </div>
  )
}

export default function AdminPage() {
  return (
    <AuthGuard requireRole="admin">
      <AdminPageContent />
    </AuthGuard>
  )
}
