import { useState, useEffect, useMemo } from 'react';
import { prospectsAPI, strategiesAPI } from '../../services/api';
import MultiAssetSplit from './MultiAssetSplit';

interface MappingWizardProps {
  prospectId: string;
  unmappedHoldings: any[];
  onMappingComplete: () => void;
  onDataChanged?: () => void;
  strategyId?: string;
  strategyIds?: string[];
}

type SavedMapping = {
  model_ticker: string;
  grade: number;
  dollar_split: Record<string, number> | null;
};

const statusLabel = (
  holding: any,
  mapping?: SavedMapping,
  forcedSale = false
): string => {
  const rawStatus = String(holding.mapping_status || '').toLowerCase();
  if (forcedSale || rawStatus === 'forced_sale') {
    return 'Forced sale';
  }
  if (rawStatus === 'multi_asset' || mapping?.dollar_split) {
    return 'Multi-asset';
  }
  if (mapping?.model_ticker || rawStatus === 'mapped') {
    return 'Mapped';
  }
  return 'Needs mapping';
};

const statusTone = (label: string): string => {
  switch (label) {
    case 'Needs mapping':
      return 'bg-amber-100 text-amber-900';
    case 'Forced sale':
      return 'bg-orange-100 text-orange-900';
    case 'Multi-asset':
      return 'bg-blue-100 text-blue-900';
    default:
      return 'bg-green-100 text-green-900';
  }
};

