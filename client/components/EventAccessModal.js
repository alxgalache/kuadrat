'use client'

import { useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { eventsAPI } from '@/lib/api'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

const PHASE = {
  REGISTER: 'register',
  PAYMENT: 'payment',
  SUCCESS: 'success',
}

/**
 * Modal for registering to access an event.
 * Free events: name + email -> success.
 * Paid events: name + email -> Stripe payment -> success.
 */
export default function EventAccessModal({ isOpen, onClose, event, onAccessGranted }) {
  const [phase, setPhase] = useState(PHASE.REGISTER)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [termsClicked, setTermsClicked] = useState(() => {
    try {
      return localStorage.getItem('event_terms_read') === 'true'
    } catch { return false }
  })
  const [termsAccepted, setTermsAccepted] = useState(false)

  const [attendeeId, setAttendeeId] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)

  const isPaid = event?.access_type === 'paid'

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Todos los campos son obligatorios')
      return
    }

    if (!termsClicked) {
      setError('Debes abrir y leer las normas de participación antes de continuar')
      return
    }

    if (!termsAccepted) {
      setError('Debes aceptar las normas de participación')
      return
    }

    setLoading(true)
    setError('')

    try {
      const data = await eventsAPI.register(event.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
      })

      setAttendeeId(data.attendee.id)

      if (data.accessToken) {
        setAccessToken(data.accessToken)
      }

      const nameInfo = { firstName: firstName.trim(), lastName: lastName.trim() }

      // For returning attendees, we check if they already have access
      if (data.isExisting && data.attendee.status === 'paid') {
        // Already paid, grant access directly
        storeSession(event.id, { attendeeId: data.attendee.id, accessToken: getStoredSession(event.id)?.accessToken, ...nameInfo })
        onAccessGranted?.({ attendeeId: data.attendee.id, accessToken: getStoredSession(event.id)?.accessToken })
        setPhase(PHASE.SUCCESS)
        setLoading(false)
        return
      }

      if (isPaid) {
        // Create payment intent
        const payData = await eventsAPI.pay(event.id, data.attendee.id)
        setClientSecret(payData.clientSecret)
        // Store session with accessToken (if new)
        if (data.accessToken) {
          storeSession(event.id, { attendeeId: data.attendee.id, accessToken: data.accessToken, ...nameInfo })
        }
        setPhase(PHASE.PAYMENT)
      } else {
        // Free event - store and grant access
        if (data.accessToken) {
          storeSession(event.id, { attendeeId: data.attendee.id, accessToken: data.accessToken, ...nameInfo })
        }
        onAccessGranted?.({ attendeeId: data.attendee.id, accessToken: data.accessToken || getStoredSession(event.id)?.accessToken })
        setPhase(PHASE.SUCCESS)
      }
    } catch (err) {
      setError(err.message || 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentSuccess = () => {
    const session = getStoredSession(event.id)
    onAccessGranted?.({ attendeeId: session?.attendeeId || attendeeId, accessToken: session?.accessToken || accessToken })
    setPhase(PHASE.SUCCESS)
  }

  const handleClose = () => {
    setPhase(PHASE.REGISTER)
    setFirstName('')
    setLastName('')
    setEmail('')
    setError('')
    setTermsAccepted(false)
    setClientSecret(null)
    onClose()
  }

  const renderRegister = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {isPaid
          ? `Introduce tus datos para acceder a este evento. El precio es ${event.price} ${event.currency}.`
          : 'Introduce tus datos para acceder a este evento.'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
            Nombre *
          </label>
          <input
            type="text"
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
            Apellido *
          </label>
          <input
            type="text"
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm sm:text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email *
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm sm:text-sm"
        />
      </div>

      <div className="flex items-start gap-x-2">
        <input
          type="checkbox"
          id="termsAccepted"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
        />
        <label htmlFor="termsAccepted" className="text-sm text-gray-600">
          Acepto las{' '}
          <a
            href="/legal/normas-eventos"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              setTermsClicked(true)
              try { localStorage.setItem('event_terms_read', 'true') } catch {}
            }}
            className="font-medium text-gray-900 underline hover:text-gray-700"
          >
            normas y términos para la participación en eventos en directo
          </a>
          {' '}(lectura obligatoria)
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleRegister}
        disabled={loading}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Registrando...' : isPaid ? 'Continuar al pago' : 'Acceder al evento'}
      </button>
    </div>
  )

  const renderPayment = () => {
    if (!clientSecret) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          <span className="ml-2 text-sm text-gray-600">Preparando el pago...</span>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Completa el pago de {event.price} {event.currency} para acceder al evento.
        </p>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <StripeEventPayment
            eventId={event.id}
            attendeeId={attendeeId}
            onSuccess={handlePaymentSuccess}
            onError={(msg) => setError(msg)}
          />
        </Elements>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  const renderSuccess = () => (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-900">
        {isPaid ? 'Pago completado' : 'Registro completado'}
      </p>
      <p className="text-sm text-gray-600">
        Ya puedes acceder al evento cuando comience.
      </p>
      <button
        type="button"
        onClick={handleClose}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
      >
        Cerrar
      </button>
    </div>
  )

  const titles = {
    [PHASE.REGISTER]: 'Acceder al evento',
    [PHASE.PAYMENT]: 'Pago',
    [PHASE.SUCCESS]: isPaid ? 'Pago completado' : 'Registro completado',
  }

  const renderContent = {
    [PHASE.REGISTER]: renderRegister,
    [PHASE.PAYMENT]: renderPayment,
    [PHASE.SUCCESS]: renderSuccess,
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-md sm:p-6"
          >
            <div className="absolute right-0 top-0 pr-4 pt-4">
              <button type="button" onClick={handleClose} className="rounded-md bg-white text-gray-400 hover:text-gray-500">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <DialogTitle as="h3" className="text-lg font-semibold text-gray-900 mb-4">
              {titles[phase]}
            </DialogTitle>

            {renderContent[phase]?.()}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Stripe Payment sub-component
// ---------------------------------------------------------------------------
function StripeEventPayment({ eventId, attendeeId, onSuccess, onError }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    onError('')
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })

      if (stripeError) {
        onError(stripeError.message)
        setLoading(false)
        return
      }

      if (paymentIntent && paymentIntent.status === 'succeeded') {
        await eventsAPI.confirmPayment(eventId, attendeeId, paymentIntent.id)
        onSuccess()
      } else {
        onError('El pago no se pudo completar. Inténtalo de nuevo.')
      }
    } catch (err) {
      onError(err.message || 'Error al procesar el pago.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Procesando...' : 'Pagar'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getStoredSession(eventId) {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`event_attendee_${eventId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function storeSession(eventId, session) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`event_attendee_${eventId}`, JSON.stringify(session))
  } catch {
    // Silently ignore
  }
}
