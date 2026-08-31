import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatIsoDate } from '../utils/formatIsoDate';
import { monitoringAccountPath, monitoringListPath, parseMonitoringTab, type MonitoringTab } from '../utils/monitoringNav';
import HeatMap from './monitoring/HeatMap';
import { monitoringAPI } from '../services/api';
import TotalFirm from './monitoring/TotalFirm';
import ConcentrationReport from './monitoring/ConcentrationReport';
import AccountDetailsByAdviser from './monitoring/AccountDetailsByAdviser';
import UploadChanges from './monitoring/UploadChanges';
import UnusedEquivalents from './monitoring/UnusedEquivalents';
import EquivalentReview from './monitoring/EquivalentReview';
import AccountDrillDown from './monitoring/AccountDrillDown';
import ConcentrationAccountList from './monitoring/ConcentrationAccountList';

const toCsvCell = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

const MonitoringPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: accountId, ticker, grade } = useParams<{ id?: string; ticker?: string; grade?: string }>();
  const activeTab = parseMonitoringTab(searchParams.get('tab'));
  const selectedAsOfDate = searchParams.get('as_of_date') || null;
  const [snapshotDates, setSnapshotDates] = useState<string[]>([]);

  const setActiveTab = (tab: MonitoringTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  const setSelectedAsOfDate = (value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('as_of_date', value);
      else next.delete('as_of_date');
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    monitoringAPI
      .snapshotDates()
      .then((res) => {
        const dates = res.data?.dates ?? [];
        setSnapshotDates(dates);
        if (!searchParams.get('as_of_date') && res.data?.latest_date) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (!next.get('as_of_date')) next.set('as_of_date', res.data.latest_date!);
            return next;
          }, { replace: true });
        }
      })
      .catch((err) => {
        console.error('Failed to load monitoring snapshot dates:', err);
        setSnapshotDates([]);
      });
  }, []);

  const monitoringBackPath = monitoringListPath(searchParams);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; synthetic_id: string; friendly_name: string | null; advisor: string | null; account_display: string | null }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleAccountSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const res = await monitoringAPI.searchAccountsBySyntheticId(
        q,
        selectedAsOfDate ? { as_of_date: selectedAsOfDate } : undefined
      );
      const accounts = res.data ?? [];
      setSearchResults(accounts);
      if (accounts.length === 1) {
        navigate(monitoringAccountPath(accounts[0].id, searchParams));
        setSearchQuery('');
        setSearchResults([]);
      } else if (accounts.length === 0) {
        setSearchError('No accounts found');
      }
    } catch {
      setSearchError('Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleExportAdviserAum = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const params = selectedAsOfDate ? { as_of_date: selectedAsOfDate } : undefined;
      const res = await monitoringAPI.adviserStrategyExport(params);
      const rows = res.data?.rows ?? [];
      const csvRows = [
        [
          'CRD',
          'Adviser Name',
          'Total AUM by Adviser',
          'Strategy',
          'AUM by Strategy',
          'YTD AUM Change by Strategy',
          'Accounts in Strategy',
        ],
        ...rows.map((r) => [
          r.crd ?? '',
          r.adviser_name ?? '',
          r.total_aum_by_adviser ?? 0,
          r.strategy_name ?? '',
          r.aum_by_strategy ?? 0,
          r.ytd_aum_change ?? 0,
          r.account_count ?? 0,
        ]),
      ];
      const csvContent = `\uFEFF${csvRows.map((row) => row.map((c) => toCsvCell(c)).join(',')).join('\n')}`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const datePart = (res.data?.current_date || selectedAsOfDate || 'latest').replace(/[^\d-]/g, '');
      a.download = `monitoring-adviser-aum-${datePart}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export adviser AUM:', err);
      setExportError('Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (accountId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-gray-900">Monitoring</h1>
                <Link to={monitoringBackPath} className="text-sm text-indigo-600 hover:text-indigo-800">← Back</Link>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/dashboard" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Dashboard</Link>
                <Link to="/scenarios" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Scenarios</Link>
                <Link to="/admin" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Admin</Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <AccountDrillDown backPath={monitoringBackPath} availableDates={snapshotDates} />
        </main>
      </div>
    );
  }

  if (ticker && grade) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-gray-900">Monitoring</h1>
                <Link to={monitoringBackPath} className="text-sm text-indigo-600 hover:text-indigo-800">← Back</Link>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/dashboard" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Dashboard</Link>
                <Link to="/scenarios" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Scenarios</Link>
                <Link to="/admin" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Admin</Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <ConcentrationAccountList />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold text-gray-900">Monitoring</h1>
              <form onSubmit={handleAccountSearch} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchError(null); setSearchResults([]); }}
                  placeholder="Search by account ID (synthetic ID)..."
                  className="w-64 rounded-md border border-gray-300 py-1.5 pl-3 pr-9 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  disabled={searchLoading}
                />
                <button
                  type="submit"
                  disabled={searchLoading || !searchQuery.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {searchLoading ? '…' : 'Search'}
                </button>
                {searchError && (
                  <p className="absolute left-0 top-full mt-1 text-xs text-red-600">{searchError}</p>
                )}
                {searchResults.length > 1 && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-80 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                    <p className="px-3 py-1 text-xs text-gray-500">{searchResults.length} accounts found</p>
                    {searchResults.map((a) => (
                      <Link
                        key={a.id}
                        to={monitoringAccountPath(a.id, searchParams)}
                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                        className="block px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {a.friendly_name || a.synthetic_id}
                        {(a.advisor || a.account_display) && (
                          <span className="ml-2 text-gray-500">
                            — {[a.advisor, a.account_display].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </form>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Dashboard</Link>
              <Link to="/scenarios" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Scenarios</Link>
              <Link to="/admin" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Admin</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('totalfirm')}
              className={`${
                activeTab === 'totalfirm'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Total Firm
            </button>
            <button
              onClick={() => setActiveTab('heatmap')}
              className={`${
                activeTab === 'heatmap'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Heat Map
            </button>
            <button
              onClick={() => setActiveTab('concentration')}
              className={`${
                activeTab === 'concentration'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Concentration
            </button>
            <button
              onClick={() => setActiveTab('byadviser')}
              className={`${
                activeTab === 'byadviser'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              By Adviser
            </button>
            <button
              onClick={() => setActiveTab('uploadchanges')}
              className={`${
                activeTab === 'uploadchanges'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Upload Changes
            </button>
            <button
              onClick={() => setActiveTab('unusedequivalents')}
              className={`${
                activeTab === 'unusedequivalents'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Equivalent Usage
            </button>
            <button
              onClick={() => setActiveTab('equivalentreview')}
              className={`${
                activeTab === 'equivalentreview'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Equivalent Review
            </button>
          </nav>
        </div>

        {activeTab !== 'uploadchanges' && activeTab !== 'equivalentreview' && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <label className="text-sm font-medium text-gray-700" htmlFor="monitoring-as-of-date">
              Historical as-of date
            </label>
            <select
              id="monitoring-as-of-date"
              value={selectedAsOfDate ?? ''}
              onChange={(e) => setSelectedAsOfDate(e.target.value || null)}
              className="rounded-md border-gray-300 shadow-sm text-sm min-w-[160px]"
            >
              {snapshotDates.length === 0 && <option value="">Latest available</option>}
              {snapshotDates.map((d) => (
                <option key={d} value={d}>
                  {formatIsoDate(d)}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
              Reports, account values, holdings, and drill-downs use the selected snapshot date.
            </span>
            <button
              type="button"
              onClick={handleExportAdviserAum}
              disabled={exporting}
              className="ml-auto inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            {exportError && <span className="text-xs text-red-600">{exportError}</span>}
          </div>
        )}

        <div className="space-y-6">
          {activeTab === 'totalfirm' && <TotalFirm asOfDate={selectedAsOfDate} />}
          {activeTab === 'heatmap' && <HeatMap asOfDate={selectedAsOfDate} />}
          {activeTab === 'concentration' && <ConcentrationReport asOfDate={selectedAsOfDate} />}
          {activeTab === 'byadviser' && <AccountDetailsByAdviser />}
          {activeTab === 'uploadchanges' && <UploadChanges snapshotDates={snapshotDates} />}
          {activeTab === 'unusedequivalents' && <UnusedEquivalents asOfDate={selectedAsOfDate} />}
          {activeTab === 'equivalentreview' && <EquivalentReview />}
        </div>
      </main>
    </div>
  );
};

export default MonitoringPage;
