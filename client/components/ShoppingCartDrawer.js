'use client'

import {useEffect, useRef, useState, useCallback} from 'react'
import {useRouter} from 'next/navigation'
import {Dialog, DialogBackdrop, DialogPanel, DialogTitle} from '@headlessui/react'
import {XMarkIcon, CreditCardIcon} from '@heroicons/react/24/outline'
import {CheckCircleIcon} from '@heroicons/react/20/solid'
import Link from 'next/link'
import Image from 'next/image'
import {useCart} from '@/contexts/CartContext'
import {useAuth} from '@/contexts/AuthContext'
import {useBannerNotification} from '@/contexts/BannerNotificationContext'
import {getArtImageUrl, getOthersImageUrl, ordersAPI, paymentsAPI, stripeAPI} from '@/lib/api'
import AddressAutocomplete from './AddressAutocomplete'
import AddressManualInput from './AddressManualInput'
import {getStripePromise} from '@/lib/stripe'
import {Elements, useStripe, useElements} from '@stripe/react-stripe-js'
import StripeCardPayment from './StripeCardPayment'
import StripeExpressCheckout from './StripeExpressCheckout'
import ShippingStep from './shipping/ShippingStep'
import {SENDCLOUD_ENABLED, SENDCLOUD_ENABLED_ART, SENDCLOUD_ENABLED_OTHERS} from '@/lib/constants'

// Key used to persist a pending Revolut order for a given cart in sessionStorage
const REVOLUT_ORDER_STORAGE_KEY = 'kuadrat_revolut_order_cache'

// Step constants for clarity
const STEP_CART = 1
const STEP_ADDRESS = 2
const STEP_SHIPPING = 3
const STEP_PAYMENT = 4

// Payment method options
const PAYMENT_METHOD_CARD = 'card'
const PAYMENT_METHOD_GOOGLE_APPLE = 'google_apple'
const PAYMENT_METHOD_REVOLUT = 'revolut'
const PAYMENT_METHOD_PAYPAL = 'paypal'

// Payment provider (revolut or stripe) from env
const PAYMENT_PROVIDER = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || 'revolut'

