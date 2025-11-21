'use client'

import { useEffect, useState } from 'react'
import { testAccessAPI } from '@/lib/api'

const SESSION_KEY = 'test_access_granted'

export default function TestAccessGate({ gateEnabled, children }) {
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!gateEnabled) {
      setAuthorized(true)
      setChecking(false)
      return
    }

    if (typeof window === 'undefined') {
      setChecking(false)
      return
    }

    try {
      const stored = window.sessionStorage.getItem(SESSION_KEY)
      if (stored === 'true') {
        setAuthorized(true)
      }
    } catch (e) {
      // Ignore storage errors and fall back to asking for password
    }

    setChecking(false)
  }, [gateEnabled])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!gateEnabled || submitting) return

    setSubmitting(true)
    setError('')
    try {
      const trimmed = password.trim()
      if (!trimmed) {
        setError('Por favor, introduce la contraseña de acceso.')
        return
      }

      const res = await testAccessAPI.verify(trimmed)
      if (res && res.success) {
        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(SESSION_KEY, 'true')
          }
        } catch (e) {
          // Ignore storage errors; the user will just be asked again on reload
        }
        setAuthorized(true)
      } else {
        setError('Contraseña incorrecta.')
      }
    } catch (err) {
      if (err && err.status === 401) {
        setError('Contraseña incorrecta.')
      } else if (err && err.message) {
        setError(err.message)
      } else {
        setError('No se ha podido verificar el acceso de prueba.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // While checking sessionStorage, avoid flashing the form
  if (checking) {
    return null
  }

  if (!gateEnabled || authorized) {
    return children
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="relative flex-1 bg-white">
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-6 py-8 shadow-lg">
            <h1 className="text-base font-semibold text-gray-900">Acceso restringido</h1>
            <p className="mt-2 text-sm text-gray-600">
              Esta instancia es solo para pruebas internas. Introduce la contraseña de acceso para continuar.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="test-access-password" className="block text-sm font-medium text-gray-900">
                  Contraseña
                </label>
                <input
                  id="test-access-password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-700 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              >
                {submitting ? 'Verificando…' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
