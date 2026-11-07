// Dynamic backend host resolution with seamless production fallback
const getBackendHost = () => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://oibsip-webdev-l3-pizza-delivery-full.onrender.com';
  }
  return '';
};

const API_BASE = `${getBackendHost()}/api`;

/**
 * Enhanced fetch wrapper that automatically handles:
 * - Bearer authorization headers from localStorage
 * - JSON serialization & deserialization
 * - Consistent error formatting
 */
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('pizza_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type');
  let data = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = { message: await response.text() };
  }

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // Auth API
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  verifyEmail: (token) => request(`/auth/verify-email?token=${encodeURIComponent(token)}`),
  resendVerification: (email) => request('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  forgotPassword: (payload) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  
  // Admin Auth API
  adminLogin: (payload) => request('/admin/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  
  // Inventory & Pizzas API
  getPizzas: () => request('/pizzas'),
  getInventory: (category) => request(`/inventory${category ? `?category=${category}` : ''}`),
  getGroupedInventory: () => request('/inventory/grouped'),
  
  // Orders API
  createRazorpayOrder: (payload) => request('/orders/create-razorpay-order', { method: 'POST', body: JSON.stringify(payload) }),
  verifyPayment: (payload) => request('/orders/verify-payment', { method: 'POST', body: JSON.stringify(payload) }),
  getMyOrders: () => request('/orders/my-orders'),
  getOrderById: (orderId) => request(`/orders/${orderId}`),
  
  // Admin API
  getAdminOrders: (params = '') => request(`/admin/orders${params}`),
  updateOrderStatus: (orderId, status) => request(`/admin/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateInventoryStock: (itemId, payload) => request(`/inventory/${itemId}/stock`, { method: 'PUT', body: JSON.stringify(payload) })
};

export default api;

