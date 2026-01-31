import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StrategyBridge from './monitoring/StrategyBridge';
import HeatMap from './monitoring/HeatMap';
import ConcentrationReport from './monitoring/ConcentrationReport';
import AccountDrillDown from './monitoring/AccountDrillDown';
import { monitoringAPI } from '../services/api';

const MonitoringPage = () => {
  const { id: accountId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'bridge' | 'heatmap' | 'concentration'>('bridge');
  const [csvContent, setCsvContent] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{
    ingested_count: number;
    skipped_count: number;
    data_inconsistency_synthetic_ids: string[];
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvContent((event.target?.result as string) || '');
      setIngestResult(null);
    };
    reader.readAsText(file);
  };

  const handleIngest = async () => {
    if (!csvContent.trim()) {
      alert('Upload a CSV file first.');
      return;
    }
    setIngesting(true);
    setIngestResult(null);
    try {
      const res = await monitoringAPI.ingest(csvContent);
      setIngestResult(res.data);
      if (res.data.ingested_count > 0) {
        setCsvContent('');
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ingest failed');
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
              onClick={() => setActiveTab('concentration')}
              className={`${
                activeTab === 'concentration'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Concentration
            </button>
          </nav>
        </div>

        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload aggregated holdings</h3>
            <p className="text-sm text-gray-500 mb-3">
              Upload a CSV (e.g. rows6923.csv) to ingest. Only accounts with a strategy mapping and consistent cash are saved.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {csvContent && (
              <button
                onClick={handleIngest}
                disabled={ingesting}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {ingesting ? 'Ingesting…' : 'Ingest CSV'}
              </button>
            )}
            {ingestResult && (
              <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
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
          {activeTab === 'heatmap' && <HeatMap />}
          {activeTab === 'concentration' && <ConcentrationReport />}
        </div>
      </main>
    </div>
  );
};

export default MonitoringPage;
