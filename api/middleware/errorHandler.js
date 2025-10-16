// Custom error class
class ApiError extends Error {
  constructor(statusCode, message, title = null, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.title = title;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation error helper - creates an ApiError with multiple validation errors
class ValidationError extends ApiError {
  constructor(errors) {
    const errorArray = Array.isArray(errors) ? errors : [errors];
    const message = errorArray.map(e => e.message || e).join(', ');
    super(400, message, 'Error de validación', errorArray);
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  let { statusCode, message, title, errors } = err;

  // Handle operational errors (errors we expect)
  if (err.isOperational) {
    const response = {
      success: false,
      status: statusCode,
    };

    // Add title if provided
    if (title) {
      response.title = title;
    }

    // Add message
    response.message = message;

    // Add errors array if provided (for multiple validation errors)
    if (errors && Array.isArray(errors)) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  // Handle programming or unknown errors
  console.error('ERROR:', err);

  // Default to 500 Internal Server Error
  statusCode = statusCode || 500;
  message = message || 'Error interno del servidor';

  res.status(statusCode).json({
    success: false,
    status: statusCode,
    title: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? message : 'Algo salió mal',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Not found middleware
const notFound = (req, res, next) => {
  const error = new ApiError(404, `Ruta no encontrada - ${req.originalUrl}`);
  next(error);
};

module.exports = {
  ApiError,
  ValidationError,
  errorHandler,
  notFound,
};
