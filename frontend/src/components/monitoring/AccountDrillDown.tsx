import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';

type SnapshotWithBreakdown = {
  snapshot: {
    id: string;
    as_of_date: string;
    total_value: number;
    total_deviation_score: number;
    purity_score: number;
    holdings: Array<{
      ticker: string;
      asset_class: string | null;
      value: number;
      weight_pct: number | null;
      grade: number | null;
    }>;
  };
  allocations: Array<{
    asset_class: string;
    actual_pct: number;
    target_pct: number;
    drift_pct: number;
  }>;
};

const AccountDrillDown = () => {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<{
    id: string;
    synthetic_id: string;
    friendly_name: string | null;
    firm?: string | null;
    advisor?: string | null;
    account_display?: string | null;
  } | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotWithBreakdown[]>([]);
  const [friendlyName, setFriendlyName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);

  const loadAccount = async () => {
    if (!id) return;
    try {
      const res = await monitoringAPI.getAccount(id);
      setAccount(res.data);
      setFriendlyName(res.data.friendly_name || '');
    } catch (err) {
      console.error('Failed to load account:', err);
      setAccount(null);
    }
  };

  const loadSnapshots = async () => {
    if (!id) return;
    try {
      const res = await monitoringAPI.getAccountSnapshots(id);
      setSnapshots(res.data);
    } catch (err) {
      console.error('Failed to load snapshots:', err);
      setSnapshots([]);
    }
  };

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([loadAccount(), loadSnapshots()]).finally(() => setLoading(false));
  }, [id]);

  const handleSaveFriendlyName = async () => {
    if (!id) return;
    setSavingName(true);
    try {
      await monitoringAPI.updateAccount(id, { friendly_name: friendlyName.trim() || undefined });
      setEditingName(false);
      loadAccount();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const formatDollars = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatPct = (v: number) => `${Number(v).toFixed(2)}%`;

  if (!id) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-500">No account selected.</p>
        <Link to="/monitoring" className="text-indigo-600 hover:text-indigo-800 mt-2 inline-block">Back to Monitoring</Link>
      </div>
    );
  }

  if (loading || !account) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  const snap = snapshots[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/monitoring" className="text-sm text-indigo-600 hover:text-indigo-800">← Back to Monitoring</Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          {account.friendly_name || 'Account'} {account.account_display && <span className="text-gray-600 font-normal">({account.account_display})</span>}
        </h3>
        {(account.firm || account.advisor || account.account_display) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 mb-4">
            {account.firm && <span><span className="font-medium text-gray-700">Firm:</span> {account.firm}</span>}
            {account.advisor && <span><span className="font-medium text-gray-700">Advisor:</span> {account.advisor}</span>}
            {account.account_display && <span><span className="font-medium text-gray-700">Account:</span> {account.account_display}</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Friendly name:</span>
          {editingName ? (
            <>
              <input
                type="text"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="e.g. Smith Family Trust"
                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
              <button
                onClick={handleSaveFriendlyName}
                disabled={savingName}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => { setEditingName(false); setFriendlyName(account.friendly_name || ''); }}
                className="px-3 py-1.5 border border-gray-300 text-sm rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-gray-900">{account.friendly_name || '—'}</span>
              <button
                onClick={() => setEditingName(true)}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      {snap && (
        <>
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Actual vs Target (as of {new Date(snap.snapshot.as_of_date).toLocaleDateString('en-US')})</h3>
            <div className="space-y-3">
              {(snap.allocations || []).map((a) => (
                <div key={a.asset_class} className="flex items-center gap-4">
                  <span className="w-40 text-sm font-medium text-gray-700">{a.asset_class}</span>
                  <div className="flex-1 flex gap-2 items-center">
                    <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden flex">
                      <div
                        className="bg-amber-400"
                        style={{ width: `${Math.min(100, Number(a.actual_pct))}%` }}
                        title={`Actual ${formatPct(a.actual_pct)}`}
                      />
                      <div
                        className="bg-indigo-200 border-l border-indigo-400"
                        style={{ width: `${Math.min(100, Number(a.target_pct))}%` }}
                        title={`Target ${formatPct(a.target_pct)}`}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-24">
                      Actual {formatPct(a.actual_pct)} / Target {formatPct(a.target_pct)}
                    </span>
                  </div>
                  <span className={`text-sm w-16 ${Number(a.drift_pct) >= 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                    Drift {formatPct(a.drift_pct)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Bar: amber = actual %, indigo = target %</p>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Holdings</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Asset Class</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Weight %</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(snap.snapshot.holdings || []).map((h, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-sm text-gray-900">{h.ticker}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{h.asset_class ?? '—'}</td>
                      <td className="px-4 py-2 text-sm text-right">${formatDollars(h.value)}</td>
                      <td className="px-4 py-2 text-sm text-right">{h.weight_pct != null ? formatPct(h.weight_pct) : '—'}</td>
                      <td className="px-4 py-2 text-sm">{h.grade != null ? h.grade : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!snap && snapshots.length === 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-gray-500">No snapshot data for this account.</p>
        </div>
      )}
    </div>
  );
};

export default AccountDrillDown;
