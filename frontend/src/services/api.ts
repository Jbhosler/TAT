/**
 * API client for backend communication.
 */
import axios from 'axios';

// Production: Cloud Run backend. Set VITE_API_URL when building to override.
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
  requestLink: async (email: string) => {
    const response = await api.post('/api/auth/request-link', { email });
    return response.data;
  },
  verifyLink: async (token: string) => {
    const response = await api.post('/api/auth/verify-link', { token });
    const data = response.data || {};
    if (data.token) {
      localStorage.setItem('auth_token', data.token);
      if (data.role) {
        localStorage.setItem('auth_role', data.role);
      }
      if (data.email) {
        localStorage.setItem('auth_email', data.email);
      }
      window.dispatchEvent(new CustomEvent('auth-changed'));
    }
    return data;
  },
  me: async () => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
  // Temporary fallback during migration; can be removed after rollout.
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
  blendPreview: (components: Array<{ strategy_id: string; weight: number }>) =>
    api.post('/api/strategies/blend-preview', { components }),
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
  delete: (id: string) => api.delete(`/api/prospects/${id}`),
  getLinkableAccounts: (id: string, strategyId?: string) =>
    api.get(`/api/prospects/${id}/linkable-accounts`, {
      params: strategyId ? { strategy_id: strategyId } : undefined,
    }),
  getStrategyAccountLinks: (id: string) =>
    api.get(`/api/prospects/${id}/strategy-account-links`),
  updateStrategyAccountLinks: (
    id: string,
    links: Array<{ strategy_id: string; monitored_account_id: string | null }>
  ) => api.put(`/api/prospects/${id}/strategy-account-links`, { links }),
  linkAccount: (id: string, monitoredAccountId: string | null) =>
    api.patch(`/api/prospects/${id}/link-account`, { monitored_account_id: monitoredAccountId }),
  get: (id: string) => api.get(`/api/prospects/${id}`),
  updateTarget: (
    id: string,
    body: {
      strategy_id: string;
      strategy_blend?: Array<{ strategy_id: string; weight: number }>;
    }
  ) => api.patch(`/api/prospects/${id}/target`, body),
  updateHoldings: (
    id: string,
    body: {
      name?: string;
      holdings: Array<{
        ticker: string;
        value: number;
        unrealized_gain_loss: number;
      }>;
    }
  ) => api.put(`/api/prospects/${id}/holdings`, body),
  getDocument: (id: string) => api.get(`/api/prospects/${id}/document`, { responseType: 'blob' }),
  uploadDocument: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/api/prospects/${id}/document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  upload: (
    strategyId: string,
    name: string,
    csvContent: string,
    strategyBlend?: Array<{ strategy_id: string; weight: number }>
  ) =>
    api.post('/api/prospects/upload', csvContent, {
      params: {
        strategy_id: strategyId,
        name,
        ...(strategyBlend
          ? { strategy_blend: JSON.stringify(strategyBlend) }
          : {}),
      },
      headers: { 'Content-Type': 'text/csv' },
    }),
  getHoldings: (id: string) => api.get(`/api/prospects/${id}/holdings`),
  classify: (id: string, sidePocketHoldingIds: string[]) =>
    api.post(`/api/prospects/${id}/classify`, {
      side_pocket_holding_ids: sidePocketHoldingIds,
    }),
  getUnmapped: (id: string) => api.get(`/api/prospects/${id}/unmapped`),
  getMappingReview: (id: string) => api.get(`/api/prospects/${id}/mapping-review`),
  getMappings: (id: string) => api.get(`/api/prospects/${id}/mappings`),
  saveMapping: (id: string, mapping: any) =>
    api.post(`/api/prospects/${id}/map`, mapping),
  markForcedSale: (id: string, legacyTicker: string) =>
    api.post(`/api/prospects/${id}/force-sale`, { legacy_ticker: legacyTicker }),
  calculate: (id: string) => api.post(`/api/prospects/${id}/calculate`),
  getResult: (id: string) => api.get(`/api/prospects/${id}/result`),
  staleCheck: (id: string) => api.get(`/api/prospects/${id}/stale-check`),
  getReportPdf: (id: string, additionalText?: string) =>
    api.get(`/api/prospects/${id}/report-pdf`, {
      params: additionalText ? { additional_text: additionalText } : undefined,
      responseType: 'blob',
    }),
};

