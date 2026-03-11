import { useState, useEffect } from 'react';
import { monitoringAPI, adminAPI, strategiesAPI } from '../../services/api';

type EquivalentReviewMetrics = {
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
};

type EquivalentReviewRow = {
  id: string;
  strategy_id: string;
  strategy_name: string;
  legacy_ticker: string;
  model_ticker: string;
  grade: number | null;
  metrics: EquivalentReviewMetrics | null;
};

const EquivalentReview = () => {
  const [rows, setRows] = useState<EquivalentReviewRow[]>([]);
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [gradeEditingId, setGradeEditingId] = useState<string | null>(null);
  const [gradeSavingId, setGradeSavingId] = useState<string | null>(null);

  const loadStrategies = async () => {
    try {
      const res = await strategiesAPI.list();
      const list = (res.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
      setStrategies(list);
    } catch (err) {
      console.error('Failed to load strategies:', err);
      setStrategies([]);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = selectedStrategyId ? { strategy_id: selectedStrategyId } : undefined;
      const res = await monitoringAPI.equivalentReview(params);
      setRows(res.data ?? []);
    } catch (err) {
      console.error('Failed to load equivalent review:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStrategies();
  }, []);

  useEffect(() => {
    load();
  }, [selectedStrategyId]);

  const handleRefresh = async (row: EquivalentReviewRow) => {
    setRefreshingId(row.id);
    try {
      const res = await monitoringAPI.equivalentReviewRefresh(row.id);
      if (res.data?.success) {
        await load();
      } else {
        alert(res.data?.error ?? 'Refresh failed');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e.response?.data?.detail ?? e.message ?? 'Refresh failed');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleGradeChange = async (row: EquivalentReviewRow, newGrade: number) => {
    setGradeSavingId(row.id);
    setGradeEditingId(null);
    try {
      await adminAPI.updateProductEquivalentGrade(row.strategy_id, row.id, newGrade);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e.response?.data?.detail ?? e.message ?? 'Failed to update grade');
    } finally {
      setGradeSavingId(null);
    }
  };

  const formatPct = (v: number | null | undefined): string => {
    if (v == null) return 'N/A';
    return `${(Number(v) * 100).toFixed(1)}%`;
  };

  const formatCorr = (v: number | null | undefined): string => {
    if (v == null) return 'N/A';
    return Number(v).toFixed(2);
  };

  const formatPair = (leg: number | null | undefined, mod: number | null | undefined): string => {
    const l = leg != null ? formatPct(leg) : 'N/A';
    const m = mod != null ? formatPct(mod) : 'N/A';
    return `${l} | ${m}`;
  };

  const formatPairPct = (leg: number | null | undefined, mod: number | null | undefined): string => {
    const l = leg != null ? `${(Number(leg) * 100).toFixed(0)}%` : 'N/A';
    const m = mod != null ? `${(Number(mod) * 100).toFixed(0)}%` : 'N/A';
    return `${l} | ${m}`;
  };

  const isCorrelationLow = (v: number | null | undefined): boolean => {
    if (v == null) return false;
    return Number(v) < 0.75;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Equivalent Review</h3>
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-600">Strategy:</label>
            <select
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm text-sm"
            >
              <option value="">All strategies</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              onClick={load}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Refresh list
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Compare legacy tickers with their model ticker counterparts. Metrics are loaded from the database.
          Click the sync button (🔄) to fetch fresh data from AlphaVantage for a specific pair.
          Correlation &lt; 0.75 is highlighted in red.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">No product equivalents found.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Legacy / Model</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Grade</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Correlation</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">1Y Return (L | M)</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">3Y Return (L | M)</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Vol (L | M)</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">MDD (L | M)</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => {
                  const m = row.metrics;
                  const corr = m?.correlation_1y;
                  const corrLow = isCorrelationLow(corr);
                  const isRefreshing = refreshingId === row.id;
                  const isEditing = gradeEditingId === row.id;
                  const isSaving = gradeSavingId === row.id;

                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {row.legacy_ticker} / {row.model_ticker}
                      </td>
                      <td className="px-4 py-2 text-sm text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            {[0, 1, 2].map((g) => (
                              <button
                                key={g}
                                onClick={() => handleGradeChange(row, g)}
                                className="px-2 py-0.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-100"
                              >
                                {g}
                              </button>
                            ))}
                            <button
                              onClick={() => setGradeEditingId(null)}
                              className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setGradeEditingId(row.id)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                            disabled={isSaving}
                          >
                            {row.grade ?? '—'}
                          </button>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2 text-sm text-center font-medium ${
                          corrLow ? 'bg-red-100 text-red-800' : ''
                        }`}
                      >
                        {formatCorr(corr)}
                      </td>
                      <td className="px-4 py-2 text-sm text-center text-gray-700">
                        {m
                          ? formatPair(m.leg_ret_1y != null ? m.leg_ret_1y : undefined, m.mod_ret_1y != null ? m.mod_ret_1y : undefined)
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-center text-gray-700">
                        {m
                          ? formatPair(m.leg_ret_3y != null ? m.leg_ret_3y : undefined, m.mod_ret_3y != null ? m.mod_ret_3y : undefined)
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-center text-gray-700">
                        {m
                          ? formatPair(m.leg_vol != null ? m.leg_vol : undefined, m.mod_vol != null ? m.mod_vol : undefined)
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-center text-gray-700">
                        {m
                          ? formatPairPct(m.leg_mdd != null ? m.leg_mdd : undefined, m.mod_mdd != null ? m.mod_mdd : undefined)
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-center">
                        <button
                          onClick={() => handleRefresh(row)}
                          disabled={isRefreshing}
                          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                          title="Sync from AlphaVantage"
                        >
                          {isRefreshing ? (
                            <span className="text-gray-400">…</span>
                          ) : (
                            <span aria-hidden>🔄</span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EquivalentReview;
