type FlowStep = 'upload' | 'classify' | 'map' | 'calculate' | 'result';

const STEPS: { id: FlowStep; label: string }[] = [
  { id: 'upload', label: '1. Upload' },
  { id: 'classify', label: '2. Classify' },
  { id: 'map', label: '3. Map' },
  { id: 'calculate', label: '4. Calculate' },
  { id: 'result', label: '5. Result' },
];

interface FlowStepNavProps {
  currentStep: FlowStep;
  onStepClick: (step: FlowStep) => void;
  canNavigate: boolean;
  hasResult: boolean;
}

const FlowStepNav = ({
  currentStep,
  onStepClick,
  canNavigate,
  hasResult,
}: FlowStepNavProps) => (
  <nav aria-label="Progress">
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((step, index) => {
        const isActive = currentStep === step.id;
        const isResultWithoutData = step.id === 'result' && !hasResult;
        const disabled = !canNavigate || isResultWithoutData;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && <span className="text-gray-400">→</span>}
            <button
              type="button"
              onClick={() => !disabled && onStepClick(step.id)}
              disabled={disabled}
              className={`rounded px-1 py-0.5 transition-colors ${
                isActive
                  ? 'text-indigo-600 font-medium'
                  : disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-500 hover:text-indigo-600 hover:underline'
              }`}
            >
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
);

export type { FlowStep };
export default FlowStepNav;
