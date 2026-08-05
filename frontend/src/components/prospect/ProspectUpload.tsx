import { useEffect, useState } from 'react';
import { prospectsAPI } from '../../services/api';
import StrategyBlendSelector, {
  blendPayloadFromSelection,
  isStrategySelectionReady,
  primaryStrategyIdFromSelection,
  type StrategySelection,
} from './StrategyBlendSelector';

interface ProspectUploadProps {
  strategies: any[];
  strategySelection: StrategySelection;
  onStrategySelectionChange: (selection: StrategySelection) => void;
  onUploadComplete: (prospectId: string) => void;
  /** When set, edit an existing prospect's holdings instead of creating a new one */
  prospectId?: string | null;
  onHoldingsSaved?: (meta: { holdingCount: number }) => void;
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
  strategySelection,
  onStrategySelectionChange,
  onUploadComplete,
  prospectId = null,
  onHoldingsSaved,
  hideStrategySelector = false,
}: ProspectUploadProps) => {
  const isEditMode = Boolean(prospectId);
  const [prospectName, setProspectName] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [inputMode, setInputMode] = useState<'upload' | 'manual'>('manual');
  const [manualHoldings, setManualHoldings] = useState<ManualHolding[]>([
    { ticker: '', value: '', unrealized_gain_loss: '' },
  ]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!prospectId) return;
    let cancelled = false;
    (async () => {
      setLoadingExisting(true);
      try {
        const res = await prospectsAPI.get(prospectId);
        if (cancelled) return;
        setProspectName(res.data.name || '');
        const rows = (res.data.holdings || []).map((h: any) => ({
          ticker: h.ticker,
          value: String(h.value),
          unrealized_gain_loss: String(h.unrealized_gain_loss ?? 0),
        }));
        setManualHoldings(rows.length > 0 ? rows : [{ ticker: '', value: '', unrealized_gain_loss: '' }]);
        setInputMode('manual');
      } catch (err) {
        console.error('Failed to load prospect holdings:', err);
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prospectId]);

  const applyCsvToManualHoldings = (content: string) => {
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return false;
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const tickerIdx = headers.findIndex((h) => h.includes('ticker'));
    const valueIdx = headers.findIndex((h) => h.includes('value'));
    const gainIdx = headers.findIndex((h) => h.includes('gain') || h.includes('loss'));
    if (tickerIdx < 0 || valueIdx < 0) return false;
    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      return {
        ticker: values[tickerIdx] || '',
        value: (values[valueIdx] || '').replace(/[$,]/g, ''),
        unrealized_gain_loss: (gainIdx >= 0 ? values[gainIdx] || '0' : '0').replace(/[$,]/g, ''),
      };
    }).filter((r) => r.ticker);
    if (rows.length === 0) return false;
    setManualHoldings(rows);
    setInputMode('manual');
    return true;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      parseCSV(content);
      if (isEditMode) {
        applyCsvToManualHoldings(content);
      }
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

  const filledHoldings = manualHoldings.filter(
    (r) => r.ticker.trim() !== '' && r.value.trim() !== ''
  );
  const holdingsTotalValue = filledHoldings.reduce(
    (sum, r) => sum + (parseFloat(r.value.trim().replace(/[$,]/g, '')) || 0),
    0
  );

  const handleUpload = async () => {
    setSaveError(null);
    setSaveMessage(null);

    if (!isStrategySelectionReady(strategySelection)) {
      setSaveError('Select a strategy or complete a valid blend (weights must sum to 100%).');
      return;
    }

    const strategyId = primaryStrategyIdFromSelection(strategySelection);
    const strategyBlend = blendPayloadFromSelection(strategySelection);

    if (!prospectName.trim()) {
      setSaveError('Enter a prospect name.');
      return;
    }

    const content = getContentToUpload();
    if (!content) {
      setSaveError(
        inputMode === 'manual'
          ? 'Add at least one holding with Ticker and Value.'
          : 'Upload a CSV file or enter holdings manually.'
      );
      return;
    }

    setLoading(true);
    try {
      if (isEditMode && prospectId) {
        const holdings = filledHoldings.map((r) => ({
          ticker: r.ticker.trim(),
          value: parseFloat(r.value.trim().replace(/[$,]/g, '')) || 0,
          unrealized_gain_loss:
            parseFloat(r.unrealized_gain_loss.trim().replace(/[$,]/g, '')) || 0,
        }));
        await prospectsAPI.updateHoldings(prospectId, {
          name: prospectName.trim(),
          holdings,
        });
        if (pdfFile) {
          try {
            await prospectsAPI.uploadDocument(prospectId, pdfFile);
          } catch (docErr: any) {
            setSaveError(docErr.response?.data?.detail || 'Holdings saved but PDF upload failed.');
          }
          setPdfFile(null);
        }
        setSaveMessage(
          `Saved ${holdings.length} holding${holdings.length === 1 ? '' : 's'}. Review classification and associations before recalculating.`
        );
        onHoldingsSaved?.({ holdingCount: holdings.length });
      } else {
        const response = await prospectsAPI.upload(
          strategyId,
          prospectName,
          content,
          strategyBlend
        );
        const newProspectId = response.data.id;
        if (pdfFile) {
          try {
            await prospectsAPI.uploadDocument(newProspectId, pdfFile);
          } catch (docErr: any) {
            setSaveError(docErr.response?.data?.detail || 'Prospect created but PDF upload failed.');
          }
          setPdfFile(null);
        }
        onUploadComplete(newProspectId);
      }
    } catch (err: any) {
      setSaveError(
        err.response?.data?.detail ||
          (isEditMode ? 'Failed to save holdings' : 'Failed to upload prospect')
      );
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled =
    loading ||
    (!isEditMode && !isStrategySelectionReady(strategySelection)) ||
    !prospectName.trim() ||
    (isEditMode ? !canSubmitManual() : inputMode === 'upload' ? !csvContent : !canSubmitManual());

  if (loadingExisting) {
    return <p className="text-sm text-gray-600">Loading holdings…</p>;
  }

  return (
    <div className="space-y-6">
      {!hideStrategySelector && (
        <StrategyBlendSelector
          strategies={strategies}
          selection={strategySelection}
          onChange={onStrategySelectionChange}
        />
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Optional: Attach PDF
        </label>
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
        />
        {pdfFile && (
          <p className="mt-1 text-sm text-gray-500">
            Selected: {pdfFile.name}
          </p>
        )}
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
              <div className="flex justify-between items-center mb-2 gap-3 flex-wrap">
                <div>
                  <span className="text-sm font-medium text-gray-700">Holdings</span>
                  {filledHoldings.length > 0 && (
                    <span className="ml-2 text-xs text-gray-500">
                      {filledHoldings.length} row{filledHoldings.length === 1 ? '' : 's'} · $
                      {holdingsTotalValue.toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}{' '}
                      total
                    </span>
                  )}
                </div>
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
                {isEditMode && (
                  <> — CSV rows load into the table below; click <strong>Save holdings</strong> when ready.</>
                )}
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {preview.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Preview ({preview.length} row{preview.length !== 1 ? 's' : ''})
                  </h3>
                  <div className="overflow-x-auto max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
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
                        {preview.map((row, index) => (
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

        {saveError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
            {saveError}
          </div>
        )}
        {saveMessage && !saveError && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            {saveMessage}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={isSubmitDisabled}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading
            ? isEditMode
              ? 'Saving holdings...'
              : 'Creating prospect...'
            : isEditMode
              ? 'Save holdings'
              : 'Create prospect & continue'}
        </button>
      </div>
  );
};


export default ProspectUpload;
