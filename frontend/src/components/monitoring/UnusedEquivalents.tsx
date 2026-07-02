import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';
import { monitoringAccountPath } from '../../utils/monitoringNav';

type EquivalentUsageRow = {
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
};

type AccountUsageRow = {
  account_id: string;
  partial_account_number: string | null;
  adviser: string | null;
  strategy_name: string | null;
  registration_type: string | null;
  value: number;
  pct_of_equivalent_total: number;
};

type UnusedEquivalentsProps = {
  asOfDate?: string | null;
  refreshTrigger?: string | null;
};

type UnmappedTickerRow = {
  ticker: string;
  total_value: number;
  account_count: number;
  strategy_names: string[];
};

const UnusedEquivalents = ({ asOfDate, refreshTrigger }: UnusedEquivalentsProps) => {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<EquivalentUsageRow[]>([]);
  const [unmappedTickers, setUnmappedTickers] = useState<UnmappedTickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalEquivalent, setModalEquivalent] = useState<EquivalentUsageRow | null>(null);
  const [modalUnmappedTicker, setModalUnmappedTicker] = useState<UnmappedTickerRow | null>(null);
  const [modalAccounts, setModalAccounts] = useState<AccountUsageRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = asOfDate ? { as_of_date: asOfDate } : {};
      const [equivRes, unmappedRes] = await Promise.all([
        monitoringAPI.equivalentsUsage({ ...params, limit: 1000, offset: 0 }),
        monitoringAPI.unmappedTickers({ ...params, limit: 1000, offset: 0 }),
      ]);
      setRows(equivRes.data ?? []);
      setUnmappedTickers((unmappedRes.data ?? []).map((u: any) => ({
        ticker: u.ticker,
        total_value: Number(u.total_value),
        account_count: u.account_count ?? 0,
        strategy_names: u.strategy_names ?? [],
      })));
    } catch (err) {
      console.error('Failed to load equivalents usage:', err);
      setRows([]);
      setUnmappedTickers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [asOfDate, refreshTrigger ?? '']);

  const openAccountModal = async (equiv: EquivalentUsageRow) => {
    setModalEquivalent(equiv);
    setModalUnmappedTicker(null);
    setModalLoading(true);
    setModalAccounts([]);
    try {
      const params = asOfDate ? { as_of_date: asOfDate } : undefined;
      const res = await monitoringAPI.equivalentAccounts(equiv.id, params);
      setModalAccounts(res.data ?? []);
    } catch (err) {
      console.error('Failed to load equivalent accounts:', err);
      setModalAccounts([]);
    } finally {
      setModalLoading(false);
    }
  };

  const openUnmappedTickerModal = async (u: UnmappedTickerRow) => {
    setModalUnmappedTicker(u);
    setModalEquivalent(null);
    setModalLoading(true);
    setModalAccounts([]);
    try {
      const params = asOfDate ? { as_of_date: asOfDate } : undefined;
      const res = await monitoringAPI.unmappedTickerAccounts(u.ticker, params);
      setModalAccounts(res.data ?? []);
    } catch (err) {
      console.error('Failed to load unmapped ticker accounts:', err);
      setModalAccounts([]);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalEquivalent(null);
    setModalUnmappedTicker(null);
    setModalAccounts([]);
  };

  const formatDollars = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatPct = (v: number) => `${Number(v).toFixed(2)}%`;
  const accountReturnParams = new URLSearchParams(searchParams);
  accountReturnParams.set('tab', 'unusedequivalents');
  if (asOfDate) accountReturnParams.set('as_of_date', asOfDate);

  const unusedRows = rows.filter((r) => r.is_unused);

  return (
    <div className="space-y-6">
      {/* Unmapped tickers: in accounts but not in model or equivalent file */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Tickers Not in Model or Equivalents</h3>
        <p className="text-sm text-gray-500 mb-4">
          Tickers held in accounts that are not in any strategy model or product equivalents file across the system. Click the account count to see which accounts hold each ticker.
        </p>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : unmappedTickers.length === 0 ? (
          <p className="text-sm text-gray-500">No unmapped tickers.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Accounts</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Strategies</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unmappedTickers.map((u) => (
                  <tr key={u.ticker}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{u.ticker}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(u.total_value)}</td>
                    <td className="px-4 py-2 text-sm text-right">
                      {u.account_count > 0 ? (
                        <button
                          onClick={() => openUnmappedTickerModal(u)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium underline"
                        >
                          {u.account_count}
                        </button>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{u.strategy_names.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Equivalents Usage</h3>
          <button
            onClick={load}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Refresh
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          All product equivalents with upload info, total assets, and account count. Click the account count to see which accounts hold each equivalent.
          &quot;Retirement Only&quot; indicates equivalents used exclusively by Retirement accounts.
        </p>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">No product equivalents configured.</p>
        ) : (
          <>
            {unusedRows.length > 0 && (
              <div className="mb-8">
                <h4 className="text-sm font-medium text-amber-800 mb-2">
                  Unused Equivalents ({unusedRows.length})
                </h4>
                <p className="text-xs text-gray-500 mb-3">
                  Configured but have no holdings in the selected snapshot. Candidates for removal.
                </p>
                <div className="overflow-x-auto border border-amber-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-amber-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Ticker</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Alternate</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Buy Control</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Sell Control</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Custodian</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Grade</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Strategy</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {unusedRows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.model_ticker}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.legacy_ticker}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{row.buy_control ?? '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{row.sell_control ?? '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{row.custodian ?? '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{row.grade ?? '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{row.strategy_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">All Equivalents with Usage</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Alternate</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Buy Control</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sell Control</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Custodian</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Retirement Only</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Accounts</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rows.map((row) => (
                      <tr key={row.id} className={row.retirement_only ? 'bg-amber-50' : undefined}>
                        <td className="px-4 py-2 text-sm text-gray-900">{row.model_ticker}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{row.legacy_ticker}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{row.buy_control ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{row.sell_control ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{row.custodian ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 max-w-[120px] truncate" title={row.notes ?? ''}>{row.notes ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 max-w-[180px] truncate" title={row.description ?? ''}>{row.description ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{row.grade ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{row.strategy_name}</td>
                        <td className="px-4 py-2 text-sm">
                          {row.retirement_only ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800" title="All accounts using this equivalent are Retirement">
                              Yes
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.total_value)}</td>
                        <td className="px-4 py-2 text-sm text-right">
                          {row.account_count > 0 ? (
                            <button
                              onClick={() => openAccountModal(row)}
                              className="text-indigo-600 hover:text-indigo-800 font-medium underline"
                            >
                              {row.account_count}
                            </button>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Account drill-down modal */}
      {(modalEquivalent || modalUnmappedTicker) && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={closeModal} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-6">
                {modalEquivalent ? (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Accounts holding {modalEquivalent.legacy_ticker} ({modalEquivalent.model_ticker})
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      {modalEquivalent.strategy_name} · Total: ${formatDollars(modalEquivalent.total_value)}
                    </p>
                  </>
                ) : modalUnmappedTicker ? (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Accounts holding {modalUnmappedTicker.ticker}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Not in model or equivalents · Total: ${formatDollars(modalUnmappedTicker.total_value)}
                    </p>
                  </>
                ) : null}
                {modalLoading ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : modalAccounts.length === 0 ? (
                  <p className="text-sm text-gray-500">No accounts.</p>
                ) : (
                  <div className="overflow-y-auto max-h-[60vh]">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Partial Account</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Adviser</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Registration</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">% of Total</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {modalAccounts.map((a) => (
                          <tr key={a.account_id}>
                            <td className="px-4 py-2 text-sm text-gray-900">{a.partial_account_number ?? '—'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700">{a.adviser ?? '—'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700">{a.strategy_name ?? '—'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700">
                              {a.registration_type ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                                  {a.registration_type}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(a.value)}</td>
                            <td className="px-4 py-2 text-sm text-right text-gray-700">{formatPct(a.pct_of_equivalent_total)}</td>
                            <td className="px-4 py-2 text-sm text-right">
                              <Link
                                to={monitoringAccountPath(a.account_id, accountReturnParams)}
                                className="text-indigo-600 hover:text-indigo-800 font-medium"
                                onClick={closeModal}
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="bg-gray-50 px-6 py-3 flex justify-end">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnusedEquivalents;
