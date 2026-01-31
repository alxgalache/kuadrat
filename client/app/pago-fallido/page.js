'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { XCircleIcon } from '@heroicons/react/20/solid'

const PAYMENT_PROVIDER = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || 'revolut'

function PagoFallidoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isValidAccess, setIsValidAccess] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  // Get error description from URL param (added by Revolut on redirect)
  const failureReason = searchParams.get('_rp_fr')
  const revolutOrderId = searchParams.get('_rp_oid')

  // Stripe error params
  const stripePaymentIntent = searchParams.get('payment_intent')
  const stripeError = searchParams.get('error')

  // Validate access
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check for Stripe failure redirect
    if (stripePaymentIntent && PAYMENT_PROVIDER === 'stripe') {
      setIsValidAccess(true)
      setIsChecking(false)
      return
    }

    // Check if we have a valid pending order for this Revolut order ID
    if (revolutOrderId) {
      try {
        const stored = window.sessionStorage.getItem('kuadrat_pending_revolut_pay_order')
        if (stored) {
          const pendingOrder = JSON.parse(stored)
          // Validate that the order ID or token matches
          if (pendingOrder.revolutOrderId === revolutOrderId || pendingOrder.revolutOrderToken === revolutOrderId) {
            setIsValidAccess(true)
            setIsChecking(false)
            return
          }
        }
      } catch (e) {
        console.error('Error checking pending order:', e)
      }
    }

    // Invalid access - redirect to home
    setIsChecking(false)
    router.replace('/')
  }, [revolutOrderId, stripePaymentIntent, router])

  // Show nothing while checking
  if (isChecking) {
    return <div className="bg-white min-h-screen"></div>
  }

  // Show nothing if invalid (will redirect)
  if (!isValidAccess) {
    return <div className="bg-white min-h-screen"></div>
  }

  return (
    <div className="relative isolate overflow-hidden bg-white min-h-screen">
      <div className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl">
          {/* Error Alert */}
          <div className="rounded-md bg-red-50 p-4 mb-8">
            <div className="flex">
              <div className="shrink-0">
                <XCircleIcon aria-hidden="true" className="size-5 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error en el pago</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>
                    No hemos podido procesar tu pago.
                    {(failureReason || stripeError) && (
                      <> {failureReason || stripeError}</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance text-gray-900 sm:text-4xl">
              El pago no se ha completado
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg/8 text-pretty text-gray-600">
              No te preocupes, no se ha realizado ningún cargo a tu cuenta.
              Por favor, intenta de nuevo o utiliza un medio de pago diferente.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <button
                onClick={() => router.push('/')}
                className="rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                Volver a la tienda
              </button>
              <button
                onClick={() => {
                  // Navigate to home first, then open cart drawer
                  router.push('/')
                  // Use a small delay to ensure navigation completes before dispatching event
                  setTimeout(() => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('open-cart-drawer'))
                    }
                  }, 100)
                }}
                className="text-sm font-semibold text-gray-900 hover:text-gray-600"
              >
                Reintentar pago <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
            <p className="mt-8 text-sm text-gray-500">
              Si el problema persiste, contacta con nosotros en{' '}
              <a href="mailto:info@140d.art" className="text-black hover:underline">
                info@140d.art
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PagoFallidoPage() {
  return (
    <Suspense fallback={<div className="bg-white min-h-screen"></div>}>
      <PagoFallidoContent />
    </Suspense>
  )
}
