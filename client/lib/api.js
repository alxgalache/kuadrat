const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL || '';

// Helper to build product image URL by basename (legacy, kept for compatibility)
export const getProductImageUrl = (basename) => `${API_URL}/products/images/${encodeURIComponent(basename)}`;

// Helper to build art product image URL by basename
export const getArtImageUrl = (basename) =>
  CDN_URL
    ? `${CDN_URL}/art/${encodeURIComponent(basename)}`
    : `${API_URL}/art/images/${encodeURIComponent(basename)}`;

// Helper to build others product image URL by basename
export const getOthersImageUrl = (basename) =>
  CDN_URL
    ? `${CDN_URL}/others/${encodeURIComponent(basename)}`
    : `${API_URL}/others/images/${encodeURIComponent(basename)}`;

// Helper to build author profile image URL by filename
export const getAuthorImageUrl = (filename) =>
  CDN_URL
    ? `${CDN_URL}/authors/${encodeURIComponent(filename)}`
    : `${API_URL}/users/authors/images/${encodeURIComponent(filename)}`;

// Build a protected event video URL (requires short-lived vtoken from getVideoToken)
export const getProtectedEventVideoUrl = (eventId, filename, vtoken) =>
  `${API_URL}/events/${encodeURIComponent(eventId)}/video/${encodeURIComponent(filename)}?vtoken=${encodeURIComponent(vtoken)}`;

// Fetch story video list from the API (used by homepage)
export const fetchStoryVideos = async () => {
  try {
    const res = await fetch(`${API_URL}/stories/videos`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.videos || [];
  } catch {
    return [];
  }
};

// Helper function to get auth token from localStorage
const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

/**
 * Download a binary/text file from an authenticated admin endpoint
 * (Change #4: stripe-connect-fiscal-report).
 *
 * Returns a Blob — callers typically pass it to `triggerDownload(blob, filename)`.
 * Throws on non-2xx, preserving the JSON error body when present.
 */
async function apiDownloadRequest(endpoint) {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* ignore — non-JSON body */
    }
    const error = new Error(data?.message || 'Descarga fallida');
    error.status = res.status;
    error.title = data?.title || 'Error';
    error.message = data?.message || 'Descarga fallida';
    error.errors = data?.errors || null;
    error.response = data;
    throw error;
  }
  return await res.blob();
}

/**
 * Kick off a browser download for a Blob using a temporary anchor element.
 */
export function triggerDownload(blob, filename) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Small delay so Safari does not revoke the URL before the download starts.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Simple in-flight requests deduplication for GET requests (avoids duplicate calls in React StrictMode)
const inflightRequests = new Map();

// Helper function to make API requests
// The `options` object may include a special flag `skipAuthHandling` which, when true,
// prevents global 401 handling (token clearing + redirect). This is useful for
// endpoints like test-access where 401 is part of normal control flow.
async function apiRequest(endpoint, options = {}) {
  const { skipAuthHandling, ...fetchOptions } = options;

  const token = getAuthToken();

  // Detect FormData to avoid setting Content-Type so browser sets boundary
  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;

  const headers = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...fetchOptions.headers,
  };

  const config = {
    ...fetchOptions,
    headers,
  };

  try {
    const url = `${API_URL}${endpoint}`;

    // Deduplicate only GET requests with identical URL + method
    const method = (config.method || 'GET').toUpperCase();
    const dedupeKey = method === 'GET' ? `${method}:${url}` : null;

    if (dedupeKey && inflightRequests.has(dedupeKey)) {
      return await inflightRequests.get(dedupeKey);
    }

    const doFetch = async () => {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        // Handle 401 Unauthorized - session expired or invalid token
        if (response.status === 401 && !skipAuthHandling) {
          // Clear local auth data
          if (typeof window !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
          // Redirect to home page
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }

        // Handle 429 Too Many Requests - rate limit exceeded
        if (response.status === 429) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('api-rate-limit', {
              detail: {
                message: 'Límite de peticiones alcanzado. Vuelve a intentarlo más tarde.',
              },
            }));
          }
        }

        // Create a structured error object
        const error = new Error(data.message || 'Solicitud a la API fallida');
        error.status = data.status || response.status;
        error.title = data.title || 'Error';
        error.message = data.message || 'Solicitud a la API fallida';
        error.errors = data.errors || null;
        error.response = data;
        throw error;
      }

      return data;
    };

    if (dedupeKey) {
      const promise = doFetch().finally(() => {
        // Small timeout to collapse back-to-back duplicates
        setTimeout(() => inflightRequests.delete(dedupeKey), 0);
      });
      inflightRequests.set(dedupeKey, promise);
      return await promise;
    }

    // Non-GET or non-deduped
    const data = await doFetch();
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Auth API
export const authAPI = {
  login: async (email, password) => {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      // Skip global 401 handling to avoid redirect on failed login
      skipAuthHandling: true,
    });

    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }

    return data;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getCurrentUser: () => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    }
    return null;
  },

  isAuthenticated: () => {
    return !!getAuthToken();
  },

  // Validate password setup token
  validateSetupToken: async (token) => {
    return apiRequest(`/auth/validate-setup-token/${token}`, {
      skipAuthHandling: true,
    });
  },

  // Set password using setup token
  setPassword: async (token, password, confirmPassword) => {
    const data = await apiRequest('/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ token, password, confirmPassword }),
      skipAuthHandling: true,
    });

    // Auto-login after setting password
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }

    return data;
  },

  // Get password requirements
  getPasswordRequirements: async () => {
    return apiRequest('/auth/password-requirements', {
      skipAuthHandling: true,
    });
  },
};

