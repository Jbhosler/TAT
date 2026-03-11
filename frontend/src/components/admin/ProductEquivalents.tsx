import { useState, useEffect, useRef } from 'react';
import { adminAPI, monitoringAPI } from '../../services/api';

type ProductEquivalentsProps = {
  strategies?: { id: string; name: string }[];
  onStrategiesRefresh?: () => void;
};

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { response?: { status?: number; data?: { detail?: unknown } }; code?: string; message?: string };
    if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
      return 'Recalculation timed out. The operation may still be running. Try the "Recalculate monitoring" button in a few minutes, or refresh the page.';
    }
    if (e.response?.status === 504) {
      return 'Recalculation took too long and was cancelled. Try the "Recalculate monitoring" button separately after a moment.';
    }
    if ('response' in e && e.response) {
      const detail = e.response?.data?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg || JSON.stringify(d)).join('; ');
    }
  }
  return 'An unexpected error occurred';
}

const ProductEquivalents = ({ strategies = [], onStrategiesRefresh }: ProductEquivalentsProps) => {
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [equivalents, setEquivalents] = useState<any[]>([]);
  const [csvContent, setCsvContent] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [recalculating, setRecalculating] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedStrategy) {
      loadEquivalents();
    } else {
      setEquivalents([]);
    }
  }, [selectedStrategy]);

  useEffect(() => {
    if (!actionMessage) return;
    const t = setTimeout(() => setActionMessage(null), 5000);
    return () => clearTimeout(t);
  }, [actionMessage]);

  useEffect(() => {
    if (!uploadSuccess) return;
    const t = setTimeout(() => setUploadSuccess(null), 5000);
    return () => clearTimeout(t);
  }, [uploadSuccess]);

  const loadEquivalents = async () => {
    if (!selectedStrategy) return;
    try {
      const response = await adminAPI.getProductEquivalents(selectedStrategy);
      const data = response.data;
      setEquivalents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load product equivalents:', err);
      setEquivalents([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setUploadError(null);
    setUploadSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      setCsvContent(content);
    };
    reader.onerror = () => {
      setUploadError('Failed to read file');
      setCsvContent('');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleUpload = async () => {
    setUploadError(null);
    setUploadSuccess(null);
    setActionMessage(null);

    if (!selectedStrategy) {
      setUploadError('Please select a strategy');
      return;
    }

    if (!csvContent) {
      setUploadError('Please upload a CSV file');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadStep(1);

    try {
      // Step 1: Pre-flight sanity check
      const preflight = await adminAPI.sanityCheckPreflight(selectedStrategy, csvContent);
      const data = preflight.data as {
        multi_mapping_conflicts?: unknown[];
        grade_inconsistencies?: unknown[];
        orphaned_model_tickers?: unknown[];
      };
      const conflicts =
        (data?.multi_mapping_conflicts?.length ?? 0) +
        (data?.grade_inconsistencies?.length ?? 0) +
        (data?.orphaned_model_tickers?.length ?? 0);
      if (conflicts > 0) {
        const proceed = window.confirm(
          `Sanity check found ${conflicts} potential conflict(s) after this upload. ` +
            'Review the Data Integrity tab to resolve. Do you want to proceed with the upload anyway?'
        );
        if (!proceed) {
          setUploading(false);
          setUploadStep(0);
          return;
        }
      }

      // Step 2: Upload CSV
      setUploadStep(2);
      const uploadRes = await adminAPI.uploadProductEquivalents(selectedStrategy, csvContent);
      const count = uploadRes?.data?.count ?? 0;

      // Step 3: Recalculate monitoring (longest step)
      setUploadStep(3);
      await monitoringAPI.recalculate({ strategy_id: selectedStrategy });

      // Step 4: Refresh equivalents list
      setUploadStep(4);
      setCsvContent('');
      setSelectedFileName(null);
      fileInputRef.current && (fileInputRef.current.value = '');
      await loadEquivalents();

      setUploadSuccess(`Uploaded ${count} row${count !== 1 ? 's' : ''}. Monitoring data recalculated.`);
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploading(false);
      setUploadStep(0);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product equivalent?')) {
      return;
    }
    setActionMessage(null);
    try {
      await adminAPI.deleteProductEquivalent(selectedStrategy, id);
      await monitoringAPI.recalculate({ strategy_id: selectedStrategy });
      setActionMessage({ type: 'success', text: 'Product equivalent deleted. Monitoring data recalculated.' });
      loadEquivalents();
    } catch (err) {
      setActionMessage({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const handleGradeChange = async (equivId: string, newGrade: number) => {
    setEquivalents((prev) =>
      prev.map((e) => (e.id === equivId ? { ...e, grade: newGrade } : e))
    );
    setActionMessage(null);
    try {
      await adminAPI.updateProductEquivalentGrade(selectedStrategy, equivId, newGrade);
      await loadEquivalents();
      setActionMessage({ type: 'success', text: 'Grade updated.' });
    } catch (err) {
      loadEquivalents().catch(() => {});
      setActionMessage({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const handleRecalculate = async () => {
    if (!selectedStrategy) {
      setActionMessage({ type: 'error', text: 'Select a strategy first' });
      return;
    }
    setActionMessage(null);
    setRecalculating(true);
    try {
      await monitoringAPI.recalculate({ strategy_id: selectedStrategy });
      setActionMessage({ type: 'success', text: 'Monitoring recalculated successfully.' });
    } catch (err) {
      setActionMessage({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Product Equivalents (GE_Alt.csv)
      </h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Strategy
          </label>
          {onStrategiesRefresh && strategies.length === 0 && (
            <div className="mb-2 p-2 rounded-md bg-amber-50 text-amber-800 text-sm">
              No strategies loaded. Try{' '}
              <button type="button" onClick={onStrategiesRefresh} className="underline font-medium">
                Retry
              </button>
            </div>
          )}
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
          >
            <option value="">
              {strategies.length === 0 ? 'No strategies found' : 'Select a strategy'}
            </option>
            {strategies.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {selectedStrategy && (
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={recalculating}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {recalculating ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Recalculating…
                </>
              ) : (
                'Recalculate monitoring (run after grade changes)'
              )}
            </button>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload CSV
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Format: Ticker, Alternate, Buy Control, Sell Control, Custodian, Notes, Description. Also supports Legacy Ticker, Model Ticker. Grade is optional; set in app for any without a grade.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {selectedFileName && (
            <p className="mt-1 text-sm text-gray-600">
              Selected: <strong>{selectedFileName}</strong>
            </p>
          )}
          {uploadError && (
            <p className="mt-1 text-sm text-red-600">{uploadError}</p>
          )}
          {uploadSuccess && (
            <p className="mt-1 text-sm text-green-600">{uploadSuccess}</p>
          )}
        </div>

        {csvContent && (
          <div className="space-y-2">
            {uploading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>
                    {uploadStep === 1 && 'Checking for conflicts…'}
                    {uploadStep === 2 && 'Uploading CSV…'}
                    {uploadStep === 3 && 'Recalculating monitoring data… (may take a few minutes)'}
                    {uploadStep === 4 && 'Refreshing…'}
                  </span>
                  <span>Step {uploadStep} of 4</span>
                </div>
                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                    style={{ width: `${(uploadStep / 4) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {uploadStep === 1 && 'Checking for conflicts…'}
                  {uploadStep === 2 && 'Uploading CSV…'}
                  {uploadStep === 3 && 'Recalculating monitoring data… (may take a few minutes)'}
                  {uploadStep === 4 && 'Refreshing…'}
                </>
              ) : (
                'Upload CSV'
              )}
            </button>
          </div>
        )}

        {actionMessage && (
          <div
            className={`p-3 rounded-md text-sm ${
              actionMessage.type === 'success'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        {equivalents.length > 0 && (
          <>
            {(() => {
              const withoutGrade = equivalents.filter((e) => e.grade == null);
              const withGrade = equivalents.filter((e) => e.grade != null);
              return (
                <>
                  {withoutGrade.length > 0 && (
                    <div className="border-l-4 border-amber-400 bg-amber-50/50 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-amber-800 mb-2">
                        Equivalents without grade ({withoutGrade.length})
                      </h3>
                      <p className="text-xs text-amber-700 mb-3">
                        Assign a grade (0, 1, or 2) for each. These will not affect monitoring until a grade is set.
                      </p>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-amber-100/50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Ticker</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Alternate</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Buy Control</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Sell Control</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Assign Grade</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {withoutGrade.map((equiv) => (
                              <tr key={equiv.id}>
                                <td className="px-4 py-2 text-sm text-gray-900">{equiv.model_ticker}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{equiv.legacy_ticker}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{equiv.buy_control ?? '—'}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{equiv.sell_control ?? '—'}</td>
                                <td className="px-4 py-2 text-sm">
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v !== '') handleGradeChange(equiv.id, parseInt(v, 10));
                                    }}
                                    className="rounded-md border-amber-400 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm"
                                  >
                                    <option value="">— Set grade —</option>
                                    <option value={0}>0</option>
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                  </select>
                                </td>
                                <td className="px-4 py-2 text-sm">
                                  <button onClick={() => handleDelete(equiv.id)} className="text-red-600 hover:text-red-800">Delete</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-4">
                      Current Product Equivalents
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alternate</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buy Control</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sell Control</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Custodian</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated At</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {withGrade.map((equiv) => (
                            <tr key={equiv.id}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{equiv.model_ticker}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{equiv.legacy_ticker}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{equiv.buy_control ?? '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{equiv.sell_control ?? '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{equiv.custodian ?? '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{equiv.notes ?? '—'}</td>
                              <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate" title={equiv.description ?? ''}>{equiv.description ?? '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm">
                                <select
                                  value={equiv.grade}
                                  onChange={(e) => handleGradeChange(equiv.id, parseInt(e.target.value, 10))}
                                  className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                >
                                  <option value={0}>0</option>
                                  <option value={1}>1</option>
                                  <option value={2}>2</option>
                                </select>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {equiv.updated_at ? new Date(equiv.updated_at).toLocaleString() : '—'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm">
                                <button onClick={() => handleDelete(equiv.id)} className="text-red-600 hover:text-red-800">Delete</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {withGrade.length === 0 && (
                      <p className="text-sm text-gray-500 py-2">All equivalents need a grade. Assign grades above.</p>
                    )}
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default ProductEquivalents;