// Inner component for Stripe pay button - must be inside <Elements> to use hooks
function StripePayButton({ isValid, isProcessing, onBeforeSubmit, onSuccess, onError, personalInfo }) {
    const stripe = useStripe()
    const elements = useElements()

    const handleClick = async () => {
        if (!stripe || !elements || !isValid || isProcessing) return

        try {
            await onBeforeSubmit()

            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/pedido-completado`,
                    payment_method_data: {
                        billing_details: {
                            name: personalInfo.fullName,
                            email: personalInfo.email,
                            phone: personalInfo.phone,
                        },
                    },
                },
                redirect: 'if_required',
            })

            if (error) {
                onError(error.message || 'Error al procesar el pago')
            } else if (paymentIntent && paymentIntent.status === 'succeeded') {
                await onSuccess(paymentIntent.id)
            } else if (paymentIntent && paymentIntent.status === 'requires_action') {
                // 3DS or other redirect - handled by Stripe automatically
                // If redirect: 'if_required' didn't redirect, the payment needs more action
                onError('El pago requiere verificación adicional. Por favor, inténtalo de nuevo.')
            } else {
                onError('Estado de pago inesperado. Por favor, inténtalo de nuevo.')
            }
        } catch (err) {
            onError(err.message || 'Error al procesar el pago')
        }
    }

    return (
        <div className="mt-4">
            <button
                onClick={handleClick}
                disabled={isProcessing || !isValid || !stripe}
                className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isProcessing ? 'Procesando...' : 'Pagar'}
            </button>
            {!isValid && !isProcessing && (
                <p className="mt-2 text-xs text-center text-gray-500">
                    Por favor, completa los datos de pago para continuar
                </p>
            )}
        </div>
    )
}

export default function ShoppingCartDrawer({open, onClose}) {
    // Get address functionality mode from environment variable
    const addressMode = process.env.NEXT_PUBLIC_CART_ADDRESS_FUNC || 'manual'
    const paymentTimeoutMs = parseInt(process.env.NEXT_PUBLIC_PAYMENT_TIMEOUT_MS || '30000', 10)
    const revolutPublicKey = process.env.NEXT_PUBLIC_REVOLUT_PUBLIC_KEY || ''
    const revolutMode = (process.env.NEXT_PUBLIC_REVOLUT_MODE || 'sandbox').toLowerCase()
    const {cart, removeFromCart, updateQuantity, getTotalPrice, getSubtotal, getTotalShipping, getShippingBreakdown, clearCart, shippingSelections, clearShippingSelections, getSendcloudShippingTotal} = useCart()
    const {user} = useAuth()
    const {showBanner} = useBannerNotification()
    const router = useRouter()

    // Step management (1: cart, 2: address, 3: payment method selection)
    const [currentStep, setCurrentStep] = useState(STEP_CART)
    const [isProcessing, setIsProcessing] = useState(false)
    const [personalInfo, setPersonalInfo] = useState({fullName: '', email: '', phone: ''})
    const [deliveryAddress, setDeliveryAddress] = useState({})
    const [invoicingAddress, setInvoicingAddress] = useState({})
    const [useSameAddressForInvoicing, setUseSameAddressForInvoicing] = useState(true)
    const [addressError, setAddressError] = useState('')

    // Payment method selection
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)
    const [isInitializingPayment, setIsInitializingPayment] = useState(false)

    // Revolut order state (shared between Card and Revolut Pay)
    const [revolutOrderId, setRevolutOrderId] = useState(null)
    const [revolutOrderToken, setRevolutOrderToken] = useState(null)
    const [revolutCartSnapshot, setRevolutCartSnapshot] = useState(null)

    // Card field validation state
    const [cardValidationErrors, setCardValidationErrors] = useState([])
    const [isCardFieldValid, setIsCardFieldValid] = useState(false)

    // Revolut Pay state
    const [isRevolutPayMounted, setIsRevolutPayMounted] = useState(false)

    // Stripe state
    const [stripeClientSecret, setStripeClientSecret] = useState(null)
    const [stripePaymentIntentId, setStripePaymentIntentId] = useState(null)
    const [isStripeCardValid, setIsStripeCardValid] = useState(false)
    const [isStripeExpressAvailable, setIsStripeExpressAvailable] = useState(false)

    // Refs
    const revolutModuleRef = useRef(null)
    const cardFieldContainerRef = useRef(null)
    const cardFieldInstanceRef = useRef(null)
    const revolutPayContainerRef = useRef(null)
    const revolutPayInstanceRef = useRef(null)
    const currentOrderIdRef = useRef(null)
    const currentRevolutOrderIdRef = useRef(null)
    const paymentTimeoutRef = useRef(null)
    const paymentSucceededRef = useRef(false) // Prevents cart change effect from cancelling after success
    const prevAddressRef = useRef({}) // Tracks previous address for Sendcloud selection clearing

    // Clear Sendcloud shipping selections when relevant address fields change
    useEffect(() => {
        if (!SENDCLOUD_ENABLED) return

        const prev = prevAddressRef.current
        const changed = prev.country !== deliveryAddress.country ||
            prev.postalCode !== deliveryAddress.postalCode ||
            prev.city !== deliveryAddress.city

        // Skip initial mount (prev is empty) — only clear on actual changes
        if (changed && (prev.country !== undefined || prev.postalCode !== undefined || prev.city !== undefined)) {
            clearShippingSelections()
        }

        prevAddressRef.current = {
            country: deliveryAddress.country,
            postalCode: deliveryAddress.postalCode,
            city: deliveryAddress.city,
        }
    }, [deliveryAddress.country, deliveryAddress.postalCode, deliveryAddress.city, clearShippingSelections])

    const getImageUrl = (item) => {
        return item.productType === 'art'
            ? getArtImageUrl(item.basename)
            : getOthersImageUrl(item.basename)
    }

    const getProductUrl = (item) => {
        return item.productType === 'art'
            ? `/galeria/p/${item.slug}`
            : `/tienda/p/${item.slug}`
    }

    // Check if an item uses Sendcloud shipping (shipping deferred to Step 3)
    const isSendcloudItem = (item) => {
        if (item.productType === 'art' && SENDCLOUD_ENABLED_ART) return true
        if ((item.productType === 'other' || item.productType === 'others') && SENDCLOUD_ENABLED_OTHERS) return true
        return false
    }

    // Build the compact representation of cart items used to initialise a Revolut order.
    const buildCompactItems = useCallback((items) => (
        items.map(item => ({
            type: item.productType === 'art' ? 'art' : 'other',
            id: item.productId,
            ...(item.productType === 'other' ? {variantId: item.variantId} : {}),
            quantity: item.quantity,
            shipping: item.shipping,
        }))
    ), [])

    const handleQuantityChange = (item, newQuantity) => {
        const qty = parseInt(newQuantity, 10)
        if (qty > 0 && qty <= 10) {
            updateQuantity(item.productId, item.productType, qty, item.variantId)
        }
    }

    // Handle item removal - behavior depends on current step
    const handleRemove = async (item) => {
        if (currentStep === STEP_PAYMENT) {
            // In step 3: cancel any existing payment and return to step 1
            if (PAYMENT_PROVIDER === 'stripe' && stripePaymentIntentId) {
                try {
                    await stripeAPI.cancelPaymentIntent(stripePaymentIntentId)
                } catch (err) {
                    console.warn('No se pudo cancelar el PaymentIntent de Stripe:', err)
                }
                cleanupStripeState()
            } else if (revolutOrderId) {
                try {
                    await paymentsAPI.cancelOrder(revolutOrderId)
                } catch (err) {
                    console.warn('No se pudo cancelar la orden de Revolut:', err)
                }
                cleanupRevolutState()
            }

            // Remove item and return to step 1
            removeFromCart(item.productId, item.productType, item.variantId)
            setCurrentStep(STEP_CART)
            setSelectedPaymentMethod(null)
        } else {
            // In steps 1 and 2: just remove the item
            removeFromCart(item.productId, item.productType, item.variantId)
        }
    }

    // Clean up Stripe PaymentIntent state
    const cleanupStripeState = useCallback(() => {
        setStripeClientSecret(null)
        setStripePaymentIntentId(null)
        setIsStripeCardValid(false)
        setIsStripeExpressAvailable(false)
    }, [])

    // Clean up Revolut order state
    const cleanupRevolutState = useCallback(() => {
        setRevolutOrderId(null)
        setRevolutOrderToken(null)
        setRevolutCartSnapshot(null)
        currentRevolutOrderIdRef.current = null
        setIsCardFieldValid(false)
        setCardValidationErrors([])
        setIsRevolutPayMounted(false)

        if (cardFieldInstanceRef.current && typeof cardFieldInstanceRef.current.destroy === 'function') {
            try {
                cardFieldInstanceRef.current.destroy()
            } catch (e) {
                // ignore
            }
        }
        cardFieldInstanceRef.current = null

        if (revolutPayInstanceRef.current && typeof revolutPayInstanceRef.current.destroy === 'function') {
            try {
                revolutPayInstanceRef.current.destroy()
            } catch (e) {
                // ignore
            }
        }
        revolutPayInstanceRef.current = null

        if (typeof window !== 'undefined') {
            try {
                window.sessionStorage.removeItem(REVOLUT_ORDER_STORAGE_KEY)
            } catch (_) {
                // ignore storage cleanup errors
            }
        }
    }, [])

    // Prevent closing if payment is being processed
    const handleCloseDrawer = () => {
        if (isProcessing) {
            return
        }
        setCurrentStep(STEP_CART)
        setAddressError('')
        setSelectedPaymentMethod(null)
        onClose()
    }

    // Reset to step 1 when drawer closes
    useEffect(() => {
        if (!open) {
            setCurrentStep(STEP_CART)
            setAddressError('')
            setSelectedPaymentMethod(null)
        }
    }, [open])

    // On mount, try to restore a pending Revolut order from sessionStorage
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
                // Cart changed since the stored order was created; cancel stale order
                if (stored.revolut_order_id) {
                    ;(async () => {
                        try {
                            await paymentsAPI.cancelOrder(stored.revolut_order_id)
                        } catch (err) {
                            console.warn('No se pudo cancelar la orden de Revolut obsoleta:', err)
                        }
                    })()
                }
                window.sessionStorage.removeItem(REVOLUT_ORDER_STORAGE_KEY)
            }
        } catch (e) {
            console.error('Error restaurando la orden de Revolut desde sessionStorage:', e)
            try {
                window.sessionStorage.removeItem(REVOLUT_ORDER_STORAGE_KEY)
            } catch (_) {
                // ignore
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Whenever the cart changes, verify that it still matches the snapshot
    useEffect(() => {
        if (!revolutCartSnapshot) return

        // Skip if payment already succeeded (cart was cleared intentionally) - web flow
        if (paymentSucceededRef.current) {
            paymentSucceededRef.current = false // Reset for next payment
            return
        }

        // Skip if cart is empty - likely cleared after successful payment (mobile redirect flow)
        // In this case, we don't want to cancel the already-completed order
        if (cart.length === 0) {
            cleanupRevolutState()
            return
        }

        const currentSnapshot = JSON.stringify(buildCompactItems(cart))
        if (currentSnapshot !== revolutCartSnapshot) {
            // Cart changed - cancel Revolut order
            if (revolutOrderId) {
                ;(async () => {
                    try {
                        await paymentsAPI.cancelOrder(revolutOrderId)
                    } catch (err) {
                        // Ignore "already completed" errors - this is fine, payment succeeded
                        const isAlreadyCompleted = err?.response?.code === 'cancelling_completed_order' ||
                            err?.message?.includes('completed') ||
                            err?.status === 422
                        if (!isAlreadyCompleted) {
                            console.warn('No se pudo cancelar la orden de Revolut tras cambios en el carrito:', err)
                        }
                    }
                })()
            }

            cleanupRevolutState()

            // Return to cart step if not already there
            if (currentStep !== STEP_CART) {
                setCurrentStep(STEP_CART)
                setSelectedPaymentMethod(null)
            }
        }
    }, [cart, revolutCartSnapshot, currentStep, revolutOrderId, buildCompactItems, cleanupRevolutState])

    // Clean up Stripe state when cart is cleared (e.g. after successful payment)
    useEffect(() => {
        if (PAYMENT_PROVIDER !== 'stripe') return
        if (!stripePaymentIntentId) return
        if (cart.length === 0) {
            cleanupStripeState()
        }
    }, [cart.length, stripePaymentIntentId, cleanupStripeState])

    // Step 1 -> Step 2: Handle "Completar pedido" click
    const handleCheckout = () => {
        if (cart.length === 0) {
            showBanner('El carrito está vacío')
            return
        }
        if (cart.some(item => !item.shipping && !isSendcloudItem(item))) {
            showBanner('Todos los productos deben tener un método de envío seleccionado')
            return
        }

        // Pre-fill personal info if user is logged in
        setPersonalInfo((prev) => ({
            ...prev,
            fullName: user?.full_name || user?.name || prev.fullName,
            email: user?.email || prev.email,
            phone: user?.phone || prev.phone,
        }))

        setCurrentStep(STEP_ADDRESS)
    }

    // Step 2 -> Step 3 (Shipping) or Step 4 (Payment): Handle "Continuar" click
    const handleProceedFromAddress = async () => {
        if (!isPersonalInfoValid()) {
            showBanner('Por favor, completa la información personal con datos válidos')
            return
        }
        if (!isAddressValid()) {
            return
        }

        if (SENDCLOUD_ENABLED) {
            setCurrentStep(STEP_SHIPPING)
        } else {
            setCurrentStep(STEP_PAYMENT)
            setSelectedPaymentMethod(null)
            if (PAYMENT_PROVIDER === 'stripe') {
                await initializeStripePayment()
            }
        }
    }

    // Step 3 (Shipping) -> Step 4 (Payment)
    const handleProceedToPaymentStep = async () => {
        setCurrentStep(STEP_PAYMENT)
        setSelectedPaymentMethod(null)

        if (PAYMENT_PROVIDER === 'stripe') {
            await initializeStripePayment()
        }
    }

    // Navigation handlers
    const handleBackToCart = () => {
        setCurrentStep(STEP_CART)
        setAddressError('')
    }

    const cancelActivePayment = () => {
        if (PAYMENT_PROVIDER === 'stripe' && stripePaymentIntentId) {
            ;(async () => {
                try {
                    await stripeAPI.cancelPaymentIntent(stripePaymentIntentId)
                } catch (err) {
                    console.warn('No se pudo cancelar el PaymentIntent de Stripe:', err)
                }
            })()
            cleanupStripeState()
        } else if (revolutOrderId) {
            ;(async () => {
                try {
                    await paymentsAPI.cancelOrder(revolutOrderId)
                } catch (err) {
                    console.warn('No se pudo cancelar la orden de Revolut:', err)
                }
            })()
            cleanupRevolutState()
        }
    }

    const handleBackToAddress = () => {
        cancelActivePayment()
        setCurrentStep(STEP_ADDRESS)
        setSelectedPaymentMethod(null)
    }

    const handleBackToShipping = () => {
        cancelActivePayment()
        setCurrentStep(STEP_SHIPPING)
        setSelectedPaymentMethod(null)
    }

    // Check if cart has any delivery shipping methods
    // Sendcloud items (shipping: null) are treated as needing delivery because
    // the buyer's address is required for Sendcloud rate calculation at Step 3.
    const hasDeliveryShipping = useCallback(() => {
        return cart.some(item => item.shipping?.methodType === 'delivery' || (!item.shipping && isSendcloudItem(item)))
    }, [cart])

    // Check if all products use pickup shipping
    const allPickupShipping = useCallback(() => {
        return cart.length > 0 && cart.every(item => item.shipping?.methodType === 'pickup')
    }, [cart])

    const isPersonalInfoValid = useCallback(() => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const phoneRegex = /^\+\d{7,15}$/ // E.164-like: + followed by 7-15 digits
        if (!personalInfo.fullName || personalInfo.fullName.trim().length < 2) return false
        if (!emailRegex.test((personalInfo.email || '').trim())) return false
        if (!phoneRegex.test((personalInfo.phone || '').trim())) return false
        return true
    }, [personalInfo])

    // Check if address fields are filled (for button validation, not showing errors)
    const isAddressFieldsFilled = useCallback(() => {
        const needsDelivery = hasDeliveryShipping()
        const pickupOnly = allPickupShipping()

        if (needsDelivery) {
            if (!deliveryAddress.line1 || !deliveryAddress.postalCode || !deliveryAddress.city || !deliveryAddress.province || !deliveryAddress.country) {
                return false
            }
        }

        if (pickupOnly || (!useSameAddressForInvoicing && needsDelivery)) {
            if (!invoicingAddress.line1 || !invoicingAddress.postalCode || !invoicingAddress.city || !invoicingAddress.province || !invoicingAddress.country) {
                return false
            }
        }

        return true
    }, [hasDeliveryShipping, allPickupShipping, deliveryAddress, invoicingAddress, useSameAddressForInvoicing])

    // Check if step 2 form is complete (for button validation)
    const isStep2FormComplete = useCallback(() => {
        return isPersonalInfoValid() && isAddressFieldsFilled()
    }, [isPersonalInfoValid, isAddressFieldsFilled])

    const isAddressValid = () => {
        const needsDelivery = hasDeliveryShipping()
        const pickupOnly = allPickupShipping()

        if (needsDelivery) {
            if (!deliveryAddress.line1 || !deliveryAddress.postalCode || !deliveryAddress.city || !deliveryAddress.province || !deliveryAddress.country) {
                setAddressError('Por favor, completa la dirección de entrega')
                return false
            }
        }

        if (pickupOnly || (!useSameAddressForInvoicing && needsDelivery)) {
            if (!invoicingAddress.line1 || !invoicingAddress.postalCode || !invoicingAddress.city || !invoicingAddress.province || !invoicingAddress.country) {
                setAddressError('Por favor, completa la dirección de facturación')
                return false
            }
        }

        if (needsDelivery) {
            const deliveryPostalCode = deliveryAddress.postalCode
            const incompatibleItems = cart.filter(item => {
                if (item.shipping?.methodType === 'delivery') {
                    const shippingPostalCode = item.shipping.deliveryPostalCode
                    return shippingPostalCode && shippingPostalCode !== deliveryPostalCode
                }
                return false
            })

            if (incompatibleItems.length > 0) {
                setAddressError(`El código postal (${deliveryPostalCode}) no coincide con el introducido en el momento de añadir los productos a la cesta. Por favor, elimina los productos de la cesta y vuelve a añadirlo con el código postal correcto.`)
                return false
            }
        }

        setAddressError('')
        return true
    }

    // Handle payment method selection (Revolut only - Stripe doesn't use method cards)
    const handlePaymentMethodSelect = async (method) => {
        // If selecting the same method, do nothing
        if (selectedPaymentMethod === method) return

        setSelectedPaymentMethod(method)

        // For Revolut, initialize order when Card or Revolut Pay is selected
        if (PAYMENT_PROVIDER !== 'stripe') {
            if (method === PAYMENT_METHOD_CARD || method === PAYMENT_METHOD_REVOLUT) {
                await initializeRevolutOrder()
            }
        }
    }

    // Initialize Revolut order (shared between Card and Revolut Pay)
    const initializeRevolutOrder = async () => {
        const compactItems = buildCompactItems(cart)
        const snapshot = JSON.stringify(compactItems)

        // If we already have a matching Revolut order, reuse it
        if (revolutOrderId && revolutOrderToken && revolutCartSnapshot === snapshot) {
            return { revolutOrderId, revolutOrderToken }
        }

        setIsInitializingPayment(true)

        try {
            const resp = await paymentsAPI.initRevolutOrder(compactItems)

            if (!resp || !resp.revolut_order_id || !resp.token) {
                throw new Error('No se pudo inicializar el pago con Revolut. Por favor, inténtalo de nuevo.')
            }

            setRevolutOrderId(resp.revolut_order_id)
            setRevolutOrderToken(resp.token)
            setRevolutCartSnapshot(snapshot)
            currentRevolutOrderIdRef.current = resp.revolut_order_id

            // Persist the Revolut order
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
                    console.warn('No se pudo guardar la orden de Revolut en sessionStorage:', e)
                }
            }

            return { revolutOrderId: resp.revolut_order_id, revolutOrderToken: resp.token }
        } catch (err) {
            console.error('Error inicializando la orden de Revolut:', err)
            showBanner(err.message || 'Ha ocurrido un error al iniciar el pago. Inténtalo de nuevo más tarde.')
            setSelectedPaymentMethod(null)
            return null
        } finally {
            setIsInitializingPayment(false)
        }
    }

    // Initialize Stripe PaymentIntent
    const initializeStripePayment = async () => {
        // Reuse existing if we have one
        if (stripeClientSecret && stripePaymentIntentId) {
            return { clientSecret: stripeClientSecret, paymentIntentId: stripePaymentIntentId }
        }

        setIsInitializingPayment(true)

        try {
            const compactItems = buildCompactItems(cart)
            const resp = await stripeAPI.createPaymentIntent({
                items: compactItems,
                currency: 'EUR',
            })

            if (!resp || !resp.clientSecret || !resp.paymentIntentId) {
                throw new Error('No se pudo inicializar el pago con Stripe. Por favor, inténtalo de nuevo.')
            }

            setStripeClientSecret(resp.clientSecret)
            setStripePaymentIntentId(resp.paymentIntentId)

            return { clientSecret: resp.clientSecret, paymentIntentId: resp.paymentIntentId }
        } catch (err) {
            console.error('Error inicializando Stripe PaymentIntent:', err)
            showBanner(err.message || 'Ha ocurrido un error al iniciar el pago. Inténtalo de nuevo más tarde.')
            setSelectedPaymentMethod(null)
            return null
        } finally {
            setIsInitializingPayment(false)
        }
    }

    // Place order in our database (shared between Card and Revolut Pay)
    const placeOrderInDatabase = async () => {
        const orderItems = cart.flatMap(item => {
            let shipping = item.shipping

            // For Sendcloud items, merge shipping from shippingSelections
            if (!shipping && item.sellerId) {
                const sc = shippingSelections[item.sellerId]
                if (sc) {
                    shipping = {
                        methodId: sc.shippingOptionCode || sc.optionId,
                        cost: sc.cost || 0,
                        methodName: sc.name || '',
                        methodType: sc.type || 'home_delivery',
                        shippingOptionCode: sc.shippingOptionCode || '',
                        servicePointId: sc.servicePointId || null,
                    }
                }
            }

            const baseItem = {
                type: item.productType === 'art' ? 'art' : 'other',
                id: item.productId,
                shipping,
            }
            if (item.productType === 'other') baseItem.variantId = item.variantId
            return Array(item.quantity).fill(baseItem)
        })

        if (orderItems.length === 0) {
            throw new Error('El carrito está vacío')
        }

        const hasDelivery = hasDeliveryShipping()
        const pickupOnly = allPickupShipping()

        const finalDeliveryAddress = hasDelivery ? deliveryAddress : null
        const finalInvoicingAddress = pickupOnly
            ? invoicingAddress
            : (useSameAddressForInvoicing ? deliveryAddress : invoicingAddress)

        const orderPayload = {
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
            payment_provider: PAYMENT_PROVIDER,
        }

        if (PAYMENT_PROVIDER === 'stripe') {
            orderPayload.stripe_payment_intent_id = stripePaymentIntentId
        } else {
            orderPayload.revolut_order_id = revolutOrderId
            orderPayload.revolut_order_token = revolutOrderToken
        }

        const placed = await ordersAPI.placeOrder(orderPayload)

        const createdOrderId = placed?.order?.id
        if (!createdOrderId) {
            throw new Error('No se pudo registrar el pedido. Por favor, inténtalo de nuevo.')
        }

        currentOrderIdRef.current = createdOrderId
        return { createdOrderId, finalDeliveryAddress, finalInvoicingAddress }
    }

    // Handle payment submission for Card (Step 3: "Pagar" button)
    const handleCardPayment = async () => {
        if (!revolutOrderId || !revolutOrderToken) {
            showBanner('No se ha podido inicializar el pago. Por favor, selecciona el método de pago de nuevo.')
            return
        }

        if (!cardFieldInstanceRef.current || !cardFieldContainerRef.current) {
            showBanner('No se ha podido cargar el formulario de tarjeta. Actualiza la página o vuelve a intentarlo.')
            return
        }

        if (!isCardFieldValid) {
            showBanner('Por favor, completa los datos de tu tarjeta antes de continuar.')
            return
        }

        setIsProcessing(true)
        try {
            const { finalDeliveryAddress, finalInvoicingAddress } = await placeOrderInDatabase()

            // Submit payment to Revolut using Card Field
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
                // Clear any existing payment timeout
                if (paymentTimeoutRef.current) {
                    clearTimeout(paymentTimeoutRef.current)
                    paymentTimeoutRef.current = null
                }

                // Start payment timeout
                paymentTimeoutRef.current = setTimeout(() => {
                    paymentTimeoutRef.current = null
                    setIsProcessing(false)
                    showBanner('Ha ocurrido un error al procesar el pago. Inténtelo de nuevo o contacte con info@140d.art')
                    setCurrentStep(STEP_CART)
                    setSelectedPaymentMethod(null)
                }, paymentTimeoutMs)

                cardFieldInstanceRef.current.submit(meta)
            } catch (submitErr) {
                if (paymentTimeoutRef.current) {
                    clearTimeout(paymentTimeoutRef.current)
                    paymentTimeoutRef.current = null
                }
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

    // Handle Stripe payment success (called after stripe.confirmPayment succeeds)
    const handleStripePaymentSuccess = async (paymentIntentId) => {
        try {
            const createdOrderId = currentOrderIdRef.current

            if (!createdOrderId) {
                throw new Error('No se pudo confirmar el pago: falta información del pedido.')
            }

            // Confirm payment on our API
            await ordersAPI.updatePayment({
                orderId: createdOrderId,
                paymentId: paymentIntentId || stripePaymentIntentId,
                provider: 'stripe',
            })

            const tokenKey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
            if (typeof window !== 'undefined') {
                sessionStorage.setItem(`order_token_${tokenKey}`, JSON.stringify({
                    orderId: createdOrderId,
                    email: personalInfo.email,
                    provider: 'stripe',
                    stripePaymentIntentId: paymentIntentId || stripePaymentIntentId,
                }))
            }

            // Mark payment as succeeded to prevent cleanup effects from running
            paymentSucceededRef.current = true
            clearCart()
            setCurrentStep(STEP_CART)
            setSelectedPaymentMethod(null)
            setPersonalInfo({fullName: '', email: '', phone: ''})
            setDeliveryAddress({})
            setInvoicingAddress({})
            setUseSameAddressForInvoicing(true)
            setStripeClientSecret(null)
            setStripePaymentIntentId(null)
            setIsStripeCardValid(false)
            currentOrderIdRef.current = null

            setTimeout(() => {
                router.push(`/pedido-completado?token=${tokenKey}`)
                onClose()
            }, 50)
        } catch (err) {
            console.error('Error confirming Stripe payment:', err)
            showBanner(err.message || 'No se pudo registrar el pedido tras el pago.')
        } finally {
            setIsProcessing(false)
        }
    }

    // Handle successful payment (shared between Card and Revolut Pay)
    const handlePaymentSuccess = async () => {
        // Clear payment timeout since payment succeeded
        if (paymentTimeoutRef.current) {
            clearTimeout(paymentTimeoutRef.current)
            paymentTimeoutRef.current = null
        }

        try {
            const createdOrderId = currentOrderIdRef.current
            const revolutId = currentRevolutOrderIdRef.current || revolutOrderId

            if (!createdOrderId || !revolutId) {
                throw new Error('No se pudo confirmar el pago: falta información del pedido.')
            }

            // Poll backend to resolve latest payment for this Revolut order
            // We check both payment_id and state to ensure the payment was successful
            let paymentId = null
            const maxAttempts = 10
            let attempt = 0
            let delay = 400 // ms
            while (attempt < maxAttempts && !paymentId) {
                try {
                    const resp = await paymentsAPI.getLatestRevolutPayment(revolutId)
                    if (resp && resp.payment_id) {
                        // Check if payment was captured (successful)
                        if (resp.state === 'captured') {
                            paymentId = resp.payment_id
                            break
                        }
                        // Check for terminal failure states - stop polling immediately
                        if (['declined', 'failed', 'cancelled'].includes(resp.state)) {
                            throw new Error('El pago no se ha completado correctamente. Por favor, inténtalo de nuevo.')
                        }
                        // Other states (pending, processing, authorised) - keep polling
                    }
                } catch (e) {
                    // Re-throw payment failure errors
                    if (e?.message?.includes('El pago no se ha completado')) {
                        throw e
                    }
                    // 404 means payment not found yet, keep polling
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

            // Mark payment as succeeded to prevent cart change effect from cancelling
            paymentSucceededRef.current = true
            clearCart()
            setCurrentStep(STEP_CART)
            setSelectedPaymentMethod(null)
            setPersonalInfo({fullName: '', email: '', phone: ''})
            setDeliveryAddress({})
            setInvoicingAddress({})
            setUseSameAddressForInvoicing(true)
            cleanupRevolutState()
            currentOrderIdRef.current = null

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

    // Initialize Revolut Card Field when we have a token and are on payment step with card selected
    useEffect(() => {
        if (currentStep !== STEP_PAYMENT || selectedPaymentMethod !== PAYMENT_METHOD_CARD || !revolutOrderToken || !cardFieldContainerRef.current) {
            return
        }

        let isMounted = true

        const initCardField = async () => {
            try {
                setIsCardFieldValid(false)
                setCardValidationErrors([])

                if (!revolutModuleRef.current) {
                    const mod = await import('@revolut/checkout')
                    revolutModuleRef.current = mod && (mod.default || mod)
                }

                if (!isMounted) return

                const checkoutInstance = await revolutModuleRef.current(
                    revolutOrderToken,
                    revolutMode === 'production' ? undefined : 'sandbox'
                )

                if (!isMounted) return

                const {createCardField} = checkoutInstance || {}
                if (!createCardField) {
                    throw new Error('No se pudo inicializar el formulario de tarjeta de Revolut')
                }

                // Destroy any previous instance
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
                        handlePaymentSuccess()
                    },
                    onError: (error) => {
                        if (paymentTimeoutRef.current) {
                            clearTimeout(paymentTimeoutRef.current)
                            paymentTimeoutRef.current = null
                        }
                        console.error('Revolut Card Field error:', error)
                        showBanner(error?.message || 'Error en el pago con tarjeta. Por favor, inténtalo de nuevo.')
                        setIsProcessing(false)
                    },
                    onValidation: (validationData) => {
                        if (validationData && validationData.length > 0) {
                            const errorMessages = validationData.map(err => err.message || 'Error de validación')
                            setCardValidationErrors(errorMessages)
                            setIsCardFieldValid(false)
                            setIsProcessing(false)
                        } else {
                            setCardValidationErrors([])
                            setIsCardFieldValid(true)
                        }
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
            if (paymentTimeoutRef.current) {
                clearTimeout(paymentTimeoutRef.current)
                paymentTimeoutRef.current = null
            }
            if (cardFieldInstanceRef.current && typeof cardFieldInstanceRef.current.destroy === 'function') {
                try {
                    cardFieldInstanceRef.current.destroy()
                } catch (e) {
                    // ignore
                }
            }
            cardFieldInstanceRef.current = null
        }
    }, [currentStep, selectedPaymentMethod, revolutOrderToken, open, revolutMode, showBanner])

    // Initialize Revolut Pay when selected
    useEffect(() => {
        if (currentStep !== STEP_PAYMENT || selectedPaymentMethod !== PAYMENT_METHOD_REVOLUT || !revolutPayContainerRef.current || !revolutPublicKey) {
            return
        }

        // Require revolut order to be initialized first
        if (!revolutOrderId || !revolutOrderToken) {
            return
        }

        let isMounted = true

        const initRevolutPay = async () => {
            try {
                if (!revolutModuleRef.current) {
                    const mod = await import('@revolut/checkout')
                    revolutModuleRef.current = mod && (mod.default || mod)
                }

                if (!isMounted) return

                // Destroy any previous instance
                if (revolutPayInstanceRef.current && typeof revolutPayInstanceRef.current.destroy === 'function') {
                    try {
                        revolutPayInstanceRef.current.destroy()
                    } catch (e) {
                        // ignore
                    }
                }

                const revLocale = process.env.NEXT_PUBLIC_REVOLUT_LOCALE || 'es'

                // Initialize Revolut Pay with public key
                const { revolutPay } = await revolutModuleRef.current.payments({
                    locale: revLocale,
                    publicToken: revolutPublicKey,
                    mode: revolutMode === 'production' ? 'prod' : 'sandbox',
                })

                if (!isMounted) return

                // Get base URL for redirects
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

                // Payment options for Revolut Pay
                const paymentOptions = {
                    currency: 'EUR',
                    totalAmount: Math.round(getTotalPrice() * 100), // Amount in minor units (cents)
                    requestShipping: false, // We already collected shipping info
                    // Redirect URLs for mobile flows - using dedicated pages
                    redirectUrls: {
                        success: `${baseUrl}/pedido-completado`,
                        failure: `${baseUrl}/pago-fallido`,
                        cancel: `${baseUrl}/pago-cancelado`,
                    },
                    // Create order callback - called when user clicks the button
                    createOrder: async () => {
                        try {
                            // Place the order in our database first
                            await placeOrderInDatabase()

                            // Store order info in sessionStorage for mobile redirect recovery
                            if (typeof window !== 'undefined') {
                                const pendingOrderInfo = {
                                    orderId: currentOrderIdRef.current,
                                    revolutOrderId: revolutOrderId,
                                    revolutOrderToken: revolutOrderToken,
                                    email: personalInfo.email,
                                    timestamp: Date.now(),
                                }
                                window.sessionStorage.setItem('kuadrat_pending_revolut_pay_order', JSON.stringify(pendingOrderInfo))
                            }

                            // Return the public ID (token) for Revolut
                            return { publicId: revolutOrderToken }
                        } catch (err) {
                            console.error('Error in createOrder callback:', err)
                            throw err
                        }
                    },
                    // Customer info
                    customer: {
                        name: personalInfo.fullName,
                        email: personalInfo.email,
                        phone: personalInfo.phone,
                    },
                    buttonStyle: {
                        variant: 'dark',
                        cashback: false
                    }
                }

                // Mount the Revolut Pay button
                revolutPay.mount(revolutPayContainerRef.current, paymentOptions)

                // Listen for payment events (web flow)
                revolutPay.on('payment', async (event) => {
                    if (event.type === 'success') {
                        setIsProcessing(true)
                        // Clear pending order info since we're handling it now
                        if (typeof window !== 'undefined') {
                            window.sessionStorage.removeItem('kuadrat_pending_revolut_pay_order')
                        }
                        await handlePaymentSuccess()
                    } else if (event.type === 'error') {
                        console.error('Revolut Pay error:', event)
                        showBanner(event.message || 'Error en el pago con Revolut Pay. Por favor, inténtalo de nuevo.')
                        setIsProcessing(false)
                    } else if (event.type === 'cancel') {
                        showBanner('Has cancelado el pago. Puedes intentarlo de nuevo cuando quieras.')
                    }
                })

                revolutPayInstanceRef.current = revolutPay
                setIsRevolutPayMounted(true)
            } catch (err) {
                console.error('Error inicializando Revolut Pay:', err)
                showBanner(err.message || 'No se pudo cargar Revolut Pay. Inténtalo de nuevo.')
            }
        }

        initRevolutPay()

        return () => {
            isMounted = false
            if (revolutPayInstanceRef.current && typeof revolutPayInstanceRef.current.destroy === 'function') {
                try {
                    revolutPayInstanceRef.current.destroy()
                } catch (e) {
                    // ignore
                }
            }
            revolutPayInstanceRef.current = null
            setIsRevolutPayMounted(false)
        }
    }, [currentStep, selectedPaymentMethod, revolutPublicKey, revolutMode, personalInfo, getTotalPrice, showBanner, revolutOrderId, revolutOrderToken])

    // Payment methods configuration - varies by provider
    // Payment method cards (only used for Revolut provider)
    const paymentMethods = [
        {
            id: PAYMENT_METHOD_CARD,
            title: 'Tarjeta',
            icons: ['/parties/visa.png', '/parties/mastercard.png'],
            disabled: false,
        },
        {
            id: PAYMENT_METHOD_GOOGLE_APPLE,
            title: 'Google Pay / Apple Pay',
            icons: ['/parties/google-pay.png', '/parties/apple-pay.png'],
            disabled: true,
        },
        {
            id: PAYMENT_METHOD_REVOLUT,
            title: 'Revolut Pay',
            icons: ['/parties/revolut.png'],
            disabled: false,
        },
        {
            id: PAYMENT_METHOD_PAYPAL,
            title: 'PayPal',
            icons: ['/parties/paypal.png'],
            disabled: true,
        },
    ]

    // Render cart items list (used in all steps)
    const renderCartItems = () => (
        <div className="mt-8">
            <div className="flow-root">
                <ul role="list" className="-my-6 divide-y divide-gray-200">
                    {cart.map((item) => (
                        <li key={item.id} className="flex py-6">
                            <div className="size-32 shrink-0 overflow-hidden rounded-md border border-gray-200 relative">
                                <Image
                                    alt={item.name}
                                    src={getImageUrl(item)}
                                    fill
                                    className="object-cover"
                                    sizes="128px"
                                />
                            </div>

                            <div className="ml-4 flex flex-1 flex-col">
                                <div>
                                    <div className="flex justify-between text-base font-medium text-gray-900">
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
                                    {!item.shipping && isSendcloudItem(item) && (
                                        <p className="mt-1 text-xs text-gray-500">
                                            Envío: se calculará en el siguiente paso
                                        </p>
                                    )}
                                    {!item.shipping && !isSendcloudItem(item) && (
                                        <p className="mt-1 text-xs text-amber-600">
                                            Método de envío no seleccionado
                                        </p>
                                    )}
                                    <div className="mt-3 flex items-center justify-between text-sm">
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
                                                    disabled={currentStep === STEP_PAYMENT}
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
    )

    // Render order summary (used in all steps)
    const hasSendcloudItems = cart.some(item => isSendcloudItem(item))
    const sendcloudTotal = getSendcloudShippingTotal()

    const renderOrderSummary = () => (
        <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
                <p>Subtotal productos</p>
                <p>€{getSubtotal().toFixed(2)}</p>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
                <p>Envío</p>
                <p>€{(getTotalShipping() + sendcloudTotal).toFixed(2)}</p>
            </div>
            {hasSendcloudItems && sendcloudTotal === 0 && currentStep < STEP_SHIPPING && (
                <p className="text-xs text-gray-400">
                    Algunos gastos de envío se calcularán en un paso posterior
                </p>
            )}
            <div className="flex justify-between text-base font-medium text-gray-900 pt-2 border-t border-gray-200">
                <p>Total</p>
                <p>€{getTotalPrice().toFixed(2)}</p>
            </div>
            {getShippingBreakdown().length > 0 && (
                <div className="mt-2 rounded-md bg-gray-50 px-3 py-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">
                        Detalle de los gastos de envío
                    </p>
                    <ul className="space-y-1">
                        {getShippingBreakdown().map((group, index) => {
                            const sellerText = group.sellerName
                                ? `del autor ${group.sellerName}`
                                : 'del mismo autor'

                            return (
                                <li key={`${group.sellerId}-${group.productType}-${group.methodId}-${index}`} className="text-[11px] text-gray-600">
                                    <span className="font-semibold">{group.methodName}</span>{' '}
                                    <span>
                                        {sellerText}: {group.totalUnits} artículos
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
    )

    // Render payment method selection cards
    const renderPaymentMethodSelection = () => (
        <fieldset className="mb-6">
            <legend className="text-sm font-bold underline text-gray-900">Selecciona el método de pago</legend>
            <div className="mt-4 grid grid-cols-4 gap-3">
                {paymentMethods.map((method) => (
                    <label
                        key={method.id}
                        aria-label={method.title}
                        className={`group relative flex flex-col rounded-lg border bg-white p-3 cursor-pointer transition-all
                            ${method.disabled
                                ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                                : 'border-gray-300 hover:border-gray-400'}
                            ${selectedPaymentMethod === method.id && !method.disabled
                                ? 'outline outline-2 -outline-offset-2 outline-black border-black'
                                : ''}
                        `}
                    >
                        <input
                            type="radio"
                            name="payment-method"
                            value={method.id}
                            checked={selectedPaymentMethod === method.id}
                            onChange={() => !method.disabled && handlePaymentMethodSelect(method.id)}
                            disabled={method.disabled}
                            className="sr-only"
                        />
                        <span className={`block text-xs font-medium ${method.disabled ? 'text-gray-400' : 'text-gray-900'}`}>
                            {method.title}
                        </span>
                        <div className="mt-2 flex items-center gap-1">
                            {method.icons.map((icon, idx) => (
                                <Image
                                    key={idx}
                                    src={icon}
                                    alt=""
                                    width={32}
                                    height={20}
                                    className={`h-5 w-auto object-contain ${method.disabled ? 'grayscale opacity-50' : ''}`}
                                />
                            ))}
                        </div>
                        {!method.disabled && (
                            <CheckCircleIcon
                                aria-hidden="true"
                                className={`absolute top-2 right-2 size-5 text-black ${selectedPaymentMethod === method.id ? 'visible' : 'invisible'}`}
                            />
                        )}
                    </label>
                ))}
            </div>
        </fieldset>
    )

    return (
        <>
            {/* Full-screen loading overlay */}
            {isProcessing && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/70 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"/>
                        <p className="text-sm text-gray-700">Procesando tu pedido...</p>
                        <p className="text-sm text-gray-700">No recargues ni cierres la página hasta que se complete el proceso</p>
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
                                className={`w-screen max-w-md lg:max-w-xl transform transition duration-500 ease-in-out data-[closed]:translate-x-full sm:duration-700 ${isProcessing ? 'pointer-events-none' : 'pointer-events-auto'}`}
                            >
                                <div className="flex h-full flex-col overflow-y-auto bg-white shadow-xl">
                                    <div className="flex-1 px-4 py-6 sm:px-6">
                                        <div className="flex items-start justify-between">
                                            <DialogTitle className="text-lg font-medium text-gray-900">
                                                Carrito de compra
                                            </DialogTitle>
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
                                            renderCartItems()
                                        )}
                                    </div>

                                    {cart.length > 0 && (
                                        <div className="border-t border-gray-200 px-4 py-6 sm:px-6">
                                            {/* Step 2: Address Input */}
                                            {currentStep === STEP_ADDRESS && (
                                                <div className="mb-6 space-y-6">
                                                    {addressError && (
                                                        <div className="rounded-lg bg-red-50 p-4">
                                                            <p className="text-sm text-red-800">{addressError}</p>
                                                        </div>
                                                    )}

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
                                                </div>
                                            )}

                                            {/* Step 3: Shipping Selection (Sendcloud) */}
                                            {currentStep === STEP_SHIPPING && (
                                                <div className="mb-6">
                                                    <ShippingStep deliveryAddress={deliveryAddress} />
                                                </div>
                                            )}

                                            {/* Step 4: Payment Method Selection */}
                                            {currentStep === STEP_PAYMENT && (
                                                <div className="mb-6 space-y-6">
                                                    {/* Revolut: show payment method cards */}
                                                    {PAYMENT_PROVIDER !== 'stripe' && renderPaymentMethodSelection()}

                                                    {/* === STRIPE PROVIDER === */}
                                                    {/* Stripe: show Express Checkout + PaymentElement directly (no method cards) */}
                                                    {PAYMENT_PROVIDER === 'stripe' && stripeClientSecret && (
                                                        <Elements
                                                            stripe={getStripePromise()}
                                                            options={{
                                                                clientSecret: stripeClientSecret,
                                                                fonts: [
                                                                    { cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap' },
                                                                ],
                                                                appearance: {
                                                                    theme: 'stripe',
                                                                    variables: {
                                                                        colorPrimary: '#000000',
                                                                        fontFamily: 'Inter, system-ui, sans-serif',
                                                                    },
                                                                },
                                                            }}
                                                        >
                                                            {/* Express Checkout (Google Pay / Apple Pay) - on top */}
                                                            <div>
                                                                <h3 className="text-sm font-bold underline text-gray-900 mb-2">Pago exprés</h3>
                                                                <StripeExpressCheckout
                                                                    onConfirm={async () => {
                                                                        setIsProcessing(true)
                                                                        try {
                                                                            await placeOrderInDatabase()
                                                                            await handleStripePaymentSuccess()
                                                                        } catch (err) {
                                                                            showBanner(err.message || 'Error al procesar el pago')
                                                                            setIsProcessing(false)
                                                                        }
                                                                    }}
                                                                    onReady={(available) => setIsStripeExpressAvailable(available)}
                                                                    onError={(msg) => {
                                                                        showBanner(msg)
                                                                        setIsProcessing(false)
                                                                    }}
                                                                />
                                                            </div>

                                                            {/* Divider between express and standard payment */}
                                                            <div className="relative my-4">
                                                                <div className="absolute inset-0 flex items-center">
                                                                    <div className="w-full border-t border-gray-200" />
                                                                </div>
                                                                <div className="relative flex justify-center text-sm">
                                                                    <span className="bg-white px-4 text-gray-500">o</span>
                                                                </div>
                                                            </div>

                                                            {/* PaymentElement (card, Link, Klarna, etc.) - below */}
                                                            <div>
                                                                <h3 className="text-sm font-bold underline text-gray-900 mb-2">Pago</h3>
                                                                <StripeCardPayment
                                                                    onReady={() => {}}
                                                                    onValidChange={(valid) => setIsStripeCardValid(valid)}
                                                                />
                                                            </div>

                                                            {/* Pay button */}
                                                            <StripePayButton
                                                                isValid={isStripeCardValid}
                                                                isProcessing={isProcessing}
                                                                onBeforeSubmit={async () => {
                                                                    setIsProcessing(true)
                                                                    await placeOrderInDatabase()
                                                                }}
                                                                onSuccess={handleStripePaymentSuccess}
                                                                onError={(msg) => {
                                                                    showBanner(msg)
                                                                    setIsProcessing(false)
                                                                }}
                                                                personalInfo={personalInfo}
                                                            />
                                                        </Elements>
                                                    )}

                                                    {/* Stripe initializing spinner */}
                                                    {PAYMENT_PROVIDER === 'stripe' && !stripeClientSecret && (
                                                        <div className="flex items-center justify-center py-4">
                                                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"/>
                                                            <span className="ml-2 text-sm text-gray-600">Cargando formulario de pago...</span>
                                                        </div>
                                                    )}

                                                    {/* === REVOLUT PROVIDER === */}
                                                    {/* Card field - only shown when card payment is selected and initialized */}
                                                    {PAYMENT_PROVIDER === 'revolut' && selectedPaymentMethod === PAYMENT_METHOD_CARD && (
                                                        <div className="mt-4">
                                                            {isInitializingPayment ? (
                                                                <div className="flex items-center justify-center py-4">
                                                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"/>
                                                                    <span className="ml-2 text-sm text-gray-600">Cargando formulario de pago...</span>
                                                                </div>
                                                            ) : revolutOrderToken ? (
                                                                <>
                                                                    <h3 className="text-sm font-bold underline text-gray-900 mb-2">Datos de la tarjeta</h3>
                                                                    <div
                                                                        ref={cardFieldContainerRef}
                                                                        id="card-field"
                                                                        className="rounded-md border border-gray-300 bg-white px-3 py-3"
                                                                    />
                                                                    <p className="mt-2 text-xs text-gray-500">
                                                                        El nombre del propietario de la tarjeta debe coincidir con el nombre introducido en el paso anterior.
                                                                    </p>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    )}

                                                    {/* Revolut Pay button - only shown when Revolut Pay is selected */}
                                                    {PAYMENT_PROVIDER === 'revolut' && selectedPaymentMethod === PAYMENT_METHOD_REVOLUT && (
                                                        <div className="mt-4">
                                                            {isInitializingPayment ? (
                                                                <div className="flex items-center justify-center py-4">
                                                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"/>
                                                                    <span className="ml-2 text-sm text-gray-600">Cargando Revolut Pay...</span>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <h3 className="text-sm font-bold underline text-gray-900 mb-2">Pagar con Revolut</h3>
                                                                    <div
                                                                        ref={revolutPayContainerRef}
                                                                        id="revolut-pay"
                                                                        className="min-h-[48px]"
                                                                    />
                                                                    <p className="mt-2 text-xs text-gray-500">
                                                                        Haz clic en el botón de Revolut Pay para completar tu pago de forma segura.
                                                                    </p>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Order Summary */}
                                            {renderOrderSummary()}
                                            <p className="mt-2 text-xs text-gray-500">
                                                Los impuestos se calcularán según tu ubicación.
                                            </p>

                                            {/* Action Buttons */}
                                            <div className="mt-6">
                                                {currentStep === STEP_CART && (
                                                    <>
                                                        <button
                                                            onClick={handleCheckout}
                                                            disabled={isProcessing || cart.some(item => !item.shipping && !isSendcloudItem(item))}
                                                            className="flex w-full items-center justify-center gap-2 rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <CreditCardIcon aria-hidden="true" className="size-5"/>
                                                            {isProcessing ? 'Procesando...' : 'Completar pedido'}
                                                        </button>
                                                        {cart.some(item => !item.shipping && !isSendcloudItem(item)) && (
                                                            <p className="mt-2 text-xs text-center text-amber-600">
                                                                Algunos productos no tienen método de envío seleccionado
                                                            </p>
                                                        )}
                                                    </>
                                                )}

                                                {currentStep === STEP_ADDRESS && (
                                                    <>
                                                        <button
                                                            onClick={handleProceedFromAddress}
                                                            disabled={isProcessing || !isStep2FormComplete()}
                                                            className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {isProcessing ? 'Procesando...' : (SENDCLOUD_ENABLED ? 'Elegir envío' : 'Ir al pago')}
                                                        </button>
                                                        {!isStep2FormComplete() && (
                                                            <p className="mt-2 text-xs text-center text-gray-500">
                                                                Completa todos los campos requeridos para continuar
                                                            </p>
                                                        )}
                                                    </>
                                                )}

                                                {currentStep === STEP_SHIPPING && (
                                                    <button
                                                        onClick={handleProceedToPaymentStep}
                                                        disabled={isProcessing || Object.keys(shippingSelections).length === 0}
                                                        className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isProcessing ? 'Procesando...' : 'Ir al pago'}
                                                    </button>
                                                )}

                                                {currentStep === STEP_PAYMENT && (
                                                    <>
                                                        {/* Revolut Card payment button */}
                                                        {PAYMENT_PROVIDER === 'revolut' && selectedPaymentMethod === PAYMENT_METHOD_CARD && (
                                                            <>
                                                                {cardValidationErrors.length > 0 && (
                                                                    <div className="mb-3">
                                                                        {cardValidationErrors.map((error, index) => (
                                                                            <p key={index} className="text-sm text-red-600">
                                                                                {error}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <button
                                                                    onClick={handleCardPayment}
                                                                    disabled={isProcessing || !isCardFieldValid}
                                                                    className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {isProcessing ? 'Procesando...' : 'Pagar'}
                                                                </button>
                                                                {!isCardFieldValid && cardValidationErrors.length === 0 && !isProcessing && (
                                                                    <p className="mt-2 text-xs text-center text-gray-500">
                                                                        Por favor, completa los datos de tu tarjeta para continuar
                                                                    </p>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Revolut Pay - button is rendered by SDK, no extra button needed */}
                                                        {PAYMENT_PROVIDER === 'revolut' && selectedPaymentMethod === PAYMENT_METHOD_REVOLUT && !isRevolutPayMounted && !isInitializingPayment && (
                                                            <p className="mt-2 text-xs text-center text-gray-500">
                                                                Cargando botón de Revolut Pay...
                                                            </p>
                                                        )}

                                                        {/* Stripe: pay button and express checkout are rendered inside Elements above */}

                                                        {/* No payment method selected (Revolut only) */}
                                                        {PAYMENT_PROVIDER !== 'stripe' && !selectedPaymentMethod && (
                                                            <>
                                                                <button
                                                                    disabled={true}
                                                                    className="flex w-full items-center justify-center rounded-md border border-transparent bg-black px-6 py-3 text-base font-medium text-white shadow-xs hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    Pagar
                                                                </button>
                                                                <p className="mt-2 text-xs text-center text-gray-500">
                                                                    Selecciona un método de pago para continuar
                                                                </p>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {/* Navigation Links */}
                                            <div className="mt-6 flex justify-center text-center text-sm text-gray-500">
                                                <p>
                                                    {currentStep === STEP_CART && (
                                                        <button
                                                            type="button"
                                                            onClick={handleCloseDrawer}
                                                            className="font-medium text-black hover:text-gray-600"
                                                        >
                                                            Continuar comprando
                                                            <span aria-hidden="true"> &rarr;</span>
                                                        </button>
                                                    )}
                                                    {currentStep === STEP_ADDRESS && (
                                                        <button
                                                            type="button"
                                                            onClick={handleBackToCart}
                                                            className="font-medium text-black hover:text-gray-600"
                                                        >
                                                            <span aria-hidden="true">&larr; </span>
                                                            Volver al carrito
                                                        </button>
                                                    )}
                                                    {currentStep === STEP_SHIPPING && (
                                                        <button
                                                            type="button"
                                                            onClick={handleBackToAddress}
                                                            className="font-medium text-black hover:text-gray-600"
                                                        >
                                                            <span aria-hidden="true">&larr; </span>
                                                            Volver a la dirección
                                                        </button>
                                                    )}
                                                    {currentStep === STEP_PAYMENT && (
                                                        <button
                                                            type="button"
                                                            onClick={SENDCLOUD_ENABLED ? handleBackToShipping : handleBackToAddress}
                                                            className="font-medium text-black hover:text-gray-600"
                                                        >
                                                            <span aria-hidden="true">&larr; </span>
                                                            Volver
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
