const { ZodError } = require('zod');
const { ApiError } = require('./errorHandler');

/**
 * Express middleware factory that validates request data against a Zod schema.
 * Validates body, query, and/or params depending on what the schema defines.
 *
 * Usage in routes:
 *   router.post('/orders', validate(orderSchemas.placeOrder), ordersController.placeOrder);
 *
 * @param {import('zod').ZodObject} schema - Zod schema with optional body/query/params keys
 * @returns {import('express').RequestHandler}
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      // If the schema has shape with body/query/params, validate each part
      if (schema.shape && (schema.shape.body || schema.shape.query || schema.shape.params)) {
        const data = {};
        if (schema.shape.body) data.body = req.body;
        if (schema.shape.query) data.query = req.query;
        if (schema.shape.params) data.params = req.params;
        schema.parse(data);
      } else {
        // Otherwise validate the body directly
        schema.parse(req.body);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(new ApiError(400, 'Error de validación', 'Datos inválidos', errors));
      }
      next(err);
    }
  };
}

module.exports = { validate };
