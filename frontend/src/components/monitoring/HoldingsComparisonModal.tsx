import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';
import { formatIsoDate } from '../../utils/formatIsoDate';
import { monitoringAccountPath } from '../../utils/monitoringNav';

type Holding = {
  ticker: string;
  asset_class: string | null;
  value: number;
  weight_pct: number | null;
  grade: number | null;
};

type SnapshotWithBreakdown = {
  snapshot: {
    id: string;
    as_of_date: string;
    total_value: number;
    holdings: Holding[];
  };
};

type HoldingsComparisonModalProps = {
  accountId: string;
  accountLabel: string;
  priorDate: string | null;
  currentDate: string | null;
  onClose: () => void;
};

const HoldingsComparisonModal = ({
  accountId,
  accountLabel,
  priorDate,
  currentDate,
  onClose,
}: HoldingsComparisonModalProps) => {
  const [priorSnapshots, setPriorSnapshots] = useState<SnapshotWithBreakdown[]>([]);
  const [currentSnapshots, setCurrentSnapshots] = useState<SnapshotWithBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [priorRes, currentRes] = await Promise.all([
          priorDate ? monitoringAPI.getAccountSnapshots(accountId, { as_of_date: priorDate }) : Promise.resolve({ data: [] }),
          currentDate ? monitoringAPI.getAccountSnapshots(accountId, { as_of_date: currentDate }) : Promise.resolve({ data: [] }),
        ]);
        setPriorSnapshots(priorRes.data || []);
        setCurrentSnapshots(currentRes.data || []);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load holdings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accountId, priorDate, currentDate]);

  const formatDollars = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatPct = (v: number | null) => (v != null ? `${Number(v).toFixed(2)}%` : '—');

  const priorHoldings = priorSnapshots[0]?.snapshot?.holdings ?? [];
  const currentHoldings = currentSnapshots[0]?.snapshot?.holdings ?? [];
  const priorTotal = priorSnapshots[0]?.snapshot?.total_value ?? 0;
  const currentTotal = currentSnapshots[0]?.snapshot?.total_value ?? 0;

  const priorByTicker = new Map(priorHoldings.map((h) => [h.ticker.toUpperCase(), h]));
  const currentByTicker = new Map(currentHoldings.map((h) => [h.ticker.toUpperCase(), h]));
  const allTickers = new Set([...priorByTicker.keys(), ...currentByTicker.keys()]);
  const sortedTickers = [...allTickers].sort();

  const getChangeType = (ticker: string): 'added' | 'removed' | 'unchanged' | 'changed' => {
    const prior = priorByTicker.get(ticker);
    const current = currentByTicker.get(ticker);
    if (!prior) return 'added';
    if (!current) return 'removed';
    if (Number(prior.value) !== Number(current.value)) return 'changed';
    return 'unchanged';
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Holdings Comparison — {accountLabel}</h2>
          </div>
          <div className="p-6 flex-1 overflow-auto">
            <p className="text-sm text-gray-500">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Holdings Comparison — {accountLabel}</h2>
          </div>
          <div className="p-6 flex-1 overflow-auto">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Holdings Comparison — {accountLabel}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-1">Prior ({formatIsoDate(priorDate)})</h3>
              <p className="text-lg font-bold text-amber-900">${formatDollars(priorTotal)}</p>
              <p className="text-xs text-amber-700">{priorHoldings.length} holdings</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-green-800 mb-1">Current ({formatIsoDate(currentDate)})</h3>
              <p className="text-lg font-bold text-green-900">${formatDollars(currentTotal)}</p>
              <p className="text-xs text-green-700">{currentHoldings.length} holdings</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prior Value</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prior %</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Current Value</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Current %</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Change</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedTickers.map((ticker) => {
                  const prior = priorByTicker.get(ticker);
                  const current = currentByTicker.get(ticker);
                  const changeType = getChangeType(ticker);
                  const priorVal = prior ? Number(prior.value) : 0;
                  const currentVal = current ? Number(current.value) : 0;
                  const priorPct = priorTotal > 0 ? (priorVal / priorTotal) * 100 : null;
                  const currentPct = currentTotal > 0 ? (currentVal / currentTotal) * 100 : null;

                  let changeBadge = null;
                  if (changeType === 'added') {
                    changeBadge = <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800">Added</span>;
                  } else if (changeType === 'removed') {
                    changeBadge = <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800">Removed</span>;
                  } else if (changeType === 'changed') {
                    changeBadge = <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">Changed</span>;
                  }

                  return (
                    <tr
                      key={ticker}
                      className={
                        changeType === 'added'
                          ? 'bg-green-50/50'
                          : changeType === 'removed'
                            ? 'bg-red-50/50'
                            : changeType === 'changed'
                              ? 'bg-amber-50/50'
                              : ''
                      }
                    >
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{ticker}</td>
                      <td className="px-4 py-2 text-sm text-right">
                        {prior ? `$${formatDollars(priorVal)}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {priorPct != null ? formatPct(priorPct) : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {current ? `$${formatDollars(currentVal)}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {currentPct != null ? formatPct(currentPct) : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-center">{changeBadge}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            <Link
              to={monitoringAccountPath(
                accountId,
                new URLSearchParams({
                  tab: 'uploadchanges',
                  ...(currentDate ? { as_of_date: currentDate, current_as_of_date: currentDate } : {}),
                  ...(priorDate ? { prior_as_of_date: priorDate } : {}),
                })
              )}
              className="text-indigo-600 hover:text-indigo-800"
              onClick={onClose}
            >
              View full account page →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default HoldingsComparisonModal;
