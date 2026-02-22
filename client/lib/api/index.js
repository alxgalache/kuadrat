/**
 * API client module index.
 * Re-exports all API modules from the main api.js for backward compatibility.
 * Future refactoring can split into individual module files under this directory.
 */
export {
  getProductImageUrl,
  getArtImageUrl,
  getOthersImageUrl,
  getAuthorImageUrl,
  getProtectedEventVideoUrl,
  authAPI,
  testAccessAPI,
  productsAPI,
  artAPI,
  othersAPI,
  authorsAPI,
  ordersAPI,
  paymentsAPI,
  stripeAPI,
  shippingAPI,
  adminAPI,
  auctionsAPI,
  eventsAPI,
  sellerAPI,
} from '../api';
