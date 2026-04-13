'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon, CheckIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { auctionsAPI } from '@/lib/api'
import { useNotification } from '@/contexts/NotificationContext'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

// ---------------------------------------------------------------------------
// DNI / NIE validation
// ---------------------------------------------------------------------------
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

function validateDNI(dni) {
  if (!dni || typeof dni !== 'string') return false
  const normalized = dni.toUpperCase().trim()

  const nieMatch = normalized.match(/^([XYZ])(\d{7})([A-Z])$/)
  if (nieMatch) {
    const niePrefix = { X: '0', Y: '1', Z: '2' }
    const num = parseInt(niePrefix[nieMatch[1]] + nieMatch[2], 10)
    return nieMatch[3] === DNI_LETTERS[num % 23]
  }

  const dniMatch = normalized.match(/^(\d{8})([A-Z])$/)
  if (dniMatch) {
    const num = parseInt(dniMatch[1], 10)
    return dniMatch[2] === DNI_LETTERS[num % 23]
  }

  return false
}

// ---------------------------------------------------------------------------
// Flow phases
// ---------------------------------------------------------------------------
const PHASE = {
  CHOOSE: 'choose',         // Returning or new bidder?
  VERIFY: 'verify',         // Returning bidder: email + password
  TERMS: 'terms',           // Step 1 new
  PERSONAL: 'personal',     // Step 2
  DELIVERY: 'delivery',     // Step 3
  INVOICING: 'invoicing',   // Step 4
  PAYMENT: 'payment',       // Step 5 Stripe
  CONFIRM: 'confirm',       // Final confirmation
  SUCCESS: 'success',       // Bid placed
}

// ---------------------------------------------------------------------------
// Main BidModal component
// ---------------------------------------------------------------------------
/**
 * Multi-step bid modal.
 *
 * @param {{ isOpen: boolean, onClose: () => void, auction: object, product: object, onBidPlaced: () => void }} props
 */
