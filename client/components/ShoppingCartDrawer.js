'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'
import { getArtImageUrl, getOthersImageUrl, ordersAPI } from '@/lib/api'
import CountryCodeSelector from './CountryCodeSelector'
import AddressAutocomplete from './AddressAutocomplete'
import AddressManualInput from './AddressManualInput'

export default function ShoppingCartDrawer({ open, onClose }) {
  // Get address functionality mode from environment variable
  const addressMode = process.env.NEXT_PUBLIC_CART_ADDRESS_FUNC || 'manual'
  const googlePayEnabled = (process.env.NEXT_PUBLIC_GOOGLE_PAY_ENABLED || 'false') === 'true'
  const googlePayEnv = process.env.NEXT_PUBLIC_GOOGLE_PAY_ENV || 'TEST'
  const googlePayMerchantId = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID || 'BCR2DN4T6D4YQ3XXXXXX' // placeholder
  const googlePayMerchantName = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_NAME || 'Kuadrat (Sandbox)'
  const { cart, removeFromCart, updateQuantity, getTotalPrice, getSubtotal, getTotalShipping, clearCart } = useCart()
  const { user } = useAuth()
  const { showBanner } = useBannerNotification()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [showContactSelection, setShowContactSelection] = useState(false)
  const [showAddressInput, setShowAddressInput] = useState(false)
  const [contactMethod, setContactMethod] = useState('email')
  const [contactEmail, setContactEmail] = useState('')
  const [contactCountryCode, setContactCountryCode] = useState('+34')
  const [contactPhone, setContactPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState({})
  const [invoicingAddress, setInvoicingAddress] = useState({})
  const [useSameAddressForInvoicing, setUseSameAddressForInvoicing] = useState(true)
  const [addressError, setAddressError] = useState('')

  // Google Pay integration state
  const [gpayReady, setGpayReady] = useState(false)
  const [gpayLoading, setGpayLoading] = useState(false)
  const gpayBtnContainerRef = useRef(null)
  const gpayBtnRenderedRef = useRef(false)

  const getImageUrl = (item) => {
    return item.productType === 'art'
      ? getArtImageUrl(item.basename)
      : getOthersImageUrl(item.basename)
  }

  const getProductUrl = (item) => {
    return item.productType === 'art'
      ? `/galeria/p/${item.slug}`
      : `/galeria/mas/p/${item.slug}`
  }

  const handleQuantityChange = (item, newQuantity) => {
    const qty = parseInt(newQuantity, 10)
    if (qty > 0 && qty <= 10) {
      updateQuantity(item.productId, item.productType, qty, item.variantId)
    }
  }

  const handleRemove = (item) => {
    removeFromCart(item.productId, item.productType, item.variantId)
  }

  const handleCheckout = () => {
    // Pre-fill email if user is logged in
    if (user?.email) {
      setContactEmail(user.email)
    }
    // Show contact selection
    setShowContactSelection(true)
  }

  const handleBackToCart = () => {
    setShowContactSelection(false)
    setShowAddressInput(false)
  }

  const handleBackToContact = () => {
    setShowAddressInput(false)
  }

  // Check if cart has any delivery shipping methods
  const hasDeliveryShipping = () => {
    return cart.some(item => item.shipping?.methodType === 'delivery')
  }

  // Check if all products use pickup shipping
  const allPickupShipping = () => {
    return cart.length > 0 && cart.every(item => item.shipping?.methodType === 'pickup')
  }

  const isContactValid = () => {
    if (contactMethod === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(contactEmail.trim())
    } else if (contactMethod === 'whatsapp') {
      // Phone must be digits only and between 6-15 characters
      const phoneRegex = /^\d{6,15}$/
      return phoneRegex.test(contactPhone.trim())
    }
    return false
  }

  const handleContinueToAddress = () => {
    if (!isContactValid()) {
      showBanner('Por favor, introduce un contacto válido')
      return
    }

    // Move to address input step
    setShowContactSelection(false)
    setShowAddressInput(true)
  }

  const isAddressValid = () => {
    const needsDelivery = hasDeliveryShipping()
    const needsInvoicing = allPickupShipping() || !useSameAddressForInvoicing

    // Validate delivery address if needed
    if (needsDelivery) {
      if (!deliveryAddress.line1 || !deliveryAddress.postalCode || !deliveryAddress.city || !deliveryAddress.province || !deliveryAddress.country) {
        setAddressError('Por favor, completa la dirección de entrega')
        return false
      }
    }

    // Validate invoicing address if needed
    if (needsInvoicing && !useSameAddressForInvoicing) {
      if (!invoicingAddress.line1 || !invoicingAddress.postalCode || !invoicingAddress.city || !invoicingAddress.province || !invoicingAddress.country) {
        setAddressError('Por favor, completa la dirección de facturación')
        return false
      }
    }

    // Validate that postal code matches all delivery shipping methods
    if (needsDelivery) {
      const deliveryPostalCode = deliveryAddress.postalCode
      const incompatibleItems = cart.filter(item => {
        if (item.shipping?.methodType === 'delivery') {
          // Check if the shipping method's postal code matches
          const shippingPostalCode = item.shipping.deliveryPostalCode
          return shippingPostalCode && shippingPostalCode !== deliveryPostalCode
        }
        return false
      })

      if (incompatibleItems.length > 0) {
        setAddressError(`El código postal ${deliveryPostalCode} no está disponible para todos los métodos de envío seleccionados`)
        return false
      }
    }

    setAddressError('')
    return true
  }

  const handleProceedToPayment = async () => {
    if (!isAddressValid()) {
      return
    }

    setIsProcessing(true)
    try {
      // Convert cart items to order items format
      const orderItems = cart.flatMap(item => {
        const baseItem = {
          type: item.productType === 'art' ? 'art' : 'other',
          id: item.productId,
          shipping: item.shipping,
        }

        if (item.productType === 'other') {
          baseItem.variantId = item.variantId
        }

        // Create multiple items for quantity > 1
        return Array(item.quantity).fill(baseItem)
      })

      // Prepare contact data
      const contactData = contactMethod === 'email'
        ? contactEmail.trim()
        : `${contactCountryCode}${contactPhone.trim()}`

      // Prepare address data
      const finalDeliveryAddress = hasDeliveryShipping() ? deliveryAddress : null
      const finalInvoicingAddress = useSameAddressForInvoicing ? deliveryAddress : invoicingAddress

      const response = await ordersAPI.create(
        orderItems,
        contactData,
        contactMethod,
        finalDeliveryAddress,
        finalInvoicingAddress
      )

      const token = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`

      sessionStorage.setItem(`order_token_${token}`, JSON.stringify({
        orderId: response.order.id,
        contact: contactData,
        contactType: contactMethod,
      }))

      clearCart()

      setShowContactSelection(false)
      setShowAddressInput(false)
      setContactEmail('')
      setContactPhone('')
      setContactMethod('email')
      setDeliveryAddress({})
      setInvoicingAddress({})
      setUseSameAddressForInvoicing(true)

      setTimeout(() => {
        router.push(`/order-confirmation?token=${token}`)
        onClose()
      }, 50)
    } catch (err) {
      showBanner(err.message || 'Compra fallida. Por favor, inténtalo de nuevo.')
    } finally {
      setIsProcessing(false)
    }
  }

  // ------------------------
  // Google Pay Express Checkout
  // ------------------------

  // Load Google Pay script once
  const loadGooglePayScript = () => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('Window not available'))
      if (window.google && window.google.payments && window.google.payments.api) return resolve()
      const existing = document.querySelector('script[src="https://pay.google.com/gp/p/js/pay.js"]')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('Google Pay script failed')))
        return
      }
      const script = document.createElement('script')
      script.src = 'https://pay.google.com/gp/p/js/pay.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Google Pay script failed'))
      document.head.appendChild(script)
    })
  }

  const getPaymentsClient = () => {
    if (!(window.google && window.google.payments && window.google.payments.api)) return null
    const client = new window.google.payments.api.PaymentsClient({
      environment: googlePayEnv === 'PRODUCTION' ? 'PRODUCTION' : 'TEST',
    })
    return client
  }

  const getBaseCardPaymentMethod = () => ({
    type: 'CARD',
    parameters: {
      allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
      allowedCardNetworks: ['VISA', 'MASTERCARD'],
      billingAddressRequired: false,
    },
    tokenizationSpecification: {
      type: 'PAYMENT_GATEWAY',
      parameters: {
        // IMPORTANT: This is only for sandbox/demo. Replace with your real gateway when moving to production.
        gateway: process.env.NEXT_PUBLIC_GOOGLE_PAY_GATEWAY || 'example',
        gatewayMerchantId: process.env.NEXT_PUBLIC_GOOGLE_PAY_GATEWAY_MERCHANT_ID || 'exampleGatewayMerchantId',
      },
    },
  })

  const buildPaymentDataRequest = () => {
    const total = getTotalPrice().toFixed(2)
    const merchantInfo = googlePayEnv === 'PRODUCTION'
      ? { merchantId: googlePayMerchantId, merchantName: googlePayMerchantName }
      : { merchantName: googlePayMerchantName }
    return {
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [getBaseCardPaymentMethod()],
      merchantInfo,
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPrice: total,
        currencyCode: 'EUR',
        countryCode: 'ES',
      },
      shippingAddressRequired: true,
      shippingAddressParameters: {
        allowedCountryCodes: ['ES'],
        phoneNumberRequired: true,
      },
      emailRequired: true,
    }
  }

  const initGooglePay = async () => {
    try {
      setGpayLoading(true)
      await loadGooglePayScript()
      const client = getPaymentsClient()
      if (!client) throw new Error('Google Pay no disponible')

      const isReadyToPayRequest = {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [getBaseCardPaymentMethod()],
      }

      const { result } = await client.isReadyToPay(isReadyToPayRequest)
      if (result) {
        setGpayReady(true)
        // Render the official button if not already
        if (gpayBtnContainerRef.current && !gpayBtnRenderedRef.current) {
          const button = client.createButton({
            onClick: onGooglePayButtonClicked,
            buttonColor: 'black',
            buttonType: 'long',
          })
          gpayBtnContainerRef.current.innerHTML = ''
          gpayBtnContainerRef.current.appendChild(button)
          gpayBtnRenderedRef.current = true
        }
      } else {
        setGpayReady(false)
      }
    } catch (err) {
      console.error('Google Pay init error:', err)
      setGpayReady(false)
    } finally {
      setGpayLoading(false)
    }
  }

  // Initialize Google Pay when drawer opens on the first step and shipping is selected
  useEffect(() => {
    const onFirstStep = !showContactSelection && !showAddressInput
    const allHaveShipping = cart.length > 0 && cart.every(item => !!item.shipping)
    if (open && googlePayEnabled && onFirstStep && allHaveShipping) {
      initGooglePay()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, googlePayEnabled, showContactSelection, showAddressInput, cart])

  const onGooglePayButtonClicked = async () => {
    try {
      setIsProcessing(true)
      const client = getPaymentsClient()
      if (!client) throw new Error('Google Pay no disponible')
      const paymentDataRequest = buildPaymentDataRequest()
      const paymentData = await client.loadPaymentData(paymentDataRequest)

      // Extract payer email and shipping address from Google Pay response
      const email = paymentData.email || user?.email || ''
      const shipping = paymentData.shippingAddress || {}

      // Map Google Pay shipping to our address model
      const gDelivery = {
        line1: shipping.address1 || '',
        line2: [shipping.address2, shipping.address3].filter(Boolean).join(' ').trim() || null,
        postalCode: shipping.postalCode || '',
        city: shipping.locality || '',
        province: shipping.administrativeArea || '',
        country: shipping.countryCode || 'ES',
      }

      // Invoicing address equals delivery by default
      const gInvoicing = { ...gDelivery }

      // Convert cart items to order items format (same logic as standard flow)
      const orderItems = cart.flatMap(item => {
        const baseItem = {
          type: item.productType === 'art' ? 'art' : 'other',
          id: item.productId,
          shipping: item.shipping,
        }
        if (item.productType === 'other') {
          baseItem.variantId = item.variantId
        }
        return Array(item.quantity).fill(baseItem)
      })

      // Validate that postal code matches all delivery shipping methods (same rule as manual flow)
      const deliveryPostalCode = gDelivery.postalCode
      const incompatibleItems = cart.filter(item => {
        if (item.shipping?.methodType === 'delivery') {
          const shippingPostalCode = item.shipping.deliveryPostalCode
          return shippingPostalCode && shippingPostalCode !== deliveryPostalCode
        }
        return false
      })

      if (incompatibleItems.length > 0) {
        showBanner(`El código postal ${deliveryPostalCode} no está disponible para todos los métodos de envío seleccionados`)
        return
      }

      // Create order via API using email for contact (so confirmation email is sent)
      const response = await ordersAPI.create(
        orderItems,
        email,
        'email',
        gDelivery,
        gInvoicing
      )

      // Prepare confirmation token and redirect
      const token = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
      sessionStorage.setItem(`order_token_${token}`, JSON.stringify({
        orderId: response.order.id,
        contact: email,
        contactType: 'email',
      }))

      clearCart()
      setShowContactSelection(false)
      setShowAddressInput(false)
      setContactEmail('')
      setContactPhone('')
      setContactMethod('email')
      setDeliveryAddress({})
      setInvoicingAddress({})
      setUseSameAddressForInvoicing(true)

      setTimeout(() => {
        router.push(`/order-confirmation?token=${token}`)
        onClose()
      }, 50)
    } catch (err) {
      if (err && err.status === 'CANCELED' || err?.statusCode === 'CANCELED') {
        // User canceled the sheet; no banner
        return
      }
      console.error('Google Pay error:', err)
      showBanner(err.message || 'Pago con Google Pay fallido. Por favor, inténtalo de nuevo.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-10">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity duration-500 ease-in-out data-[closed]:opacity-0"
      />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
            <DialogPanel
              transition
              className="pointer-events-auto w-screen max-w-md lg:max-w-2xl transform transition duration-500 ease-in-out data-[closed]:translate-x-full sm:duration-700"
            >
              <div className="flex h-full flex-col overflow-y-auto bg-white shadow-xl">
                {/* Make the entire drawer content share a single scroll. Remove inner overflow to avoid nested scrolls. */}
                <div className="flex-1 px-4 py-6 sm:px-6">
                  <div className="flex items-start justify-between">
                    <DialogTitle className="text-lg font-medium text-gray-900">Carrito de compra</DialogTitle>
                    <div className="ml-3 flex h-7 items-center">
                      <button
                        type="button"
                        onClick={onClose}
                        className="relative -m-2 p-2 text-gray-400 hover:text-gray-500"
                      >
                        <span className="absolute -inset-0.5" />
                        <span className="sr-only">Cerrar panel</span>
                        <XMarkIcon aria-hidden="true" className="size-6" />
                      </button>
                    </div>
                  </div>

                  {cart.length === 0 ? (
                    <div className="mt-8 text-center">
                      <p className="text-gray-500">Tu carrito está vacío</p>
                    </div>
                  ) : (
                    <div className="mt-8">
                      <div className="flow-root">
                        <ul role="list" className="-my-6 divide-y divide-gray-200">
                          {cart.map((item) => (
                            <li key={item.id} className="flex py-6">
                              <div className="size-32 shrink-0 overflow-hidden rounded-md border border-gray-200">
                                <img
                                  alt={item.name}
                                  src={getImageUrl(item)}
                                  className="size-full object-cover"
                                />
                              </div>

                              <div className="ml-4 flex flex-1 flex-col">
                                <div>
                                  <div className="flex justify-between text-base font-medium text-gray-900">
                                    <h3>
                                      <Link
                                        href={getProductUrl(item)}
                                        onClick={onClose}
                                        className="hover:text-gray-600"
                                      >
                                        {item.name}
                                      </Link>
                                    </h3>
                                    <p className="ml-4">€{(item.price * item.quantity).toFixed(2)}</p>
                                  </div>
                                  {item.variantKey && (
                                    <p className="mt-1 text-sm text-gray-500">{item.variantKey}</p>
                                  )}
                                  {item.shipping && (
                                    <div className="mt-1 text-sm text-gray-500">
                                      <p>
                                        <span className="font-medium">Envío:</span> {item.shipping.methodName}
                                        {item.shipping.methodType === 'pickup' && ' (Recogida)'}
                                        {' · '}€{item.shipping.cost.toFixed(2)}
                                      </p>
                                      {item.shipping.estimatedDays && (
                                        <p className="text-xs text-gray-400">
                                          Entrega estimada: {item.shipping.estimatedDays} días
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {!item.shipping && (
                                    <p className="mt-1 text-xs text-amber-600">
                                      ⚠ Método de envío no seleccionado
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-1 items-end justify-between text-sm">
                                  {item.productType === 'art' ? (
                                    <p className="text-gray-500">Cantidad: {item.quantity}</p>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <label htmlFor={`quantity-${item.id}`} className="text-gray-500">
                                        Cantidad:
                                      </label>
                                      <select
                                        id={`quantity-${item.id}`}
                                        value={item.quantity}
                                        onChange={(e) => handleQuantityChange(item, e.target.value)}
                                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-black focus:ring-1 focus:ring-black"
                                      >
                                        {[...Array(10)].map((_, i) => (
                                          <option key={i + 1} value={i + 1}>
                                            {i + 1}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  <div className="flex">
                                    <button
                                      type="button"
                                      onClick={() => handleRemove(item)}
                                      className="font-medium text-black hover:text-gray-600"
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="border-t border-gray-200 px-4 py-6 sm:px-6">
                    {/* Address Input Step - Shows after contact selection */}
                    {showAddressInput && (
                      <div className="mb-6 space-y-6">
                        {addressError && (
                          <div className="rounded-lg bg-red-50 p-4">
                            <p className="text-sm text-red-800">{addressError}</p>
                          </div>
                        )}

                        {/* Delivery Address - Show if any product has delivery shipping */}
                        {hasDeliveryShipping() && (
                          addressMode === 'autocomplete' ? (
                            <AddressAutocomplete
                              value={deliveryAddress}
                              onChange={setDeliveryAddress}
                              label="Dirección de entrega"
                              defaultCountry="ES"
                              showMap={true}
                            />
                          ) : (
                            <AddressManualInput
                              value={deliveryAddress}
                              onChange={setDeliveryAddress}
                              label="Dirección de entrega"
                              defaultCountry="ES"
                            />
                          )
                        )}

                        {/* Checkbox for using same address for invoicing */}
                        {hasDeliveryShipping() && (
                          <div className="flex items-center">
                            <input
                              id="same-address"
                              type="checkbox"
                              checked={useSameAddressForInvoicing}
                              onChange={(e) => setUseSameAddressForInvoicing(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                            />
                            <label htmlFor="same-address" className="ml-2 block text-sm text-gray-900">
                              Usar la misma dirección para facturación
                            </label>
                          </div>
                        )}

                        {/* Invoicing Address - Show if checkbox is unchecked OR all products are pickup */}
                        {(allPickupShipping() || !useSameAddressForInvoicing) && (
                          addressMode === 'autocomplete' ? (
                            <AddressAutocomplete
                              value={invoicingAddress}
                              onChange={setInvoicingAddress}
                              label="Dirección de facturación"
                              defaultCountry="ES"
                              showMap={false}
                            />
                          ) : (
                            <AddressManualInput
                              value={invoicingAddress}
                              onChange={setInvoicingAddress}
                              label="Dirección de facturación"
                              defaultCountry="ES"
                            />
                          )
                        )}
                      </div>
                    )}

                    {/* Contact Selection - Shows when user clicks "Completar compra" */}
                    {showContactSelection && (
                      <div className="mb-6">
                        <h3 className="text-sm font-medium text-gray-900 mb-3">
                          Elige el medio de contacto y actualizaciones para este pedido
                        </h3>
                        <fieldset aria-label="Contact method" className="-space-y-px rounded-md bg-white">
                          {/* Email Option */}
                          <label
                            className="group flex border border-gray-200 p-4 first:rounded-tl-md first:rounded-tr-md last:rounded-br-md last:rounded-bl-md focus:outline-hidden has-[:checked]:relative has-[:checked]:border-gray-400 has-[:checked]:bg-gray-50"
                          >
                            <input
                              type="radio"
                              name="contact-method"
                              value="email"
                              checked={contactMethod === 'email'}
                              onChange={(e) => setContactMethod(e.target.value)}
                              className="relative mt-0.5 size-4 shrink-0 appearance-none rounded-full border border-gray-300 bg-white before:absolute before:inset-1 before:rounded-full before:bg-white not-checked:before:hidden checked:border-gray-900 checked:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            />
                            <span className="ml-3 flex flex-col flex-1">
                              <span className="block text-sm font-medium text-gray-900 group-has-[:checked]:text-gray-900">
                                Correo electrónico
                              </span>
                              <span className="block text-sm text-gray-500 group-has-[:checked]:text-gray-700">
                                Recibirás la confirmación por email
                              </span>
                                {contactMethod === 'email' && (
                                <div className="mt-3">
                                  <input
                                    type="email"
                                    placeholder="tu@email.com"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black"
                                  />
                                </div>
                                )}
                            </span>
                          </label>

                          {/* WhatsApp Option */}
                          <label
                            className="group flex border border-gray-200 p-4 first:rounded-tl-md first:rounded-tr-md last:rounded-br-md last:rounded-bl-md focus:outline-hidden has-[:checked]:relative has-[:checked]:border-gray-400 has-[:checked]:bg-gray-50"
                          >
                            <input
                              type="radio"
                              name="contact-method"
                              value="whatsapp"
                              checked={contactMethod === 'whatsapp'}
                              onChange={(e) => setContactMethod(e.target.value)}
                              className="relative mt-0.5 size-4 shrink-0 appearance-none rounded-full border border-gray-300 bg-white before:absolute before:inset-1 before:rounded-full before:bg-white not-checked:before:hidden checked:border-gray-900 checked:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            />
                            <span className="ml-3 flex flex-col flex-1">
                              <span className="block text-sm font-medium text-gray-900 group-has-[:checked]:text-gray-900">
                                WhatsApp
                              </span>
                              <span className="block text-sm text-gray-500 group-has-[:checked]:text-gray-700">
                                Recibirás actualizaciones por WhatsApp
                              </span>
                                {contactMethod === 'whatsapp' && (
                                <div className="mt-3 flex gap-2">
                                  <CountryCodeSelector
                                    value={contactCountryCode}
                                    onChange={setContactCountryCode}
                                  />
                                  <input
                                    type="tel"
                                    placeholder="600123456"
                                    value={contactPhone}
                                    onChange={(e) => {
                                      // Only allow digits
                                      const value = e.target.value.replace(/\D/g, '')
                                      setContactPhone(value)
                                    }}
                                    maxLength="15"
                                    className="block flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black"
                                  />
                                </div>
                                )}
                            </span>
                          </label>
                        </fieldset>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <p>Subtotal productos</p>
                        <p>€{getSubtotal().toFixed(2)}</p>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600">
                        <p>Envío</p>
                        <p>€{getTotalShipping().toFixed(2)}</p>
                      </div>
                      <div className="flex justify-between text-base font-medium text-gray-900 pt-2 border-t border-gray-200">
                        <p>Total</p>
                        <p>€{getTotalPrice().toFixed(2)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Los impuestos se calcularán según tu ubicación.</p>
                    <div className="mt-6">
                      {!showContactSelection && !showAddressInput ? (
                        // Step 1: Cart view - Show "Completar compra"
                        <button
                          onClick={handleCheckout}
                          disabled={isProcessing || cart.some(item => !item.shipping)}
                          className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? 'Procesando...' : 'Completar compra'}
                        </button>
                      ) : showContactSelection ? (
                        // Step 2: Contact selection - Show "Continuar"
                        <button
                          onClick={handleContinueToAddress}
                          disabled={isProcessing || !isContactValid()}
                          className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? 'Procesando...' : 'Continuar'}
                        </button>
                      ) : (
                        // Step 3: Address input - Show "Ir al pago"
                        <button
                          onClick={handleProceedToPayment}
                          disabled={isProcessing}
                          className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? 'Procesando...' : 'Ir al pago'}
                        </button>
                      )}
                      {/* Google Pay Express Checkout */}
                      {!showContactSelection && !showAddressInput && googlePayEnabled && (
                        <div className="mt-3">
                          {/* Official Google Pay button will render here */}
                          <div ref={gpayBtnContainerRef} className="flex justify-center"></div>
                          {!gpayReady && !gpayLoading && (
                            <button
                              onClick={initGooglePay}
                              disabled={isProcessing || cart.some(item => !item.shipping)}
                              className="mt-2 flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isProcessing ? 'Procesando...' : 'Pagar con Google Pay'}
                            </button>
                          )}
                        </div>
                      )}
                      {cart.some(item => !item.shipping) && !showContactSelection && !showAddressInput && (
                        <p className="mt-2 text-xs text-center text-amber-600">
                          Algunos productos no tienen método de envío seleccionado
                        </p>
                      )}
                    </div>
                    <div className="mt-6 flex justify-center text-center text-sm text-gray-500">
                      <p>
                        {showAddressInput ? (
                          <button
                            type="button"
                            onClick={handleBackToContact}
                            className="font-medium text-black hover:text-gray-600"
                          >
                            <span aria-hidden="true">&larr; </span>
                            Volver al carrito
                          </button>
                        ) : showContactSelection ? (
                          <button
                            type="button"
                            onClick={handleBackToCart}
                            className="font-medium text-black hover:text-gray-600"
                          >
                            <span aria-hidden="true">&larr; </span>
                            Volver al carrito
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={onClose}
                            className="font-medium text-black hover:text-gray-600"
                          >
                            Continuar comprando
                            <span aria-hidden="true"> &rarr;</span>
                          </button>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
