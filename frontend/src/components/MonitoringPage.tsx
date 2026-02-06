import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StrategyBridge from './monitoring/StrategyBridge';
import HeatMap from './monitoring/HeatMap';
import TotalFirm from './monitoring/TotalFirm';
import ConcentrationReport from './monitoring/ConcentrationReport';
import AccountDetailsByAdviser from './monitoring/AccountDetailsByAdviser';
import AccountDrillDown from './monitoring/AccountDrillDown';
import ConcentrationAccountList from './monitoring/ConcentrationAccountList';
import { monitoringAPI } from '../services/api';

const MonitoringPage = () => {
  const { id: accountId, ticker, grade } = useParams<{ id?: string; ticker?: string; grade?: string }>();
  const [activeTab, setActiveTab] = useState<'bridge' | 'heatmap' | 'totalfirm' | 'concentration' | 'byadviser'>('bridge');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [forceReingest, setForceReingest] = useState(false);
  const [ingestResult, setIngestResult] = useState<{
    ingested_count: number;
    skipped_count: number;
    data_inconsistency_synthetic_ids: string[];
    last_ingest_at?: string | null;
    duplicate_file_skipped?: boolean;
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setIngestResult(null);
    e.target.value = ''; // Reset so selecting a different file (even same name) always fires change again
  };

  const handleIngest = async () => {
    if (!selectedFile) {
      alert('Choose a CSV file first.');
      return;
    }
    setIngesting(true);
    setIngestResult(null);
    const readFile = (): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string) || '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(selectedFile, 'UTF-8');
      });
    try {
      const csvContent = await readFile();
      if (!csvContent.trim()) {
        alert('The selected file is empty.');
        setIngesting(false);
        return;
      }
      const res = await monitoringAPI.ingest(csvContent, { force: forceReingest || undefined });
      setIngestResult(res.data);
      if (res.data.ingested_count > 0) {
        setSelectedFile(null);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Ingest failed');
    } finally {
      setIngesting(false);
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
                <Link to="/monitoring" className="text-sm text-indigo-600 hover:text-indigo-800">← Back</Link>
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
          <AccountDrillDown />
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
                <Link to="/monitoring" className="text-sm text-indigo-600 hover:text-indigo-800">← Back</Link>
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
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Monitoring</h1>
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
              onClick={() => setActiveTab('bridge')}
              className={`${
                activeTab === 'bridge'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Strategy Bridge
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
          </nav>
        </div>

        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload aggregated holdings</h3>
            <p className="text-sm text-gray-500 mb-3">
              Upload a CSV (e.g. rows6923.csv) to ingest. All accounts are saved; Heat Map shows only those with a mapped strategy.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {selectedFile && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-600">
                  Selected: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={forceReingest}
                    onChange={(e) => setForceReingest(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Force re-ingest (recalculate even if file unchanged)
                </label>
                <button
                  onClick={handleIngest}
                  disabled={ingesting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {ingesting ? 'Ingesting…' : 'Ingest CSV'}
                </button>
              </div>
            )}
            {ingestResult && (
              <div className="mt-4 p-3 bg-gray-50 rounded text-sm space-y-1">
                {ingestResult.duplicate_file_skipped && (
                  <p className="text-amber-800 font-medium">
                    Same file was already ingested; Heat map, Concentration, and By Adviser were not updated. Check &quot;Force re-ingest&quot; and click Ingest to recalculate.
                  </p>
                )}
                <p>Ingested: <strong>{ingestResult.ingested_count}</strong></p>
                <p>Skipped (unmapped): <strong>{ingestResult.skipped_count}</strong></p>
                {ingestResult.data_inconsistency_synthetic_ids.length > 0 && (
                  <p className="text-amber-700">
                    Data inconsistency (cash mismatch): {ingestResult.data_inconsistency_synthetic_ids.length} account(s) — {ingestResult.data_inconsistency_synthetic_ids.slice(0, 3).join(', ')}
                    {ingestResult.data_inconsistency_synthetic_ids.length > 3 ? '…' : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {activeTab === 'bridge' && <StrategyBridge />}
          {activeTab === 'heatmap' && (
            <HeatMap refreshTrigger={ingestResult?.last_ingest_at ?? null} />
          )}
          {activeTab === 'totalfirm' && <TotalFirm refreshTrigger={ingestResult?.last_ingest_at ?? null} />}
          {activeTab === 'concentration' && <ConcentrationReport refreshTrigger={ingestResult?.last_ingest_at ?? null} />}
          {activeTab === 'byadviser' && <AccountDetailsByAdviser refreshTrigger={ingestResult?.last_ingest_at ?? null} />}
        </div>
      </main>
    </div>
  );
};

export default MonitoringPage;
