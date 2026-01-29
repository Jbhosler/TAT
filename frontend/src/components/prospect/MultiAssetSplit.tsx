import { useState } from 'react';

interface MultiAssetSplitProps {
  ticker: string;
  totalValue: number;
  modelTickers: string[];
  onSplit: (split: Record<string, number>) => void;
  onCancel: () => void;
}

const MultiAssetSplit = ({
  ticker,
  totalValue,
  modelTickers,
  onSplit,
  onCancel,
}: MultiAssetSplitProps) => {
  const [splits, setSplits] = useState<Record<string, number>>({});
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);

  const handleAddTicker = (ticker: string) => {
    if (!selectedTickers.includes(ticker)) {
      setSelectedTickers([...selectedTickers, ticker]);
      setSplits({ ...splits, [ticker]: 0 });
    }
  };

  const handleRemoveTicker = (ticker: string) => {
    setSelectedTickers(selectedTickers.filter(t => t !== ticker));
    const newSplits = { ...splits };
    delete newSplits[ticker];
    setSplits(newSplits);
  };

  const handleSplitChange = (ticker: string, value: number) => {
    setSplits({ ...splits, [ticker]: value });
  };

  const handleSave = () => {
    const total = Object.values(splits).reduce((sum, val) => sum + val, 0);
    if (Math.abs(total - totalValue) > 0.01) {
      alert(`Split total ($${total.toFixed(2)}) must equal total value ($${totalValue.toFixed(2)})`);
      return;
    }

    onSplit(splits);
  };

  const currentTotal = Object.values(splits).reduce((sum, val) => sum + val, 0);
  const remaining = totalValue - currentTotal;

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
      <h3 className="text-sm font-medium text-gray-900 mb-4">
        Multi-Asset Split for {ticker}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Add Model Ticker
          </label>
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleAddTicker(e.target.value);
                e.target.value = '';
              }
            }}
          >
            <option value="">Select model ticker</option>
            {modelTickers
              .filter(t => !selectedTickers.includes(t))
              .map(ticker => (
                <option key={ticker} value={ticker}>{ticker}</option>
              ))}
          </select>
        </div>

        <div className="space-y-2">
          {selectedTickers.map(ticker => (
            <div key={ticker} className="flex items-center space-x-2">
              <label className="flex-1 text-sm text-gray-700">{ticker}</label>
              <input
                type="number"
                step="0.01"
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={splits[ticker] || 0}
                onChange={(e) => handleSplitChange(ticker, parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
              <button
                onClick={() => handleRemoveTicker(ticker)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-700">Total Value:</span>
            <span className="font-medium">${totalValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-700">Current Total:</span>
            <span className="font-medium">${currentTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Remaining:</span>
            <span className={`font-medium ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
              ${remaining.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={Math.abs(remaining) > 0.01}
            className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            Save Split
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiAssetSplit;