// Test access API (used for password gate on test instances)
export const testAccessAPI = {
  verify: async (password) => {
    return apiRequest('/test-access/verify', {
      method: 'POST',
      body: JSON.stringify({ password }),
      // A wrong password should not wipe auth/session state, so skip global 401 handling
      skipAuthHandling: true,
    });
  },
};

// Products API (legacy - keep for backward compatibility)
export const productsAPI = {
  getAll: async (page = 1, limit = 12, authorSlug = null, category = null) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (authorSlug) {
      params.append('author_slug', authorSlug);
    }

    if (category) {
      params.append('category', category);
    }

    return apiRequest(`/products?${params.toString()}`);
  },

  getById: async (id) => {
    return apiRequest(`/products/${id}`);
  },

  getByAuthorSlug: async (slug) => {
    return apiRequest(`/products/author/${slug}`);
  },

  create: async (productData) => {
    const isFormData = typeof FormData !== 'undefined' && productData instanceof FormData;
    return apiRequest('/products', {
      method: 'POST',
      body: isFormData ? productData : JSON.stringify(productData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/products/${id}`, {
      method: 'DELETE',
    });
  },

  getSellerProducts: async () => {
    return apiRequest('/products/seller/me');
  },
};

// Art API
export const artAPI = {
  getAll: async (page = 1, limit = 12, authorSlug = null) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (authorSlug) {
      params.append('author_slug', authorSlug);
    }

    return apiRequest(`/art?${params.toString()}`);
  },

  getById: async (id) => {
    return apiRequest(`/art/${id}`);
  },

  getByAuthorSlug: async (slug) => {
    return apiRequest(`/art/author/${slug}`);
  },

  create: async (artData) => {
    const isFormData = typeof FormData !== 'undefined' && artData instanceof FormData;
    return apiRequest('/art', {
      method: 'POST',
      body: isFormData ? artData : JSON.stringify(artData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/art/${id}`, {
      method: 'DELETE',
    });
  },

  getSellerArt: async () => {
    return apiRequest('/art/seller/me');
  },
};

// Others API
export const othersAPI = {
  getAll: async (page = 1, limit = 12, authorSlug = null) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (authorSlug) {
      params.append('author_slug', authorSlug);
    }

    return apiRequest(`/others?${params.toString()}`);
  },

  getById: async (id) => {
    return apiRequest(`/others/${id}`);
  },

  getByAuthorSlug: async (slug) => {
    return apiRequest(`/others/author/${slug}`);
  },

  create: async (otherData) => {
    const isFormData = typeof FormData !== 'undefined' && otherData instanceof FormData;
    return apiRequest('/others', {
      method: 'POST',
      body: isFormData ? otherData : JSON.stringify(otherData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/others/${id}`, {
      method: 'DELETE',
    });
  },

  getSellerOthers: async () => {
    return apiRequest('/others/seller/me');
  },
};

// Authors API
export const authorsAPI = {
  getVisible: async (category = null) => {
    const params = new URLSearchParams();

    if (category) {
      params.append('category', category);
    }

    const queryString = params.toString();
    return apiRequest(`/users/authors${queryString ? `?${queryString}` : ''}`);
  },

  getBySlug: async (slug) => {
    return apiRequest(`/users/authors/${slug}`);
  },
};

// Orders API
export const ordersAPI = {
  placeOrder: async (payload) => {
    return apiRequest('/orders/placeOrder', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Confirm payment / update order status
  updatePayment: async ({ orderId, paymentId = null }) => {
    const body = {
      order_id: orderId,
      ...(paymentId ? { payment_id: paymentId } : {}),
    };
    return apiRequest('/orders', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();

    if (params.page) {
      queryParams.append('page', params.page.toString());
    }

    if (params.limit) {
      queryParams.append('limit', params.limit.toString());
    }

    if (params.date) {
      queryParams.append('date', params.date);
    }

    const queryString = queryParams.toString();
    return apiRequest(`/orders${queryString ? '?' + queryString : ''}`);
  },

  getById: async (id) => {
    return apiRequest(`/orders/${id}`);
  },

  // Public: get order by token (no auth)
  getByTokenPublic: async (token) => {
    return apiRequest(`/orders/public/token/${encodeURIComponent(token)}`, {
      skipAuthHandling: true,
    });
  },

  // Public: contact seller for an order by token
  contactSellerPublic: async ({ token, sellerId, message }) => {
    return apiRequest(`/orders/public/token/${encodeURIComponent(token)}/contact`, {
      method: 'POST',
      body: JSON.stringify({ seller_id: sellerId, message }),
      skipAuthHandling: true,
    });
  },

  // Get seller stats for current and previous periods
  getStats: async (params = {}) => {
    const queryParams = new URLSearchParams();

    if (params.date) {
      queryParams.append('date', params.date);
    }

    if (params.previousDate) {
      queryParams.append('previousDate', params.previousDate);
    }

    if (params.previousDateTo) {
      queryParams.append('previousDateTo', params.previousDateTo);
    }

    const queryString = queryParams.toString();
    return apiRequest(`/orders/stats${queryString ? '?' + queryString : ''}`);
  },

  // Update tracking number for an order item
  updateItemTracking: async (orderId, itemId, trackingNumber, productType) => {
    return apiRequest(`/orders/${orderId}/items/${itemId}/tracking`, {
      method: 'PATCH',
      body: JSON.stringify({ tracking: trackingNumber, product_type: productType }),
    });
  },

  // Update status for an order item
  updateItemStatus: async (orderId, itemId, status, productType, tracking = null) => {
    const body = { status, product_type: productType };
    if (tracking) {
      body.tracking = tracking;
    }
    return apiRequest(`/orders/${orderId}/items/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  // Update order status
  updateOrderStatus: async (orderId, status, tracking = null) => {
    const body = { status };
    if (tracking) {
      body.tracking = tracking;
    }
    return apiRequest(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  // Public: buyer updates item status (token-based, no auth)
  updateItemStatusPublic: async (token, itemId, status, productType) => {
    return apiRequest(`/orders/public/token/${encodeURIComponent(token)}/items/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, product_type: productType }),
      skipAuthHandling: true,
    });
  },

  // Public: buyer updates order status (token-based, no auth)
  updateOrderStatusPublic: async (token, status) => {
    return apiRequest(`/orders/public/token/${encodeURIComponent(token)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      skipAuthHandling: true,
    });
  },
};

// Payments API
export const paymentsAPI = {
  // Initialise a Revolut order and get the token + order id (new Card Field flow)
  initRevolutOrder: async (payloadOrItems, currency = 'EUR') => {
    // Convenience: allow passing an array of compact items directly
    const body = Array.isArray(payloadOrItems)
      ? { items: payloadOrItems, currency }
      : { ...payloadOrItems, ...(payloadOrItems.currency ? {} : { currency }) };

    return apiRequest('/payments/revolut/init-order', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Resolve the latest payment for a Revolut order (to get payment_id after Card Field / popup)
  getLatestRevolutPayment: async (revolutOrderId) => {
    return apiRequest(`/payments/revolut/order/${encodeURIComponent(revolutOrderId)}/payments/latest`, {
      method: 'GET',
    });
  },

  // Cancel a pending Revolut order (used when the cart changes after creating a dummy order)
  cancelOrder: async (revolutOrderId) => {
    if (!revolutOrderId) {
      throw new Error('revolutOrderId is required to cancel an order');
    }

    return apiRequest(`/payments/revolut/order/${encodeURIComponent(revolutOrderId)}/cancel`, {
      method: 'POST',
    });
  },

  // Get order status by Revolut order ID (used by success page to check if payment was confirmed via webhook)
  // Note: We add a timestamp to bust cache and use cache: 'no-store' to prevent 304 responses
  getOrderStatusByRevolutId: async (revolutOrderId) => {
    if (!revolutOrderId) {
      throw new Error('revolutOrderId is required to get order status');
    }

    // Add timestamp to prevent browser caching and avoid 304 responses
    const timestamp = Date.now();
    return apiRequest(`/payments/revolut/order/${encodeURIComponent(revolutOrderId)}/status?_t=${timestamp}`, {
      method: 'GET',
      skipAuthHandling: true,
      cache: 'no-store', // Prevent browser from using cached response
    });
  },
};

// Stripe Payments API
export const stripeAPI = {
  createPaymentIntent: async (data) => {
    return apiRequest('/payments/stripe/create-intent', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getPaymentStatus: async (paymentIntentId) => {
    const timestamp = Date.now();
    return apiRequest(`/payments/stripe/status/${encodeURIComponent(paymentIntentId)}?_t=${timestamp}`, {
      method: 'GET',
      skipAuthHandling: true,
      cache: 'no-store',
    });
  },

  cancelPaymentIntent: async (paymentIntentId) => {
    return apiRequest('/payments/stripe/cancel', {
      method: 'POST',
      body: JSON.stringify({ paymentIntentId }),
    });
  },
};

// Shipping API (public)
export const shippingAPI = {
  getAvailableForProduct: async (productId, productType, country = null, postalCode = null) => {
    const params = new URLSearchParams({
      productId: productId.toString(),
      productType,
    });

    if (country) {
      params.append('country', country);
    }

    if (postalCode) {
      params.append('postalCode', postalCode);
    }

    return apiRequest(`/shipping/available?${params.toString()}`);
  },

  // Sendcloud shipping options (per-seller, grouped)
  getShippingOptions: async (items, deliveryAddress) => {
    return apiRequest('/shipping/options', {
      method: 'POST',
      body: JSON.stringify({ items, deliveryAddress }),
    });
  },

  // Sendcloud service points
  getServicePoints: async (carrier, country, postalCode, radius) => {
    const params = new URLSearchParams({ carrier, country, postalCode });
    if (radius) params.append('radius', String(radius));
    return apiRequest(`/shipping/service-points?${params.toString()}`);
  },
};

// Admin API (requires admin role)
export const adminAPI = {
  // Author management
  authors: {
    getAll: async () => {
      return apiRequest('/admin/authors');
    },

    getById: async (id) => {
      return apiRequest(`/admin/authors/${id}`);
    },

    create: async (authorData) => {
      return apiRequest('/admin/authors', {
        method: 'POST',
        body: JSON.stringify(authorData),
      });
    },

    update: async (id, authorData) => {
      return apiRequest(`/admin/authors/${id}`, {
        method: 'PUT',
        body: JSON.stringify(authorData),
      });
    },

    uploadAvatar: async (id, avatarFile) => {
      const formData = new FormData();
      formData.append('avatar', avatarFile);

      return apiRequest(`/admin/authors/${id}/upload-avatar`, {
        method: 'POST',
        body: formData,
      });
    },

    getProducts: async (id) => {
      return apiRequest(`/admin/authors/${id}/products`);
    },

    resendInvitation: async (id) => {
      return apiRequest(`/admin/authors/${id}/resend-invitation`, {
        method: 'POST',
      });
    },

    getSendcloudConfig: async (id) => {
      return apiRequest(`/admin/authors/${id}/sendcloud-config`);
    },

    createSendcloudConfig: async (id, data) => {
      return apiRequest(`/admin/authors/${id}/sendcloud-config`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    updateSendcloudConfig: async (id, data) => {
      return apiRequest(`/admin/authors/${id}/sendcloud-config`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    getShippingMethods: async () => {
      return apiRequest('/admin/authors/shipping-methods');
    },
  },

  // Product management
  products: {
    getById: async (id) => {
      return apiRequest(`/admin/products/${id}`);
    },

    update: async (id, productData) => {
      const isFormData = typeof FormData !== 'undefined' && productData instanceof FormData;
      return apiRequest(`/admin/products/${id}`, {
        method: 'PUT',
        body: isFormData ? productData : JSON.stringify(productData),
      });
    },

    toggleVisibility: async (id, productType, visible) => {
      return apiRequest(`/admin/products/${id}/visibility`, {
        method: 'PUT',
        body: JSON.stringify({ product_type: productType, visible }),
      });
    },

    updateStatus: async (id, productType, status) => {
      return apiRequest(`/admin/products/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ product_type: productType, status }),
      });
    },

    delete: async (id, productType) => {
      return apiRequest(`/admin/products/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ product_type: productType }),
      });
    },

    updateVariations: async (id, variations) => {
      return apiRequest(`/admin/others/${id}/variations`, {
        method: 'PUT',
        body: JSON.stringify({ variations }),
      });
    },

    getPreview: async (id, type) => {
      return apiRequest(`/admin/products/${id}/preview?type=${type}`);
    },
  },

  // Orders management
  orders: {
    getAll: async (params = {}) => {
      const query = new URLSearchParams();
      if (params.page) query.set('page', params.page);
      if (params.limit) query.set('limit', params.limit);
      if (params.email) query.set('email', params.email);
      if (params.seller) query.set('seller', params.seller);
      if (params.date_from) query.set('date_from', params.date_from);
      if (params.date_to) query.set('date_to', params.date_to);
      if (params.status) query.set('status', params.status);
      const qs = query.toString();
      return apiRequest(`/admin/orders${qs ? '?' + qs : ''}`);
    },

    getById: async (id) => {
      return apiRequest(`/admin/orders/${id}`);
    },

    updateItemStatus: async (orderId, itemId, status, productType) => {
      return apiRequest(`/admin/orders/${orderId}/items/${itemId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, product_type: productType }),
      });
    },

    updateOrderStatus: async (orderId, status) => {
      return apiRequest(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },

    getStaleArrivedAlerts: async () => {
      return apiRequest('/admin/orders/alerts/stale-arrived');
    },

    getStaleSentAlerts: async () => {
      return apiRequest('/admin/orders/alerts/stale-sent');
    },

    getSellerShipments: async (sellerId, status, page = 1, limit = 20) => {
      const params = new URLSearchParams({ sellerId: String(sellerId), page: String(page), limit: String(limit) });
      if (status) params.append('status', status);
      return apiRequest(`/admin/orders/seller-shipments?${params.toString()}`);
    },
  },

  // Shipping management
  shipping: {
    // Shipping methods
    getAllMethods: async () => {
      return apiRequest('/admin/shipping/methods');
    },

    getMethodById: async (id) => {
      return apiRequest(`/admin/shipping/methods/${id}`);
    },

    createMethod: async (methodData) => {
      return apiRequest('/admin/shipping/methods', {
        method: 'POST',
        body: JSON.stringify(methodData),
      });
    },

    updateMethod: async (id, methodData) => {
      return apiRequest(`/admin/shipping/methods/${id}`, {
        method: 'PUT',
        body: JSON.stringify(methodData),
      });
    },

    deleteMethod: async (id) => {
      return apiRequest(`/admin/shipping/methods/${id}`, {
        method: 'DELETE',
      });
    },

    // Shipping zones
    getZones: async (methodId) => {
      return apiRequest(`/admin/shipping/methods/${methodId}/zones`);
    },

    createZone: async (methodId, zoneData) => {
      return apiRequest(`/admin/shipping/methods/${methodId}/zones`, {
        method: 'POST',
        body: JSON.stringify(zoneData),
      });
    },

    updateZone: async (zoneId, zoneData) => {
      return apiRequest(`/admin/shipping/zones/${zoneId}`, {
        method: 'PUT',
        body: JSON.stringify(zoneData),
      });
    },

    deleteZone: async (zoneId) => {
      return apiRequest(`/admin/shipping/zones/${zoneId}`, {
        method: 'DELETE',
      });
    },
  },

  // Auction management
  auctions: {
    getAll: async (status) => {
      const params = status ? `?status=${status}` : '';
      return apiRequest(`/admin/auctions${params}`);
    },

    getById: async (id) => {
      return apiRequest(`/admin/auctions/${id}`);
    },

    create: async (auctionData) => {
      return apiRequest('/admin/auctions', {
        method: 'POST',
        body: JSON.stringify(auctionData),
      });
    },

    update: async (id, auctionData) => {
      return apiRequest(`/admin/auctions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(auctionData),
      });
    },

    delete: async (id) => {
      return apiRequest(`/admin/auctions/${id}`, {
        method: 'DELETE',
      });
    },

    start: async (id) => {
      return apiRequest(`/admin/auctions/${id}/start`, {
        method: 'POST',
      });
    },

    cancel: async (id) => {
      return apiRequest(`/admin/auctions/${id}/cancel`, {
        method: 'POST',
      });
    },

    finish: async (id) => {
      return apiRequest(`/admin/auctions/${id}/finish`, {
        method: 'POST',
      });
    },

    getProductsForAuction: async (excludeAuctionId = null) => {
      const params = excludeAuctionId ? `?excludeAuctionId=${excludeAuctionId}` : '';
      return apiRequest(`/admin/products/for-auction${params}`);
    },

    getBids: async (auctionId) => {
      return apiRequest(`/admin/auctions/${auctionId}/bids`);
    },

    billBid: async (auctionId, bidId, { shippingCost } = {}) => {
      return apiRequest(`/admin/auctions/${auctionId}/bids/${bidId}/bill`, {
        method: 'POST',
        body: JSON.stringify({ shippingCost: shippingCost || 0 }),
      });
    },
  },

  // Draw management
  draws: {
    getAll: async (status) => {
      const params = status ? `?status=${status}` : '';
      return apiRequest(`/admin/draws${params}`);
    },

    getById: async (id) => {
      return apiRequest(`/admin/draws/${id}`);
    },

    create: async (drawData) => {
      return apiRequest('/admin/draws', {
        method: 'POST',
        body: JSON.stringify(drawData),
      });
    },

    update: async (id, drawData) => {
      return apiRequest(`/admin/draws/${id}`, {
        method: 'PUT',
        body: JSON.stringify(drawData),
      });
    },

    delete: async (id) => {
      return apiRequest(`/admin/draws/${id}`, {
        method: 'DELETE',
      });
    },

    start: async (id) => {
      return apiRequest(`/admin/draws/${id}/start`, {
        method: 'POST',
      });
    },

    cancel: async (id) => {
      return apiRequest(`/admin/draws/${id}/cancel`, {
        method: 'POST',
      });
    },
  },

  // Postal codes management
  postalCodes: {
    getAll: async (country) => {
      const params = country ? `?country=${country}` : '';
      return apiRequest(`/admin/postal-codes${params}`);
    },

    search: async (query) => {
      return apiRequest(`/admin/postal-codes/search?q=${encodeURIComponent(query)}`);
    },

    getByIds: async (ids) => {
      if (!ids || ids.length === 0) return { postalCodes: [] };
      return apiRequest(`/admin/postal-codes/by-ids?ids=${ids.join(',')}`);
    },

    getByRefs: async (refs) => {
      if (!refs || refs.length === 0) return { postalCodes: [] };
      return apiRequest('/admin/postal-codes/by-refs', {
        method: 'POST',
        body: JSON.stringify({ refs }),
      });
    },

    create: async (data) => {
      return apiRequest('/admin/postal-codes', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  },

  // Event management
  events: {
    getAll: async (status) => {
      const params = status ? `?status=${status}` : '';
      return apiRequest(`/admin/events${params}`);
    },

    getById: async (id) => {
      return apiRequest(`/admin/events/${id}`);
    },

    create: async (eventData) => {
      return apiRequest('/admin/events', {
        method: 'POST',
        body: JSON.stringify(eventData),
      });
    },

    update: async (id, eventData) => {
      return apiRequest(`/admin/events/${id}`, {
        method: 'PUT',
        body: JSON.stringify(eventData),
      });
    },

    delete: async (id) => {
      return apiRequest(`/admin/events/${id}`, {
        method: 'DELETE',
      });
    },

    start: async (id) => {
      return apiRequest(`/admin/events/${id}/start`, {
        method: 'POST',
      });
    },

    end: async (id) => {
      return apiRequest(`/admin/events/${id}/end`, {
        method: 'POST',
      });
    },

    cancel: async (id) => {
      return apiRequest(`/admin/events/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      });
    },

    getAttendees: async (id) => {
      return apiRequest(`/admin/events/${id}/attendees`);
    },

    getParticipants: async (id) => {
      return apiRequest(`/admin/events/${id}/participants`);
    },

    promoteParticipant: async (eventId, identity) => {
      return apiRequest(`/admin/events/${eventId}/participants/${encodeURIComponent(identity)}/promote`, {
        method: 'POST',
      });
    },

    demoteParticipant: async (eventId, identity) => {
      return apiRequest(`/admin/events/${eventId}/participants/${encodeURIComponent(identity)}/demote`, {
        method: 'POST',
      });
    },

    muteParticipant: async (eventId, identity, trackSid, muted) => {
      return apiRequest(`/admin/events/${eventId}/participants/${encodeURIComponent(identity)}/mute`, {
        method: 'POST',
        body: JSON.stringify({ trackSid, muted }),
      });
    },

    uploadVideo: async (eventId, file) => {
      const formData = new FormData();
      formData.append('video', file);
      return apiRequest(`/admin/events/${eventId}/upload-video`, {
        method: 'POST',
        body: formData,
      });
    },

    // ── Credit lifecycle (Change #3: stripe-connect-events-wallet) ──

    // POST /admin/events/:id/mark-finished — body: { finished_at? (ISO8601) }
    markFinished: async (eventId, { finishedAt } = {}) => {
      return apiRequest(`/admin/events/${eventId}/mark-finished`, {
        method: 'POST',
        body: JSON.stringify({
          ...(finishedAt ? { finished_at: finishedAt } : {}),
        }),
      });
    },

    // POST /admin/events/:id/exclude-credit — body: { reason }
    excludeCredit: async (eventId, { reason } = {}) => {
      return apiRequest(`/admin/events/${eventId}/exclude-credit`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },

    // POST /admin/events/:id/include-credit
    includeCredit: async (eventId) => {
      return apiRequest(`/admin/events/${eventId}/include-credit`, {
        method: 'POST',
      });
    },
  },

  // ── Stripe Connect (admin) ─────────────────────────────────
  // Change #1: stripe-connect-accounts
  stripeConnect: {
    // POST /admin/sellers/:id/stripe-connect/create
    createAccount: async (sellerId) => {
      return apiRequest(`/admin/sellers/${sellerId}/stripe-connect/create`, {
        method: 'POST',
      });
    },

    // POST /admin/sellers/:id/stripe-connect/onboarding-link
    generateLink: async (sellerId) => {
      return apiRequest(`/admin/sellers/${sellerId}/stripe-connect/onboarding-link`, {
        method: 'POST',
      });
    },

    // POST /admin/sellers/:id/stripe-connect/onboarding-link/email
    sendLinkEmail: async (sellerId) => {
      return apiRequest(`/admin/sellers/${sellerId}/stripe-connect/onboarding-link/email`, {
        method: 'POST',
      });
    },

    // GET /admin/sellers/:id/stripe-connect/status
    getStatus: async (sellerId) => {
      return apiRequest(`/admin/sellers/${sellerId}/stripe-connect/status`);
    },
  },

  // ── Datos fiscales del seller (admin) ──────────────────────
  // Change #1: stripe-connect-accounts
  sellerFiscal: {
    // PUT /admin/sellers/:id/fiscal
    update: async (sellerId, payload) => {
      return apiRequest(`/admin/sellers/${sellerId}/fiscal`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
  },

  // ── Manual payouts panel (admin) ───────────────────────────
  // Change #2: stripe-connect-manual-payouts
  payouts: {
    // GET /admin/payouts — sellers with positive balance in at least one bucket
    listSellersWithBalance: async () => {
      return apiRequest('/admin/payouts');
    },

    // GET /admin/payouts/:sellerId — full detail (buckets, pending items, history)
    getSellerDetail: async (sellerId) => {
      return apiRequest(`/admin/payouts/${sellerId}`);
    },

    // POST /admin/payouts/:sellerId/preview — returns { token, summary }
    // `itemIds`: integer ids of other_order_items
    // `eventAttendeeIds`: UUIDs of event_attendees (Change #3)
    preview: async (sellerId, { vatRegime, itemIds, eventAttendeeIds } = {}) => {
      return apiRequest(`/admin/payouts/${sellerId}/preview`, {
        method: 'POST',
        body: JSON.stringify({
          vat_regime: vatRegime,
          ...(itemIds ? { item_ids: itemIds } : {}),
          ...(eventAttendeeIds ? { event_attendee_ids: eventAttendeeIds } : {}),
        }),
      });
    },

    // POST /admin/payouts/:sellerId/execute — consumes the confirmation token
    execute: async (sellerId, { vatRegime, itemIds, eventAttendeeIds, confirmationToken } = {}) => {
      return apiRequest(`/admin/payouts/${sellerId}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          vat_regime: vatRegime,
          confirmation_token: confirmationToken,
          ...(itemIds ? { item_ids: itemIds } : {}),
          ...(eventAttendeeIds ? { event_attendee_ids: eventAttendeeIds } : {}),
        }),
      });
    },

    // POST /admin/payouts/withdrawals/:id/mark-reversed
    markReversed: async (withdrawalId, { reversalAmount, reversalReason } = {}) => {
      return apiRequest(`/admin/payouts/withdrawals/${withdrawalId}/mark-reversed`, {
        method: 'POST',
        body: JSON.stringify({
          reversal_amount: reversalAmount,
          reversal_reason: reversalReason,
        }),
      });
    },

    // ── Fiscal report export (Change #4: stripe-connect-fiscal-report) ──

    // GET /admin/payouts/:withdrawalId/fiscal-export?format=csv → Blob
    exportPayoutCsv: async (withdrawalId) => {
      return apiDownloadRequest(
        `/admin/payouts/${withdrawalId}/fiscal-export?format=csv`
      );
    },

    // GET /admin/payouts/:withdrawalId/fiscal-export?format=json → Blob
    exportPayoutJson: async (withdrawalId) => {
      return apiDownloadRequest(
        `/admin/payouts/${withdrawalId}/fiscal-export?format=json`
      );
    },

    // GET /admin/payouts/fiscal-export?from=...&to=...&format=csv[&vat_regime][&sellerId] → Blob
    exportRangeCsv: async ({ from, to, vatRegime, sellerId } = {}) => {
      const params = new URLSearchParams({ from, to, format: 'csv' });
      if (vatRegime) params.set('vat_regime', vatRegime);
      if (sellerId) params.set('sellerId', String(sellerId));
      return apiDownloadRequest(`/admin/payouts/fiscal-export?${params.toString()}`);
    },

    // GET /admin/payouts/fiscal-export?format=json&... → Blob
    exportRangeJson: async ({ from, to, vatRegime, sellerId } = {}) => {
      const params = new URLSearchParams({ from, to, format: 'json' });
      if (vatRegime) params.set('vat_regime', vatRegime);
      if (sellerId) params.set('sellerId', String(sellerId));
      return apiDownloadRequest(`/admin/payouts/fiscal-export?${params.toString()}`);
    },

    // GET /admin/payouts/summary?from=...&to=...[&vat_regime][&sellerId] → JSON
    getPayoutsSummary: async ({ from, to, vatRegime, sellerId } = {}) => {
      const params = new URLSearchParams({ from, to });
      if (vatRegime) params.set('vat_regime', vatRegime);
      if (sellerId) params.set('sellerId', String(sellerId));
      return apiRequest(`/admin/payouts/summary?${params.toString()}`);
    },
  },

  // ── Invoice PDF downloads (Change #5: pdf-invoice-engine) ──
  invoices: {
    downloadBuyerInvoice: async (orderId, type) => {
      return apiDownloadRequest(`/admin/invoices/order/${orderId}/buyer?type=${type}`);
    },
    downloadEventAttendeeInvoice: async (attendeeId) => {
      return apiDownloadRequest(`/admin/invoices/event-attendee/${attendeeId}`);
    },
    downloadCommissionInvoice: async (withdrawalId) => {
      return apiDownloadRequest(`/admin/invoices/withdrawal/${withdrawalId}/commission`);
    },
    downloadSettlementNote: async (withdrawalId) => {
      return apiDownloadRequest(`/admin/invoices/withdrawal/${withdrawalId}/settlement`);
    },
  },
};

// Public Auctions API (no auth required)
export const auctionsAPI = {
  getByDateRange: async (from, to) => {
    return apiRequest(`/auctions?from=${from}&to=${to}`);
  },

  getById: async (id) => {
    return apiRequest(`/auctions/${id}`);
  },

  getProductBids: async (auctionId, productId, productType, limit = 20) => {
    return apiRequest(`/auctions/${auctionId}/products/${productId}/${productType}/bids?limit=${limit}`);
  },

  registerBuyer: async (auctionId, buyerData) => {
    return apiRequest(`/auctions/${auctionId}/register-buyer`, {
      method: 'POST',
      body: JSON.stringify(buyerData),
    });
  },

  verifyBuyer: async (auctionId, email, bidPassword) => {
    return apiRequest(`/auctions/${auctionId}/verify-buyer`, {
      method: 'POST',
      body: JSON.stringify({ email, bidPassword }),
    });
  },

  setupPayment: async (auctionId, auctionBuyerId) => {
    return apiRequest(`/auctions/${auctionId}/setup-payment`, {
      method: 'POST',
      body: JSON.stringify({ auctionBuyerId }),
    });
  },

  confirmPayment: async (auctionId, auctionBuyerId, setupIntentId, customerId) => {
    return apiRequest(`/auctions/${auctionId}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify({ auctionBuyerId, setupIntentId, customerId }),
    });
  },

  placeBid: async (auctionId, bidData) => {
    return apiRequest(`/auctions/${auctionId}/bid`, {
      method: 'POST',
      body: JSON.stringify(bidData),
    });
  },

  getPostalCodes: async (auctionId, productId, productType) => {
    return apiRequest(`/auctions/${auctionId}/postal-codes/${productId}/${productType}`);
  },

  validatePostalCode: async (auctionId, productId, productType, postalCode) => {
    return apiRequest(`/auctions/${auctionId}/validate-postal-code/${productId}/${productType}?postalCode=${encodeURIComponent(postalCode)}`);
  },
};

// Public Draws API (no auth required)
export const drawsAPI = {
  getByDateRange: async (from, to) => {
    return apiRequest(`/draws?from=${from}&to=${to}`);
  },

  getById: async (id) => {
    return apiRequest(`/draws/${id}`);
  },

  registerBuyer: async (drawId, buyerData) => {
    return apiRequest(`/draws/${drawId}/register-buyer`, {
      method: 'POST',
      body: JSON.stringify(buyerData),
    });
  },

  sendVerification: async (drawId, email, dni) => {
    return apiRequest(`/draws/${drawId}/send-verification`, {
      method: 'POST',
      body: JSON.stringify({ email, dni }),
    });
  },

  verifyEmail: async (drawId, email, code) => {
    return apiRequest(`/draws/${drawId}/verify-email`, {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  },

  setupPayment: async (drawId, drawBuyerId) => {
    return apiRequest(`/draws/${drawId}/setup-payment`, {
      method: 'POST',
      body: JSON.stringify({ drawBuyerId }),
    });
  },

  confirmPayment: async (drawId, drawBuyerId, setupIntentId) => {
    return apiRequest(`/draws/${drawId}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify({ drawBuyerId, setupIntentId }),
    });
  },

  enterDraw: async (drawId, drawBuyerId) => {
    return apiRequest(`/draws/${drawId}/enter`, {
      method: 'POST',
      body: JSON.stringify({ drawBuyerId }),
    });
  },

  validatePostalCode: async (drawId, postalCode, country = 'ES') => {
    return apiRequest(`/draws/${drawId}/validate-postal-code`, {
      method: 'POST',
      body: JSON.stringify({ postalCode, country }),
    });
  },
};

// Public Events API (no auth required)
export const eventsAPI = {
  getByDateRange: async (from, to) => {
    return apiRequest(`/events?from=${from}&to=${to}`);
  },

  getBySlug: async (slug) => {
    return apiRequest(`/events/${slug}`);
  },

  register: async (eventId, { first_name, last_name, email }) => {
    return apiRequest(`/events/${eventId}/register`, {
      method: 'POST',
      body: JSON.stringify({ first_name, last_name, email }),
    });
  },

  pay: async (eventId, attendeeId) => {
    return apiRequest(`/events/${eventId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ attendeeId }),
    });
  },

  confirmPayment: async (eventId, attendeeId, paymentIntentId) => {
    return apiRequest(`/events/${eventId}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify({ attendeeId, paymentIntentId }),
    });
  },

  getViewerToken: async (eventId, attendeeId, accessToken) => {
    return apiRequest(`/events/${eventId}/token`, {
      method: 'POST',
      body: JSON.stringify({ attendeeId, accessToken }),
    });
  },

  getHostToken: async (eventId) => {
    return apiRequest(`/events/${eventId}/host-token`, {
      method: 'POST',
    });
  },

  promoteParticipant: async (eventId, identity) => {
    return apiRequest(`/events/${eventId}/participants/${encodeURIComponent(identity)}/promote`, {
      method: 'POST',
    });
  },

  demoteParticipant: async (eventId, identity) => {
    return apiRequest(`/events/${eventId}/participants/${encodeURIComponent(identity)}/demote`, {
      method: 'POST',
    });
  },

  reportSpam: async (eventId, identity, reporterAttendeeId = null, reporterAccessToken = null) => {
    const body = {};
    if (reporterAttendeeId && reporterAccessToken) {
      body.reporterAttendeeId = reporterAttendeeId;
      body.reporterAccessToken = reporterAccessToken;
    }
    return apiRequest(`/events/${eventId}/participants/${encodeURIComponent(identity)}/report-spam`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  banFromChat: async (eventId, identity) => {
    return apiRequest(`/events/${eventId}/participants/${encodeURIComponent(identity)}/ban-from-chat`, {
      method: 'POST',
    });
  },

  endEvent: async (eventId) => {
    return apiRequest(`/events/${eventId}/end`, {
      method: 'POST',
    });
  },

  sendVerification: async (eventId, attendeeId) => {
    return apiRequest(`/events/${eventId}/send-verification`, {
      method: 'POST',
      body: JSON.stringify({ attendeeId }),
    });
  },

  verifyEmail: async (eventId, attendeeId, code) => {
    return apiRequest(`/events/${eventId}/verify-email`, {
      method: 'POST',
      body: JSON.stringify({ attendeeId, code }),
    });
  },

  verifyPassword: async (eventId, email, password) => {
    return apiRequest(`/events/${eventId}/verify-password`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getVideoToken: async (eventId, attendeeId = null, accessToken = null) => {
    const body = {};
    if (attendeeId && accessToken) {
      body.attendeeId = attendeeId;
      body.accessToken = accessToken;
    }
    return apiRequest(`/events/${eventId}/video-token`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

// Seller API (requires seller role)
export const sellerAPI = {
  // Product management
  getProducts: async () => {
    return apiRequest('/seller/products');
  },

  updateVariations: async (productId, variations) => {
    return apiRequest(`/seller/others/${productId}/variations`, {
      method: 'PUT',
      body: JSON.stringify({ variations }),
    });
  },

  toggleVisibility: async (productId, productType, visible) => {
    return apiRequest(`/seller/products/${productId}/visibility`, {
      method: 'PUT',
      body: JSON.stringify({ product_type: productType, visible }),
    });
  },

  deleteProduct: async (productId, productType) => {
    return apiRequest(`/seller/products/${productId}`, {
      method: 'DELETE',
      body: JSON.stringify({ product_type: productType }),
    });
  },

  // Profile
  getProfile: async () => {
    return apiRequest('/seller/profile');
  },

  changePassword: async (currentPassword, newPassword, confirmPassword) => {
    return apiRequest('/seller/profile/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      // A wrong current password returns 401 — skip global handler to avoid wiping the session
      skipAuthHandling: true,
    });
  },

  // Wallet
  getWallet: async () => {
    return apiRequest('/seller/wallet');
  },

  // Change #3: stripe-connect-events-wallet — paid events hosted by the seller
  getPaidEvents: async () => {
    return apiRequest('/seller/paid-events');
  },

  // Withdrawals — Change #2 (stripe-connect-manual-payouts):
  // The endpoint is now a "nudge" that just emails the admin; no body required.
  createWithdrawal: async () => {
    return apiRequest('/seller/withdrawals', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // Orders (Sendcloud)
  getOrders: async (status, page = 1, limit = 20) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.append('status', status);
    return apiRequest(`/seller/orders?${params.toString()}`);
  },

  getOrderLabel: async (itemType, itemId) => {
    const token = getAuthToken();
    const response = await fetch(`${API_URL}/seller/orders/${itemType}/${itemId}/label`, {
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    });
    if (!response.ok) {
      const data = await response.json();
      const error = new Error(data.message || 'Error al descargar etiqueta');
      error.status = response.status;
      throw error;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/pdf')) {
      const blob = await response.blob();
      return { blob };
    }
    return response.json();
  },

  schedulePickup: async (orderId, data) => {
    return apiRequest(`/seller/orders/${orderId}/pickup`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  scheduleBulkPickup: async (data) => {
    return apiRequest('/seller/orders/bulk-pickup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ── Stripe Connect (seller self-service) ───────────────────
  // Change #1: stripe-connect-accounts
  stripeConnect: {
    // POST /seller/stripe-connect/onboarding-link
    generateLink: async () => {
      return apiRequest('/seller/stripe-connect/onboarding-link', {
        method: 'POST',
      });
    },

    // GET /seller/stripe-connect/status
    getStatus: async () => {
      return apiRequest('/seller/stripe-connect/status');
    },

    // POST /seller/stripe-connect/login-link
    getLoginLink: async () => {
      return apiRequest('/seller/stripe-connect/login-link', {
        method: 'POST',
      });
    },
  },
};
