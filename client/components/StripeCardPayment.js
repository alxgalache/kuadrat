'use client'

import { useEffect, useState } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

/**
 * StripeCardPayment - Wraps Stripe's PaymentElement for card input.
 * Props:
 *   onReady(isReady: boolean) - called when card input is ready/not ready
 *   onValidChange(isValid: boolean) - called when validation state changes
 */
export default function StripeCardPayment({ onReady, onValidChange }) {
  const stripe = useStripe()
  const elements = useElements()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (stripe && elements) {
      setIsReady(true)
      onReady?.(true)
    }
  }, [stripe, elements, onReady])

  const handleChange = (event) => {
    // PaymentElement fires change events with complete property
    onValidChange?.(event.complete)
  }

  if (!stripe || !elements) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <span className="ml-2 text-sm text-gray-600">Cargando formulario de pago...</span>
      </div>
    )
  }

  return (
    <div>
      <PaymentElement
        onChange={handleChange}
        options={{
          layout: 'tabs',
        }}
      />
    </div>
  )
}
