import { useEffect, useMemo, useState } from 'react';
import { adminAPI, monitoringAPI, strategiesAPI } from '../../services/api';

interface StrategyPosition {
  id: string;
  model_ticker: string;
  asset_class: string;
  target_allocation: number | string;
  drift_percentage: number | string;
}

interface Strategy {
  id: string;
  name: string;
  version: number;
  positions: StrategyPosition[];
}

interface HoldingRow {
  localId: string;
  model_ticker: string;
  asset_class: string;
  target_allocation: string;
  drift_percentage: string;
}

const ALLOCATION_TOLERANCE = 0.001;
const TARGET_TOTAL = 100;

const ASSET_CLASS_FALLBACK = [
  'US Large Core', 'US Large Growth', 'US Large Value', 'US Midcap Growth', 'US Midcap Value',
  'US Small Cap', 'International Developed', 'Emerging Markets',
  'Infrastructure', 'Options Overlay', 'Real Estate', 'Fixed Income',
  'Emg Bond LC', 'Emg Bond Hedged', 'ST Corp', 'IT Corp', 'LT Corp', 'ST Govt', 'IT Govt', 'LT Govt',
  'Tactical Cash', 'Ultra ST Bond', 'Aggregate', 'Mortgage Backed', 'Inflation Protection',
  'ST High Yield', 'High Yield', 'Private Credit', 'International Bond',
  'Bank Loan', 'Securitized', 'Variable Rate IG', 'MBS Floating Rate',
  'CLO-AAA', 'CLO-BBB', 'CLO-A', 'Commercial Paper', 'Cash',
];

let rowSeq = 0;
function nextRowId(): string {
  rowSeq += 1;
  return `holding-${rowSeq}`;
}

function roundToTenthPct(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function formatAmount(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return String(roundToTenthPct(n));
}

function rowsFromStrategy(strategy: Strategy): HoldingRow[] {
  return (strategy.positions || []).map((p) => ({
    localId: p.id || nextRowId(),
    model_ticker: p.model_ticker ?? '',
    asset_class: p.asset_class ?? 'US Large Core',
    target_allocation: formatAmount(p.target_allocation),
    drift_percentage: formatAmount(p.drift_percentage),
  }));
}

function cloneRows(rows: HoldingRow[]): HoldingRow[] {
  return rows.map((r) => ({ ...r }));
}

type HoldingsGuard = { dirty: boolean; saving: boolean };

type StrategyHoldingsProps = {
  onGuardChange?: (guard: HoldingsGuard) => void;
};

function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg?: string }).msg);
        return JSON.stringify(item);
      })
      .join('; ');
  }
  return fallback;
}

function recalculateError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string; response?: { status?: number } };
    if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
      return 'Recalculation timed out. It may still be running. Try Recalculate monitoring on Product Equivalents in a few minutes.';
    }
    if (e.response?.status === 504) {
      return 'Recalculation took too long and was cancelled. Try again from Product Equivalents after a moment.';
    }
  }
  return apiErrorMessage(err, 'Recalculation failed.');
}

const fieldClass =
  'block w-full rounded-md border border-gray-300 px-2 py-1.5 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';

