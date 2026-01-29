import { useState } from 'react';
import { strategiesAPI } from '../../services/api';

const BulkUpload = () => {
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // Strategies list will be loaded when needed
  // const [strategies, setStrategies] = useState<any[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      parseCSV(content);
    };
    reader.readAsText(file);
  };

  const parseCSV = (content: string) => {
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    const parsed = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index];
        return obj;
      }, {} as any);
    });

    setPreview(parsed);
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

    setLoading(true);
    try {
      await strategiesAPI.bulkUpload(selectedStrategy, csvContent);
      alert('Strategy updated successfully');
      setCsvContent('');
      setPreview([]);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to upload CSV');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Bulk Strategy Upload
      </h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Strategy
          </label>
          <input
            type="text"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            placeholder="Enter strategy ID or name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload CSV File
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Format: Strategy Name, Model Ticker, Asset Class, Target %, Drift %
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        {preview.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Preview</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {Object.keys(preview[0]).map(header => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview.slice(0, 5).map((row, index) => (
                    <tr key={index}>
                      {Object.values(row).map((value: any, i) => (
                        <td key={i} className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={loading || !csvContent || !selectedStrategy}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? 'Uploading...' : 'Upload CSV'}
        </button>
      </div>
    </div>
  );
};

export default BulkUpload;
