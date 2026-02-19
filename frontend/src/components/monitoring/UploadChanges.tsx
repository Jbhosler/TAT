import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';

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
};

type UploadChangesProps = {
  refreshTrigger?: string | null;
};

const UploadChanges = ({ refreshTrigger }: UploadChangesProps) => {
  const [data, setData] = useState<IngestChanges | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await monitoringAPI.ingestChanges();
      setData(res.data);
    } catch (err) {
      console.error('Failed to load ingest changes:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshTrigger ?? '']);

  const formatDollars = (v: number | null) =>
    v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
  const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-US') : '—');
  const formatPct = (v: number | null) => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—');

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!data || !data.has_prior) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Changes</h3>
        <p className="text-sm text-gray-500">
          No prior upload to compare. Ingest at least two different aggregated holdings files (with different as-of dates) to see changes.
        </p>
        <button
          onClick={load}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Refresh
        </button>
      </div>
    );
  }

  const AccountTable = ({ rows, showPrior, showCurrent, showChange }: {
    rows: AccountChangeItem[];
    showPrior?: boolean;
    showCurrent?: boolean;
    showChange?: boolean;
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
              <Link to={`/monitoring/account/${r.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                View
              </Link>
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
          Comparing <strong>{formatDate(data.prior_date)}</strong> (prior) vs <strong>{formatDate(data.current_date)}</strong> (current).
        </p>
        <button onClick={load} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          Refresh
        </button>
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
            <AccountTable rows={data.accounts_with_holdings_changes} showPrior showCurrent />
          </div>
        </div>
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
