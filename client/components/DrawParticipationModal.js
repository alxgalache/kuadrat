'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon, CheckIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import Image from 'next/image'
import { drawsAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

// ---------------------------------------------------------------------------
// Flow phases
// ---------------------------------------------------------------------------
const PHASE = {
  CHOOSE: 'choose',
  VERIFY: 'verify',
  TERMS: 'terms',
  PERSONAL: 'personal',
  DELIVERY: 'delivery',
  INVOICING: 'invoicing',
  PAYMENT: 'payment',
  CONFIRM: 'confirm',
  SUCCESS: 'success',
}

const NEW_PARTICIPANT_STEPS = [PHASE.TERMS, PHASE.PERSONAL, PHASE.DELIVERY, PHASE.INVOICING, PHASE.PAYMENT]

// localStorage helpers
function getStoredSession(drawId) {
  try {
    const raw = localStorage.getItem(`draw_session_${drawId}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function storeSession(drawId, session) {
  try {
    localStorage.setItem(`draw_session_${drawId}`, JSON.stringify(session))
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Stripe PaymentForm (inner component wrapped by <Elements>)
// ---------------------------------------------------------------------------
function PaymentForm({ onSuccess, onError, loading, setLoading }) {
  const stripe = useStripe()
  const elements = useElements()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      })
      if (error) {
        onError(error.message)
      } else if (setupIntent && setupIntent.status === 'succeeded') {
        onSuccess(setupIntent.id)
      } else {
        onError('Error al confirmar el pago')
      }
    } catch (err) {
      onError(err.message || 'Error inesperado')
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
        {loading ? 'Procesando...' : 'Autorizar método de pago'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main DrawParticipationModal
// ---------------------------------------------------------------------------
export default function DrawParticipationModal({ isOpen, onClose, draw, onEntryComplete }) {
  const [phase, setPhase] = useState(PHASE.CHOOSE)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Buyer data
  const [buyerSession, setBuyerSession] = useState(null)
  const [termsAccepted, setTermsAccepted] = useState([false, false])
  const [personalInfo, setPersonalInfo] = useState({ firstName: '', lastName: '', email: '' })
  const [deliveryAddress, setDeliveryAddress] = useState({
    address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES',
  })
  const [invoicingAddress, setInvoicingAddress] = useState({
    address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES',
  })
  const [copyDelivery, setCopyDelivery] = useState(false)

  // Returning participant
  const [verifyEmail, setVerifyEmail] = useState('')
  const [verifyPassword, setVerifyPassword] = useState('')

  // Stripe
  const [clientSecret, setClientSecret] = useState(null)
  const [stripeCustomerId, setStripeCustomerId] = useState(null)

  // Success data
  const [savedPassword, setSavedPassword] = useState('')

  // ------ Reset when modal opens ------
  useEffect(() => {
    if (isOpen) {
      const stored = draw ? getStoredSession(draw.id) : null
      if (stored) {
        setBuyerSession(stored)
        setPhase(PHASE.CONFIRM)
      } else {
        setPhase(PHASE.CHOOSE)
      }
      setError('')
      setLoading(false)
      setTermsAccepted([false, false])
      setPersonalInfo({ firstName: '', lastName: '', email: '' })
      setDeliveryAddress({ address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES' })
      setInvoicingAddress({ address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES' })
      setCopyDelivery(false)
      setVerifyEmail('')
      setVerifyPassword('')
      setClientSecret(null)
      setSavedPassword('')
    }
  }, [isOpen, draw])

  // Copy delivery → invoicing
  useEffect(() => {
    if (copyDelivery) {
      setInvoicingAddress({ ...deliveryAddress })
    }
  }, [copyDelivery, deliveryAddress])

  const imageUrl = draw?.basename
    ? (draw.product_type === 'art' ? getArtImageUrl(draw.basename) : getOthersImageUrl(draw.basename))
    : null

  // ------ Phase handlers ------

  const handleVerify = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await drawsAPI.verifyBuyer(draw.id, verifyEmail, verifyPassword)
      const session = { drawBuyerId: data.buyer.id, bidPassword: data.buyer.bid_password }
      setBuyerSession(session)
      storeSession(draw.id, session)

      if (data.hasParticipation) {
        setError('Ya estás inscrito en este sorteo')
        setLoading(false)
        return
      }

      if (data.hasPaymentMethod) {
        setPhase(PHASE.CONFIRM)
      } else {
        await setupStripePayment(data.buyer.id)
        setPhase(PHASE.PAYMENT)
      }
    } catch (err) {
      setError(err.message || 'Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await drawsAPI.registerBuyer(draw.id, {
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        email: personalInfo.email,
        deliveryAddress1: deliveryAddress.address_1,
        deliveryAddress2: deliveryAddress.address_2,
        deliveryPostalCode: deliveryAddress.postal_code,
        deliveryCity: deliveryAddress.city,
        deliveryProvince: deliveryAddress.province,
        deliveryCountry: deliveryAddress.country,
        invoicingAddress1: invoicingAddress.address_1,
        invoicingAddress2: invoicingAddress.address_2,
        invoicingPostalCode: invoicingAddress.postal_code,
        invoicingCity: invoicingAddress.city,
        invoicingProvince: invoicingAddress.province,
        invoicingCountry: invoicingAddress.country,
      })

      const session = { drawBuyerId: data.buyer.id, bidPassword: data.buyer.bid_password }
      setBuyerSession(session)
      storeSession(draw.id, session)
      setSavedPassword(data.buyer.bid_password)

      await setupStripePayment(data.buyer.id)
      setPhase(PHASE.PAYMENT)
    } catch (err) {
      setError(err.message || 'Error al registrar participante')
    } finally {
      setLoading(false)
    }
  }

  const setupStripePayment = async (buyerId) => {
    const data = await drawsAPI.setupPayment(draw.id, buyerId)
    setClientSecret(data.clientSecret)
    setStripeCustomerId(data.customerId)
  }

  const handlePaymentSuccess = async (setupIntentId) => {
    setError('')
    setLoading(true)
    try {
      await drawsAPI.confirmPayment(draw.id, buyerSession.drawBuyerId, setupIntentId)
      setPhase(PHASE.CONFIRM)
    } catch (err) {
      setError(err.message || 'Error al confirmar pago')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmEntry = async () => {
    setError('')
    setLoading(true)
    try {
      await drawsAPI.enterDraw(draw.id, buyerSession.drawBuyerId)
      setPhase(PHASE.SUCCESS)
      if (onEntryComplete) onEntryComplete()
    } catch (err) {
      setError(err.message || 'Error al inscribirse')
    } finally {
      setLoading(false)
    }
  }

  // ------ Rendering ------

  const renderPhase = () => {
    switch (phase) {
      case PHASE.CHOOSE:
        return (
          <div className="space-y-6">
            <p className="text-sm text-gray-600">Selecciona una opción para continuar:</p>
            <button
              type="button"
              onClick={() => setPhase(PHASE.VERIFY)}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
            >
              Ya me registré antes
            </button>
            <button
              type="button"
              onClick={() => setPhase(PHASE.TERMS)}
              className="w-full rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Nuevo participante
            </button>
          </div>
        )

      case PHASE.VERIFY:
        return (
          <div className="space-y-4">
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
                type="text"
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm tracking-widest"
              />
            </div>
            <button
              type="button"
              onClick={handleVerify}
              disabled={loading || !verifyEmail || !verifyPassword}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Verificar'}
            </button>
          </div>
        )

      case PHASE.TERMS:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Para participar, debes aceptar las siguientes condiciones:</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted[0]}
                onChange={(e) => setTermsAccepted([e.target.checked, termsAccepted[1]])}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span className="text-sm text-gray-700">
                Acepto los{' '}
                <a href="/legal/terminos-y-condiciones" target="_blank" rel="noopener noreferrer" className="underline font-medium text-gray-900 hover:text-gray-600">
                  términos y condiciones
                </a>
                {' '}de participación en el sorteo y entiendo que la inscripción es vinculante.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted[1]}
                onChange={(e) => setTermsAccepted([termsAccepted[0], e.target.checked])}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span className="text-sm text-gray-700">
                Acepto la{' '}
                <a href="/legal/politica-de-privacidad" target="_blank" rel="noopener noreferrer" className="underline font-medium text-gray-900 hover:text-gray-600">
                  política de privacidad
                </a>
                {' '}y el tratamiento de mis datos personales.
              </span>
            </label>
            <button
              type="button"
              onClick={() => { setError(''); setPhase(PHASE.PERSONAL) }}
              disabled={!termsAccepted[0] || !termsAccepted[1]}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )

      case PHASE.PERSONAL:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">Nombre</label>
                <input
                  type="text"
                  value={personalInfo.firstName}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, firstName: e.target.value })}
                  className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900">Apellidos</label>
                <input
                  type="text"
                  value={personalInfo.lastName}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, lastName: e.target.value })}
                  className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">Email</label>
              <input
                type="email"
                value={personalInfo.email}
                onChange={(e) => setPersonalInfo({ ...personalInfo, email: e.target.value })}
                className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                placeholder="tu@email.com"
              />
            </div>
            <button
              type="button"
              onClick={() => { setError(''); setPhase(PHASE.DELIVERY) }}
              disabled={!personalInfo.firstName || !personalInfo.lastName || !personalInfo.email}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )

      case PHASE.DELIVERY:
        return (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-900">Dirección de envío</p>
            <div>
              <label className="block text-sm font-medium text-gray-900">Dirección (línea 1)</label>
              <input
                type="text"
                value={deliveryAddress.address_1}
                onChange={(e) => setDeliveryAddress({ ...deliveryAddress, address_1: e.target.value })}
                className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">Dirección (línea 2)</label>
              <input
                type="text"
                value={deliveryAddress.address_2}
                onChange={(e) => setDeliveryAddress({ ...deliveryAddress, address_2: e.target.value })}
                className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">Código postal</label>
                <input
                  type="text"
                  value={deliveryAddress.postal_code}
                  onChange={(e) => setDeliveryAddress({ ...deliveryAddress, postal_code: e.target.value })}
                  className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900">Ciudad</label>
                <input
                  type="text"
                  value={deliveryAddress.city}
                  onChange={(e) => setDeliveryAddress({ ...deliveryAddress, city: e.target.value })}
                  className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">Provincia</label>
                <input
                  type="text"
                  value={deliveryAddress.province}
                  onChange={(e) => setDeliveryAddress({ ...deliveryAddress, province: e.target.value })}
                  className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900">País</label>
                <input
                  type="text"
                  value={deliveryAddress.country}
                  disabled
                  className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-500 bg-gray-50 shadow-sm ring-1 ring-inset ring-gray-300 sm:text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setError(''); setPhase(PHASE.INVOICING) }}
              disabled={!deliveryAddress.address_1 || !deliveryAddress.postal_code || !deliveryAddress.city}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )

      case PHASE.INVOICING:
        return (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-900">Dirección de facturación</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={copyDelivery}
                onChange={(e) => setCopyDelivery(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span className="text-sm text-gray-700">Copiar de dirección de envío</span>
            </label>
            {!copyDelivery && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-900">Dirección (línea 1)</label>
                  <input
                    type="text"
                    value={invoicingAddress.address_1}
                    onChange={(e) => setInvoicingAddress({ ...invoicingAddress, address_1: e.target.value })}
                    className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900">Dirección (línea 2)</label>
                  <input
                    type="text"
                    value={invoicingAddress.address_2}
                    onChange={(e) => setInvoicingAddress({ ...invoicingAddress, address_2: e.target.value })}
                    className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900">Código postal</label>
                    <input
                      type="text"
                      value={invoicingAddress.postal_code}
                      onChange={(e) => setInvoicingAddress({ ...invoicingAddress, postal_code: e.target.value })}
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900">Ciudad</label>
                    <input
                      type="text"
                      value={invoicingAddress.city}
                      onChange={(e) => setInvoicingAddress({ ...invoicingAddress, city: e.target.value })}
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900">Provincia</label>
                    <input
                      type="text"
                      value={invoicingAddress.province}
                      onChange={(e) => setInvoicingAddress({ ...invoicingAddress, province: e.target.value })}
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900">País</label>
                    <input
                      type="text"
                      value={invoicingAddress.country}
                      disabled
                      className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-500 bg-gray-50 shadow-sm ring-1 ring-inset ring-gray-300 sm:text-sm"
                    />
                  </div>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={handleRegister}
              disabled={loading}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? 'Configurando pago...' : 'Continuar al pago'}
            </button>
          </div>
        )

      case PHASE.PAYMENT:
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
              Se verificará tu método de pago sin realizar ningún cargo. Tu tarjeta quedará guardada para el caso de ganar el sorteo.
            </p>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm
                onSuccess={handlePaymentSuccess}
                onError={(msg) => setError(msg)}
                loading={loading}
                setLoading={setLoading}
              />
            </Elements>
          </div>
        )

      case PHASE.CONFIRM:
        return (
          <div className="space-y-6">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-600">Estás a punto de inscribirte en:</p>
              <div className="mt-2 flex gap-4 items-center">
                {imageUrl && (
                  <Image src={imageUrl} alt={draw.product_name || draw.name} width={80} height={80} className="rounded-lg object-cover flex-shrink-0" />
                )}
                <div>
                  <p className="text-base font-semibold text-gray-900">{draw.product_name || draw.name}</p>
                  <p className="mt-3 text-2xl font-bold text-gray-900">€{Number(draw.price).toFixed(2)}</p>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600">Al confirmar tu inscripción, participarás en el sorteo. Si resultas ganador, se cargará el importe en tu método de pago autorizado.</p>
            <button
              type="button"
              onClick={handleConfirmEntry}
              disabled={loading}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? 'Inscribiéndote...' : 'Confirmar inscripción'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        )

      case PHASE.SUCCESS:
        return (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckIcon className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">¡Inscripción confirmada!</p>
              <p className="mt-1 text-sm text-gray-600">Te has inscrito correctamente en el sorteo. Te notificaremos por email con el resultado.</p>
            </div>
            {(savedPassword || buyerSession?.bidPassword) && (
              <div className="rounded-lg border-2 border-gray-900 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Guarda esta contraseña</p>
                <p className="mt-1 text-xs text-gray-600">La necesitarás para acceder a tu inscripción en este sorteo.</p>
                <p className="mt-3 select-all text-center text-lg font-mono font-bold tracking-widest text-gray-900">
                  {savedPassword || buyerSession.bidPassword}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
            >
              Cerrar
            </button>
          </div>
        )

      default:
        return null
    }
  }

  const phaseTitle = {
    [PHASE.CHOOSE]: 'Inscribirse en el sorteo',
    [PHASE.VERIFY]: 'Verificar identidad',
    [PHASE.TERMS]: 'Paso 1 de 5 - Términos',
    [PHASE.PERSONAL]: 'Paso 2 de 5 - Datos personales',
    [PHASE.DELIVERY]: 'Paso 3 de 5 - Dirección de envío',
    [PHASE.INVOICING]: 'Paso 4 de 5 - Dirección de facturación',
    [PHASE.PAYMENT]: 'Paso 5 de 5 - Método de pago',
    [PHASE.CONFIRM]: 'Confirmar inscripción',
    [PHASE.SUCCESS]: 'Inscripción completada',
  }

  const canGoBack = [PHASE.VERIFY, PHASE.TERMS, PHASE.PERSONAL, PHASE.DELIVERY, PHASE.INVOICING].includes(phase)

  const goBack = () => {
    setError('')
    switch (phase) {
      case PHASE.VERIFY: setPhase(PHASE.CHOOSE); break
      case PHASE.TERMS: setPhase(PHASE.CHOOSE); break
      case PHASE.PERSONAL: setPhase(PHASE.TERMS); break
      case PHASE.DELIVERY: setPhase(PHASE.PERSONAL); break
      case PHASE.INVOICING: setPhase(PHASE.DELIVERY); break
    }
  }

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />
      <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95"
          >
            {/* Close button */}
            <div className="absolute right-0 top-0 pr-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-white text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Cerrar</span>
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Title with optional back button */}
            <div className="flex items-center gap-2 pr-8 mb-4">
              {canGoBack && (
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-full p-1 hover:bg-gray-100 flex-shrink-0"
                >
                  <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
                </button>
              )}
              <DialogTitle as="h3" className="text-base font-semibold text-gray-900">
                {phaseTitle[phase] || 'Sorteo'}
              </DialogTitle>
            </div>

            {/* Step progress indicator for new participant flow */}
            {NEW_PARTICIPANT_STEPS.includes(phase) && (
              <div className="mb-6">
                <div className="flex gap-1">
                  {NEW_PARTICIPANT_STEPS.map((step, i) => (
                    <div
                      key={step}
                      className={`h-1 flex-1 rounded-full ${
                        NEW_PARTICIPANT_STEPS.indexOf(phase) >= i ? 'bg-gray-900' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Phase content */}
            {renderPhase()}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
