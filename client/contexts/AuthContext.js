'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Impersonation (admin-user-impersonation). `null` outside a session,
  // `{ sessionId, adminName, targetName, expiresAt }` during one.
  //
  // Read inside the mount effect and never from a useState initializer: this
  // provider is in app/layout.js, whose subtree is server-rendered, and
  // localStorage does not exist there. Every context in that tree obeys the
  // same rule — it is what let SSR be turned on without a hydration mismatch.
  const [impersonation, setImpersonation] = useState(null)

  useEffect(() => {
    // Check if user is logged in on mount
    const currentUser = authAPI.getCurrentUser()
    if (currentUser) {
      setUser(currentUser)
    }
    setImpersonation(authAPI.getImpersonation())
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const data = await authAPI.login(email, password)
    setUser(data.user)
    setImpersonation(null)
    return data
  }

  // Password setup from an activation link. It auto-logs the user in, so it must
  // go through the context: authAPI writes localStorage directly and the provider
  // only reads it on mount, so a client-side redirect would leave `user` null
  // (navbar showing a logged-out state) until a full page reload.
  const completeAccountSetup = async (token, password, confirmPassword) => {
    const data = await authAPI.setPassword(token, password, confirmPassword)
    if (data.token && data.user) {
      setUser(data.user)
    }
    return data
  }

  // Swap the admin's session for the target user's. Goes through the context
  // for exactly the reason completeAccountSetup does: authAPI writes
  // localStorage directly and this provider only reads it on mount, so a
  // client-side navigation afterwards would render the whole tree — navbar,
  // AuthGuard, every page reading `user.role` — against a stale session.
  const startImpersonation = async (userId) => {
    const data = await authAPI.startImpersonation(userId)
    if (data.token && data.user) {
      setUser(data.user)
      setImpersonation(data.impersonation || null)
    }
    return data
  }

  // Restore the admin session. On failure the caller decides what to do, but
  // the local state is cleared either way: if the exchange was refused there is
  // no admin session to return to, and continuing to claim an impersonation
  // would leave the navbar offering an exit that cannot work.
  const stopImpersonation = async () => {
    try {
      const data = await authAPI.stopImpersonation()
      if (data.token && data.user) {
        setUser(data.user)
      }
      return data
    } finally {
      setImpersonation(null)
    }
  }

  const logout = () => {
    authAPI.logout()
    setUser(null)
    setImpersonation(null)
  }

  const value = {
    user,
    login,
    completeAccountSetup,
    logout,
    isAuthenticated: !!user,
    loading,
    impersonation,
    isImpersonating: !!impersonation,
    startImpersonation,
    stopImpersonation,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider')
  }
  return context
}
