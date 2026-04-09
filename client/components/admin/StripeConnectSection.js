'use client'

/**
 * StripeConnectSection — Change #1: stripe-connect-accounts
 *
 * Admin sub-section for managing a seller's Stripe Connect connected account.
 * Rendered inside the admin author detail page.
 *
 * Actions exposed:
 *   - Create connected account (idempotent on the backend)
 *   - Generate onboarding link (hosted flow)
 *   - Send onboarding link by email
 *   - Sync status with Stripe
 *
 * The component is fully controlled by the parent via the `seller` prop
 * and calls `onUpdate()` whenever an action mutates the seller record,
 * so the parent can refetch the authoritative state.
 */
import { useState } from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { adminAPI } from '@/lib/api'
import { PUBLIC_BRAND_NAME } from '@/lib/constants'
import { useNotification } from '@/contexts/NotificationContext'
import ConfirmDialog from '@/components/ConfirmDialog'
import StripeConnectLinkModal from '@/components/admin/StripeConnectLinkModal'

// Fields that must all be populated before the backend will allow creating a
// Stripe connected account. Mirrors the check in stripeConnectController.
const REQUIRED_FISCAL_FIELDS = [
  'tax_status',
  'tax_id',
  'fiscal_full_name',
  'fiscal_address_line1',
  'fiscal_address_city',
  'fiscal_address_postal_code',
  'fiscal_address_province',
]

function isFiscalComplete(seller) {
  if (!seller) return false
  return REQUIRED_FISCAL_FIELDS.every((f) => {
    const v = seller[f]
    return v !== null && v !== undefined && String(v).trim() !== ''
  })
}

// Badge definitions keyed by stripe_connect_status.
const STATUS_BADGES = {
  not_started: { label: 'No iniciado', className: 'bg-gray-100 text-gray-800' },
  pending: { label: 'Pendiente de onboarding', className: 'bg-amber-100 text-amber-800' },
  active: { label: 'Activo', className: 'bg-green-100 text-green-800' },
  restricted: { label: 'Restringido', className: 'bg-orange-100 text-orange-800' },
  rejected: { label: 'Rechazado', className: 'bg-red-100 text-red-800' },
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

// Parse requirements_due which is stored as a JSON array string.
function parseRequirements(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function StripeConnectSection({ seller, onUpdate }) {
  const { showSuccess, showApiError } = useNotification()
  const [busy, setBusy] = useState(false)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const [linkModal, setLinkModal] = useState({
    open: false,
    url: '',
    expiresAt: null,
  })

  const accountId = seller?.stripe_connect_account_id || null
  const status = seller?.stripe_connect_status || 'not_started'
  const badge = STATUS_BADGES[status] || STATUS_BADGES.not_started
  const fiscalComplete = isFiscalComplete(seller)
  const requirements = parseRequirements(seller?.stripe_connect_requirements_due)

  const createDisabled = Boolean(accountId) || !fiscalComplete
  const createDisabledReason = !fiscalComplete
    ? 'Completa los datos fiscales del artista antes de crear la cuenta.'
    : accountId
      ? 'La cuenta conectada ya existe.'
      : ''

  async function handleCreate() {
    setConfirmCreate(false)
    setBusy(true)
    try {
      await adminAPI.stripeConnect.createAccount(seller.id)
      showSuccess('Cuenta creada', `Cuenta conectada creada para ${seller.full_name || seller.email}.`)
      onUpdate?.()
    } catch (err) {
      showApiError(err)
    } finally {
      setBusy(false)
    }
  }

  async function handleGenerateLink() {
    setBusy(true)
    try {
      const res = await adminAPI.stripeConnect.generateLink(seller.id)
      // Backend returns { url, expires_at } inside the standard `data` envelope.
      const url = res?.data?.url || res?.url
      const expiresAt = res?.data?.expires_at || res?.expires_at || null
      if (!url) {
        throw new Error('El backend no devolvió una URL de onboarding')
      }
      setLinkModal({ open: true, url, expiresAt })
    } catch (err) {
      showApiError(err)
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    setBusy(true)
    try {
      const res = await adminAPI.stripeConnect.getStatus(seller.id)
      const newStatus = res?.data?.stripe_connect_status || res?.stripe_connect_status || status
      const label = STATUS_BADGES[newStatus]?.label || newStatus
      showSuccess('Estado sincronizado', `Estado actual: ${label}.`)
      onUpdate?.()
    } catch (err) {
      showApiError(err)
    } finally {
      setBusy(false)
    }
  }

  // Fix 17.3 — direct admin action: generate a fresh onboarding link on the
  // backend and email it to the seller in a single click. Lets an admin
  // recover an artist who submitted wrong data during onboarding (the artist
  // can then re-open the hosted flow and fix it) without touching the
  // idempotency key on `v2.core.accounts.create`.
  async function handleSendLinkEmail() {
    setBusy(true)
    try {
      await adminAPI.stripeConnect.sendLinkEmail(seller.id)
      showSuccess(
        'Email enviado',
        `Se envió un nuevo enlace de onboarding a ${seller?.email || 'el artista'}.`
      )
    } catch (err) {
      showApiError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Stripe Connect</h2>
          <p className="mt-1 text-sm text-gray-500">
            Cuenta conectada del artista para recibir transferencias desde {PUBLIC_BRAND_NAME}.
          </p>
        </div>
        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-gray-500" title="ID de la cuenta en Stripe">
            ID cuenta conectada
          </dt>
          <dd className="mt-1 text-sm text-gray-900 font-mono break-all">
            {accountId || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Transferencias habilitadas</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {seller?.stripe_transfers_capability_active ? 'Sí' : 'No'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-gray-500">Última sincronización</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {formatDate(seller?.stripe_connect_last_synced_at)}
          </dd>
        </div>
      </dl>

      {requirements.length > 0 && (
        <div className="mt-6 rounded-md bg-amber-50 p-4">
          <h3 className="text-sm font-medium text-amber-800">Requisitos pendientes</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-700 space-y-1">
            {requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setConfirmCreate(true)}
          disabled={createDisabled || busy}
          title={createDisabledReason}
          className="inline-flex items-center justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          Crear cuenta conectada
        </button>

        {accountId && status !== 'active' && (
          <button
            type="button"
            onClick={handleGenerateLink}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Generar enlace de onboarding
          </button>
        )}

        {accountId && status !== 'active' && status !== 'not_started' && (
          <button
            type="button"
            onClick={handleSendLinkEmail}
            disabled={busy}
            title="Genera un nuevo enlace de onboarding y lo envía por email al artista"
            className="inline-flex items-center justify-center rounded-md bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-xs ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <EnvelopeIcon className="mr-1.5 size-4" aria-hidden="true" />
            Enviar nuevo enlace por email
          </button>
        )}

        {accountId && (
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Sincronizar estado
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmCreate}
        onClose={() => setConfirmCreate(false)}
        onConfirm={handleCreate}
        title="Crear cuenta conectada"
        message={`¿Crear la cuenta de pagos para ${seller?.full_name || seller?.email}? Esta acción registrará una cuenta en Stripe y no puede deshacerse sin contactar a Stripe.`}
        confirmText="Crear cuenta"
        cancelText="Cancelar"
      />

      <StripeConnectLinkModal
        isOpen={linkModal.open}
        onClose={() => setLinkModal({ open: false, url: '', expiresAt: null })}
        url={linkModal.url}
        expiresAt={linkModal.expiresAt}
        sellerEmail={seller?.email || ''}
        sellerId={seller?.id}
      />
    </section>
  )
}
