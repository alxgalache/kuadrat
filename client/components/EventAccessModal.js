'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { eventsAPI } from '@/lib/api'
import { getStripePromise, prefetchStripe } from '@/lib/stripe'
import { storeSession } from '@/lib/eventSession'
import { ACCESS_VERIFICATION_ERRORS, EVENT_VERIFICATION_COPY } from '@/lib/constants'
import EventVerificationMethods from '@/components/EventVerificationMethods'

const PHASE = {
  CHOOSE: 'choose',
  METHOD: 'method',
  REGISTER: 'register',
  VERIFY_EMAIL: 'verify_email',
  COMPLETING: 'completing',
  VERIFY_PASSWORD: 'verify_password',
  PAYMENT: 'payment',
  SUCCESS: 'success',
}

/**
 * Modal for registering to access an event.
 * Flow: CHOOSE -> METHOD -> REGISTER -> VERIFY_EMAIL -> PAYMENT (paid) -> SUCCESS
 *   or: CHOOSE -> METHOD -> (Google / Microsoft, full-page) … back with #acceso
 *       -> COMPLETING -> PAYMENT (paid) -> SUCCESS
 *   or: CHOOSE -> VERIFY_PASSWORD -> direct access
 *
 * METHOD (event-identity-provider-verification) holds the terms checkbox for
 * all three methods. A provider return reopens the modal through `resume`
 * (read by EventDetail from the URL fragment): COMPLETING redeems the proof the
 * API left in an HttpOnly cookie, through the same verification as the code.
 *
 * The session is written to localStorage ONLY once access is actually granted
 * — after verify-email or identity/complete for a free event, after
 * confirm-payment for a paid one, after verify-password. /register issues no
 * credential: the access token is born in the verification (enforce-
 * verification-gates). Storing anything earlier is what made a reload during
 * VERIFY_EMAIL read as «Ya tienes acceso».
 */

// The enabled providers, fetched once per page and shared by every opening.
// A failure is not cached: the next opening asks again.
let providersPromise = null
function loadIdentityProviders() {
  if (!providersPromise) {
    providersPromise = eventsAPI.identityProviders()
      .then((data) => (Array.isArray(data?.providers) ? data.providers : []))
      .catch(() => {
        providersPromise = null
        return []
      })
  }
  return providersPromise
}

/** es-ES text for an API error, by the machine code the API puts in `title`. */
const errorText = (err, fallback) =>
  ACCESS_VERIFICATION_ERRORS[err?.title] || err?.message || fallback
/**
 * @param {{ kind: 'complete' } | { kind: 'error', code: string } | { kind: 'open' } | null} resume
 *   how to open after a Google / Microsoft return or a copied #acceder link
 *   (client/lib/eventAccessFragment.js); null opens on CHOOSE as always.
 */
