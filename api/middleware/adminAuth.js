const jwt = require('jsonwebtoken')

/**
 * Middleware to verify that the authenticated user has admin role
 * Must be used after the auth middleware
 */
const adminAuth = (req, res, next) => {
  try {
    // Check if user is authenticated (should be set by auth middleware)
    if (!req.user) {
      return res.status(401).json({
        title: 'No autorizado',
        message: 'Debes iniciar sesión para acceder a esta ruta'
      })
    }

    // Check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(401).json({
        title: 'Acceso denegado',
        message: 'No tienes permisos para acceder a esta área'
      })
    }

    // User is admin, proceed
    next()
  } catch (error) {
    console.error('Admin auth error:', error)
    res.status(500).json({
      title: 'Error del servidor',
      message: 'Error al verificar permisos de administrador'
    })
  }
}

module.exports = adminAuth
