import { useState, useEffect } from 'react';
import { adminAPI, strategiesAPI } from '../../services/api';

type StrategyRef = { id: string; name: string };
type MultiMappingConflict = {
  legacy_ticker: string;
  model_tickers: string[];
  strategies: StrategyRef[];
  mappings: { strategy_id: string; strategy_name: string; model_ticker: string; grade: number }[];
};
type GradeInconsistencyConflict = {
  legacy_ticker: string;
  strategies: StrategyRef[];
  grades_by_strategy: { strategy_id: string; strategy_name: string; model_ticker: string; grade: number }[];
};
type OrphanedModelTicker = { strategy_id: string; strategy_name: string; model_ticker: string };

type SanityCheck = {
  multi_mapping_conflicts: MultiMappingConflict[];
  grade_inconsistencies: GradeInconsistencyConflict[];
  orphaned_model_tickers: OrphanedModelTicker[];
};

const DataIntegrity = () => {
  const [sanity, setSanity] = useState<SanityCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolveModal, setResolveModal] = useState<{
    type: 'multi_mapping' | 'grade_inconsistency';
    legacy_ticker: string;
    strategies: StrategyRef[];
    currentMappings: { strategy_name: string; model_ticker: string; grade: number }[];
  } | null>(null);
  const [masterModelTicker, setMasterModelTicker] = useState('');
  const [masterGrade, setMasterGrade] = useState(0);
  const [resolving, setResolving] = useState(false);

  // Replace Model Ticker workflow
  const [replaceOld, setReplaceOld] = useState('');
  const [replaceNew, setReplaceNew] = useState('');
  const [addOldAsGrade1, setAddOldAsGrade1] = useState(true);
  const [applyToAllStrategies, setApplyToAllStrategies] = useState(false);
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([]);
  const [replaceStrategyId, setReplaceStrategyId] = useState('');
  const [replacing, setReplacing] = useState(false);

  const loadSanityCheck = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getSanityCheck();
      setSanity(res.data);
    } catch (err) {
      console.error('Failed to load sanity check:', err);
      setSanity({
        multi_mapping_conflicts: [],
        grade_inconsistencies: [],
        orphaned_model_tickers: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSanityCheck();
  }, []);

  useEffect(() => {
    strategiesAPI.list().then((r) => setStrategies(r.data)).catch(() => setStrategies([]));
  }, []);

  const openResolveModal = (
    type: 'multi_mapping' | 'grade_inconsistency',
    legacy_ticker: string,
    strategies: StrategyRef[],
    currentMappings: { strategy_name: string; model_ticker: string; grade: number }[]
  ) => {
    setResolveModal({ type, legacy_ticker, strategies, currentMappings });
    setMasterModelTicker(currentMappings[0]?.model_ticker ?? '');
    setMasterGrade(currentMappings[0]?.grade ?? 0);
  };

  const handleResolve = async () => {
    if (!resolveModal || !masterModelTicker.trim()) return;
    setResolving(true);
    try {
      await adminAPI.resolveConflict({
        legacy_ticker: resolveModal.legacy_ticker,
        master_model_ticker: masterModelTicker.trim(),
        master_grade: masterGrade,
      });
      setResolveModal(null);
      await loadSanityCheck();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to resolve conflict');
    } finally {
      setResolving(false);
    }
  };

  const handleReplaceModelTicker = async () => {
    if (!replaceOld.trim() || !replaceNew.trim()) {
      alert('Please enter both old and new model tickers.');
      return;
    }
    if (!applyToAllStrategies && !replaceStrategyId) {
      alert('Please select a strategy or check "Apply to all strategies".');
      return;
    }
    setReplacing(true);
    try {
      await adminAPI.replaceModelTicker({
        old_model_ticker: replaceOld.trim(),
        new_model_ticker: replaceNew.trim(),
        add_old_as_grade1: addOldAsGrade1,
        apply_to_all_strategies: applyToAllStrategies,
        strategy_id: applyToAllStrategies ? undefined : replaceStrategyId,
      });
      alert('Model ticker replaced successfully.');
      setReplaceOld('');
      setReplaceNew('');
      setReplaceStrategyId('');
      await loadSanityCheck();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to replace model ticker');
    } finally {
      setReplacing(false);
    }
  };

  const totalConflicts =
    (sanity?.multi_mapping_conflicts?.length ?? 0) +
    (sanity?.grade_inconsistencies?.length ?? 0) +
    (sanity?.orphaned_model_tickers?.length ?? 0);

  return (
    <div className="bg-white shadow rounded-lg p-6 space-y-8">
      <h2 className="text-lg font-semibold text-gray-900">
        Data Integrity &amp; Sanity Check
      </h2>

      {/* Replace Model Ticker */}
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Replace Model Ticker</h3>
        <p className="text-xs text-gray-500 mb-3">
          Swap a model ticker (e.g. SPYM → VOO) across product equivalents and strategy positions.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Old model ticker</label>
            <input
              type="text"
              value={replaceOld}
              onChange={(e) => setReplaceOld(e.target.value)}
              placeholder="e.g. SPYM"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New model ticker</label>
            <input
              type="text"
              value={replaceNew}
              onChange={(e) => setReplaceNew(e.target.value)}
              placeholder="e.g. VOO"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mb-3">
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked={addOldAsGrade1}
              onChange={(e) => setAddOldAsGrade1(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
            />
            Add old ticker as Grade 1 equivalent for new model ticker
          </label>
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked={applyToAllStrategies}
              onChange={(e) => {
                setApplyToAllStrategies(e.target.checked);
                if (e.target.checked) setReplaceStrategyId('');
              }}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
            />
            Apply to all strategies
          </label>
        </div>
        {!applyToAllStrategies && (
          <div className="mb-3 max-w-xs">
            <label className="block text-xs font-medium text-gray-600 mb-1">Strategy</label>
            <select
              value={replaceStrategyId}
              onChange={(e) => setReplaceStrategyId(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="">Select strategy</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <button
          onClick={handleReplaceModelTicker}
          disabled={replacing || !replaceOld.trim() || !replaceNew.trim() || (!applyToAllStrategies && !replaceStrategyId)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {replacing ? 'Replacing...' : 'Replace Model Ticker'}
        </button>
      </div>

      {/* Conflict summary */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading sanity check...</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {totalConflicts === 0
                ? 'No high-risk conflicts detected.'
                : `${totalConflicts} high-risk issue(s) detected.`}
            </p>
            <button
              onClick={loadSanityCheck}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Refresh
            </button>
          </div>

          {/* Multi-Mapping Conflict Cards */}
          {(sanity?.multi_mapping_conflicts?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Multi-Mapping Conflicts</h3>
              <p className="text-xs text-gray-500 mb-3">
                Alternate (legacy) ticker mapped to more than one model ticker across strategies.
              </p>
              <div className="space-y-3">
                {sanity!.multi_mapping_conflicts.map((c) => (
                  <div
                    key={c.legacy_ticker}
                    className="border border-amber-200 rounded-lg p-4 bg-amber-50/50"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium text-gray-900">{c.legacy_ticker}</span>
                        <span className="text-gray-500 text-sm ml-2">
                          → {c.model_tickers.join(', ')}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          openResolveModal(
                            'multi_mapping',
                            c.legacy_ticker,
                            c.strategies,
                            c.mappings.map((m) => ({
                              strategy_name: m.strategy_name,
                              model_ticker: m.model_ticker,
                              grade: m.grade,
                            }))
                          )
                        }
                        className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
                      >
                        Resolve
                      </button>
                    </div>
                    <ul className="mt-2 text-xs text-gray-600 list-disc list-inside">
                      {c.strategies.map((s) => (
                        <li key={s.id}>{s.name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grade Inconsistency Cards */}
          {(sanity?.grade_inconsistencies?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Grade Inconsistencies</h3>
              <p className="text-xs text-gray-500 mb-3">
                Same alternate ticker has different grades in different strategies.
              </p>
              <div className="space-y-3">
                {sanity!.grade_inconsistencies.map((c) => (
                  <div
                    key={c.legacy_ticker}
                    className="border border-amber-200 rounded-lg p-4 bg-amber-50/50"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium text-gray-900">{c.legacy_ticker}</span>
                      </div>
                      <button
                        onClick={() =>
                          openResolveModal(
                            'grade_inconsistency',
                            c.legacy_ticker,
                            c.strategies,
                            c.grades_by_strategy.map((g) => ({
                              strategy_name: g.strategy_name,
                              model_ticker: g.model_ticker,
                              grade: g.grade,
                            }))
                          )
                        }
                        className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
                      >
                        Resolve
                      </button>
                    </div>
                    <ul className="mt-2 text-xs text-gray-600 list-disc list-inside">
                      {c.grades_by_strategy.map((g, i) => (
                        <li key={i}>
                          {g.strategy_name}: {g.model_ticker} (grade {g.grade})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orphaned Model Tickers */}
          {(sanity?.orphaned_model_tickers?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Orphaned Model Tickers</h3>
              <p className="text-xs text-gray-500 mb-3">
                Model ticker in strategy positions with no Grade 0 entry in product equivalents.
              </p>
              <div className="space-y-2">
                {sanity!.orphaned_model_tickers.map((o, i) => (
                  <div
                    key={`${o.strategy_id}-${o.model_ticker}-${i}`}
                    className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex justify-between items-center"
                  >
                    <span className="font-medium text-gray-900">{o.model_ticker}</span>
                    <span className="text-sm text-gray-600">{o.strategy_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Resolve Modal */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Choose Master Mapping</h3>
            <p className="text-sm text-gray-600 mb-4">
              Apply one mapping for <strong>{resolveModal.legacy_ticker}</strong> across all
              strategies.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Model ticker
                </label>
                <input
                  type="text"
                  value={masterModelTicker}
                  onChange={(e) => setMasterModelTicker(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Grade</label>
                <select
                  value={masterGrade}
                  onChange={(e) => setMasterGrade(Number(e.target.value))}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResolveModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={resolving || !masterModelTicker.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {resolving ? 'Applying...' : 'Apply Master Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataIntegrity;
