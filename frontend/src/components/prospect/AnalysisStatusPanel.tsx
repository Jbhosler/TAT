import type { FlowStep } from './FlowStepNav';

export type AnalysisStatus = {
  holdingCount: number;
  unmappedCount: number;
  sidePocketCount: number;
  targetDirty: boolean;
  targetReady: boolean;
  hasResult: boolean;
  resultOutdated: boolean;
  staleWarning: boolean;
};

interface AnalysisStatusPanelProps {
  status: AnalysisStatus;
  onGoToStep: (step: FlowStep) => void;
  onSaveTarget?: () => void;
  targetSaving?: boolean;
}

type StatusTone = 'ok' | 'warn' | 'idle';

function toneClasses(tone: StatusTone): string {
  switch (tone) {
    case 'ok':
      return 'border-green-200 bg-green-50 text-green-900';
    case 'warn':
      return 'border-amber-200 bg-amber-50 text-amber-950';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700';
  }
}

const AnalysisStatusPanel = ({
  status,
  onGoToStep,
  onSaveTarget,
  targetSaving = false,
}: AnalysisStatusPanelProps) => {
  const {
    holdingCount,
    unmappedCount,
    sidePocketCount,
    targetDirty,
    targetReady,
    hasResult,
    resultOutdated,
    staleWarning,
  } = status;

  const targetTone: StatusTone = !targetReady ? 'idle' : targetDirty ? 'warn' : 'ok';
  const holdingsTone: StatusTone = holdingCount > 0 ? 'ok' : 'idle';
  const mapTone: StatusTone =
    holdingCount === 0 ? 'idle' : unmappedCount > 0 ? 'warn' : 'ok';
  const resultTone: StatusTone =
    resultOutdated || staleWarning ? 'warn' : hasResult ? 'ok' : 'idle';

  const blockers: string[] = [];
  if (!targetReady) blockers.push('Choose a target strategy or blend');
  if (targetDirty) blockers.push('Save target portfolio changes');
  if (holdingCount === 0) blockers.push('Add current holdings');
  if (unmappedCount > 0) blockers.push(`Map ${unmappedCount} unmapped holding${unmappedCount === 1 ? '' : 's'}`);
  if (resultOutdated || staleWarning) blockers.push('Recalculate to refresh proposal results');

  const readyToCalculate =
    targetReady && !targetDirty && holdingCount > 0 && unmappedCount === 0;

  return (
    <div className="bg-white shadow rounded-lg p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Analysis readiness</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Edit any step, then recalculate before generating the final proposal.
          </p>
        </div>
        {readyToCalculate && !hasResult && (
          <button
            type="button"
            onClick={() => onGoToStep('calculate')}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Ready to calculate →
          </button>
        )}
        {(resultOutdated || staleWarning) && (
          <button
            type="button"
            onClick={() => onGoToStep('calculate')}
            className="text-sm font-medium text-amber-800 hover:text-amber-950"
          >
            Recalculate required →
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`rounded-md border px-3 py-2 ${toneClasses(targetTone)}`}>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Target</p>
          <p className="text-sm font-semibold mt-1">
            {!targetReady
              ? 'Not selected'
              : targetDirty
                ? 'Unsaved changes'
                : 'Saved'}
          </p>
          {targetDirty && onSaveTarget && (
            <button
              type="button"
              onClick={onSaveTarget}
              disabled={targetSaving}
              className="mt-1 text-xs font-medium underline disabled:opacity-50"
            >
              {targetSaving ? 'Saving…' : 'Save now'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onGoToStep('upload')}
          className={`rounded-md border px-3 py-2 text-left ${toneClasses(holdingsTone)} hover:opacity-90`}
        >
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Holdings</p>
          <p className="text-sm font-semibold mt-1">
            {holdingCount > 0
              ? `${holdingCount} position${holdingCount === 1 ? '' : 's'}`
              : 'None yet'}
          </p>
          {sidePocketCount > 0 && (
            <p className="text-xs mt-1 opacity-80">{sidePocketCount} side pocket</p>
          )}
        </button>

        <button
          type="button"
          onClick={() => onGoToStep('map')}
          className={`rounded-md border px-3 py-2 text-left ${toneClasses(mapTone)} hover:opacity-90`}
        >
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Associations</p>
          <p className="text-sm font-semibold mt-1">
            {holdingCount === 0
              ? 'Waiting on holdings'
              : unmappedCount > 0
                ? `${unmappedCount} need mapping`
                : 'All mapped'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onGoToStep(hasResult && !resultOutdated ? 'result' : 'calculate')}
          className={`rounded-md border px-3 py-2 text-left ${toneClasses(resultTone)} hover:opacity-90`}
        >
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Results</p>
          <p className="text-sm font-semibold mt-1">
            {resultOutdated || staleWarning
              ? 'Outdated'
              : hasResult
                ? 'Ready to assess'
                : 'Not calculated'}
          </p>
        </button>
      </div>

      {blockers.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-900 mb-1">Before final proposal</p>
          <ul className="text-sm text-amber-950 list-disc list-inside space-y-0.5">
            {blockers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AnalysisStatusPanel;
