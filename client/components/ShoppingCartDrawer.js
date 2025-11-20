'use client'

import {useEffect, useRef, useState} from 'react'
import {useRouter} from 'next/navigation'
import {Dialog, DialogBackdrop, DialogPanel, DialogTitle} from '@headlessui/react'
import {XMarkIcon, CreditCardIcon} from '@heroicons/react/24/outline'
import Link from 'next/link'
import {useCart} from '@/contexts/CartContext'
import {useAuth} from '@/contexts/AuthContext'
import {useBannerNotification} from '@/contexts/BannerNotificationContext'
import {getArtImageUrl, getOthersImageUrl, ordersAPI, paymentsAPI} from '@/lib/api'
// Removed CountryCodeSelector; phone will be collected as a single field in the address step
import AddressAutocomplete from './AddressAutocomplete'
import AddressManualInput from './AddressManualInput'

export default function ShoppingCartDrawer({open, onClose}) {
    // Get address functionality mode from environment variable
    const addressMode = process.env.NEXT_PUBLIC_CART_ADDRESS_FUNC || 'manual'
    const googlePayEnabled = (process.env.NEXT_PUBLIC_GOOGLE_PAY_ENABLED || 'false') === 'true'
    const googlePayEnv = process.env.NEXT_PUBLIC_GOOGLE_PAY_ENV || 'TEST'
    const googlePayMerchantId = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID || 'BCR2DN4T6D4YQ3XXXXXX' // placeholder
    const googlePayMerchantName = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_NAME || 'Kuadrat (Sandbox)'
    const googlePayLocale = process.env.NEXT_PUBLIC_GOOGLE_PAY_LOCALE || ''
    const {cart, removeFromCart, updateQuantity, getTotalPrice, getSubtotal, getTotalShipping, clearCart} = useCart()
    const {user} = useAuth()
    const {showBanner} = useBannerNotification()
    const router = useRouter()
    const [isProcessing, setIsProcessing] = useState(false)
    const [showAddressInput, setShowAddressInput] = useState(false)
    const [personalInfo, setPersonalInfo] = useState({fullName: '', email: '', phone: ''})
    const [deliveryAddress, setDeliveryAddress] = useState({})
    const [invoicingAddress, setInvoicingAddress] = useState({})
    const [useSameAddressForInvoicing, setUseSameAddressForInvoicing] = useState(true)
    const [addressError, setAddressError] = useState('')
    // Revolut pop-up SDK reference
    const revolutModuleRef = useRef(null)

    // Google Pay integration state
    const [gpayReady, setGpayReady] = useState(false)
    const [gpayLoading, setGpayLoading] = useState(false)
    const gpayBtnContainerRef = useRef(null)
    // When the drawer section unmounts, the DOM node holding the button is removed.
    // Do NOT guard rendering with a persistent flag; always (re)render the button when eligible.

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
        // Pre-fill personal info if user is logged in
        setPersonalInfo((prev) => ({
            ...prev,
            fullName: user?.full_name || user?.name || prev.fullName,
            email: user?.email || prev.email,
            phone: user?.phone || prev.phone,
        }))
        setShowAddressInput(true)
    }

    const handleBackToCart = () => {
        setShowAddressInput(false)
    }

    // Contact selection step removed

    // Check if cart has any delivery shipping methods
    const hasDeliveryShipping = () => {
        return cart.some(item => item.shipping?.methodType === 'delivery')
    }

    // Check if all products use pickup shipping
    const allPickupShipping = () => {
        return cart.length > 0 && cart.every(item => item.shipping?.methodType === 'pickup')
    }

    const isPersonalInfoValid = () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const phoneRegex = /^\+\d{7,15}$/ // E.164-like: + followed by 7-15 digits
        if (!personalInfo.fullName || personalInfo.fullName.trim().length < 2) return false
        if (!emailRegex.test((personalInfo.email || '').trim())) return false
        if (!phoneRegex.test((personalInfo.phone || '').trim())) return false
        return true
    }

    // Removed: no separate contact step

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
        // Validate personal data and addresses first
        if (!isPersonalInfoValid()) {
            showBanner('Por favor, completa la información personal con datos válidos')
            return
        }
        if (!isAddressValid()) {
            return
        }

        setIsProcessing(true)
        try {
            // Prepare items in the format expected by our backend payments endpoint
            const orderItems = cart.flatMap(item => {
                const baseItem = {
                    type: item.productType === 'art' ? 'art' : 'other',
                    id: item.productId,
                    shipping: item.shipping,
                }
                if (item.productType === 'other') baseItem.variantId = item.variantId
                return Array(item.quantity).fill(baseItem)
            })

            if (orderItems.length === 0) {
                showBanner('El carrito está vacío')
                setIsProcessing(false)
                return
            }

            // Build compact items with quantity for Revolut order creation
            const compactItems = cart.map(item => ({
                type: item.productType === 'art' ? 'art' : 'other',
                id: item.productId,
                ...(item.productType === 'other' ? {variantId: item.variantId} : {}),
                quantity: item.quantity,
                shipping: item.shipping,
            }))

            const finalDeliveryAddress = hasDeliveryShipping() ? deliveryAddress : null
            const finalInvoicingAddress = useSameAddressForInvoicing ? deliveryAddress : invoicingAddress

            // 1) Create our internal order first (pending_payment) and also create Revolut order inside API
            const created = await ordersAPI.create(
                orderItems,
                personalInfo.email,
                'email',
                finalDeliveryAddress,
                finalInvoicingAddress,
                {
                    full_name: personalInfo.fullName,
                    email: personalInfo.email,
                    phone: personalInfo.phone,
                }
            )

            const createdOrderId = created?.order?.id
            const revolutOrderId = created?.order?.revolut_order_id
            const revolutToken = created?.revolut?.token
            if (!createdOrderId || !revolutOrderId || !revolutToken) {
                throw new Error('No se pudo preparar el pago. Por favor, inténtalo de nuevo.')
            }

            // Load Revolut Checkout SDK and open Card pop-up
            if (!revolutModuleRef.current) {
                const mod = await import('@revolut/checkout')
                revolutModuleRef.current = mod && (mod.default || mod)
            }
            const envMode = (process.env.NEXT_PUBLIC_REVOLUT_MODE || 'sandbox').toLowerCase()
            const {payWithPopup} = await revolutModuleRef.current(revolutToken, envMode === 'production' ? undefined : 'sandbox')
            const revLocale = process.env.NEXT_PUBLIC_REVOLUT_LOCALE || 'auto'

            payWithPopup({
                email: personalInfo.email,
                ...(revLocale ? {locale: revLocale} : {}),
                onCancel: async () => {
                    // TODO - Maybe call a revolut 'cancel order' endpoint here?
                    setIsProcessing(false)
                },
                onSuccess: async () => {
                    try {
                        // The Revolut SDK does not return a result payload on onSuccess.
                        // Poll our backend to resolve the latest payment for this order and obtain payment_id.
                        let paymentId = null
                        const maxAttempts = 10
                        let attempt = 0
                        let delay = 400 // ms
                        while (attempt < maxAttempts && !paymentId) {
                            try {
                                const resp = await paymentsAPI.getLatestRevolutPayment(revolutOrderId)
                                if (resp && resp.payment_id) {
                                    paymentId = resp.payment_id
                                    break
                                }
                            } catch (e) {
                                // 404 means not ready yet; keep polling. Other errors bubble up.
                                if (e?.status !== 404) {
                                    throw e
                                }
                            }
                            await new Promise((r) => setTimeout(r, delay))
                            attempt++
                            delay = Math.min(1500, Math.floor(delay * 1.5))
                        }

                        if (!paymentId) {
                            throw new Error('No se pudo obtener el identificador del pago de Revolut. Por favor, inténtalo de nuevo.')
                        }

                        // 3) Confirm payment on our API (mark as paid)
                        await ordersAPI.updatePayment({
                            orderId: createdOrderId,
                            paymentId,
                        })

                        const tokenKey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
                        sessionStorage.setItem(`order_token_${tokenKey}`, JSON.stringify({
                            orderId: createdOrderId,
                            contact: personalInfo.email,
                            contactType: 'email',
                        }))

                        clearCart()
                        setShowAddressInput(false)
                        setPersonalInfo({fullName: '', email: '', phone: ''})
                        setDeliveryAddress({})
                        setInvoicingAddress({})
                        setUseSameAddressForInvoicing(true)

                        setTimeout(() => {
                            router.push(`/pedido-completado?token=${tokenKey}`)
                            onClose()
                        }, 50)
                    } catch (err) {
                        console.error('Order creation after payment failed:', err)
                        showBanner(err.message || 'No se pudo registrar el pedido tras el pago.')
                    } finally {
                        setIsProcessing(false)
                    }
                },
                onError: (error) => {
                    console.error('Revolut pop-up error:', error)
                    showBanner(error?.message || 'Error en el pago')
                    setIsProcessing(false)
                },
            })
        } catch (err) {
            console.error('Checkout init error:', err)
            // If failure happened before opening the pop-up (e.g., order creation), show general message
            showBanner('Ha ocurrido un error al procesar el pedido. Inténtalo de nuevo más tarde')
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
            ? {merchantId: googlePayMerchantId, merchantName: googlePayMerchantName}
            : {merchantName: googlePayMerchantName}
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

            const {result} = await client.isReadyToPay(isReadyToPayRequest)
            if (result) {
                setGpayReady(true)
                // Always render (or re-render) the official button to avoid disappearing after unmounts
                if (gpayBtnContainerRef.current) {
                    const buttonOptions = {
                        onClick: onGooglePayButtonClicked,
                        buttonColor: 'black',
                        buttonType: 'long',
                        buttonSizeMode: 'fill', // make it fill its container (so it matches the grid cell width)
                    }
                    if (googlePayLocale) {
                        // Try to force button locale if configured (falls back to browser locale otherwise)
                        buttonOptions.buttonLocale = googlePayLocale
                    }
                    const button = client.createButton(buttonOptions)
                    gpayBtnContainerRef.current.innerHTML = ''
                    gpayBtnContainerRef.current.appendChild(button)
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
        const onFirstStep = !showAddressInput
        const allHaveShipping = cart.length > 0 && cart.every(item => !!item.shipping)
        if (open && googlePayEnabled && onFirstStep && allHaveShipping) {
            initGooglePay()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, googlePayEnabled, showAddressInput, cart])

    // Removed inline card field initialization; Revolut pop-up is opened on demand

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
            const gInvoicing = {...gDelivery}

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
            setShowAddressInput(false)
            setPersonalInfo({fullName: '', email: '', phone: ''})
            setDeliveryAddress({})
            setInvoicingAddress({})
            setUseSameAddressForInvoicing(true)

            setTimeout(() => {
                router.push(`/pedido-completado?token=${token}`)
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
                            className="pointer-events-auto w-screen max-w-md lg:max-w-xl transform transition duration-500 ease-in-out data-[closed]:translate-x-full sm:duration-700"
                        >
                            <div className="flex h-full flex-col overflow-y-auto bg-white shadow-xl">
                                {/* Make the entire drawer content share a single scroll. Remove inner overflow to avoid nested scrolls. */}
                                <div className="flex-1 px-4 py-6 sm:px-6">
                                    <div className="flex items-start justify-between">
                                        <DialogTitle className="text-lg font-medium text-gray-900">Carrito de
                                            compra</DialogTitle>
                                        <div className="ml-3 flex h-7 items-center">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="relative -m-2 p-2 text-gray-400 hover:text-gray-500"
                                            >
                                                <span className="absolute -inset-0.5"/>
                                                <span className="sr-only">Cerrar panel</span>
                                                <XMarkIcon aria-hidden="true" className="size-6"/>
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
                                                            <div
                                                                className="size-32 shrink-0 overflow-hidden rounded-md border border-gray-200">
                                                                <img
                                                                    alt={item.name}
                                                                    src={getImageUrl(item)}
                                                                    className="size-full object-cover"
                                                                />
                                                            </div>

                                                            <div className="ml-4 flex flex-1 flex-col">
                                                                <div>
                                                                    <div
                                                                        className="flex justify-between text-base font-medium text-gray-900">
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
                                                                                <span
                                                                                    className="font-medium">Envío:</span> {item.shipping.methodName}
                                                                                {item.shipping.methodType === 'pickup' && ' (Recogida)'}
                                                                                {' · '}€{item.shipping.cost.toFixed(2)}
                                                                            </p>
                                                                            {item.shipping.estimatedDays && (
                                                                                <p className="text-xs text-gray-400">
                                                                                    Entrega
                                                                                    estimada: {item.shipping.estimatedDays} días
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {!item.shipping && (
                                                                        <p className="mt-1 text-xs text-amber-600">
                                                                            ⚠ Método de envío no seleccionado
                                                                        </p>
                                                                    )}
                                                                    {/* Quantity and remove controls moved just below shipping info */}
                                                                    <div
                                                                        className="mt-3 flex items-center justify-between text-sm">
                                                                        {item.productType === 'art' ? (
                                                                            <p className="text-gray-500">Cantidad: {item.quantity}</p>
                                                                        ) : (
                                                                            <div className="flex items-center gap-2">
                                                                                <label htmlFor={`quantity-${item.id}`}
                                                                                       className="text-gray-500">
                                                                                    Cantidad:
                                                                                </label>
                                                                                <select
                                                                                    id={`quantity-${item.id}`}
                                                                                    value={item.quantity}
                                                                                    onChange={(e) => handleQuantityChange(item, e.target.value)}
                                                                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-black focus:ring-1 focus:ring-black"
                                                                                >
                                                                                    {[...Array(10)].map((_, i) => (
                                                                                        <option key={i + 1}
                                                                                                value={i + 1}>
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
                                                                                className="font-medium text-red-900 hover:bg-red-100 rounded px-2 py-1 transition-colors"
                                                                            >
                                                                                Eliminar
                                                                            </button>
                                                                        </div>
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
                                        {/* Address Input Step */}
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
                                                            personalInfo={personalInfo}
                                                            onPersonalInfoChange={setPersonalInfo}
                                                            showPersonalSection={true}
                                                        />
                                                    ) : (
                                                        <AddressManualInput
                                                            value={deliveryAddress}
                                                            onChange={setDeliveryAddress}
                                                            label="Dirección de entrega"
                                                            defaultCountry="ES"
                                                            personalInfo={personalInfo}
                                                            onPersonalInfoChange={setPersonalInfo}
                                                            showPersonalSection={true}
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
                                                        <label htmlFor="same-address"
                                                               className="ml-2 block text-sm text-gray-900">
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
                                                            personalInfo={personalInfo}
                                                            onPersonalInfoChange={setPersonalInfo}
                                                            showPersonalSection={!hasDeliveryShipping()}
                                                        />
                                                    ) : (
                                                        <AddressManualInput
                                                            value={invoicingAddress}
                                                            onChange={setInvoicingAddress}
                                                            label="Dirección de facturación"
                                                            defaultCountry="ES"
                                                            personalInfo={personalInfo}
                                                            onPersonalInfoChange={setPersonalInfo}
                                                            showPersonalSection={!hasDeliveryShipping()}
                                                        />
                                                    )
                                                )}

                                                {/* Método de pago eliminado: usamos el pop-up de Revolut al pulsar "Pagar" */}
                                            </div>
                                        )}

                                        {/* Paso de selección de contacto eliminado: datos personales se recopilan en el bloque de dirección */}

                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm text-gray-600">
                                                <p>Subtotal productos</p>
                                                <p>€{getSubtotal().toFixed(2)}</p>
                                            </div>
                                            <div className="flex justify-between text-sm text-gray-600">
                                                <p>Envío</p>
                                                <p>€{getTotalShipping().toFixed(2)}</p>
                                            </div>
                                            <div
                                                className="flex justify-between text-base font-medium text-gray-900 pt-2 border-t border-gray-200">
                                                <p>Total</p>
                                                <p>€{getTotalPrice().toFixed(2)}</p>
                                            </div>
                                        </div>
                                        <p className="mt-2 text-xs text-gray-500">Los impuestos se calcularán según tu
                                            ubicación.</p>
                                        <div className="mt-6">
                                            {!showAddressInput ? (
                                                // Step 1: Cart view - Show "Pagar pedido"
                                                <>
                                                    <button
                                                        onClick={handleCheckout}
                                                        disabled={isProcessing || cart.some(item => !item.shipping)}
                                                        className="flex w-full items-center justify-center gap-2 rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <CreditCardIcon aria-hidden="true" className="size-5"/>
                                                        {isProcessing ? 'Procesando...' : 'Pagar pedido'}
                                                    </button>
                                                    {/* Payment buttons row */}
                                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                                        {/* Google Pay Express Checkout */}
                                                        {googlePayEnabled && (
                                                            <div className="col-span-1">
                                                                {/* Official Google Pay button will render here */}
                                                                <div ref={gpayBtnContainerRef}
                                                                     className="flex justify-center w-full min-h-[48px]"></div>
                                                                {!gpayReady && !gpayLoading && (
                                                                    <button
                                                                        onClick={initGooglePay}
                                                                        disabled={isProcessing || cart.some(item => !item.shipping)}
                                                                        className="mt-0 flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    >
                                                                        {isProcessing ? 'Procesando...' : 'Pagar con Google Pay'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {/* Apple Pay placeholder (no functionality yet) */}
                                                        <div className="col-span-1">
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center justify-center rounded-md border border-gray-300 bg-black px-4 py-2.5 text-sm font-medium text-gray-100 hover:bg-gray-50"
                                                            >
                                                                Apple Pay
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                // Step 3: Address input - Show "Pagar"
                                                <button
                                                    onClick={handleProceedToPayment}
                                                    disabled={isProcessing}
                                                    className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isProcessing ? 'Procesando...' : 'Pagar'}
                                                </button>
                                            )}
                                            {cart.some(item => !item.shipping) && !showAddressInput && (
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
