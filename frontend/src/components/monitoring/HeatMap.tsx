import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';
import { formatIsoDate } from '../../utils/formatIsoDate';
import { monitoringAccountPath } from '../../utils/monitoringNav';

type Account = {
  id: string;
  synthetic_id: string;
  friendly_name: string | null;
  strategy_name: string | null;
  total_value: number | null;
  total_deviation_score: number | null;
  purity_score: number | null;
  cash_pct: number | null;
  as_of_date: string | null;
};

type HeatMapProps = {
  asOfDate?: string | null;
  /** When this changes (e.g. after a new file ingest), heat map data is refetched. */
  refreshTrigger?: string | null;
};

const HeatMap = ({ asOfDate, refreshTrigger }: HeatMapProps) => {
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'deviation' | 'value' | 'purity' | 'cash'>('deviation');
  const [sortDesc, setSortDesc] = useState(true);
  const [lastIngestAt, setLastIngestAt] = useState<string | null>(null);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      // Load accounts; lastIngest is optional (404 if backend not yet deployed with ingest-runs)
      const [accountsRes, lastRes] = await Promise.allSettled([
        monitoringAPI.listAccounts({ mapped_only: true, ...(asOfDate ? { as_of_date: asOfDate } : {}) }),
        monitoringAPI.lastIngest(),
      ]);
      if (accountsRes.status === 'fulfilled') {
        setAccounts(accountsRes.value.data);
      } else {
        console.error('Failed to load monitored accounts:', accountsRes.reason);
        setAccounts([]);
      }
      if (lastRes.status === 'fulfilled') {
        setLastIngestAt(lastRes.value.data.last_ingest_at ?? null);
      } else {
        setLastIngestAt(null); // e.g. 404 when /api/monitoring/last-ingest not deployed yet
      }
    } catch (err) {
      console.error('Failed to load monitored accounts:', err);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [asOfDate ?? '', refreshTrigger ?? '']);

  const sorted = [...accounts].sort((a, b) => {
    let va: number, vb: number;
    if (sortBy === 'deviation') {
      va = a.total_deviation_score ?? 0;
      vb = b.total_deviation_score ?? 0;
    } else if (sortBy === 'value') {
      va = a.total_value ?? 0;
      vb = b.total_value ?? 0;
    } else if (sortBy === 'purity') {
      va = a.purity_score ?? 0;
      vb = b.purity_score ?? 0;
    } else {
      va = a.cash_pct ?? 0;
      vb = b.cash_pct ?? 0;
    }
    return sortDesc ? vb - va : va - vb;
  });

  const formatDollars = (v: number | null) =>
    v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
  const formatPct = (v: number | null) =>
    v != null ? `${Number(v).toFixed(2)}%` : '—';

  const accountReturnParams = new URLSearchParams(searchParams);
  accountReturnParams.set('tab', 'heatmap');
  if (asOfDate) accountReturnParams.set('as_of_date', asOfDate);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Heat Map</h3>
        <button
          onClick={loadAccounts}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Refresh
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Mapped accounts only, ranked by deviation. Click View to drill down.
        {lastIngestAt && (
          <span className="block mt-1 text-gray-400">
            Data from last ingest: {new Date(lastIngestAt).toLocaleString('en-US')}
          </span>
        )}
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Friendly Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  <button
                    onClick={() => {
                      setSortBy('value');
                      setSortDesc(sortBy === 'value' ? !sortDesc : true);
                    }}
                    className="hover:text-indigo-600"
                  >
                    Total Value {sortBy === 'value' ? (sortDesc ? '↓' : '↑') : ''}
                  </button>
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  <button
                    onClick={() => {
                      setSortBy('deviation');
                      setSortDesc(sortBy === 'deviation' ? !sortDesc : true);
                    }}
                    className="hover:text-indigo-600"
                  >
                    Deviation Score {sortBy === 'deviation' ? (sortDesc ? '↓' : '↑') : ''}
                  </button>
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  <button
                    onClick={() => {
                      setSortBy('purity');
                      setSortDesc(sortBy === 'purity' ? !sortDesc : false);
                    }}
                    className="hover:text-indigo-600"
                  >
                    Purity % {sortBy === 'purity' ? (sortDesc ? '↓' : '↑') : ''}
                  </button>
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  <button
                    onClick={() => {
                      setSortBy('cash');
                      setSortDesc(sortBy === 'cash' ? !sortDesc : true);
                    }}
                    className="hover:text-indigo-600"
                  >
                    Cash % {sortBy === 'cash' ? (sortDesc ? '↓' : '↑') : ''}
                  </button>
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">As Of Date</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {a.friendly_name || a.synthetic_id.slice(0, 8) + '…'}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">{a.strategy_name ?? '—'}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(a.total_value)}</td>
                  <td className="px-4 py-2 text-sm text-right font-medium">{formatPct(a.total_deviation_score)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatPct(a.purity_score)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-700">{formatPct(a.cash_pct)}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{formatIsoDate(a.as_of_date)}</td>
                  <td className="px-4 py-2 text-sm text-right">
                    <Link
                      to={monitoringAccountPath(a.id, accountReturnParams)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
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
      {!loading && accounts.length === 0 && (
        <p className="text-sm text-gray-500 mt-4">No monitored accounts. Upload an aggregated holdings CSV to ingest.</p>
      )}
    </div>
  );
};

export default HeatMap;
