/**
 * Orders controller module index.
 * Re-exports all order functions from the main ordersController for backward compatibility.
 * Future refactoring can split into createOrder.js, getOrders.js, updateOrder.js.
 */
module.exports = require('../ordersController');