export default function BidModal({ isOpen, onClose, auction, product, livePriceData, auctionEnded, onBidPlaced }) {
  const { showError } = useNotification()
  const [phase, setPhase] = useState(PHASE.CHOOSE)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Buyer data accumulated across steps
  const [buyerSession, setBuyerSession] = useState(null) // { auctionBuyerId, bidPassword }
  const [termsAccepted, setTermsAccepted] = useState([false, false])
  const [personalInfo, setPersonalInfo] = useState({ firstName: '', lastName: '', email: '', dni: '' })
  const [deliveryAddress, setDeliveryAddress] = useState({
    address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES',
  })
  const [invoicingAddress, setInvoicingAddress] = useState({
    address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES',
  })
  const [copyDelivery, setCopyDelivery] = useState(false)
  const [postalCodeValid, setPostalCodeValid] = useState(null) // null = not checked, true/false
  const [hasPostalRestrictions, setHasPostalRestrictions] = useState(false)
  const postalValidationRef = useRef(null)

  // Email verification OTP
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)
  const [showResend, setShowResend] = useState(false)
  const resendTimerRef = useRef(null)

  // DNI validation state
  const [dniError, setDniError] = useState('')

  // Returning bidder fields
  const [verifyEmail, setVerifyEmail] = useState('')
  const [verifyPassword, setVerifyPassword] = useState('')

  // Stripe
  const [clientSecret, setClientSecret] = useState(null)
  const [stripeCustomerId, setStripeCustomerId] = useState(null)

  // Saved bid password shown on success
  const [savedBidPassword, setSavedBidPassword] = useState('')

  // Live price change tracking
  const [priceChangedWarning, setPriceChangedWarning] = useState(false)
  const [animatePrice, setAnimatePrice] = useState(false)
  const prevPriceRef = useRef(null)

  const productId = product?.art_id ?? product?.other_id
  const productType = product?.product_type

  // Effective prices: prefer live data over product prop
  const effectiveCurrentPrice = livePriceData?.newPrice ?? product?.current_price ?? 0
  const effectiveNextBid = livePriceData?.nextBidAmount ?? ((product?.current_price ?? 0) + (product?.step_new_bid ?? 0))

  // Legacy alias for phases that don't need live tracking
  const nextBid = effectiveNextBid

  // ------ Reset state when modal opens/closes ------
  useEffect(() => {
    if (isOpen) {
      // Check localStorage for existing session
      const stored = auction
        ? getStoredSession(auction.id)
        : null
      if (stored) {
        setBuyerSession(stored)
        setPhase(PHASE.CONFIRM)
      } else {
        setPhase(PHASE.CHOOSE)
      }
      setError('')
      setLoading(false)
      setTermsAccepted([false, false])
      setPersonalInfo({ firstName: '', lastName: '', email: '', dni: '' })
      setDeliveryAddress({ address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES' })
      setInvoicingAddress({ address_1: '', address_2: '', postal_code: '', city: '', province: '', country: 'ES' })
      setCopyDelivery(false)
      setClientSecret(null)
      setStripeCustomerId(null)
      setSavedBidPassword('')
      setVerifyEmail('')
      setVerifyPassword('')
      setPriceChangedWarning(false)
      setAnimatePrice(false)
      prevPriceRef.current = null
      setPostalCodeValid(null)
      setOtpSent(false)
      setOtpCode('')
      setOtpVerified(false)
      setShowResend(false)
      setDniError('')
      if (resendTimerRef.current) clearTimeout(resendTimerRef.current)
    }
  }, [isOpen, auction])

  // ------ Close modal if auction ends while user is bidding ------
  useEffect(() => {
    if (isOpen && auctionEnded && phase !== PHASE.SUCCESS) {
      onClose()
      showError('Subasta finalizada', 'La subasta acaba de finalizar')
    }
  }, [auctionEnded])

  // Check if product has postal restrictions
  useEffect(() => {
    if (auction && productId && productType) {
      auctionsAPI.getPostalCodes(auction.id, productId, productType)
        .then((data) => {
          const refs = data.postalCodes || []
          setHasPostalRestrictions(refs.length > 0)
        })
        .catch(() => setHasPostalRestrictions(false))
    }
  }, [auction?.id, productId, productType])

  // Detect live price changes while on CONFIRM phase
  useEffect(() => {
    if (phase === PHASE.CONFIRM && prevPriceRef.current !== null && effectiveCurrentPrice !== prevPriceRef.current) {
      setPriceChangedWarning(true)
      setAnimatePrice(true)
      const timer = setTimeout(() => setAnimatePrice(false), 1000)
      prevPriceRef.current = effectiveCurrentPrice
      return () => clearTimeout(timer)
    }
    prevPriceRef.current = effectiveCurrentPrice
  }, [effectiveCurrentPrice, phase])

  // ---- Sync copy-delivery checkbox ----
  useEffect(() => {
    if (copyDelivery) {
      setInvoicingAddress({ ...deliveryAddress })
    }
  }, [copyDelivery, deliveryAddress])

  // ---- Handlers ----

  const handleVerify = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await auctionsAPI.verifyBuyer(auction.id, verifyEmail, verifyPassword)
      const buyer = data.buyer
      const session = { auctionBuyerId: buyer.id, bidPassword: verifyPassword, auctionId: auction.id }
      setBuyerSession(session)
      storeSession(auction.id, session)

      if (buyer.hasPaymentMethod) {
        setPhase(PHASE.CONFIRM)
      } else {
        // Need to set up payment first
        await initStripePayment(buyer.id)
        setPhase(PHASE.PAYMENT)
      }
    } catch (err) {
      setError(err.message || 'No se pudo verificar. Comprueba tu email y contraseña.')
    } finally {
      setLoading(false)
    }
  }

  const initStripePayment = async (auctionBuyerId) => {
    const paymentData = await auctionsAPI.setupPayment(auction.id, auctionBuyerId)
    setClientSecret(paymentData.clientSecret)
    setStripeCustomerId(paymentData.customerId)
  }

  const handleRegisterAndSetupPayment = async () => {
    // This is called after Stripe payment is confirmed successfully
    setLoading(true)
    setError('')
    try {
      const effectiveInvoicing = copyDelivery ? deliveryAddress : invoicingAddress
      const buyerData = {
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
        invoicingAddress1: effectiveInvoicing.address_1,
        invoicingAddress2: effectiveInvoicing.address_2,
        invoicingPostalCode: effectiveInvoicing.postal_code,
        invoicingCity: effectiveInvoicing.city,
        invoicingProvince: effectiveInvoicing.province,
        invoicingCountry: effectiveInvoicing.country,
        stripeCustomerId,
      }
      const data = await auctionsAPI.registerBuyer(auction.id, buyerData)
      const buyer = data.buyer
      const session = { auctionBuyerId: buyer.id, bidPassword: buyer.bidPassword, auctionId: auction.id }
      setBuyerSession(session)
      storeSession(auction.id, session)
      setSavedBidPassword(buyer.bidPassword)
      setPhase(PHASE.CONFIRM)
    } catch (err) {
      setError(err.message || 'Error al registrar el pujador.')
    } finally {
      setLoading(false)
    }
  }

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
      await auctionsAPI.sendVerification(auction.id, personalInfo.email, personalInfo.dni.toUpperCase().trim())
      setOtpSent(true)
      setShowResend(false)
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
      await auctionsAPI.verifyEmail(auction.id, personalInfo.email, otpCode)
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

  const handlePlaceBid = async () => {
    setLoading(true)
    setError('')
    setPriceChangedWarning(false)
    try {
      await auctionsAPI.placeBid(auction.id, {
        auctionBuyerId: buyerSession.auctionBuyerId,
        bidPassword: buyerSession.bidPassword,
        productId,
        productType,
        amount: effectiveNextBid,
        expectedPrice: effectiveCurrentPrice,
      })
      // If we don't yet have the password stored for display, show the one from session
      if (!savedBidPassword) {
        setSavedBidPassword(buyerSession.bidPassword)
      }
      setPhase(PHASE.SUCCESS)
      onBidPlaced?.()
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('precio ha cambiado')) {
        // The Socket.IO price_update should have already updated livePriceData
        setPriceChangedWarning(true)
        setAnimatePrice(true)
        setTimeout(() => setAnimatePrice(false), 1000)
        setError('El precio se actualizo. Revisa el nuevo importe y confirma de nuevo.')
      } else {
        setError(msg || 'No se pudo realizar la puja.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Async postal code validation — triggers when delivery postal code changes
  useEffect(() => {
    if (!hasPostalRestrictions) {
      setPostalCodeValid(true)
      return
    }

    const code = deliveryAddress.postal_code?.trim()
    if (!code || code.length < 4 || !auction || !productId || !productType) {
      setPostalCodeValid(null)
      return
    }

    // Debounce validation
    if (postalValidationRef.current) clearTimeout(postalValidationRef.current)
    postalValidationRef.current = setTimeout(async () => {
      try {
        const result = await auctionsAPI.validatePostalCode(auction.id, productId, productType, code)
        setPostalCodeValid(result.valid)
      } catch {
        setPostalCodeValid(null)
      }
    }, 400)

    return () => {
      if (postalValidationRef.current) clearTimeout(postalValidationRef.current)
    }
  }, [deliveryAddress.postal_code, hasPostalRestrictions, auction?.id, productId, productType])

  const isPostalCodeValid = postalCodeValid !== false

  // ---- Step validation helpers ----
  const canProceedPersonal =
    personalInfo.firstName.trim() && personalInfo.lastName.trim() && personalInfo.email.trim() &&
    personalInfo.dni.trim() && !dniError && validateDNI(personalInfo.dni)

  const canProceedDelivery =
    deliveryAddress.address_1.trim() &&
    deliveryAddress.postal_code.trim() &&
    deliveryAddress.city.trim() &&
    deliveryAddress.province.trim() &&
    isPostalCodeValid

  const canProceedInvoicing =
    copyDelivery ||
    (invoicingAddress.address_1.trim() &&
      invoicingAddress.postal_code.trim() &&
      invoicingAddress.city.trim() &&
      invoicingAddress.province.trim())

  // ---- Render helpers ----
  const renderChoose = () => (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">Selecciona una opcion para continuar:</p>
      <button
        type="button"
        onClick={() => setPhase(PHASE.VERIFY)}
        className="w-full rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
      >
        Ya he pujado antes
      </button>
      <button
        type="button"
        onClick={() => setPhase(PHASE.TERMS)}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
      >
        Nuevo pujador
      </button>
    </div>
  )

  const renderVerify = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setPhase(PHASE.CHOOSE)}
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
        <label className="block text-sm font-medium text-gray-900">Contraseña de puja</label>
        <input
          type="password"
          value={verifyPassword}
          onChange={(e) => setVerifyPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
          placeholder="Contraseña recibida al registrarte"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
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

  const renderTerms = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setPhase(PHASE.CHOOSE)}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Volver
      </button>
      <p className="text-sm font-medium text-gray-900">Acepta los terminos para continuar:</p>
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
          {' '}de la subasta y entiendo que cada puja es vinculante.
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
        disabled={!termsAccepted[0] || !termsAccepted[1]}
        onClick={() => { setError(''); setPhase(PHASE.PERSONAL) }}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        Continuar
      </button>
    </div>
  )

  const renderPersonal = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setPhase(PHASE.TERMS)}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Volver
      </button>
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={handleSendVerification}
            disabled={loading || !canProceedPersonal}
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
        </>
      )}
    </div>
  )

  const renderAddressFields = (address, setAddress, showBack, backPhase, isDeliveryAddress = false) => {
    const showPostalCodeError = isDeliveryAddress && address.postal_code && postalCodeValid === false

    return (
      <div className="space-y-4">
        {showBack && (
          <button
            type="button"
            onClick={() => setPhase(backPhase)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Volver
          </button>
        )}

        {/* Postal code error alert with shipping observations */}
        {showPostalCodeError && (
          <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
            <p className="text-sm font-medium text-amber-800">
              El código postal introducido no está disponible para este artículo. Contacta con info@140d.art para obtener ayuda.
            </p>
            {product?.shipping_observations && (
              <p className="mt-2 text-sm text-amber-700">
                {product.shipping_observations}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-900">Direccion (linea 1)</label>
          <input
            type="text"
            value={address.address_1}
            onChange={(e) => setAddress({ ...address, address_1: e.target.value })}
            className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900">Direccion (linea 2)</label>
          <input
            type="text"
            value={address.address_2}
            onChange={(e) => setAddress({ ...address, address_2: e.target.value })}
            className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900">Codigo postal</label>
            <input
              type="text"
              value={address.postal_code}
              onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
              className={`mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm ${
                showPostalCodeError
                  ? 'ring-red-500'
                  : 'ring-gray-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900">Ciudad</label>
            <input
              type="text"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
              className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900">Provincia</label>
            <input
              type="text"
              value={address.province}
              onChange={(e) => setAddress({ ...address, province: e.target.value })}
              className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900">Pais</label>
            <input
              type="text"
              value={address.country}
              disabled
              className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-gray-500 bg-gray-50 shadow-sm ring-1 ring-inset ring-gray-300 sm:text-sm"
            />
          </div>
        </div>
      </div>
    )
  }

  const renderDelivery = () => (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-900">Direccion de entrega</p>
      {renderAddressFields(deliveryAddress, setDeliveryAddress, true, PHASE.PERSONAL, true)}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={!canProceedDelivery}
        onClick={() => { setError(''); setPhase(PHASE.INVOICING) }}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        Continuar
      </button>
    </div>
  )

  const renderInvoicing = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setPhase(PHASE.DELIVERY)}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Volver
      </button>
      <p className="text-sm font-medium text-gray-900">Direccion de facturacion</p>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={copyDelivery}
          onChange={(e) => setCopyDelivery(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
        />
        <span className="text-sm text-gray-700">Copiar de direccion de entrega</span>
      </label>
      {!copyDelivery && renderAddressFields(invoicingAddress, setInvoicingAddress, false, PHASE.DELIVERY)}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={!canProceedInvoicing}
        onClick={async () => {
          setError('')
          setLoading(true)
          try {
            // Create a temporary buyer registration to get Stripe setup
            // We'll do an initial call to setupPayment with a placeholder buyer id
            // Actually, we register the buyer first, then set up payment
            const effectiveInvoicing = copyDelivery ? deliveryAddress : invoicingAddress
            const buyerData = {
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
              invoicingAddress1: effectiveInvoicing.address_1,
              invoicingAddress2: effectiveInvoicing.address_2,
              invoicingPostalCode: effectiveInvoicing.postal_code,
              invoicingCity: effectiveInvoicing.city,
              invoicingProvince: effectiveInvoicing.province,
              invoicingCountry: effectiveInvoicing.country,
            }
            const data = await auctionsAPI.registerBuyer(auction.id, buyerData)
            const buyer = data.buyer
            const session = {
              auctionBuyerId: buyer.id,
              bidPassword: buyer.bidPassword,
              auctionId: auction.id,
            }
            setBuyerSession(session)
            setSavedBidPassword(buyer.bidPassword)

            // Now setup Stripe payment
            await initStripePayment(buyer.id)
            setPhase(PHASE.PAYMENT)
          } catch (err) {
            setError(err.message || 'Error al configurar el pago.')
          } finally {
            setLoading(false)
          }
        }}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Configurando pago...' : 'Continuar al pago'}
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
          Se verificara tu metodo de pago sin realizar ningun cargo. Tu tarjeta quedara guardada para futuros pagos en caso de ganar la subasta.
        </p>
        <Elements stripe={stripePromise} options={{ clientSecret, locale: 'es' }}>
          <StripePaymentStep
            auctionId={auction.id}
            auctionBuyerId={buyerSession?.auctionBuyerId}
            stripeCustomerId={stripeCustomerId}
            onSuccess={() => {
              // Payment confirmed, save session and go to confirm
              storeSession(auction.id, buyerSession)
              setPhase(PHASE.CONFIRM)
            }}
            onError={(msg) => setError(msg)}
          />
        </Elements>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  const renderConfirm = () => (
    <div className="space-y-6">
      <div className="rounded-lg bg-gray-50 p-4">
        <p className="text-sm text-gray-600">Estas a punto de pujar por:</p>
        <p className="mt-1 text-base font-semibold text-gray-900">{product?.name}</p>
        <p className="text-xs text-justify mt-2 text-gray-600">Se guardarán tus datos de pago y solo se retirará el importe si resultas ganador. Contactaremos contigo antes para acordar la entrega y los gastos de envío.
          En caso de resultar ganador y desistir de la compra, se realizará un cargo del 10% del valor de la obra (ver condiciones)
        </p>
        <p className={`mt-3 text-2xl font-bold transition-all duration-500 ${
          animatePrice ? 'scale-110 text-red-600' : 'text-gray-900'
        }`}>
          {formatCurrency(effectiveNextBid)}
        </p>
      </div>

      {priceChangedWarning && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm font-medium text-amber-800">
            El precio ha cambiado porque se acaba de realizar una puja
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handlePlaceBid}
        disabled={loading}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Enviando puja...' : `Confirmar puja de ${formatCurrency(effectiveNextBid)}`}
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

  const renderSuccess = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <CheckIcon className="h-6 w-6 text-green-600" />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900">Puja realizada con exito</p>
        <p className="mt-1 text-sm text-gray-600">
          Tu puja de {formatCurrency(nextBid)} por {product?.name} ha sido registrada.
        </p>
      </div>
      {savedBidPassword && (
        <div className="rounded-lg border-2 border-gray-900 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Guarda esta contraseña</p>
          <p className="mt-1 text-xs text-gray-600">
            La necesitaras para pujar de nuevo en esta subasta.
          </p>
          <p className="mt-3 select-all text-center text-lg font-mono font-bold tracking-widest text-gray-900">
            {savedBidPassword}
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

  // ---- Phase title ----
  const phaseTitle = {
    [PHASE.CHOOSE]: 'Pujar',
    [PHASE.VERIFY]: 'Verificar identidad',
    [PHASE.TERMS]: 'Paso 1 de 5 - Terminos',
    [PHASE.PERSONAL]: 'Paso 2 de 5 - Datos personales',
    [PHASE.DELIVERY]: 'Paso 3 de 5 - Direccion de entrega',
    [PHASE.INVOICING]: 'Paso 4 de 5 - Direccion de facturacion',
    [PHASE.PAYMENT]: 'Paso 5 de 5 - Metodo de pago',
    [PHASE.CONFIRM]: 'Confirmar puja',
    [PHASE.SUCCESS]: 'Puja completada',
  }

  const phaseRenderers = {
    [PHASE.CHOOSE]: renderChoose,
    [PHASE.VERIFY]: renderVerify,
    [PHASE.TERMS]: renderTerms,
    [PHASE.PERSONAL]: renderPersonal,
    [PHASE.DELIVERY]: renderDelivery,
    [PHASE.INVOICING]: renderInvoicing,
    [PHASE.PAYMENT]: renderPayment,
    [PHASE.CONFIRM]: renderConfirm,
    [PHASE.SUCCESS]: renderSuccess,
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

            <DialogTitle as="h3" className="text-base font-semibold text-gray-900 mb-4 pr-8">
              {phaseTitle[phase]}
            </DialogTitle>

            {/* Step progress indicator for new bidder flow */}
            {[PHASE.TERMS, PHASE.PERSONAL, PHASE.DELIVERY, PHASE.INVOICING, PHASE.PAYMENT].includes(phase) && (
              <div className="mb-6">
                <div className="flex gap-1">
                  {[PHASE.TERMS, PHASE.PERSONAL, PHASE.DELIVERY, PHASE.INVOICING, PHASE.PAYMENT].map((step, i) => (
                    <div
                      key={step}
                      className={`h-1 flex-1 rounded-full ${
                        [PHASE.TERMS, PHASE.PERSONAL, PHASE.DELIVERY, PHASE.INVOICING, PHASE.PAYMENT].indexOf(phase) >= i
                          ? 'bg-gray-900'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {phaseRenderers[phase]?.()}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Stripe Payment sub-component (must be rendered inside <Elements>)
// ---------------------------------------------------------------------------
function StripePaymentStep({ auctionId, auctionBuyerId, stripeCustomerId, onSuccess, onError }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    onError('')
    try {
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      })

      if (stripeError) {
        onError(stripeError.message)
        setLoading(false)
        return
      }

      if (setupIntent && setupIntent.status === 'succeeded') {
        // Confirm on our backend
        await auctionsAPI.confirmPayment(auctionId, auctionBuyerId, setupIntent.id, stripeCustomerId)
        onSuccess()
      } else {
        onError('La verificacion no se pudo completar. Intentalo de nuevo.')
      }
    } catch (err) {
      onError(err.message || 'Error al verificar el metodo de pago.')
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
        {loading ? 'Verificando...' : 'Verificar metodo de pago'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function getStoredSession(auctionId) {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`auction_buyer_${auctionId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function storeSession(auctionId, session) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`auction_buyer_${auctionId}`, JSON.stringify(session))
  } catch {
    // Silently ignore storage errors
  }
}
