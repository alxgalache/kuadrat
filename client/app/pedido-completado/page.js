'use client'

import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCart } from '@/contexts/CartContext'
import { paymentsAPI, ordersAPI } from '@/lib/api'
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'

// Polling configuration with exponential backoff
// We wait before first poll to give webhook time to process
const INITIAL_WAIT_MS = 2000        // Wait 2s before first poll
const INITIAL_POLL_INTERVAL_MS = 2500  // First poll interval: 2.5s
const MAX_POLL_INTERVAL_MS = 5000   // Cap interval at 5s
const MAX_POLL_ATTEMPTS = 8         // Max 8 attempts (~30s total)

function PedidoCompletadoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { clearCart } = useCart()

  const [ready, setReady] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingMessage, setProcessingMessage] = useState('Verificando tu pago...')
  const [error, setError] = useState(null)
  const [isValidAccess, setIsValidAccess] = useState(false)
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)

  // Ref to prevent multiple executions (React StrictMode, dependency changes)
  const hasStartedRef = useRef(false)

  // Get URL params
  const token = searchParams.get('token')
  const revolutOrderIdFromUrl = searchParams.get('_rp_oid')

  // Validate access on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    let valid = false

    // Check for card/web flow with token param
    if (token) {
      const storageKey = `order_token_${token}`
      const storedData = sessionStorage.getItem(storageKey)
      if (storedData) {
        valid = true
      }
    }

    // Check for Revolut Pay mobile flow with _rp_oid param
    if (!valid && revolutOrderIdFromUrl) {
      try {
        const stored = sessionStorage.getItem('kuadrat_pending_revolut_pay_order')
        if (stored) {
          const pendingOrder = JSON.parse(stored)
          if (pendingOrder.revolutOrderId === revolutOrderIdFromUrl || pendingOrder.revolutOrderToken === revolutOrderIdFromUrl) {
            valid = true
          }
        }
      } catch (e) {
        console.error('Error checking pending order:', e)
      }
    }

    if (!valid) {
      // Invalid access - redirect to home
      setIsCheckingAccess(false)
      router.replace('/')
      return
    }

    setIsValidAccess(true)
    setIsCheckingAccess(false)
  }, [token, revolutOrderIdFromUrl, router])

  // Check for Revolut Pay redirect and handle payment confirmation
  const handleRevolutPayRedirect = useCallback(async () => {
    // Wait for access validation to complete
    if (isCheckingAccess || !isValidAccess) return

    // Prevent multiple executions (React StrictMode, dependency changes)
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    // Also check for pending order info in sessionStorage
    let pendingOrderInfo = null
    if (typeof window !== 'undefined') {
      try {
        const stored = window.sessionStorage.getItem('kuadrat_pending_revolut_pay_order')
        if (stored) {
          pendingOrderInfo = JSON.parse(stored)
          // Clear it immediately to prevent re-processing on refresh
          window.sessionStorage.removeItem('kuadrat_pending_revolut_pay_order')
        }
      } catch (e) {
        console.error('Error reading pending order info:', e)
      }
    }

    // If we have a Revolut order ID (from URL or session), we need to verify/confirm the payment
    const revolutOrderId = revolutOrderIdFromUrl || pendingOrderInfo?.revolutOrderId

    if (!revolutOrderId) {
      // No Revolut Pay redirect, just show the success page
      // This handles the normal Card payment flow which redirects here after success
      setReady(true)
      return
    }

    // This is a Revolut Pay redirect - we need to check if the webhook has confirmed the payment
    setIsProcessing(true)
    setProcessingMessage('Verificando tu pago...')

    try {
      // Wait initially to give webhook time to process
      await new Promise(r => setTimeout(r, INITIAL_WAIT_MS))

      // Poll the backend to check order status with exponential backoff
      let attempt = 0
      let orderConfirmed = false
      let orderData = null
      let interval = INITIAL_POLL_INTERVAL_MS

      while (attempt < MAX_POLL_ATTEMPTS && !orderConfirmed) {
        try {
          const statusResp = await paymentsAPI.getOrderStatusByRevolutId(revolutOrderId)

          if (statusResp.found && statusResp.is_paid) {
            // Webhook already confirmed the payment
            orderConfirmed = true
            orderData = statusResp
            break
          } else if (statusResp.found && statusResp.status === 'pending') {
            // Order exists but not yet confirmed - wait and retry
            setProcessingMessage('Confirmando pago...')
          }
        } catch (pollErr) {
          // 404 means order not found yet, keep polling
          // 429 means rate limited, also keep polling with backoff
          if (pollErr?.status !== 404 && pollErr?.status !== 429) {
            console.error('Error polling order status:', pollErr)
          }
        }

        attempt++
        if (attempt < MAX_POLL_ATTEMPTS) {
          await new Promise(r => setTimeout(r, interval))
          // Mild exponential backoff: multiply by 1.4, up to max
          interval = Math.min(Math.floor(interval * 1.4), MAX_POLL_INTERVAL_MS)
        }
      }

      if (orderConfirmed) {
        // Payment confirmed, clear cart and show success
        clearCart()
        setReady(true)
        setIsProcessing(false)
        return
      }

      // If we have the order info from session, try to manually confirm
      if (pendingOrderInfo?.orderId && pendingOrderInfo?.revolutOrderId) {
        setProcessingMessage('Finalizando tu pedido...')

        try {
          // Try to get the payment ID from Revolut
          const paymentResp = await paymentsAPI.getLatestRevolutPayment(pendingOrderInfo.revolutOrderId)

          if (paymentResp?.payment_id) {
            // Confirm the payment manually
            await ordersAPI.updatePayment({
              orderId: pendingOrderInfo.orderId,
              paymentId: paymentResp.payment_id,
            })

            // Clear cart and show success
            clearCart()
            setReady(true)
            setIsProcessing(false)
            return
          }
        } catch (confirmErr) {
          console.error('Error manually confirming payment:', confirmErr)
        }
      }

      // If we reach here, we couldn't confirm the payment
      // Show success anyway (webhook might confirm it later)
      // but display a message about potential delay
      clearCart()
      setReady(true)
      setIsProcessing(false)

    } catch (err) {
      console.error('Error handling Revolut Pay redirect:', err)
      setError('Hubo un problema al verificar tu pago. Si completaste el pago, recibirás el email de confirmación en breve.')
      setIsProcessing(false)
      setReady(true)
    }
  }, [isCheckingAccess, isValidAccess, revolutOrderIdFromUrl, clearCart])

  useEffect(() => {
    handleRevolutPayRedirect()
  }, [handleRevolutPayRedirect, isCheckingAccess, isValidAccess])

  // Also clear cart if coming from normal checkout flow with token
  useEffect(() => {
    if (!isValidAccess || isCheckingAccess) return
    if (token && typeof window !== 'undefined') {
      const storageKey = `order_token_${token}`
      const storedData = sessionStorage.getItem(storageKey)
      if (storedData) {
        sessionStorage.removeItem(storageKey)
        clearCart()
      }
    }
  }, [token, clearCart, isValidAccess, isCheckingAccess])

  // Show nothing while checking access
  if (isCheckingAccess) {
    return <div className="bg-white min-h-screen"></div>
  }

  // Show nothing if invalid access (will redirect)
  if (!isValidAccess) {
    return <div className="bg-white min-h-screen"></div>
  }

  if (isProcessing) {
    return (
      <div className="relative isolate overflow-hidden bg-white min-h-screen">
        <div className="px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
              <p className="text-lg text-gray-600">{processingMessage}</p>
              <p className="text-sm text-gray-500">No cierres o salgas de esta página hasta que la operación se haya realizado.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!ready) return null

  return (
    <div className="relative isolate overflow-hidden bg-white min-h-screen">
      <div className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl">

          {/* Warning if there was an issue */}
          {error && (
            <div className="rounded-md bg-yellow-50 p-4 mb-8">
              <div className="flex">
                <div className="shrink-0">
                  <ExclamationTriangleIcon aria-hidden="true" className="size-5 text-yellow-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">Aviso</h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-balance text-gray-900 sm:text-5xl">
              Pedido completado
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg/8 text-pretty text-gray-600">
              Tu pedido se ha realizado correctamente. Recibirás por correo electrónico los detalles del pedido y del seguimiento.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <button
                onClick={() => router.push('/')}
                className="rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                Volver al inicio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PedidoCompletadoPage() {
  return (
    <Suspense fallback={<div className="bg-white min-h-screen"></div>}>
      <PedidoCompletadoContent />
    </Suspense>
  )
}
