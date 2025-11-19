'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function PedidoCompletadoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Validate short‑lived session token for UX
    // const token = searchParams.get('token')
    // if (!token) {
    //   router.replace('/')
    //   return
    // }
    // const storageKey = `order_token_${token}`
    // const storedData = sessionStorage.getItem(storageKey)
    // if (!storedData) {
    //   router.replace('/')
    //   return
    // }
    // // Clear token and show page
    // sessionStorage.removeItem(storageKey)
    setReady(true)
  }, [router, searchParams])

  if (!ready) return null

  return (
    <div className="relative isolate overflow-hidden bg-white">
      <div className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-balance text-gray-900 sm:text-5xl">
            Pedido completado
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg/8 text-pretty text-gray-600">
            Tu pedido se ha realizado correctamente. Recibirás por correo electrónico los detalles del pedido y del seguimiento.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <button
              onClick={() => router.push('/')}
              className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-xs hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Volver al inicio
            </button>
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
