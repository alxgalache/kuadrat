'use client'

import { useRouter } from 'next/navigation'
import { XCircleIcon } from '@heroicons/react/20/solid'

export default function PagoCanceladoPage() {
  const router = useRouter()

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
                <h3 className="text-sm font-medium text-red-800">Pago cancelado</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>
                    Has cancelado el proceso de pago. No se ha realizado ningún cargo a tu cuenta.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance text-gray-900 sm:text-4xl">
              El pago ha sido cancelado
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg/8 text-pretty text-gray-600">
              Si deseas completar tu compra, puedes volver a intentarlo desde el carrito.
              Los productos seleccionados se mantienen guardados.
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
                  // Open the cart drawer by dispatching a custom event
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-cart-drawer'))
                  }
                  router.push('/')
                }}
                className="text-sm font-semibold text-gray-900 hover:text-gray-600"
              >
                Ver mi carrito <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