export default function EventAccessModal({ isOpen, onClose, event, onAccessGranted, resume = null }) {
  const [phase, setPhase] = useState(PHASE.CHOOSE)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  // Informational line over the email form (not an error): a provider account
  // whose mailbox the provider does not own falls back to the code.
  const [registerNotice, setRegisterNotice] = useState('')
  // The verified address, shown on PAYMENT and SUCCESS: with several methods,
  // the attendee may not know which email Google or Microsoft used.
  const [verifiedEmail, setVerifiedEmail] = useState('')
  const [providers, setProviders] = useState(null)
  const completionStartedRef = useRef(false)

  const [attendeeId, setAttendeeId] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [savedPassword, setSavedPassword] = useState(null)

  // Email verification OTP
  const [otpCode, setOtpCode] = useState('')
  const [showResend, setShowResend] = useState(false)
  // Informational line on the code step (not an error: e.g. a code was
  // already sent a few seconds ago and is still valid)
  const [otpNotice, setOtpNotice] = useState('')
  const resendTimerRef = useRef(null)

  // Password verification (returning attendees)
  const [verifyEmail, setVerifyEmail] = useState('')
  const [verifyPasswordValue, setVerifyPasswordValue] = useState('')

  const isPaid = event?.access_type === 'paid'

  // Adelanta Stripe.js en cuanto se abre el modal. Desde que lib/stripe.js
  // importa `@stripe/stripe-js/pure`, el script ya no viaja en todas las
  // páginas del sitio: se pide aquí, varios pasos antes de que <Elements>
  // tenga que pintarse.
  useEffect(() => {
    if (isOpen) prefetchStripe()
  }, [isOpen])

  // The verification methods, asked for as soon as the modal opens: by the
  // time «Registrarme en el evento» is pressed they are usually there.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    loadIdentityProviders().then((list) => { if (!cancelled) setProviders(list) })
    return () => { cancelled = true }
  }, [isOpen])

  // Reset when modal opens — on CHOOSE, or where a provider return says.
  useEffect(() => {
    if (isOpen) {
      setPhase(PHASE.CHOOSE)
      setFirstName('')
      setLastName('')
      setEmail('')
      setError('')
      setLoading(false)
      setTermsAccepted(false)
      setRegisterNotice('')
      setVerifiedEmail('')
      setClientSecret(null)
      setAttendeeId(null)
      setAccessToken(null)
      setSavedPassword(null)
      setOtpCode('')
      setShowResend(false)
      setOtpNotice('')
      setVerifyEmail('')
      setVerifyPasswordValue('')
      completionStartedRef.current = false

      // After #acceso or #acceso-error the terms count as accepted: the flow
      // only starts from a card with the checkbox ticked. #acceder does not.
      if (resume?.kind === 'complete') {
        setTermsAccepted(true)
        setPhase(PHASE.COMPLETING)
      } else if (resume?.kind === 'error') {
        const text = ACCESS_VERIFICATION_ERRORS[resume.code] || ACCESS_VERIFICATION_ERRORS.IDENTITY_FAILED
        setTermsAccepted(true)
        if (resume.code === 'IDENTITY_EMAIL_UNTRUSTED') {
          setRegisterNotice(text)
          setPhase(PHASE.REGISTER)
        } else {
          setError(text)
          setPhase(PHASE.METHOD)
        }
      } else if (resume?.kind === 'open') {
        setPhase(PHASE.METHOD)
      }
    }
    return () => {
      if (resendTimerRef.current) clearTimeout(resendTimerRef.current)
    }
  }, [isOpen, resume])

  // COMPLETING redeems the proof exactly once. The ref, not the phase, is the
  // guard: StrictMode runs effects twice, and a second call would find the
  // cookie already spent and overwrite a success with IDENTITY_PROOF_INVALID.
  useEffect(() => {
    if (!isOpen || phase !== PHASE.COMPLETING || completionStartedRef.current) return
    completionStartedRef.current = true
    handleCompleteIdentity()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phase])

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Todos los campos son obligatorios')
      return
    }

    // Accepted in METHOD, the only way into this form; kept as a guard.
    if (!termsAccepted) {
      setError(EVENT_VERIFICATION_COPY.termsRequired)
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

      // Nothing is stored here: the response carries no credential. A new
      // email and one already registered follow the same path — the code
      // step — which is also how a returning attendee recovers access.
      setAttendeeId(data.attendeeId)
      setAccessToken(null)

      await sendCode(data.attendeeId)
      setPhase(PHASE.VERIFY_EMAIL)
    } catch (err) {
      setError(errorText(err, 'Error al registrar'))
    } finally {
      setLoading(false)
    }
  }

  // Send (or resend) the code. Inside the server's 30 s cooldown the previous
  // code is still valid — the typical case is a reload during VERIFY_EMAIL
  // followed by registering again — so that is a notice, not a failure.
  const sendCode = async (targetAttendeeId) => {
    try {
      await eventsAPI.sendVerification(event.id, targetAttendeeId)
      setOtpNotice('')
    } catch (err) {
      if (err?.title !== 'OTP_RESEND_TOO_SOON') throw err
      setOtpNotice(ACCESS_VERIFICATION_ERRORS.OTP_RESEND_TOO_SOON)
    }
    setShowResend(false)
    if (resendTimerRef.current) clearTimeout(resendTimerRef.current)
    resendTimerRef.current = setTimeout(() => setShowResend(true), 30000)
  }

  const nameInfo = () => ({ firstName: firstName.trim(), lastName: lastName.trim() })

  // What follows a proven mailbox, by code or by provider: the two answer the
  // same shape (the API shares one success branch).
  const finishVerification = async (data, names) => {
    setVerifiedEmail(data.email || email.trim().toLowerCase())
    if (data.paymentRequired) {
      // Keep the token in memory only: storing it now would claim access
      // before the payment. It is written once confirm-payment succeeds.
      setAccessToken(data.accessToken)
      const payData = await eventsAPI.pay(event.id, data.attendeeId)
      setClientSecret(payData.clientSecret)
      setPhase(PHASE.PAYMENT)
    } else {
      storeSession(event.id, { attendeeId: data.attendeeId, accessToken: data.accessToken, ...names })
      if (data.accessPassword) {
        setSavedPassword(data.accessPassword)
      }
      onAccessGranted?.({ attendeeId: data.attendeeId, accessToken: data.accessToken })
      setPhase(PHASE.SUCCESS)
    }
  }

  const handleVerifyOtp = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await eventsAPI.verifyEmail(event.id, attendeeId, otpCode)
      await finishVerification({ ...data, attendeeId }, nameInfo())
    } catch (err) {
      setError(errorText(err, 'Error al verificar código'))
    } finally {
      setLoading(false)
    }
  }

  // Back from Google or Microsoft: the proof is in an HttpOnly cookie the
  // browser sends to identity/complete. The modal never saw the names or the
  // email, so they come in the response.
  const handleCompleteIdentity = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await eventsAPI.completeIdentity(event.id)
      setAttendeeId(data.attendeeId)
      setFirstName(data.firstName || '')
      setLastName(data.lastName || '')
      await finishVerification(data, { firstName: data.firstName || '', lastName: data.lastName || '' })
    } catch (err) {
      setError(errorText(err, ACCESS_VERIFICATION_ERRORS.IDENTITY_FAILED))
      setPhase(PHASE.METHOD)
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setError('')
    setShowResend(false)
    setOtpCode('')
    setLoading(true)
    try {
      await sendCode(attendeeId)
    } catch (err) {
      setError(errorText(err, 'Error al reenviar código'))
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentSuccess = async (paymentPassword) => {
    if (paymentPassword) {
      setSavedPassword(paymentPassword)
    }
    storeSession(event.id, { attendeeId, accessToken, ...nameInfo() })
    onAccessGranted?.({ attendeeId, accessToken })
    setPhase(PHASE.SUCCESS)
  }

  const handleVerifyPassword = async () => {
    if (!verifyEmail.trim() || !verifyPasswordValue.trim()) {
      setError('Email y contraseña son obligatorios')
      return
    }

    setLoading(true)
    setError('')

    try {
      const data = await eventsAPI.verifyPassword(event.id, verifyEmail.trim().toLowerCase(), verifyPasswordValue.trim())
      storeSession(event.id, {
        attendeeId: data.attendee.id,
        accessToken: data.accessToken,
        firstName: data.attendee.first_name,
        lastName: data.attendee.last_name,
      })
      onAccessGranted?.({ attendeeId: data.attendee.id, accessToken: data.accessToken })
      handleClose()
    } catch (err) {
      setError(err.message || 'Error al verificar')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPhase(PHASE.CHOOSE)
    setFirstName('')
    setLastName('')
    setEmail('')
    setError('')
    setTermsAccepted(false)
    setRegisterNotice('')
    setVerifiedEmail('')
    setClientSecret(null)
    setSavedPassword(null)
    setOtpCode('')
    setShowResend(false)
    setOtpNotice('')
    setVerifyEmail('')
    setVerifyPasswordValue('')
    if (resendTimerRef.current) clearTimeout(resendTimerRef.current)
    onClose()
  }

  // ---- Render helpers ----

  const renderChoose = () => (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">Selecciona una opción para continuar:</p>
      <button
        type="button"
        onClick={() => { setError(''); setPhase(PHASE.METHOD) }}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
      >
        Registrarme en el evento
      </button>
      <button
        type="button"
        onClick={() => { setError(''); setPhase(PHASE.VERIFY_PASSWORD) }}
        className="w-full rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
      >
        Acceder con contraseña
      </button>
    </div>
  )

  // Choose how to prove the email (event-identity-provider-verification).
  const renderMethod = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => { setError(''); setPhase(PHASE.CHOOSE) }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Volver
      </button>
      {isPaid && (
        <p className="text-sm text-gray-600">
          El precio de este evento es {event.price} {event.currency}.
        </p>
      )}
      <EventVerificationMethods
        event={event}
        providers={providers}
        termsAccepted={termsAccepted}
        onTermsAcceptedChange={(checked) => { setTermsAccepted(checked); if (checked) setError('') }}
        onSelectEmail={() => { setError(''); setRegisterNotice(''); setPhase(PHASE.REGISTER) }}
        error={error}
        onError={setError}
      />
    </div>
  )

  // Back from Google or Microsoft, while identity/complete answers.
  const renderCompleting = () => (
    <div className="flex items-center justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      <span className="ml-2 text-sm text-gray-600">{EVENT_VERIFICATION_COPY.completing}</span>
    </div>
  )

  // The email form. The terms were accepted in METHOD, so no checkbox here.
  const renderRegister = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => { setError(''); setRegisterNotice(''); setPhase(PHASE.METHOD) }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Volver
      </button>
      {registerNotice && (
        <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">{registerNotice}</p>
      )}
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleRegister}
        disabled={loading}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Registrando...' : 'Continuar'}
      </button>
    </div>
  )

  const renderVerifyEmail = () => (
    <div className="space-y-4">
      <div className="rounded-md bg-gray-50 p-3">
        <p className="text-sm text-gray-700">
          Hemos enviado un código de verificación a <strong>{email}</strong>. Introdúcelo a continuación.
        </p>
      </div>
      {otpNotice && <p className="text-sm text-gray-600">{otpNotice}</p>}
      <div>
        <label className="block text-sm font-medium text-gray-900">Código de verificación</label>
        <input
          type="text"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm tracking-widest text-center text-lg"
          placeholder="000000"
          maxLength={6}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleVerifyOtp}
        disabled={loading || otpCode.length !== 6}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Verificando...' : 'Verificar código'}
      </button>
      {showResend && (
        <button
          type="button"
          onClick={handleResendOtp}
          className="w-full text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Reenviar código
        </button>
      )}
    </div>
  )

  const renderVerifyPassword = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => { setError(''); setPhase(PHASE.CHOOSE) }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Volver
      </button>
      <div>
        <label className="block text-sm font-medium text-gray-900">Email</label>
        <input
          type="email"
          value={verifyEmail}
          onChange={(e) => setVerifyEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
          placeholder="tu@email.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-900">Contraseña de acceso</label>
        <input
          type="password"
          value={verifyPasswordValue}
          onChange={(e) => setVerifyPasswordValue(e.target.value)}
          className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
          placeholder="Contraseña recibida al registrarte"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleVerifyPassword}
        disabled={loading || !verifyEmail || !verifyPasswordValue}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Verificando...' : 'Acceder'}
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
        {verifiedEmail && (
          <p className="text-sm text-gray-600">
            {EVENT_VERIFICATION_COPY.payingAs} <strong>{verifiedEmail}</strong>
          </p>
        )}
        <Elements stripe={getStripePromise()} options={{ clientSecret, locale: 'es' }}>
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
      {verifiedEmail && (
        <p className="text-sm text-gray-600">
          {EVENT_VERIFICATION_COPY.registeredAs} <strong>{verifiedEmail}</strong>
        </p>
      )}
      {savedPassword && (
        <div className="rounded-lg border-2 border-gray-900 bg-gray-50 p-4 text-left">
          <p className="text-sm font-semibold text-gray-900">Guarda esta contraseña</p>
          <p className="mt-1 text-xs text-gray-600">
            La necesitarás para acceder al evento desde otro dispositivo o si se borran los datos del navegador.
          </p>
          <p className="mt-3 select-all text-center text-lg font-mono font-bold tracking-widest text-gray-900">
            {savedPassword}
          </p>
        </div>
      )}
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
    [PHASE.CHOOSE]: event?.status === 'active' ? 'Acceder al evento' : 'Registro en el evento',
    [PHASE.METHOD]: 'Registro',
    [PHASE.REGISTER]: 'Registro',
    [PHASE.VERIFY_EMAIL]: 'Verificar email',
    [PHASE.COMPLETING]: 'Registro',
    [PHASE.VERIFY_PASSWORD]: 'Acceder con contraseña',
    [PHASE.PAYMENT]: 'Pago',
    [PHASE.SUCCESS]: isPaid ? 'Pago completado' : 'Registro completado',
  }

  const renderContent = {
    [PHASE.CHOOSE]: renderChoose,
    [PHASE.METHOD]: renderMethod,
    [PHASE.REGISTER]: renderRegister,
    [PHASE.VERIFY_EMAIL]: renderVerifyEmail,
    [PHASE.COMPLETING]: renderCompleting,
    [PHASE.VERIFY_PASSWORD]: renderVerifyPassword,
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
        const data = await eventsAPI.confirmPayment(eventId, attendeeId, paymentIntent.id)
        onSuccess(data.accessPassword)
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
