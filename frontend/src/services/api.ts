/**
 * API client for backend communication.
 */
import axios from 'axios';

// In production, use Cloud Run backend URL. For local dev, use localhost.
// Set VITE_API_URL when building if your backend is at a different URL.
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
  list: () => api.get('/api/prospects'),
  get: (id: string) => api.get(`/api/prospects/${id}`),
  getDocument: (id: string) => api.get(`/api/prospects/${id}/document`, { responseType: 'blob' }),
  uploadDocument: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/api/prospects/${id}/document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  upload: (strategyId: string, name: string, csvContent: string) =>
    api.post('/api/prospects/upload', csvContent, {
      params: { strategy_id: strategyId, name },
      headers: { 'Content-Type': 'text/csv' },
    }),
  classify: (id: string) => api.post(`/api/prospects/${id}/classify`),
  getUnmapped: (id: string) => api.get(`/api/prospects/${id}/unmapped`),
  saveMapping: (id: string, mapping: any) =>
    api.post(`/api/prospects/${id}/map`, mapping),
  markForcedSale: (id: string, legacyTicker: string) =>
    api.post(`/api/prospects/${id}/force-sale`, { legacy_ticker: legacyTicker }),
  calculate: (id: string) => api.post(`/api/prospects/${id}/calculate`),
  getResult: (id: string) => api.get(`/api/prospects/${id}/result`),
  staleCheck: (id: string) => api.get(`/api/prospects/${id}/stale-check`),
  getReportPdf: (id: string) =>
    api.get(`/api/prospects/${id}/report-pdf`, { responseType: 'blob' }),
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
  getSanityCheck: () => api.get('/api/admin/sanity-check'),
  sanityCheckPreflight: (strategyId: string, csvContent: string) =>
    api.post('/api/admin/sanity-check/preflight', { strategy_id: strategyId, csv_content: csvContent }),
  replaceModelTicker: (body: {
    old_model_ticker: string;
    new_model_ticker: string;
    add_old_as_grade1: boolean;
    apply_to_all_strategies: boolean;
    strategy_id?: string;
  }) => api.post('/api/admin/replace-model-ticker', body),
  resolveConflict: (body: {
    legacy_ticker: string;
    master_model_ticker: string;
    master_grade: number;
    strategy_ids?: string[];
  }) => api.post('/api/admin/resolve-conflict', body),
};

// Monitoring API
export const monitoringAPI = {
  listStrategyMappings: () => api.get('/api/monitoring/strategy-mappings'),
  createStrategyMapping: (body: { external_model_name: string; internal_strategy_id: string }) =>
    api.post('/api/monitoring/strategy-mappings', body),
  updateStrategyMapping: (id: string, body: { external_model_name: string; internal_strategy_id: string }) =>
    api.put(`/api/monitoring/strategy-mappings/${id}`, body),
  deleteStrategyMapping: (id: string) => api.delete(`/api/monitoring/strategy-mappings/${id}`),
  ingest: (csvContent: string) =>
    api.post('/api/monitoring/ingest', csvContent, { headers: { 'Content-Type': 'text/csv' } }),
  listAccounts: (params?: { as_of_date?: string }) =>
    api.get('/api/monitoring/accounts', { params }),
  getAccount: (id: string) => api.get(`/api/monitoring/accounts/${id}`),
  updateAccount: (id: string, body: { friendly_name?: string }) =>
    api.patch(`/api/monitoring/accounts/${id}`, body),
  getAccountSnapshots: (id: string, params?: { as_of_date?: string }) =>
    api.get(`/api/monitoring/accounts/${id}/snapshots`, { params }),
  concentrationReport: (params?: { as_of_date?: string }) =>
    api.get('/api/monitoring/concentration-report', { params }),
  topOffenders: (params?: { as_of_date?: string }) =>
    api.get('/api/monitoring/top-offenders', { params }),
  unmappedTickers: (params?: { as_of_date?: string }) =>
    api.get('/api/monitoring/unmapped-tickers', { params }),
};

export default api;
