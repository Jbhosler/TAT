import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';
import { formatIsoDate } from '../../utils/formatIsoDate';
import HoldingsComparisonModal from './HoldingsComparisonModal';
import { monitoringAccountPath } from '../../utils/monitoringNav';

type AccountChangeItem = {
  id: string;
  synthetic_id: string;
  advisor: string | null;
  partial_account_number: string | null;
  model_name: string | null;
  prior_value: number | null;
  current_value: number | null;
  value_change_pct: number | null;
};

type AdviserChangeItem = {
  adviser: string;
  prior_account_count: number;
  current_account_count: number;
  delta: number;
};

type CrdGapItem = {
  adviser_name: string;
  account_count: number;
  total_aum: number;
  status: string;
  crds: string[];
};

type IngestChanges = {
  has_prior: boolean;
  prior_date: string | null;
  current_date: string | null;
  prior_account_count: number;
  current_account_count: number;
  prior_total_aum: number;
  current_total_aum: number;
  aum_change_pct: number | null;
  new_accounts: AccountChangeItem[];
  removed_accounts: AccountChangeItem[];
  material_value_changes: AccountChangeItem[];
  new_advisers: string[];
  removed_advisers: string[];
  adviser_account_changes: AdviserChangeItem[];
  accounts_with_holdings_changes: AccountChangeItem[];
  missing_crd_count?: number;
  advisers_missing_crd?: CrdGapItem[];
  advisers_with_conflicting_crd?: CrdGapItem[];
};

type UploadChangesProps = {
  snapshotDates?: string[];
  refreshTrigger?: string | null;
  onCrdChange?: () => void;
};

const formatGapDollars = (value: number) =>
  `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const CrdGapPanel = ({
  missing,
  conflicts,
  missingCount,
  currentDate,
  onSaved,
}: {
  missing: CrdGapItem[];
  conflicts: CrdGapItem[];
  missingCount: number;
  currentDate?: string | null;
  onSaved: () => void;
}) => {
  const rows = [...missing, ...conflicts];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reviewParams = new URLSearchParams({ tab: 'adviserinfo', missing_crd: '1' });
  if (currentDate) reviewParams.set('as_of_date', currentDate);

  const save = async (name: string) => {
    const draft = (drafts[name] ?? '').trim();
    if (!/^\d+$/.test(draft)) {
      setErrors((prev) => ({ ...prev, [name]: 'CRD must be numeric.' }));
      return;
    }
    setSaving(name);
    setErrors((prev) => ({ ...prev, [name]: '' }));
    try {
      await monitoringAPI.updateAdviserCrd({ adviser_name: name, advisor_crd: draft });
      onSaved();
    } catch {
      setErrors((prev) => ({ ...prev, [name]: 'Could not save CRD.' }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 border-l-4 border-amber-400">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
        <h3 className="text-lg font-semibold text-gray-900">Adviser CRD</h3>
        <Link
          to={`/monitoring?${reviewParams.toString()}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Review in Adviser Info
        </Link>
      </div>
      <p className="text-sm text-gray-700 mb-4">
        {missingCount === 1 ? '1 adviser has no CRD.' : `${missingCount} advisers have no CRD.`}
      </p>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Adviser</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Accounts</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">AUM</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">CRD</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((row) => {
                const draft = drafts[row.adviser_name] ?? '';
                const invalid = draft.trim() !== '' && !/^\d+$/.test(draft.trim());
                return (
                  <tr key={`${row.status}-${row.adviser_name}`}>
                    <td className="px-4 py-2 text-sm text-gray-900">{row.adviser_name}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">{row.account_count}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">{formatGapDollars(row.total_aum)}</td>
                    <td className="px-4 py-2">
                      <input
                        value={draft}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [row.adviser_name]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && /^\d+$/.test(draft.trim())) save(row.adviser_name);
                        }}
                        inputMode="numeric"
                        maxLength={32}
                        aria-label={`CRD for ${row.adviser_name}`}
                        placeholder={row.status === 'conflict' ? 'Choose one' : 'CRD'}
                        className="w-36 rounded-md border-gray-300 shadow-sm text-sm"
                      />
                      {row.status === 'conflict' && (
                        <p className="mt-1 text-xs text-amber-700">Found: {row.crds.join(', ')}</p>
                      )}
                      {errors[row.adviser_name] && (
                        <p className="mt-1 text-xs text-red-600">{errors[row.adviser_name]}</p>
                      )}
                      {invalid && !errors[row.adviser_name] && (
                        <p className="mt-1 text-xs text-red-600">CRD must be numeric.</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => save(row.adviser_name)}
                        disabled={!/^\d+$/.test(draft.trim()) || saving === row.adviser_name}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {saving === row.adviser_name ? 'Saving…' : 'Save'}
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
  );
};

