const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Helper to build product image URL by basename
export const getProductImageUrl = (basename) => `${API_URL}/products/images/${encodeURIComponent(basename)}`;

// Helper to build art product image URL by basename
export const getArtImageUrl = (basename) => `${API_URL}/art/images/${encodeURIComponent(basename)}`;

// Helper to build others product image URL by basename
export const getOthersImageUrl = (basename) => `${API_URL}/others/images/${encodeURIComponent(basename)}`;

// Helper to build author profile image URL by filename
export const getAuthorImageUrl = (filename) => `${API_URL}/users/authors/images/${encodeURIComponent(filename)}`;

// Helper function to get auth token from localStorage
const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

// Helper function to make API requests
async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();

  // Detect FormData to avoid setting Content-Type so browser sets boundary
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      // Handle 401 Unauthorized - session expired or invalid token
      if (response.status === 401) {
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
  create: async (items, guestEmail = null) => {
    // items should be array of { type: 'art' | 'other', id, variantId? }
    // guestEmail is optional for guest checkout
    const requestBody = { items };

    if (guestEmail) {
      requestBody.guest_email = guestEmail;
    }

    return apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify(requestBody),
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

    const queryString = queryParams.toString();
    return apiRequest(`/orders${queryString ? '?' + queryString : ''}`);
  },

  getById: async (id) => {
    return apiRequest(`/orders/${id}`);
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
  },

  // Orders management
  orders: {
    getAll: async () => {
      return apiRequest('/admin/orders');
    },

    getById: async (id) => {
      return apiRequest(`/admin/orders/${id}`);
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
};
