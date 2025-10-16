'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthGuard({ children, requireRole = null }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      // If not authenticated at all, redirect to login
      if (!user) {
        router.push('/autores')
        return
      }

      // If a specific role is required and user doesn't have it, redirect to home
      if (requireRole && user.role !== requireRole) {
        router.push('/')
        return
      }
    }
  }, [user, loading, requireRole, router])

  // While checking authentication, show nothing to prevent flash
  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-500">Cargando...</p>
        </div>
      </div>
    )
  }

  // If not authenticated or wrong role, show nothing while redirecting
  if (!user || (requireRole && user.role !== requireRole)) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-500">Redirigiendo...</p>
        </div>
      </div>
    )
  }

  // Only render children if authenticated and authorized
  return <>{children}</>
}
