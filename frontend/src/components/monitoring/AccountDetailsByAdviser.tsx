import { useState, useEffect, useMemo } from 'react';

import { Link, useSearchParams } from 'react-router-dom';

import { monitoringAPI } from '../../services/api';

import { monitoringAccountPath } from '../../utils/monitoringNav';
import { compareAccountLast4 } from '../../utils/accountNumber';



type AccountRow = {

  account_id: string;

  partial_account_number: string | null;

  account_value: number;

  has_equivalents: boolean;

  strategy_name: string | null;

  registration_type: string | null;

};



type LegacyTotalRow = {

  legacy_ticker: string;

  total_value: number;

  account_count: number;

};



type StrategySummary = {

  strategy_name: string;

  total_value: number;

  account_count: number;

};



type SummaryTotals = {

  total_accounts: number;

  total_aum: number;

  accounts_with_equivalents: number;

};



const EMPTY_SUMMARY: SummaryTotals = {

  total_accounts: 0,

  total_aum: 0,

  accounts_with_equivalents: 0,

};



type SortDir = 'asc' | 'desc' | null;



const SortIcon = ({ dir }: { dir: SortDir }) => {

  if (!dir) return <span className="text-gray-300 ml-1">↕</span>;

  return <span className="text-indigo-600 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;

};



type AccountDetailsByAdviserProps = {

  /** When this changes (e.g. after ingest), adviser data is refetched. */

  refreshTrigger?: string | null;

};



