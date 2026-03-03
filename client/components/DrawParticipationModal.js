'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon, CheckIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import Image from 'next/image'
import { drawsAPI, getArtImageUrl, getOthersImageUrl } from '@/lib/api'
import usePostalCodeValidation from '@/hooks/usePostalCodeValidation'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

// ---------------------------------------------------------------------------
// Flow phases (CHOOSE and VERIFY removed)
// ---------------------------------------------------------------------------
const PHASE = {
  TERMS: 'terms',
  PERSONAL: 'personal',
  DELIVERY: 'delivery',
  INVOICING: 'invoicing',
  PAYMENT: 'payment',
  CONFIRM: 'confirm',
  SUCCESS: 'success',
}

const STEPS = [PHASE.TERMS, PHASE.PERSONAL, PHASE.DELIVERY, PHASE.INVOICING, PHASE.PAYMENT]

// ---------------------------------------------------------------------------
// DNI/NIE validation (Spanish NIF algorithm)
// ---------------------------------------------------------------------------
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

function validateDNI(dni) {
  if (!dni || typeof dni !== 'string') return false
  const normalized = dni.toUpperCase().trim()

  // NIE format: X/Y/Z + 7 digits + letter
  const nieMatch = normalized.match(/^([XYZ])(\d{7})([A-Z])$/)
  if (nieMatch) {
    const niePrefix = { X: '0', Y: '1', Z: '2' }
    const num = parseInt(niePrefix[nieMatch[1]] + nieMatch[2], 10)
    return nieMatch[3] === DNI_LETTERS[num % 23]
  }

  // DNI format: 8 digits + letter
  const dniMatch = normalized.match(/^(\d{8})([A-Z])$/)
  if (dniMatch) {
    const num = parseInt(dniMatch[1], 10)
    return dniMatch[2] === DNI_LETTERS[num % 23]
  }

  return false
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
  const [phase, setPhase] = useState(PHASE.TERMS)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Buyer data
  const [buyerSession, setBuyerSession] = useState(null)
  const [termsAccepted, setTermsAccepted] = useState([false, false])
  const [personalInfo, setPersonalInfo] = useState({ firstName: '', lastName: '', email: '', dni: '' })
  const [deliveryAddress, setDeliveryAddress] = useState({
    address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES',
  })
  const [invoicingAddress, setInvoicingAddress] = useState({
    address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES',
  })
  const [copyDelivery, setCopyDelivery] = useState(false)

  // Email verification OTP
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)
  const [showResend, setShowResend] = useState(false)
  const resendTimerRef = useRef(null)

  // DNI validation state
  const [dniError, setDniError] = useState('')

  // Stripe
  const [clientSecret, setClientSecret] = useState(null)
  const [stripeCustomerId, setStripeCustomerId] = useState(null)

  // Track completed entry to prevent reset on draw prop changes
  const entryCompleteRef = useRef(false)

  // Postal code validation
  const postalCodeValidateFn = useCallback(
    async (code) => drawsAPI.validatePostalCode(draw?.id, code, 'ES'),
    [draw?.id]
  )
  const { isValid: postalCodeValid, isChecking: postalCodeChecking } = usePostalCodeValidation({
    postalCode: deliveryAddress.postal_code,
    hasRestrictions: true,
    validateFn: postalCodeValidateFn,
  })

  // ------ Reset when modal opens ------
  useEffect(() => {
    if (isOpen && !entryCompleteRef.current) {
      setPhase(PHASE.TERMS)
      setError('')
      setLoading(false)
      setBuyerSession(null)
      setTermsAccepted([false, false])
      setPersonalInfo({ firstName: '', lastName: '', email: '', dni: '' })
      setDeliveryAddress({ address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES' })
      setInvoicingAddress({ address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES' })
      setCopyDelivery(false)
      setOtpSent(false)
      setOtpCode('')
      setOtpVerified(false)
      setShowResend(false)
      setClientSecret(null)
      setDniError('')
    }
    if (!isOpen) {
      entryCompleteRef.current = false
    }
    return () => {
      if (resendTimerRef.current) clearTimeout(resendTimerRef.current)
    }
  }, [isOpen, draw])

  // Copy delivery -> invoicing
  useEffect(() => {
    if (copyDelivery) {
      setInvoicingAddress({ ...deliveryAddress })
    }
  }, [copyDelivery, deliveryAddress])

  const imageUrl = draw?.basename
    ? (draw.product_type === 'art' ? getArtImageUrl(draw.basename) : getOthersImageUrl(draw.basename))
    : null

  // ------ DNI inline validation ------
  const handleDniChange = (value) => {
    setPersonalInfo({ ...personalInfo, dni: value })
    if (value.length >= 9) {
      setDniError(validateDNI(value) ? '' : 'El DNI/NIE introducido no es válido')
    } else {
      setDniError('')
    }
  }

  // ------ Send verification (DNI check + OTP) ------
  const handleSendVerification = async () => {
    setError('')
    setLoading(true)
    try {
      await drawsAPI.sendVerification(draw.id, personalInfo.email, personalInfo.dni.toUpperCase().trim())
      setOtpSent(true)
      setShowResend(false)
      // Show resend button after 30 seconds
      resendTimerRef.current = setTimeout(() => setShowResend(true), 30000)
    } catch (err) {
      setError(err.message || 'Error al enviar verificación')
    } finally {
      setLoading(false)
    }
  }

  // ------ Verify OTP code ------
  const handleVerifyOtp = async () => {
    setError('')
    setLoading(true)
    try {
      await drawsAPI.verifyEmail(draw.id, personalInfo.email, otpCode)
      setOtpVerified(true)
      setPhase(PHASE.DELIVERY)
    } catch (err) {
      setError(err.message || 'Error al verificar código')
    } finally {
      setLoading(false)
    }
  }

  // ------ Resend OTP ------
  const handleResendOtp = async () => {
    setError('')
    setShowResend(false)
    setOtpCode('')
    await handleSendVerification()
  }

  // ------ Register buyer + setup payment ------
  const handleRegister = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await drawsAPI.registerBuyer(draw.id, {
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        email: personalInfo.email,
        dni: personalInfo.dni.toUpperCase().trim(),
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

      const session = { drawBuyerId: data.buyer.id }
      setBuyerSession(session)

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
      entryCompleteRef.current = true
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
            {!otpSent ? (
              <>
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
                <div>
                  <label className="block text-sm font-medium text-gray-900">DNI/NIE</label>
                  <input
                    type="text"
                    value={personalInfo.dni}
                    onChange={(e) => handleDniChange(e.target.value)}
                    className={`mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ${dniError ? 'ring-red-300' : 'ring-gray-300'} placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm uppercase`}
                    placeholder="12345678Z"
                    maxLength={9}
                  />
                  {dniError && <p className="mt-1 text-xs text-red-600">{dniError}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleSendVerification}
                  disabled={loading || !personalInfo.firstName || !personalInfo.lastName || !personalInfo.email || !personalInfo.dni || !!dniError || !validateDNI(personalInfo.dni)}
                  className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {loading ? 'Enviando código...' : 'Continuar'}
                </button>
              </>
            ) : (
              <>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-sm text-gray-700">
                    Hemos enviado un código de verificación a <strong>{personalInfo.email}</strong>. Introdúcelo a continuación.
                  </p>
                </div>
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
              </>
            )}
          </div>
        )

      case PHASE.DELIVERY:
        return (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-900">Dirección de envío</p>

            {/* Postal code error alert with shipping observations */}
            {deliveryAddress.postal_code && postalCodeValid === false && (
              <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
                <p className="text-sm font-medium text-amber-800">
                  El código postal introducido no está disponible para este artículo. Contacta con info@140d.art para obtener ayuda.
                </p>
                {draw?.shipping_observations && (
                  <p className="mt-2 text-sm text-amber-700">
                    {draw.shipping_observations}
                  </p>
                )}
              </div>
            )}

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
                <div className="relative">
                  <input
                    type="text"
                    value={deliveryAddress.postal_code}
                    onChange={(e) => setDeliveryAddress({ ...deliveryAddress, postal_code: e.target.value })}
                    className={`mt-1 block w-full rounded-md border-0 px-3 py-2 pr-8 text-gray-900 shadow-sm ring-1 ring-inset ${postalCodeValid === false ? 'ring-red-300' : postalCodeValid === true ? 'ring-green-300' : 'ring-gray-300'} placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm`}
                  />
                  {postalCodeChecking && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                    </div>
                  )}
                  {!postalCodeChecking && postalCodeValid === true && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5">
                      <CheckIcon className="h-4 w-4 text-green-600" />
                    </div>
                  )}
                </div>
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
              disabled={!deliveryAddress.address_1 || !deliveryAddress.postal_code || !deliveryAddress.city || postalCodeValid === false || postalCodeChecking}
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
                  <p className="mt-3 text-2xl font-bold text-gray-900">{Number(draw.price).toFixed(2)}&nbsp;&euro;</p>
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
          </div>
        )

      default:
        return null
    }
  }

  const phaseTitle = {
    [PHASE.TERMS]: 'Paso 1 de 5 - Términos',
    [PHASE.PERSONAL]: 'Paso 2 de 5 - Datos personales',
    [PHASE.DELIVERY]: 'Paso 3 de 5 - Dirección de envío',
    [PHASE.INVOICING]: 'Paso 4 de 5 - Dirección de facturación',
    [PHASE.PAYMENT]: 'Paso 5 de 5 - Método de pago',
    [PHASE.CONFIRM]: 'Confirmar inscripción',
    [PHASE.SUCCESS]: 'Inscripción completada',
  }

  const canGoBack = [PHASE.TERMS, PHASE.PERSONAL, PHASE.DELIVERY, PHASE.INVOICING].includes(phase)

  const goBack = () => {
    setError('')
    switch (phase) {
      case PHASE.PERSONAL:
        setOtpSent(false)
        setOtpCode('')
        setOtpVerified(false)
        setPhase(PHASE.TERMS)
        break
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

            {/* Step progress indicator */}
            {STEPS.includes(phase) && (
              <div className="mb-6">
                <div className="flex gap-1">
                  {STEPS.map((step, i) => (
                    <div
                      key={step}
                      className={`h-1 flex-1 rounded-full ${
                        STEPS.indexOf(phase) >= i ? 'bg-gray-900' : 'bg-gray-200'
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
