'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authAPI } from '@/lib/api'
import Link from 'next/link'

// Password validation requirements
const PASSWORD_MIN_LENGTH = 8

function validatePassword(password) {
  const checks = {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  }

  const passedChecks = Object.values(checks).filter(Boolean).length
  const totalChecks = Object.keys(checks).length

  return {
    checks,
    passedChecks,
    totalChecks,
    isValid: passedChecks === totalChecks,
    strength: passedChecks / totalChecks,
  }
}

function getStrengthColor(strength) {
  if (strength === 0) return 'bg-gray-200'
  if (strength <= 0.25) return 'bg-red-500'
  if (strength <= 0.5) return 'bg-orange-500'
  if (strength <= 0.75) return 'bg-yellow-500'
  return 'bg-green-500'
}

function getStrengthText(strength) {
  if (strength === 0) return ''
  if (strength <= 0.25) return 'Muy debil'
  if (strength <= 0.5) return 'Debil'
  if (strength <= 0.75) return 'Moderada'
  return 'Fuerte'
}

export default function SetupAccountPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [tokenError, setTokenError] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)

  const validation = useMemo(() => validatePassword(password), [password])
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  useEffect(() => {
    if (!token) {
      setTokenError('No se ha proporcionado un token de configuracion.')
      setLoading(false)
      return
    }

    async function validateToken() {
      try {
        const result = await authAPI.validateSetupToken(token)
        if (result.success && result.user) {
          setUser(result.user)
        } else {
          setTokenError('El enlace de configuracion no es valido.')
        }
      } catch (err) {
        if (err.status === 404) {
          setTokenError('El enlace de configuracion no es valido o ya ha sido utilizado.')
        } else if (err.status === 410) {
          setTokenError('El enlace de configuracion ha expirado. Contacta con el administrador para recibir un nuevo enlace.')
        } else if (err.status === 400) {
          setTokenError('La cuenta ya ha sido configurada.')
        } else {
          setTokenError(err.message || 'No se ha podido validar el enlace de configuracion.')
        }
      } finally {
        setLoading(false)
      }
    }

    validateToken()
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return

    setSubmitError('')

    // Validate password
    if (!validation.isValid) {
      setSubmitError('La contrasena no cumple con los requisitos de seguridad.')
      return
    }

    if (password !== confirmPassword) {
      setSubmitError('Las contrasenas no coinciden.')
      return
    }

    setSubmitting(true)

    try {
      const result = await authAPI.setPassword(token, password, confirmPassword)
      if (result.success) {
        setSuccess(true)
        // Redirect to seller dashboard after 2 seconds
        setTimeout(() => {
          router.push('/')
        }, 2000)
      } else {
        setSubmitError(result.message || 'No se ha podido configurar la contrasena.')
      }
    } catch (err) {
      if (err.message) {
        setSubmitError(err.message)
      } else {
        setSubmitError('No se ha podido configurar la contrasena. Por favor, intentalo de nuevo.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="relative flex-1 bg-white">
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-6 py-8 shadow-lg">
              <p className="text-center text-gray-600">Validando enlace...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Token error state
  if (tokenError) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="relative flex-1 bg-white">
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-6 py-8 shadow-lg">
              <h1 className="text-base font-semibold text-gray-900">Enlace no valido</h1>
              <p className="mt-2 text-sm text-gray-600">{tokenError}</p>
              <div className="mt-6">
                <Link
                  href="/"
                  className="block w-full rounded-md bg-gray-900 px-3 py-2 text-center text-sm font-semibold text-white shadow-xs hover:bg-gray-700"
                >
                  Ir a la pagina principal
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="relative flex-1 bg-white">
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-6 py-8 shadow-lg">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h1 className="mt-4 text-base font-semibold text-gray-900">Cuenta configurada</h1>
                <p className="mt-2 text-sm text-gray-600">
                  Tu contrasena ha sido configurada correctamente. Redirigiendo al inicio...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main form
  return (
    <div className="min-h-screen flex flex-col">
      <div className="relative flex-1 bg-white">
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-6 py-8 shadow-lg">
            <h1 className="text-base font-semibold text-gray-900">
              Hola, {user?.full_name || ''}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Introduce una contrasena para tu usuario.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-900">
                  Contrasena
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>

              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="space-y-2">
                  {/* Strength bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${getStrengthColor(validation.strength)}`}
                        style={{ width: `${validation.strength * 100}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${
                      validation.strength <= 0.5 ? 'text-red-600' :
                      validation.strength <= 0.75 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {getStrengthText(validation.strength)}
                    </span>
                  </div>

                  {/* Requirements checklist */}
                  <ul className="text-xs space-y-1">
                    <li className={`flex items-center gap-1.5 ${validation.checks.minLength ? 'text-green-600' : 'text-gray-500'}`}>
                      {validation.checks.minLength ? (
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                      Minimo 8 caracteres
                    </li>
                    <li className={`flex items-center gap-1.5 ${validation.checks.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}>
                      {validation.checks.hasUppercase ? (
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                      Una letra mayuscula
                    </li>
                    <li className={`flex items-center gap-1.5 ${validation.checks.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}>
                      {validation.checks.hasLowercase ? (
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                      Una letra minuscula
                    </li>
                    <li className={`flex items-center gap-1.5 ${validation.checks.hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                      {validation.checks.hasNumber ? (
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                      Un numero
                    </li>
                  </ul>
                </div>
              )}

              {/* Confirm password field */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-900">
                  Confirmar contrasena
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`mt-2 block w-full rounded-md border px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-1 ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                        : 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900'
                  }`}
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="mt-1 text-xs text-red-600">Las contrasenas no coinciden</p>
                )}
              </div>

              {/* Error message */}
              {submitError && (
                <p className="text-sm text-red-600">{submitError}</p>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting || !validation.isValid || !passwordsMatch}
                className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              >
                {submitting ? 'Configurando...' : 'Configurar contrasena'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
