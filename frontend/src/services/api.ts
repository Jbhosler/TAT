/**
 * API client for backend communication.
 */
import axios from 'axios';

// In production, this should be set to your Cloud Run backend URL
// For local development, use http://localhost:8000
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD 
    ? 'https://tat-backend-vzkn2vygsa-uc.a.run.app' 
    : 'http://localhost:8000');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  validatePasscode: async (passcode: string) => {
    try {
      const response = await api.post('/api/auth/validate', { passcode });
      console.log('API Response:', response);
      console.log('Response data:', response.data);
      
      // Ensure we return the data object
      const data = response.data || {};
      
      if (data.valid === true) {
        const token = data.token || 'authenticated';
        localStorage.setItem('auth_token', token);
        console.log('Token saved to localStorage:', token);
      }
      
      return data;
    } catch (error: any) {
      console.error('API Error:', error);
      throw error;
    }
  },
};

// Strategies API
export const strategiesAPI = {
  list: () => api.get('/api/strategies'),
  get: (id: string) => api.get(`/api/strategies/${id}`),
  create: (data: any) => api.post('/api/strategies', data),
  update: (id: string, data: any) => api.put(`/api/strategies/${id}`, data),
  delete: (id: string) => api.delete(`/api/strategies/${id}`),
  bulkUpload: (id: string, csvContent: string) =>
    api.post(`/api/strategies/${id}/bulk-upload`, csvContent, {
      headers: { 'Content-Type': 'text/csv' },
    }),
};

// Prospects API
export const prospectsAPI = {
  upload: (strategyId: string, name: string, csvContent: string) =>
    api.post('/api/prospects/upload', null, {
      params: { strategy_id: strategyId, name },
      data: csvContent,
      headers: { 'Content-Type': 'text/csv' },
    }),
  classify: (id: string) => api.post(`/api/prospects/${id}/classify`),
  getUnmapped: (id: string) => api.get(`/api/prospects/${id}/unmapped`),
  saveMapping: (id: string, mapping: any) =>
    api.post(`/api/prospects/${id}/map`, mapping),
  calculate: (id: string) => api.post(`/api/prospects/${id}/calculate`),
  getResult: (id: string) => api.get(`/api/prospects/${id}/result`),
  staleCheck: (id: string) => api.get(`/api/prospects/${id}/stale-check`),
};

// Admin API
export const adminAPI = {
  getAssetClasses: () => api.get('/api/admin/asset-classes'),
  getProductEquivalents: (strategyId: string) =>
    api.get(`/api/admin/product-equivalents/${strategyId}`),
  uploadProductEquivalents: (strategyId: string, csvContent: string) =>
    api.post(`/api/admin/product-equivalents/${strategyId}`, csvContent, {
      headers: { 'Content-Type': 'text/csv' },
    }),
};

export default api;
