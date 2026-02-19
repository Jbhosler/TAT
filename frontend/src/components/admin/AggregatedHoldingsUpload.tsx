import { useState } from 'react';
import { Link } from 'react-router-dom';
import { monitoringAPI } from '../../services/api';

const AggregatedHoldingsUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ingesting, setIngesting] = useState(false);
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
    e.target.value = '';
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
      const res = await monitoringAPI.ingest(csvContent, { force: true });
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

  return (
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
          <p>Ingested: <strong>{ingestResult.ingested_count}</strong></p>
          <p>Skipped (unmapped): <strong>{ingestResult.skipped_count}</strong></p>
          <p>
            <Link to="/monitoring" className="text-indigo-600 hover:text-indigo-800 font-medium">
              View changes from prior upload →
            </Link>
          </p>
          {ingestResult.data_inconsistency_synthetic_ids.length > 0 && (
            <p className="text-amber-700">
              Data inconsistency (cash mismatch): {ingestResult.data_inconsistency_synthetic_ids.length} account(s) — {ingestResult.data_inconsistency_synthetic_ids.slice(0, 3).join(', ')}
              {ingestResult.data_inconsistency_synthetic_ids.length > 3 ? '…' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AggregatedHoldingsUpload;
