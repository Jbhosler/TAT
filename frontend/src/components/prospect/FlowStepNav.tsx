type FlowStep = 'upload' | 'classify' | 'map' | 'calculate' | 'result';

const STEPS: {
  id: FlowStep;
  label: string;
  description: string;
}[] = [
  { id: 'upload', label: 'Holdings', description: 'Current portfolio' },
  { id: 'classify', label: 'Classify', description: 'Side pockets' },
  { id: 'map', label: 'Associations', description: 'Map to model' },
  { id: 'calculate', label: 'Calculate', description: 'Run transition' },
  { id: 'result', label: 'Assess', description: 'Review & propose' },
];

interface FlowStepNavProps {
  currentStep: FlowStep;
  onStepClick: (step: FlowStep) => void;
  canNavigate: boolean;
  hasResult: boolean;
  /** Optional badges shown next to step labels */
  stepBadges?: Partial<Record<FlowStep, string>>;
}

const FlowStepNav = ({
  currentStep,
  onStepClick,
  canNavigate,
  hasResult,
  stepBadges = {},
}: FlowStepNavProps) => {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <nav aria-label="Analysis progress" className="bg-white shadow rounded-lg p-4">
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
        {STEPS.map((step, index) => {
          const isActive = currentStep === step.id;
          const isResultWithoutData = step.id === 'result' && !hasResult;
          const disabled = !canNavigate || isResultWithoutData;
          const isPast = index < currentIndex;
          const badge = stepBadges[step.id];

          return (
            <li
              key={step.id}
              className={`relative flex-1 ${index < STEPS.length - 1 ? 'sm:pr-4' : ''}`}
            >
              {index < STEPS.length - 1 && (
                <div
                  className={`hidden sm:block absolute top-5 left-[calc(50%+1.25rem)] right-0 h-0.5 ${
                    isPast || isActive ? 'bg-indigo-300' : 'bg-gray-200'
                  }`}
                  aria-hidden
                />
              )}
              <button
                type="button"
                onClick={() => !disabled && onStepClick(step.id)}
                disabled={disabled}
                className={`relative z-10 w-full text-left sm:text-center rounded-md px-2 py-1.5 transition-colors ${
                  disabled
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : isPast
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`mt-1 block text-sm ${
                    isActive ? 'font-semibold text-indigo-700' : 'font-medium text-gray-800'
                  }`}
                >
                  {step.label}
                </span>
                <span className="block text-xs text-gray-500">{step.description}</span>
                {badge && (
                  <span className="mt-1 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                    {badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export type { FlowStep };
export default FlowStepNav;
