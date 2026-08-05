import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import TaxSummary from './TaxSummary';
import ProspectUpload from './prospect/ProspectUpload';
import ClassifyHoldingsPanel from './prospect/ClassifyHoldingsPanel';
import MappingWizard from './prospect/MappingWizard';
import FlowStepNav, { type FlowStep } from './prospect/FlowStepNav';
import AnalysisStatusPanel from './prospect/AnalysisStatusPanel';
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
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loadingProspect, setLoadingProspect] = useState(false);
  const [hasStoredResult, setHasStoredResult] = useState(false);
  const [holdingCount, setHoldingCount] = useState(0);
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [sidePocketCount, setSidePocketCount] = useState(0);
  const [calculating, setCalculating] = useState(false);

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

  const refreshCounts = useCallback(async (id: string, holdings?: any[]) => {
    try {
      let holdingRows: any[] = holdings ?? [];
      if (!holdings) {
        const holdingsRes = await prospectsAPI.getHoldings(id);
        holdingRows = holdingsRes.data || [];
      }
      const unmappedRes = await prospectsAPI.getUnmapped(id);
      const unmapped = unmappedRes.data || [];
      setHoldingCount(holdingRows.length);
      setSidePocketCount(holdingRows.filter((h: any) => h.is_side_pocket).length);
      setUnmappedCount(unmapped.length);
      return { holdings: holdingRows, unmapped };
    } catch (err) {
      console.error('Failed to refresh analysis counts:', err);
      return { holdings: holdings || [], unmapped: [] as any[] };
    }
  }, []);

  const loadProspect = useCallback(async (id: string, preferredStep?: FlowStep) => {
    setLoadingProspect(true);
    setBannerError(null);
    try {
      const prospectRes = await prospectsAPI.get(id);
      const prospect = prospectRes.data;
      const selection = selectionFromProspect(prospect);
      setProspectId(id);
      setProspectName(prospect.name || '');
      setStrategySelection(selection);
      setSavedStrategySelection(selection);

      const holdings = prospect.holdings || [];
      setHoldingCount(holdings.length);
      setSidePocketCount(holdings.filter((h: any) => h.is_side_pocket).length);

      let nextStep: FlowStep = preferredStep || 'upload';
      let resultData: any = null;
      try {
        const resultRes = await prospectsAPI.getResult(id);
        resultData = resultRes.data;
      } catch {
        resultData = null;
      }

      const reviewRes = await prospectsAPI.getMappingReview(id);
      const reviewHoldings = reviewRes.data || [];
      const unmappedRes = await prospectsAPI.getUnmapped(id);
      const unmapped = unmappedRes.data || [];
      setUnmappedCount(unmapped.length);
      setMappingHoldings(unmapped.length > 0 ? unmapped : reviewHoldings);

      if (!preferredStep) {
        if (resultData) {
          nextStep = 'result';
        } else if (unmapped.length > 0 || reviewHoldings.length > 0) {
          // Resume into associations when work remains or prior mappings exist.
          // Do not bounce back to classify solely because no side pockets were marked.
          nextStep = 'map';
        } else if (holdings.length > 0) {
          nextStep = 'calculate';
        } else {
          nextStep = 'upload';
        }
      }

      setTransitionResult(resultData);
      setHasStoredResult(Boolean(resultData));
      setResultOutdated(false);
      setStep(nextStep);

      if (nextStep === 'result') {
        checkStaleData(id);
      }
    } catch (err) {
      console.error('Failed to load prospect:', err);
      setBannerError('Failed to load scenario.');
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
    const reviewHoldings = reviewRes.data || [];
    setMappingHoldings(reviewHoldings);
    return reviewHoldings;
  };

  const refreshMappingNeeds = async (id: string) => {
    const [reviewRes, unmappedRes] = await Promise.all([
      prospectsAPI.getMappingReview(id),
      prospectsAPI.getUnmapped(id),
    ]);
    const reviewHoldings = reviewRes.data || [];
    const unmappedHoldings = unmappedRes.data || [];
    setUnmappedCount(unmappedHoldings.length);
    setMappingHoldings(unmappedHoldings.length > 0 ? unmappedHoldings : reviewHoldings);
    return { reviewHoldings, unmappedHoldings };
  };

  const handleSaveTarget = async () => {
    if (!prospectId || !isStrategySelectionReady(strategySelection)) return;
    setTargetSaving(true);
    setBannerMessage(null);
    setBannerError(null);
    try {
      const payload = targetPayloadFromSelection(strategySelection);
      await prospectsAPI.updateTarget(prospectId, payload);
      setSavedStrategySelection(strategySelection);
      markResultOutdated();
      const { reviewHoldings, unmappedHoldings } = await refreshMappingNeeds(prospectId);
      if (unmappedHoldings.length > 0) {
        setStep('map');
        setBannerMessage(
          'Target portfolio saved. Review newly unmapped associations before recalculating.'
        );
      } else {
        setStep('calculate');
        setBannerMessage(
          reviewHoldings.length > 0
            ? 'Target portfolio saved. Existing associations were preserved; recalculate when ready.'
            : 'Target portfolio saved. Recalculate when ready.'
        );
      }
    } catch (err: any) {
      setBannerError(err.response?.data?.detail || 'Failed to save target portfolio');
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
    setBannerError(null);

    if (next === 'map') {
      await refreshMappingNeeds(prospectId);
    }

    if (next === 'result') {
      try {
        const resultRes = await prospectsAPI.getResult(prospectId);
        setTransitionResult(resultRes.data);
        setHasStoredResult(true);
        setResultOutdated(false);
        checkStaleData(prospectId);
      } catch {
        setBannerError('No calculation yet. Run Calculate first.');
        setStep('calculate');
        return;
      }
    }

    setStep(next);
  };

  const handleUploadComplete = async (newProspectId: string) => {
    setProspectId(newProspectId);
    syncProspectQuery(newProspectId);
    setStep('classify');
    setResultOutdated(false);
    setBannerMessage('Prospect created. Classify side-pocket holdings, then associate the rest.');
    await refreshCounts(newProspectId);
  };

  const handleHoldingsSaved = async (meta: { holdingCount: number }) => {
    markResultOutdated();
    setHoldingCount(meta.holdingCount);
    setBannerMessage(
      'Holdings saved. Results are outdated — review classification and associations, then recalculate.'
    );
    if (prospectId) {
      const { unmapped } = await refreshCounts(prospectId);
      if (unmapped.length > 0) {
        await refreshMappingNeeds(prospectId);
      }
    }
  };

  const handleClassifyComplete = async () => {
    if (!prospectId) return;
    try {
      markResultOutdated();
      await refreshCounts(prospectId);
      const holdings = await refreshMappingHoldings(prospectId);
      const unmapped = await prospectsAPI.getUnmapped(prospectId);
      const unmappedRows = unmapped.data || [];
      setUnmappedCount(unmappedRows.length);
      if (unmappedRows.length > 0) {
        setMappingHoldings(unmappedRows);
        setStep('map');
        setBannerMessage('Classification saved. Map remaining associations to continue.');
      } else if (holdings.length > 0) {
        setMappingHoldings(holdings);
        setStep('map');
        setBannerMessage('Classification saved. Review associations, then calculate.');
      } else {
        setStep('calculate');
        setBannerMessage('Classification saved. Ready to calculate.');
      }
    } catch (err) {
      console.error('Failed to load mapping holdings:', err);
      setBannerError('Classification saved, but loading associations failed.');
    }
  };

  const handleMappingComplete = () => {
    setStep('calculate');
    setBannerMessage('Associations ready. Review the checklist, then calculate the transition.');
    if (prospectId) {
      refreshCounts(prospectId);
    }
  };

  const handleMappingDataChanged = async () => {
    markResultOutdated();
    if (prospectId) {
      await refreshCounts(prospectId);
    }
  };

  const handleCalculate = async () => {
    if (!prospectId) return;
    if (targetDirty) {
      setBannerError('Save target portfolio changes before calculating.');
      return;
    }
    if (unmappedCount > 0) {
      setBannerError(`${unmappedCount} holding${unmappedCount === 1 ? '' : 's'} still need mapping.`);
      setStep('map');
      await refreshMappingNeeds(prospectId);
      return;
    }
    setCalculating(true);
    setBannerError(null);
    try {
      const result = await prospectsAPI.calculate(prospectId);
      setTransitionResult(result.data);
      setHasStoredResult(true);
      setResultOutdated(false);
      setStaleWarning(false);
      setStep('result');
      setBannerMessage('Transition calculated. Assess results below before downloading the final proposal PDF.');
    } catch (err: any) {
      setBannerError(err.response?.data?.detail || 'Failed to calculate transition');
    } finally {
      setCalculating(false);
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
      setBannerError(err.response?.data?.detail || 'Could not download PDF report.');
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
    setBannerMessage(null);
    setBannerError(null);
    setHoldingCount(0);
    setUnmappedCount(0);
    setSidePocketCount(0);
    setStrategySelection({ mode: 'single', strategyId: '' });
    setSavedStrategySelection({ mode: 'single', strategyId: '' });
    syncProspectQuery(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    window.location.hash = '#/';
  };

  const analysisStatus = useMemo(
    () => ({
      holdingCount,
      unmappedCount,
      sidePocketCount,
      targetDirty,
      targetReady: isStrategySelectionReady(strategySelection),
      hasResult: hasStoredResult && Boolean(transitionResult),
      resultOutdated,
      staleWarning,
    }),
    [
      holdingCount,
      unmappedCount,
      sidePocketCount,
      targetDirty,
      strategySelection,
      hasStoredResult,
      transitionResult,
      resultOutdated,
      staleWarning,
    ]
  );

  const stepBadges = useMemo(() => {
    const badges: Partial<Record<FlowStep, string>> = {};
    if (unmappedCount > 0) badges.map = `${unmappedCount} unmapped`;
    if (resultOutdated || staleWarning) {
      badges.result = 'outdated';
      badges.calculate = 'recalc';
    }
    return badges;
  }, [unmappedCount, resultOutdated, staleWarning]);

  const readyToCalculate =
    Boolean(prospectId) &&
    isStrategySelectionReady(savedStrategySelection) &&
    !targetDirty &&
    holdingCount > 0 &&
    unmappedCount === 0;

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
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-sm text-yellow-800">
                {resultOutdated ? (
                  <>
                    <strong>Results outdated:</strong> Holdings, classification, associations, or
                    target portfolio changed. Recalculate before treating this as a final proposal.
                  </>
                ) : (
                  <>
                    <strong>Warning:</strong> The target strategy or blend was updated since this
                    calculation. Recalculate to refresh results.
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => goToStep('calculate')}
                className="text-sm font-medium text-amber-900 underline"
              >
                Go to Calculate
              </button>
            </div>
          </div>
        )}

        {bannerError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {bannerError}
          </div>
        )}
        {bannerMessage && !bannerError && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {bannerMessage}
          </div>
        )}

        <div className="px-4 py-6 sm:px-0 space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              {prospectName || 'Prospect transition analysis'}
            </h2>
            <p className="mt-1 text-gray-600">
              Iterate on holdings, associations, and target strategy. Assess the transition, then
              download the final proposal PDF when ready.
            </p>
          </div>

          <div id="target-strategy-section" className="bg-white shadow rounded-lg p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Target strategy
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Choose one strategy or a weighted blend. Save when editing an existing scenario —
                  changing the target may reopen associations.
                </p>
              </div>
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
              </div>
              {prospectId && (
                <StrategyAccountLinks prospectId={prospectId} />
              )}
            </div>
          </div>

          {prospectId && (
            <>
              <AnalysisStatusPanel
                status={analysisStatus}
                onGoToStep={goToStep}
                onSaveTarget={handleSaveTarget}
                targetSaving={targetSaving}
              />
              <FlowStepNav
                currentStep={step}
                onStepClick={goToStep}
                canNavigate={Boolean(prospectId)}
                hasResult={hasStoredResult && Boolean(transitionResult)}
                stepBadges={stepBadges}
              />
            </>
          )}

          {step === 'upload' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Current holdings
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {prospectId
                  ? 'Add, remove, or edit positions anytime. Saving clears prior results so you can re-assess after recalculating.'
                  : 'Enter the prospect\'s current holdings manually or upload a CSV, then continue to classification.'}
              </p>
              {!prospectId && !isStrategySelectionReady(strategySelection) && strategies.length > 0 && (
                <p className="mb-4 text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                  Select a strategy or valid blend above, then enter holdings below.
                </p>
              )}
              {prospectId && resultOutdated && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  After saving, use the step navigator to revisit Classify or Associations, then Calculate.
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => goToStep('classify')}
                      className="text-indigo-700 font-medium underline"
                    >
                      Review classification
                    </button>
                    <button
                      type="button"
                      onClick={() => goToStep('map')}
                      className="text-indigo-700 font-medium underline"
                    >
                      Review associations
                    </button>
                    <button
                      type="button"
                      onClick={() => goToStep('calculate')}
                      className="text-indigo-700 font-medium underline"
                    >
                      Go to calculate
                    </button>
                  </div>
                </div>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Classify holdings
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Choose side-pocket positions, then continue to associations. Come back here whenever holdings change.
              </p>
              <ClassifyHoldingsPanel
                prospectId={prospectId}
                onComplete={handleClassifyComplete}
              />
            </div>
          )}

          {step === 'map' && prospectId && (
            <MappingWizard
              prospectId={prospectId}
              unmappedHoldings={mappingHoldings}
              strategyIds={strategyIdsFromSelection(savedStrategySelection)}
              onMappingComplete={handleMappingComplete}
              onDataChanged={handleMappingDataChanged}
            />
          )}

          {step === 'calculate' && (
            <div className="bg-white shadow rounded-lg p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Calculate transition
                </h3>
                <p className="text-sm text-gray-500">
                  Run the tax-aware transition against the saved target and current associations. Assess results before generating the final proposal PDF.
                </p>
              </div>

              <ul className="space-y-2 text-sm">
                <li className={isStrategySelectionReady(savedStrategySelection) && !targetDirty ? 'text-green-800' : 'text-amber-800'}>
                  {isStrategySelectionReady(savedStrategySelection) && !targetDirty
                    ? '✓ Target portfolio saved'
                    : '○ Save target portfolio changes'}
                </li>
                <li className={holdingCount > 0 ? 'text-green-800' : 'text-amber-800'}>
                  {holdingCount > 0
                    ? `✓ ${holdingCount} holding${holdingCount === 1 ? '' : 's'} loaded`
                    : '○ Add current holdings'}
                </li>
                <li className={unmappedCount === 0 ? 'text-green-800' : 'text-amber-800'}>
                  {unmappedCount === 0
                    ? '✓ All associations mapped'
                    : `○ ${unmappedCount} holding${unmappedCount === 1 ? '' : 's'} still need mapping`}
                </li>
              </ul>

              {!readyToCalculate && unmappedCount > 0 && (
                <button
                  type="button"
                  onClick={() => goToStep('map')}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Finish associations →
                </button>
              )}

              <button
                onClick={handleCalculate}
                disabled={!readyToCalculate || calculating}
                className="flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {calculating ? 'Calculating…' : 'Calculate transition'}
              </button>
            </div>
          )}

          {step === 'result' && prospectId && !transitionResult && resultOutdated && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Results need recalculation
              </h3>
              <p className="text-gray-700 mb-4">
                Inputs changed after the last proposal. Recalculate, or review earlier steps first.
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
                  Check association needs
                </button>
              </div>
            </div>
          )}

          {step === 'result' && transitionResult && prospectId && (
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Assess results, then finalize proposal
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Review tax impact, trades, and associations below. When the analysis looks right,
                  download the client-ready PDF. To iterate, edit any earlier step and recalculate.
                </p>
                <div className="flex flex-wrap gap-3 mb-4">
                  <button
                    onClick={handleDownloadReportPdf}
                    disabled={resultOutdated || staleWarning || targetDirty}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Download final proposal PDF
                  </button>
                  <button
                    onClick={handleCalculate}
                    disabled={targetDirty || calculating || unmappedCount > 0}
                    className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {calculating ? 'Recalculating…' : 'Recalculate'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <button
                    type="button"
                    onClick={() => goToStep('upload')}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    Edit holdings
                  </button>
                  <button
                    type="button"
                    onClick={() => goToStep('classify')}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    Change side pockets
                  </button>
                  <button
                    type="button"
                    onClick={() => goToStep('map')}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    Modify associations
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      document
                        .getElementById('target-strategy-section')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    Adjust target
                  </button>
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