const MappingWizard = ({
  prospectId,
  unmappedHoldings,
  onMappingComplete,
  onDataChanged,
  strategyId,
  strategyIds,
}: MappingWizardProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mappings, setMappings] = useState<Record<string, SavedMapping>>({});
  const [strategies, setStrategies] = useState<any[]>([]);
  const [showMultiAsset, setShowMultiAsset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mappingsLoaded, setMappingsLoaded] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [forcedSaleTickers, setForcedSaleTickers] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadStrategies();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMappingsLoaded(false);
      try {
        const res = await prospectsAPI.getMappings(prospectId);
        if (cancelled) return;
        const initial: Record<string, SavedMapping> = {};
        for (const m of res.data || []) {
          initial[m.legacy_ticker] = {
            model_ticker: m.model_ticker,
            grade: m.grade,
            dollar_split: m.dollar_split ?? null,
          };
        }
        setMappings(initial);
      } catch (err) {
        console.error('Failed to load existing mappings:', err);
      } finally {
        if (!cancelled) setMappingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prospectId]);

  useEffect(() => {
    setCurrentIndex(0);
    setInlineError(null);
    setInlineMessage(null);
    setForcedSaleTickers(new Set());
  }, [prospectId, unmappedHoldings]);

  const loadStrategies = async () => {
    try {
      const response = await strategiesAPI.list();
      setStrategies(response.data);
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  const needsMappingCount = useMemo(() => {
    return unmappedHoldings.filter((h) => {
      const label = statusLabel(h, mappings[h.ticker], forcedSaleTickers.has(h.ticker));
      return label === 'Needs mapping';
    }).length;
  }, [unmappedHoldings, mappings, forcedSaleTickers]);

  const currentHolding = unmappedHoldings[currentIndex];
  const currentMapping = mappings[currentHolding?.ticker] || {
    model_ticker: '',
    grade: 2,
    dollar_split: null,
  };

  const handleMappingChange = (field: string, value: any) => {
    if (!currentHolding) return;
    setMappings({
      ...mappings,
      [currentHolding.ticker]: {
        ...currentMapping,
        [field]: value,
      },
    });
  };

  const advanceOrFinish = () => {
    if (currentIndex < unmappedHoldings.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setInlineMessage(null);
    } else {
      onMappingComplete();
    }
  };

  const handleSaveMapping = async () => {
    if (!currentHolding) return;
    if (!currentMapping.model_ticker) {
      setInlineError('Select a model ticker before saving.');
      return;
    }

    setLoading(true);
    setInlineError(null);
    try {
      await prospectsAPI.saveMapping(prospectId, {
        legacy_ticker: currentHolding.ticker,
        model_ticker: currentMapping.model_ticker,
        grade: currentMapping.grade,
        dollar_split: currentMapping.dollar_split,
      });
      onDataChanged?.();
      setInlineMessage(`Saved association for ${currentHolding.ticker}.`);
      advanceOrFinish();
    } catch (err: any) {
      setInlineError(err.response?.data?.detail || 'Failed to save mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleForcedSale = async () => {
    if (!currentHolding) return;
    if (
      !confirm(
        `Mark ${currentHolding.ticker} as forced sale? This holding will be liquidated (sold) and the proceeds used in the transition.`
      )
    ) {
      return;
    }
    setLoading(true);
    setInlineError(null);
    try {
      await prospectsAPI.markForcedSale(prospectId, currentHolding.ticker);
      setMappings((prev) => {
        const next = { ...prev };
        delete next[currentHolding.ticker];
        return next;
      });
      setForcedSaleTickers((prev) => new Set(prev).add(currentHolding.ticker));
      onDataChanged?.();
      setInlineMessage(`${currentHolding.ticker} marked as forced sale.`);
      advanceOrFinish();
    } catch (err: any) {
      setInlineError(err.response?.data?.detail || 'Failed to mark as forced sale');
    } finally {
      setLoading(false);
    }
  };

  const handleMultiAssetSplit = (split: Record<string, number>) => {
    handleMappingChange('dollar_split', split);
    setShowMultiAsset(false);
  };

  // Model tickers from selected strategy or all strategies in a blend.
  const modelTickers: string[] = [];
  const ids = strategyIds?.length
    ? strategyIds
    : strategyId
      ? [strategyId]
      : [];
  const sourceStrategies = ids.length
    ? strategies.filter((s) => ids.includes(s.id))
    : strategies;
  sourceStrategies.forEach((s) => {
    s.positions?.forEach((p: any) => {
      if (!modelTickers.includes(p.model_ticker)) {
        modelTickers.push(p.model_ticker);
      }
    });
  });

  if (!currentHolding) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Associations</h2>
        <p className="text-gray-600 mb-4">
          No rebalanceable holdings need association review. You can recalculate or revisit classification.
        </p>
        <button
          type="button"
          onClick={onMappingComplete}
          className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Continue to calculate
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Associations</h2>
            <p className="text-sm text-gray-500 mt-1">
              Review and change how legacy holdings map to model tickers (Option C). Click any row to edit.
            </p>
          </div>
          <div className="text-sm text-gray-700">
            <span className="font-medium">{needsMappingCount}</span> still need mapping ·{' '}
            <span className="font-medium">{unmappedHoldings.length}</span> in review
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-md mb-4 max-h-64 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticker</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Maps to</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {unmappedHoldings.map((holding, index) => {
                const mapping = mappings[holding.ticker];
                const label = statusLabel(
                  holding,
                  mapping,
                  forcedSaleTickers.has(holding.ticker)
                );
                const isCurrent = index === currentIndex;
                return (
                  <tr
                    key={`${holding.ticker}-${index}`}
                    onClick={() => {
                      setCurrentIndex(index);
                      setInlineError(null);
                      setInlineMessage(null);
                    }}
                    className={`cursor-pointer ${
                      isCurrent ? 'bg-indigo-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">
                      {holding.ticker}
                      {isCurrent && (
                        <span className="ml-2 text-xs font-normal text-indigo-600">editing</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700 text-right whitespace-nowrap">
                      $
                      {Number(holding.value ?? 0).toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusTone(label)}`}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {label === 'Forced sale'
                        ? '—'
                        : mapping?.model_ticker ||
                          (mapping?.dollar_split
                            ? Object.keys(mapping.dollar_split).join(', ')
                            : '—')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {needsMappingCount === 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2">
            <p className="text-sm text-green-900 flex-1">
              All associations in this list are set. Continue to calculate, or click a row to change a mapping.
            </p>
            <button
              type="button"
              onClick={onMappingComplete}
              className="py-1.5 px-3 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Continue to calculate
            </button>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          Edit association
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Mapping {currentIndex + 1} of {unmappedHoldings.length}
          {!mappingsLoaded && ' · Loading saved mappings…'}
        </p>

        {inlineError && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
            {inlineError}
          </div>
        )}
        {inlineMessage && !inlineError && (
          <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            {inlineMessage}
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ticker: {currentHolding.ticker}
            </label>
            <p className="text-xs text-gray-500">
              Value: $
              {Number(currentHolding.value ?? 0).toLocaleString('en-US', {
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
              {modelTickers.map((ticker) => (
                <option key={ticker} value={ticker}>
                  {ticker}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Grade
            </label>
            <div className="flex flex-wrap gap-4">
              {[
                { grade: 0, hint: 'Exact match' },
                { grade: 1, hint: 'Close match' },
                { grade: 2, hint: 'Poor match' },
              ].map(({ grade, hint }) => (
                <label key={grade} className="flex items-center">
                  <input
                    type="radio"
                    name="grade"
                    value={grade}
                    checked={currentMapping.grade === grade}
                    onChange={(e) => handleMappingChange('grade', parseInt(e.target.value, 10))}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">
                    Grade {grade} <span className="text-gray-400">({hint})</span>
                  </span>
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
              <span className="text-sm text-gray-700">Split across multiple model tickers</span>
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

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              {currentIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentIndex(currentIndex - 1)}
                  className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Previous
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveMapping}
                disabled={loading || !mappingsLoaded || !currentMapping.model_ticker}
                className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading
                  ? 'Saving…'
                  : currentIndex < unmappedHoldings.length - 1
                    ? 'Save & next'
                    : 'Save & finish'}
              </button>
              {currentIndex < unmappedHoldings.length - 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentIndex(currentIndex + 1)}
                  className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Skip for now
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleForcedSale}
              disabled={loading || !mappingsLoaded}
              className="py-2 px-4 border border-amber-500 rounded-md text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 self-start"
            >
              Don&apos;t map (forced sale)
            </button>
            <p className="text-xs text-gray-500">
              Use forced sale to liquidate this holding; proceeds fund the transition.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MappingWizard;
