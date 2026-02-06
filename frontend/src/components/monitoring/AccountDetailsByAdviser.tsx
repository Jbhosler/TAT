import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';

type AccountRow = {
  account_id: string;
  partial_account_number: string | null;
  account_value: number;
  legacy_ticker: string;
  model_ticker: string;
};

type LegacyTotalRow = {
  legacy_ticker: string;
  total_value: number;
  account_count: number;
};

type AccountDetailsByAdviserProps = {
  /** When this changes (e.g. after ingest), adviser data is refetched. */
  refreshTrigger?: string | null;
};

const AccountDetailsByAdviser = ({ refreshTrigger }: AccountDetailsByAdviserProps) => {
  const [advisers, setAdvisers] = useState<string[]>([]);
  const [selectedAdviser, setSelectedAdviser] = useState<string>('');
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [legacyTotals, setLegacyTotals] = useState<LegacyTotalRow[]>([]);
  const [loadingAdvisers, setLoadingAdvisers] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    setLoadingAdvisers(true);
    monitoringAPI
      .listAdvisers()
      .then((res) => {
        const list = res.data || [];
        setAdvisers(list);
        if (list.length > 0 && !selectedAdviser) {
          setSelectedAdviser(list[0]);
        }
      })
      .catch((err) => {
        console.error('Failed to load advisers:', err);
        setAdvisers([]);
      })
      .finally(() => setLoadingAdvisers(false));
  }, []);

  useEffect(() => {
    if (!selectedAdviser) {
      setAccounts([]);
      setLegacyTotals([]);
      return;
    }
    setLoadingDetails(true);
    const params = asOfDate ? { as_of_date: asOfDate } : undefined;
    monitoringAPI
      .getAdviserAccounts(selectedAdviser, params)
      .then((res) => {
        setAccounts(res.data?.accounts ?? []);
        setLegacyTotals(res.data?.legacy_totals ?? []);
      })
      .catch((err) => {
        console.error('Failed to load adviser account details:', err);
        setAccounts([]);
        setLegacyTotals([]);
      })
      .finally(() => setLoadingDetails(false));
  }, [selectedAdviser, asOfDate, refreshTrigger ?? '']);

  const formatDollars = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Adviser</label>
          <select
            value={selectedAdviser}
            onChange={(e) => setSelectedAdviser(e.target.value)}
            disabled={loadingAdvisers}
            className="rounded-md border-gray-300 shadow-sm text-sm min-w-[200px]"
          >
            <option value="">Select an adviser</option>
            {advisers.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">As of date:</label>
          <input
            type="date"
            value={asOfDate ?? ''}
            onChange={(e) => setAsOfDate(e.target.value || null)}
            className="rounded-md border-gray-300 shadow-sm text-sm"
          />
        </div>
      </div>

      {!selectedAdviser && !loadingAdvisers && (
        <p className="text-sm text-gray-500">Select an adviser to view account details.</p>
      )}

      {selectedAdviser && (
        <>
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Accounts</h3>
            <p className="text-sm text-gray-500 mb-4">
              Accounts for <strong>{selectedAdviser}</strong> with legacy tickers and the model tickers they map to. Click &quot;View account&quot; for a deeper view.
            </p>
            {loadingDetails ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-gray-500">No accounts with legacy holdings for this adviser on the selected date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Partial account number</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Account value</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Legacy ticker</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Model ticker (replacing)</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {accounts.map((row, i) => (
                      <tr key={`${row.account_id}-${row.legacy_ticker}-${i}`}>
                        <td className="px-4 py-2 text-sm text-gray-900">{row.partial_account_number ?? '—'}</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.account_value)}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.legacy_ticker}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.model_ticker}</td>
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

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Totals by legacy ticker</h3>
            <p className="text-sm text-gray-500 mb-4">
              Total value and number of accounts holding each legacy ticker for this adviser.
            </p>
            {loadingDetails ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : legacyTotals.length === 0 ? (
              <p className="text-sm text-gray-500">No legacy ticker totals for this adviser on the selected date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Legacy ticker</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total value</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Number of accounts</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {legacyTotals.map((row) => (
                      <tr key={row.legacy_ticker}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.legacy_ticker}</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.total_value)}</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-700">{row.account_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AccountDetailsByAdviser;
