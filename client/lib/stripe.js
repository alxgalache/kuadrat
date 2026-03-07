import { loadStripe } from '@stripe/stripe-js'

let stripePromise = null

export function getStripePromise() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (key) {
      stripePromise = loadStripe(key, {
        developerTools: {
          assistant: {
            enabled: false
          }
        }
      })
    }
  }
  return stripePromise
}
