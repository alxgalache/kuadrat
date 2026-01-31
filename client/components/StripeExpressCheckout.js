'use client'

import { useState } from 'react'
import { ExpressCheckoutElement, useStripe, useElements } from '@stripe/react-stripe-js'

/**
 * StripeExpressCheckout - Wraps Stripe's ExpressCheckoutElement for Google Pay / Apple Pay.
 * Props:
 *   onConfirm() - called when express checkout is confirmed and payment should be finalized
 *   onReady(available: boolean) - called to indicate if wallets are available
 *   onError(message: string) - called on error
 */
export default function StripeExpressCheckout({ onConfirm, onReady, onError }) {
  const stripe = useStripe()
  const elements = useElements()
  const [isAvailable, setIsAvailable] = useState(false)

  const handleReady = ({ availablePaymentMethods }) => {
    // availablePaymentMethods is an object like { applePay: true, googlePay: true }
    const available = availablePaymentMethods && Object.values(availablePaymentMethods).some(Boolean)
    setIsAvailable(available)
    onReady?.(available)
  }

  const handleConfirm = async () => {
    if (!stripe || !elements) return

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/pedido-completado`,
        },
        redirect: 'if_required',
      })

      if (error) {
        onError?.(error.message || 'Error en el pago rápido')
      } else {
        onConfirm?.()
      }
    } catch (err) {
      onError?.(err.message || 'Error procesando el pago rápido')
    }
  }

  if (!stripe || !elements) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <span className="ml-2 text-sm text-gray-600">Cargando...</span>
      </div>
    )
  }

  return (
    <div>
      <ExpressCheckoutElement
        onReady={handleReady}
        onConfirm={handleConfirm}
        options={{
          buttonType: {
            applePay: 'plain',
            googlePay: 'plain',
          },
        }}
      />
      {!isAvailable && (
        <p className="mt-2 text-xs text-center text-gray-500">
          Google Pay / Apple Pay no está disponible en este dispositivo o navegador.
        </p>
      )}
    </div>
  )
}