const AccountDetailsByAdviser = ({ refreshTrigger }: AccountDetailsByAdviserProps) => {

  const [searchParams, setSearchParams] = useSearchParams();

  const selectedAdviser = searchParams.get('adviser') ?? '';

  const asOfDate = searchParams.get('as_of_date') || null;



  const [advisers, setAdvisers] = useState<string[]>([]);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const [legacyTotals, setLegacyTotals] = useState<LegacyTotalRow[]>([]);

  const [summary, setSummary] = useState<SummaryTotals>(EMPTY_SUMMARY);

  const [summaryByStrategy, setSummaryByStrategy] = useState<StrategySummary[]>([]);

  const [loadingAdvisers, setLoadingAdvisers] = useState(true);

  const [loadingDetails, setLoadingDetails] = useState(false);



  const [strategySort, setStrategySort] = useState<{ col: keyof StrategySummary | null; dir: SortDir }>({

    col: null,

    dir: null,

  });

  const [accountsSort, setAccountsSort] = useState<{ col: keyof AccountRow | null; dir: SortDir }>({

    col: null,

    dir: null,

  });

  const [legacySort, setLegacySort] = useState<{ col: keyof LegacyTotalRow | null; dir: SortDir }>({

    col: null,

    dir: null,

  });



  const updateSearchParam = (key: string, value: string | null) => {

    setSearchParams(

      (prev) => {

        const next = new URLSearchParams(prev);

        next.set('tab', 'byadviser');

        if (value) next.set(key, value);

        else next.delete(key);

        return next;

      },

      { replace: key === 'as_of_date' }

    );

  };



  const cycleSort = <T extends string>(

    col: T,

    prev: { col: T | null; dir: SortDir },

    setter: (v: { col: T | null; dir: SortDir }) => void

  ) => {

    const nextDir = prev.col === col

      ? (prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc')

      : 'asc';

    setter({ col: nextDir ? col : null, dir: nextDir });

  };



  const sortRows = <T,>(rows: T[], col: keyof T | null, dir: SortDir): T[] => {

    if (!col || !dir) return rows;

    const mult = dir === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {

      const ac = a[col];

      const bc = b[col];

      if (typeof ac === 'number' && typeof bc === 'number') return mult * (ac - bc);

      if (typeof ac === 'boolean' && typeof bc === 'boolean') return mult * (ac === bc ? 0 : ac ? 1 : -1);

      return mult * String(ac ?? '').localeCompare(String(bc ?? ''));

    });

  };



  useEffect(() => {

    setLoadingAdvisers(true);

    monitoringAPI

      .listAdvisers()

      .then((res) => {

        const list = res.data || [];

        setAdvisers(list);

        const fromUrl = searchParams.get('adviser');

        if (fromUrl && list.includes(fromUrl)) return;

        if (list.length > 0 && !fromUrl) {

          setSearchParams(

            (prev) => {

              const next = new URLSearchParams(prev);

              next.set('tab', 'byadviser');

              next.set('adviser', list[0]);

              return next;

            },

            { replace: true }

          );

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

      setSummary(EMPTY_SUMMARY);

      setSummaryByStrategy([]);

      return;

    }

    setLoadingDetails(true);

    const params = asOfDate ? { as_of_date: asOfDate } : undefined;

    monitoringAPI

      .getAdviserAccounts(selectedAdviser, params)

      .then((res) => {

        setAccounts(res.data?.accounts ?? []);

        setLegacyTotals(res.data?.legacy_totals ?? []);

        setSummary(res.data?.summary ?? EMPTY_SUMMARY);

        setSummaryByStrategy(res.data?.summary_by_strategy ?? []);

      })

      .catch((err) => {

        console.error('Failed to load adviser account details:', err);

        setAccounts([]);

        setLegacyTotals([]);

        setSummary(EMPTY_SUMMARY);

        setSummaryByStrategy([]);

      })

      .finally(() => setLoadingDetails(false));

  }, [selectedAdviser, asOfDate, refreshTrigger ?? '']);



  const sortedSummaryByStrategy = useMemo(

    () => sortRows(summaryByStrategy, strategySort.col, strategySort.dir),

    [summaryByStrategy, strategySort]

  );



  const sortedAccounts = useMemo(() => {

    if (!accountsSort.col || !accountsSort.dir) return accounts;

    if (accountsSort.col === 'partial_account_number') {

      const mult = accountsSort.dir === 'asc' ? 1 : -1;

      return [...accounts].sort((a, b) =>

        compareAccountLast4(a.partial_account_number, b.partial_account_number, mult)

      );

    }

    return sortRows(accounts, accountsSort.col, accountsSort.dir);

  }, [accounts, accountsSort]);



  const sortedLegacyTotals = useMemo(

    () => sortRows(legacyTotals, legacySort.col, legacySort.dir),

    [legacyTotals, legacySort]

  );



  const accountReturnParams = useMemo(() => {

    const params = new URLSearchParams({ tab: 'byadviser', adviser: selectedAdviser });

    if (asOfDate) params.set('as_of_date', asOfDate);

    return params;

  }, [selectedAdviser, asOfDate]);



  const formatDollars = (v: number) =>

    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });



  const hasData = summary.total_accounts > 0 || accounts.length > 0;



  return (

    <div className="space-y-8">

      <div className="flex flex-wrap items-center gap-4">

        <div className="flex items-center gap-2">

          <label className="text-sm font-medium text-gray-700">Adviser</label>

          <select

            value={selectedAdviser}

            onChange={(e) => updateSearchParam('adviser', e.target.value || null)}

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

      </div>



      {!selectedAdviser && !loadingAdvisers && (

        <p className="text-sm text-gray-500">Select an adviser to view account details.</p>

      )}



      {selectedAdviser && (

        <>

          <div className="bg-white shadow rounded-lg p-6">

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>

            <p className="text-sm text-gray-500 mb-4">

              Overview for <strong>{selectedAdviser}</strong> on the selected date.

            </p>

            {loadingDetails ? (

              <p className="text-sm text-gray-500">Loading…</p>

            ) : !hasData ? (

              <p className="text-sm text-gray-500">No accounts with snapshots for this adviser on the selected date.</p>

            ) : (

              <>

                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">

                    <dt className="text-xs font-medium text-gray-500 uppercase">Total accounts</dt>

                    <dd className="mt-1 text-2xl font-semibold text-gray-900">{summary.total_accounts}</dd>

                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">

                    <dt className="text-xs font-medium text-gray-500 uppercase">Total AUM</dt>

                    <dd className="mt-1 text-2xl font-semibold text-gray-900">${formatDollars(summary.total_aum)}</dd>

                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">

                    <dt className="text-xs font-medium text-gray-500 uppercase">With equivalents</dt>

                    <dd className="mt-1 text-2xl font-semibold text-gray-900">{summary.accounts_with_equivalents}</dd>

                  </div>

                </dl>

                <h4 className="text-sm font-medium text-gray-700 mb-3">By strategy</h4>

                <div className="overflow-x-auto">

                  <table className="min-w-full divide-y divide-gray-200">

                    <thead className="bg-gray-50">

                      <tr>

                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">

                          <button

                            type="button"

                            onClick={() => cycleSort('strategy_name', strategySort, setStrategySort)}

                            className="flex items-center hover:text-indigo-600"

                          >

                            Strategy

                            <SortIcon dir={strategySort.col === 'strategy_name' ? strategySort.dir : null} />

                          </button>

                        </th>

                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">

                          <button

                            type="button"

                            onClick={() => cycleSort('account_count', strategySort, setStrategySort)}

                            className="ml-auto flex items-center justify-end hover:text-indigo-600"

                          >

                            Accounts

                            <SortIcon dir={strategySort.col === 'account_count' ? strategySort.dir : null} />

                          </button>

                        </th>

                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">

                          <button

                            type="button"

                            onClick={() => cycleSort('total_value', strategySort, setStrategySort)}

                            className="ml-auto flex items-center justify-end hover:text-indigo-600"

                          >

                            AUM

                            <SortIcon dir={strategySort.col === 'total_value' ? strategySort.dir : null} />

                          </button>

                        </th>

                      </tr>

                    </thead>

                    <tbody className="bg-white divide-y divide-gray-200">

                      {sortedSummaryByStrategy.map((row) => (

                        <tr key={row.strategy_name}>

                          <td className="px-4 py-2 text-sm text-gray-900">{row.strategy_name}</td>

                          <td className="px-4 py-2 text-sm text-right text-gray-700">{row.account_count}</td>

                          <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.total_value)}</td>

                        </tr>

                      ))}

                    </tbody>

                    <tfoot className="bg-gray-50">

                      <tr>

                        <td className="px-4 py-2 text-sm font-medium text-gray-900">Total</td>

                        <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">{summary.total_accounts}</td>

                        <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">${formatDollars(summary.total_aum)}</td>

                      </tr>

                    </tfoot>

                  </table>

                </div>

              </>

            )}

          </div>



          <div className="bg-white shadow rounded-lg p-6">

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Accounts</h3>

            <p className="text-sm text-gray-500 mb-4">

              All accounts for <strong>{selectedAdviser}</strong> on the selected date. Use &quot;View account&quot; for full holdings and allocation detail.

            </p>

            {loadingDetails ? (

              <p className="text-sm text-gray-500">Loading…</p>

            ) : !hasData ? (

              <p className="text-sm text-gray-500">No accounts with snapshots for this adviser on the selected date.</p>

            ) : (

              <div className="overflow-x-auto">

                <table className="min-w-full divide-y divide-gray-200">

                  <thead className="bg-gray-50">

                    <tr>

                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('partial_account_number', accountsSort, setAccountsSort)}

                          className="flex items-center hover:text-indigo-600"

                        >

                          Partial account number

                          <SortIcon dir={accountsSort.col === 'partial_account_number' ? accountsSort.dir : null} />

                        </button>

                      </th>

                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('strategy_name', accountsSort, setAccountsSort)}

                          className="flex items-center hover:text-indigo-600"

                        >

                          Strategy

                          <SortIcon dir={accountsSort.col === 'strategy_name' ? accountsSort.dir : null} />

                        </button>

                      </th>

                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('account_value', accountsSort, setAccountsSort)}

                          className="ml-auto flex items-center justify-end hover:text-indigo-600"

                        >

                          Account value

                          <SortIcon dir={accountsSort.col === 'account_value' ? accountsSort.dir : null} />

                        </button>

                      </th>

                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('has_equivalents', accountsSort, setAccountsSort)}

                          className="flex items-center justify-center hover:text-indigo-600"

                        >

                          Has equivalents

                          <SortIcon dir={accountsSort.col === 'has_equivalents' ? accountsSort.dir : null} />

                        </button>

                      </th>

                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('registration_type', accountsSort, setAccountsSort)}

                          className="flex items-center justify-center hover:text-indigo-600"

                          title="Registration type: Taxable, Retirement, Trust, or NA"

                        >

                          Account type

                          <SortIcon dir={accountsSort.col === 'registration_type' ? accountsSort.dir : null} />

                        </button>

                      </th>

                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('account_id', accountsSort, setAccountsSort)}

                          className="ml-auto flex items-center justify-end hover:text-indigo-600"

                        >

                          Actions

                          <SortIcon dir={accountsSort.col === 'account_id' ? accountsSort.dir : null} />

                        </button>

                      </th>

                    </tr>

                  </thead>

                  <tbody className="bg-white divide-y divide-gray-200">

                    {sortedAccounts.map((row) => (

                      <tr key={row.account_id}>

                        <td className="px-4 py-2 text-sm text-gray-900">{row.partial_account_number ?? '—'}</td>

                        <td className="px-4 py-2 text-sm text-gray-700">{row.strategy_name ?? '—'}</td>

                        <td className="px-4 py-2 text-sm text-right text-gray-900">${formatDollars(row.account_value)}</td>

                        <td className="px-4 py-2 text-sm text-center">

                          {row.has_equivalents ? (

                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">

                              Yes

                            </span>

                          ) : (

                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">

                              No

                            </span>

                          )}

                        </td>

                        <td className="px-4 py-2 text-sm text-center" title={row.registration_type ?? 'Not set'}>

                          {(() => {

                            const rt = (row.registration_type || '').trim();

                            if (!rt) return <span className="text-gray-500">NA</span>;

                            const lower = rt.toLowerCase();

                            if (lower === 'taxable') return <span className="text-green-600 font-medium">Taxable</span>;

                            if (lower === 'retirement') return <span className="text-amber-600 font-medium">Retirement</span>;

                            if (lower === 'trust') return <span className="text-indigo-600 font-medium">Trust</span>;

                            return <span className="text-gray-600">{rt}</span>;

                          })()}

                        </td>

                        <td className="px-4 py-2 text-sm text-right">

                          <Link

                            to={monitoringAccountPath(row.account_id, accountReturnParams)}

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

                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('legacy_ticker', legacySort, setLegacySort)}

                          className="flex items-center hover:text-indigo-600"

                        >

                          Legacy ticker

                          <SortIcon dir={legacySort.col === 'legacy_ticker' ? legacySort.dir : null} />

                        </button>

                      </th>

                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('total_value', legacySort, setLegacySort)}

                          className="ml-auto flex items-center justify-end hover:text-indigo-600"

                        >

                          Total value

                          <SortIcon dir={legacySort.col === 'total_value' ? legacySort.dir : null} />

                        </button>

                      </th>

                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">

                        <button

                          type="button"

                          onClick={() => cycleSort('account_count', legacySort, setLegacySort)}

                          className="ml-auto flex items-center justify-end hover:text-indigo-600"

                        >

                          Number of accounts

                          <SortIcon dir={legacySort.col === 'account_count' ? legacySort.dir : null} />

                        </button>

                      </th>

                    </tr>

                  </thead>

                  <tbody className="bg-white divide-y divide-gray-200">

                    {sortedLegacyTotals.map((row) => (

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

