import { useState, useEffect, useMemo } from 'react';
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
  registration_type: string | null;
};

type TotalFirmProps = {
  refreshTrigger?: string | null;
};

type SortDir = 'asc' | 'desc' | null;

const SortIcon = ({ dir }: { dir: SortDir }) => {
  if (!dir) return <span className="text-gray-300 ml-1">↕</span>;
  return <span className="text-indigo-600 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
};

const TotalFirm = ({ refreshTrigger }: TotalFirmProps) => {
  const [summaryByModel, setSummaryByModel] = useState<ModelSummary[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [summarySort, setSummarySort] = useState<{ col: keyof ModelSummary | null; dir: SortDir }>({ col: null, dir: null });

  const [accountsSort, setAccountsSort] = useState<{ col: keyof AccountRow | null; dir: SortDir }>({ col: null, dir: null });
  const [accountsFilterAdvisor, setAccountsFilterAdvisor] = useState('');
  const [accountsFilterPartial, setAccountsFilterPartial] = useState('');
  const [accountsFilterModel, setAccountsFilterModel] = useState('');
  const [accountsFilterHasEquiv, setAccountsFilterHasEquiv] = useState<'all' | 'yes' | 'no'>('all');
  const [accountsFilterRegistrationType, setAccountsFilterRegistrationType] = useState<'all' | 'taxable' | 'retirement' | 'trust' | 'na'>('all');

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

  const handleSummarySort = (col: keyof ModelSummary) => {
    setSummarySort((prev) => {
      const nextDir = prev.col === col
        ? (prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc')
        : 'asc';
      return { col: nextDir ? col : null, dir: nextDir };
    });
  };

  const handleAccountsSort = (col: keyof AccountRow) => {
    setAccountsSort((prev) => {
      const nextDir = prev.col === col
        ? (prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc')
        : 'asc';
      return { col: nextDir ? col : null, dir: nextDir };
    });
  };

  const filteredAndSortedSummary = useMemo(() => {
    let rows = [...summaryByModel];
    if (summarySort.col && summarySort.dir) {
      const mult = summarySort.dir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const ac = a[summarySort.col!];
        const bc = b[summarySort.col!];
        if (typeof ac === 'number' && typeof bc === 'number') return mult * (ac - bc);
        return mult * String(ac ?? '').localeCompare(String(bc ?? ''));
      });
    }
    return rows;
  }, [summaryByModel, summarySort]);

  const filteredAndSortedAccounts = useMemo(() => {
    let rows = accounts.filter((r) => {
      if (accountsFilterAdvisor.trim()) {
        const q = accountsFilterAdvisor.trim().toLowerCase();
        if (!(r.advisor ?? '').toLowerCase().includes(q)) return false;
      }
      if (accountsFilterPartial.trim()) {
        const q = accountsFilterPartial.trim().toLowerCase();
        if (!(r.partial_account_number ?? '').toLowerCase().includes(q)) return false;
      }
      if (accountsFilterModel.trim()) {
        const q = accountsFilterModel.trim().toLowerCase();
        if (!(r.model_name ?? '').toLowerCase().includes(q)) return false;
      }
      if (accountsFilterHasEquiv === 'yes' && !r.has_equivalents) return false;
      if (accountsFilterHasEquiv === 'no' && r.has_equivalents) return false;
      if (accountsFilterRegistrationType !== 'all') {
        const rt = (r.registration_type || '').trim().toLowerCase();
        if (accountsFilterRegistrationType === 'taxable' && rt !== 'taxable') return false;
        if (accountsFilterRegistrationType === 'retirement' && rt !== 'retirement') return false;
        if (accountsFilterRegistrationType === 'trust' && rt !== 'trust') return false;
        if (accountsFilterRegistrationType === 'na' && rt !== '') return false;
      }
      return true;
    });
    if (accountsSort.col && accountsSort.dir) {
      const mult = accountsSort.dir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const ac = a[accountsSort.col!];
        const bc = b[accountsSort.col!];
        if (typeof ac === 'number' && typeof bc === 'number') return mult * (ac - bc);
        if (typeof ac === 'boolean' && typeof bc === 'boolean') return mult * (ac === bc ? 0 : ac ? 1 : -1);
        return mult * String(ac ?? '').localeCompare(String(bc ?? ''));
      });
    }
    return rows;
  }, [accounts, accountsFilterAdvisor, accountsFilterPartial, accountsFilterModel, accountsFilterHasEquiv, accountsFilterRegistrationType, accountsSort]);

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
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      <button type="button" onClick={() => handleSummarySort('model_name')} className="flex items-center hover:text-indigo-600">
                        Model <SortIcon dir={summarySort.col === 'model_name' ? summarySort.dir : null} />
                      </button>
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      <button type="button" onClick={() => handleSummarySort('total_value')} className="ml-auto flex items-center justify-end hover:text-indigo-600">
                        Total Value <SortIcon dir={summarySort.col === 'total_value' ? summarySort.dir : null} />
                      </button>
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      <button type="button" onClick={() => handleSummarySort('account_count')} className="ml-auto flex items-center justify-end hover:text-indigo-600">
                        Accounts <SortIcon dir={summarySort.col === 'account_count' ? summarySort.dir : null} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAndSortedSummary.map((row) => (
                    <tr key={row.model_name}>
                      <td className="px-4 py-2 text-sm text-gray-900">{row.model_name}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.total_value)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">{row.account_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredAndSortedSummary.length === 0 && (
              <p className="text-sm text-gray-500 py-2">
                No model summary. Ingest a CSV to see data.
              </p>
            )}
          </div>

          {/* Accounts table */}
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-sm font-medium text-gray-700">All Accounts</h4>
            {(accountsFilterAdvisor || accountsFilterPartial || accountsFilterModel || accountsFilterHasEquiv !== 'all' || accountsFilterRegistrationType !== 'all') && (
              <span className="text-xs text-gray-500">
                Showing {filteredAndSortedAccounts.length} of {accounts.length}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    <button type="button" onClick={() => handleAccountsSort('advisor')} className="flex items-center hover:text-indigo-600">
                      Advisor <SortIcon dir={accountsSort.col === 'advisor' ? accountsSort.dir : null} />
                    </button>
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    <button type="button" onClick={() => handleAccountsSort('partial_account_number')} className="flex items-center hover:text-indigo-600">
                      Partial Account # <SortIcon dir={accountsSort.col === 'partial_account_number' ? accountsSort.dir : null} />
                    </button>
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    <button type="button" onClick={() => handleAccountsSort('model_name')} className="flex items-center hover:text-indigo-600">
                      Model <SortIcon dir={accountsSort.col === 'model_name' ? accountsSort.dir : null} />
                    </button>
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    <button type="button" onClick={() => handleAccountsSort('total_value')} className="ml-auto flex items-center justify-end hover:text-indigo-600">
                      Value <SortIcon dir={accountsSort.col === 'total_value' ? accountsSort.dir : null} />
                    </button>
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                    <button type="button" onClick={() => handleAccountsSort('has_equivalents')} className="flex items-center justify-center hover:text-indigo-600">
                      Has Equivalents <SortIcon dir={accountsSort.col === 'has_equivalents' ? accountsSort.dir : null} />
                    </button>
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase" title="Registration type: Taxable, Retirement, Trust, or NA">
                    Reg Type
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
                <tr className="bg-gray-100/50">
                  <th className="px-4 py-1.5">
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={accountsFilterAdvisor}
                      onChange={(e) => setAccountsFilterAdvisor(e.target.value)}
                      className="w-full max-w-[120px] rounded border-gray-300 text-xs py-1"
                    />
                  </th>
                  <th className="px-4 py-1.5">
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={accountsFilterPartial}
                      onChange={(e) => setAccountsFilterPartial(e.target.value)}
                      className="w-full max-w-[120px] rounded border-gray-300 text-xs py-1"
                    />
                  </th>
                  <th className="px-4 py-1.5">
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={accountsFilterModel}
                      onChange={(e) => setAccountsFilterModel(e.target.value)}
                      className="w-full max-w-[120px] rounded border-gray-300 text-xs py-1"
                    />
                  </th>
                  <th className="px-4 py-1.5" />
                  <th className="px-4 py-1.5" />
                  <th className="px-4 py-1.5">
                    <select
                      value={accountsFilterHasEquiv}
                      onChange={(e) => setAccountsFilterHasEquiv(e.target.value as 'all' | 'yes' | 'no')}
                      className="rounded border-gray-300 text-xs py-1 max-w-[90px]"
                    >
                      <option value="all">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </th>
                  <th className="px-4 py-1.5">
                    <select
                      value={accountsFilterRegistrationType}
                      onChange={(e) => setAccountsFilterRegistrationType(e.target.value as 'all' | 'taxable' | 'retirement' | 'trust' | 'na')}
                      className="rounded border-gray-300 text-xs py-1 max-w-[100px]"
                      title="Filter by registration type"
                    >
                      <option value="all">All</option>
                      <option value="taxable">Taxable</option>
                      <option value="retirement">Retirement</option>
                      <option value="trust">Trust</option>
                      <option value="na">NA</option>
                    </select>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedAccounts.map((row) => (
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
                    <td className="px-4 py-2 text-sm text-center" title={row.registration_type ?? 'Not set'}>
                      {(() => {
                        const rt = (row.registration_type || '').trim();
                        if (!rt) return <span className="text-gray-500">NA</span>;
                        const lower = rt.toLowerCase();
                        if (lower === 'taxable') return <span className="text-green-600 font-medium">Taxable</span>;
                        if (lower === 'retirement') return <span className="text-amber-600">Retirement</span>;
                        if (lower === 'trust') return <span className="text-indigo-600">Trust</span>;
                        return <span className="text-gray-600">{rt}</span>;
                      })()}
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
          {!loading && filteredAndSortedAccounts.length === 0 && (
            <p className="text-sm text-gray-500 mt-4">
              {accounts.length === 0 ? 'No accounts. Upload an aggregated holdings CSV to ingest.' : 'No rows match the filter.'}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default TotalFirm;