const UploadChanges = ({ snapshotDates = [], refreshTrigger, onCrdChange }: UploadChangesProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPriorDate = searchParams.get('prior_as_of_date') || snapshotDates[1] || null;
  const selectedCurrentDate = searchParams.get('current_as_of_date') || snapshotDates[0] || null;
  const [data, setData] = useState<IngestChanges | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdingsModalAccount, setHoldingsModalAccount] = useState<AccountChangeItem | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = selectedPriorDate && selectedCurrentDate
        ? { prior_as_of_date: selectedPriorDate, current_as_of_date: selectedCurrentDate }
        : undefined;
      const res = await monitoringAPI.ingestChanges(params);
      setData(res.data);
    } catch (err: any) {
      console.error('Failed to load ingest changes:', err);
      setData(null);
      setError(err.response?.data?.detail || 'Failed to load upload changes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedPriorDate ?? '', selectedCurrentDate ?? '', refreshTrigger ?? '']);

  const formatDollars = (v: number | null) =>
    v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
  const formatPct = (v: number | null) => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—');
  const updateComparisonDate = (key: 'prior_as_of_date' | 'current_as_of_date', value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'uploadchanges');
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const comparisonControls = (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm font-medium text-gray-700" htmlFor="upload-prior-date">Prior</label>
      <select
        id="upload-prior-date"
        value={selectedPriorDate ?? ''}
        onChange={(e) => updateComparisonDate('prior_as_of_date', e.target.value)}
        className="rounded-md border-gray-300 shadow-sm text-sm min-w-[150px]"
      >
        <option value="">Select date</option>
        {snapshotDates.map((d) => (
          <option key={d} value={d}>{formatIsoDate(d)}</option>
        ))}
      </select>
      <label className="text-sm font-medium text-gray-700" htmlFor="upload-current-date">Current</label>
      <select
        id="upload-current-date"
        value={selectedCurrentDate ?? ''}
        onChange={(e) => updateComparisonDate('current_as_of_date', e.target.value)}
        className="rounded-md border-gray-300 shadow-sm text-sm min-w-[150px]"
      >
        <option value="">Select date</option>
        {snapshotDates.map((d) => (
          <option key={d} value={d}>{formatIsoDate(d)}</option>
        ))}
      </select>
      <button onClick={load} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
        Refresh
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center gap-4">
          <p className="text-sm text-gray-500">Loading…</p>
          {comparisonControls}
        </div>
      </div>
    );
  }

  const crdPanel = data ? (
    <CrdGapPanel
      missing={data.advisers_missing_crd ?? []}
      conflicts={data.advisers_with_conflicting_crd ?? []}
      missingCount={data.missing_crd_count ?? (data.advisers_missing_crd ?? []).length}
      currentDate={data.current_date}
      onSaved={() => {
        onCrdChange?.();
        load();
      }}
    />
  ) : null;

  if (error || !data || !data.has_prior) {
    return (
      <div className="space-y-6">
        {data && crdPanel}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Changes</h3>
          <div className="mb-4">{comparisonControls}</div>
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <p className="text-sm text-gray-500">
            No prior upload to compare. Ingest at least two different aggregated holdings files with different as-of dates, or select two available dates.
          </p>
        </div>
      </div>
    );
  }

  const AccountTable = ({ rows, showPrior, showCurrent, showChange, onViewHoldingsComparison }: {
    rows: AccountChangeItem[];
    showPrior?: boolean;
    showCurrent?: boolean;
    showChange?: boolean;
    onViewHoldingsComparison?: (row: AccountChangeItem) => void;
  }) => (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Advisor</th>
          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
          {showPrior && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prior Value</th>}
          {showCurrent && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Current Value</th>}
          {showChange && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Change %</th>}
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-2 text-sm text-gray-900">{r.advisor ?? '—'}</td>
            <td className="px-4 py-2 text-sm text-gray-600">{r.partial_account_number ?? r.synthetic_id.slice(0, 8) + '…'}</td>
            <td className="px-4 py-2 text-sm text-gray-600">{r.model_name ?? '—'}</td>
            {showPrior && <td className="px-4 py-2 text-sm text-right">${formatDollars(r.prior_value)}</td>}
            {showCurrent && <td className="px-4 py-2 text-sm text-right">${formatDollars(r.current_value)}</td>}
            {showChange && (
              <td className={`px-4 py-2 text-sm text-right font-medium ${(r.value_change_pct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPct(r.value_change_pct)}
              </td>
            )}
            <td className="px-4 py-2 text-sm text-right">
              {onViewHoldingsComparison ? (
                <button
                  type="button"
                  onClick={() => onViewHoldingsComparison(r)}
                  className="text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  View
                </button>
              ) : (
                <Link
                  to={monitoringAccountPath(
                    r.id,
                    new URLSearchParams({
                      tab: 'uploadchanges',
                      ...(data.current_date ? { as_of_date: data.current_date } : {}),
                      ...(data.prior_date ? { prior_as_of_date: data.prior_date } : {}),
                      ...(data.current_date ? { current_as_of_date: data.current_date } : {}),
                    })
                  )}
                  className="text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  View
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Comparing <strong>{formatIsoDate(data.prior_date)}</strong> (prior) vs <strong>{formatIsoDate(data.current_date)}</strong> (current).
          <span className="ml-3 text-amber-800">
            {(data.missing_crd_count ?? 0) === 1
              ? '1 adviser has no CRD.'
              : `${data.missing_crd_count ?? 0} advisers have no CRD.`}
          </span>
        </p>
        {comparisonControls}
      </div>

      {/* Summary */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase">Accounts</p>
            <p className="text-lg font-semibold">{data.prior_account_count} → {data.current_account_count}</p>
            <p className="text-xs text-gray-600">
              {data.current_account_count - data.prior_account_count >= 0 ? '+' : ''}{data.current_account_count - data.prior_account_count} net
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Prior AUM</p>
            <p className="text-lg font-semibold">${formatDollars(data.prior_total_aum)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Current AUM</p>
            <p className="text-lg font-semibold">${formatDollars(data.current_total_aum)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">AUM Change</p>
            <p className={`text-lg font-semibold ${(data.aum_change_pct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPct(data.aum_change_pct)}
            </p>
          </div>
        </div>
      </div>

      {/* New accounts */}
      {data.new_accounts.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">New Accounts ({data.new_accounts.length})</h3>
          <p className="text-sm text-gray-500 mb-4">Accounts in current upload that were not in prior.</p>
          <div className="overflow-x-auto">
            <AccountTable rows={data.new_accounts} showCurrent />
          </div>
        </div>
      )}

      {/* Removed accounts */}
      {data.removed_accounts.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6 border-l-4 border-amber-400">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Removed Accounts ({data.removed_accounts.length})</h3>
          <p className="text-sm text-gray-500 mb-4">Accounts in prior upload that are no longer in current.</p>
          <div className="overflow-x-auto">
            <AccountTable rows={data.removed_accounts} showPrior />
          </div>
        </div>
      )}

      {/* Material value changes */}
      {data.material_value_changes.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Material Value Changes ({data.material_value_changes.length})</h3>
          <p className="text-sm text-gray-500 mb-4">Accounts with &gt;10% change in account value.</p>
          <div className="overflow-x-auto">
            <AccountTable rows={data.material_value_changes} showPrior showCurrent showChange />
          </div>
        </div>
      )}

      {/* New / Removed advisers */}
      {(data.new_advisers.length > 0 || data.removed_advisers.length > 0) && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Adviser Changes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.new_advisers.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-700 mb-2">New advisers ({data.new_advisers.length})</p>
                <ul className="text-sm text-gray-600 list-disc list-inside">{data.new_advisers.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
            {data.removed_advisers.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">Removed advisers ({data.removed_advisers.length})</p>
                <ul className="text-sm text-gray-600 list-disc list-inside">{data.removed_advisers.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {crdPanel}

      {/* Accounts per adviser change */}
      {data.adviser_account_changes.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Accounts per Adviser Change</h3>
          <p className="text-sm text-gray-500 mb-4">Advisers with a change in account count.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Adviser</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prior</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.adviser_account_changes.map((a) => (
                  <tr key={a.adviser}>
                    <td className="px-4 py-2 text-sm text-gray-900">{a.adviser}</td>
                    <td className="px-4 py-2 text-sm text-right">{a.prior_account_count}</td>
                    <td className="px-4 py-2 text-sm text-right">{a.current_account_count}</td>
                    <td className={`px-4 py-2 text-sm text-right font-medium ${a.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {a.delta >= 0 ? '+' : ''}{a.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Holdings changes */}
      {data.accounts_with_holdings_changes.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Holdings Changes ({data.accounts_with_holdings_changes.length})</h3>
          <p className="text-sm text-gray-500 mb-4">Accounts with new or removed tickers in holdings.</p>
          <div className="overflow-x-auto">
            <AccountTable
              rows={data.accounts_with_holdings_changes}
              showPrior
              showCurrent
              onViewHoldingsComparison={(r) => setHoldingsModalAccount(r)}
            />
          </div>
        </div>
      )}

      {holdingsModalAccount && data && (
        <HoldingsComparisonModal
          accountId={holdingsModalAccount.id}
          accountLabel={[holdingsModalAccount.advisor, holdingsModalAccount.partial_account_number ?? holdingsModalAccount.synthetic_id.slice(0, 8) + '…'].filter(Boolean).join(' — ')}
          priorDate={data.prior_date ? String(data.prior_date) : null}
          currentDate={data.current_date ? String(data.current_date) : null}
          onClose={() => setHoldingsModalAccount(null)}
        />
      )}

      {data.new_accounts.length === 0 &&
        data.removed_accounts.length === 0 &&
        data.material_value_changes.length === 0 &&
        data.new_advisers.length === 0 &&
        data.removed_advisers.length === 0 &&
        data.adviser_account_changes.length === 0 &&
        data.accounts_with_holdings_changes.length === 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <p className="text-sm text-gray-600">No material changes detected between prior and current upload.</p>
          </div>
        )}
    </div>
  );
};

export default UploadChanges;
