'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { sellerKindOf } from '@/lib/sellerCapabilities'

export default function AuthGuard({ children, requireRole = null, requireSellerKind = null }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Seller kind gate (seller-kind-artist-speaker). Convenience only: the
  // authority is the 403 `requireArtistSeller` returns on the server. This
  // exists so a speaker who types /seller/publish lands somewhere sensible
  // instead of on a form that fails when they submit it.
  //
  // `sellerKindOf` normalises a missing value to 'artist', which matters here
  // more than anywhere else: the `user` object comes from localStorage and a
  // session opened before this shipped carries no `seller_kind` at all.
  // Reading that as a speaker would lock an artist out of their own screens.
  const kindAllowed = !requireSellerKind || sellerKindOf(user) === requireSellerKind
  const roleAllowed = !requireRole || user?.role === requireRole
  const allowed = !!user && roleAllowed && kindAllowed

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

      // Same treatment for a section reserved to one kind of seller
      if (!kindAllowed) {
        router.push('/')
        return
      }
    }
  }, [user, loading, requireRole, kindAllowed, router])

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
  if (!allowed) {
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
