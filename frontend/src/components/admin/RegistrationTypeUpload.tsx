import { useState } from 'react';
import { adminAPI } from '../../services/api';

const RegistrationTypeUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    updated_count: number;
    matched_count?: number;
    file_row_count?: number;
    fallback_matched?: number;
    diagnostics?: {
      sample_file_values: { advisor?: string; model?: string; last4?: string };
      db_advisors_sample: string[];
      db_models_sample: string[];
      db_accounts_with_last4: Array<{ advisor: string | null; account_display: string | null; external_model_name: string | null }>;
      hint: string;
    };
  } | null>(null);
  const [sample, setSample] = useState<{
    sample_accounts: Array<{ advisor: string | null; account_display: string | null; external_model_name: string | null; firm: string | null }>;
    distinct_advisors: string[];
    distinct_models: string[];
    note: string;
  } | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const loadSample = async () => {
    setLoadingSample(true);
    try {
      const res = await adminAPI.getRegistrationTypeSample(50);
      setSample(res.data);
    } catch (err) {
      console.error('Failed to load sample:', err);
      setSample(null);
    } finally {
      setLoadingSample(false);
    }
  };

  const downloadSampleCsv = () => {
    if (!sample?.sample_accounts?.length) return;
    const headers = ['Adviser', 'Account', 'Product', 'Firm', 'Enterprise', 'Registration Type'];
    const rows = sample.sample_accounts.map((a) => [
      a.advisor ?? '',
      a.account_display ?? '',
      a.external_model_name ?? '',
      a.firm ?? '',
      '', // Enterprise - must match aggregated holdings; not stored in DB
      'Retirement', // placeholder - user fills in
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registration-type-format-from-db.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setResult(null);
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Choose a CSV file first.');
      return;
    }
    setUploading(true);
    setResult(null);
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
        setUploading(false);
        return;
      }
      const res = await adminAPI.uploadRegistrationType(csvContent);
      setResult(res.data);
      if (res.data.updated_count > 0) {
        setSelectedFile(null);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Registration Type</h3>
      <p className="text-sm text-gray-500 mb-3">
        Upload a CSV with account data and Registration Type (Retirement, Taxable, Trust). The upload automatically
        transforms: Account Number → masked format (*****1234), Advisor → &quot;Last, First&quot;, Firm → abbreviated.
        Include Account Number column (e.g. xxxx-5265) for matching.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={loadSample}
          disabled={loadingSample}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loadingSample ? 'Loading…' : 'Load sample from DB'}
        </button>
        {sample && (
          <button
            type="button"
            onClick={downloadSampleCsv}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Download sample CSV
          </button>
        )}
      </div>
      {sample && (
        <div className="mb-3 p-3 bg-gray-50 rounded text-xs text-gray-600">
          <p className="font-medium mb-1">DB format (from aggregated holdings ingest):</p>
          <p>Advisors sample: {sample.distinct_advisors.slice(0, 5).join(', ')}{sample.distinct_advisors.length > 5 ? '…' : ''}</p>
          <p>Models sample: {sample.distinct_models.slice(0, 5).join(', ')}{sample.distinct_models.length > 5 ? '…' : ''}</p>
          <p className="mt-1 italic">{sample.note}</p>
          <p className="mt-1 text-amber-700">Enterprise is not stored in DB; your file must use the same Enterprise value as the aggregated holdings file.</p>
        </div>
      )}
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
      />
      {selectedFile && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">
              Selected: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)
            </span>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading…
                </>
              ) : (
                'Upload CSV'
              )}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className={`mt-4 p-4 rounded-lg border ${result.updated_count > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`text-sm font-medium ${result.updated_count > 0 ? 'text-green-800' : 'text-amber-800'}`}>
            {result.message}
          </p>
          <p className={`text-sm mt-1 ${result.updated_count > 0 ? 'text-green-700' : 'text-amber-700'}`}>
            Updated {result.updated_count} account(s)
            {result.file_row_count != null && ` (${result.file_row_count} rows in file)`}
            {result.fallback_matched != null && result.fallback_matched > 0 && (
              <> — {result.fallback_matched} matched via fallback (advisor + last 4 digits + Product)</>
            )}
          </p>
          {result.diagnostics && (
            <div className="mt-3 pt-3 border-t border-amber-200 text-xs text-amber-800 space-y-2">
              <p className="font-medium">Diagnostics (no matches) — compare your file to DB:</p>
              <p><strong>Your file (row 1):</strong> advisor=&quot;{result.diagnostics.sample_file_values.advisor}&quot;, model=&quot;{result.diagnostics.sample_file_values.model}&quot;, last4=&quot;{result.diagnostics.sample_file_values.last4}&quot;</p>
              <p><strong>DB advisors (sample):</strong> {result.diagnostics.db_advisors_sample.join(', ') || '—'}</p>
              <p><strong>DB models (sample):</strong> {result.diagnostics.db_models_sample.join(', ') || '—'}</p>
              {result.diagnostics.db_accounts_with_last4.length > 0 && (
                <p><strong>DB accounts with last4 {result.diagnostics.sample_file_values.last4}:</strong>{' '}
                  {result.diagnostics.db_accounts_with_last4.map((a) => `${a.advisor} / ${a.account_display} / ${a.external_model_name}`).join('; ')}
                </p>
              )}
              <p className="italic">{result.diagnostics.hint}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RegistrationTypeUpload;