// Admin API
export const adminAPI = {
  listAuthorizedUsers: () => api.get('/api/admin/authorized-users'),
  createAuthorizedUser: (body: { email: string; display_name?: string; role: 'user' | 'admin' | 'super_admin' }) =>
    api.post('/api/admin/authorized-users', body),
  updateAuthorizedUser: (
    email: string,
    body: { display_name?: string; role?: 'user' | 'admin' | 'super_admin'; is_active?: boolean },
  ) => api.patch(`/api/admin/authorized-users/${encodeURIComponent(email)}`, body),
  deactivateAuthorizedUser: (email: string) =>
    api.delete(`/api/admin/authorized-users/${encodeURIComponent(email)}`),
  getAssetClasses: () => api.get('/api/admin/asset-classes'),
  getProductEquivalents: (strategyId: string) =>
    api.get(`/api/admin/product-equivalents/${strategyId}`),
  uploadProductEquivalents: (strategyId: string, csvContent: string) =>
    api.post(`/api/admin/product-equivalents/${strategyId}`, new Blob([csvContent], { type: 'text/csv; charset=utf-8' }), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      transformRequest: [(data) => data],
    }),
  deleteProductEquivalent: (strategyId: string, equivalentId: string) =>
    api.delete(`/api/admin/product-equivalents/${strategyId}/${equivalentId}`),
  updateProductEquivalentGrade: (strategyId: string, equivalentId: string, grade: number) =>
    api.patch(`/api/admin/product-equivalents/${strategyId}/${equivalentId}`, { grade }),
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
  uploadRegistrationType: (csvContent: string) =>
    api.post('/api/admin/registration-type-upload', new Blob([csvContent], { type: 'text/csv; charset=utf-8' }), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      transformRequest: [(data) => data],
    }),
  getRegistrationTypeSample: (limit?: number) =>
    api.get<{
      sample_accounts: Array<{ advisor: string | null; account_display: string | null; external_model_name: string | null; firm: string | null; synthetic_id_prefix: string | null }>;
      distinct_advisors: string[];
      distinct_models: string[];
      note: string;
    }>('/api/admin/registration-type-sample', { params: limit != null ? { limit } : undefined }),
};

