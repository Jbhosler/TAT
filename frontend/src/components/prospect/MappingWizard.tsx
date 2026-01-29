import { useState, useEffect } from 'react';
import { prospectsAPI, strategiesAPI } from '../../services/api';
import MultiAssetSplit from './MultiAssetSplit';

interface MappingWizardProps {
  prospectId: string;
  unmappedHoldings: any[];
  onMappingComplete: () => void;
}

const MappingWizard = ({
  prospectId,
  unmappedHoldings,
  onMappingComplete,
}: MappingWizardProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mappings, setMappings] = useState<Record<string, any>>({});
  const [strategies, setStrategies] = useState<any[]>([]);
  const [showMultiAsset, setShowMultiAsset] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    try {
      const response = await strategiesAPI.list();
      setStrategies(response.data);
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  const currentHolding = unmappedHoldings[currentIndex];
  const currentMapping = mappings[currentHolding?.ticker] || {
    model_ticker: '',
    grade: 2,
    dollar_split: null,
  };

  const handleMappingChange = (field: string, value: any) => {
    setMappings({
      ...mappings,
      [currentHolding.ticker]: {
        ...currentMapping,
        [field]: value,
      },
    });
  };

  const handleSaveMapping = async () => {
    if (!currentMapping.model_ticker) {
      alert('Please select a model ticker');
      return;
    }

    setLoading(true);
    try {
      await prospectsAPI.saveMapping(prospectId, {
        legacy_ticker: currentHolding.ticker,
        model_ticker: currentMapping.model_ticker,
        grade: currentMapping.grade,
        dollar_split: currentMapping.dollar_split,
      });

      if (currentIndex < unmappedHoldings.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // All mappings complete
        onMappingComplete();
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleMultiAssetSplit = (split: Record<string, number>) => {
    handleMappingChange('dollar_split', split);
    setShowMultiAsset(false);
  };

  if (!currentHolding) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-500">No unmapped holdings</p>
      </div>
    );
  }

  // Get available model tickers from strategies
  const modelTickers: string[] = [];
  strategies.forEach(s => {
    s.positions?.forEach((p: any) => {
      if (!modelTickers.includes(p.model_ticker)) {
        modelTickers.push(p.model_ticker);
      }
    });
  });

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Mapping Wizard (Option C)
      </h2>

      <div className="mb-4">
        <p className="text-sm text-gray-600">
          Mapping {currentIndex + 1} of {unmappedHoldings.length}
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ticker: {currentHolding.ticker}
          </label>
          <p className="text-xs text-gray-500 mb-4">
            Value: ${currentHolding.value?.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Model Ticker
          </label>
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={currentMapping.model_ticker}
            onChange={(e) => handleMappingChange('model_ticker', e.target.value)}
          >
            <option value="">Select model ticker</option>
            {modelTickers.map(ticker => (
              <option key={ticker} value={ticker}>{ticker}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Grade
          </label>
          <div className="flex space-x-4">
            {[0, 1, 2].map(grade => (
              <label key={grade} className="flex items-center">
                <input
                  type="radio"
                  name="grade"
                  value={grade}
                  checked={currentMapping.grade === grade}
                  onChange={(e) => handleMappingChange('grade', parseInt(e.target.value))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Grade {grade}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={currentMapping.dollar_split !== null}
              onChange={(e) => {
                if (e.target.checked) {
                  setShowMultiAsset(true);
                } else {
                  handleMappingChange('dollar_split', null);
                }
              }}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Split Across Multiple Model Tickers</span>
          </label>
        </div>

        {showMultiAsset && (
          <MultiAssetSplit
            ticker={currentHolding.ticker}
            totalValue={parseFloat(currentHolding.value)}
            modelTickers={modelTickers}
            onSplit={handleMultiAssetSplit}
            onCancel={() => setShowMultiAsset(false)}
          />
        )}

        <div className="flex space-x-4">
          {currentIndex > 0 && (
            <button
              onClick={() => setCurrentIndex(currentIndex - 1)}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </button>
          )}
          <button
            onClick={handleSaveMapping}
            disabled={loading || !currentMapping.model_ticker}
            className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : currentIndex < unmappedHoldings.length - 1 ? 'Next' : 'Complete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MappingWizard;
