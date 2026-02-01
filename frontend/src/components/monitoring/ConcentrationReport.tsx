import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';

type ConcentrationItem = {
  ticker: string;
  grade: number;
  total_value: number;
  account_count: number;
  asset_class: string | null;
};

type TopOffenderItem = {
  account_id: string;
  friendly_name: string | null;
  synthetic_id: string;
  strategy_name: string | null;
  total_grade2_value: number;
  as_of_date: string | null;
};

type UnmappedItem = {
  ticker: string;
  total_value: number;
  strategy_names: string[];
};

const ConcentrationReport = () => {
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const [concentration, setConcentration] = useState<ConcentrationItem[]>([]);
  const [topOffenders, setTopOffenders] = useState<TopOffenderItem[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = asOfDate ? { as_of_date: asOfDate } : undefined;
      const [concRes, offRes, unmRes] = await Promise.all([
        monitoringAPI.concentrationReport(params),
        monitoringAPI.topOffenders(params),
        monitoringAPI.unmappedTickers(params),
      ]);
      setConcentration(concRes.data || []);
      setTopOffenders(offRes.data || []);
      setUnmapped(unmRes.data || []);
    } catch (err) {
      console.error('Failed to load concentration data:', err);
      setConcentration([]);
      setTopOffenders([]);
      setUnmapped([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [asOfDate]);

  const formatDollars = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-US') : '—');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Total exposure to non-model assets (Grade 1 & 2). Use latest snapshot or pick a date.
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">As of date:</label>
          <input
            type="date"
            value={asOfDate ?? ''}
            onChange={(e) => setAsOfDate(e.target.value || null)}
            className="rounded-md border-gray-300 shadow-sm text-sm"
          />
          <button
            onClick={load}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {/* Concentration Report */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Concentration Report</h3>
            <p className="text-sm text-gray-500 mb-4">
              Every Grade 1 and Grade 2 ticker in the latest snapshot with total dollar amount held across all advisors.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Grade</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Asset Class</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Account Count</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {concentration.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm text-gray-500">
                        No Grade 1 or Grade 2 holdings in snapshot.
                      </td>
                    </tr>
                  ) : (
                    concentration.map((row) => (
                      <tr key={`${row.ticker}-${row.grade}`}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.ticker}</td>
                        <td className="px-4 py-2 text-sm text-center text-gray-700">{row.grade}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{row.asset_class ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.total_value)}</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          <Link
                            to={`/monitoring/concentration/accounts/${encodeURIComponent(row.ticker)}/${row.grade}${asOfDate ? `?as_of_date=${asOfDate}` : ''}`}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {row.account_count}
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Offenders List */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Top Offenders List</h3>
            <p className="text-sm text-gray-500 mb-4">
              Accounts holding the highest dollar volume of Grade 2 assets — lowest hanging fruit for model transition.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Grade 2 Value</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">As Of Date</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topOffenders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm text-gray-500">
                        No accounts with Grade 2 holdings.
                      </td>
                    </tr>
                  ) : (
                    topOffenders.map((row) => (
                      <tr key={row.account_id}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {row.friendly_name || row.synthetic_id.slice(0, 8) + '…'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">{row.strategy_name ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">
                          ${formatDollars(row.total_grade2_value)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">{formatDate(row.as_of_date)}</td>
                        <td className="px-4 py-2 text-sm text-right">
                          <Link
                            to={`/monitoring/account/${row.account_id}`}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unmapped Ticker Alert */}
          <div className="bg-white shadow rounded-lg p-6 border-l-4 border-amber-400">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Unmapped Ticker Alert</h3>
            <p className="text-sm text-gray-500 mb-4">
              Tickers in the vendor file that are not in your product equivalents library. Add them in Admin → Product Equivalents for the relevant strategy to assign asset class.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Strategies (unmapped)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {unmapped.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-sm text-gray-500">
                        No unmapped tickers in snapshot.
                      </td>
                    </tr>
                  ) : (
                    unmapped.map((row) => (
                      <tr key={row.ticker}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.ticker}</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-700">${formatDollars(row.total_value)}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {row.strategy_names.length ? row.strategy_names.join(', ') : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {unmapped.length > 0 && (
              <p className="mt-3 text-sm text-amber-700">
                To assign asset class: go to <strong>Admin → Product Equivalents</strong>, select the strategy, and add each ticker with a model ticker and grade.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ConcentrationReport;
