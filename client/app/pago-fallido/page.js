'use client'

import { useRouter } from 'next/navigation'
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'

export default function PagoFallidoPage() {
  const router = useRouter()

  return (
    <div className="relative isolate overflow-hidden bg-white min-h-screen">
      <div className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl">
          {/* Error Alert */}
          <div className="rounded-md bg-yellow-50 p-4 mb-8">
            <div className="flex">
              <div className="shrink-0">
                <ExclamationTriangleIcon aria-hidden="true" className="size-5 text-yellow-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Error en el pago</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    No hemos podido procesar tu pago. Esto puede deberse a fondos insuficientes,
                    datos de tarjeta incorrectos, o un problema temporal con el servicio de pagos.
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
                  // Open the cart drawer by dispatching a custom event
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-cart-drawer'))
                  }
                  router.push('/')
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
