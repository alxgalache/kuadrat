'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { adminAPI, getAuthorImageUrl } from '@/lib/api'
import AuthGuard from '@/components/AuthGuard'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useNotification } from '@/contexts/NotificationContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  PencilIcon,
  EyeIcon,
  PlusIcon,
  EnvelopeIcon,
  KeyIcon,
  ChevronDownIcon,
  UserIcon,
} from '@heroicons/react/20/solid'
import {
  AUTHOR_ACTIONS_COPY,
  IMPERSONATION_COPY,
  IMPERSONATION_ERRORS,
  IMPERSONATION_GENERIC_ERROR,
  PASSWORD_RESET_CONFIRM_COPY,
} from '@/lib/constants'

// How an artist is named in a dialog. Falls back to the email, and to a
// neutral noun while the dialog is closing and the author state is already
// null — otherwise the title would flash "Impersonar a undefined" on the way out.
const authorLabel = (author) => author?.full_name || author?.email || 'este artista'

function AdminPageContent() {
  const [authors, setAuthors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resendingFor, setResendingFor] = useState(null)
  const [resettingFor, setResettingFor] = useState(null)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkSending, setBulkSending] = useState(false)
  // The artist a confirmation dialog is currently about, or null.
  const [passwordDialogAuthor, setPasswordDialogAuthor] = useState(null)
  const [impersonateDialogAuthor, setImpersonateDialogAuthor] = useState(null)
  const [impersonating, setImpersonating] = useState(false)
  const { showSuccess, showError, showApiError } = useNotification()
  const { startImpersonation } = useAuth()

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

  // Confirmed from the dialog, never straight from the menu: issuing a new link
  // silently kills whatever link the artist is already holding, which is the
  // same irreversible side effect the bulk action has always warned about.
  const handleSendPasswordReset = async () => {
    const author = passwordDialogAuthor
    setPasswordDialogAuthor(null)
    if (!author || resettingFor) return

    setResettingFor(author.id)
    try {
      await adminAPI.authors.sendPasswordReset(author.id)
      showSuccess('Enviado', 'Se ha enviado el email para cambiar la contraseña')
    } catch (err) {
      showApiError(err)
    } finally {
      setResettingFor(null)
    }
  }

  // Swap this admin session for the artist's and land where a real login lands.
  //
  // A hard navigation, not router.push: the impersonated app must boot from
  // scratch. A client-side push keeps the React tree mounted, so every
  // component still holding data fetched as the admin would survive into a
  // session that is supposed to be indistinguishable from the artist's own —
  // and this page is behind AuthGuard requireRole="admin", which would race to
  // redirect the moment the role changes.
  const handleImpersonate = async () => {
    const author = impersonateDialogAuthor
    setImpersonateDialogAuthor(null)
    if (!author || impersonating) return

    setImpersonating(true)
    try {
      await startImpersonation(author.id)
      window.location.href = '/galeria'
    } catch (err) {
      setImpersonating(false)
      showError(
        'No se ha podido impersonar',
        IMPERSONATION_ERRORS[err?.title] || err?.message || IMPERSONATION_GENERIC_ERROR
      )
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
              {/* One "Acciones" menu instead of a row of buttons: four
                  side-by-side actions no longer fit on a card, and a row of
                  truncated buttons is how an admin clicks the wrong one.
                  `anchor` portals the panel, so the card's rounded overflow
                  cannot clip it.

                  Rendered as a plain div and as a DIRECT child of the <li>,
                  because the divider above it comes from the li's `divide-y`,
                  which only draws between direct children. */}
              <Menu as="div" className="-mt-px">
                  <MenuButton className="inline-flex w-full items-center justify-center gap-x-2 rounded-b-lg border border-transparent py-4 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                    {AUTHOR_ACTIONS_COPY.trigger}
                    <ChevronDownIcon aria-hidden="true" className="size-5 text-gray-400" />
                  </MenuButton>

                  <MenuItems
                    transition
                    anchor="bottom end"
                    className="z-50 w-56 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 transition data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[enter]:ease-out data-[leave]:duration-75 data-[leave]:ease-in [--anchor-gap:4px]"
                  >
                    <MenuItem>
                      <Link
                        href={`/admin/authors/${author.id}`}
                        className="flex items-center gap-x-3 px-4 py-2 text-sm text-gray-900 data-[focus]:bg-gray-50"
                      >
                        <EyeIcon aria-hidden="true" className="size-5 text-gray-400" />
                        {AUTHOR_ACTIONS_COPY.view}
                      </Link>
                    </MenuItem>

                    {!author.is_activated ? (
                      // Never activated: the invitation is what they need, not
                      // a password reset — they have no password to reset, and
                      // no session for an impersonation to reproduce.
                      <MenuItem>
                        <button
                          type="button"
                          onClick={(e) => handleResendInvitation(author.id, e)}
                          disabled={resendingFor === author.id}
                          className="flex w-full items-center gap-x-3 px-4 py-2 text-left text-sm text-amber-700 data-[focus]:bg-amber-50 disabled:opacity-50"
                        >
                          <EnvelopeIcon aria-hidden="true" className="size-5 text-amber-500" />
                          {resendingFor === author.id ? 'Enviando...' : AUTHOR_ACTIONS_COPY.resend}
                        </button>
                      </MenuItem>
                    ) : (
                      <>
                        <MenuItem>
                          <Link
                            href={`/admin/authors/${author.id}/edit`}
                            className="flex items-center gap-x-3 px-4 py-2 text-sm text-gray-900 data-[focus]:bg-gray-50"
                          >
                            <PencilIcon aria-hidden="true" className="size-5 text-gray-400" />
                            {AUTHOR_ACTIONS_COPY.edit}
                          </Link>
                        </MenuItem>
                        <MenuItem>
                          <button
                            type="button"
                            onClick={() => setPasswordDialogAuthor(author)}
                            disabled={resettingFor === author.id}
                            className="flex w-full items-center gap-x-3 px-4 py-2 text-left text-sm text-gray-900 data-[focus]:bg-gray-50 disabled:opacity-50"
                          >
                            <KeyIcon aria-hidden="true" className="size-5 text-gray-400" />
                            {resettingFor === author.id ? 'Enviando...' : AUTHOR_ACTIONS_COPY.password}
                          </button>
                        </MenuItem>
                        <MenuItem>
                          <button
                            type="button"
                            onClick={() => setImpersonateDialogAuthor(author)}
                            disabled={impersonating}
                            className="flex w-full items-center gap-x-3 px-4 py-2 text-left text-sm text-gray-900 data-[focus]:bg-gray-50 disabled:opacity-50"
                          >
                            <UserIcon aria-hidden="true" className="size-5 text-gray-400" />
                            {AUTHOR_ACTIONS_COPY.impersonate}
                          </button>
                        </MenuItem>
                      </>
                    )}
                  </MenuItems>
              </Menu>
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

      {/* Same irreversible side effect as the bulk action, one artist at a
          time: the new link kills whatever link they are already holding.
          Until now a single click sent that email with no way back. */}
      <ConfirmDialog
        open={!!passwordDialogAuthor}
        onClose={() => setPasswordDialogAuthor(null)}
        onConfirm={handleSendPasswordReset}
        title={PASSWORD_RESET_CONFIRM_COPY.title(authorLabel(passwordDialogAuthor))}
        message={PASSWORD_RESET_CONFIRM_COPY.message(authorLabel(passwordDialogAuthor))}
        confirmText={PASSWORD_RESET_CONFIRM_COPY.confirmText}
        cancelText="Cancelar"
        type="warning"
      />

      {/* Entering someone's account is not something to do by accident: the
          dialog names whose account it is and states the 60-minute limit. */}
      <ConfirmDialog
        open={!!impersonateDialogAuthor}
        onClose={() => setImpersonateDialogAuthor(null)}
        onConfirm={handleImpersonate}
        title={IMPERSONATION_COPY.confirmTitle(authorLabel(impersonateDialogAuthor))}
        message={IMPERSONATION_COPY.confirmMessage(authorLabel(impersonateDialogAuthor))}
        confirmText={IMPERSONATION_COPY.confirmText}
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
