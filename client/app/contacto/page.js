'use client'

import { useState } from 'react'
import { useBannerNotification } from '@/contexts/BannerNotificationContext'

export default function RegistroPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const { showBanner } = useBannerNotification()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const response = await fetch(`${API_URL}/auth/registration-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        const error = new Error(data.message || 'Error al enviar solicitud')
        error.response = data
        throw error
      }

      showBanner('¡Solicitud enviada! Te contactaremos pronto con los detalles de registro.')
      setEmail('')
    } catch (error) {
      showBanner('Error al enviar solicitud. Por favor, inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white py-16 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance text-gray-900 sm:text-4xl">
          ¿Quieres vender tu arte? Solicita tu registro como artista.
        </h2>
        <form onSubmit={handleSubmit} className="mt-10 max-w-md">
          <div className="flex gap-x-4">
            <label htmlFor="email-address" className="sr-only">
              Correo electrónico
            </label>
            <input
              id="email-address"
              name="email"
              type="email"
              required
              placeholder="Introduce tu correo electrónico"
              autoComplete="email_registro"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="min-w-0 flex-auto rounded-md border border-gray-300 bg-white px-3.5 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex-none rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Solicitar'}
            </button>
          </div>
          <p className="mt-4 text-sm/6 text-gray-900">
            Nos importa tu privacidad. Lee nuestra{' '}
            <a href="#" className="font-semibold whitespace-nowrap text-black hover:text-gray-800">
              política de privacidad
            </a>
            .
          </p>
        </form>
      </div>
    </div>
  )
}
