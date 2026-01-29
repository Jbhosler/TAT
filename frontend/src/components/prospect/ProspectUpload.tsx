import { useState } from 'react';
import { prospectsAPI } from '../../services/api';

interface ProspectUploadProps {
  strategies: any[];
  selectedStrategyId: string;
  onStrategyChange: (id: string) => void;
  onUploadComplete: (prospectId: string) => void;
  /** When true, strategy is chosen on Dashboard; hide duplicate selector here */
  hideStrategySelector?: boolean;
}

interface ManualHolding {
  ticker: string;
  value: string;
  unrealized_gain_loss: string;
}

const CSV_HEADER = 'Ticker,Value ($),Unrealized Gain/Loss ($)';

const ProspectUpload = ({
  strategies,
  selectedStrategyId,
  onStrategyChange,
  onUploadComplete,
  hideStrategySelector = false,
}: ProspectUploadProps) => {
  const [prospectName, setProspectName] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [inputMode, setInputMode] = useState<'upload' | 'manual'>('manual');
  const [manualHoldings, setManualHoldings] = useState<ManualHolding[]>([
    { ticker: '', value: '', unrealized_gain_loss: '' },
  ]);

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

  const buildCsvFromManualHoldings = (): string => {
    const rows = manualHoldings
      .filter((r) => r.ticker.trim() !== '')
      .map((r) => {
        const value = r.value.trim().replace(/[$,]/g, '') || '0';
        const gainLoss = r.unrealized_gain_loss.trim().replace(/[$,]/g, '') || '0';
        return `${r.ticker.trim()},${value},${gainLoss}`;
      });
    return [CSV_HEADER, ...rows].join('\n');
  };

  const handleAddManualRow = () => {
    setManualHoldings([...manualHoldings, { ticker: '', value: '', unrealized_gain_loss: '' }]);
  };

  const handleRemoveManualRow = (index: number) => {
    if (manualHoldings.length <= 1) return;
    setManualHoldings(manualHoldings.filter((_, i) => i !== index));
  };

  const handleManualHoldingChange = (index: number, field: keyof ManualHolding, value: string) => {
    const updated = [...manualHoldings];
    updated[index] = { ...updated[index], [field]: value };
    setManualHoldings(updated);
  };

  const getContentToUpload = (): string | null => {
    if (inputMode === 'upload') return csvContent || null;
    const csv = buildCsvFromManualHoldings();
    return csv.length > CSV_HEADER.length ? csv : null;
  };

  const canSubmitManual = (): boolean => {
    const filled = manualHoldings.filter((r) => r.ticker.trim() !== '' && r.value.trim() !== '');
    return filled.length > 0;
  };

  const handleUpload = async () => {
    if (!selectedStrategyId) {
      alert('Please select a strategy');
      return;
    }

    if (!prospectName.trim()) {
      alert('Please enter a prospect name');
      return;
    }

    const content = getContentToUpload();
    if (!content) {
      if (inputMode === 'manual') {
        alert('Add at least one holding with Ticker and Value.');
      } else {
        alert('Please upload a CSV file or enter holdings manually.');
      }
      return;
    }

    setLoading(true);
    try {
      const response = await prospectsAPI.upload(selectedStrategyId, prospectName, content);
      onUploadComplete(response.data.id);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to upload prospect');
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled =
    loading ||
    !selectedStrategyId ||
    !prospectName.trim() ||
    (inputMode === 'upload' ? !csvContent : !canSubmitManual());

  return (
    <div className="space-y-6">
      {!hideStrategySelector && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Strategy
          </label>
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={selectedStrategyId}
            onChange={(e) => onStrategyChange(e.target.value)}
          >
            <option value="">Select a strategy</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Prospect name
        </label>
          <input
            type="text"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={prospectName}
            onChange={(e) => setProspectName(e.target.value)}
            placeholder="Enter prospect name"
          />
        </div>

        {/* Input mode: Manual entry vs CSV upload */}
        <div>
          <div className="flex gap-4 mb-3">
            <button
              type="button"
              onClick={() => setInputMode('manual')}
              className={`text-sm font-medium px-3 py-2 rounded-md ${
                inputMode === 'manual'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Enter manually
            </button>
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={`text-sm font-medium px-3 py-2 rounded-md ${
                inputMode === 'upload'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Upload CSV
            </button>
          </div>

          {inputMode === 'manual' ? (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Holdings</span>
                <button
                  type="button"
                  onClick={handleAddManualRow}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  + Add row
                </button>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-md">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Ticker
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Value ($)
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Unrealized Gain/Loss ($)
                      </th>
                      <th className="px-3 py-2 w-20" />
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {manualHoldings.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className="block w-full rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            value={row.ticker}
                            onChange={(e) =>
                              handleManualHoldingChange(index, 'ticker', e.target.value)
                            }
                            placeholder="e.g. AAPL"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className="block w-full rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            value={row.value}
                            onChange={(e) =>
                              handleManualHoldingChange(index, 'value', e.target.value)
                            }
                            placeholder="e.g. 10000"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className="block w-full rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            value={row.unrealized_gain_loss}
                            onChange={(e) =>
                              handleManualHoldingChange(index, 'unrealized_gain_loss', e.target.value)
                            }
                            placeholder="e.g. 500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveManualRow(index)}
                            disabled={manualHoldings.length <= 1}
                            className="text-red-600 hover:text-red-800 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Add at least one holding with Ticker and Value. Unrealized Gain/Loss can be 0 or
                blank.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Prospect CSV
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Format: Ticker, Value ($), Unrealized Gain/Loss ($)
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {preview.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Preview</h3>
                  <div className="overflow-x-auto border border-gray-200 rounded-md">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(preview[0]).map((header) => (
                            <th
                              key={header}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {preview.slice(0, 5).map((row, index) => (
                          <tr key={index}>
                            {Object.values(row).map((value: any, i) => (
                              <td
                                key={i}
                                className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
                              >
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
            </div>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={isSubmitDisabled}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? 'Creating prospect...' : 'Create prospect'}
        </button>
      </div>
  );
};


export default ProspectUpload;
