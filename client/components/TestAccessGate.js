'use client'

import { useEffect, useState } from 'react'
import { testAccessAPI } from '@/lib/api'

// Token issued by POST /test-access/verify. It carries a fingerprint of the
// password in force, and POST /test-access/check validates it on every full
// page load: changing TEST_ACCESS_PASSWORD revokes every browser at once
// (live-event-access-hardening). The previous key held a bare 'true' for 30
// days that no password change could revoke; it is deleted on sight.
const TOKEN_KEY = 'test_access_token'
const LEGACY_KEY = 'test_access_granted'

function readToken() {
  if (typeof window === 'undefined') return null
  try {
    window.localStorage.removeItem(LEGACY_KEY)
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function saveToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage blocked: the password will simply be asked again next time
  }
}

function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing to clear
  }
}

export default function TestAccessGate({ gateEnabled, children }) {
  // El estado inicial depende de `gateEnabled`, y eso es lo único que hace que
  // el sitio se renderice en el servidor.
  //
  // Antes arrancaba siempre en `checking = true`, y como `checking` solo se
  // apaga dentro de un efecto —que en el servidor no corre— el render de
  // servidor devolvía `null` para TODO el árbol: navbar, página, banner y pie.
  // El HTML de producción llegaba con el `<body>` vacío y la página entera
  // pintaba después de hidratar. Eso es lo que PageSpeed medía como "retraso de
  // renderizado de elementos: 2800 ms", atribuido al banner de cookies solo
  // porque era el bloque de texto más grande de los que aparecían de golpe.
  //
  // Con la puerta desactivada (producción) no hay nada que comprobar, así que
  // no hay motivo para ocultar nada: se sirve el HTML ya renderizado. Con la
  // puerta activada (preproducción) el comportamiento es exactamente el de
  // antes — se sigue devolviendo `null` hasta comprobar el permiso, para no
  // enseñar el contenido antes de la contraseña.
  const [authorized, setAuthorized] = useState(!gateEnabled)
  const [checking, setChecking] = useState(gateEnabled)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!gateEnabled) {
      setAuthorized(true)
      setChecking(false)
      return
    }

    const token = readToken()
    if (!token) {
      setChecking(false)
      return
    }

    // The server decides: a token from a previous password, tampered with or
    // expired is refused and forgotten. A network failure also asks for the
    // password — failing closed is the point of this gate.
    let cancelled = false
    testAccessAPI.check(token)
      .then(() => {
        if (!cancelled) setAuthorized(true)
      })
      .catch(() => {
        clearToken()
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
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
      if (res && res.success && res.token) {
        // Valid for ~30 days AND only while the password stays the same
        saveToken(res.token)
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

  // While the stored token is being checked, avoid flashing the form or the site
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
