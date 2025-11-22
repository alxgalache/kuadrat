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

// Key used to persist a pending Revolut order for a given cart in sessionStorage
const REVOLUT_ORDER_STORAGE_KEY = 'kuadrat_revolut_order_cache'

export default function ShoppingCartDrawer({open, onClose}) {
    // Get address functionality mode from environment variable
    const addressMode = process.env.NEXT_PUBLIC_CART_ADDRESS_FUNC || 'manual'
    const googlePayEnabled = (process.env.NEXT_PUBLIC_GOOGLE_PAY_ENABLED || 'false') === 'true'
    const googlePayEnv = process.env.NEXT_PUBLIC_GOOGLE_PAY_ENV || 'TEST'
    const googlePayMerchantId = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID || 'BCR2DN4T6D4YQ3XXXXXX' // placeholder
    const googlePayMerchantName = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_NAME || 'Kuadrat (Sandbox)'
    const googlePayLocale = process.env.NEXT_PUBLIC_GOOGLE_PAY_LOCALE || ''
    const {cart, removeFromCart, updateQuantity, getTotalPrice, getSubtotal, getTotalShipping, getShippingBreakdown, clearCart} = useCart()
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
    const [revolutOrderId, setRevolutOrderId] = useState(null)
    const [revolutOrderToken, setRevolutOrderToken] = useState(null)
    // Snapshot of the cart used to initialise the current Revolut order (stringified compact items)
    const [revolutCartSnapshot, setRevolutCartSnapshot] = useState(null)
    // Revolut Checkout SDK and Card Field refs
    const revolutModuleRef = useRef(null)
    const cardFieldContainerRef = useRef(null)
    const cardFieldInstanceRef = useRef(null)
    const currentOrderIdRef = useRef(null)
    const currentRevolutOrderIdRef = useRef(null)

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

    // Build the compact representation of cart items used to initialise a Revolut order.
    // This is also used as a stable snapshot to decide if a stored Revolut order can be reused.
    const buildCompactItems = (items) => (
        items.map(item => ({
            type: item.productType === 'art' ? 'art' : 'other',
            id: item.productId,
            ...(item.productType === 'other' ? {variantId: item.variantId} : {}),
            quantity: item.quantity,
            shipping: item.shipping,
        }))
    )

    const handleQuantityChange = (item, newQuantity) => {
        const qty = parseInt(newQuantity, 10)
        if (qty > 0 && qty <= 10) {
            updateQuantity(item.productId, item.productType, qty, item.variantId)
        }
    }

    const handleRemove = (item) => {
        removeFromCart(item.productId, item.productType, item.variantId)
    }

    // Ensure that every time the drawer is closed, we return to the first step
    // (cart view with the "Completar pedido" button) and clear any address errors.
    const handleCloseDrawer = () => {
        setShowAddressInput(false)
        setAddressError('')
        onClose()
    }

    // On mount, try to restore a pending Revolut order from sessionStorage and reuse it
    // only if the current cart matches the stored cart snapshot. This avoids creating
    // multiple dummy orders when the user closes and reopens the drawer with the same cart.
    // Additionally, whenever the drawer is closed (open becomes false), we reset the step
    // back to the initial cart view so the user always sees the first screen on reopen.
    useEffect(() => {
        if (!open) {
            setShowAddressInput(false)
            setAddressError('')
        }
    }, [open])

    useEffect(() => {
        if (typeof window === 'undefined') return

        try {
            const raw = window.sessionStorage.getItem(REVOLUT_ORDER_STORAGE_KEY)
            if (!raw) return

            const stored = JSON.parse(raw)
            if (!stored || !stored.revolut_order_id || !stored.token || !stored.cartSnapshot) {
                window.sessionStorage.removeItem(REVOLUT_ORDER_STORAGE_KEY)
                return
            }

            const currentSnapshot = JSON.stringify(buildCompactItems(cart))
            if (currentSnapshot === stored.cartSnapshot) {
                setRevolutOrderId(stored.revolut_order_id)
                setRevolutOrderToken(stored.token)
                setRevolutCartSnapshot(stored.cartSnapshot)
                currentRevolutOrderIdRef.current = stored.revolut_order_id
            } else {
                // Cart changed since the stored order was created; discard stale order
                // and attempt to cancel the now-stale Revolut order on the backend.
                try {
                    if (stored.revolut_order_id) {
                        ;(async () => {
                            try {
                                await paymentsAPI.cancelOrder(stored.revolut_order_id)
                            } catch (err) {
                                // Silent failure: if cancel fails, the order will simply
                                // remain in its previous state on Revolut's side.
                                console.warn('No se pudo cancelar la orden de Revolut obsoleta:', err)
                            }
                        })()
                    }
                } catch (_) {
                    // Ignore any unexpected errors around firing the cancellation
                }

                window.sessionStorage.removeItem(REVOLUT_ORDER_STORAGE_KEY)
            }
        } catch (e) {
            console.error('Error restaurando la orden de Revolut desde sessionStorage:', e)
            try {
                window.sessionStorage.removeItem(REVOLUT_ORDER_STORAGE_KEY)
            } catch (_) {
                // ignore storage cleanup errors
            }
        }
        // We intentionally run this effect only once on mount. Cart changes are handled
        // by a dedicated invalidation effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Whenever the cart changes, verify that it still matches the snapshot used for the
    // current Revolut order. If it does not, invalidate the stored order so that a new
    // dummy order will be created the next time the user clicks "Completar pedido".
    // Before invalidating, we also try to cancel the now-unused Revolut order so it
    // does not remain pending on Revolut's side. This cancellation is fire-and-forget
    // and any failure is silently ignored (per requirements).
    useEffect(() => {
        if (!revolutCartSnapshot) return

        const currentSnapshot = JSON.stringify(buildCompactItems(cart))
        if (currentSnapshot !== revolutCartSnapshot) {
            // Cart contents (items, quantities, shipping, etc.) have changed
            if (revolutOrderId) {
                try {
                    ;(async () => {
                        try {
                            await paymentsAPI.cancelOrder(revolutOrderId)
                        } catch (err) {
                            console.warn('No se pudo cancelar la orden de Revolut tras cambios en el carrito:', err)
                        }
                    })()
                } catch (_) {
                    // Ignore any unexpected errors around firing the cancellation
                }
            }

            setRevolutOrderId(null)
            setRevolutOrderToken(null)
            setRevolutCartSnapshot(null)
            currentRevolutOrderIdRef.current = null

            if (typeof window !== 'undefined') {
                try {
                    window.sessionStorage.removeItem(REVOLUT_ORDER_STORAGE_KEY)
                } catch (_) {
                    // ignore storage cleanup errors
                }
            }

            // If the user was on the address/payment step, return them to the cart so they
            // explicitly confirm checkout again with the updated cart.
            if (showAddressInput) {
                setShowAddressInput(false)
            }
        }
    }, [cart, revolutCartSnapshot, showAddressInput, revolutOrderId])

    const handleCheckout = async () => {
        if (cart.length === 0) {
            showBanner('El carrito está vacío')
            return
        }
        if (cart.some(item => !item.shipping)) {
            showBanner('Todos los productos deben tener un método de envío seleccionado')
            return
        }

        setIsProcessing(true)
        try {
            // Build compact items with quantity for Revolut order initialisation
            const compactItems = buildCompactItems(cart)
            const snapshot = JSON.stringify(compactItems)

            // If we already have a Revolut order whose snapshot matches the current cart,
            // reuse it instead of creating a new dummy order in Revolut.
            if (revolutOrderId && revolutOrderToken && revolutCartSnapshot === snapshot) {
                // Pre-fill personal info if user is logged in (in case user logged in/out meanwhile)
                setPersonalInfo((prev) => ({
                    ...prev,
                    fullName: user?.full_name || user?.name || prev.fullName,
                    email: user?.email || prev.email,
                    phone: user?.phone || prev.phone,
                }))

                setShowAddressInput(true)
                setIsProcessing(false)
                return
            }

            const resp = await paymentsAPI.initRevolutOrder(compactItems)

            if (!resp || !resp.revolut_order_id || !resp.token) {
                throw new Error('No se pudo inicializar el pago con Revolut. Por favor, inténtalo de nuevo.')
            }

            setRevolutOrderId(resp.revolut_order_id)
            setRevolutOrderToken(resp.token)
            setRevolutCartSnapshot(snapshot)
            currentRevolutOrderIdRef.current = resp.revolut_order_id

            // Persist the Revolut order so we can reuse it if the user closes and reopens the drawer
            if (typeof window !== 'undefined') {
                try {
                    window.sessionStorage.setItem(
                        REVOLUT_ORDER_STORAGE_KEY,
                        JSON.stringify({
                            revolut_order_id: resp.revolut_order_id,
                            token: resp.token,
                            cartSnapshot: snapshot,
                        }),
                    )
                } catch (e) {
                    // If storage fails we still continue; it only means we cannot reuse the order later
                    console.warn('No se pudo guardar la orden de Revolut en sessionStorage:', e)
                }
            }

            // Pre-fill personal info if user is logged in
            setPersonalInfo((prev) => ({
                ...prev,
                fullName: user?.full_name || user?.name || prev.fullName,
                email: user?.email || prev.email,
                phone: user?.phone || prev.phone,
            }))

            setShowAddressInput(true)
        } catch (err) {
            console.error('Error inicializando la orden de Revolut:', err)
            showBanner(err.message || 'Ha ocurrido un error al iniciar el pago. Inténtalo de nuevo más tarde.')
        } finally {
            setIsProcessing(false)
        }
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

        if (!revolutOrderId || !revolutOrderToken) {
            showBanner('No se ha podido inicializar el pago. Vuelve al paso anterior e inténtalo de nuevo.')
            return
        }

        if (!cardFieldInstanceRef.current || !cardFieldContainerRef.current) {
            showBanner('No se ha podido cargar el formulario de tarjeta. Actualiza la página o vuelve a intentarlo.')
            return
        }

        setIsProcessing(true)
        try {
            // Prepare items in the expanded format expected by orders API
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

            const finalDeliveryAddress = hasDeliveryShipping() ? deliveryAddress : null
            const finalInvoicingAddress = useSameAddressForInvoicing ? deliveryAddress : invoicingAddress

            // 1) Persist order in our DB with status 'pending' and PATCH Revolut order with full details
            const placed = await ordersAPI.placeOrder({
                items: orderItems,
                email: personalInfo.email,
                phone: personalInfo.phone,
                delivery_address: finalDeliveryAddress,
                invoicing_address: finalInvoicingAddress,
                customer: {
                    full_name: personalInfo.fullName,
                    email: personalInfo.email,
                    phone: personalInfo.phone,
                },
                revolut_order_id: revolutOrderId,
            })

            const createdOrderId = placed?.order?.id
            if (!createdOrderId) {
                throw new Error('No se pudo registrar el pedido. Por favor, inténtalo de nuevo.')
            }

            currentOrderIdRef.current = createdOrderId

            // 2) Enviar el pago a Revolut usando Card Field
            const billing = finalInvoicingAddress || finalDeliveryAddress || {}
            const shipping = finalDeliveryAddress || null

            const meta = {
                name: personalInfo.fullName,
                email: personalInfo.email,
                phone: personalInfo.phone,
                cardholderName: personalInfo.fullName,
                billingAddress: {
                    countryCode: (billing.country || 'ES').toUpperCase(),
                    region: billing.province || '',
                    city: billing.city || '',
                    postcode: billing.postalCode || '',
                    streetLine1: billing.line1 || '',
                    streetLine2: billing.line2 || '',
                },
                ...(shipping ? {
                    shippingAddress: {
                        countryCode: (shipping.country || 'ES').toUpperCase(),
                        region: shipping.province || '',
                        city: shipping.city || '',
                        postcode: shipping.postalCode || '',
                        streetLine1: shipping.line1 || '',
                        streetLine2: shipping.line2 || '',
                    },
                } : {}),
            }

            try {
                cardFieldInstanceRef.current.submit(meta)
                // We keep isProcessing=true; it will be cleared in the Card Field onSuccess/onError handlers
            } catch (submitErr) {
                console.error('Revolut Card Field submit error:', submitErr)
                showBanner(submitErr.message || 'No se pudo procesar el pago con tarjeta.')
                setIsProcessing(false)
            }
        } catch (err) {
            console.error('Error al colocar el pedido:', err)
            showBanner(err.message || 'Ha ocurrido un error al registrar el pedido. Inténtalo de nuevo.')
            setIsProcessing(false)
        }
    }

    const handleRevolutCardSuccess = async () => {
        try {
            const createdOrderId = currentOrderIdRef.current
            const revolutId = currentRevolutOrderIdRef.current || revolutOrderId

            if (!createdOrderId || !revolutId) {
                throw new Error('No se pudo confirmar el pago: falta información del pedido.')
            }

            // Poll backend to resolve latest payment for this Revolut order
            let paymentId = null
            const maxAttempts = 10
            let attempt = 0
            let delay = 400 // ms
            while (attempt < maxAttempts && !paymentId) {
                try {
                    const resp = await paymentsAPI.getLatestRevolutPayment(revolutId)
                    if (resp && resp.payment_id) {
                        paymentId = resp.payment_id
                        break
                    }
                } catch (e) {
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

            // Confirm payment on our API (mark as paid)
            await ordersAPI.updatePayment({
                orderId: createdOrderId,
                paymentId,
            })

            const tokenKey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
            if (typeof window !== 'undefined') {
                sessionStorage.setItem(`order_token_${tokenKey}`, JSON.stringify({
                    orderId: createdOrderId,
                    email: personalInfo.email,
                }))
            }

            clearCart()
            setShowAddressInput(false)
            setPersonalInfo({fullName: '', email: '', phone: ''})
            setDeliveryAddress({})
            setInvoicingAddress({})
            setUseSameAddressForInvoicing(true)
            setRevolutOrderId(null)
            setRevolutOrderToken(null)
            setRevolutCartSnapshot(null)
            currentOrderIdRef.current = null
            currentRevolutOrderIdRef.current = null

            if (typeof window !== 'undefined') {
                try {
                    window.sessionStorage.removeItem(REVOLUT_ORDER_STORAGE_KEY)
                } catch (_) {
                    // ignore storage cleanup errors
                }
            }

            if (cardFieldInstanceRef.current && typeof cardFieldInstanceRef.current.destroy === 'function') {
                try {
                    cardFieldInstanceRef.current.destroy()
                } catch (e) {
                    // ignore
                }
            }
            cardFieldInstanceRef.current = null

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
    }

    // ------------------------
    // Revolut Card Field initialisation
    // ------------------------

    useEffect(() => {
        // Only initialise Card Field when we are on the address/payment step and have a valid token
        if (!showAddressInput || !revolutOrderToken || !cardFieldContainerRef.current) {
            return
        }

        let isMounted = true

        const initCardField = async () => {
            try {
                if (!revolutModuleRef.current) {
                    const mod = await import('@revolut/checkout')
                    revolutModuleRef.current = mod && (mod.default || mod)
                }

                if (!isMounted) return

                const envMode = (process.env.NEXT_PUBLIC_REVOLUT_MODE || 'sandbox').toLowerCase()
                const checkoutInstance = await revolutModuleRef.current(
                    revolutOrderToken,
                    envMode === 'production' ? undefined : 'sandbox'
                )

                if (!isMounted) return

                const {createCardField} = checkoutInstance || {}
                if (!createCardField) {
                    throw new Error('No se pudo inicializar el formulario de tarjeta de Revolut')
                }

                // Destroy any previous instance before creating a new one
                if (cardFieldInstanceRef.current && typeof cardFieldInstanceRef.current.destroy === 'function') {
                    try {
                        cardFieldInstanceRef.current.destroy()
                    } catch (e) {
                        // ignore
                    }
                }

                const revLocale = process.env.NEXT_PUBLIC_REVOLUT_LOCALE || 'auto'

                const instance = createCardField({
                    target: cardFieldContainerRef.current,
                    ...(revLocale ? {locale: revLocale} : {}),
                    onSuccess: () => {
                        // Let the dedicated handler orchestrate payment confirmation and redirect
                        handleRevolutCardSuccess()
                    },
                    onError: (error) => {
                        console.error('Revolut Card Field error:', error)
                        showBanner(error?.message || 'Error en el pago con tarjeta. Por favor, inténtalo de nuevo.')
                        setIsProcessing(false)
                    },
                })

                cardFieldInstanceRef.current = instance
            } catch (err) {
                console.error('Error inicializando el formulario de tarjeta de Revolut:', err)
                showBanner(err.message || 'No se pudo cargar el formulario de tarjeta. Inténtalo de nuevo.')
            }
        }

        initCardField()

        return () => {
            isMounted = false
            if (cardFieldInstanceRef.current && typeof cardFieldInstanceRef.current.destroy === 'function') {
                try {
                    cardFieldInstanceRef.current.destroy()
                } catch (e) {
                    // ignore
                }
            }
            cardFieldInstanceRef.current = null
        }
    }, [showAddressInput, revolutOrderToken, open])

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
            const phone = shipping.phoneNumber || ''

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
                phone,
                gDelivery,
                gInvoicing,
                null
            )

            // Prepare confirmation token and redirect
            const token = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
            sessionStorage.setItem(`order_token_${token}`, JSON.stringify({
                orderId: response.order.id,
                email,
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
        <>
            {/* Full-screen loading overlay to block all interactions during critical payment steps */}
            {isProcessing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70">
                    <div className="flex flex-col items-center gap-3">
                        <div
                            className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"/>
                        <p className="text-sm text-gray-700">Procesando tu pedido...</p>
                    </div>
                </div>
            )}

            <Dialog open={open} onClose={handleCloseDrawer} className="relative z-10">
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
                                                onClick={handleCloseDrawer}
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
                                                                                onClick={handleCloseDrawer}
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

                                                {/* Revolut Card Field container */}
                                                <div className="mt-4">
                                                    <h3 className="text-sm font-bold underline text-gray-900 mb-2">Pago con tarjeta</h3>
                                                    <div
                                                        ref={cardFieldContainerRef}
                                                        id="card-field"
                                                        className="rounded-md border border-gray-300 bg-white px-3 py-3"
                                                    />
                                                </div>
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
                                            {/* Shipping breakdown explanation */}
                                            {getShippingBreakdown().length > 0 && (
                                                <div className="mt-2 rounded-md bg-gray-50 px-3 py-2">
                                                    <p className="text-xs font-medium text-gray-700 mb-1">
                                                        Detalle de los gastos de envío
                                                    </p>
                                                    <ul className="space-y-1">
                                                        {getShippingBreakdown().map((group, index) => {
                                                            const isArt = group.productType === 'art'
                                                            const articleLabel = isArt ? 'obras de arte' : 'otros artículos'
                                                            const sellerText = group.sellerName
                                                                ? `del autor ${group.sellerName}`
                                                                : 'del mismo autor'

                                                            // Example sentence:
                                                            // "Envío "Envío estándar" del autor X: 3 obras de arte agrupadas en 2 envíos (máx. 2 por envío) → 2 × 10,00 € = 20,00 €"
                                                            return (
                                                                <li key={`${group.sellerId}-${group.productType}-${group.methodId}-${index}`} className="text-[11px] text-gray-600">
                                                                    <span className="font-semibold">{group.methodName}</span>{' '}
                                                                    <span>
                                                                        {sellerText}: {group.totalUnits} {articleLabel}
                                                                        {group.maxArticles > 1 && ` agrupados en ${group.shipments} envíos (máx. ${group.maxArticles} por envío)`}
                                                                        {group.maxArticles <= 1 && ` en ${group.shipments} envío${group.shipments > 1 ? 's' : ''}`}
                                                                        {' '}→ {group.shipments} × €{group.costPerShipment.toFixed(2)} = €{group.totalShipping.toFixed(2)}
                                                                    </span>
                                                                </li>
                                                            )
                                                        })}
                                                    </ul>
                                                    <p className="mt-1 text-[11px] text-gray-500">
                                                        Los gastos de envío se calculan por autor y método de envío, agrupando varias
                                                        unidades en un mismo envío hasta el límite indicado.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        <p className="mt-2 text-xs text-gray-500">Los impuestos se calcularán según tu
                                            ubicación.</p>
                                        <div className="mt-6">
                                            {!showAddressInput ? (
                                                // Step 1: Cart view - Show "Completar pedido"
                                                <>
                                                    <button
                                                        onClick={handleCheckout}
                                                        disabled={isProcessing || cart.some(item => !item.shipping)}
                                                        className="flex w-full items-center justify-center gap-2 rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <CreditCardIcon aria-hidden="true" className="size-5"/>
                                                        {isProcessing ? 'Procesando...' : 'Completar pedido'}
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
                                                        onClick={handleCloseDrawer}
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
        </>
    )
}
