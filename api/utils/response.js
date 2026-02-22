/**
 * Standardized API response helpers.
 * Ensures consistent response envelope across all endpoints.
 */

/**
 * Send a success response with consistent envelope.
 * @param {import('express').Response} res
 * @param {object} data - The response payload
 * @param {number} [status=200] - HTTP status code
 * @param {string} [message] - Optional success message
 */
function sendSuccess(res, data = {}, status = 200, message) {
  const response = { success: true, ...data };
  if (message) response.message = message;
  return res.status(status).json(response);
}

/**
 * Send a paginated success response with consistent envelope.
 * @param {import('express').Response} res
 * @param {object} data - The response payload (should include the list)
 * @param {{ page: number, pages: number, total: number, limit: number }} pagination - Pagination metadata
 */
function sendPaginated(res, data = {}, pagination = {}) {
  return res.json({
    success: true,
    ...data,
    pagination: {
      page: pagination.page,
      pages: pagination.pages,
      total: pagination.total,
      limit: pagination.limit,
    },
  });
}

/**
 * Send a created response (201).
 * @param {import('express').Response} res
 * @param {object} data - The created resource data
 * @param {string} [message] - Optional message
 */
function sendCreated(res, data = {}, message) {
  return sendSuccess(res, data, 201, message);
}

module.exports = { sendSuccess, sendPaginated, sendCreated };
