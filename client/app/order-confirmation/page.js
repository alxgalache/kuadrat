'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function OrderConfirmationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orderData, setOrderData] = useState(null)
  const [isValidating, setIsValidating] = useState(true)

  useEffect(() => {
    const validateAndLoadOrder = () => {
      const token = searchParams.get('token')

      if (!token) {
        router.replace('/')
        return
      }

      const storageKey = `order_token_${token}`
      const storedData = sessionStorage.getItem(storageKey)

      if (storedData) {
        try {
          const data = JSON.parse(storedData)
          setOrderData(data)
          sessionStorage.removeItem(storageKey)
          setIsValidating(false)
        } catch (error) {
          router.replace('/')
        }
      } else {
        router.replace('/')
      }
    }

    const timeoutId = setTimeout(validateAndLoadOrder, 200)

    return () => clearTimeout(timeoutId)
  }, [router, searchParams])

  if (isValidating || !orderData) {
    // Show nothing while checking/redirecting
    return null
  }

  const contactMethodText = orderData.contactType === 'email'
    ? `correo electrónico (${orderData.contact})`
    : `WhatsApp (${orderData.contact})`

  return (
    <div className="bg-white px-6 py-24 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-base/7 font-semibold text-amber-600">Pedido completado</p>
          {/*#{orderData.orderId}*/}
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Gracias por tu compra
        </h2>
        <p className="mt-8 text-lg font-medium text-pretty text-gray-500 sm:text-xl/8">
          Hemos recibido tu pedido correctamente. Te enviaremos todas las actualizaciones y confirmación a través de {contactMethodText}.
        </p>
        <div className="mt-10">
          <button
            onClick={() => router.push('/galeria')}
            className="rounded-md bg-black px-6 py-3 text-base font-semibold text-white shadow-xs hover:bg-gray-900"
          >
            Volver a la galería
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<div className="bg-white min-h-screen"></div>}>
      <OrderConfirmationContent />
    </Suspense>
  )
}
