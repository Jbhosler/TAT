import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';

type ModelSummary = {
  model_name: string;
  total_value: number;
  account_count: number;
};

type AccountRow = {
  id: string;
  advisor: string | null;
  partial_account_number: string | null;
  model_name: string | null;
  total_value: number;
  has_equivalents: boolean;
};

type TotalFirmProps = {
  refreshTrigger?: string | null;
};

const TotalFirm = ({ refreshTrigger }: TotalFirmProps) => {
  const [summaryByModel, setSummaryByModel] = useState<ModelSummary[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await monitoringAPI.totalFirm();
      setSummaryByModel(res.data.summary_by_model ?? []);
      setAccounts(res.data.accounts ?? []);
    } catch (err) {
      console.error('Failed to load Total Firm data:', err);
      setSummaryByModel([]);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshTrigger ?? '']);

  const formatDollars = (v: number) => {
    const n = Number(v);
    if (Number.isNaN(n)) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const totalValueAllStrategies = summaryByModel.reduce(
    (sum, row) => sum + (Number(row.total_value) || 0),
    0
  );

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Total Firm</h3>
        <button
          onClick={load}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Refresh
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        All ingested accounts with summary by model. Table shows Advisor, partial account number, Model, value, and whether the account has equivalents (Grade 1/2).
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {/* Summary by Model */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-3">
              <h4 className="text-sm font-medium text-gray-700">Summary by Model</h4>
              <span className="text-sm font-semibold text-gray-900">
                Total value across all strategies: ${formatDollars(totalValueAllStrategies)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Accounts</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {summaryByModel.map((row) => (
                    <tr key={row.model_name}>
                      <td className="px-4 py-2 text-sm text-gray-900">{row.model_name}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.total_value)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">{row.account_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summaryByModel.length === 0 && (
              <p className="text-sm text-gray-500 py-2">No model summary. Ingest a CSV to see data.</p>
            )}
          </div>

          {/* Accounts table */}
          <h4 className="text-sm font-medium text-gray-700 mb-2">All Accounts</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Advisor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Partial Account #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Has Equivalents</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {accounts.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{row.advisor ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{row.partial_account_number ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{row.model_name ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.total_value)}</td>
                    <td className="px-4 py-2 text-sm text-center">
                      {row.has_equivalents ? (
                        <span className="text-green-600 font-medium" title="Has Grade 1 or 2 equivalents">✓</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">
                      <Link
                        to={`/monitoring/account/${row.id}`}
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
          {!loading && accounts.length === 0 && (
            <p className="text-sm text-gray-500 mt-4">No accounts. Upload an aggregated holdings CSV to ingest.</p>
          )}
        </>
      )}
    </div>
  );
};

export default TotalFirm;
