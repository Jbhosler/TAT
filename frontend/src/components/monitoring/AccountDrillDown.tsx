import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { monitoringAPI, prospectsAPI } from '../../services/api';

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
    registration_type?: string | null;
  } | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotWithBreakdown[]>([]);
  const [friendlyName, setFriendlyName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [registrationType, setRegistrationType] = useState<string>('');
  const [editingRegistrationType, setEditingRegistrationType] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingRegistrationType, setSavingRegistrationType] = useState(false);
  const [linkedProspects, setLinkedProspects] = useState<Array<{ id: string; name: string; has_document: boolean }>>([]);

  const loadAccount = async () => {
    if (!id) return;
    try {
      const res = await monitoringAPI.getAccount(id);
      setAccount(res.data);
      setFriendlyName(res.data.friendly_name || '');
      setRegistrationType(res.data.registration_type || '');
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

  const loadLinkedProspects = async () => {
    if (!id) return;
    try {
      const res = await monitoringAPI.getLinkedProspects(id);
      setLinkedProspects(res.data || []);
    } catch {
      setLinkedProspects([]);
    }
  };

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([loadAccount(), loadSnapshots(), loadLinkedProspects()]).finally(() => setLoading(false));
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

  const handleSaveRegistrationType = async () => {
    if (!id) return;
    setSavingRegistrationType(true);
    try {
      const value = registrationType.trim() || null;
      await monitoringAPI.updateAccount(id, { registration_type: value });
      setEditingRegistrationType(false);
      loadAccount();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update registration type');
    } finally {
      setSavingRegistrationType(false);
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
        {(account.firm || account.advisor || account.account_display || account.registration_type) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 mb-4">
            {account.firm && <span><span className="font-medium text-gray-700">Firm:</span> {account.firm}</span>}
            {account.advisor && <span><span className="font-medium text-gray-700">Advisor:</span> {account.advisor}</span>}
            {account.account_display && <span><span className="font-medium text-gray-700">Account:</span> {account.account_display}</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-6 mb-4">
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
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Registration type:</span>
            {editingRegistrationType ? (
              <>
                <select
                  value={registrationType}
                  onChange={(e) => setRegistrationType(e.target.value)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="">NA</option>
                  <option value="Taxable">Taxable</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Trust">Trust</option>
                </select>
                <button
                  onClick={handleSaveRegistrationType}
                  disabled={savingRegistrationType}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditingRegistrationType(false); setRegistrationType(account.registration_type || ''); }}
                  className="px-3 py-1.5 border border-gray-300 text-sm rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  account.registration_type
                    ? account.registration_type.toLowerCase() === 'taxable'
                      ? 'bg-green-100 text-green-800'
                      : account.registration_type.toLowerCase() === 'retirement'
                        ? 'bg-amber-100 text-amber-800'
                        : account.registration_type.toLowerCase() === 'trust'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-gray-100 text-gray-800'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {account.registration_type || 'NA'}
                </span>
                <button
                  onClick={() => { setRegistrationType(account.registration_type || ''); setEditingRegistrationType(true); }}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
        {linkedProspects.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-700">Linked scenarios:</span>
            <ul className="mt-2 space-y-1">
              {linkedProspects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    to={`/prospect/${p.id}`}
                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {p.name}
                  </Link>
                  {p.has_document && (
                    <>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await prospectsAPI.getDocument(p.id);
                            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                            window.open(url, '_blank', 'noopener');
                          } catch {
                            alert('Could not load document.');
                          }
                        }}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        View document
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {snap && (
        <>
          {(snap.allocations || []).length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Actual vs Target (as of {new Date(snap.snapshot.as_of_date).toLocaleDateString('en-US')})</h3>
              <div className="space-y-3">
                {(snap.allocations || []).map((a) => (
                  <div key={a.asset_class} className="flex items-center gap-4">
                    <span className="w-40 text-sm font-medium text-gray-700">{a.asset_class}</span>
                    <div className="flex-1 flex gap-4 items-center">
                      <div className="flex-1 flex gap-2 items-center">
                        <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-l"
                            style={{ width: `${Math.min(100, Number(a.actual_pct))}%` }}
                            title={`Actual ${formatPct(a.actual_pct)}`}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12">Actual {formatPct(a.actual_pct)}</span>
                      </div>
                      <div className="flex-1 flex gap-2 items-center">
                        <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-indigo-200 rounded"
                            style={{ width: `${Math.min(100, Number(a.target_pct))}%` }}
                            title={`Target ${formatPct(a.target_pct)}`}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12">Target {formatPct(a.target_pct)}</span>
                      </div>
                    </div>
                    <span className={`text-sm w-16 ${Number(a.drift_pct) >= 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                      Drift {formatPct(a.drift_pct)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Left bar: actual %. Right bar: target %. Each scaled 0–100%.</p>
            </div>
          )}

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {(snap.allocations || []).length > 0 ? 'Holdings by asset class' : 'Holdings'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {(snap.allocations || []).length > 0
                ? `Holdings grouped by asset class with subtotals and model target comparison (as of ${new Date(snap.snapshot.as_of_date).toLocaleDateString('en-US')}).`
                : `Holdings with value and percentage (as of ${new Date(snap.snapshot.as_of_date).toLocaleDateString('en-US')}). This strategy is not yet mapped for target comparison.`}
            </p>
            {(() => {
              const holdings = snap.snapshot.holdings || [];
              const totalValue = Number(snap.snapshot.total_value) || 0;
              const isUnmapped = (snap.allocations || []).length === 0;

              if (holdings.length === 0) {
                return <p className="text-sm text-gray-500">No holdings in this snapshot.</p>;
              }

              if (isUnmapped) {
                return (
                  <>
                    <div className="mb-4">
                      <span className="text-sm font-medium text-gray-700">Total value: </span>
                      <span className="text-lg font-semibold text-gray-900">${formatDollars(totalValue)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Weight %</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {holdings.map((h, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2 text-sm text-gray-900">{h.ticker}</td>
                              <td className="px-4 py-2 text-sm text-right">${formatDollars(h.value)}</td>
                              <td className="px-4 py-2 text-sm text-right">
                                {h.weight_pct != null ? formatPct(h.weight_pct) : totalValue > 0 ? formatPct((Number(h.value) / totalValue) * 100) : '—'}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-medium">
                            <td className="px-4 py-2 text-sm text-gray-900">Total</td>
                            <td className="px-4 py-2 text-sm text-right">${formatDollars(totalValue)}</td>
                            <td className="px-4 py-2 text-sm text-right">100.00%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              }

              const allocationsByAc = new Map((snap.allocations || []).map((a) => [a.asset_class, a]));
              const byAssetClass = new Map<string, typeof holdings>();
              for (const h of holdings) {
                const ac = h.asset_class?.trim() || '—';
                if (!byAssetClass.has(ac)) byAssetClass.set(ac, []);
                byAssetClass.get(ac)!.push(h);
              }
              const allocationOrder = (snap.allocations || []).map((a) => a.asset_class);
              const otherAcs = [...byAssetClass.keys()].filter((ac) => !allocationOrder.includes(ac));
              const orderedAcs = [...allocationOrder.filter((ac) => byAssetClass.has(ac)), ...otherAcs];

              return (
                <div className="space-y-6">
                  {orderedAcs.map((assetClass) => {
                    const rows = byAssetClass.get(assetClass) || [];
                    const subtotalValue = rows.reduce((sum, h) => sum + Number(h.value), 0);
                    const actualPct = totalValue > 0 ? (subtotalValue / totalValue) * 100 : 0;
                    const allocation = allocationsByAc.get(assetClass);
                    const targetPct = allocation != null ? Number(allocation.target_pct) : null;
                    const driftPct = allocation != null ? Number(allocation.drift_pct) : null;

                    return (
                      <div key={assetClass} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                          <span className="text-sm font-semibold text-gray-800">{assetClass}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Weight %</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {rows.map((h, i) => (
                                <tr key={i}>
                                  <td className={`px-4 py-2 text-sm text-gray-900 ${h.grade === 0 ? 'font-bold' : ''}`}>{h.ticker}</td>
                                  <td className="px-4 py-2 text-sm text-right">${formatDollars(h.value)}</td>
                                  <td className="px-4 py-2 text-sm text-right">{h.weight_pct != null ? formatPct(h.weight_pct) : '—'}</td>
                                  <td className="px-4 py-2 text-sm">{h.grade != null ? h.grade : '—'}</td>
                                </tr>
                              ))}
                              <tr className="bg-gray-50 font-medium">
                                <td className="px-4 py-2 text-sm text-gray-900">Subtotal</td>
                                <td className="px-4 py-2 text-sm text-right">${formatDollars(subtotalValue)}</td>
                                <td className="px-4 py-2 text-sm text-right">{formatPct(actualPct)}</td>
                                <td className="px-4 py-2 text-sm">—</td>
                              </tr>
                              {(targetPct != null || driftPct != null) && (
                                <tr className="bg-indigo-50/50 border-t-2 border-indigo-100">
                                  <td colSpan={2} className="px-4 py-2 text-xs text-gray-600">
                                    Model target: {targetPct != null ? formatPct(targetPct) : '—'}
                                    {driftPct != null && (
                                      <span className={`ml-3 ${driftPct >= 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                                        Drift {formatPct(driftPct)}
                                      </span>
                                    )}
                                  </td>
                                  <td colSpan={2} className="px-4 py-2 text-xs text-gray-500">
                                    Actual {formatPct(actualPct)} vs target {targetPct != null ? formatPct(targetPct) : '—'}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