// Monitoring API
export const monitoringAPI = {
  listStrategyMappings: () => api.get('/api/monitoring/strategy-mappings'),
  createStrategyMapping: (body: { external_model_name: string; internal_strategy_id: string }) =>
    api.post('/api/monitoring/strategy-mappings', body),
  updateStrategyMapping: (id: string, body: { external_model_name: string; internal_strategy_id: string }) =>
    api.put(`/api/monitoring/strategy-mappings/${id}`, body),
  deleteStrategyMapping: (id: string) => api.delete(`/api/monitoring/strategy-mappings/${id}`),
  ingest: (csvContent: string, params?: { force?: boolean }) =>
    api.post('/api/monitoring/ingest', csvContent, {
      headers: { 'Content-Type': 'text/csv' },
      params: params?.force ? { force: 'true' } : undefined,
    }),
  recalculate: (params?: { strategy_id?: string }) =>
    api.post<{ recalculated_count: number; last_ingest_at: string | null }>('/api/monitoring/recalculate', undefined, {
      params: params?.strategy_id ? { strategy_id: params.strategy_id } : undefined,
      timeout: 600000, // 10 min - recalculate can be slow with many accounts
    }),
  lastIngest: () => api.get<{ last_ingest_at: string | null; as_of_date: string | null }>('/api/monitoring/last-ingest'),
  snapshotDates: () =>
    api.get<{ dates: string[]; latest_date: string | null }>('/api/monitoring/snapshot-dates'),
  ingestChanges: (params?: { prior_as_of_date?: string; current_as_of_date?: string }) =>
    api.get<{
      has_prior: boolean;
      prior_date: string | null;
      current_date: string | null;
      prior_account_count: number;
      current_account_count: number;
      prior_total_aum: number;
      current_total_aum: number;
      aum_change_pct: number | null;
      new_accounts: Array<{ id: string; synthetic_id: string; advisor: string | null; partial_account_number: string | null; model_name: string | null; prior_value: number | null; current_value: number | null; value_change_pct: number | null }>;
      removed_accounts: Array<{ id: string; synthetic_id: string; advisor: string | null; partial_account_number: string | null; model_name: string | null; prior_value: number | null; current_value: number | null; value_change_pct: number | null }>;
      material_value_changes: Array<{ id: string; synthetic_id: string; advisor: string | null; partial_account_number: string | null; model_name: string | null; prior_value: number | null; current_value: number | null; value_change_pct: number | null }>;
      new_advisers: string[];
      removed_advisers: string[];
      adviser_account_changes: Array<{ adviser: string; prior_account_count: number; current_account_count: number; delta: number }>;
      accounts_with_holdings_changes: Array<{ id: string; synthetic_id: string; advisor: string | null; partial_account_number: string | null; model_name: string | null; prior_value: number | null; current_value: number | null; value_change_pct: number | null }>;
    }>('/api/monitoring/ingest-changes', { params }),
  listAccounts: (params?: { as_of_date?: string; mapped_only?: boolean }) =>
    api.get('/api/monitoring/accounts', { params }),
  totalFirm: (params?: { as_of_date?: string; limit?: number; offset?: number }) =>
    api.get<{
      summary_by_model: Array<{ model_name: string; total_value: number; account_count: number }>;
      accounts: Array<{
        id: string;
        advisor: string | null;
        partial_account_number: string | null;
        model_name: string | null;
        total_value: number;
        has_equivalents: boolean;
        registration_type: string | null;
      }>;
    }>('/api/monitoring/total-firm', { params }),
  totalFirmYtd: (params?: { as_of_date?: string }) =>
    api.get<{
      has_baseline: boolean;
      baseline_date: string | null;
      current_date: string | null;
      strategies: Array<{
        strategy_name: string;
        start_account_count: number;
        current_account_count: number;
        account_count_delta: number;
        start_aum: number;
        current_aum: number;
        aum_delta: number;
        aum_delta_pct: number | null;
      }>;
      advisers_won: string[];
      advisers_lost: string[];
    }>('/api/monitoring/total-firm-ytd', { params }),
  searchAccountsBySyntheticId: (syntheticId: string, params?: { as_of_date?: string }) =>
    api.get<Array<{
      id: string;
      synthetic_id: string;
      friendly_name: string | null;
      strategy_name: string | null;
      advisor: string | null;
      account_display: string | null;
      total_value: number | null;
      as_of_date: string | null;
    }>>('/api/monitoring/accounts/search', { params: { synthetic_id: syntheticId, ...params } }),
  getAccount: (id: string) => api.get(`/api/monitoring/accounts/${id}`),
  getLinkedProspects: (accountId: string) =>
    api.get<Array<{ id: string; name: string; has_document: boolean }>>(`/api/monitoring/accounts/${accountId}/linked-prospects`),
  updateAccount: (id: string, body: { friendly_name?: string; registration_type?: string | null }) =>
    api.patch(`/api/monitoring/accounts/${id}`, body),
  getAccountSnapshots: (id: string, params?: { as_of_date?: string }) =>
    api.get(`/api/monitoring/accounts/${id}/snapshots`, { params }),
  concentrationReport: (params?: { as_of_date?: string; limit?: number; offset?: number }) =>
    api.get('/api/monitoring/concentration-report', { params }),
  concentrationReportAccounts: (ticker: string, grade: number, params?: { as_of_date?: string }) =>
    api.get(`/api/monitoring/concentration-report/${encodeURIComponent(ticker)}/accounts`, { params: { grade, ...params } }),
  topOffenders: (params?: { as_of_date?: string; limit?: number; offset?: number }) =>
    api.get('/api/monitoring/top-offenders', { params }),
  unmappedTickers: (params?: { as_of_date?: string; limit?: number; offset?: number }) =>
    api.get('/api/monitoring/unmapped-tickers', { params }),
  unmappedTickerAccounts: (ticker: string, params?: { as_of_date?: string }) =>
    api.get<Array<{
      account_id: string;
      partial_account_number: string | null;
      adviser: string | null;
      strategy_name: string | null;
      registration_type: string | null;
      value: number;
      pct_of_equivalent_total: number;
    }>>(`/api/monitoring/unmapped-tickers/${encodeURIComponent(ticker)}/accounts`, { params }),
  unusedEquivalents: (params?: { as_of_date?: string; limit?: number; offset?: number }) =>
    api.get<Array<{ legacy_ticker: string; model_ticker: string; grade: number | null; strategy_name: string; strategy_id: string }>>('/api/monitoring/unused-equivalents', { params }),
  equivalentsUsage: (params?: { as_of_date?: string; limit?: number; offset?: number }) =>
    api.get<Array<{
      id: string;
      legacy_ticker: string;
      model_ticker: string;
      grade: number | null;
      buy_control: string | null;
      sell_control: string | null;
      custodian: string | null;
      notes: string | null;
      description: string | null;
      strategy_name: string;
      strategy_id: string;
      total_value: number;
      account_count: number;
      is_unused: boolean;
      retirement_only: boolean;
    }>>('/api/monitoring/equivalents-usage', { params }),
  equivalentAccounts: (equivalentId: string, params?: { as_of_date?: string }) =>
    api.get<Array<{
      account_id: string;
      partial_account_number: string | null;
      adviser: string | null;
      strategy_name: string | null;
      registration_type: string | null;
      value: number;
      pct_of_equivalent_total: number;
    }>>(`/api/monitoring/equivalents-usage/${equivalentId}/accounts`, { params }),
  listAdvisers: () => api.get<string[]>('/api/monitoring/advisers'),
  getAdviserAccounts: (adviser: string, params?: { as_of_date?: string }) =>
    api.get<{
      summary: { total_accounts: number; total_aum: number; accounts_with_equivalents: number };
      summary_by_strategy: Array<{ strategy_name: string; total_value: number; account_count: number }>;
      accounts: Array<{ account_id: string; partial_account_number: string | null; account_value: number; has_equivalents: boolean; strategy_name: string | null; registration_type: string | null }>;
      legacy_totals: Array<{ legacy_ticker: string; total_value: number; account_count: number }>;
    }>('/api/monitoring/adviser-accounts', { params: { adviser, ...params } }),
  // Equivalent Review
  equivalentReview: (params?: { strategy_id?: string }) =>
    api.get<Array<{
      id: string;
      strategy_id: string;
      strategy_name: string;
      legacy_ticker: string;
      model_ticker: string;
      grade: number | null;
      metrics: {
        last_updated: string | null;
        leg_ret_1y: number | null;
        leg_ret_3y: number | null;
        leg_ret_5y: number | null;
        leg_vol: number | null;
        leg_mdd: number | null;
        mod_ret_1y: number | null;
        mod_ret_3y: number | null;
        mod_ret_5y: number | null;
        mod_vol: number | null;
        mod_mdd: number | null;
        correlation_1y: number | null;
      } | null;
    }>>('/api/monitoring/equivalent-review', { params }),
  equivalentReviewRefresh: (equivalentId: string) =>
    api.post<{ equivalent_id: string; legacy_ticker: string; model_ticker: string; success: boolean; last_updated?: string; error?: string }>(
      `/api/monitoring/equivalent-review/${equivalentId}/refresh`
    ),
};

export default api;
