import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';

type ConcentrationAccountItem = {
  account_id: string;
  adviser: string | null;
  partial_account_number: string | null;
  value: number;
  pct_of_total: number;
};

const ConcentrationAccountList = () => {
  const { ticker, grade } = useParams<{ ticker: string; grade: string }>();
  const [searchParams] = useSearchParams();
  const asOfDate = searchParams.get('as_of_date') || undefined;
  const [accounts, setAccounts] = useState<ConcentrationAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker || !grade) return;
    const gradeNum = parseInt(grade, 10);
    if (Number.isNaN(gradeNum) || (gradeNum !== 1 && gradeNum !== 2)) {
      setError('Invalid grade');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    monitoringAPI
      .concentrationReportAccounts(ticker, gradeNum, asOfDate ? { as_of_date: asOfDate } : undefined)
      .then((res) => setAccounts(res.data || []))
      .catch((err) => {
        console.error('Failed to load concentration accounts:', err);
        setError(err.response?.data?.detail || 'Failed to load accounts');
        setAccounts([]);
      })
      .finally(() => setLoading(false));
  }, [ticker, grade, asOfDate]);

  const formatDollars = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  if (!ticker || !grade) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-sm text-gray-500">Missing ticker or grade.</p>
        <Link to="/monitoring" className="mt-2 inline-block text-indigo-600 hover:text-indigo-800 text-sm font-medium">
          ← Back to Monitoring
        </Link>
      </div>
    );
  }

  const gradeNum = parseInt(grade, 10);
  const decodedTicker = decodeURIComponent(ticker);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link
          to="/monitoring"
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          ← Back to Monitoring
        </Link>
      </div>
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Accounts holding {decodedTicker} (Grade {gradeNum})
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Accounts with this holding in the concentration report snapshot.
        </p>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-500">No accounts hold this ticker at this grade for the selected date.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Adviser</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Partial account number</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">% of total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {accounts.map((row) => (
                  <tr key={row.account_id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{row.adviser ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{row.partial_account_number ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.value)}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-700">{Number(row.pct_of_total).toFixed(2)}%</td>
                    <td className="px-4 py-2 text-sm text-right">
                      <Link
                        to={`/monitoring/account/${row.account_id}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        View account
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConcentrationAccountList;
