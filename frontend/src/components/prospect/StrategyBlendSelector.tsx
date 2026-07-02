import { useEffect, useMemo, useState } from 'react';
import { strategiesAPI } from '../../services/api';

export type StrategyBlendComponent = {
  strategyId: string;
  weight: string;
};

export type StrategySelection =
  | { mode: 'single'; strategyId: string }
  | { mode: 'blend'; components: StrategyBlendComponent[] };

interface StrategyBlendSelectorProps {
  strategies: Array<{ id: string; name: string }>;
  selection: StrategySelection;
  onChange: (selection: StrategySelection) => void;
}

const emptyBlendRow = (): StrategyBlendComponent => ({
  strategyId: '',
  weight: '',
});

const StrategyBlendSelector = ({
  strategies,
  selection,
  onChange,
}: StrategyBlendSelectorProps) => {
  const [preview, setPreview] = useState<{
    display_name: string;
    positions: Array<{
      model_ticker: string;
      asset_class: string;
      target_allocation: number;
      drift_percentage: number;
    }>;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const blendTotal = useMemo(() => {
    if (selection.mode !== 'blend') return 0;
    return selection.components.reduce((sum, row) => {
      const w = parseFloat(row.weight);
      return sum + (Number.isFinite(w) ? w : 0);
    }, 0);
  }, [selection]);

  const blendValid = useMemo(() => {
    if (selection.mode !== 'blend') return true;
    const filled = selection.components.filter(
      (row) => row.strategyId && row.weight.trim() !== ''
    );
    if (filled.length < 2) return false;
    return Math.abs(blendTotal - 100) < 0.05;
  }, [selection, blendTotal]);

  useEffect(() => {
    if (selection.mode !== 'blend' || !blendValid) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    const components = selection.components
      .filter((row) => row.strategyId && row.weight.trim() !== '')
      .map((row) => ({
        strategy_id: row.strategyId,
        weight: parseFloat(row.weight),
      }));

    let cancelled = false;
    setPreviewLoading(true);
    strategiesAPI
      .blendPreview(components)
      .then((res) => {
        if (!cancelled) {
          setPreview(res.data);
          setPreviewError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err.response?.data?.detail || 'Could not preview blend');
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selection, blendValid]);

  const setMode = (mode: 'single' | 'blend') => {
    if (mode === 'single') {
      const firstId =
        selection.mode === 'single'
          ? selection.strategyId
          : selection.components.find((c) => c.strategyId)?.strategyId || '';
      onChange({ mode: 'single', strategyId: firstId });
      return;
    }
    const seed =
      selection.mode === 'single' && selection.strategyId
        ? [{ strategyId: selection.strategyId, weight: '100' }, emptyBlendRow()]
        : selection.mode === 'blend'
          ? selection.components
          : [emptyBlendRow(), emptyBlendRow()];
    onChange({ mode: 'blend', components: seed.length >= 2 ? seed : [...seed, emptyBlendRow()] });
  };

  const updateBlendRow = (index: number, field: keyof StrategyBlendComponent, value: string) => {
    if (selection.mode !== 'blend') return;
    const next = selection.components.map((row, i) =>
      i === index ? { ...row, [field]: value } : row
    );
    onChange({ mode: 'blend', components: next });
  };

  const addBlendRow = () => {
    if (selection.mode !== 'blend') return;
    onChange({
      mode: 'blend',
      components: [...selection.components, emptyBlendRow()],
    });
  };

  const removeBlendRow = (index: number) => {
    if (selection.mode !== 'blend' || selection.components.length <= 2) return;
    onChange({
      mode: 'blend',
      components: selection.components.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`text-sm font-medium px-3 py-2 rounded-md ${
            selection.mode === 'single'
              ? 'bg-indigo-100 text-indigo-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Single strategy
        </button>
        <button
          type="button"
          onClick={() => setMode('blend')}
          className={`text-sm font-medium px-3 py-2 rounded-md ${
            selection.mode === 'blend'
              ? 'bg-indigo-100 text-indigo-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Strategy blend
        </button>
      </div>

      {selection.mode === 'single' ? (
        <div className="min-w-[280px]">
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={selection.strategyId}
            onChange={(e) => onChange({ mode: 'single', strategyId: e.target.value })}
          >
            <option value="">Select a strategy...</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Select two or more strategies and assign weights that sum to 100%.
          </p>
          {selection.components.map((row, index) => {
            const usedElsewhere = new Set(
              selection.components
                .filter((_, i) => i !== index)
                .map((r) => r.strategyId)
                .filter(Boolean)
            );
            return (
            <div key={index} className="flex flex-wrap items-center gap-3">
              <select
                className="min-w-[220px] rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={row.strategyId}
                onChange={(e) => updateBlendRow(index, 'strategyId', e.target.value)}
              >
                <option value="">Select strategy...</option>
                {strategies.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                    disabled={usedElsewhere.has(s.id) && row.strategyId !== s.id}
                  >
                    {s.name}
                    {usedElsewhere.has(s.id) && row.strategyId !== s.id ? ' (already selected)' : ''}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={row.weight}
                  onChange={(e) => updateBlendRow(index, 'weight', e.target.value)}
                  placeholder="Weight"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <button
                type="button"
                onClick={() => removeBlendRow(index)}
                disabled={selection.components.length <= 2}
                className="text-sm text-red-600 hover:text-red-800 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          );
          })}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={addBlendRow}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              + Add strategy
            </button>
            <span
              className={`text-sm ${
                Math.abs(blendTotal - 100) < 0.05 ? 'text-green-700' : 'text-amber-700'
              }`}
            >
              Total weight: {blendTotal.toFixed(1)}%
            </span>
          </div>
          {previewLoading && (
            <p className="text-sm text-gray-500">Calculating blended model portfolio...</p>
          )}
          {previewError && (
            <p className="text-sm text-red-600">{previewError}</p>
          )}
          {preview && (
            <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
              <p className="text-sm font-medium text-gray-900 mb-2">
                Blended target: {preview.display_name}
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="pr-4 py-1">Asset class</th>
                      <th className="pr-4 py-1">Model ticker</th>
                      <th className="pr-4 py-1">Target %</th>
                      <th className="py-1">Drift %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.positions.map((p) => (
                      <tr key={`${p.asset_class}-${p.model_ticker}`}>
                        <td className="pr-4 py-1 text-gray-900">{p.asset_class}</td>
                        <td className="pr-4 py-1 text-gray-700">{p.model_ticker}</td>
                        <td className="pr-4 py-1 text-gray-700">{Number(p.target_allocation).toFixed(1)}</td>
                        <td className="py-1 text-gray-700">{Number(p.drift_percentage).toFixed(1)}</td>
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
  );
};

export const isStrategySelectionReady = (selection: StrategySelection): boolean => {
  if (selection.mode === 'single') {
    return Boolean(selection.strategyId);
  }
  const filled = selection.components.filter(
    (row) => row.strategyId && row.weight.trim() !== ''
  );
  if (filled.length < 2) return false;
  const total = filled.reduce((sum, row) => sum + parseFloat(row.weight), 0);
  return Math.abs(total - 100) < 0.05;
};

export const primaryStrategyIdFromSelection = (selection: StrategySelection): string => {
  if (selection.mode === 'single') return selection.strategyId;
  const sorted = [...selection.components]
    .filter((row) => row.strategyId && row.weight.trim() !== '')
    .sort((a, b) => parseFloat(b.weight) - parseFloat(a.weight));
  return sorted[0]?.strategyId || '';
};

export const blendPayloadFromSelection = (
  selection: StrategySelection
): Array<{ strategy_id: string; weight: number }> | undefined => {
  if (selection.mode !== 'blend') return undefined;
  return selection.components
    .filter((row) => row.strategyId && row.weight.trim() !== '')
    .map((row) => ({
      strategy_id: row.strategyId,
      weight: parseFloat(row.weight),
    }));
};

export const selectionFromProspect = (prospect: {
  strategy_id: string;
  strategy_blend?: Array<{ strategy_id: string; weight: number | string }> | null;
}): StrategySelection => {
  if (prospect.strategy_blend && prospect.strategy_blend.length > 0) {
    return {
      mode: 'blend',
      components: prospect.strategy_blend.map((c) => ({
        strategyId: String(c.strategy_id),
        weight: String(c.weight),
      })),
    };
  }
  return { mode: 'single', strategyId: String(prospect.strategy_id) };
};

export const targetPayloadFromSelection = (
  selection: StrategySelection
): { strategy_id: string; strategy_blend?: Array<{ strategy_id: string; weight: number }> } => {
  const strategy_id = primaryStrategyIdFromSelection(selection);
  const strategy_blend = blendPayloadFromSelection(selection);
  return strategy_blend ? { strategy_id, strategy_blend } : { strategy_id };
};

export const selectionsEqual = (a: StrategySelection, b: StrategySelection): boolean => {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'single' && b.mode === 'single') {
    return a.strategyId === b.strategyId;
  }
  if (a.mode === 'blend' && b.mode === 'blend') {
    const norm = (rows: StrategyBlendComponent[]) =>
      [...rows]
        .filter((r) => r.strategyId && r.weight.trim() !== '')
        .map((r) => `${r.strategyId}:${parseFloat(r.weight).toFixed(1)}`)
        .sort()
        .join('|');
    return norm(a.components) === norm(b.components);
  }
  return false;
};

export const strategyIdsFromSelection = (selection: StrategySelection): string[] => {
  if (selection.mode === 'single') {
    return selection.strategyId ? [selection.strategyId] : [];
  }
  return selection.components
    .map((row) => row.strategyId)
    .filter((id, index, arr) => Boolean(id) && arr.indexOf(id) === index);
};

export default StrategyBlendSelector;
