'use client'

import { useEffect, useState } from 'react'
import {
  LinkAuthenticationElement,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

/**
 * StripeLinkPayment - Wraps LinkAuthenticationElement + PaymentElement for Stripe Link.
 * Props:
 *   email: string - pre-fill email for Link
 *   onReady(isReady: boolean) - called when form is ready
 *   onValidChange(isValid: boolean) - called when validation state changes
 */
export default function StripeLinkPayment({ email, onReady, onValidChange }) {
  const stripe = useStripe()
  const elements = useElements()
  const [paymentComplete, setPaymentComplete] = useState(false)

  useEffect(() => {
    if (stripe && elements) {
      onReady?.(true)
    }
  }, [stripe, elements, onReady])

  const handlePaymentChange = (event) => {
    setPaymentComplete(event.complete)
    onValidChange?.(event.complete)
  }

  if (!stripe || !elements) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <span className="ml-2 text-sm text-gray-600">Cargando Stripe Link...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <LinkAuthenticationElement
        options={{
          defaultValues: {
            email: email || '',
          },
        }}
      />
      <PaymentElement
        onChange={handlePaymentChange}
        options={{
          layout: 'tabs',
        }}
      />
    </div>
  )
}