const StrategyHoldings = ({ onGuardChange }: StrategyHoldingsProps) => {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [savedRows, setSavedRows] = useState<HoldingRow[]>([]);
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'recalculating'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const assetClassOptions = assetClasses.length > 0 ? assetClasses : ASSET_CLASS_FALLBACK;
  const selectedStrategy = strategies.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    loadStrategies();
    adminAPI.getAssetClasses().then((r) => setAssetClasses(r.data || [])).catch(() => setAssetClasses([]));
  }, []);

  useEffect(() => {
    if (!message || message.type !== 'success') return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  const loadStrategies = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingList(true);
    try {
      const response = await strategiesAPI.list();
      const data = response.data;
      const list: Strategy[] = Array.isArray(data) ? data : (data?.data ?? []);
      setStrategies(list);
      setLoadError(null);
      return list;
    } catch (err) {
      console.error('Failed to load strategies:', err);
      if (!opts?.silent) {
        setStrategies([]);
        setLoadError('Failed to load strategies.');
      }
      return [];
    } finally {
      if (!opts?.silent) setLoadingList(false);
    }
  };

  const applyStrategy = (strategy: Strategy | null) => {
    const next = strategy ? rowsFromStrategy(strategy) : [];
    setRows(next);
    setSavedRows(cloneRows(next));
    setSearch('');
    setMessage(null);
  };

  const isDirty = useMemo(() => {
    return JSON.stringify(rows) !== JSON.stringify(savedRows);
  }, [rows, savedRows]);

  useEffect(() => {
    onGuardChange?.({ dirty: isDirty, saving });
  }, [isDirty, saving, onGuardChange]);

  useEffect(() => {
    return () => onGuardChange?.({ dirty: false, saving: false });
  }, [onGuardChange]);

  const allocationTotal = roundToTenthPct(
    rows.reduce((sum, row) => sum + (Number(row.target_allocation) || 0), 0)
  );
  const isTotalValid = rows.length > 0 && Math.abs(allocationTotal - TARGET_TOTAL) <= ALLOCATION_TOLERANCE;

  const validationErrors = useMemo(() => {
    if (!selectedStrategy) return [];
    const errors: string[] = [];
    if (rows.length === 0) errors.push('Add at least one holding.');
    const seen = new Map<string, number>();
    rows.forEach((row, i) => {
      const ticker = row.model_ticker.trim();
      const label = ticker || `Row ${i + 1}`;
      if (!ticker) errors.push(`Row ${i + 1}: Model ticker is required.`);
      const key = ticker.toUpperCase();
      if (ticker) {
        const first = seen.get(key);
        if (first != null) errors.push(`${label}: duplicate of row ${first}.`);
        else seen.set(key, i + 1);
      }
      const target = Number(row.target_allocation);
      const drift = Number(row.drift_percentage);
      if (row.target_allocation.trim() === '' || !Number.isFinite(target) || target < 0 || target > 100) {
        errors.push(`${label}: Target % must be 0–100.`);
      }
      if (row.drift_percentage.trim() === '' || !Number.isFinite(drift) || drift < 0 || drift > 100) {
        errors.push(`${label}: Drift % must be 0–100.`);
      }
    });
    if (rows.length > 0 && !isTotalValid) {
      errors.push(`Target allocations must sum to 100%. Current total: ${allocationTotal.toFixed(3)}%.`);
    }
    return errors;
  }, [selectedStrategy, rows, isTotalValid, allocationTotal]);

  const canSave = Boolean(selectedStrategy) && isDirty && validationErrors.length === 0 && !saving;

  const selectStrategy = (id: string) => {
    if (id === selectedId) return;
    if (isDirty && !window.confirm('Discard unsaved holdings changes?')) return;
    setSelectedId(id);
    applyStrategy(strategies.find((s) => s.id === id) ?? null);
  };

  const updateRow = (localId: string, field: keyof Omit<HoldingRow, 'localId'>, value: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row;
        const next = { ...row, [field]: value };
        if (field === 'asset_class' && value === 'Cash' && !next.model_ticker.trim()) {
          next.model_ticker = 'Cash';
        }
        return next;
      })
    );
  };

  const addRow = () => {
    setSearch('');
    setRows((prev) => [
      ...prev,
      {
        localId: nextRowId(),
        model_ticker: '',
        asset_class: assetClassOptions[0] || 'US Large Core',
        target_allocation: '0',
        drift_percentage: '0',
      },
    ]);
  };

  const removeRow = (localId: string) => {
    setRows((prev) => prev.filter((row) => row.localId !== localId));
  };

  const discard = () => {
    setRows(cloneRows(savedRows));
    setMessage(null);
  };

  const handleSave = async () => {
    if (!selectedStrategy || !canSave) return;
    const strategyId = selectedStrategy.id;
    setSaving(true);
    setSavePhase('saving');
    setMessage(null);
    try {
      await strategiesAPI.update(strategyId, {
        name: selectedStrategy.name,
        positions: rows.map((row) => ({
          model_ticker: row.model_ticker.trim(),
          asset_class: row.asset_class,
          target_allocation: roundToTenthPct(Number(row.target_allocation)),
          drift_percentage: roundToTenthPct(Number(row.drift_percentage)),
        })),
      });
      const list = await loadStrategies({ silent: true });
      const refreshed = list.find((s) => s.id === strategyId) ?? null;
      if (refreshed) {
        const next = rowsFromStrategy(refreshed);
        setRows(next);
        setSavedRows(cloneRows(next));
      } else {
        setSavedRows(cloneRows(rows));
      }
      setSavePhase('recalculating');
      try {
        await monitoringAPI.recalculate({ strategy_id: strategyId });
        setMessage({ type: 'success', text: 'Holdings saved. Monitoring data recalculated.' });
      } catch (err) {
        setMessage({
          type: 'error',
          text: `Holdings saved, but monitoring was not recalculated. ${recalculateError(err)}`,
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Failed to save holdings.') });
    } finally {
      setSaving(false);
      setSavePhase('idle');
    }
  };

  const query = search.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (!query) return true;
    return (
      row.model_ticker.toLowerCase().includes(query) ||
      row.asset_class.toLowerCase().includes(query)
    );
  });

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900">Strategy Holdings</h2>
      <p className="mt-1 text-sm text-gray-500">
        View and edit the model holdings for a strategy. Target allocations must sum to 100%.
      </p>

      <div className="mt-6 max-w-xl">
        <label htmlFor="holdings-strategy" className="block text-sm font-medium text-gray-700 mb-2">
          Strategy
        </label>
        <select
          id="holdings-strategy"
          className={fieldClass}
          value={selectedId}
          disabled={loadingList}
          onChange={(e) => selectStrategy(e.target.value)}
        >
          <option value="">{loadingList ? 'Loading strategies…' : 'Select a strategy'}</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (v{s.version}) — {s.positions?.length ?? 0} holdings
            </option>
          ))}
        </select>
        {loadError && (
          <p className="mt-2 text-sm text-red-600">
            {loadError}{' '}
            <button type="button" onClick={() => loadStrategies()} className="underline font-medium">
              Retry
            </button>
          </p>
        )}
      </div>

      {!selectedStrategy && !loadingList && (
        <p className="mt-8 text-sm text-gray-500">Select a strategy to view its holdings.</p>
      )}

      {selectedStrategy && (
        <div className="mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <label htmlFor="holdings-search" className="block text-xs font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                id="holdings-search"
                type="text"
                className={fieldClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ticker or asset class"
              />
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`text-sm font-medium ${isTotalValid ? 'text-green-700' : 'text-amber-700'}`}
              >
                Total: {allocationTotal.toFixed(3)}%
                {!isTotalValid && ' (must be 100%)'}
              </span>
              <button
                type="button"
                onClick={addRow}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Add holding
              </button>
            </div>
          </div>

          {message && (
            <div
              className={`mb-4 p-3 rounded-md text-sm ${
                message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          {savePhase === 'recalculating' && (
            <div className="mb-4 p-3 rounded-md text-sm bg-indigo-50 text-indigo-800">
              Holdings saved. Recalculating monitoring data… This can take a few minutes.
            </div>
          )}

          {validationErrors.length > 0 && (
            <ul className="mb-4 text-sm text-red-600 list-disc list-inside">
              {validationErrors.map((msg, index) => (
                <li key={`${index}:${msg}`}>{msg}</li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model ticker</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset class</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Drift %</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {visibleRows.map((row) => (
                  <tr key={row.localId}>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        className={fieldClass}
                        value={row.model_ticker}
                        onChange={(e) => updateRow(row.localId, 'model_ticker', e.target.value)}
                        aria-label="Model ticker"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className={fieldClass}
                        value={row.asset_class}
                        onChange={(e) => updateRow(row.localId, 'asset_class', e.target.value)}
                        aria-label="Asset class"
                      >
                        {!assetClassOptions.includes(row.asset_class) && (
                          <option value={row.asset_class}>{row.asset_class}</option>
                        )}
                        {assetClassOptions.map((ac) => (
                          <option key={ac} value={ac}>{ac}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 w-32">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        className={fieldClass}
                        value={row.target_allocation}
                        onChange={(e) => updateRow(row.localId, 'target_allocation', e.target.value)}
                        aria-label="Target percent"
                      />
                    </td>
                    <td className="px-4 py-2 w-32">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        className={fieldClass}
                        value={row.drift_percentage}
                        onChange={(e) => updateRow(row.localId, 'drift_percentage', e.target.value)}
                        aria-label="Drift percent"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(row.localId)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-sm text-gray-500 text-center">
                      {rows.length === 0
                        ? 'This strategy has no holdings. Add one to get started.'
                        : 'No holdings match that search.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {query && visibleRows.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Showing {visibleRows.length} of {rows.length} holdings. Search filters the table only; the total still includes every holding.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savePhase === 'recalculating' ? 'Recalculating monitoring…' : saving ? 'Saving…' : 'Save holdings'}
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={!isDirty || saving}
              className="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Discard changes
            </button>
            {isDirty && (
              <span className="text-xs text-amber-700">Unsaved changes</span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Saving replaces this strategy&apos;s holdings, increments its version, and recalculates monitoring. Open scenarios that use it may be marked stale.
          </p>
        </div>
      )}
    </div>
  );
};

export default StrategyHoldings;
