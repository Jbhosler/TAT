import { useState, useEffect } from 'react';
import { adminAPI, strategiesAPI } from '../../services/api';

const ProductEquivalents = () => {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [equivalents, setEquivalents] = useState<any[]>([]);
  const [csvContent, setCsvContent] = useState('');

  useEffect(() => {
    loadStrategies();
  }, []);

  useEffect(() => {
    if (selectedStrategy) {
      loadEquivalents();
    }
  }, [selectedStrategy]);

  const loadStrategies = async () => {
    try {
      const response = await strategiesAPI.list();
      setStrategies(response.data);
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  const loadEquivalents = async () => {
    try {
      const response = await adminAPI.getProductEquivalents(selectedStrategy);
      setEquivalents(response.data);
    } catch (err) {
      console.error('Failed to load product equivalents:', err);
      setEquivalents([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!selectedStrategy) {
      alert('Please select a strategy');
      return;
    }

    if (!csvContent) {
      alert('Please upload a CSV file');
      return;
    }

    // Pre-flight: run sanity check with proposed CSV and warn of potential new conflicts
    try {
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
        if (!proceed) return;
      }
    } catch (_) {
      // Preflight failed (e.g. invalid CSV); continue to upload which will surface the error
    }

    try {
      await adminAPI.uploadProductEquivalents(selectedStrategy, csvContent);
      alert('Product equivalents uploaded successfully');
      setCsvContent('');
      loadEquivalents();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to upload CSV');
    }
  };

  const handleDelete = async (_id: string) => {
    if (!confirm('Are you sure you want to delete this product equivalent?')) {
      return;
    }

    // Implementation would call delete API endpoint
    alert('Delete functionality pending API implementation');
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
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
          >
            <option value="">Select a strategy</option>
            {strategies.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload GE_Alt.csv
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Format: Legacy Ticker, Model Ticker, Grade (0, 1, or 2)
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        {csvContent && (
          <button
            onClick={handleUpload}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Upload CSV
          </button>
        )}

        {equivalents.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-4">
              Current Product Equivalents
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Legacy Ticker
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Model Ticker
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Grade
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Updated At
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {equivalents.map((equiv) => (
                    <tr key={equiv.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {equiv.legacy_ticker}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {equiv.model_ticker}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {equiv.grade}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {equiv.updated_at
                          ? new Date(equiv.updated_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleDelete(equiv.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductEquivalents;
