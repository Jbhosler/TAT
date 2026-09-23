import { useEffect, useMemo, useState } from 'react';
import { monitoringAPI } from '../../services/api';

type AdviserInfoRow = {
  adviser_name: string;
  crd: string | null;
  account_count: number;
  total_aum: number;
};

type SortKey = 'adviser_name' | 'crd' | 'account_count' | 'total_aum';
type SortDir = 'asc' | 'desc';

type AdviserInfoProps = {
  asOfDate?: string | null;
};

const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
  if (!active) return <span className="text-gray-300 ml-1">↕</span>;
  return <span className="text-indigo-600 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
};

const formatDollars = (value: number) => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '$0';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const AdviserInfo = ({ asOfDate }: AdviserInfoProps) => {
  const [rows, setRows] = useState<AdviserInfoRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'total_aum', dir: 'desc' });
  const [savingName, setSavingName] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [savedName, setSavedName] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = asOfDate ? { as_of_date: asOfDate } : undefined;
      const res = await monitoringAPI.adviserInfo(params);
      const advisers = res.data?.advisers ?? [];
      setRows(advisers);
      setDrafts(Object.fromEntries(advisers.map((row) => [row.adviser_name, row.crd ?? ''])));
    } catch {
      setRows([]);
      setDrafts({});
      setLoadError('Could not load adviser information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [asOfDate ?? '']);

  const visibleRows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (missingOnly && (row.crd ?? '').trim()) return false;
      if (!query) return true;
      return (
        row.adviser_name.toLowerCase().includes(query) ||
        (row.crd ?? '').toLowerCase().includes(query)
      );
    });
    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === 'adviser_name' || sort.key === 'crd') {
        const left = (sort.key === 'crd' ? a.crd : a.adviser_name) ?? '';
        const right = (sort.key === 'crd' ? b.crd : b.adviser_name) ?? '';
        return direction * left.localeCompare(right);
      }
      return direction * (Number(a[sort.key]) - Number(b[sort.key]));
    });
  }, [rows, filter, missingOnly, sort]);

  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (sum, row) => ({
          accounts: sum.accounts + (Number(row.account_count) || 0),
          aum: sum.aum + (Number(row.total_aum) || 0),
        }),
        { accounts: 0, aum: 0 },
      ),
    [visibleRows],
  );

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'adviser_name' || key === 'crd' ? 'asc' : 'desc' },
    );
  };

  const saveCrd = async (adviserName: string) => {
    const draft = (drafts[adviserName] ?? '').trim();
    if (draft && !/^\d+$/.test(draft)) {
      setRowError((prev) => ({ ...prev, [adviserName]: 'CRD must be numeric.' }));
      return;
    }
    setSavingName(adviserName);
    setRowError((prev) => ({ ...prev, [adviserName]: '' }));
    setSavedName(null);
    try {
      const res = await monitoringAPI.updateAdviserCrd({
        adviser_name: adviserName,
        advisor_crd: draft || null,
      });
      const saved = res.data.advisor_crd ?? '';
      setRows((prev) =>
        prev.map((row) => (row.adviser_name === adviserName ? { ...row, crd: saved || null } : row)),
      );
      setDrafts((prev) => ({ ...prev, [adviserName]: saved }));
      setSavedName(adviserName);
    } catch {
      setRowError((prev) => ({ ...prev, [adviserName]: 'Could not save CRD.' }));
    } finally {
      setSavingName(null);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Adviser Info</h3>
          <p className="text-sm text-gray-500 mt-1">
            Account counts and AUM use the selected as-of date. Saving a CRD updates every account for that adviser.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by adviser or CRD"
            className="rounded-md border-gray-300 shadow-sm text-sm"
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e) => setMissingOnly(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600"
            />
            Missing CRD
          </label>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : visibleRows.length === 0 ? (
        <p className="text-sm text-gray-500">No advisers match this view.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {(
                  [
                    ['adviser_name', 'Adviser', 'left'],
                    ['account_count', 'Accounts', 'right'],
                    ['total_aum', 'Total AUM', 'right'],
                    ['crd', 'CRD', 'left'],
                  ] as Array<[SortKey, string, 'left' | 'right']>
                ).map(([key, label, align]) => (
                  <th
                    key={key}
                    className={`px-4 py-2 text-xs font-medium text-gray-500 uppercase ${align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center">
                      {label}
                      <SortIcon active={sort.key === key} dir={sort.dir} />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {visibleRows.map((row) => {
                const draft = drafts[row.adviser_name] ?? '';
                const dirty = draft.trim() !== (row.crd ?? '');
                const invalid = draft.trim() !== '' && !/^\d+$/.test(draft.trim());
                return (
                  <tr key={row.adviser_name} className={row.crd ? '' : 'bg-amber-50'}>
                    <td className="px-4 py-2 text-sm text-gray-900">{row.adviser_name}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">{row.account_count}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">{formatDollars(row.total_aum)}</td>
                    <td className="px-4 py-2">
                      <input
                        value={draft}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [row.adviser_name]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && dirty && !invalid) saveCrd(row.adviser_name);
                        }}
                        inputMode="numeric"
                        maxLength={32}
                        aria-label={`CRD for ${row.adviser_name}`}
                        className="w-36 rounded-md border-gray-300 shadow-sm text-sm"
                      />
                      {rowError[row.adviser_name] && (
                        <p className="mt-1 text-xs text-red-600">{rowError[row.adviser_name]}</p>
                      )}
                      {savedName === row.adviser_name && !dirty && (
                        <p className="mt-1 text-xs text-green-700">Saved</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => saveCrd(row.adviser_name)}
                        disabled={!dirty || invalid || savingName === row.adviser_name}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {savingName === row.adviser_name ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-4 py-2 text-sm font-medium text-gray-700">
                  {visibleRows.length} adviser{visibleRows.length === 1 ? '' : 's'}
                </td>
                <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">{totals.accounts}</td>
                <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">{formatDollars(totals.aum)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdviserInfo;
