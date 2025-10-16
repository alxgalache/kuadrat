'use client'

import { createContext, useContext, useState, useCallback } from 'react'

const NotificationContext = createContext(undefined)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])

  const addNotification = useCallback((notification) => {
    const id = Date.now() + Math.random()
    const newNotification = {
      id,
      type: notification.type || 'error',
      title: notification.title,
      message: notification.message,
      errors: notification.errors || null,
    }

    setNotifications(prev => [...prev, newNotification])

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      removeNotification(id)
    }, 5000)

    return id
  }, [])

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id))
  }, [])

  // Helper methods for different notification types
  const showError = useCallback((title, message, errors = null) => {
    return addNotification({ type: 'error', title, message, errors })
  }, [addNotification])

  const showSuccess = useCallback((title, message) => {
    return addNotification({ type: 'success', title, message })
  }, [addNotification])

  const showWarning = useCallback((title, message) => {
    return addNotification({ type: 'warning', title, message })
  }, [addNotification])

  const showInfo = useCallback((title, message) => {
    return addNotification({ type: 'info', title, message })
  }, [addNotification])

  // Helper to show API errors
  const showApiError = useCallback((error) => {
    // Handle different error formats
    if (error.response) {
      // Error from API with response data
      const { title, message, errors } = error.response
      return showError(
        title || 'Error',
        message || 'Ocurrió un error',
        errors
      )
    } else if (error.title && error.message) {
      // Error object with title and message
      return showError(error.title, error.message, error.errors)
    } else if (error.message) {
      // Error with just message
      return showError('Error', error.message)
    } else {
      // Generic error
      return showError('Error', 'Ocurrió un error inesperado')
    }
  }, [showError])

  const value = {
    notifications,
    addNotification,
    removeNotification,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    showApiError,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotification debe ser usado dentro de un NotificationProvider')
  }
  return context
}
