import { useState, useEffect } from 'react';
import { strategiesAPI, adminAPI } from '../../services/api';

interface Strategy {
  id: string;
  name: string;
  version: number;
  positions: Array<{
    id: string;
    model_ticker: string;
    asset_class: string;
    target_allocation: number;
    drift_percentage: number;
  }>;
}

interface Position {
  model_ticker: string;
  asset_class: string;
  target_allocation: number;
  drift_percentage: number;
}

const ALLOCATION_TOLERANCE = 0.001; // 0.1% - matches backend
const TARGET_TOTAL = 100;

function roundToTenthPct(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const StrategyEditor = () => {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [strategyName, setStrategyName] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    loadStrategies();
    adminAPI.getAssetClasses().then((r) => setAssetClasses(r.data || [])).catch(() => setAssetClasses([]));
  }, []);

  useEffect(() => {
    if (selectedStrategy) {
      setStrategyName(selectedStrategy.name);
      setPositions(selectedStrategy.positions.map(p => ({
        model_ticker: p.model_ticker,
        asset_class: p.asset_class,
        target_allocation: p.target_allocation,
        drift_percentage: p.drift_percentage,
      })));
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

  const handleAddPosition = () => {
    setPositions([...positions, {
      model_ticker: '',
      asset_class: 'US Large Core',
      target_allocation: 0,
      drift_percentage: 0,
    }]);
  };

  const handleRemovePosition = (index: number) => {
    setPositions(positions.filter((_, i) => i !== index));
  };

  const handlePositionChange = (index: number, field: string, value: any) => {
    const updated = [...positions];
    updated[index] = { ...updated[index], [field]: value };
    setPositions(updated);
    setValidationErrors([]);
  };

  // Running total of target allocations (0.1% precision)
  const allocationTotal = roundToTenthPct(
    positions.reduce((sum, p) => sum + (Number(p.target_allocation) || 0), 0)
  );
  const isTotalValid = Math.abs(allocationTotal - TARGET_TOTAL) <= ALLOCATION_TOLERANCE;

  // Complete-input validation: name, at least one position, every position filled, total = 100%
  function validate(): string[] {
    const errors: string[] = [];
    if (!strategyName.trim()) errors.push('Enter a strategy name.');
    if (positions.length === 0) errors.push('Add at least one position.');
    positions.forEach((p, i) => {
      if (!String(p.model_ticker).trim()) errors.push(`Position ${i + 1}: Model ticker is required.`);
      const t = Number(p.target_allocation);
      const d = Number(p.drift_percentage);
      if (isNaN(t) || t < 0 || t > 100) errors.push(`Position ${i + 1}: Target % must be 0–100.`);
      if (isNaN(d) || d < 0 || d > 100) errors.push(`Position ${i + 1}: Drift % must be 0–100.`);
    });
    if (positions.length > 0 && !isTotalValid)
      errors.push(`Target allocations must sum to 100%. Current total: ${allocationTotal.toFixed(3)}%.`);
    return errors;
  }

  const canSave = (): boolean => {
    if (!strategyName.trim() || positions.length === 0) return false;
    if (!isTotalValid) return false;
    return positions.every(
      (p) =>
        String(p.model_ticker).trim() !== '' &&
        !isNaN(Number(p.target_allocation)) &&
        Number(p.target_allocation) >= 0 &&
        Number(p.target_allocation) <= 100 &&
        !isNaN(Number(p.drift_percentage)) &&
        Number(p.drift_percentage) >= 0 &&
        Number(p.drift_percentage) <= 100
    );
  };

  const handleSave = async () => {
    const errors = validate();
    if (errors.length > 0) {
      setValidationErrors(errors);
      alert(errors.join('\n'));
      return;
    }
    setValidationErrors([]);

    setLoading(true);
    try {
      const data = {
        name: strategyName,
        positions: positions.map(p => ({
          model_ticker: p.model_ticker,
          asset_class: p.asset_class,
          target_allocation: parseFloat(p.target_allocation.toString()),
          drift_percentage: parseFloat(p.drift_percentage.toString()),
        })),
      };

      if (selectedStrategy) {
        await strategiesAPI.update(selectedStrategy.id, data);
      } else {
        await strategiesAPI.create(data);
      }

      alert('Strategy saved successfully');
      loadStrategies();
      setSelectedStrategy(null);
      setStrategyName('');
      setPositions([]);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save strategy');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedStrategy) return;
    if (!window.confirm(`Delete strategy "${selectedStrategy.name}"? This will remove all positions and product equivalents. This cannot be undone.`)) {
      return;
    }
    setLoading(true);
    try {
      await strategiesAPI.delete(selectedStrategy.id);
      alert('Strategy deleted successfully');
      loadStrategies();
      setSelectedStrategy(null);
      setStrategyName('');
      setPositions([]);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete strategy');
    } finally {
      setLoading(false);
    }
  };

  const assetClassesFallback = assetClasses.length > 0 ? assetClasses : [
    'US Large Core', 'US Large Growth', 'US Large Value', 'US Midcap Growth', 'US Midcap Value',
    'US Small Cap', 'International Developed', 'Emerging Markets', 'Fixed Income',
    'Emg Bond LC', 'Emg Bond Hedged', 'ST Corp', 'IT Corp', 'LT Corp', 'ST Govt', 'IT Govt', 'LT Govt',
    'Tactical Cash', 'Ultra ST Bond', 'Aggregate', 'Mortgage Backed', 'Inflation Protection',
    'ST High Yield', 'High Yield', 'Private Credit', 'International Bond', 'Cash',
  ];

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Strategy Editor
      </h2>

      {/* Strategy Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Strategy
        </label>
        <select
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          value={selectedStrategy?.id || ''}
          onChange={(e) => {
            const strategy = strategies.find(s => s.id === e.target.value);
            setSelectedStrategy(strategy || null);
          }}
        >
          <option value="">Create New Strategy</option>
          {strategies.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} (v{s.version})
            </option>
          ))}
        </select>
      </div>

      {/* Strategy Name */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Strategy Name
        </label>
        <input
          type="text"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          value={strategyName}
          onChange={(e) => {
            setStrategyName(e.target.value);
            setValidationErrors([]);
          }}
          placeholder="Enter strategy name"
        />
      </div>

      {/* Positions */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Positions
          </label>
          <div className="flex items-center gap-4">
            <span
              className={`text-sm font-medium ${
                isTotalValid ? 'text-green-700' : 'text-amber-700'
              }`}
              title="Target allocations must sum to 100%"
            >
              Total: {allocationTotal.toFixed(3)}%
              {!isTotalValid && positions.length > 0 && ' (must be 100%)'}
            </span>
            <button
              onClick={handleAddPosition}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              + Add Position
            </button>
          </div>
        </div>
        {validationErrors.length > 0 && (
          <ul className="mb-4 text-sm text-red-600 list-disc list-inside">
            {validationErrors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}

        <div className="space-y-4">
          {positions.map((pos, index) => (
            <div key={index} className="grid grid-cols-5 gap-4 items-end border p-4 rounded">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Model Ticker
                </label>
                <input
                  type="text"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={pos.model_ticker}
                  onChange={(e) => handlePositionChange(index, 'model_ticker', e.target.value)}
                  placeholder="SPYM"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Asset Class
                </label>
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={pos.asset_class}
                  onChange={(e) => {
                    const ac = e.target.value;
                    const updated = [...positions];
                    updated[index] = { ...updated[index], asset_class: ac };
                    if (ac === 'Cash' && !String(updated[index].model_ticker).trim()) {
                      updated[index].model_ticker = 'Cash';
                    }
                    setPositions(updated);
                    setValidationErrors([]);
                  }}
                >
                  {assetClassesFallback.map(ac => (
                    <option key={ac} value={ac}>{ac}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Target %
                </label>
                <input
                  type="number"
                  step="0.1"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={pos.target_allocation}
                  onChange={(e) => handlePositionChange(index, 'target_allocation', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Drift %
                </label>
                <input
                  type="number"
                  step="0.1"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={pos.drift_percentage}
                  onChange={(e) => handlePositionChange(index, 'drift_percentage', parseFloat(e.target.value) || 0)}
                />
              </div>
              <button
                onClick={() => handleRemovePosition(index)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save and Delete */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={loading || !canSave()}
          className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : selectedStrategy ? 'Update Strategy' : 'Create Strategy'}
        </button>
        {selectedStrategy && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            Delete Strategy
          </button>
        )}
      </div>
      {!canSave() && positions.length > 0 && (
        <p className="mt-2 text-xs text-gray-500 text-center">
          Complete all fields and ensure target total is 100% to save.
        </p>
      )}
    </div>
  );
};

export default StrategyEditor;
