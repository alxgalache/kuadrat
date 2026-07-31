'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in on mount
    const currentUser = authAPI.getCurrentUser()
    if (currentUser) {
      setUser(currentUser)
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const data = await authAPI.login(email, password)
    setUser(data.user)
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

  const logout = () => {
    authAPI.logout()
    setUser(null)
  }

  const value = {
    user,
    login,
    completeAccountSetup,
    logout,
    isAuthenticated: !!user,
    loading,
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
