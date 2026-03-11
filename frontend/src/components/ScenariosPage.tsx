import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { prospectsAPI } from '../services/api';

interface ProspectScenario {
  id: string;
  name: string;
  strategy_id: string;
  strategy_name: string | null;
  total_value: number;
  created_at: string;
  has_result: boolean;
  has_document?: boolean;
  monitored_account_id?: string | null;
  linked_account_name?: string | null;
}

interface LinkableAccount {
  id: string;
  synthetic_id: string;
  friendly_name: string | null;
  account_display: string | null;
  advisor: string | null;
}

const ScenariosPage = () => {
  const [scenarios, setScenarios] = useState<ProspectScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkDropdownProspectId, setLinkDropdownProspectId] = useState<string | null>(null);
  const [linkableAccounts, setLinkableAccounts] = useState<LinkableAccount[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [pendingUploadProspectId, setPendingUploadProspectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      const response = await prospectsAPI.list();
      setScenarios(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to load scenarios:', err);
      setScenarios([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const formatDollars = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const triggerFileUpload = (prospectId: string) => {
    setPendingUploadProspectId(prospectId);
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const prospectId = pendingUploadProspectId;
    setPendingUploadProspectId(null);
    e.target.value = '';
    if (!file || !prospectId) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a PDF file.');
      return;
    }
    setUploadingDocId(prospectId);
    try {
      await prospectsAPI.uploadDocument(prospectId, file);
      loadScenarios();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not upload document.');
    } finally {
      setUploadingDocId(null);
    }
  };

  const handleViewPdf = async (id: string) => {
    try {
      const res = await prospectsAPI.getDocument(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
    } catch {
      alert('Could not load PDF.');
    }
  };

  const openLinkDropdown = async (prospectId: string) => {
    setLinkDropdownProspectId(prospectId);
    setLinkLoading(true);
    try {
      const res = await prospectsAPI.getLinkableAccounts(prospectId);
      setLinkableAccounts(res.data || []);
    } catch {
      setLinkableAccounts([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const handleLinkAccount = async (prospectId: string, accountId: string | null) => {
    try {
      await prospectsAPI.linkAccount(prospectId, accountId);
      setLinkDropdownProspectId(null);
      loadScenarios();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not update link.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete scenario "${name}"? This will remove all holdings, mappings, and results. This cannot be undone.`)) {
      return;
    }
    try {
      await prospectsAPI.delete(id);
      loadScenarios();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not delete scenario.');
    }
  };

  const handleDownloadReportPdf = async (id: string) => {
    try {
      const res = await prospectsAPI.getReportPdf(id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disp = res.headers['content-disposition'] || res.headers['Content-Disposition'] || '';
      const match = disp.match(/filename="?([^";\n]+)"?/);
      a.download = match ? match[1].trim() : 'transition-report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not download PDF report.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">
                  Tax-Aware Transition Tool
                </h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/dashboard"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  to="/scenarios"
                  className="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Scenarios
                </Link>
                <Link
                  to="/monitoring"
                  className="border-transparent text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Monitoring
                </Link>
                <Link
                  to="/admin"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Admin
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Saved Scenarios</h2>
          <p className="mt-1 text-sm text-gray-500">
            All prospect scenarios. Click View results to open the transition result and tax summary.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileSelected}
        />
        {loading ? (
          <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
            Loading scenarios…
          </div>
        ) : scenarios.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
            No saved scenarios yet. Create a prospect on the Dashboard and run through the flow to save a scenario.
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scenario name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Strategy
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total value
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Result
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Document
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Linked account
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {scenarios.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {s.strategy_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                      ${formatDollars(s.total_value)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {s.has_result ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="inline-flex items-center gap-2">
                        {s.has_document ? (
                          <button
                            type="button"
                            onClick={() => handleViewPdf(s.id)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            View PDF
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        {uploadingDocId === s.id ? (
                          <span className="text-gray-500 text-xs">Uploading…</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => triggerFileUpload(s.id)}
                            className="text-indigo-600 hover:text-indigo-800 text-xs"
                          >
                            {s.has_document ? 'Replace' : 'Add file'}
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {linkDropdownProspectId === s.id ? (
                        <div className="relative">
                          <select
                            className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__unlink__') {
                                handleLinkAccount(s.id, null);
                              } else if (val) {
                                handleLinkAccount(s.id, val);
                              }
                            }}
                            onBlur={() => setTimeout(() => setLinkDropdownProspectId(null), 150)}
                            autoFocus
                          >
                            <option value="">Select account…</option>
                            <option value="__unlink__">
                              {s.linked_account_name ? '— Unlink —' : '— No link —'}
                            </option>
                            {linkLoading ? (
                              <option disabled>Loading…</option>
                            ) : linkableAccounts.length === 0 ? (
                              <option disabled>No accounts with same strategy</option>
                            ) : (
                              linkableAccounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.friendly_name || acc.synthetic_id}
                                  {acc.account_display ? ` (${acc.account_display})` : ''}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      ) : s.linked_account_name ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-gray-700">{s.linked_account_name}</span>
                          <button
                            type="button"
                            onClick={() => openLinkDropdown(s.id)}
                            className="text-indigo-600 hover:text-indigo-800 text-xs"
                          >
                            Change
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openLinkDropdown(s.id)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Link to account
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                      {s.has_result ? (
                        <span className="inline-flex gap-2 items-center">
                          <button
                            type="button"
                            onClick={() => handleDownloadReportPdf(s.id)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Download PDF Report
                          </button>
                          <span className="text-gray-300">|</span>
                          <Link
                            to={`/prospect/${s.id}`}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            View results
                          </Link>
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(s.id, s.name)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-2 items-center">
                          <Link
                            to="/dashboard"
                            className="text-gray-500 hover:text-gray-700"
                          >
                            Run in Dashboard
                          </Link>
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(s.id, s.name)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default ScenariosPage;
