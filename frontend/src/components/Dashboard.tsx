import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import TaxSummary from './TaxSummary';
import ProspectUpload from './prospect/ProspectUpload';
import ClassifyHoldingsPanel from './prospect/ClassifyHoldingsPanel';
import MappingWizard from './prospect/MappingWizard';
import FlowStepNav, { type FlowStep } from './prospect/FlowStepNav';
import StrategyAccountLinks from './prospect/StrategyAccountLinks';
import StrategyBlendSelector, {
  isStrategySelectionReady,
  selectionFromProspect,
  selectionsEqual,
  strategyIdsFromSelection,
  targetPayloadFromSelection,
  type StrategySelection,
} from './prospect/StrategyBlendSelector';
import { prospectsAPI, strategiesAPI } from '../services/api';

const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [strategySelection, setStrategySelection] = useState<StrategySelection>({
    mode: 'single',
    strategyId: '',
  });
  const [savedStrategySelection, setSavedStrategySelection] = useState<StrategySelection>({
    mode: 'single',
    strategyId: '',
  });
  const [step, setStep] = useState<FlowStep>('upload');
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [prospectName, setProspectName] = useState('');
  const [mappingHoldings, setMappingHoldings] = useState<any[]>([]);
  const [transitionResult, setTransitionResult] = useState<any>(null);
  const [staleWarning, setStaleWarning] = useState(false);
  const [resultOutdated, setResultOutdated] = useState(false);
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetSaveMessage, setTargetSaveMessage] = useState<string | null>(null);
  const [loadingProspect, setLoadingProspect] = useState(false);
  const [hasStoredResult, setHasStoredResult] = useState(false);

  const targetDirty =
    prospectId != null &&
    isStrategySelectionReady(strategySelection) &&
    !selectionsEqual(strategySelection, savedStrategySelection);

  const loadStrategies = async () => {
    try {
      const response = await strategiesAPI.list();
      setStrategies(response.data);
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  const loadProspect = useCallback(async (id: string, preferredStep?: FlowStep) => {
    setLoadingProspect(true);
    try {
      const prospectRes = await prospectsAPI.get(id);
      const prospect = prospectRes.data;
      const selection = selectionFromProspect(prospect);
      setProspectId(id);
      setProspectName(prospect.name || '');
      setStrategySelection(selection);
      setSavedStrategySelection(selection);

      let nextStep: FlowStep = preferredStep || 'upload';
      let resultData: any = null;
      try {
        const resultRes = await prospectsAPI.getResult(id);
        resultData = resultRes.data;
      } catch {
        resultData = null;
      }

      if (!preferredStep) {
        if (resultData) {
          nextStep = 'result';
        } else {
          const reviewRes = await prospectsAPI.getMappingReview(id);
          const reviewHoldings = reviewRes.data || [];
          const unmappedRes = await prospectsAPI.getUnmapped(id);
          const unmapped = unmappedRes.data || [];
          setMappingHoldings(reviewHoldings);
          if (unmapped.length > 0 || reviewHoldings.length > 0) {
            nextStep = 'map';
          } else {
            const classified = (prospect.holdings || []).some((h: any) => h.is_side_pocket);
            nextStep = classified ? 'calculate' : 'classify';
          }
        }
      }

      setTransitionResult(resultData);
      setHasStoredResult(Boolean(resultData));
      setResultOutdated(false);
      setStep(nextStep);

      if (nextStep === 'map') {
        const reviewRes = await prospectsAPI.getMappingReview(id);
        setMappingHoldings(reviewRes.data || []);
      }

      if (nextStep === 'result') {
        checkStaleData(id);
      }
    } catch (err) {
      console.error('Failed to load prospect:', err);
    } finally {
      setLoadingProspect(false);
    }
  }, []);

  useEffect(() => {
    loadStrategies();
  }, []);

  useEffect(() => {
    const id = searchParams.get('prospect');
    if (id && id !== prospectId) {
      loadProspect(id);
    }
  }, [searchParams, prospectId, loadProspect]);

  useEffect(() => {
    if (prospectId && step === 'result') {
      checkStaleData(prospectId);
    }
  }, [prospectId, step]);

  const syncProspectQuery = (id: string | null) => {
    if (id) {
      setSearchParams({ prospect: id }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const checkStaleData = async (id: string) => {
    try {
      const check = await prospectsAPI.staleCheck(id);
      setStaleWarning(check.data.is_stale);
    } catch {
      setStaleWarning(false);
    }
  };

  const markResultOutdated = () => {
    setTransitionResult(null);
    setHasStoredResult(false);
    setResultOutdated(true);
    setStaleWarning(false);
  };

  const refreshMappingHoldings = async (id: string) => {
    const reviewRes = await prospectsAPI.getMappingReview(id);
    setMappingHoldings(reviewRes.data || []);
    return reviewRes.data || [];
  };

  const refreshMappingNeeds = async (id: string) => {
    const [reviewRes, unmappedRes] = await Promise.all([
      prospectsAPI.getMappingReview(id),
      prospectsAPI.getUnmapped(id),
    ]);
    const reviewHoldings = reviewRes.data || [];
    const unmappedHoldings = unmappedRes.data || [];
    setMappingHoldings(unmappedHoldings.length > 0 ? unmappedHoldings : reviewHoldings);
    return { reviewHoldings, unmappedHoldings };
  };

  const handleSaveTarget = async () => {
    if (!prospectId || !isStrategySelectionReady(strategySelection)) return;
    setTargetSaving(true);
    setTargetSaveMessage(null);
    try {
      const payload = targetPayloadFromSelection(strategySelection);
      await prospectsAPI.updateTarget(prospectId, payload);
      setSavedStrategySelection(strategySelection);
      markResultOutdated();
      const { reviewHoldings, unmappedHoldings } = await refreshMappingNeeds(prospectId);
      if (unmappedHoldings.length > 0) {
        setStep('map');
        setTargetSaveMessage('Target portfolio saved. Review newly unmapped holdings before recalculating.');
      } else {
        setStep('calculate');
        setTargetSaveMessage(
          reviewHoldings.length > 0
            ? 'Target portfolio saved. Existing mappings were preserved; recalculate when ready.'
            : 'Target portfolio saved. Recalculate when ready.'
        );
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save target portfolio');
    } finally {
      setTargetSaving(false);
    }
  };

  const confirmUnsavedTarget = (): boolean => {
    if (!targetDirty) return true;
    return window.confirm(
      'Target portfolio has unsaved changes. Continue without saving? Your calculation will still use the last saved target.'
    );
  };

  const goToStep = async (next: FlowStep) => {
    if (!prospectId) {
      if (next === 'upload') setStep('upload');
      return;
    }

    if (!confirmUnsavedTarget()) return;

    if (next === 'map') {
      await refreshMappingHoldings(prospectId);
    }

    if (next === 'result') {
      try {
        const resultRes = await prospectsAPI.getResult(prospectId);
        setTransitionResult(resultRes.data);
        setHasStoredResult(true);
        setResultOutdated(false);
        checkStaleData(prospectId);
      } catch {
        alert('No calculation yet. Run Calculate first.');
        return;
      }
    }

    setStep(next);
  };

  const handleUploadComplete = (newProspectId: string) => {
    setProspectId(newProspectId);
    syncProspectQuery(newProspectId);
    setStep('classify');
    setResultOutdated(false);
  };

  const handleHoldingsSaved = () => {
    markResultOutdated();
    setTargetSaveMessage('Holdings saved. Earlier steps may need review before recalculating.');
  };

  const handleClassifyComplete = async () => {
    if (!prospectId) return;
    try {
      markResultOutdated();
      const holdings = await refreshMappingHoldings(prospectId);
      const unmapped = await prospectsAPI.getUnmapped(prospectId);
      if (unmapped.data && unmapped.data.length > 0) {
        setMappingHoldings(unmapped.data);
        setStep('map');
      } else if (holdings.length > 0) {
        setStep('map');
      } else {
        setStep('calculate');
      }
    } catch (err) {
      console.error('Failed to load mapping holdings:', err);
    }
  };

  const handleMappingComplete = () => {
    setStep('calculate');
  };

  const handleCalculate = async () => {
    if (!prospectId) return;
    if (targetDirty) {
      alert('Save target portfolio changes before calculating.');
      return;
    }
    try {
      const result = await prospectsAPI.calculate(prospectId);
      setTransitionResult(result.data);
      setHasStoredResult(true);
      setResultOutdated(false);
      setStaleWarning(false);
      setStep('result');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to calculate transition');
    }
  };

  const handleDownloadReportPdf = async () => {
    if (!prospectId) return;
    try {
      const additionalText = window.prompt(
        'Optional: Add narrative text for the PDF (you can paste multiple paragraphs). Leave blank for none.',
        ''
      );
      const res = await prospectsAPI.getReportPdf(
        prospectId,
        additionalText != null && additionalText.trim() ? additionalText.trim() : undefined
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disp = res.headers['content-disposition'] || res.headers['Content-Disposition'] || '';
      const match = disp.match(/filename="?([^";\n]+)"?/);
      a.download = match ? match[1].trim() : 'transition-report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Could not download PDF report.');
    }
  };

  const handleStartNewProspect = () => {
    setProspectId(null);
    setProspectName('');
    setStep('upload');
    setMappingHoldings([]);
    setTransitionResult(null);
    setHasStoredResult(false);
    setStaleWarning(false);
    setResultOutdated(false);
    setTargetSaveMessage(null);
    setStrategySelection({ mode: 'single', strategyId: '' });
    setSavedStrategySelection({ mode: 'single', strategyId: '' });
    syncProspectQuery(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    window.location.hash = '#/';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">
                  Tax-Aware Transition Tool
                </h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/dashboard"
                  className="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  to="/monitoring"
                  className="border-transparent text-gray-500 hover:text-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Monitoring
                </Link>
                <Link
                  to="/scenarios"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Scenarios
                </Link>
                <Link
                  to="/admin"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Admin
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {loadingProspect && (
          <div className="mb-4 text-sm text-gray-600">Loading scenario…</div>
        )}

        {(staleWarning || resultOutdated) && (
          <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  {resultOutdated ? (
                    <>
                      <strong>Results outdated:</strong> Holdings, classification, mappings, or target
                      portfolio changed. Recalculate to refresh sell/buy recommendations.
                    </>
                  ) : (
                    <>
                      <strong>Warning:</strong> The target strategy or blend has been updated since this calculation.
                      Please recalculate to get updated results.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-6 sm:px-0">
          <p className="mb-6 text-gray-600">
            Select a <strong>target strategy</strong> or <strong>weighted blend</strong> to compare against,
            then enter the prospect&apos;s current holdings. You can return to any step to edit before recalculating.
          </p>

          <div className="mb-6 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              1. Select strategy or blend to compare against
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Choose one strategy or blend several with weights. Save changes here when editing an existing scenario.
            </p>
            <div className="space-y-4">
              <StrategyBlendSelector
                strategies={strategies}
                selection={strategySelection}
                onChange={setStrategySelection}
              />
              {strategies.length === 0 && (
                <p className="text-sm text-amber-600">
                  No strategies yet. Create one in <Link to="/admin" className="underline">Admin</Link> first.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {prospectId && isStrategySelectionReady(strategySelection) && (
                  <button
                    type="button"
                    onClick={handleSaveTarget}
                    disabled={targetSaving || !targetDirty}
                    className="py-2 px-4 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {targetSaving ? 'Saving…' : 'Save target portfolio'}
                  </button>
                )}
                {prospectId && targetDirty && (
                  <span className="text-sm text-amber-700">Unsaved target changes</span>
                )}
                {targetSaveMessage && (
                  <span className="text-sm text-green-700">{targetSaveMessage}</span>
                )}
              {prospectId && (
                <button
                  type="button"
                  onClick={handleStartNewProspect}
                  className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Start new prospect
                </button>
              )}
            </div>
            {prospectId && (
              <StrategyAccountLinks prospectId={prospectId} />
            )}
          </div>
          </div>

          {prospectId && (
            <div className="mb-6">
              <FlowStepNav
                currentStep={step}
                onStepClick={goToStep}
                canNavigate={Boolean(prospectId)}
                hasResult={hasStoredResult && Boolean(transitionResult)}
              />
              {prospectName && (
                <p className="mt-2 text-sm text-gray-500">
                  Scenario: <span className="font-medium text-gray-800">{prospectName}</span>
                </p>
              )}
            </div>
          )}

          {step === 'upload' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                2. Prospect portfolio — enter holdings
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                {prospectId
                  ? 'Edit holdings below and save. You can change tickers, values, and gain/loss at any time.'
                  : 'Enter the prospect\'s current holdings manually or upload a CSV. Then create the prospect to run classification and transition.'}
              </p>
              {!prospectId && !isStrategySelectionReady(strategySelection) && strategies.length > 0 && (
                <p className="mb-4 text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                  Select a strategy or valid blend above (step 1), then enter holdings below.
                </p>
              )}
              <ProspectUpload
                strategies={strategies}
                strategySelection={strategySelection}
                onStrategySelectionChange={setStrategySelection}
                onUploadComplete={handleUploadComplete}
                prospectId={prospectId}
                onHoldingsSaved={handleHoldingsSaved}
                hideStrategySelector
              />
            </div>
          )}

          {step === 'classify' && prospectId && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Classify holdings
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Choose side-pocket positions, then continue to map the rest.
              </p>
              <ClassifyHoldingsPanel
                prospectId={prospectId}
                onComplete={handleClassifyComplete}
              />
            </div>
          )}

          {step === 'map' && prospectId && mappingHoldings.length > 0 && (
            <div className="space-y-4">
              <MappingWizard
                prospectId={prospectId}
                unmappedHoldings={mappingHoldings}
                strategyIds={strategyIdsFromSelection(savedStrategySelection)}
                onMappingComplete={handleMappingComplete}
                onDataChanged={markResultOutdated}
              />
            </div>
          )}
          {step === 'map' && prospectId && mappingHoldings.length === 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Mapping
              </h2>
              <p className="text-gray-700 mb-4">
                No rebalanceable holdings to map (all may be side pocket). Proceed to calculate or revisit classify.
              </p>
              <button
                onClick={() => setStep('calculate')}
                className="flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Proceed to Calculate
              </button>
            </div>
          )}

          {step === 'calculate' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Calculate Transition
              </h2>
              <p className="text-gray-700 mb-4">
                Ready to calculate the transition against the current holdings and target portfolio.
              </p>
              {targetDirty && (
                <p className="mb-4 text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                  Save target portfolio changes in step 1 before calculating.
                </p>
              )}
              <button
                onClick={handleCalculate}
                disabled={targetDirty}
                className="flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                Calculate Transition
              </button>
            </div>
          )}

          {step === 'result' && prospectId && !transitionResult && resultOutdated && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Results Need Recalculation
              </h2>
              <p className="text-gray-700 mb-4">
                The target portfolio, holdings, classification, or mappings changed after the last proposal.
                Continue directly to calculate unless you want to review earlier steps first.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setStep('calculate')}
                  className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Go to Calculate
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const { unmappedHoldings } = await refreshMappingNeeds(prospectId);
                    setStep(unmappedHoldings.length > 0 ? 'map' : 'calculate');
                  }}
                  className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Check mapping needs
                </button>
              </div>
            </div>
          )}

          {step === 'result' && transitionResult && prospectId && (
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Transition Result Actions
                </h2>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Review the adviser summary below, then download the client-ready PDF. Use the step
                    links above to edit holdings, classification, mappings, or target portfolio, then recalculate.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleDownloadReportPdf}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      Download PDF Report
                    </button>
                    <button
                      onClick={handleCalculate}
                      disabled={targetDirty}
                      className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                    >
                      Recalculate
                    </button>
                  </div>
                </div>
              </div>

              <TaxSummary prospectId={prospectId} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
